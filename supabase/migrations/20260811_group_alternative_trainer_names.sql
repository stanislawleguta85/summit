-- Alternativtermine fuer Kunden inklusive sicher aufgeloestem Trainernamen.
begin;

create or replace function public.get_booking_change_alternatives_v2(
  target_change_id uuid
)
returns table (
  session_id uuid,
  course_id uuid,
  trainer_id uuid,
  trainer_name text,
  start_at timestamptz,
  end_at timestamptz,
  title text,
  category text,
  level text,
  room text,
  available_places integer
)
language sql
security definer
set search_path = ''
as $$
  select
    alternative.session_id,
    alternative.course_id,
    alternative.trainer_id,
    coalesce(
      nullif(btrim(concat_ws(
        ' ', trainer_profile.first_name, trainer_profile.last_name
      )), ''),
      'Entrenador'
    ),
    alternative.start_at,
    alternative.end_at,
    alternative.title,
    alternative.category,
    alternative.level,
    alternative.room,
    alternative.available_places
  from public.get_booking_change_alternatives(target_change_id) alternative
  left join public.user_profiles trainer_profile
    on trainer_profile.user_id = alternative.trainer_id
  order by alternative.start_at;
$$;

revoke all on function public.get_booking_change_alternatives_v2(uuid)
  from public, anon;
grant execute on function public.get_booking_change_alternatives_v2(uuid)
  to authenticated;

commit;

select has_function_privilege(
  'authenticated',
  'public.get_booking_change_alternatives_v2(uuid)',
  'EXECUTE'
) as alternatives_include_trainer_name;
