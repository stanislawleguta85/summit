-- Nur lesen: Prueft Personal-Training-Rechte und die zugehoerigen RLS-Policies.

select
  profile.first_name,
  profile.last_name,
  array_agg(distinct role_record.code order by role_record.code) as assigned_roles,
  private.has_permission(
    profile.user_id,
    profile.company_id,
    'training_requests',
    'read',
    'all'
  ) as can_read_all_training_requests,
  private.has_permission(
    profile.user_id,
    profile.company_id,
    'training_requests',
    'read',
    'assigned'
  ) as can_read_assigned_training_requests,
  private.has_permission(
    profile.user_id,
    profile.company_id,
    'training_requests',
    'read',
    'own'
  ) as can_read_own_training_requests,
  private.has_permission(
    profile.user_id,
    profile.company_id,
    'training_requests',
    'create',
    'own'
  ) as can_create_own_training_requests,
  private.has_permission(
    profile.user_id,
    profile.company_id,
    'training_requests',
    'respond',
    'assigned'
  ) as can_respond_to_assigned_requests,
  private.has_permission(
    profile.user_id,
    profile.company_id,
    'training_requests',
    'confirm',
    'own'
  ) as can_confirm_own_requests,
  private.has_permission(
    profile.user_id,
    profile.company_id,
    'notifications',
    'read',
    'own'
  ) as can_read_own_notifications,
  private.has_permission(
    profile.user_id,
    profile.company_id,
    'notifications',
    'update',
    'own'
  ) as can_update_own_notifications
from public.user_profiles profile
join public.user_roles assignment
  on assignment.user_id = profile.user_id
 and assignment.company_id = profile.company_id
join public.roles role_record on role_record.id = assignment.role_id
group by profile.user_id, profile.first_name, profile.last_name, profile.company_id
order by profile.last_name nulls last, profile.first_name nulls last;

select
  tablename,
  policyname,
  cmd
from pg_policies
where schemaname = 'public'
  and tablename in (
    'personal_training_requests',
    'personal_training_proposals',
    'course_sessions',
    'bookings',
    'notifications'
  )
order by tablename, policyname;
