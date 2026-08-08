-- Nur lesen: prueft die beidseitige Synchronisierung einmaliger Gruppenkurse.

select
  to_regprocedure('private.sync_one_time_course_enrollment_from_booking()') is not null
    as one_time_bidirectional_sync_function_exists,
  exists (
    select 1
    from pg_trigger trigger_record
    where trigger_record.tgrelid = 'public.bookings'::regclass
      and trigger_record.tgname = 'bookings_sync_one_time_course_enrollment'
      and not trigger_record.tgisinternal
  ) as one_time_bidirectional_sync_trigger_exists,
  not exists (
    select 1
    from public.bookings booking
    join public.course_sessions session on session.id = booking.session_id
    join public.courses course on course.id = session.course_id
    where booking.status = 'confirmed'
      and course.format = 'group'
      and course.repetition = 'once'
      and not exists (
        select 1
        from public.course_enrollments enrollment
        where enrollment.course_id = course.id
          and enrollment.user_id = booking.user_id
          and enrollment.status = 'confirmed'
      )
  ) as every_confirmed_once_booking_has_active_enrollment,
  not exists (
    select 1
    from public.course_enrollments enrollment
    join public.courses course on course.id = enrollment.course_id
    where enrollment.status in ('confirmed', 'waitlisted')
      and course.format = 'group'
      and course.repetition = 'once'
      and not exists (
        select 1
        from public.course_sessions session
        join public.bookings booking on booking.session_id = session.id
        where session.course_id = course.id
          and booking.user_id = enrollment.user_id
          and booking.status = 'confirmed'
      )
      and exists (
        select 1
        from public.course_sessions session
        join public.bookings booking on booking.session_id = session.id
        where session.course_id = course.id
          and booking.user_id = enrollment.user_id
          and booking.status = 'cancelled'
      )
  ) as no_cancelled_only_once_enrollment_is_active;
