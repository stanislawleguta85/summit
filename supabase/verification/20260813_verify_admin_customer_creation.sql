-- Nur lesen: prueft die Berechtigungen fuer administrativ erstellte Kundenkonten.

select
  exists (
    select 1
    from public.role_permissions role_permission
    join public.roles role_record on role_record.id = role_permission.role_id
    join public.permissions permission_record on permission_record.id = role_permission.permission_id
    where role_record.code = 'owner'
      and permission_record.resource = 'members'
      and permission_record.action = 'create'
      and role_permission.scope = 'all'
  ) as owner_can_create_members,
  exists (
    select 1
    from public.role_permissions role_permission
    join public.roles role_record on role_record.id = role_permission.role_id
    join public.permissions permission_record on permission_record.id = role_permission.permission_id
    where role_record.code = 'trainer'
      and permission_record.resource = 'members'
      and permission_record.action = 'create'
      and role_permission.scope = 'assigned'
  ) as trainer_can_create_assigned_customers,
  has_function_privilege(
    'service_role',
    'public.finalize_admin_created_staff(uuid,uuid,text,uuid)',
    'EXECUTE'
  ) as service_role_can_finalize_members,
  not has_function_privilege(
    'authenticated',
    'public.finalize_admin_created_staff(uuid,uuid,text,uuid)',
    'EXECUTE'
  ) as authenticated_cannot_finalize_members;
