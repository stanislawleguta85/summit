-- Etappe 6: Effektive Berechtigungen kontrolliert fuer die App bereitstellen.
-- Nach 20260803_personal_training_permissions.sql ausfuehren.
begin;

create or replace function public.get_user_permissions(
  target_user_id uuid default auth.uid()
)
returns table (
  resource text,
  action text,
  scope text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actor_user_id uuid := (select auth.uid());
  actor_company_id uuid;
  requested_user_id uuid := coalesce(target_user_id, actor_user_id);
begin
  select profile.company_id
  into actor_company_id
  from public.user_profiles profile
  where profile.user_id = actor_user_id
    and profile.status = 'approved';

  if actor_company_id is null then
    raise exception 'Solo los usuarios aprobados pueden consultar permisos.';
  end if;

  if requested_user_id <> actor_user_id
    and not (
      select private.has_permission(
        actor_user_id,
        actor_company_id,
        'roles',
        'read',
        'all'
      )
    ) then
    raise exception 'No tienes permiso para consultar los permisos de este usuario.';
  end if;

  if not exists (
    select 1
    from public.user_profiles target_profile
    where target_profile.user_id = requested_user_id
      and target_profile.company_id = actor_company_id
  ) then
    raise exception 'El usuario no pertenece a tu sede.';
  end if;

  return query
  select distinct
    permission_record.resource,
    permission_record.action,
    role_permission.scope
  from public.user_profiles target_profile
  join public.user_roles assignment
    on assignment.user_id = target_profile.user_id
   and assignment.company_id = target_profile.company_id
  join public.roles role_record
    on role_record.id = assignment.role_id
   and (
     role_record.company_id is null
     or role_record.company_id = assignment.company_id
   )
  join public.role_permissions role_permission
    on role_permission.role_id = role_record.id
  join public.permissions permission_record
    on permission_record.id = role_permission.permission_id
  where target_profile.user_id = requested_user_id
    and target_profile.company_id = actor_company_id
    and target_profile.status = 'approved'
  order by permission_record.resource, permission_record.action, role_permission.scope;
end;
$$;

revoke all on function public.get_user_permissions(uuid) from public, anon;
grant execute on function public.get_user_permissions(uuid) to authenticated;

commit;
