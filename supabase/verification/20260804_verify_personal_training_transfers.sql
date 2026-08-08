select
  to_regclass('public.personal_training_request_transfers') is not null
    as transfer_table_exists,
  exists (
    select 1
    from public.permissions permission_record
    where permission_record.resource = 'training_requests'
      and permission_record.action = 'transfer'
  ) as transfer_permission_exists,
  exists (
    select 1
    from public.role_permissions role_permission
    join public.roles role_record on role_record.id = role_permission.role_id
    join public.permissions permission_record
      on permission_record.id = role_permission.permission_id
    where role_record.code = 'trainer'
      and role_record.company_id is null
      and permission_record.resource = 'training_requests'
      and permission_record.action = 'transfer'
      and role_permission.scope = 'assigned'
  ) as trainer_can_transfer_assigned,
  exists (
    select 1
    from pg_trigger trigger_record
    where trigger_record.tgrelid = 'public.personal_training_proposals'::regclass
      and trigger_record.tgname = 'personal_training_proposals_block_pending_transfer'
      and not trigger_record.tgisinternal
  ) as pending_transfer_blocks_proposals,
  exists (
    select 1
    from pg_policies policy_record
    where policy_record.schemaname = 'public'
      and policy_record.tablename = 'personal_training_request_transfers'
      and policy_record.policyname = 'Transfer participants can view transfers'
  ) as transfer_select_policy_exists,
  has_function_privilege(
    'authenticated',
    'public.get_personal_training_transfer_candidates(uuid)',
    'EXECUTE'
  ) as candidates_authenticated_can_execute,
  has_function_privilege(
    'authenticated',
    'public.get_incoming_personal_training_transfers()',
    'EXECUTE'
  ) as incoming_authenticated_can_execute,
  has_function_privilege(
    'authenticated',
    'public.request_personal_training_transfer(uuid,uuid,text)',
    'EXECUTE'
  ) as request_authenticated_can_execute,
  has_function_privilege(
    'authenticated',
    'public.respond_personal_training_transfer(uuid,text)',
    'EXECUTE'
  ) as respond_authenticated_can_execute,
  has_function_privilege(
    'authenticated',
    'public.cancel_personal_training_transfer(uuid)',
    'EXECUTE'
  ) as cancel_authenticated_can_execute;
