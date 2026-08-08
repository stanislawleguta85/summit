-- Owner und Trainer koennen Kundenkonten ueber die geschuetzte Edge Function anlegen.
begin;

update public.permissions
set
  name = 'Crear cuentas',
  description = 'Crear cuentas aprobadas para la sede mediante un proceso administrativo protegido.'
where resource = 'members'
  and action = 'create';

insert into public.role_permissions (role_id, permission_id, scope)
select role_record.id, permission_record.id, 'assigned'
from public.roles role_record
join public.permissions permission_record
  on permission_record.resource = 'members'
 and permission_record.action = 'create'
where role_record.code = 'trainer'
  and role_record.company_id is null
on conflict (role_id, permission_id, scope) do nothing;

create or replace function public.finalize_admin_created_staff(
  target_user_id uuid,
  target_company_id uuid,
  staff_role text,
  created_by_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_role_id uuid;
  can_create_all boolean;
  can_create_assigned boolean;
begin
  if staff_role not in ('customer', 'trainer') then
    raise exception 'Solo se pueden crear cuentas de cliente o entrenador.';
  end if;

  select
    (select private.has_permission(
      actor.user_id, actor.company_id, 'members', 'create', 'all'
    )),
    (select private.has_permission(
      actor.user_id, actor.company_id, 'members', 'create', 'assigned'
    ))
  into can_create_all, can_create_assigned
  from public.user_profiles actor
  where actor.user_id = created_by_user_id
    and actor.company_id = target_company_id
    and actor.status = 'approved';

  if staff_role = 'trainer' and not coalesce(can_create_all, false) then
    raise exception 'No tienes permiso para crear entrenadores en esta sede.';
  end if;

  if staff_role = 'customer'
    and not (coalesce(can_create_all, false) or coalesce(can_create_assigned, false)) then
    raise exception 'No tienes permiso para crear clientes en esta sede.';
  end if;

  if staff_role = 'customer'
    and not coalesce(can_create_all, false)
    and not (select private.has_role(
      created_by_user_id, target_company_id, 'trainer'
    )) then
    raise exception 'Solo un entrenador autorizado puede crear clientes asignados.';
  end if;

  select role_record.id
  into target_role_id
  from public.roles role_record
  where role_record.company_id is null
    and role_record.code = staff_role;

  if target_role_id is null then
    raise exception 'El rol seleccionado no existe.';
  end if;

  update public.user_profiles profile
  set
    role = staff_role,
    status = 'approved',
    assigned_trainer_id = case
      when staff_role = 'customer' and not coalesce(can_create_all, false)
        then created_by_user_id
      else null
    end,
    approved_by = created_by_user_id,
    approved_at = now(),
    must_change_password = true
  where profile.user_id = target_user_id
    and profile.company_id = target_company_id;

  if not found then
    raise exception 'El perfil no se pudo completar.';
  end if;

  delete from public.user_roles assignment
  using public.roles role_record
  where assignment.user_id = target_user_id
    and assignment.company_id = target_company_id
    and assignment.role_id = role_record.id
    and role_record.company_id is null
    and role_record.code in ('customer', 'trainer');

  insert into public.user_roles (
    user_id,
    company_id,
    role_id,
    assigned_by
  )
  values (
    target_user_id,
    target_company_id,
    target_role_id,
    created_by_user_id
  );
end;
$$;

revoke all on function public.finalize_admin_created_staff(uuid, uuid, text, uuid)
  from public, anon, authenticated;
grant execute on function public.finalize_admin_created_staff(uuid, uuid, text, uuid)
  to service_role;

commit;

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
