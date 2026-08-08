-- Gruppenersatztermine duerfen auch vor dem Originaltermin liegen, solange sie noch bevorstehen.
begin;

create or replace function private.notify_group_change_waiters(freed_session_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  freed_session public.course_sessions%rowtype;
  freed_course public.courses%rowtype;
begin
  select session.* into freed_session
  from public.course_sessions session
  where session.id = freed_session_id
    and session.course_id is not null
    and session.status = 'scheduled';

  if not found then return; end if;

  select course.* into freed_course
  from public.courses course
  where course.id = freed_session.course_id;

  insert into public.notifications (recipient_id, type, title, body, payload)
  select
    change_request.customer_id,
    'booking_change_slot_available',
    'Hay una plaza disponible',
    format('Se ha liberado una plaza para %s.', coalesce(freed_course.title, 'tu curso')),
    jsonb_build_object(
      'change_request_id', change_request.id,
      'session_id', freed_session.id,
      'route', '/booking-change/' || change_request.id::text
    )
  from public.booking_change_requests change_request
  where change_request.company_id = freed_session.company_id
    and change_request.change_kind = 'group'
    and change_request.status = 'lost'
    and change_request.waitlist_status = 'waiting'
    and now() <= change_request.recovery_deadline
    and freed_session.start_at >= now()
    and freed_session.start_at <= change_request.recovery_deadline
    and freed_session.end_at - freed_session.start_at =
      change_request.original_end_at - change_request.original_start_at
    and change_request.original_category is not distinct from freed_course.category
    and change_request.original_level is not distinct from freed_course.level
    and not exists (
      select 1
      from public.bookings existing_booking
      where existing_booking.session_id = freed_session.id
        and existing_booking.user_id = change_request.customer_id
        and existing_booking.status = 'confirmed'
    );

  update public.booking_change_requests change_request
  set
    waitlist_status = 'notified',
    notified_session_id = freed_session.id,
    notified_at = now()
  where change_request.company_id = freed_session.company_id
    and change_request.change_kind = 'group'
    and change_request.status = 'lost'
    and change_request.waitlist_status = 'waiting'
    and now() <= change_request.recovery_deadline
    and freed_session.start_at >= now()
    and freed_session.start_at <= change_request.recovery_deadline
    and freed_session.end_at - freed_session.start_at =
      change_request.original_end_at - change_request.original_start_at
    and change_request.original_category is not distinct from freed_course.category
    and change_request.original_level is not distinct from freed_course.level
    and not exists (
      select 1
      from public.bookings existing_booking
      where existing_booking.session_id = freed_session.id
        and existing_booking.user_id = change_request.customer_id
        and existing_booking.status = 'confirmed'
    );
end;
$$;

create or replace function public.get_booking_change_alternatives(target_change_id uuid)
returns table (
  session_id uuid,
  course_id uuid,
  trainer_id uuid,
  start_at timestamptz,
  end_at timestamptz,
  title text,
  category text,
  level text,
  room text,
  available_places integer
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  change_record public.booking_change_requests%rowtype;
  change_timezone text;
begin
  select change_request.* into change_record
  from public.booking_change_requests change_request
  where change_request.id = target_change_id
    and change_request.customer_id = actor_id
    and change_request.change_kind = 'group'
    and change_request.status = 'lost';

  if not found then raise exception 'La solicitud de cambio no esta disponible.'; end if;

  select company.timezone into change_timezone
  from public.companies company
  where company.id = change_record.company_id;

  perform private.ensure_group_course_sessions(
    change_record.company_id,
    (least(change_record.original_start_at, now()) at time zone change_timezone)::date,
    (change_record.recovery_deadline at time zone change_timezone)::date
  );

  return query
  select
    session.id::uuid,
    course.id::uuid,
    session.trainer_id::uuid,
    session.start_at::timestamptz,
    session.end_at::timestamptz,
    course.title::text,
    course.category::text,
    course.level::text,
    session.room::text,
    greatest(
      session.capacity - (
        select count(*)::integer
        from public.bookings booking
        where booking.session_id = session.id
          and booking.status = 'confirmed'
      ),
      0
    )::integer
  from public.course_sessions session
  join public.courses course on course.id = session.course_id
  where session.company_id = change_record.company_id
    and session.status = 'scheduled'
    and session.id <> change_record.original_session_id
    and session.start_at >= now()
    and session.start_at <= change_record.recovery_deadline
    and session.end_at - session.start_at =
      change_record.original_end_at - change_record.original_start_at
    and course.format = 'group'
    and course.published
    and course.category is not distinct from change_record.original_category
    and course.level is not distinct from change_record.original_level
    and (
      select count(*)
      from public.bookings booking
      where booking.session_id = session.id
        and booking.status = 'confirmed'
    ) < session.capacity
    and not exists (
      select 1
      from public.bookings own_booking
      where own_booking.session_id = session.id
        and own_booking.user_id = actor_id
        and own_booking.status = 'confirmed'
    )
  order by session.start_at;
end;
$$;

create or replace function public.recover_group_booking(
  target_change_id uuid,
  target_session_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  change_record public.booking_change_requests%rowtype;
  target_session public.course_sessions%rowtype;
  target_course public.courses%rowtype;
  confirmed_count integer;
  created_booking_id uuid;
begin
  select change_request.* into change_record
  from public.booking_change_requests change_request
  where change_request.id = target_change_id
    and change_request.customer_id = actor_id
    and change_request.change_kind = 'group'
    and change_request.status = 'lost'
  for update;

  if not found then raise exception 'La solicitud de cambio ya no esta disponible.'; end if;
  if now() > change_record.recovery_deadline then
    raise exception 'El plazo de cuatro semanas ha finalizado.';
  end if;

  select session.* into target_session
  from public.course_sessions session
  where session.id = target_session_id
    and session.company_id = change_record.company_id
    and session.status = 'scheduled'
    and session.start_at >= now()
    and session.start_at <= change_record.recovery_deadline
    and session.end_at - session.start_at =
      change_record.original_end_at - change_record.original_start_at
  for update;

  if not found then raise exception 'El horario ya no esta disponible.'; end if;

  select course.* into target_course
  from public.courses course
  where course.id = target_session.course_id
    and course.format = 'group'
    and course.published
    and course.category is not distinct from change_record.original_category
    and course.level is not distinct from change_record.original_level;

  if not found then raise exception 'El curso no es compatible con el cambio.'; end if;

  select count(*) into confirmed_count
  from public.bookings booking
  where booking.session_id = target_session.id
    and booking.status = 'confirmed';

  if confirmed_count >= target_session.capacity then
    raise exception 'El horario ya no tiene plazas disponibles.';
  end if;

  insert into public.bookings (session_id, user_id, status, confirmed_at, cancelled_at)
  values (target_session.id, actor_id, 'confirmed', now(), null)
  on conflict (session_id, user_id) do update
  set status = 'confirmed', confirmed_at = now(), cancelled_at = null
  returning id into created_booking_id;

  update public.booking_change_requests
  set
    status = 'recovered',
    recovered_booking_id = created_booking_id,
    recovered_session_id = target_session.id,
    recovered_at = now(),
    waitlist_status = 'none',
    notified_session_id = null,
    notified_at = null
  where id = change_record.id;

  return created_booking_id;
end;
$$;

create or replace function public.join_booking_change_waitlist(target_change_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  change_record public.booking_change_requests%rowtype;
  change_timezone text;
begin
  select change_request.* into change_record
  from public.booking_change_requests change_request
  where change_request.id = target_change_id
    and change_request.customer_id = actor_id
    and change_request.change_kind = 'group'
    and change_request.status = 'lost'
  for update;

  if not found then raise exception 'La solicitud de cambio ya no esta disponible.'; end if;
  if now() > change_record.recovery_deadline then
    raise exception 'El plazo de cuatro semanas ha finalizado.';
  end if;

  select company.timezone into change_timezone
  from public.companies company
  where company.id = change_record.company_id;

  perform private.ensure_group_course_sessions(
    change_record.company_id,
    (least(change_record.original_start_at, now()) at time zone change_timezone)::date,
    (change_record.recovery_deadline at time zone change_timezone)::date
  );

  if exists (
    select 1
    from public.course_sessions session
    join public.courses course on course.id = session.course_id
    where session.company_id = change_record.company_id
      and session.status = 'scheduled'
      and session.id <> change_record.original_session_id
      and session.start_at >= now()
      and session.start_at <= change_record.recovery_deadline
      and session.end_at - session.start_at =
        change_record.original_end_at - change_record.original_start_at
      and course.format = 'group'
      and course.published
      and course.category is not distinct from change_record.original_category
      and course.level is not distinct from change_record.original_level
      and (
        select count(*)
        from public.bookings booking
        where booking.session_id = session.id
          and booking.status = 'confirmed'
      ) < session.capacity
  ) then
    raise exception 'Ya hay un horario alternativo disponible.';
  end if;

  update public.booking_change_requests
  set waitlist_status = 'waiting', notified_session_id = null, notified_at = null
  where id = change_record.id;
end;
$$;

revoke all on function private.notify_group_change_waiters(uuid) from public;
revoke all on function public.get_booking_change_alternatives(uuid) from public, anon;
revoke all on function public.recover_group_booking(uuid, uuid) from public, anon;
revoke all on function public.join_booking_change_waitlist(uuid) from public, anon;
grant execute on function public.get_booking_change_alternatives(uuid) to authenticated;
grant execute on function public.recover_group_booking(uuid, uuid) to authenticated;
grant execute on function public.join_booking_change_waitlist(uuid) to authenticated;

commit;

select
  pg_get_functiondef(
    'public.get_booking_change_alternatives(uuid)'::regprocedure
  ) like '%session.start_at >= now()%'
    as alternatives_start_from_now,
  pg_get_functiondef(
    'public.recover_group_booking(uuid,uuid)'::regprocedure
  ) like '%session.start_at >= now()%'
    as recovery_accepts_slots_before_original,
  pg_get_functiondef(
    'public.join_booking_change_waitlist(uuid)'::regprocedure
  ) like '%session.start_at >= now()%'
    as waitlist_checks_slots_from_now,
  pg_get_functiondef(
    'private.notify_group_change_waiters(uuid)'::regprocedure
  ) not like '%between change_request.original_start_at%'
    as freed_slot_notifications_start_from_now;
