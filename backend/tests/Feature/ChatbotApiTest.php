<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

class ChatbotApiTest extends TestCase
{
    use RefreshDatabase;

    public function test_administrator_can_authenticate_and_create_project_with_defaults(): void
    {
        config(['services.klabs.admin_emails' => ['admin@klabs.co']]);
        $user = User::query()->create([
            'name' => 'K-Labs admin', 'email' => 'admin@klabs.co', 'role' => 'administrator', 'password' => Hash::make('secret-password'),
        ]);
        DB::table('profiles')->insert([
            'id' => $user->id, 'email' => $user->email, 'full_name' => $user->name, 'role' => 'administrator', 'created_at' => now(), 'updated_at' => now(),
        ]);

        $login = $this->postJson('/api/v1/auth/login', ['email' => $user->email, 'password' => 'secret-password'])
            ->assertOk()->assertJsonPath('user.role', 'administrator');

        $token = $login->json('token');
        $projectId = fake()->uuid();
        $this->withToken($token)->postJson('/api/v1/data/query', [
            'table' => 'projects', 'action' => 'insert', 'single' => 'single',
            'values' => [
                'id' => $projectId, 'name' => 'Demo', 'slug' => 'demo', 'website_url' => 'https://example.test',
                'status' => 'draft', 'default_language' => 'en', 'supported_languages' => ['en'], 'timezone' => 'Asia/Bahrain', 'created_by' => $user->id,
            ],
        ])->assertOk()->assertJsonPath('data.id', $projectId);

        $this->assertDatabaseHas('chatbot_settings', ['project_id' => $projectId]);
        $this->assertDatabaseHas('chatbot_instructions', ['project_id' => $projectId]);
    }

    public function test_internal_gateway_rejects_an_invalid_key(): void
    {
        config(['services.klabs.internal_key' => str_repeat('a', 64)]);
        $this->withHeader('X-Internal-Key', str_repeat('b', 64))
            ->postJson('/api/v1/internal/data/query', ['table' => 'projects', 'action' => 'select'])
            ->assertUnauthorized();
    }

    public function test_internal_gateway_stores_a_document_in_private_storage(): void
    {
        Storage::fake('local');
        config(['services.klabs.internal_key' => str_repeat('a', 64)]);

        $this->withHeader('X-Internal-Key', str_repeat('a', 64))
            ->post('/api/v1/internal/storage/upload', [
                'path' => 'project-id/source-id/document.pdf',
                'file' => UploadedFile::fake()->create('document.pdf', 10, 'application/pdf'),
            ])
            ->assertOk()
            ->assertJsonPath('data.path', 'chatbot-documents/project-id/source-id/document.pdf');

        Storage::disk('local')->assertExists('chatbot-documents/project-id/source-id/document.pdf');
    }

    public function test_internal_gateway_normalizes_iso_timestamps_for_mysql(): void
    {
        config(['services.klabs.internal_key' => str_repeat('a', 64)]);
        $user = User::query()->create([
            'name' => 'K-Labs admin', 'email' => 'timestamps@klabs.co', 'role' => 'administrator', 'password' => Hash::make('secret-password'),
        ]);
        DB::table('profiles')->insert([
            'id' => $user->id, 'email' => $user->email, 'full_name' => $user->name, 'role' => 'administrator', 'created_at' => now(), 'updated_at' => now(),
        ]);
        $projectId = fake()->uuid();
        DB::table('projects')->insert([
            'id' => $projectId, 'name' => 'Timestamp test', 'slug' => 'timestamp-test', 'public_key' => fake()->uuid(),
            'website_url' => 'https://example.test', 'status' => 'draft', 'default_language' => 'en',
            'supported_languages' => json_encode(['en']), 'timezone' => 'UTC', 'created_by' => $user->id,
            'created_at' => now(), 'updated_at' => now(),
        ]);
        $sourceId = fake()->uuid();
        DB::table('knowledge_sources')->insert([
            'id' => $sourceId, 'project_id' => $projectId, 'source_type' => 'website', 'name' => 'Website',
            'status' => 'pending', 'created_at' => now(), 'updated_at' => now(),
        ]);

        $response = $this->withHeader('X-Internal-Key', str_repeat('a', 64))
            ->postJson('/api/v1/internal/data/query', [
                'table' => 'source_pages', 'action' => 'insert', 'single' => 'single',
                'values' => [
                    'project_id' => $projectId, 'knowledge_source_id' => $sourceId,
                    'url' => 'https://example.test/about', 'last_crawled_at' => '2026-08-03T11:12:10.873Z',
                ],
            ]);

        $response->assertOk()->assertJsonPath('data.last_crawled_at', '2026-08-03 11:12:10');
        $this->assertDatabaseHas('source_pages', [
            'knowledge_source_id' => $sourceId, 'last_crawled_at' => '2026-08-03 11:12:10',
        ]);
    }

    public function test_internal_gateway_inserts_message_rows_with_different_optional_columns(): void
    {
        config(['services.klabs.internal_key' => str_repeat('a', 64)]);
        $user = User::query()->create([
            'name' => 'K-Labs admin', 'email' => 'messages@klabs.co', 'role' => 'administrator', 'password' => Hash::make('secret-password'),
        ]);
        DB::table('profiles')->insert([
            'id' => $user->id, 'email' => $user->email, 'full_name' => $user->name, 'role' => 'administrator', 'created_at' => now(), 'updated_at' => now(),
        ]);
        $projectId = fake()->uuid();
        DB::table('projects')->insert([
            'id' => $projectId, 'name' => 'Message test', 'slug' => 'message-test', 'public_key' => fake()->uuid(),
            'website_url' => 'https://example.test', 'status' => 'draft', 'default_language' => 'en',
            'supported_languages' => json_encode(['en']), 'timezone' => 'UTC', 'created_by' => $user->id,
            'created_at' => now(), 'updated_at' => now(),
        ]);
        $conversationId = fake()->uuid();
        DB::table('conversations')->insert([
            'id' => $conversationId, 'project_id' => $projectId, 'session_id' => fake()->uuid(),
            'status' => 'active', 'started_at' => now(), 'last_message_at' => now(),
        ]);

        $this->withHeader('X-Internal-Key', str_repeat('a', 64))
            ->postJson('/api/v1/internal/data/query', [
                'table' => 'messages', 'action' => 'insert',
                'values' => [
                    [
                        'project_id' => $projectId, 'conversation_id' => $conversationId,
                        'role' => 'user', 'content' => 'Hello', 'sources' => [], 'is_unanswered' => false,
                    ],
                    [
                        'project_id' => $projectId, 'conversation_id' => $conversationId,
                        'role' => 'assistant', 'content' => 'Hello! How can I help?', 'sources' => [],
                        'retrieval_score' => null, 'model' => 'safe-fallback', 'input_tokens' => 2,
                        'output_tokens' => 8, 'latency_ms' => 100, 'is_unanswered' => true,
                    ],
                ],
            ])
            ->assertOk();

        $this->assertDatabaseCount('messages', 2);
        $this->assertDatabaseHas('messages', ['conversation_id' => $conversationId, 'role' => 'user', 'content' => 'Hello']);
        $this->assertDatabaseHas('messages', ['conversation_id' => $conversationId, 'role' => 'assistant', 'model' => 'safe-fallback']);
    }
}
