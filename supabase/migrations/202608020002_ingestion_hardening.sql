begin;

alter table public.knowledge_sources
  add column if not exists metadata jsonb not null default '{}'::jsonb;

alter table public.document_chunks
  drop constraint if exists document_chunks_knowledge_source_id_source_page_id_chunk_i_key;

create unique index if not exists document_chunks_source_index_hash_idx
  on public.document_chunks(knowledge_source_id, chunk_index, content_hash);

create or replace function public.replace_source_chunks(
  target_source_id uuid,
  target_project_id uuid,
  source_content_hash text,
  chunk_payload jsonb,
  embedding_token_count integer default 0,
  embedding_model text default null
)
returns integer
language plpgsql
security invoker
set search_path = public, extensions
as $$
declare
  inserted_count integer;
begin
  if not public.is_klabs_admin() then
    raise exception 'Administrator access required';
  end if;

  if not exists (
    select 1 from public.knowledge_sources
    where id = target_source_id and project_id = target_project_id
  ) then
    raise exception 'Knowledge source not found';
  end if;

  delete from public.document_chunks where knowledge_source_id = target_source_id;

  insert into public.document_chunks (
    project_id,
    knowledge_source_id,
    source_page_id,
    chunk_index,
    content,
    token_count,
    embedding,
    content_hash,
    metadata
  )
  select
    target_project_id,
    target_source_id,
    nullif(item ->> 'source_page_id', '')::uuid,
    (item ->> 'chunk_index')::integer,
    item ->> 'content',
    (item ->> 'token_count')::integer,
    (item -> 'embedding')::text::extensions.vector,
    item ->> 'content_hash',
    coalesce(item -> 'metadata', '{}'::jsonb)
  from jsonb_array_elements(chunk_payload) item;

  get diagnostics inserted_count = row_count;

  update public.knowledge_sources
  set status = 'ready',
      content_hash = source_content_hash,
      error_message = null,
      last_processed_at = now()
  where id = target_source_id and project_id = target_project_id;

  insert into public.usage_events (
    project_id, event_type, model, embedding_tokens
  ) values (
    target_project_id,
    'knowledge_embedding',
    embedding_model,
    greatest(embedding_token_count, 0)
  );

  return inserted_count;
end;
$$;

revoke all on function public.replace_source_chunks(uuid, uuid, text, jsonb, integer, text) from public, anon;
grant execute on function public.replace_source_chunks(uuid, uuid, text, jsonb, integer, text) to authenticated, service_role;

commit;
