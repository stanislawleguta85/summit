-- Nur lesen: Prueft das Rollen- und Berechtigungsfundament nach der Migration.

select code, name, is_system
from public.roles
order by code;

select code, name
from public.permissions
order by resource, action;

select
  role_record.code as role_code,
  permission_record.code as permission_code,
  role_permission.scope
from public.role_permissions role_permission
join public.roles role_record on role_record.id = role_permission.role_id
join public.permissions permission_record on permission_record.id = role_permission.permission_id
order by role_record.code, permission_record.code, role_permission.scope;

select
  profile.first_name,
  profile.last_name,
  profile.role as legacy_primary_role,
  array_agg(role_record.code order by role_record.code) as assigned_roles
from public.user_profiles profile
join public.user_roles assignment
  on assignment.user_id = profile.user_id
 and assignment.company_id = profile.company_id
join public.roles role_record on role_record.id = assignment.role_id
group by profile.user_id, profile.first_name, profile.last_name, profile.role
order by profile.last_name nulls last, profile.first_name nulls last;

select
  count(*) filter (where profile.role is not null) as profiles,
  count(*) filter (where assignment.user_id is not null) as profiles_with_primary_role_assignment
from public.user_profiles profile
left join public.roles role_record
  on role_record.company_id is null
 and role_record.code = profile.role
left join public.user_roles assignment
  on assignment.user_id = profile.user_id
 and assignment.company_id = profile.company_id
 and assignment.role_id = role_record.id;
