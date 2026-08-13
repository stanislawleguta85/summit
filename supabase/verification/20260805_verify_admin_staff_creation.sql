select
  exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'user_profiles'
      and column_name = 'must_change_password'
      and data_type = 'boolean'
  ) as password_change_column_exists,
  exists (
    select 1
    from public.permissions permission_record
    where permission_record.resource = 'members'
      and permission_record.action = 'create'
  ) as member_create_permission_exists,
  exists (
    select 1
    from public.role_permissions role_permission
    join public.roles role_record on role_record.id = role_permission.role_id
    join public.permissions permission_record
      on permission_record.id = role_permission.permission_id
    where role_record.code = 'owner'
      and role_record.company_id is null
      and permission_record.resource = 'members'
      and permission_record.action = 'create'
      and role_permission.scope = 'all'
  ) as owner_can_create_members,
  has_function_privilege(
    'service_role',
    'public.finalize_admin_created_staff(uuid,uuid,text,uuid)',
    'EXECUTE'
  ) as service_role_can_finalize_staff,
  not has_function_privilege(
    'authenticated',
    'public.finalize_admin_created_staff(uuid,uuid,text,uuid)',
    'EXECUTE'
  ) as authenticated_cannot_finalize_staff,
  has_function_privilege(
    'authenticated',
    'public.complete_initial_password_change()',
    'EXECUTE'
  ) as authenticated_can_complete_password_change;
