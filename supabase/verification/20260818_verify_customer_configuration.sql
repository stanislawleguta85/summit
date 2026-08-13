-- Nur lesen: prueft die gemeinsame Kundenkonfiguration.

select
  to_regprocedure('public.get_customer_configuration(uuid)') is not null
    as customer_configuration_function_exists,
  to_regprocedure('public.update_customer_master_data(uuid,text,text,text)') is not null
    as customer_master_update_function_exists,
  has_function_privilege(
    'authenticated',
    'public.get_customer_configuration(uuid)',
    'EXECUTE'
  ) as authenticated_can_request_permitted_customer_configuration,
  has_function_privilege(
    'authenticated',
    'public.update_customer_master_data(uuid,text,text,text)',
    'EXECUTE'
  ) as authenticated_can_update_permitted_customer_profile,
  not has_function_privilege(
    'anon',
    'public.get_customer_configuration(uuid)',
    'EXECUTE'
  ) as anonymous_cannot_read_customer_configuration,
  exists (
    select 1
    from public.role_permissions role_permission
    join public.roles role_record on role_record.id = role_permission.role_id
    join public.permissions permission_record on permission_record.id = role_permission.permission_id
    where role_record.code = 'owner'
      and permission_record.resource = 'clients'
      and permission_record.action = 'update_profile'
      and role_permission.scope = 'all'
  ) as owner_can_update_customer_profile,
  exists (
    select 1
    from public.role_permissions role_permission
    join public.roles role_record on role_record.id = role_permission.role_id
    join public.permissions permission_record on permission_record.id = role_permission.permission_id
    where role_record.code = 'trainer'
      and permission_record.resource = 'clients'
      and permission_record.action = 'update_profile'
      and role_permission.scope = 'assigned'
  ) as trainer_can_update_assigned_customer_profile;
