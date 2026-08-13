-- Gemeinsame Kundenkonfiguration fuer Owner und zugewiesene Trainer.
begin;

insert into public.permissions (resource, action, name, description)
values (
  'clients',
  'update_profile',
  'Editar datos del cliente',
  'Modificar nombre, apellidos y telefono de un cliente autorizado.'
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
 and permission_record.action = 'update_profile'
join (values ('owner', 'all'), ('trainer', 'assigned')) as assignment(role_code, scope)
  on assignment.role_code = role_record.code
where role_record.company_id is null
on conflict (role_id, permission_id, scope) do nothing;

create or replace function public.get_customer_configuration(target_customer_id uuid)
returns table (
  user_id uuid,
  company_id uuid,
  first_name text,
  last_name text,
  email text,
  phone_number text,
  status text,
  assigned_trainer_id uuid,
  assigned_trainer_name text,
  training_model text,
  group_days_per_week smallint,
  et_level text,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  customer_profile public.user_profiles%rowtype;
begin
  select profile.*
  into customer_profile
  from public.user_profiles profile
  where profile.user_id = target_customer_id
    and profile.status = 'approved'
    and (select private.has_role(profile.user_id, profile.company_id, 'customer'));

  if not found then
    raise exception 'El cliente no existe o no esta aprobado.';
  end if;

  if not (
    (select private.has_permission(
      (select auth.uid()), customer_profile.company_id, 'clients', 'read', 'all'
    ))
    or (
      customer_profile.assigned_trainer_id = (select auth.uid())
      and (select private.has_permission(
        (select auth.uid()), customer_profile.company_id, 'clients', 'read', 'assigned'
      ))
    )
  ) then
    raise exception 'No tienes permiso para consultar este cliente.';
  end if;

  return query
  select
    customer_profile.user_id::uuid,
    customer_profile.company_id::uuid,
    customer_profile.first_name::text,
    customer_profile.last_name::text,
    auth_user.email::text,
    customer_profile.phone_number::text,
    customer_profile.status::text,
    customer_profile.assigned_trainer_id::uuid,
    nullif(btrim(concat_ws(' ', trainer.first_name, trainer.last_name)), '')::text,
    training_contract.training_model::text,
    training_contract.group_days_per_week::smallint,
    customer_level.level::text,
    customer_profile.created_at::timestamptz
  from auth.users auth_user
  left join public.user_profiles trainer
    on trainer.user_id = customer_profile.assigned_trainer_id
   and trainer.company_id = customer_profile.company_id
  left join public.customer_training_contracts training_contract
    on training_contract.customer_id = customer_profile.user_id
   and training_contract.company_id = customer_profile.company_id
  left join public.customer_category_levels customer_level
    on customer_level.customer_id = customer_profile.user_id
   and customer_level.company_id = customer_profile.company_id
   and customer_level.category = 'ET'
  where auth_user.id = customer_profile.user_id;
end;
$$;

create or replace function public.update_customer_master_data(
  target_customer_id uuid,
  selected_first_name text,
  selected_last_name text,
  selected_phone_number text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  customer_profile public.user_profiles%rowtype;
  normalized_first_name text := btrim(coalesce(selected_first_name, ''));
  normalized_last_name text := btrim(coalesce(selected_last_name, ''));
  normalized_phone text := nullif(btrim(coalesce(selected_phone_number, '')), '');
begin
  select profile.*
  into customer_profile
  from public.user_profiles profile
  where profile.user_id = target_customer_id
    and profile.status = 'approved'
    and (select private.has_role(profile.user_id, profile.company_id, 'customer'))
  for update;

  if not found then
    raise exception 'El cliente no existe o no esta aprobado.';
  end if;

  if not (
    (select private.has_permission(
      (select auth.uid()), customer_profile.company_id, 'clients', 'update_profile', 'all'
    ))
    or (
      customer_profile.assigned_trainer_id = (select auth.uid())
      and (select private.has_permission(
        (select auth.uid()), customer_profile.company_id, 'clients', 'update_profile', 'assigned'
      ))
    )
  ) then
    raise exception 'No tienes permiso para editar los datos de este cliente.';
  end if;

  if char_length(normalized_first_name) not between 2 and 80
    or char_length(normalized_last_name) not between 2 and 120 then
    raise exception 'Introduce un nombre y unos apellidos validos.';
  end if;

  if normalized_phone is not null and not (
    char_length(normalized_phone) between 7 and 30
    and normalized_phone ~ '^[+0-9][0-9[:space:]().-]*$'
    and char_length(regexp_replace(normalized_phone, '[^0-9]', '', 'g')) between 7 and 15
  ) then
    raise exception 'Introduce un numero de telefono valido.';
  end if;

  update public.user_profiles profile
  set
    first_name = normalized_first_name,
    last_name = normalized_last_name,
    phone_number = normalized_phone
  where profile.user_id = target_customer_id
    and profile.company_id = customer_profile.company_id;
end;
$$;

revoke all on function public.get_customer_configuration(uuid)
  from public, anon;
revoke all on function public.update_customer_master_data(uuid, text, text, text)
  from public, anon;
grant execute on function public.get_customer_configuration(uuid)
  to authenticated;
grant execute on function public.update_customer_master_data(uuid, text, text, text)
  to authenticated;

commit;

select
  to_regprocedure('public.get_customer_configuration(uuid)') is not null
    as customer_configuration_function_exists,
  to_regprocedure('public.update_customer_master_data(uuid,text,text,text)') is not null
    as customer_master_update_function_exists,
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
