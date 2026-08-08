-- Nur lesen: Prueft Kursberechtigungen und die beiden neuen RLS-Policies.

select
  profile.first_name,
  profile.last_name,
  array_agg(distinct role_record.code order by role_record.code) as assigned_roles,
  private.has_permission(profile.user_id, profile.company_id, 'courses', 'read', 'all')
    as can_read_all,
  private.has_permission(profile.user_id, profile.company_id, 'courses', 'read', 'assigned')
    as can_read_assigned,
  private.has_permission(profile.user_id, profile.company_id, 'courses', 'read', 'eligible')
    as can_read_eligible,
  private.has_permission(profile.user_id, profile.company_id, 'courses', 'create', 'all')
    as can_create,
  private.has_permission(profile.user_id, profile.company_id, 'courses', 'assign_trainer', 'all')
    as can_assign_trainer,
  private.has_permission(profile.user_id, profile.company_id, 'courses', 'assign_clients', 'all')
    as can_assign_all_clients,
  private.has_permission(profile.user_id, profile.company_id, 'courses', 'assign_clients', 'assigned')
    as can_assign_clients_to_assigned,
  (
    select count(*) = 2
    from pg_policies policy_record
    where policy_record.schemaname = 'public'
      and (
        (policy_record.tablename = 'courses'
          and policy_record.policyname = 'Users with course permissions can view courses')
        or (policy_record.tablename = 'course_enrollments'
          and policy_record.policyname = 'Users with enrollment permissions can view enrollments')
      )
  ) as course_policies_installed
from public.user_profiles profile
join public.user_roles assignment
  on assignment.user_id = profile.user_id
 and assignment.company_id = profile.company_id
join public.roles role_record on role_record.id = assignment.role_id
group by profile.user_id, profile.first_name, profile.last_name, profile.company_id
order by profile.last_name nulls last, profile.first_name nulls last;
