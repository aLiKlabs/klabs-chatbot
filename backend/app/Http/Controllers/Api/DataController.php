<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Carbon\CarbonImmutable;
use Illuminate\Database\Query\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Arr;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;

class DataController extends Controller
{
    private const TABLES = [
        'profiles', 'projects', 'chatbot_settings', 'chatbot_instructions', 'project_domains',
        'knowledge_sources', 'source_pages', 'document_chunks', 'conversations', 'messages',
        'feedback', 'leads', 'ingestion_jobs', 'usage_events',
    ];

    private const JSON_COLUMNS = [
        'projects' => ['supported_languages'],
        'chatbot_settings' => ['welcome_message', 'placeholder_text', 'suggested_questions', 'contact_button_label'],
        'chatbot_instructions' => ['fallback_message', 'restricted_topics'],
        'knowledge_sources' => ['metadata'],
        'document_chunks' => ['embedding', 'metadata'],
        'messages' => ['sources'],
    ];

    private const DATE_COLUMNS = [
        'profiles' => ['created_at', 'updated_at'],
        'projects' => ['created_at', 'updated_at', 'archived_at'],
        'chatbot_settings' => ['created_at', 'updated_at'],
        'chatbot_instructions' => ['created_at', 'updated_at'],
        'project_domains' => ['created_at', 'updated_at'],
        'knowledge_sources' => ['last_processed_at', 'created_at', 'updated_at'],
        'source_pages' => ['last_crawled_at', 'created_at', 'updated_at'],
        'document_chunks' => ['created_at', 'updated_at'],
        'conversations' => ['started_at', 'last_message_at', 'ended_at'],
        'messages' => ['created_at'],
        'feedback' => ['created_at'],
        'leads' => ['created_at'],
        'ingestion_jobs' => ['started_at', 'completed_at', 'created_at'],
        'usage_events' => ['created_at'],
    ];

    public function query(Request $request): JsonResponse
    {
        $input = $request->validate([
            'table' => ['required', 'string'], 'action' => ['required', 'string'],
            'columns' => ['nullable', 'string'], 'values' => ['nullable'], 'filters' => ['array'],
            'order' => ['array'], 'limit' => ['nullable', 'integer', 'min:1', 'max:1000'],
            'single' => ['nullable', 'string'], 'count' => ['nullable', 'boolean'], 'head' => ['nullable', 'boolean'],
            'conflict' => ['nullable', 'array'],
        ]);

        $table = $input['table'];
        abort_unless(in_array($table, self::TABLES, true), 422, 'Table is not available.');
        $action = $input['action'];
        abort_unless(in_array($action, ['select', 'insert', 'update', 'delete', 'upsert'], true), 422, 'Action is not available.');

        try {
            return DB::transaction(function () use ($input, $table, $action): JsonResponse {
                $query = $this->filtered(DB::table($table), $table, $input['filters'] ?? []);
                if ($action === 'select') {
                    return $this->select($query, $table, $input);
                }
                if ($action === 'delete') {
                    $query->delete();

                    return response()->json(['data' => null, 'error' => null]);
                }
                if ($action === 'update') {
                    $values = $this->prepareValues($table, $input['values'] ?? []);
                    if (Schema::hasColumn($table, 'updated_at')) {
                        $values['updated_at'] = now();
                    }
                    $query->update($values);

                    return response()->json(['data' => null, 'error' => null]);
                }

                return $this->write($table, $action, $input);
            });
        } catch (\Throwable $error) {
            report($error);

            return response()->json(['data' => null, 'error' => ['message' => $error->getMessage()]], 422);
        }
    }

    private function select(Builder $query, string $table, array $input): JsonResponse
    {
        $columns = $this->columns($table, $input['columns'] ?? '*');
        $count = ! empty($input['count']) ? (clone $query)->count() : null;
        if (! empty($input['head'])) {
            return response()->json(['data' => null, 'error' => null, 'count' => $count]);
        }
        foreach ($input['order'] ?? [] as $order) {
            $column = $this->column($table, (string) ($order['column'] ?? ''));
            $query->orderBy($column, ! empty($order['ascending']) ? 'asc' : 'desc');
        }
        if (! empty($input['limit'])) {
            $query->limit((int) $input['limit']);
        }
        $rows = $query->get($columns)->map(fn ($row) => $this->decode($table, (array) $row))->all();
        if ($table === 'knowledge_sources' && str_contains((string) ($input['columns'] ?? ''), 'document_chunks')) {
            foreach ($rows as &$row) {
                $row['document_chunks'] = [['count' => DB::table('document_chunks')->where('knowledge_source_id', $row['id'])->count()]];
            }
        }
        if ($table === 'projects') {
            $requested = (string) ($input['columns'] ?? '');
            foreach ($rows as &$row) {
                if (str_contains($requested, 'knowledge_sources')) {
                    $row['knowledge_sources'] = [['count' => DB::table('knowledge_sources')->where('project_id', $row['id'])->count()]];
                }
                if (str_contains($requested, 'conversations')) {
                    $row['conversations'] = [['count' => DB::table('conversations')->where('project_id', $row['id'])->count()]];
                }
            }
        }
        $single = $input['single'] ?? null;
        if ($single === 'single' && count($rows) !== 1) {
            throw new \RuntimeException('Expected exactly one row.');
        }
        if ($single) {
            $rows = $rows[0] ?? null;
        }

        return response()->json(['data' => $rows, 'error' => null, 'count' => $count]);
    }

