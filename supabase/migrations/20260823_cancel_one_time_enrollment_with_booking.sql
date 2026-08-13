-- Haelt bei einmaligen Gruppenkursen Buchung und Kurseinschreibung synchron.
begin;

create or replace function private.cancel_one_time_course_enrollment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'cancelled'
    and old.status is distinct from 'cancelled' then
    update public.course_enrollments enrollment
    set
      status = 'cancelled',
      removed_at = coalesce(enrollment.removed_at, now())
    from public.course_sessions session
    join public.courses course on course.id = session.course_id
    where session.id = new.session_id
      and course.format = 'group'
      and course.repetition = 'once'
      and enrollment.course_id = course.id
      and enrollment.user_id = new.user_id
      and enrollment.status in ('confirmed', 'waitlisted');
  end if;

  return new;
end;
$$;

revoke all on function private.cancel_one_time_course_enrollment() from public;

drop trigger if exists bookings_cancel_one_time_course_enrollment
  on public.bookings;
create trigger bookings_cancel_one_time_course_enrollment
after update of status on public.bookings
for each row
execute procedure private.cancel_one_time_course_enrollment();

-- Repariert bereits stornierte einmalige Termine, deren Einschreibung noch aktiv ist.
update public.course_enrollments enrollment
set
  status = 'cancelled',
  removed_at = coalesce(enrollment.removed_at, now())
from public.courses course
where enrollment.course_id = course.id
  and enrollment.status in ('confirmed', 'waitlisted')
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
  );

commit;

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
