-- Safe local demo seed. Run after creating at least one administrator.
-- It intentionally contains no production contact details.
do $$
declare
  admin_id uuid;
  demo_project_id uuid;
  demo_source_id uuid;
begin
  select id into admin_id from public.profiles where role = 'administrator' order by created_at limit 1;
  if admin_id is null then
    raise notice 'Skipping demo seed: create an administrator first.';
    return;
  end if;

  select id into demo_project_id from public.projects where slug = 'klabs-demo-assistant';
  if demo_project_id is null then
    insert into public.projects (
      name, slug, website_url, status, default_language, supported_languages, timezone, created_by
    ) values (
      'K-Labs Demo Assistant', 'klabs-demo-assistant', 'https://example.test', 'draft', 'en', array['en','ar'], 'Asia/Bahrain', admin_id
    ) returning id into demo_project_id;
  end if;

  select id into demo_source_id from public.knowledge_sources
    where project_id = demo_project_id and name = 'Demonstration knowledge';
  if demo_source_id is null then
    insert into public.knowledge_sources (
      project_id, source_type, name, status, content_hash, last_processed_at
    ) values (
      demo_project_id, 'manual', 'Demonstration knowledge', 'pending',
      encode(digest('K-Labs demonstration knowledge', 'sha256'), 'hex'), null
    );
  end if;
end;
$$;
