-- Apply after schema.sql, catalog.sql and students.sql. Existing items stay published.
begin;
alter table public.studio_questions
  add column if not exists status text not null default 'published' check (status in ('draft','published','archived')),
  add column if not exists version integer not null default 1;
drop policy if exists studio_read on public.studio_questions;
create policy studio_read on public.studio_questions for select to anon, authenticated using (status='published');

create table if not exists public.studio_question_versions (
  question_id uuid references public.studio_questions(id) on delete cascade,
  version integer not null, snapshot jsonb not null, saved_at timestamptz not null default now(),
  primary key(question_id,version)
);
alter table public.studio_question_versions enable row level security;
revoke all on public.studio_question_versions from public,anon,authenticated;
grant select on public.studio_question_versions to authenticated;
drop policy if exists admin_read_versions on public.studio_question_versions;
create policy admin_read_versions on public.studio_question_versions for select to authenticated using ((select public.studio_is_admin()));
create or replace function private.studio_version_question() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  insert into public.studio_question_versions(question_id,version,snapshot) values(old.id,old.version,to_jsonb(old));
  new.version := old.version+1;
  return new;
end $$;
drop trigger if exists studio_version_change on public.studio_questions;
create trigger studio_version_change before update on public.studio_questions for each row execute function private.studio_version_question();

create table if not exists public.studio_question_reports (
  question_id uuid references public.studio_questions(id) on delete cascade,
  student_id uuid references private.studio_students(id) on delete cascade,
  reason text not null check(reason in ('answer','wording','image','solution')),
  resolved boolean not null default false, reported_at timestamptz not null default now(),
  primary key(question_id,student_id,reason)
);
alter table public.studio_question_reports enable row level security;
revoke all on public.studio_question_reports from public,anon,authenticated;
grant select, update(resolved) on public.studio_question_reports to authenticated;
drop policy if exists admin_manage_reports on public.studio_question_reports;
create policy admin_manage_reports on public.studio_question_reports for all to authenticated
  using ((select public.studio_is_admin())) with check ((select public.studio_is_admin()));
create or replace function public.studio_report_question(p_token text,p_question uuid,p_reason text)
returns void language plpgsql security definer set search_path='' as $$
declare student uuid := private.studio_student_from_token(p_token);
begin
  if student is null then raise exception 'Student session expired' using errcode='28000'; end if;
  if not exists(select 1 from public.studio_questions where id=p_question and status='published') then raise exception 'Question unavailable'; end if;
  insert into public.studio_question_reports(question_id,student_id,reason)
  values (p_question,student,p_reason) on conflict do nothing;
end $$;
revoke all on function public.studio_report_question(text,uuid,text) from public;
grant execute on function public.studio_report_question(text,uuid,text) to anon,authenticated;
create or replace function public.studio_bulk_questions(p_rows jsonb,p_status text,p_leaf uuid,p_topic text,p_track text,p_grade integer)
returns void language plpgsql security invoker set search_path='' as $$
declare updated integer;
begin
  if not public.studio_is_admin() then raise exception 'Admin required'; end if;
  update public.studio_questions q set status=coalesce(p_status,q.status),
    catalog_id=coalesce(p_leaf,q.catalog_id),topic=coalesce(p_topic,q.topic),
    grade=case when p_leaf is null then q.grade else p_grade end
    from jsonb_to_recordset(p_rows) as r(id uuid,version integer)
    where q.id=r.id and q.version=r.version and (p_leaf is null or q.track=p_track);
  get diagnostics updated=row_count;
  if updated<>jsonb_array_length(p_rows) then raise exception 'Selection changed'; end if;
end $$;
revoke all on function public.studio_bulk_questions(jsonb,text,uuid,text,text,integer) from public;
grant execute on function public.studio_bulk_questions(jsonb,text,uuid,text,text,integer) to authenticated;
create or replace function public.studio_question_quality()
returns table(question_id uuid,total bigint,fully_correct bigint)
language sql stable security definer set search_path='' as $$
  select q.id,count(*),count(*) filter (where item.value='true'::jsonb)
  from private.studio_student_results r
  cross join lateral jsonb_each(case when jsonb_typeof(r.result->'fullCredit')='object'
    then r.result->'fullCredit' else '{}'::jsonb end) item
  join public.studio_questions q on q.id::text=item.key
  where (select public.studio_is_admin()) and item.value in ('true'::jsonb,'false'::jsonb)
  group by q.id having count(*)>=5
  order by count(*) filter (where item.value='true'::jsonb)::numeric/count(*),count(*) desc
  limit 30
$$;
revoke all on function public.studio_question_quality() from public;
grant execute on function public.studio_question_quality() to authenticated;
commit;
