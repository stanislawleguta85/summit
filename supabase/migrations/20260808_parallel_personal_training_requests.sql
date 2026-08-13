-- Normale PT-Anfragen und terminbezogene Aenderungsanfragen duerfen parallel offen sein.
begin;

drop index if exists public.personal_training_one_open_request_per_customer;
create unique index personal_training_one_open_request_per_customer
  on public.personal_training_requests(customer_id)
  where status in ('requested', 'proposed')
    and change_request_id is null;

create or replace function public.create_personal_training_request()
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  customer_profile public.user_profiles%rowtype;
  request_id uuid;
  customer_name text;
begin
  select profile.*
  into customer_profile
  from public.user_profiles profile
  where profile.user_id = (select auth.uid())
    and profile.status = 'approved'
    and (
      select private.has_permission(
        profile.user_id,
        profile.company_id,
        'training_requests',
        'create',
        'own'
      )
    )
  for update;

  if not found then
    raise exception 'No tienes permiso para solicitar un entrenamiento individual.';
  end if;

  if customer_profile.assigned_trainer_id is null then
    raise exception 'Todavia no tienes un entrenador asignado.';
  end if;

  if not exists (
    select 1
    from public.user_profiles trainer
    where trainer.user_id = customer_profile.assigned_trainer_id
      and trainer.company_id = customer_profile.company_id
      and trainer.status = 'approved'
      and (
        select private.has_permission(
          trainer.user_id,
          trainer.company_id,
          'training_requests',
          'respond',
          'assigned'
        )
      )
  ) then
    raise exception 'El entrenador asignado no esta disponible.';
  end if;

  if exists (
    select 1
    from public.personal_training_requests request
    where request.customer_id = customer_profile.user_id
      and request.status in ('requested', 'proposed')
      and request.change_request_id is null
  ) then
    raise exception 'Ya tienes una solicitud de entrenamiento individual abierta.';
  end if;

  insert into public.personal_training_requests (
    company_id,
    customer_id,
    trainer_id
  )
  values (
    customer_profile.company_id,
    customer_profile.user_id,
    customer_profile.assigned_trainer_id
  )
  returning id into request_id;

  customer_name := nullif(
    btrim(concat_ws(' ', customer_profile.first_name, customer_profile.last_name)),
    ''
  );

  insert into public.notifications (recipient_id, type, title, body, payload)
  values (
    customer_profile.assigned_trainer_id,
    'personal_training_requested',
    'Nueva solicitud de entrenamiento individual',
    coalesce(customer_name, 'Un cliente ha solicitado un entrenamiento individual.'),
    jsonb_build_object('request_id', request_id, 'customer_id', customer_profile.user_id)
  );

  return request_id;
end;
$$;

create or replace function public.request_booking_change(
  target_booking_id uuid,
  change_reason text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  booking_record public.bookings%rowtype;
  session_record public.course_sessions%rowtype;
  course_record public.courses%rowtype;
  created_change_id uuid;
  created_replacement_request_id uuid;
begin
  if actor_id is null then raise exception 'Debes iniciar sesion.'; end if;

  if char_length(btrim(coalesce(change_reason, ''))) not between 3 and 1000 then
    raise exception 'Indica el motivo del cambio.';
  end if;

  select booking.* into booking_record
  from public.bookings booking
  where booking.id = target_booking_id
    and booking.user_id = actor_id
    and booking.status = 'confirmed'
  for update;

  if not found then raise exception 'La reserva ya no se puede cambiar.'; end if;

  select session.* into session_record
  from public.course_sessions session
  where session.id = booking_record.session_id
    and session.status = 'scheduled'
  for update;

  if not found then raise exception 'El entrenamiento ya no esta programado.'; end if;

  if now() > session_record.start_at - interval '4 hours' then
    raise exception 'Los cambios requieren al menos 4 horas de antelacion.';
  end if;

  if not (
    select private.has_permission(
      actor_id, session_record.company_id, 'booking_changes', 'create', 'own'
    )
  ) then
    raise exception 'No tienes permiso para solicitar este cambio.';
  end if;

  if session_record.course_id is not null then
    select course.* into course_record
    from public.courses course
    where course.id = session_record.course_id
      and course.format = 'group';

    if not found then raise exception 'El curso original no es valido.'; end if;
  end if;

  insert into public.booking_change_requests (
    company_id,
    customer_id,
    change_kind,
    original_booking_id,
    original_session_id,
    original_course_id,
    original_trainer_id,
    original_start_at,
    original_end_at,
    original_category,
    original_level,
    reason,
    status,
    recovery_deadline
  )
  values (
    session_record.company_id,
    actor_id,
    case when session_record.course_id is null then 'personal' else 'group' end,
    booking_record.id,
    session_record.id,
    session_record.course_id,
    session_record.trainer_id,
    session_record.start_at,
    session_record.end_at,
    course_record.category,
    course_record.level,
    btrim(change_reason),
    case when session_record.course_id is null then 'pending' else 'lost' end,
    session_record.start_at + interval '4 weeks'
  )
  returning id into created_change_id;

  if session_record.course_id is null then
    insert into public.personal_training_requests (
      company_id,
      customer_id,
      trainer_id,
      status,
      change_request_id
    )
    values (
      session_record.company_id,
      actor_id,
      session_record.trainer_id,
      'requested',
      created_change_id
    )
    returning id into created_replacement_request_id;

    insert into public.notifications (recipient_id, type, title, body, payload)
    values (
      session_record.trainer_id,
      'personal_training_replacement_requested',
      'Solicitud de horario alternativo',
      'Un cliente solicita cambiar un entrenamiento existente. La cita original sigue reservada.',
      jsonb_build_object(
        'request_id', created_replacement_request_id,
        'change_request_id', created_change_id,
        'route', '/training-request/' || created_replacement_request_id::text
      )
    );
  else
    update public.bookings
    set status = 'cancelled', cancelled_at = now()
    where id = booking_record.id;
  end if;

  return created_change_id;
end;
$$;

revoke all on function public.create_personal_training_request() from public, anon;
revoke all on function public.request_booking_change(uuid, text) from public, anon;
grant execute on function public.create_personal_training_request() to authenticated;
grant execute on function public.request_booking_change(uuid, text) to authenticated;

commit;

select
  exists (
    select 1
    from pg_indexes
    where schemaname = 'public'
      and indexname = 'personal_training_one_open_request_per_customer'
      and indexdef ilike '%change_request_id IS NULL%'
  ) as ordinary_request_limit_is_separate,
  has_function_privilege(
    'authenticated',
    'public.request_booking_change(uuid,text)',
    'EXECUTE'
  ) as customer_can_request_change;
