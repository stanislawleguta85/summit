-- Datumsbezogene Belegung und Teilnehmerlisten fuer verwaltbare Gruppenkurse.
begin;

create or replace function public.get_manageable_group_course_occurrences()
returns table (
  session_id uuid,
  course_id uuid,
  trainer_id uuid,
  start_at timestamptz,
  end_at timestamptz,
  capacity integer,
  confirmed_count integer,
  waitlisted_count integer
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  actor_profile public.user_profiles%rowtype;
  company_timezone text;
  local_today date;
begin
  if actor_id is null then
    raise exception 'Debes iniciar sesion.';
  end if;

  select profile.*
  into actor_profile
  from public.user_profiles profile
  where profile.user_id = actor_id
    and profile.status = 'approved';

  if not found then
    raise exception 'Tu perfil no esta autorizado.';
  end if;

  if not (
    (select private.has_permission(
      actor_id, actor_profile.company_id, 'courses', 'assign_clients', 'all'
    ))
    or (select private.has_permission(
      actor_id, actor_profile.company_id, 'courses', 'assign_clients', 'assigned'
    ))
  ) then
    raise exception 'No tienes permiso para consultar la ocupacion de las clases.';
  end if;

  select company.timezone
  into company_timezone
  from public.companies company
  where company.id = actor_profile.company_id;

  local_today := (now() at time zone company_timezone)::date;

  perform private.ensure_group_course_sessions(
    actor_profile.company_id,
    local_today,
    local_today + 28
  );

  return query
  select
    session.id::uuid,
    course.id::uuid,
    session.trainer_id::uuid,
    session.start_at::timestamptz,
    session.end_at::timestamptz,
    session.capacity::integer,
    count(booking.id) filter (where booking.status = 'confirmed')::integer,
    count(booking.id) filter (where booking.status = 'waitlisted')::integer
  from public.course_sessions session
  join public.courses course on course.id = session.course_id
  left join public.bookings booking on booking.session_id = session.id
  where session.company_id = actor_profile.company_id
    and session.status = 'scheduled'
    and session.end_at >= now()
    and session.start_at < now() + interval '4 weeks'
    and course.format = 'group'
    and (
      (select private.has_permission(
        actor_id, course.company_id, 'courses', 'assign_clients', 'all'
      ))
      or (
        course.trainer_id = actor_id
        and (select private.has_permission(
          actor_id, course.company_id, 'courses', 'assign_clients', 'assigned'
        ))
      )
    )
  group by
    session.id,
    course.id,
    session.trainer_id,
    session.start_at,
    session.end_at,
    session.capacity
  order by session.start_at, course.id;
end;
$$;

create or replace function public.get_course_session_clients(target_session_id uuid)
returns table (
  booking_id uuid,
  user_id uuid,
  first_name text,
  last_name text,
  booking_status text,
  confirmed_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  session_record public.course_sessions%rowtype;
  course_record public.courses%rowtype;
begin
  if actor_id is null then
    raise exception 'Debes iniciar sesion.';
  end if;

  select session.*
  into session_record
  from public.course_sessions session
  where session.id = target_session_id
    and session.course_id is not null;

  if not found then
    raise exception 'La sesion no existe.';
  end if;

  select course.*
  into course_record
  from public.courses course
  where course.id = session_record.course_id
    and course.format = 'group';

  if not found then
    raise exception 'La sesion no pertenece a un curso de grupo.';
  end if;

  if not (
    (select private.has_permission(
      actor_id, course_record.company_id, 'courses', 'assign_clients', 'all'
    ))
    or (
      course_record.trainer_id = actor_id
      and (select private.has_permission(
        actor_id, course_record.company_id, 'courses', 'assign_clients', 'assigned'
      ))
    )
  ) then
    raise exception 'No tienes permiso para consultar los participantes de esta sesion.';
  end if;

  return query
  select
    booking.id::uuid,
    booking.user_id::uuid,
    profile.first_name::text,
    profile.last_name::text,
    booking.status::text,
    booking.confirmed_at::timestamptz
  from public.bookings booking
  join public.user_profiles profile on profile.user_id = booking.user_id
  where booking.session_id = session_record.id
    and booking.status in ('confirmed', 'waitlisted')
  order by profile.last_name nulls last, profile.first_name nulls last;
end;
$$;

revoke all on function public.get_manageable_group_course_occurrences()
  from public, anon;
revoke all on function public.get_course_session_clients(uuid)
  from public, anon;
grant execute on function public.get_manageable_group_course_occurrences()
  to authenticated;
grant execute on function public.get_course_session_clients(uuid)
  to authenticated;

commit;

select
  to_regprocedure('public.get_manageable_group_course_occurrences()') is not null
    as occurrence_function_exists,
  to_regprocedure('public.get_course_session_clients(uuid)') is not null
    as session_clients_function_exists,
  has_function_privilege(
    'authenticated',
    'public.get_manageable_group_course_occurrences()',
    'EXECUTE'
  ) as authenticated_can_read_occurrences,
  has_function_privilege(
    'authenticated',
    'public.get_course_session_clients(uuid)',
    'EXECUTE'
  ) as authenticated_can_read_session_clients,
  not has_function_privilege(
    'anon',
    'public.get_manageable_group_course_occurrences()',
    'EXECUTE'
  ) as anonymous_cannot_read_occurrences,
  not has_function_privilege(
    'anon',
    'public.get_course_session_clients(uuid)',
    'EXECUTE'
  ) as anonymous_cannot_read_session_clients;
