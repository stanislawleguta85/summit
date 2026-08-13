select
  to_regclass('public.booking_change_requests') is not null
    as change_table_exists,
  exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'personal_training_requests'
      and column_name = 'change_request_id'
  ) as replacement_request_link_exists,
  to_regprocedure('public.get_my_calendar(timestamptz,timestamptz)') is not null
    as calendar_function_exists,
  to_regprocedure('public.request_booking_change(uuid,text)') is not null
    as change_request_function_exists,
  to_regprocedure('public.get_booking_change_alternatives(uuid)') is not null
    as alternatives_function_exists,
  to_regprocedure('public.get_booking_change_alternatives_v2(uuid)') is not null
    as alternatives_with_trainer_function_exists,
  to_regprocedure('public.recover_group_booking(uuid,uuid)') is not null
    as group_recovery_function_exists,
  to_regprocedure('public.join_booking_change_waitlist(uuid)') is not null
    as waitlist_function_exists,
  to_regprocedure('public.reject_personal_training_replacement(uuid)') is not null
    as replacement_rejection_function_exists,
  to_regprocedure('public.get_my_booking_change_audit()') is not null
    as change_audit_function_exists,
  has_function_privilege(
    'authenticated',
    'public.request_booking_change(uuid,text)',
    'EXECUTE'
  ) as authenticated_can_request_change,
  has_function_privilege(
    'authenticated',
    'public.recover_group_booking(uuid,uuid)',
    'EXECUTE'
  ) as authenticated_can_recover_group,
  has_function_privilege(
    'authenticated',
    'public.reject_personal_training_replacement(uuid)',
    'EXECUTE'
  ) as trainer_can_reject_replacement,
  has_function_privilege(
    'authenticated',
    'private.can_read_booking_change(uuid)',
    'EXECUTE'
  ) as authenticated_can_execute_change_policy,
  exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'booking_change_requests'
      and policyname = 'Permitted users can view booking changes'
  ) as change_select_policy_exists,
  not exists (
    select 1
    from pg_trigger trigger_record
    where trigger_record.tgrelid = 'public.personal_training_request_transfers'::regclass
      and trigger_record.tgname = 'personal_training_transfer_block_replacement'
      and not trigger_record.tgisinternal
  ) as replacement_transfer_allowed,
  exists (
    select 1
    from pg_trigger trigger_record
    where trigger_record.tgrelid = 'public.bookings'::regclass
      and trigger_record.tgname = 'bookings_notify_change_waiters'
      and not trigger_record.tgisinternal
  ) as freed_booking_notifies_waitlist,
  exists (
    select 1
    from pg_trigger trigger_record
    where trigger_record.tgrelid = 'public.personal_training_requests'::regclass
      and trigger_record.tgname = 'personal_training_requests_protect_processed_replacement'
      and not trigger_record.tgisinternal
  ) as processed_replacement_actions_locked,
  exists (
    select 1
    from pg_trigger trigger_record
    where trigger_record.tgrelid = 'public.booking_change_requests'::regclass
      and trigger_record.tgname = 'booking_change_capture_rejection'
      and not trigger_record.tgisinternal
  ) as rejection_audit_trigger_exists,
  exists (
    select 1
    from public.role_permissions role_permission
    join public.roles role_record on role_record.id = role_permission.role_id
    join public.permissions permission_record
      on permission_record.id = role_permission.permission_id
    where role_record.code = 'customer'
      and permission_record.resource = 'booking_changes'
      and permission_record.action = 'create'
      and role_permission.scope = 'own'
  ) as customer_can_request_own_change;
