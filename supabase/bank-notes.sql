begin;
alter table public.studio_questions add column if not exists review_flags text[] not null default '{}';
create table if not exists public.studio_bank_notes (
  question_id uuid primary key references public.studio_questions(id) on delete cascade,
  note text not null check (length(note)<=4000)
);
alter table public.studio_bank_notes enable row level security;
revoke all on public.studio_bank_notes from public, anon, authenticated;
grant select, insert, update on public.studio_bank_notes to authenticated;
drop policy if exists admin_notes on public.studio_bank_notes;
create policy admin_notes on public.studio_bank_notes for all to authenticated
using ((select public.studio_is_admin())) with check ((select public.studio_is_admin()));
commit;