    private function write(string $table, string $action, array $input): JsonResponse
    {
        $many = array_is_list($input['values'] ?? []) ? $input['values'] : [$input['values'] ?? []];
        $rows = array_map(fn ($row) => $this->prepareInsert($table, $row), $many);
        if ($action === 'upsert') {
            $conflict = array_map(fn ($column) => $this->column($table, $column), $input['conflict'] ?? ['id']);
            $updates = array_values(array_diff(array_keys($rows[0]), [...$conflict, 'id', 'created_at']));
            DB::table($table)->upsert($rows, $conflict, $updates);
        } else {
            // PostgREST accepts arrays whose rows have different optional
            // fields. A single MySQL bulk insert does not: every row must use
            // the exact same column list. Insert each prepared row within the
            // surrounding transaction so database defaults and nullable
            // columns continue to behave correctly for heterogeneous rows
            // such as a user message followed by an assistant message.
            foreach ($rows as $row) {
                DB::table($table)->insert($row);
            }
            if ($table === 'projects') {
                foreach ($rows as $row) {
                    $this->createProjectDefaults($row['id']);
                }
            }
        }
        $decoded = array_map(fn ($row) => $this->decode($table, $row), $rows);
        $data = ($input['single'] ?? null) ? ($decoded[0] ?? null) : $decoded;

        return response()->json(['data' => $data, 'error' => null]);
    }

    private function filtered(Builder $query, string $table, array $filters): Builder
    {
        foreach ($filters as $filter) {
            $column = $this->column($table, (string) ($filter['column'] ?? ''));
            $op = $filter['op'] ?? 'eq';
            $value = $filter['value'] ?? null;
            match ($op) {
                'eq' => $query->where($column, $value), 'neq' => $query->where($column, '!=', $value),
                'gte' => $query->where($column, '>=', $value), 'lte' => $query->where($column, '<=', $value),
                'gt' => $query->where($column, '>', $value), 'lt' => $query->where($column, '<', $value),
                'in' => $query->whereIn($column, Arr::wrap($value)),
                'is' => $value === null ? $query->whereNull($column) : $query->where($column, $value),
                'not_is' => $value === null ? $query->whereNotNull($column) : $query->where($column, '!=', $value),
                default => throw new \InvalidArgumentException('Filter is not available.'),
            };
        }

        return $query;
    }

    private function prepareInsert(string $table, array $row): array
    {
        $row = $this->prepareValues($table, $row);
        if (Schema::hasColumn($table, 'id')) {
            $row['id'] ??= (string) Str::uuid();
        }
        if ($table === 'projects') {
            $row['public_key'] ??= Str::lower(Str::random(36));
        }
        if (Schema::hasColumn($table, 'created_at')) {
            $row['created_at'] ??= now();
        }
        if (Schema::hasColumn($table, 'updated_at')) {
            $row['updated_at'] ??= now();
        }

        return $row;
    }

    private function prepareValues(string $table, array $row): array
    {
        $allowed = array_flip(Schema::getColumnListing($table));
        $row = array_intersect_key($row, $allowed);
        foreach (self::DATE_COLUMNS[$table] ?? [] as $column) {
            if (isset($row[$column]) && is_string($row[$column])) {
                // Browser and Next.js clients use ISO-8601 (for example,
                // 2026-08-03T11:12:10.873Z). MySQL DATETIME/TIMESTAMP columns
                // require a SQL-formatted value instead.
                $row[$column] = CarbonImmutable::parse($row[$column])->format('Y-m-d H:i:s');
            }
        }
        foreach (self::JSON_COLUMNS[$table] ?? [] as $column) {
            if (array_key_exists($column, $row) && ! is_string($row[$column])) {
                $row[$column] = json_encode($row[$column], JSON_THROW_ON_ERROR);
            }
        }
        if ($table === 'document_chunks' && isset($row['embedding']) && is_array($row['embedding'])) {
            $row['embedding'] = json_encode($row['embedding'], JSON_THROW_ON_ERROR);
        }

        return $row;
    }

    private function decode(string $table, array $row): array
    {
        foreach (self::JSON_COLUMNS[$table] ?? [] as $column) {
            if (isset($row[$column]) && is_string($row[$column])) {
                $row[$column] = json_decode($row[$column], true);
            }
        }

        return $row;
    }

    private function columns(string $table, string $requested): array
    {
        if ($requested === '*' || str_starts_with($requested, '*,') || str_contains($requested, '(')) {
            return ['*'];
        }

        return array_map(fn ($column) => $this->column($table, trim($column)), explode(',', $requested));
    }

    private function column(string $table, string $column): string
    {
        abort_unless($column !== '' && Schema::hasColumn($table, $column), 422, "Unknown column {$column}.");

        return $column;
    }

    private function createProjectDefaults(string $projectId): void
    {
        DB::table('chatbot_settings')->insert($this->prepareInsert('chatbot_settings', [
            'project_id' => $projectId,
            'welcome_message' => ['en' => 'Hello! How can I help you today?', 'ar' => 'مرحباً! كيف يمكنني مساعدتك اليوم؟'],
            'placeholder_text' => ['en' => 'Type your message…', 'ar' => 'اكتب رسالتك…'],
            'suggested_questions' => ['en' => [], 'ar' => []],
            'contact_button_label' => ['en' => 'Contact the team', 'ar' => 'تواصل مع الفريق'],
        ]));
        DB::table('chatbot_instructions')->insert($this->prepareInsert('chatbot_instructions', [
            'project_id' => $projectId,
            'system_instruction' => '',
            'fallback_message' => ['en' => 'I’m sorry, but I don’t have information about that.', 'ar' => 'عذراً، لا تتوفر لدي معلومات حول ذلك.'],
            'restricted_topics' => [],
        ]));
    }
}
