begin;

create or replace function public.match_document_chunks(
  query_embedding extensions.vector(1536),
  target_project_id uuid,
  match_threshold double precision default 0.72,
  match_count integer default 6
)
returns table (content text, similarity double precision, metadata jsonb)
language sql
stable
set search_path = public, extensions
as $$
  select dc.content, 1 - (dc.embedding <=> query_embedding) as similarity, dc.metadata
  from public.document_chunks dc
  join public.knowledge_sources ks
    on ks.id = dc.knowledge_source_id
   and ks.project_id = target_project_id
   and ks.status = 'ready'
  where (public.is_klabs_admin() or auth.role() = 'service_role')
    and dc.project_id = target_project_id
    and dc.embedding is not null
    and 1 - (dc.embedding <=> query_embedding) >= match_threshold
  order by dc.embedding <=> query_embedding
  limit least(greatest(match_count, 1), 20);
$$;

revoke all on function public.match_document_chunks(extensions.vector, uuid, double precision, integer) from public, anon;
grant execute on function public.match_document_chunks(extensions.vector, uuid, double precision, integer) to authenticated, service_role;

commit;
