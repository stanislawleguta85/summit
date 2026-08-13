-- Nur lesen: Prueft Kundenrechte, Trainerzuweisung und die Level-Policy.

select
  profile.first_name,
  profile.last_name,
  array_agg(distinct role_record.code order by role_record.code) as assigned_roles,
  trainer.first_name as assigned_trainer_first_name,
  trainer.last_name as assigned_trainer_last_name,
  (
    select customer_level.level
    from public.customer_category_levels customer_level
    where customer_level.customer_id = profile.user_id
      and customer_level.company_id = profile.company_id
      and customer_level.category = 'ET'
  ) as et_level,
  private.has_permission(profile.user_id, profile.company_id, 'clients', 'read', 'all')
    as can_read_all_clients,
  private.has_permission(profile.user_id, profile.company_id, 'clients', 'read', 'assigned')
    as can_read_assigned_clients,
  private.has_permission(profile.user_id, profile.company_id, 'clients', 'assign_trainer', 'all')
    as can_assign_trainer,
  private.has_permission(profile.user_id, profile.company_id, 'clients', 'set_level', 'all')
    as can_set_all_levels,
  private.has_permission(profile.user_id, profile.company_id, 'clients', 'set_level', 'assigned')
    as can_set_assigned_levels,
  exists (
    select 1
    from pg_policies policy_record
    where policy_record.schemaname = 'public'
      and policy_record.tablename = 'customer_category_levels'
      and policy_record.policyname = 'Users with client permissions can view category levels'
  ) as client_level_policy_installed
from public.user_profiles profile
join public.user_roles assignment
  on assignment.user_id = profile.user_id
 and assignment.company_id = profile.company_id
join public.roles role_record on role_record.id = assignment.role_id
left join public.user_profiles trainer on trainer.user_id = profile.assigned_trainer_id
group by
  profile.user_id,
  profile.first_name,
  profile.last_name,
  profile.company_id,
  trainer.first_name,
  trainer.last_name
order by profile.last_name nulls last, profile.first_name nulls last;
