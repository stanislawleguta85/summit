-- Nur lesen: Prueft die RBAC-Zuordnung fuer Mitglieder nach Etappe 2.

select
  profile.first_name,
  profile.last_name,
  profile.status,
  array_agg(distinct role_record.code order by role_record.code) as assigned_roles,
  private.has_permission(
    profile.user_id,
    profile.company_id,
    'members',
    'read',
    'all'
  ) as can_read_all_members,
  private.has_permission(
    profile.user_id,
    profile.company_id,
    'members',
    'approve',
    'all'
  ) as can_approve_members,
  exists (
    select 1
    from pg_policies policy_record
    where policy_record.schemaname = 'public'
      and policy_record.tablename = 'user_profiles'
      and policy_record.policyname = 'Users with profile permissions can view profiles'
  ) as profile_policy_installed
from public.user_profiles profile
join public.user_roles assignment
  on assignment.user_id = profile.user_id
 and assignment.company_id = profile.company_id
join public.roles role_record on role_record.id = assignment.role_id
group by profile.user_id, profile.first_name, profile.last_name, profile.status, profile.company_id
order by profile.last_name nulls last, profile.first_name nulls last;
