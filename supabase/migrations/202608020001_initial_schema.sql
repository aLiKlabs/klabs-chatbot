begin;

create extension if not exists pgcrypto with schema extensions;
create extension if not exists vector with schema extensions;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  full_name text,
  role text not null default 'member' check (role in ('administrator', 'member')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 100),
  slug text not null unique,
  public_key text not null unique default encode(gen_random_bytes(18), 'hex'),
  website_url text not null,
  status text not null default 'draft' check (status in ('draft', 'active', 'paused', 'archived')),
  default_language text not null default 'en',
  supported_languages text[] not null default array['en']::text[],
  timezone text not null default 'UTC',
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz
);

create table public.chatbot_settings (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null unique references public.projects(id) on delete cascade,
  bot_name text not null default 'Website Assistant',
  welcome_message jsonb not null default '{"en":"Hello! How can I help you today?","ar":"مرحباً! كيف يمكنني مساعدتك اليوم؟"}'::jsonb,
  placeholder_text jsonb not null default '{"en":"Type your message…","ar":"اكتب رسالتك…"}'::jsonb,
  primary_color text not null default '#6758E8',
  secondary_color text not null default '#FFFFFF',
  text_color text not null default '#172033',
  launcher_position text not null default 'bottom-right' check (launcher_position in ('bottom-left', 'bottom-right')),
  launcher_icon text not null default 'message',
  logo_url text,
  avatar_url text,
  border_radius integer not null default 16 check (border_radius between 0 and 32),
  show_branding boolean not null default true,
  suggested_questions jsonb not null default '{"en":[],"ar":[]}'::jsonb,
  contact_email text,
  contact_phone text,
  whatsapp_number text,
  contact_page_url text,
  contact_button_label jsonb not null default '{"en":"Contact the team","ar":"تواصل مع الفريق"}'::jsonb,
  privacy_url text,
  terms_url text,
  collect_leads boolean not null default false,
  require_lead_consent boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.chatbot_instructions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null unique references public.projects(id) on delete cascade,
  system_instruction text not null default '',
  fallback_message jsonb not null default '{"en":"I’m sorry, but I don’t have verified information about that in this website’s knowledge base.","ar":"عذراً، لا تتوفر لدي معلومات موثقة حول ذلك في قاعدة معرفة هذا الموقع."}'::jsonb,
  restricted_topics jsonb not null default '[]'::jsonb,
  answer_length text not null default 'concise' check (answer_length in ('concise', 'balanced', 'detailed')),
  tone text not null default 'professional',
  citation_mode boolean not null default true,
  language_behavior text not null default 'match_visitor' check (language_behavior in ('match_visitor', 'project_default')),
  contact_escalation boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.project_domains (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  domain text not null,
  status text not null default 'active' check (status in ('active', 'disabled')),
  created_at timestamptz not null default now(),
  unique(project_id, domain)
);

create table public.knowledge_sources (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  source_type text not null check (source_type in ('website', 'webpage', 'pdf', 'docx', 'text', 'faq', 'manual')),
  name text not null,
  original_url text,
  storage_path text,
  status text not null default 'pending' check (status in ('pending', 'processing', 'ready', 'failed', 'disabled')),
  checksum text,
  content_hash text,
  error_message text,
  last_processed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.source_pages (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  knowledge_source_id uuid not null references public.knowledge_sources(id) on delete cascade,
  url text not null,
  title text,
  canonical_url text,
  raw_text text,
  clean_text text,
  content_hash text,
  http_status integer,
  last_crawled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(knowledge_source_id, url)
);

-- This dimension matches the .env.example default. Change both together before
-- applying the migration if a different embedding model dimension is selected.
create table public.document_chunks (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  knowledge_source_id uuid not null references public.knowledge_sources(id) on delete cascade,
  source_page_id uuid references public.source_pages(id) on delete cascade,
  chunk_index integer not null check (chunk_index >= 0),
  content text not null check (char_length(trim(content)) > 0),
  token_count integer not null check (token_count >= 0),
  embedding extensions.vector(1536),
  content_hash text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(knowledge_source_id, source_page_id, chunk_index, content_hash)
);

create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  session_id text not null,
  visitor_id text,
  language text,
  page_url text,
  referrer text,
  user_agent text,
  status text not null default 'active' check (status in ('active', 'completed', 'unanswered', 'abandoned')),
  started_at timestamptz not null default now(),
  last_message_at timestamptz not null default now(),
  ended_at timestamptz
);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  role text not null check (role in ('user', 'assistant', 'system', 'tool')),
  content text not null,
  sources jsonb not null default '[]'::jsonb,
  retrieval_score double precision,
  model text,
  input_tokens integer check (input_tokens is null or input_tokens >= 0),
  output_tokens integer check (output_tokens is null or output_tokens >= 0),
  latency_ms integer check (latency_ms is null or latency_ms >= 0),
  is_unanswered boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.feedback (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  message_id uuid not null references public.messages(id) on delete cascade,
  rating text not null check (rating in ('positive', 'negative')),
  comment text,
  created_at timestamptz not null default now(),
  unique(message_id)
);

create table public.leads (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  name text,
  email text,
  phone text,
  message text,
  consent boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.ingestion_jobs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  knowledge_source_id uuid not null references public.knowledge_sources(id) on delete cascade,
  job_type text not null check (job_type in ('extract', 'crawl', 'chunk', 'embed', 'reprocess')),
  status text not null default 'pending' check (status in ('pending', 'processing', 'completed', 'failed', 'cancelled')),
  progress integer not null default 0 check (progress between 0 and 100),
  processed_items integer not null default 0,
  failed_items integer not null default 0,
  error_message text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.usage_events (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  conversation_id uuid references public.conversations(id) on delete set null,
  event_type text not null,
  model text,
  input_tokens integer not null default 0,
  output_tokens integer not null default 0,
  embedding_tokens integer not null default 0,
  estimated_cost numeric(14, 8),
  created_at timestamptz not null default now()
);

create index projects_created_by_idx on public.projects(created_by);
create index projects_status_idx on public.projects(status) where archived_at is null;
create index project_domains_project_idx on public.project_domains(project_id, status);
create index knowledge_sources_project_status_idx on public.knowledge_sources(project_id, status);
create index source_pages_project_source_idx on public.source_pages(project_id, knowledge_source_id);
create index document_chunks_project_source_idx on public.document_chunks(project_id, knowledge_source_id);
create index document_chunks_content_hash_idx on public.document_chunks(project_id, content_hash);
create index document_chunks_embedding_idx on public.document_chunks using hnsw (embedding vector_cosine_ops) where embedding is not null;
create index conversations_project_started_idx on public.conversations(project_id, started_at desc);
create index conversations_project_session_idx on public.conversations(project_id, session_id);
create index messages_conversation_created_idx on public.messages(conversation_id, created_at);
create index messages_project_unanswered_idx on public.messages(project_id, is_unanswered) where is_unanswered;
create index feedback_project_rating_idx on public.feedback(project_id, rating, created_at desc);
create index leads_project_created_idx on public.leads(project_id, created_at desc);
create index ingestion_jobs_project_status_idx on public.ingestion_jobs(project_id, status, created_at desc);
create index usage_events_project_created_idx on public.usage_events(project_id, created_at desc);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_set_updated_at before update on public.profiles for each row execute function public.set_updated_at();
create trigger projects_set_updated_at before update on public.projects for each row execute function public.set_updated_at();
create trigger chatbot_settings_set_updated_at before update on public.chatbot_settings for each row execute function public.set_updated_at();
create trigger chatbot_instructions_set_updated_at before update on public.chatbot_instructions for each row execute function public.set_updated_at();
create trigger knowledge_sources_set_updated_at before update on public.knowledge_sources for each row execute function public.set_updated_at();
create trigger source_pages_set_updated_at before update on public.source_pages for each row execute function public.set_updated_at();
create trigger document_chunks_set_updated_at before update on public.document_chunks for each row execute function public.set_updated_at();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email, full_name, role)
  values (
    new.id,
    coalesce(new.email, ''),
    new.raw_user_meta_data ->> 'full_name',
    case when new.raw_app_meta_data ->> 'role' = 'administrator' then 'administrator' else 'member' end
  );
  return new;
end;
$$;

create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

-- Backfill profiles when Auth users were created before this migration.
insert into public.profiles (id, email, full_name, role)
select
  id,
  coalesce(email, ''),
  raw_user_meta_data ->> 'full_name',
  case when raw_app_meta_data ->> 'role' = 'administrator' then 'administrator' else 'member' end
from auth.users
on conflict (id) do nothing;

create or replace function public.create_project_defaults()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.chatbot_settings (project_id) values (new.id);
  insert into public.chatbot_instructions (project_id) values (new.id);
  return new;
end;
$$;

create trigger on_project_created after insert on public.projects for each row execute function public.create_project_defaults();

create or replace function public.is_klabs_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (auth.jwt() -> 'app_metadata' ->> 'role') = 'administrator'
    or exists (
      select 1 from public.profiles
      where id = auth.uid() and role = 'administrator'
    ),
    false
  );
