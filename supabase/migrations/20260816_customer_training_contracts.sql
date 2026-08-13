-- Speichert das aktuelle Vertragsmodell und beim Gruppenmodell die gebuchten Wochentage.
begin;

create table if not exists public.customer_training_contracts (
  customer_id uuid primary key references auth.users(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  training_model text not null check (training_model in ('group', 'individual')),
  group_days_per_week smallint,
  set_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (training_model = 'group' and group_days_per_week between 1 and 7)
    or (training_model = 'individual' and group_days_per_week is null)
  )
);

create index if not exists idx_customer_training_contracts_company
  on public.customer_training_contracts(company_id, training_model);

drop trigger if exists customer_training_contracts_set_updated_at
  on public.customer_training_contracts;
create trigger customer_training_contracts_set_updated_at
before update on public.customer_training_contracts
for each row execute procedure private.set_updated_at();

insert into public.permissions (resource, action, name, description)
values (
  'clients',
  'set_contract',
  'Definir contrato',
  'Definir el modelo de entrenamiento y los dias semanales contratados.'
)
on conflict (resource, action) do update
set
  name = excluded.name,
  description = excluded.description;

insert into public.role_permissions (role_id, permission_id, scope)
select role_record.id, permission_record.id, assignment.scope
from public.roles role_record
join public.permissions permission_record
  on permission_record.resource = 'clients'
 and permission_record.action = 'set_contract'
join (values ('owner', 'all'), ('trainer', 'assigned')) as assignment(role_code, scope)
  on assignment.role_code = role_record.code
where role_record.company_id is null
on conflict (role_id, permission_id, scope) do nothing;

create or replace function private.can_read_customer_training_contract(
  target_customer_id uuid,
  target_company_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    target_customer_id = (select auth.uid())
    or (select private.has_permission(
      (select auth.uid()), target_company_id, 'clients', 'read', 'all'
    ))
    or exists (
      select 1
      from public.user_profiles customer
      where customer.user_id = target_customer_id
        and customer.company_id = target_company_id
        and customer.assigned_trainer_id = (select auth.uid())
        and (select private.has_permission(
          (select auth.uid()), target_company_id, 'clients', 'read', 'assigned'
        ))
    );
$$;

create or replace function public.finalize_admin_created_member(
  target_user_id uuid,
  target_company_id uuid,
  member_role text,
  created_by_user_id uuid,
  assigned_trainer_user_id uuid,
  selected_training_model text,
  selected_group_days_per_week smallint
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

    if selected_training_model not in ('group', 'individual') then
      raise exception 'Selecciona el modelo de entrenamiento del cliente.';
    end if;

    if selected_training_model = 'group'
      and (selected_group_days_per_week is null
        or selected_group_days_per_week not between 1 and 7) then
      raise exception 'Los dias semanales del grupo deben estar entre 1 y 7.';
    end if;

    if selected_training_model = 'individual'
      and selected_group_days_per_week is not null then
      raise exception 'El modelo individual no utiliza dias semanales de grupo.';
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

  insert into public.user_roles (user_id, company_id, role_id, assigned_by)
  values (target_user_id, target_company_id, target_role_id, created_by_user_id);

  if member_role = 'customer' then
    insert into public.customer_training_contracts (
      customer_id,
      company_id,
      training_model,
      group_days_per_week,
      set_by
    )
    values (
      target_user_id,
      target_company_id,
      selected_training_model,
      case
        when selected_training_model = 'group' then selected_group_days_per_week
        else null
      end,
      created_by_user_id
    )
    on conflict (customer_id) do update
    set
      company_id = excluded.company_id,
      training_model = excluded.training_model,
      group_days_per_week = excluded.group_days_per_week,
      set_by = excluded.set_by;
  end if;
end;
$$;

revoke all on function private.can_read_customer_training_contract(uuid, uuid)
  from public;
grant execute on function private.can_read_customer_training_contract(uuid, uuid)
  to authenticated;

revoke all on function public.finalize_admin_created_member(
  uuid, uuid, text, uuid, uuid, text, smallint
) from public, anon, authenticated;
grant execute on function public.finalize_admin_created_member(
  uuid, uuid, text, uuid, uuid, text, smallint
) to service_role;

alter table public.customer_training_contracts enable row level security;
drop policy if exists "Permitted users can view customer training contracts"
  on public.customer_training_contracts;
create policy "Permitted users can view customer training contracts"
on public.customer_training_contracts for select
to authenticated
using ((select private.can_read_customer_training_contract(customer_id, company_id)));

revoke all on public.customer_training_contracts from anon, authenticated;
grant select on public.customer_training_contracts to authenticated;

commit;

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
