-- Korrigiert abweichende varchar/text-Spaltentypen in bestehenden Datenbanken.
begin;

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

revoke all on function public.get_customer_configuration(uuid)
  from public, anon;
grant execute on function public.get_customer_configuration(uuid)
  to authenticated;

commit;

select
  to_regprocedure('public.get_customer_configuration(uuid)') is not null
    and pg_get_functiondef(
      'public.get_customer_configuration(uuid)'::regprocedure
    ) like '%customer_profile.first_name::text%'
    and pg_get_functiondef(
      'public.get_customer_configuration(uuid)'::regprocedure
    ) like '%training_contract.group_days_per_week::smallint%'
    as customer_configuration_result_types_fixed;
