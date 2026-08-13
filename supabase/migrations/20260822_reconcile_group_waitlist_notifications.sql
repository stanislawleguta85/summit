-- Holt Benachrichtigungen fuer bereits wartende Gruppenwechsel mit freiem Platz nach.
begin;

create or replace function private.reconcile_group_change_waiters()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  change_record public.booking_change_requests%rowtype;
  change_timezone text;
  available_session_id public.course_sessions.id%type;
  available_course_title public.courses.title%type;
  reconciled_count integer := 0;
begin
  for change_record in
    select change_request.*
    from public.booking_change_requests change_request
    where change_request.change_kind = 'group'
      and change_request.status = 'lost'
      and change_request.waitlist_status = 'waiting'
      and now() <= change_request.recovery_deadline
    order by change_request.created_at
  loop
    select company.timezone
    into change_timezone
    from public.companies company
    where company.id = change_record.company_id;

    perform private.ensure_group_course_sessions(
      change_record.company_id,
      (least(change_record.original_start_at, now()) at time zone change_timezone)::date,
      (change_record.recovery_deadline at time zone change_timezone)::date
    );

    select session.id, course.title
    into available_session_id, available_course_title
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
          and own_booking.user_id = change_record.customer_id
          and own_booking.status = 'confirmed'
      )
    order by session.start_at
    limit 1;

    if found then
      insert into public.notifications (recipient_id, type, title, body, payload)
      select
        change_record.customer_id,
        'booking_change_slot_available',
        'Hay una plaza disponible',
        format('Se ha liberado una plaza para %s.', coalesce(available_course_title, 'tu curso')),
        jsonb_build_object(
          'change_request_id', change_record.id,
          'session_id', available_session_id,
          'route', '/booking-change/' || change_record.id::text
        )
      where not exists (
        select 1
        from public.notifications notification
        where notification.recipient_id = change_record.customer_id
          and notification.type = 'booking_change_slot_available'
          and notification.payload ->> 'change_request_id' = change_record.id::text
          and notification.payload ->> 'session_id' = available_session_id::text
      );

      update public.booking_change_requests
      set
        waitlist_status = 'notified',
        notified_session_id = available_session_id,
        notified_at = now()
      where id = change_record.id;

      reconciled_count := reconciled_count + 1;
    end if;
  end loop;

  return reconciled_count;
end;
$$;

revoke all on function private.reconcile_group_change_waiters() from public;

select private.reconcile_group_change_waiters();

commit;

select
  to_regprocedure('private.reconcile_group_change_waiters()') is not null
    as waitlist_reconciliation_function_exists,
  exists (
    select 1
    from public.notifications notification
    where notification.type = 'booking_change_slot_available'
      and notification.payload ? 'change_request_id'
      and notification.payload ? 'route'
  ) as group_slot_notification_with_route_exists;
