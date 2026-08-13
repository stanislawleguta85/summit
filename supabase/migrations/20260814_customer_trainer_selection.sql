-- Beim administrativen Anlegen eines Kunden wird ein Trainer ausgewaehlt.
begin;

create or replace function public.get_customer_creation_trainers()
returns table (
  user_id uuid,
  first_name text,
  last_name text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actor_company_id uuid;
begin
  select profile.company_id
  into actor_company_id
  from public.user_profiles profile
  where profile.user_id = (select auth.uid())
    and profile.status = 'approved'
    and (
      (select private.has_permission(
        profile.user_id, profile.company_id, 'members', 'create', 'all'
      ))
      or (select private.has_permission(
        profile.user_id, profile.company_id, 'members', 'create', 'assigned'
      ))
    );

  if actor_company_id is null then
    raise exception 'No tienes permiso para crear clientes.';
  end if;

  return query
  select
    trainer.user_id,
    trainer.first_name,
    trainer.last_name
  from public.user_profiles trainer
  where trainer.company_id = actor_company_id
    and trainer.status = 'approved'
    and (select private.has_role(trainer.user_id, trainer.company_id, 'trainer'))
  order by trainer.last_name nulls last, trainer.first_name nulls last;
end;
$$;

create or replace function public.finalize_admin_created_member(
  target_user_id uuid,
  target_company_id uuid,
  member_role text,
  created_by_user_id uuid,
  assigned_trainer_user_id uuid
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
  if member_role not in ('customer', 'trainer') then
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

  if member_role = 'trainer' and not coalesce(can_create_all, false) then
    raise exception 'No tienes permiso para crear entrenadores en esta sede.';
  end if;

  if member_role = 'customer'
    and not (coalesce(can_create_all, false) or coalesce(can_create_assigned, false)) then
    raise exception 'No tienes permiso para crear clientes en esta sede.';
  end if;

  if member_role = 'customer' then
    if assigned_trainer_user_id is null then
      raise exception 'Selecciona un entrenador para el cliente.';
    end if;

    if not exists (
      select 1
      from public.user_profiles trainer
      where trainer.user_id = assigned_trainer_user_id
        and trainer.company_id = target_company_id
        and trainer.status = 'approved'
        and (select private.has_role(trainer.user_id, trainer.company_id, 'trainer'))
    ) then
      raise exception 'El entrenador seleccionado no esta disponible en esta sede.';
    end if;
  end if;

  select role_record.id
  into target_role_id
  from public.roles role_record
  where role_record.company_id is null
    and role_record.code = member_role;

  if target_role_id is null then
    raise exception 'El rol seleccionado no existe.';
  end if;

  update public.user_profiles profile
  set
    role = member_role,
    status = 'approved',
    assigned_trainer_id = case
      when member_role = 'customer' then assigned_trainer_user_id
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

revoke all on function public.get_customer_creation_trainers() from public, anon;
grant execute on function public.get_customer_creation_trainers() to authenticated;

revoke all on function public.finalize_admin_created_member(uuid, uuid, text, uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.finalize_admin_created_member(uuid, uuid, text, uuid, uuid)
  to service_role;

commit;

select
  has_function_privilege(
    'authenticated',
    'public.get_customer_creation_trainers()',
    'EXECUTE'
  ) as authenticated_can_list_creation_trainers,
  has_function_privilege(
    'service_role',
    'public.finalize_admin_created_member(uuid,uuid,text,uuid,uuid)',
    'EXECUTE'
  ) as service_role_can_finalize_member_with_trainer,
  not has_function_privilege(
    'authenticated',
    'public.finalize_admin_created_member(uuid,uuid,text,uuid,uuid)',
    'EXECUTE'
  ) as authenticated_cannot_finalize_member_with_trainer;
