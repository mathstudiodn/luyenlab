begin;
create extension if not exists pgcrypto with schema extensions;

create table if not exists private.studio_students (
  id uuid primary key default gen_random_uuid(),
  full_name text not null check (length(full_name) between 2 and 120),
  name_key text not null,
  pin_hash text not null
);
create index if not exists studio_students_name_key on private.studio_students(name_key);

create table if not exists private.studio_student_sessions (
  token_hash bytea primary key,
  student_id uuid not null references private.studio_students on delete cascade,
  expires_at timestamptz not null
);
create index if not exists studio_student_session_owner on private.studio_student_sessions(student_id);

create table if not exists private.studio_student_results (
  student_id uuid not null references private.studio_students on delete cascade,
  attempt_id uuid not null,
  saved_at timestamptz not null default now(),
  result jsonb not null,
  primary key (student_id, attempt_id)
);
create index if not exists studio_student_result_order on private.studio_student_results(student_id,saved_at desc);
revoke all on private.studio_students, private.studio_student_sessions, private.studio_student_results from public, anon, authenticated;
alter table private.studio_students enable row level security;
alter table private.studio_student_sessions enable row level security;
alter table private.studio_student_results enable row level security;

create table if not exists private.studio_student_login_limits (
  name_key text primary key,
  attempts integer not null,
  expires_at timestamptz not null
);
revoke all on private.studio_student_login_limits from public, anon, authenticated;
alter table private.studio_student_login_limits enable row level security;

create or replace function private.studio_student_name(value text)
returns text language sql immutable set search_path = ''
as $$ select btrim(regexp_replace(value, '[[:space:]]+', ' ', 'g')) $$;

create or replace function public.studio_issue_student_pin(p_name text, p_student uuid default null)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  student uuid;
  display_name text;
  pin text;
  secret bytea;
begin
  if not public.studio_is_admin() then raise exception 'Admin required'; end if;
  if p_student is null then
    display_name := private.studio_student_name(p_name);
    if display_name is null or length(display_name) not between 2 and 120 then raise exception 'Invalid name'; end if;
  else
    select full_name into display_name from private.studio_students where id=p_student;
    if display_name is null then raise exception 'Student not found'; end if;
  end if;
  perform pg_advisory_xact_lock(hashtextextended(lower(display_name),0));
  for candidate in 1..30 loop
    secret := extensions.gen_random_bytes(4);
    pin := lpad(((('x'||encode(secret,'hex'))::bit(32)::bigint)%10000)::text,4,'0');
    exit when not exists (
      select 1 from private.studio_students
      where name_key=lower(display_name) and extensions.crypt(pin,pin_hash)=pin_hash
    );
    pin := null;
  end loop;
  if pin is null then raise exception 'Unable to issue a unique PIN'; end if;
  if p_student is null then
    insert into private.studio_students(full_name,name_key,pin_hash)
    values(display_name,lower(display_name),extensions.crypt(pin,extensions.gen_salt('bf')))
    returning id into student;
  else
    update private.studio_students set pin_hash=extensions.crypt(pin,extensions.gen_salt('bf'))
      where id=p_student returning id,full_name into student,display_name;
    if student is null then raise exception 'Student not found'; end if;
    delete from private.studio_student_sessions where student_id=student;
  end if;
  return jsonb_build_object('id',student,'name',display_name,'pin',pin);
end $$;

create or replace function public.studio_list_students()
returns table (id uuid, name text) language plpgsql security definer set search_path = ''
as $$
begin
  if not public.studio_is_admin() then raise exception 'Admin required'; end if;
  return query select s.id,s.full_name from private.studio_students s order by s.full_name,s.id;
end $$;

