-- Nur lesen: prueft das gespeicherte Kunden-Vertragsmodell.

select
  to_regclass('public.customer_training_contracts') is not null
    as customer_training_contracts_table_exists,
  exists (
    select 1
    from public.role_permissions role_permission
    join public.roles role_record on role_record.id = role_permission.role_id
    join public.permissions permission_record on permission_record.id = role_permission.permission_id
    where role_record.code = 'owner'
      and permission_record.resource = 'clients'
      and permission_record.action = 'set_contract'
      and role_permission.scope = 'all'
  ) as owner_can_set_customer_contract,
  exists (
    select 1
    from public.role_permissions role_permission
    join public.roles role_record on role_record.id = role_permission.role_id
    join public.permissions permission_record on permission_record.id = role_permission.permission_id
    where role_record.code = 'trainer'
      and permission_record.resource = 'clients'
      and permission_record.action = 'set_contract'
      and role_permission.scope = 'assigned'
  ) as trainer_can_set_assigned_customer_contract,
  has_function_privilege(
    'service_role',
    'public.finalize_admin_created_member(uuid,uuid,text,uuid,uuid,text,smallint)',
    'EXECUTE'
  ) as service_role_can_finalize_customer_contract,
  not has_function_privilege(
    'authenticated',
    'public.finalize_admin_created_member(uuid,uuid,text,uuid,uuid,text,smallint)',
    'EXECUTE'
  ) as authenticated_cannot_finalize_customer_contract;
