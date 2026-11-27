-- Old questions retain their original created_at.
alter table public.studio_questions add column if not exists source text;
