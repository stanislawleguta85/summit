select
  exists (
    select 1
    from pg_index index_record
    join pg_class index_name on index_name.oid = index_record.indexrelid
    join pg_class table_name on table_name.oid = index_record.indrelid
    join pg_namespace schema_name on schema_name.oid = table_name.relnamespace
    where schema_name.nspname = 'public'
      and table_name.relname = 'personal_training_requests'
      and index_name.relname = 'personal_training_one_open_request_per_customer'
      and pg_get_expr(index_record.indpred, index_record.indrelid)
        ilike '%change_request_id IS NULL%'
  ) as parallel_requests_enabled,
  exists (
    select 1
    from pg_trigger trigger_record
    where trigger_record.tgrelid = 'public.personal_training_requests'::regclass
      and trigger_record.tgname = 'personal_training_requests_protect_processed_replacement'
      and not trigger_record.tgisinternal
  ) as processed_replacement_actions_locked,
  exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'booking_change_requests'
      and column_name = 'rejected_by'
  ) as rejection_actor_recorded,
  exists (
    select 1
    from pg_trigger trigger_record
    where trigger_record.tgrelid = 'public.booking_change_requests'::regclass
      and trigger_record.tgname = 'booking_change_capture_rejection'
      and not trigger_record.tgisinternal
  ) as rejection_audit_active,
  has_function_privilege(
    'authenticated',
    'public.get_my_booking_change_audit()',
    'EXECUTE'
  ) as trainer_can_read_audit,
  has_function_privilege(
    'authenticated',
    'private.can_read_booking_change(uuid)',
    'EXECUTE'
  ) as change_policy_can_execute;
