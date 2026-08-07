<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

class RpcController extends Controller
{
    public function replaceSourceChunks(Request $request): JsonResponse
    {
        $input = $request->validate([
            'target_source_id' => ['required', 'uuid'], 'target_project_id' => ['required', 'uuid'],
            'source_content_hash' => ['required', 'string'], 'chunk_payload' => ['required', 'array'],
            'embedding_token_count' => ['integer', 'min:0'], 'embedding_model' => ['nullable', 'string'],
        ]);
        $count = DB::transaction(function () use ($input): int {
            abort_unless(DB::table('knowledge_sources')->where('id', $input['target_source_id'])->where('project_id', $input['target_project_id'])->exists(), 404);
            DB::table('document_chunks')->where('knowledge_source_id', $input['target_source_id'])->delete();
            $now = now();
            $rows = array_map(fn ($chunk) => [
                'id' => (string) Str::uuid(), 'project_id' => $input['target_project_id'], 'knowledge_source_id' => $input['target_source_id'],
                'source_page_id' => $chunk['source_page_id'] ?: null, 'chunk_index' => $chunk['chunk_index'], 'content' => $chunk['content'],
                'token_count' => $chunk['token_count'], 'embedding' => json_encode($chunk['embedding']), 'content_hash' => $chunk['content_hash'],
                'metadata' => json_encode($chunk['metadata'] ?? []), 'created_at' => $now, 'updated_at' => $now,
            ], $input['chunk_payload']);
            if ($rows !== []) {
                DB::table('document_chunks')->insert($rows);
            }
            DB::table('knowledge_sources')->where('id', $input['target_source_id'])->update([
                'status' => 'ready', 'content_hash' => $input['source_content_hash'], 'error_message' => null, 'last_processed_at' => $now, 'updated_at' => $now,
            ]);
            DB::table('usage_events')->insert([
                'id' => (string) Str::uuid(), 'project_id' => $input['target_project_id'], 'event_type' => 'knowledge_embedding',
                'model' => $input['embedding_model'] ?? null, 'embedding_tokens' => $input['embedding_token_count'] ?? 0, 'created_at' => $now,
            ]);

            return count($rows);
        });

        return response()->json(['data' => $count, 'error' => null]);
    }

    public function matchDocumentChunks(Request $request): JsonResponse
    {
        $input = $request->validate([
            'target_project_id' => ['required', 'uuid'], 'query_embedding' => ['required', 'array'],
            'match_threshold' => ['numeric'], 'match_count' => ['integer', 'min:1', 'max:50'],
        ]);
        $query = array_map('floatval', $input['query_embedding']);
        $threshold = (float) ($input['match_threshold'] ?? 0.72);
        $rows = DB::table('document_chunks as c')->join('knowledge_sources as s', 's.id', '=', 'c.knowledge_source_id')
            ->leftJoin('source_pages as p', 'p.id', '=', 'c.source_page_id')
            ->where('c.project_id', $input['target_project_id'])->where('s.status', 'ready')->whereNotNull('c.embedding')
            ->select('c.*', 's.name as source_name', 's.status as source_status', 's.original_url as original_url', 'p.title as page_title', 'p.url as page_url')->get()
            ->map(function ($row) use ($query) {
                $embedding = json_decode($row->embedding, true) ?: [];
                $row->similarity = $this->cosine($query, $embedding);
                $row->metadata = json_decode($row->metadata ?: '{}', true);
                unset($row->embedding);

                return (array) $row;
            })->filter(fn ($row) => $row['similarity'] >= $threshold)
            ->sortByDesc('similarity')->take((int) ($input['match_count'] ?? 6))->values();

        return response()->json(['data' => $rows, 'error' => null]);
    }

    private function cosine(array $a, array $b): float
    {
        if (count($a) !== count($b) || $a === []) {
            return 0.0;
        }
        $dot = $aa = $bb = 0.0;
        foreach ($a as $index => $value) {
            $other = (float) $b[$index];
            $dot += $value * $other;
            $aa += $value ** 2;
            $bb += $other ** 2;
        }

        return $aa > 0 && $bb > 0 ? $dot / (sqrt($aa) * sqrt($bb)) : 0.0;
    }
}
