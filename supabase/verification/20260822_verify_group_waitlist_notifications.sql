-- Nur lesen: prueft nachgeholte Gruppen-Wartelistenbenachrichtigungen.

select
  to_regprocedure('private.reconcile_group_change_waiters()') is not null
    as waitlist_reconciliation_function_exists,
  exists (
    select 1
    from public.notifications notification
    where notification.type = 'booking_change_slot_available'
      and notification.payload ? 'change_request_id'
      and notification.payload ? 'session_id'
      and notification.payload ? 'route'
  ) as group_slot_notification_with_route_exists,
  not exists (
    select 1
    from public.booking_change_requests change_request
    where change_request.change_kind = 'group'
      and change_request.status = 'lost'
      and change_request.waitlist_status = 'waiting'
      and now() <= change_request.recovery_deadline
      and exists (
        select 1
        from public.course_sessions session
        join public.courses course on course.id = session.course_id
        where session.company_id = change_request.company_id
          and session.status = 'scheduled'
          and session.id <> change_request.original_session_id
          and session.start_at >= now()
          and session.start_at <= change_request.recovery_deadline
          and session.end_at - session.start_at =
            change_request.original_end_at - change_request.original_start_at
          and course.format = 'group'
          and course.published
          and course.category is not distinct from change_request.original_category
          and course.level is not distinct from change_request.original_level
          and (
            select count(*)
            from public.bookings booking
            where booking.session_id = session.id
              and booking.status = 'confirmed'
          ) < session.capacity
      )
  ) as no_waiting_change_with_existing_free_slot;
