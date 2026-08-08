begin;

-- The SELECT policy on personal_training_services invokes this helper as the
-- authenticated caller. Keep it unavailable to anon, but executable by signed-in users.
revoke all on function private.can_read_personal_training_service(uuid)
  from public, anon;
grant execute on function private.can_read_personal_training_service(uuid)
  to authenticated;

commit;

select
  has_function_privilege(
    'authenticated',
    'private.can_read_personal_training_service(uuid)',
    'EXECUTE'
  ) as authenticated_can_check_personal_training_service,
  not has_function_privilege(
    'anon',
    'private.can_read_personal_training_service(uuid)',
    'EXECUTE'
  ) as anonymous_cannot_check_personal_training_service;
