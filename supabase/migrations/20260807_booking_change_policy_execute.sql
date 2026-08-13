-- Hotfix fuer die RLS-Policy von booking_change_requests.
-- Die Policy wird als authenticated ausgewertet und muss ihre Hilfsfunktion ausfuehren duerfen.
begin;

revoke all on function private.can_read_booking_change(uuid) from public;
grant execute on function private.can_read_booking_change(uuid) to authenticated;

commit;

select has_function_privilege(
  'authenticated',
  'private.can_read_booking_change(uuid)',
  'EXECUTE'
) as authenticated_can_execute_change_policy;
