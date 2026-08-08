-- Nur lesen: zeigt die effektiven Berechtigungen aller freigegebenen Profile.
-- Der SQL Editor besitzt normalerweise keine auth.uid(); der RPC selbst wird in der App getestet.

select
  profile.first_name,
  profile.last_name,
  permission_record.resource,
  permission_record.action,
  role_permission.scope
from public.user_profiles profile
join public.user_roles assignment
  on assignment.user_id = profile.user_id
 and assignment.company_id = profile.company_id
join public.roles role_record on role_record.id = assignment.role_id
join public.role_permissions role_permission on role_permission.role_id = role_record.id
join public.permissions permission_record on permission_record.id = role_permission.permission_id
where profile.status = 'approved'
order by
  profile.last_name nulls last,
  profile.first_name nulls last,
  permission_record.resource,
  permission_record.action,
  role_permission.scope;

-- Nur Metadaten: prueft Signatur und Ausfuehrungsrecht des RPC.
select
  routine.routine_name,
  routine.security_type,
  has_function_privilege(
    'authenticated',
    'public.get_user_permissions(uuid)',
    'EXECUTE'
  ) as authenticated_can_execute
from information_schema.routines routine
where routine.specific_schema = 'public'
  and routine.routine_name = 'get_user_permissions';
