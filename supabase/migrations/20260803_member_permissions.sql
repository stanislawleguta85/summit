-- Etappe 2: Mitgliederanzeige und Registrierungspruefung ueber Berechtigungen absichern.
-- Nach 20260803_role_based_access_control.sql und den 20260802-Fachmigrationen ausfuehren.
begin;

do $$
begin
  if to_regclass('public.roles') is null
    or to_regclass('public.permissions') is null
    or to_regclass('public.role_permissions') is null
    or to_regclass('public.user_roles') is null then
    raise exception 'Zuerst 20260803_role_based_access_control.sql ausfuehren.';
  end if;

  if not exists (
    select 1
    from public.permissions permission_record
    where permission_record.resource = 'members'
      and permission_record.action = 'read'
  ) or not exists (
    select 1
    from public.permissions permission_record
    where permission_record.resource = 'members'
      and permission_record.action = 'approve'
  ) then
    raise exception 'Die Berechtigungen members.read und members.approve fehlen.';
  end if;
end;
$$;

-- Die Policy bleibt klein; die SECURITY-DEFINER-Funktion liest die RBAC-Tabellen ohne RLS-Rekursion.
create or replace function private.can_read_user_profile(
  target_user_id uuid,
  target_company_id uuid,
  target_primary_role text,
  target_status text,
  target_assigned_trainer_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    target_user_id = (select auth.uid())
    or (
      select private.has_permission(
        (select auth.uid()),
        target_company_id,
        'members',
        'read',
        'all'
      )
    )
    or (
      target_primary_role = 'customer'
      and target_status = 'approved'
      and (
        (
          select private.has_permission(
            (select auth.uid()),
            target_company_id,
            'clients',
            'read',
            'all'
          )
        )
        or (
          target_assigned_trainer_id = (select auth.uid())
          and (
            select private.has_permission(
              (select auth.uid()),
              target_company_id,
              'clients',
              'read',
              'assigned'
            )
          )
        )
      )
    );
$$;

-- Freigabe und Ablehnung pruefen nicht mehr die feste Rolle owner, sondern members.approve/all.
create or replace function public.review_user(
  target_user_id uuid,
  new_status text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_company_id uuid;
begin
  if new_status not in ('approved', 'rejected') then
    raise exception 'Estado de aprobacion no valido.';
  end if;

  select profile.company_id
  into actor_company_id
  from public.user_profiles profile
  where profile.user_id = (select auth.uid())
    and profile.status = 'approved'
    and (
      select private.has_permission(
        profile.user_id,
        profile.company_id,
        'members',
        'approve',
        'all'
      )
    );

  if actor_company_id is null then
    raise exception 'No tienes permiso para aprobar o rechazar registros.';
  end if;

  update public.user_profiles target
  set
    status = new_status,
    approved_by = (select auth.uid()),
    approved_at = now()
  where target.user_id = target_user_id
    and target.user_id <> (select auth.uid())
    and target.company_id = actor_company_id
    and target.role <> 'owner'
    and not exists (
      select 1
      from public.user_roles assignment
      join public.roles role_record on role_record.id = assignment.role_id
      where assignment.user_id = target.user_id
        and assignment.company_id = target.company_id
        and role_record.code = 'owner'
    );

  if not found then
    raise exception 'Usuario no encontrado, protegido o fuera de tu sede.';
  end if;
end;
$$;

revoke all on function private.can_read_user_profile(uuid, uuid, text, text, uuid) from public;
revoke all on function public.review_user(uuid, text) from public;
revoke all on function public.review_user(uuid, text) from anon;
grant execute on function private.can_read_user_profile(uuid, uuid, text, text, uuid)
  to authenticated;
grant execute on function public.review_user(uuid, text) to authenticated;

drop policy if exists "User profiles are viewable by the user or owner" on public.user_profiles;
drop policy if exists "Users and owners can view profiles" on public.user_profiles;
drop policy if exists "Users with profile permissions can view profiles" on public.user_profiles;
create policy "Users with profile permissions can view profiles"
on public.user_profiles for select
to authenticated
using (
  (
    select private.can_read_user_profile(
      user_id,
      company_id,
      role,
      status,
      assigned_trainer_id
    )
  )
);

commit;
