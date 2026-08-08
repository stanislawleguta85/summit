begin;

create or replace function public.update_own_master_data(
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
  actor_id uuid := (select auth.uid());
  normalized_first_name text := btrim(coalesce(selected_first_name, ''));
  normalized_last_name text := btrim(coalesce(selected_last_name, ''));
  normalized_phone text := nullif(btrim(coalesce(selected_phone_number, '')), '');
begin
  if actor_id is null then
    raise exception 'Debes iniciar sesion.';
  end if;

  if not exists (
    select 1
    from public.user_profiles profile
    where profile.user_id = actor_id
      and profile.status = 'approved'
  ) then
    raise exception 'Tu perfil no esta autorizado.';
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

  update public.user_profiles
  set
    first_name = normalized_first_name,
    last_name = normalized_last_name,
    phone_number = normalized_phone
  where user_id = actor_id;
end;
$$;

revoke all on function public.update_own_master_data(text, text, text)
  from public, anon;
grant execute on function public.update_own_master_data(text, text, text)
  to authenticated;

commit;

select
  to_regprocedure('public.update_own_master_data(text,text,text)') is not null
    as own_master_data_function_exists,
  has_function_privilege(
    'authenticated',
    'public.update_own_master_data(text,text,text)',
    'EXECUTE'
  ) as authenticated_can_update_own_master_data,
  not has_function_privilege(
    'anon',
    'public.update_own_master_data(text,text,text)',
    'EXECUTE'
  ) as anonymous_cannot_update_master_data;
