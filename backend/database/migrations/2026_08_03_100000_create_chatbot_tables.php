<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('profiles', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->string('email')->unique();
            $table->string('full_name')->nullable();
            $table->string('role')->default('administrator');
            $table->timestamps();
            $table->foreign('id')->references('id')->on('users')->cascadeOnDelete();
        });

        Schema::create('projects', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->string('name', 100);
            $table->string('slug')->unique();
            $table->string('public_key', 64)->unique();
            $table->text('website_url');
            $table->string('status')->default('draft')->index();
            $table->string('default_language', 12)->default('en');
            $table->json('supported_languages');
            $table->string('timezone')->default('UTC');
            $table->uuid('created_by');
            $table->timestamps();
            $table->timestamp('archived_at')->nullable();
            $table->foreign('created_by')->references('id')->on('profiles')->restrictOnDelete();
        });

        Schema::create('chatbot_settings', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('project_id')->unique();
            $table->string('bot_name')->default('Website Assistant');
            $table->json('welcome_message');
            $table->json('placeholder_text');
            $table->string('primary_color', 16)->default('#ED3B63');
            $table->string('secondary_color', 16)->default('#FFFFFF');
            $table->string('text_color', 16)->default('#172033');
            $table->string('launcher_position')->default('bottom-right');
            $table->string('launcher_icon')->default('message');
            $table->text('logo_url')->nullable();
            $table->text('avatar_url')->nullable();
            $table->unsignedTinyInteger('border_radius')->default(16);
            $table->boolean('show_branding')->default(true);
            $table->json('suggested_questions');
            $table->string('contact_email')->nullable();
            $table->string('contact_phone')->nullable();
            $table->string('whatsapp_number')->nullable();
            $table->text('contact_page_url')->nullable();
            $table->json('contact_button_label');
            $table->text('privacy_url')->nullable();
            $table->text('terms_url')->nullable();
            $table->boolean('collect_leads')->default(false);
            $table->boolean('require_lead_consent')->default(true);
            $table->timestamps();
            $table->foreign('project_id')->references('id')->on('projects')->cascadeOnDelete();
        });

        Schema::create('chatbot_instructions', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('project_id')->unique();
            $table->longText('system_instruction')->nullable();
            $table->json('fallback_message');
            $table->json('restricted_topics');
            $table->string('answer_length')->default('concise');
            $table->string('tone')->default('professional');
            $table->boolean('citation_mode')->default(false);
            $table->string('language_behavior')->default('match_visitor');
            $table->boolean('contact_escalation')->default(true);
            $table->timestamps();
            $table->foreign('project_id')->references('id')->on('projects')->cascadeOnDelete();
        });

        Schema::create('project_domains', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('project_id');
            $table->string('domain');
            $table->string('status')->default('active');
            $table->timestamps();
            $table->unique(['project_id', 'domain']);
            $table->foreign('project_id')->references('id')->on('projects')->cascadeOnDelete();
        });

        Schema::create('knowledge_sources', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('project_id');
            $table->string('source_type');
            $table->text('name');
            $table->text('original_url')->nullable();
            $table->text('storage_path')->nullable();
            $table->string('status')->default('pending');
            $table->string('checksum', 128)->nullable();
            $table->string('content_hash', 128)->nullable();
            $table->text('error_message')->nullable();
            $table->timestamp('last_processed_at')->nullable();
            $table->json('metadata')->nullable();
            $table->timestamps();
            $table->index(['project_id', 'status']);
            $table->foreign('project_id')->references('id')->on('projects')->cascadeOnDelete();
        });

        Schema::create('source_pages', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('project_id');
            $table->uuid('knowledge_source_id');
            $table->text('url');
            $table->text('title')->nullable();
            $table->text('canonical_url')->nullable();
            $table->longText('raw_text')->nullable();
            $table->longText('clean_text')->nullable();
            $table->string('content_hash', 128)->nullable();
            $table->unsignedSmallInteger('http_status')->nullable();
            $table->timestamp('last_crawled_at')->nullable();
            $table->timestamps();
            $table->index(['project_id', 'knowledge_source_id']);
            $table->foreign('project_id')->references('id')->on('projects')->cascadeOnDelete();
            $table->foreign('knowledge_source_id')->references('id')->on('knowledge_sources')->cascadeOnDelete();
        });

        Schema::create('document_chunks', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('project_id');
            $table->uuid('knowledge_source_id');
            $table->uuid('source_page_id')->nullable();
            $table->unsignedInteger('chunk_index');
            $table->longText('content');
            $table->unsignedInteger('token_count');
            $table->longText('embedding')->nullable();
            $table->string('content_hash', 128);
            $table->json('metadata')->nullable();
            $table->timestamps();
            $table->unique(['knowledge_source_id', 'chunk_index', 'content_hash'], 'chunks_source_index_hash_unique');
            $table->index(['project_id', 'knowledge_source_id']);
            $table->index(['project_id', 'content_hash']);
            $table->foreign('project_id')->references('id')->on('projects')->cascadeOnDelete();
            $table->foreign('knowledge_source_id')->references('id')->on('knowledge_sources')->cascadeOnDelete();
            $table->foreign('source_page_id')->references('id')->on('source_pages')->cascadeOnDelete();
        });

        Schema::create('conversations', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('project_id');
            $table->string('session_id');
            $table->string('visitor_id')->nullable();
            $table->string('language', 12)->nullable();
            $table->text('page_url')->nullable();
            $table->text('referrer')->nullable();
            $table->text('user_agent')->nullable();
            $table->string('status')->default('active');
            $table->timestamp('started_at')->useCurrent();
            $table->timestamp('last_message_at')->useCurrent();
            $table->timestamp('ended_at')->nullable();
            $table->index(['project_id', 'started_at']);
            $table->index(['project_id', 'session_id']);
            $table->foreign('project_id')->references('id')->on('projects')->cascadeOnDelete();
        });

        Schema::create('messages', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('project_id');
            $table->uuid('conversation_id');
            $table->string('role');
            $table->longText('content');
            $table->json('sources')->nullable();
            $table->double('retrieval_score')->nullable();
            $table->string('model')->nullable();
            $table->unsignedInteger('input_tokens')->nullable();
            $table->unsignedInteger('output_tokens')->nullable();
            $table->unsignedInteger('latency_ms')->nullable();
            $table->boolean('is_unanswered')->default(false);
            $table->timestamp('created_at')->useCurrent();
            $table->index(['conversation_id', 'created_at']);
            $table->index(['project_id', 'is_unanswered']);
            $table->foreign('project_id')->references('id')->on('projects')->cascadeOnDelete();
            $table->foreign('conversation_id')->references('id')->on('conversations')->cascadeOnDelete();
        });

        Schema::create('feedback', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('project_id');
            $table->uuid('conversation_id');
            $table->uuid('message_id')->unique();
            $table->string('rating');
            $table->text('comment')->nullable();
            $table->timestamp('created_at')->useCurrent();
            $table->index(['project_id', 'rating', 'created_at']);
            $table->foreign('project_id')->references('id')->on('projects')->cascadeOnDelete();
            $table->foreign('conversation_id')->references('id')->on('conversations')->cascadeOnDelete();
            $table->foreign('message_id')->references('id')->on('messages')->cascadeOnDelete();
        });

        Schema::create('leads', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('project_id');
            $table->uuid('conversation_id');
            $table->string('name')->nullable();
            $table->string('email')->nullable();
            $table->string('phone')->nullable();
            $table->text('message')->nullable();
            $table->boolean('consent')->default(false);
            $table->timestamp('created_at')->useCurrent();
            $table->index(['project_id', 'created_at']);
            $table->foreign('project_id')->references('id')->on('projects')->cascadeOnDelete();
            $table->foreign('conversation_id')->references('id')->on('conversations')->cascadeOnDelete();
        });

        Schema::create('ingestion_jobs', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('project_id');
            $table->uuid('knowledge_source_id');
            $table->string('job_type');
            $table->string('status')->default('pending');
            $table->unsignedTinyInteger('progress')->default(0);
            $table->unsignedInteger('processed_items')->default(0);
            $table->unsignedInteger('failed_items')->default(0);
            $table->text('error_message')->nullable();
            $table->timestamp('started_at')->nullable();
            $table->timestamp('completed_at')->nullable();
            $table->timestamp('created_at')->useCurrent();
            $table->index(['project_id', 'status', 'created_at']);
            $table->foreign('project_id')->references('id')->on('projects')->cascadeOnDelete();
            $table->foreign('knowledge_source_id')->references('id')->on('knowledge_sources')->cascadeOnDelete();
        });

        Schema::create('usage_events', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('project_id');
            $table->uuid('conversation_id')->nullable();
            $table->string('event_type');
            $table->string('model')->nullable();
            $table->unsignedInteger('input_tokens')->default(0);
            $table->unsignedInteger('output_tokens')->default(0);
            $table->unsignedInteger('embedding_tokens')->default(0);
            $table->decimal('estimated_cost', 14, 8)->nullable();
            $table->timestamp('created_at')->useCurrent();
            $table->index(['project_id', 'created_at']);
            $table->foreign('project_id')->references('id')->on('projects')->cascadeOnDelete();
            $table->foreign('conversation_id')->references('id')->on('conversations')->nullOnDelete();
        });
    }

    public function down(): void
    {
        foreach (['usage_events', 'ingestion_jobs', 'leads', 'feedback', 'messages', 'conversations', 'document_chunks', 'source_pages', 'knowledge_sources', 'project_domains', 'chatbot_instructions', 'chatbot_settings', 'projects', 'profiles'] as $table) {
            Schema::dropIfExists($table);
        }
    }
};
