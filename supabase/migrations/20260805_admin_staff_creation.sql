-- Owner koennen Mitarbeiterkonten ueber eine geschuetzte Edge Function anlegen.
-- Nach 20260804_personal_training_transfers.sql ausfuehren.
begin;

do $$
begin
  if to_regclass('public.user_profiles') is null
    or to_regclass('public.roles') is null
    or to_regclass('public.permissions') is null
    or to_regclass('public.role_permissions') is null
    or to_regclass('public.user_roles') is null then
    raise exception 'Die Profil- und RBAC-Migrationen muessen zuerst ausgefuehrt werden.';
  end if;
end;
$$;

alter table public.user_profiles
  add column if not exists must_change_password boolean not null default false;

insert into public.permissions (resource, action, name, description)
values (
  'members',
  'create',
  'Crear empleados',
  'Crear cuentas de empleados para la sede mediante un proceso administrativo protegido.'
)
on conflict (resource, action) do update
set
  name = excluded.name,
  description = excluded.description;

insert into public.role_permissions (role_id, permission_id, scope)
select role_record.id, permission_record.id, 'all'
from public.roles role_record
join public.permissions permission_record
  on permission_record.resource = 'members'
 and permission_record.action = 'create'
where role_record.code = 'owner'
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
  staff_role_id uuid;
begin
  if staff_role <> 'trainer' then
    raise exception 'Por ahora solo se pueden crear cuentas de entrenador.';
  end if;

  if not exists (
    select 1
    from public.user_profiles actor
    where actor.user_id = created_by_user_id
      and actor.company_id = target_company_id
      and actor.status = 'approved'
      and (
        select private.has_permission(
          actor.user_id,
          actor.company_id,
          'members',
          'create',
          'all'
        )
      )
  ) then
    raise exception 'No tienes permiso para crear empleados en esta sede.';
  end if;

  select role_record.id
  into staff_role_id
  from public.roles role_record
  where role_record.company_id is null
    and role_record.code = staff_role;

  if staff_role_id is null then
    raise exception 'El rol de empleado no existe.';
  end if;

  update public.user_profiles profile
  set
    role = staff_role,
    status = 'approved',
    approved_by = created_by_user_id,
    approved_at = now(),
    must_change_password = true
  where profile.user_id = target_user_id
    and profile.company_id = target_company_id;

  if not found then
    raise exception 'El perfil del empleado no se pudo crear.';
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
    staff_role_id,
    created_by_user_id
  );
end;
$$;

create or replace function public.complete_initial_password_change()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.user_profiles profile
  set must_change_password = false
  where profile.user_id = (select auth.uid())
    and profile.status = 'approved';

  if not found then
    raise exception 'No se encontro un perfil aprobado para este usuario.';
  end if;
end;
$$;

revoke all on function public.finalize_admin_created_staff(uuid, uuid, text, uuid)
  from public, anon, authenticated;
grant execute on function public.finalize_admin_created_staff(uuid, uuid, text, uuid)
  to service_role;

revoke all on function public.complete_initial_password_change()
  from public, anon;
grant execute on function public.complete_initial_password_change()
  to authenticated;

commit;
