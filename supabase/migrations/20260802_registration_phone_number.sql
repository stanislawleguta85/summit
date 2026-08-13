-- Telefonnummer für neue Registrierungen.
begin;

alter table public.user_profiles add column if not exists phone_number text;
alter table public.user_profiles drop constraint if exists user_profiles_phone_number_check;
alter table public.user_profiles
  add constraint user_profiles_phone_number_check
  check (
    phone_number is null
    or (
      char_length(phone_number) between 7 and 30
      and phone_number ~ '^[+0-9][0-9[:space:]().-]*$'
      and char_length(regexp_replace(phone_number, '[^0-9]', '', 'g')) between 7 and 15
    )
  );

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  selected_company_id uuid;
  signup_phone_number text;
begin
  selected_company_id := (new.raw_user_meta_data ->> 'company_id')::uuid;
  signup_phone_number := nullif(btrim(new.raw_user_meta_data ->> 'phone_number'), '');

  if not exists (
    select 1 from public.companies where id = selected_company_id
  ) then
    raise exception 'Eine gültige Filiale ist für die Registrierung erforderlich.';
  end if;

  if signup_phone_number is null
    or char_length(signup_phone_number) not between 7 and 30
    or signup_phone_number !~ '^[+0-9][0-9[:space:]().-]*$'
    or char_length(regexp_replace(signup_phone_number, '[^0-9]', '', 'g')) not between 7 and 15 then
    raise exception 'Eine gültige Telefonnummer ist für die Registrierung erforderlich.';
  end if;

  insert into public.user_profiles (
    user_id,
    company_id,
    first_name,
    last_name,
    phone_number,
    role,
    status
  )
  values (
    new.id,
    selected_company_id,
    nullif(btrim(new.raw_user_meta_data ->> 'first_name'), ''),
    nullif(btrim(new.raw_user_meta_data ->> 'last_name'), ''),
    signup_phone_number,
    'customer',
    'pending'
  )
  on conflict (user_id) do nothing;

  return new;
end;
$$;

revoke all on function public.handle_new_user() from public;
revoke all on function public.handle_new_user() from anon;
revoke all on function public.handle_new_user() from authenticated;

commit;
