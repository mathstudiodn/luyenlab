begin;
insert into storage.buckets(id,name,public,allowed_mime_types)
values ('studio-question-media','studio-question-media',true,array['image/jpeg','image/png','image/webp','image/svg+xml'])
on conflict(id) do update set allowed_mime_types =
  case when storage.buckets.allowed_mime_types is null then null
       when 'image/svg+xml' = any(storage.buckets.allowed_mime_types) then storage.buckets.allowed_mime_types
       else array_append(storage.buckets.allowed_mime_types,'image/svg+xml') end;
drop policy if exists studio_admin_add_question_media on storage.objects;
create policy studio_admin_add_question_media on storage.objects for insert to authenticated
  with check(bucket_id='studio-question-media' and (select public.studio_is_admin())
    and name ~ '^[0-9a-f-]{36}[.](jpg|png|svg|webp)$');
commit;
