begin;
insert into storage.buckets(id,name,public,allowed_mime_types)
values ('studio-question-media','studio-question-media',true,array['image/jpeg','image/png','image/webp'])
on conflict(id) do nothing;
drop policy if exists studio_admin_add_question_media on storage.objects;
create policy studio_admin_add_question_media on storage.objects for insert to authenticated
  with check(bucket_id='studio-question-media' and (select public.studio_is_admin())
    and name ~ '^[0-9a-f-]{36}[.](jpg|png|webp)$');
commit;
