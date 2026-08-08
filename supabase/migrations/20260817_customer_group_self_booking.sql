-- Kunden buchen Gruppenkurse selbst; das vertragliche Wochenkontingent wird serverseitig erzwungen.
begin;

create or replace function private.assert_customer_group_weekly_quota(
  target_customer_id uuid,
  target_course_id uuid,
  excluded_enrollment_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  contract_company_id uuid;
  contract_model text;
  weekly_limit integer;
  company_timezone text;
  target_course public.courses%rowtype;
  recurring_units integer := 0;
  one_time_units integer := 0;
  candidate_units integer := 0;
  target_week_start date;
  current_week_start date;
begin
  select
    training_contract.company_id,
    training_contract.training_model,
    training_contract.group_days_per_week,
    company.timezone
  into
    contract_company_id,
    contract_model,
    weekly_limit,
    company_timezone
  from public.customer_training_contracts training_contract
  join public.companies company on company.id = training_contract.company_id
  where training_contract.customer_id = target_customer_id
  for update of training_contract;

  if contract_company_id is null then
    raise exception 'El cliente no tiene un contrato de entrenamiento configurado.';
  end if;

  if contract_model <> 'group' or weekly_limit is null then
    raise exception 'El contrato del cliente no incluye cursos de grupo.';
  end if;

  select course.*
  into target_course
  from public.courses course
  where course.id = target_course_id
    and course.company_id = contract_company_id
    and course.format = 'group';

  if not found then
    raise exception 'El curso de grupo no existe en la sede del cliente.';
  end if;

  select coalesce(sum(cardinality(course.weekdays)), 0)::integer
  into recurring_units
  from public.course_enrollments enrollment
  join public.courses course on course.id = enrollment.course_id
  where enrollment.user_id = target_customer_id
    and enrollment.status = 'confirmed'
    and enrollment.id is distinct from excluded_enrollment_id
    and course.company_id = contract_company_id
    and course.format = 'group'
    and course.repetition = 'weekly';

  if target_course.repetition = 'once' then
    if target_course.start_date is null then
      raise exception 'El curso no tiene una fecha valida.';
    end if;

    target_week_start := date_trunc(
      'week',
      target_course.start_date at time zone company_timezone
    )::date;

    select count(*)::integer
    into one_time_units
    from public.course_enrollments enrollment
    join public.courses course on course.id = enrollment.course_id
    where enrollment.user_id = target_customer_id
      and enrollment.status = 'confirmed'
      and enrollment.id is distinct from excluded_enrollment_id
      and course.company_id = contract_company_id
      and course.format = 'group'
      and course.repetition = 'once'
      and (course.start_date at time zone company_timezone)::date >= target_week_start
      and (course.start_date at time zone company_timezone)::date < target_week_start + 7;

    candidate_units := recurring_units + one_time_units + 1;
  elsif target_course.repetition = 'weekly' then
    candidate_units := recurring_units + cardinality(target_course.weekdays);

    if candidate_units <= weekly_limit then
      current_week_start := date_trunc(
        'week',
        now() at time zone company_timezone
      )::date;

      select coalesce(max(weekly_once.units), 0)::integer
      into one_time_units
      from (
        select count(*)::integer as units
        from public.course_enrollments enrollment
        join public.courses course on course.id = enrollment.course_id
        where enrollment.user_id = target_customer_id
          and enrollment.status = 'confirmed'
          and enrollment.id is distinct from excluded_enrollment_id
          and course.company_id = contract_company_id
          and course.format = 'group'
          and course.repetition = 'once'
          and (course.start_date at time zone company_timezone)::date >= current_week_start
        group by date_trunc('week', course.start_date at time zone company_timezone)
      ) weekly_once;

      candidate_units := candidate_units + one_time_units;
    end if;
  else
    raise exception 'La repeticion del curso no es valida.';
  end if;

  if candidate_units > weekly_limit then
    raise exception
      'Tu contrato permite un maximo de % entrenamientos de grupo por semana.',
      weekly_limit;
  end if;
end;
$$;

create or replace function private.enforce_customer_group_weekly_quota()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'confirmed' then
    perform private.assert_customer_group_weekly_quota(
      new.user_id,
      new.course_id,
      new.id
    );
  end if;
  return new;
end;
$$;

drop trigger if exists course_enrollments_enforce_group_weekly_quota
  on public.course_enrollments;
create trigger course_enrollments_enforce_group_weekly_quota
before insert or update of course_id, user_id, status
on public.course_enrollments
for each row execute procedure private.enforce_customer_group_weekly_quota();

create or replace function public.set_customer_training_contract(
  target_customer_id uuid,
  selected_training_model text,
  selected_group_days_per_week smallint
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  customer_profile public.user_profiles%rowtype;
  previous_model text;
  company_timezone text;
  recurring_units integer := 0;
  maximum_once_units integer := 0;
  maximum_weekly_usage integer := 0;
  current_week_start date;
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
      (select auth.uid()), customer_profile.company_id, 'clients', 'set_contract', 'all'
    ))
    or (
      customer_profile.assigned_trainer_id = (select auth.uid())
      and (select private.has_permission(
        (select auth.uid()), customer_profile.company_id, 'clients', 'set_contract', 'assigned'
      ))
    )
  ) then
    raise exception 'No tienes permiso para cambiar el contrato de este cliente.';
  end if;

  if selected_training_model not in ('group', 'individual') then
    raise exception 'Selecciona el modelo de entrenamiento.';
  end if;

  if selected_training_model = 'group'
    and (selected_group_days_per_week is null
      or selected_group_days_per_week not between 1 and 7) then
    raise exception 'Los dias semanales del grupo deben estar entre 1 y 7.';
  end if;

  if selected_training_model = 'individual' and selected_group_days_per_week is not null then
    raise exception 'El modelo individual no utiliza dias semanales de grupo.';
  end if;

  select training_contract.training_model
  into previous_model
  from public.customer_training_contracts training_contract
  where training_contract.customer_id = target_customer_id;

  if previous_model is not null and previous_model <> selected_training_model then
    raise exception 'El cambio entre modelos de contrato aun requiere una decision administrativa.';
  end if;

  if selected_training_model = 'individual' and exists (
    select 1
    from public.course_enrollments enrollment
    join public.courses course on course.id = enrollment.course_id
    where enrollment.user_id = target_customer_id
      and enrollment.status in ('confirmed', 'waitlisted')
      and course.company_id = customer_profile.company_id
      and course.format = 'group'
  ) then
    raise exception 'El cliente ya tiene inscripciones de grupo activas.';
  end if;

  if selected_training_model = 'group' then
    select company.timezone
    into company_timezone
    from public.companies company
    where company.id = customer_profile.company_id;

    current_week_start := date_trunc(
      'week',
      now() at time zone company_timezone
    )::date;

    select coalesce(sum(cardinality(course.weekdays)), 0)::integer
    into recurring_units
    from public.course_enrollments enrollment
    join public.courses course on course.id = enrollment.course_id
    where enrollment.user_id = target_customer_id
      and enrollment.status = 'confirmed'
      and course.company_id = customer_profile.company_id
      and course.format = 'group'
      and course.repetition = 'weekly';

    select coalesce(max(weekly_once.units), 0)::integer
    into maximum_once_units
    from (
      select count(*)::integer as units
      from public.course_enrollments enrollment
      join public.courses course on course.id = enrollment.course_id
      where enrollment.user_id = target_customer_id
        and enrollment.status = 'confirmed'
        and course.company_id = customer_profile.company_id
        and course.format = 'group'
        and course.repetition = 'once'
        and (course.start_date at time zone company_timezone)::date >= current_week_start
      group by date_trunc('week', course.start_date at time zone company_timezone)
    ) weekly_once;

    maximum_weekly_usage := recurring_units + maximum_once_units;
    if maximum_weekly_usage > selected_group_days_per_week then
      raise exception
        'El cliente ya tiene % entrenamientos en una semana. No se puede reducir el limite a %.',
        maximum_weekly_usage,
        selected_group_days_per_week;
    end if;
  end if;

  insert into public.customer_training_contracts (
    customer_id,
    company_id,
    training_model,
    group_days_per_week,
    set_by
  )
  values (
    target_customer_id,
    customer_profile.company_id,
    selected_training_model,
    case when selected_training_model = 'group' then selected_group_days_per_week else null end,
    (select auth.uid())
  )
  on conflict (customer_id) do update
  set
    company_id = excluded.company_id,
    training_model = excluded.training_model,
    group_days_per_week = excluded.group_days_per_week,
    set_by = excluded.set_by;
