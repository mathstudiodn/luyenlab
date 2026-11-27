begin;
create or replace function public.studio_exam_session(p_token text)
returns uuid language sql stable security definer set search_path='' as $$
  select private.studio_student_from_token(p_token)
$$;
revoke all on function public.studio_exam_session(text) from public;
grant execute on function public.studio_exam_session(text) to anon,authenticated;

create or replace function public.studio_admin_student_history(p_student uuid,p_offset integer default 0)
returns table(attempt_id uuid,saved_at timestamptz,result jsonb)
language plpgsql stable security definer set search_path='' as $$
begin
 if not public.studio_is_admin() then raise exception 'Admin required' using errcode='42501'; end if;
 return query select r.attempt_id,r.saved_at,r.result from private.studio_student_results r
 where r.student_id=p_student order by r.saved_at desc,r.attempt_id limit 10 offset greatest(0,p_offset);
end $$;
revoke all on function public.studio_admin_student_history(uuid,integer) from public;
grant execute on function public.studio_admin_student_history(uuid,integer) to authenticated;
commit;