$$;

revoke all on function public.is_klabs_admin() from public;
grant execute on function public.is_klabs_admin() to authenticated;

create or replace function public.match_document_chunks(
  query_embedding extensions.vector(1536),
  target_project_id uuid,
  match_threshold double precision default 0.72,
  match_count integer default 6
)
returns table (
  content text,
  similarity double precision,
  metadata jsonb
)
language sql
stable
set search_path = public, extensions
as $$
  select
    dc.content,
    1 - (dc.embedding <=> query_embedding) as similarity,
    dc.metadata
  from public.document_chunks dc
  join public.knowledge_sources ks
    on ks.id = dc.knowledge_source_id
   and ks.project_id = target_project_id
   and ks.status = 'ready'
  where public.is_klabs_admin()
    and dc.project_id = target_project_id
    and dc.embedding is not null
    and 1 - (dc.embedding <=> query_embedding) >= match_threshold
  order by dc.embedding <=> query_embedding
  limit least(greatest(match_count, 1), 20);
$$;

revoke all on function public.match_document_chunks(extensions.vector, uuid, double precision, integer) from public, anon;
grant execute on function public.match_document_chunks(extensions.vector, uuid, double precision, integer) to authenticated, service_role;

alter table public.profiles enable row level security;
alter table public.projects enable row level security;
alter table public.chatbot_settings enable row level security;
alter table public.chatbot_instructions enable row level security;
alter table public.project_domains enable row level security;
alter table public.knowledge_sources enable row level security;
alter table public.source_pages enable row level security;
alter table public.document_chunks enable row level security;
alter table public.conversations enable row level security;
alter table public.messages enable row level security;
alter table public.feedback enable row level security;
alter table public.leads enable row level security;
alter table public.ingestion_jobs enable row level security;
alter table public.usage_events enable row level security;

