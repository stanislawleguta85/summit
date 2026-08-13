-- Nur lesen: prueft die Synchronisierung einmaliger Gruppenkurse.

select
  to_regprocedure('private.cancel_one_time_course_enrollment()') is not null
    as one_time_enrollment_sync_function_exists,
  exists (
    select 1
    from pg_trigger trigger_record
    where trigger_record.tgrelid = 'public.bookings'::regclass
      and trigger_record.tgname = 'bookings_cancel_one_time_course_enrollment'
      and not trigger_record.tgisinternal
  ) as one_time_enrollment_sync_trigger_exists,
  not exists (
    select 1
    from public.course_enrollments enrollment
    join public.courses course on course.id = enrollment.course_id
    where enrollment.status in ('confirmed', 'waitlisted')
      and course.format = 'group'
      and course.repetition = 'once'
      and exists (
        select 1
        from public.course_sessions session
        join public.bookings booking on booking.session_id = session.id
        where session.course_id = course.id
          and booking.user_id = enrollment.user_id
          and booking.status = 'cancelled'
      )
      and not exists (
        select 1
        from public.course_sessions session
        join public.bookings booking on booking.session_id = session.id
        where session.course_id = course.id
          and booking.user_id = enrollment.user_id
          and booking.status = 'confirmed'
      )
  ) as no_cancelled_once_booking_with_active_enrollment;