create or replace function public.studio_student_login(p_name text,p_pin text)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare s private.studio_students%rowtype; token text; login_name text; counter integer;
begin
  if p_pin is null or p_pin !~ '^[0-9]{4}$' or p_name is null or length(p_name)>120 then return null; end if;
  login_name := lower(private.studio_student_name(p_name));
  if not exists (select 1 from private.studio_students where name_key=login_name) then return null; end if;
  insert into private.studio_student_login_limits as limits (name_key,attempts,expires_at)
    values(login_name,1,now()+interval '15 minutes')
    on conflict (name_key) do update set
      attempts = case when limits.expires_at<=now() then 1 else limits.attempts+1 end,
      expires_at = case when limits.expires_at<=now() then excluded.expires_at else limits.expires_at end
    where limits.expires_at<=now() or limits.attempts<5
    returning attempts into counter;
  if counter is null then return jsonb_build_object('retry',true); end if;
  select * into s from private.studio_students
    where name_key=lower(private.studio_student_name(p_name))
      and extensions.crypt(p_pin,pin_hash)=pin_hash
    limit 1 for update;
  if not found then return null; end if;
  delete from private.studio_student_login_limits where name_key=login_name;
  delete from private.studio_student_sessions where student_id=s.id and expires_at<=now();
  token := encode(extensions.gen_random_bytes(32),'hex');
  insert into private.studio_student_sessions values (extensions.digest(token,'sha256'),s.id,now()+interval '12 hours');
  return jsonb_build_object('id',s.id,'name',s.full_name,'token',token);
end $$;

create or replace function private.studio_student_from_token(p_token text)
returns uuid language sql stable set search_path = ''
as $$
  select student_id from private.studio_student_sessions
  where length(p_token)=64 and token_hash=extensions.digest(p_token,'sha256') and expires_at>now()
$$;

create or replace function public.studio_student_logout(p_token text)
returns void language sql security definer set search_path = ''
as $$
  delete from private.studio_student_sessions where length(p_token)=64 and token_hash=extensions.digest(p_token,'sha256')
$$;

create or replace function public.studio_student_history(p_token text,p_offset integer default 0)
returns table (attempt_id uuid, saved_at timestamptz, result jsonb)
language plpgsql security definer set search_path = ''
as $$
declare student uuid := private.studio_student_from_token(p_token);
begin
  if student is null then raise exception 'Student session expired' using errcode='28000'; end if;
  return query select r.attempt_id,r.saved_at,r.result from private.studio_student_results r
  where r.student_id=student order by r.saved_at desc,r.attempt_id
  limit 10 offset greatest(0,coalesce(p_offset,0));
end $$;

create or replace function public.studio_save_student_result(p_token text,p_attempt uuid,p_result jsonb)
returns void language plpgsql security definer set search_path = ''
as $$
declare student uuid := private.studio_student_from_token(p_token);
begin
  if student is null then raise exception 'Student session expired' using errcode='28000'; end if;
  if p_result is null or pg_column_size(p_result)>15000000
    or jsonb_typeof(p_result) is distinct from 'object'
    or coalesce(p_result->>'track','') not in ('sat','vn')
    or jsonb_typeof(p_result->'questions') is distinct from 'array'
    or jsonb_typeof(p_result->'answers') is distinct from 'object' then
    raise exception 'Invalid practice result';
  end if;
  insert into private.studio_student_results(student_id,attempt_id,result)
    values(student,p_attempt,p_result) on conflict do nothing;
end $$;

revoke execute on function
  public.studio_issue_student_pin(text,uuid),public.studio_list_students(),
  public.studio_student_login(text,text),public.studio_student_logout(text),
  public.studio_student_history(text,integer),public.studio_save_student_result(text,uuid,jsonb)
from public,anon,authenticated;
grant execute on function public.studio_issue_student_pin(text,uuid),public.studio_list_students() to authenticated;
grant execute on function public.studio_student_login(text,text),public.studio_student_logout(text),
  public.studio_student_history(text,integer),public.studio_save_student_result(text,uuid,jsonb) to anon,authenticated;
commit;