create policy profiles_admin_all on public.profiles for all to authenticated using (public.is_klabs_admin()) with check (public.is_klabs_admin());
create policy profiles_read_self on public.profiles for select to authenticated using (id = auth.uid());
create policy projects_admin_all on public.projects for all to authenticated using (public.is_klabs_admin()) with check (public.is_klabs_admin());
create policy chatbot_settings_admin_all on public.chatbot_settings for all to authenticated using (public.is_klabs_admin()) with check (public.is_klabs_admin());
create policy chatbot_instructions_admin_all on public.chatbot_instructions for all to authenticated using (public.is_klabs_admin()) with check (public.is_klabs_admin());
create policy project_domains_admin_all on public.project_domains for all to authenticated using (public.is_klabs_admin()) with check (public.is_klabs_admin());
create policy knowledge_sources_admin_all on public.knowledge_sources for all to authenticated using (public.is_klabs_admin()) with check (public.is_klabs_admin());
create policy source_pages_admin_all on public.source_pages for all to authenticated using (public.is_klabs_admin()) with check (public.is_klabs_admin());
create policy document_chunks_admin_all on public.document_chunks for all to authenticated using (public.is_klabs_admin()) with check (public.is_klabs_admin());
create policy conversations_admin_all on public.conversations for all to authenticated using (public.is_klabs_admin()) with check (public.is_klabs_admin());
create policy messages_admin_all on public.messages for all to authenticated using (public.is_klabs_admin()) with check (public.is_klabs_admin());
create policy feedback_admin_all on public.feedback for all to authenticated using (public.is_klabs_admin()) with check (public.is_klabs_admin());
create policy leads_admin_all on public.leads for all to authenticated using (public.is_klabs_admin()) with check (public.is_klabs_admin());
create policy ingestion_jobs_admin_all on public.ingestion_jobs for all to authenticated using (public.is_klabs_admin()) with check (public.is_klabs_admin());
create policy usage_events_admin_all on public.usage_events for all to authenticated using (public.is_klabs_admin()) with check (public.is_klabs_admin());

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('chatbot-documents', 'chatbot-documents', false, 20971520, array['application/pdf','application/vnd.openxmlformats-officedocument.wordprocessingml.document','text/plain','text/markdown']),
  ('chatbot-branding', 'chatbot-branding', false, 5242880, array['image/png','image/jpeg','image/webp','image/svg+xml'])
on conflict (id) do nothing;

create policy chatbot_storage_admin_read on storage.objects for select to authenticated using (bucket_id in ('chatbot-documents', 'chatbot-branding') and public.is_klabs_admin());
create policy chatbot_storage_admin_insert on storage.objects for insert to authenticated with check (bucket_id in ('chatbot-documents', 'chatbot-branding') and public.is_klabs_admin());
create policy chatbot_storage_admin_update on storage.objects for update to authenticated using (bucket_id in ('chatbot-documents', 'chatbot-branding') and public.is_klabs_admin()) with check (bucket_id in ('chatbot-documents', 'chatbot-branding') and public.is_klabs_admin());
create policy chatbot_storage_admin_delete on storage.objects for delete to authenticated using (bucket_id in ('chatbot-documents', 'chatbot-branding') and public.is_klabs_admin());

commit;
