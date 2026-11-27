begin;

create table if not exists public.studio_catalog (
  id integer primary key check (id = 1),
  revision integer not null default 1 check (revision > 0),
  tree jsonb not null check (
    jsonb_typeof(tree) = 'object' and tree ? 'grades' and tree ? 'domains'
    and jsonb_typeof(tree->'grades') = 'array' and jsonb_typeof(tree->'domains') = 'array'
  )
);

alter table public.studio_catalog enable row level security;
revoke all on public.studio_catalog from public, anon, authenticated;
grant select on public.studio_catalog to anon, authenticated;
grant insert, update on public.studio_catalog to authenticated;
drop policy if exists studio_catalog_read on public.studio_catalog;
drop policy if exists studio_catalog_edit on public.studio_catalog;
create policy studio_catalog_read on public.studio_catalog
  for select to anon, authenticated using (true);
create policy studio_catalog_edit on public.studio_catalog
  for all to authenticated using ((select public.studio_is_admin()))
  with check ((select public.studio_is_admin()));

alter table public.studio_questions add column if not exists catalog_id uuid;
commit;