end;
$$;

create or replace function public.book_own_group_course(target_course_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  actor_company_id uuid;
  target_course public.courses%rowtype;
  existing_status text;
  confirmed_count integer;
  next_status text;
  weekly_limit integer;
begin
  if actor_id is null then
    raise exception 'Debes iniciar sesion.';
  end if;

  select profile.company_id
  into actor_company_id
  from public.user_profiles profile
  where profile.user_id = actor_id
    and profile.status = 'approved'
    and (select private.has_role(profile.user_id, profile.company_id, 'customer'))
    and (select private.has_permission(
      profile.user_id,
      profile.company_id,
      'bookings',
      'create',
      'own'
    ));

  if actor_company_id is null then
    raise exception 'No tienes permiso para reservar cursos.';
  end if;

  select course.*
  into target_course
  from public.courses course
  where course.id = target_course_id
    and course.company_id = actor_company_id
    and course.format = 'group'
    and course.published
  for update;

  if not found then
    raise exception 'El curso no existe o no esta disponible.';
  end if;

  if target_course.level is not null and not exists (
    select 1
    from public.customer_category_levels customer_level
    where customer_level.customer_id = actor_id
      and customer_level.company_id = actor_company_id
      and customer_level.category = upper(btrim(target_course.category))
      and customer_level.level = target_course.level
  ) then
    raise exception 'Este curso no esta disponible para tu perfil.';
  end if;

  if target_course.repetition = 'once'
    and (target_course.start_date is null or target_course.start_date <= now()) then
    raise exception 'Este curso ya no se puede reservar.';
  end if;

  select enrollment.status
  into existing_status
  from public.course_enrollments enrollment
  where enrollment.course_id = target_course.id
    and enrollment.user_id = actor_id;

  select training_contract.group_days_per_week
  into weekly_limit
  from public.customer_training_contracts training_contract
  where training_contract.customer_id = actor_id
    and training_contract.company_id = actor_company_id
    and training_contract.training_model = 'group';

  if weekly_limit is null then
    raise exception 'Tu contrato no incluye cursos de grupo.';
  end if;

  if existing_status = 'confirmed' then
    return jsonb_build_object(
      'status', 'confirmed',
      'weekly_limit', weekly_limit,
      'already_enrolled', true
    );
  end if;

  select count(*)::integer
  into confirmed_count
  from public.course_enrollments enrollment
  where enrollment.course_id = target_course.id
    and enrollment.status = 'confirmed';

  if confirmed_count < coalesce(target_course.max_participants, 2147483647) then
    next_status := 'confirmed';
  elsif target_course.waitlist_enabled then
    next_status := 'waitlisted';
  else
    raise exception 'El curso esta completo y no tiene lista de espera.';
  end if;

  insert into public.course_enrollments (
    course_id,
    user_id,
    status,
    source,
    assigned_by,
    enrolled_at,
    removed_at
  )
  values (
    target_course.id,
    actor_id,
    next_status,
    'customer',
    actor_id,
    now(),
    null
  )
  on conflict (course_id, user_id) do update
  set
    status = excluded.status,
    source = excluded.source,
    assigned_by = excluded.assigned_by,
    enrolled_at = excluded.enrolled_at,
    removed_at = null;

  return jsonb_build_object(
    'status', next_status,
    'weekly_limit', weekly_limit,
    'already_enrolled', false
  );
end;
$$;

revoke all on function private.assert_customer_group_weekly_quota(uuid, uuid, uuid)
  from public;
revoke all on function private.enforce_customer_group_weekly_quota()
  from public;
revoke all on function public.book_own_group_course(uuid)
  from public, anon;
revoke all on function public.set_customer_training_contract(uuid, text, smallint)
  from public, anon;
grant execute on function public.book_own_group_course(uuid)
  to authenticated;
grant execute on function public.set_customer_training_contract(uuid, text, smallint)
  to authenticated;

commit;

select
  to_regprocedure('public.book_own_group_course(uuid)') is not null
    as self_booking_function_exists,
  has_function_privilege(
    'authenticated',
    'public.book_own_group_course(uuid)',
    'EXECUTE'
  ) as authenticated_can_book_own_group_course,
  to_regprocedure('private.assert_customer_group_weekly_quota(uuid,uuid,uuid)') is not null
    as weekly_quota_function_exists,
  to_regprocedure('public.set_customer_training_contract(uuid,text,smallint)') is not null
    as contract_update_function_exists,
  exists (
    select 1
    from pg_trigger trigger_record
    where trigger_record.tgrelid = 'public.course_enrollments'::regclass
      and trigger_record.tgname = 'course_enrollments_enforce_group_weekly_quota'
      and not trigger_record.tgisinternal
  ) as weekly_quota_trigger_exists;
