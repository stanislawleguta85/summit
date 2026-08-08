-- Speichert alle Bereiche der Kundendetailseite atomar mit einer Aktion.
begin;

create or replace function public.update_complete_customer_configuration(
  target_customer_id uuid,
  selected_first_name text,
  selected_last_name text,
  selected_phone_number text,
  selected_assigned_trainer_id uuid,
  selected_training_model text,
  selected_group_days_per_week smallint,
  selected_et_level text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_assigned_trainer_id uuid;
begin
  select profile.assigned_trainer_id
  into current_assigned_trainer_id
  from public.user_profiles profile
  where profile.user_id = target_customer_id
    and profile.status = 'approved'
    and (select private.has_role(profile.user_id, profile.company_id, 'customer'));

  if not found then
    raise exception 'El cliente no existe o no esta aprobado.';
  end if;

  perform public.update_customer_master_data(
    target_customer_id,
    selected_first_name,
    selected_last_name,
    selected_phone_number
  );

  perform public.set_customer_training_contract(
    target_customer_id,
    selected_training_model,
    selected_group_days_per_week
  );

  if selected_et_level is not null then
    perform public.set_customer_category_level(
      target_customer_id,
      'ET',
      selected_et_level
    );
  end if;

  -- Zuletzt zuweisen, damit der bisherige Trainer seine anderen erlaubten Aenderungen
  -- noch innerhalb derselben Transaktion abschliessen kann.
  if current_assigned_trainer_id is distinct from selected_assigned_trainer_id then
    perform public.assign_customer_trainer(
      target_customer_id,
      selected_assigned_trainer_id
    );
  end if;
end;
$$;

revoke all on function public.update_complete_customer_configuration(
  uuid, text, text, text, uuid, text, smallint, text
) from public, anon;
grant execute on function public.update_complete_customer_configuration(
  uuid, text, text, text, uuid, text, smallint, text
) to authenticated;

commit;

select
  to_regprocedure(
    'public.update_complete_customer_configuration(uuid,text,text,text,uuid,text,smallint,text)'
  ) is not null
    as complete_customer_save_function_exists,
  has_function_privilege(
    'authenticated',
    'public.update_complete_customer_configuration(uuid,text,text,text,uuid,text,smallint,text)',
    'EXECUTE'
  ) as authenticated_can_save_permitted_complete_customer_configuration,
  not has_function_privilege(
    'anon',
    'public.update_complete_customer_configuration(uuid,text,text,text,uuid,text,smallint,text)',
    'EXECUTE'
  ) as anonymous_cannot_save_customer_configuration;
