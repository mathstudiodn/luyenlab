begin;

create schema if not exists private;
create table if not exists private.studio_admin (
  id uuid primary key references auth.users(id) on delete cascade
);
revoke all on private.studio_admin from public, anon, authenticated;

do $$
declare admin_id uuid;
begin
  select id into admin_id from auth.users
  where lower(email) = 'mathstudiodn@gmail.com' and email_confirmed_at is not null;
  if admin_id is null then
    raise exception 'Create and confirm the intended admin in Supabase Auth first.';
  end if;
  delete from private.studio_admin where id <> admin_id;
  insert into private.studio_admin values (admin_id) on conflict do nothing;
end $$;

create or replace function public.studio_is_admin()
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from private.studio_admin where id = (select auth.uid()))
    and coalesce(lower(auth.jwt()->>'email') = 'mathstudiodn@gmail.com', false)
$$;
revoke all on function public.studio_is_admin() from public;
grant execute on function public.studio_is_admin() to authenticated;

create table if not exists public.studio_questions (
  id uuid primary key default gen_random_uuid(),
  track text not null check (track in ('vn','sat')),
  grade integer,
  topic text not null,
  difficulty text not null check (difficulty in ('Easy','Medium','Hard')),
  type text not null check (type in ('mc','tf','short')),
  q text not null check (length(trim(q)) between 1 and 12000),
  answer jsonb not null,
  choices jsonb not null default '[]',
  statements jsonb not null default '[]',
  why text not null default '',
  image text not null default '' check (length(image) <= 1000100 and
    (image = '' or image ~ '^data:image/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$')),
  created_at timestamptz not null default now(),
  check ((track = 'vn' and grade is not null and grade in (10,11,12))
      or (track = 'sat' and grade is null and type <> 'tf'))
);
alter table public.studio_questions enable row level security;
revoke all on public.studio_questions from anon, authenticated;
grant select on public.studio_questions to anon, authenticated;
grant insert, update, delete on public.studio_questions to authenticated;
drop policy if exists studio_read on public.studio_questions;
drop policy if exists studio_write on public.studio_questions;
create policy studio_read on public.studio_questions for select to anon, authenticated using (true);
create policy studio_write on public.studio_questions for all to authenticated
  using ((select public.studio_is_admin()))
  with check ((select public.studio_is_admin()));
commit;
