-- Customer names for filtering manageable group course cards.
begin;

create or replace function public.get_manageable_group_course_customer_matches()
returns table (
  course_id uuid,
  session_id uuid,
  customer_id uuid,
  customer_name text,
  start_at timestamptz
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
    raise exception 'No tienes permiso para consultar los clientes de las clases.';
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
    course.id::uuid,
    session.id::uuid,
    booking.user_id::uuid,
    nullif(btrim(concat_ws(' ', customer.first_name, customer.last_name)), '')::text,
    session.start_at::timestamptz
  from public.course_sessions session
  join public.courses course on course.id = session.course_id
  join public.bookings booking
    on booking.session_id = session.id
   and booking.status = 'confirmed'
  join public.user_profiles customer on customer.user_id = booking.user_id
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
  order by session.start_at, course.id, customer.last_name, customer.first_name;
end;
$$;

revoke all on function public.get_manageable_group_course_customer_matches()
  from public, anon;
grant execute on function public.get_manageable_group_course_customer_matches()
  to authenticated;

commit;

select
  to_regprocedure('public.get_manageable_group_course_customer_matches()') is not null
    as group_customer_search_function_exists,
  has_function_privilege(
    'authenticated',
    'public.get_manageable_group_course_customer_matches()',
    'EXECUTE'
  ) as authenticated_can_search_group_customers,
  not has_function_privilege(
    'anon',
    'public.get_manageable_group_course_customer_matches()',
    'EXECUTE'
  ) as anonymous_cannot_search_group_customers;
