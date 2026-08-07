<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

class ImportSupabase extends Command
{
    protected $signature = 'klabs:import-supabase {--skip-files : Do not copy private document objects}';

    protected $description = 'Import the previous K-Labs Supabase data into MySQL and Laravel storage';

    private array $profileIds = [];

    private const TABLES = [
        'projects', 'chatbot_settings', 'chatbot_instructions', 'project_domains',
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

    public function handle(): int
    {
        $url = rtrim((string) env('SUPABASE_URL'), '/');
        $key = (string) env('SUPABASE_SERVICE_ROLE_KEY');
        if ($url === '' || $key === '') {
            $this->error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required for this one-time import.');

            return self::FAILURE;
        }

        $profiles = $this->fetch($url, $key, 'profiles');
        $this->importProfiles($profiles);

        foreach (self::TABLES as $table) {
            $rows = $this->fetch($url, $key, $table);
            $this->importTable($table, $rows);
            $this->components->info("{$table}: ".count($rows).' row(s) imported');
        }

        if (! $this->option('skip-files')) {
            $this->importFiles($url, $key);
        }

        $this->components->info('Supabase data migration completed.');

        return self::SUCCESS;
    }

    private function fetch(string $url, string $key, string $table): array
    {
        $rows = [];
        for ($offset = 0; ; $offset += 1000) {
            $response = Http::withToken($key)
                ->withHeaders(['apikey' => $key, 'Range' => "{$offset}-".($offset + 999)])
                ->get("{$url}/rest/v1/{$table}", ['select' => '*', 'order' => 'id.asc']);
            $response->throw();
            $page = $response->json();
            if (! is_array($page)) {
                break;
            }
            array_push($rows, ...$page);
            if (count($page) < 1000) {
                break;
            }
        }

        return $rows;
    }

    private function importProfiles(array $profiles): void
    {
        foreach ($profiles as $profile) {
            $email = strtolower((string) $profile['email']);
            $existing = DB::table('users')->whereRaw('lower(email) = ?', [$email])->first();
            $userId = $existing?->id ?? $profile['id'];
            $this->profileIds[$profile['id']] = $userId;

            DB::table('users')->upsert([[
                'id' => $userId,
                'name' => $profile['full_name'] ?: Str::before($email, '@'),
                'email' => $email,
                'role' => $profile['role'] ?? 'member',
                'password' => $existing?->password ?? Hash::make(Str::random(48)),
                'created_at' => $profile['created_at'] ?? now(),
                'updated_at' => $profile['updated_at'] ?? now(),
            ]], ['id'], ['name', 'email', 'role', 'updated_at']);

            DB::table('profiles')->upsert([[
                'id' => $userId,
                'email' => $email,
                'full_name' => $profile['full_name'] ?? null,
                'role' => $profile['role'] ?? 'member',
                'created_at' => $profile['created_at'] ?? now(),
                'updated_at' => $profile['updated_at'] ?? now(),
            ]], ['id'], ['email', 'full_name', 'role', 'updated_at']);
        }
        $this->components->info('profiles: '.count($profiles).' row(s) imported');
    }

    private function importTable(string $table, array $rows): void
    {
        if ($rows === []) {
            return;
        }
        $columns = array_flip(Schema::getColumnListing($table));
        $prepared = array_map(function (array $row) use ($table, $columns): array {
            $row = array_intersect_key($row, $columns);
            if ($table === 'projects') {
                $row['created_by'] = $this->profileIds[$row['created_by']] ?? $row['created_by'];
            }
            foreach (self::JSON_COLUMNS[$table] ?? [] as $column) {
                if (array_key_exists($column, $row) && ! is_string($row[$column])) {
                    $row[$column] = json_encode($row[$column], JSON_THROW_ON_ERROR);
                }
            }

            return $row;
        }, $rows);

        foreach (array_chunk($prepared, 250) as $chunk) {
            $updates = array_values(array_diff(array_keys($chunk[0]), ['id', 'created_at']));
            DB::table($table)->upsert($chunk, ['id'], $updates);
        }
    }

    private function importFiles(string $url, string $key): void
    {
        $sources = DB::table('knowledge_sources')->whereNotNull('storage_path')->pluck('storage_path');
        $copied = 0;
        foreach ($sources as $path) {
            $encoded = collect(explode('/', $path))->map(fn (string $part) => rawurlencode($part))->implode('/');
            $response = Http::withToken($key)->withHeaders(['apikey' => $key])
                ->get("{$url}/storage/v1/object/chatbot-documents/{$encoded}");
            if ($response->successful()) {
                Storage::disk('local')->put("chatbot-documents/{$path}", $response->body());
                $copied++;
            } else {
                $this->warn("Could not copy private file: {$path}");
            }
        }
        $this->components->info("private files: {$copied} copied");
    }
}
