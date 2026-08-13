-- Synchronisiert bei einmaligen Gruppenkursen Buchungen und Kurseinschreibungen in beide Richtungen.
begin;

drop trigger if exists bookings_cancel_one_time_course_enrollment
  on public.bookings;
drop function if exists private.cancel_one_time_course_enrollment();

create or replace function private.sync_one_time_course_enrollment_from_booking()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_course public.courses%rowtype;
begin
  select course.*
  into target_course
  from public.course_sessions session
  join public.courses course on course.id = session.course_id
  where session.id = new.session_id
    and course.format = 'group'
    and course.repetition = 'once';

  if not found then
    return new;
  end if;

  if new.status = 'confirmed' then
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
      new.user_id,
      'confirmed',
      'customer',
      new.user_id,
      coalesce(new.confirmed_at, now()),
      null
    )
    on conflict (course_id, user_id) do update
    set
      status = 'confirmed',
      enrolled_at = excluded.enrolled_at,
      removed_at = null;
  elsif new.status = 'cancelled' then
    update public.course_enrollments enrollment
    set
      status = 'cancelled',
      removed_at = coalesce(enrollment.removed_at, now())
    where enrollment.course_id = target_course.id
      and enrollment.user_id = new.user_id
      and enrollment.status in ('confirmed', 'waitlisted');
  end if;

  return new;
end;
$$;

revoke all on function private.sync_one_time_course_enrollment_from_booking()
  from public;

create trigger bookings_sync_one_time_course_enrollment
after insert or update of status on public.bookings
for each row
execute procedure private.sync_one_time_course_enrollment_from_booking();

-- Repariert bestaetigte einmalige Buchungen ohne aktive Einschreibung, darunter bereits
-- angenommene Gruppenersatztermine.
insert into public.course_enrollments (
  course_id,
  user_id,
  status,
  source,
  assigned_by,
  enrolled_at,
  removed_at
)
select distinct on (course.id, booking.user_id)
  course.id,
  booking.user_id,
  'confirmed',
  'customer',
  booking.user_id,
  coalesce(booking.confirmed_at, booking.created_at, now()),
  null
from public.bookings booking
join public.course_sessions session on session.id = booking.session_id
join public.courses course on course.id = session.course_id
where booking.status = 'confirmed'
  and course.format = 'group'
  and course.repetition = 'once'
order by course.id, booking.user_id, booking.confirmed_at desc nulls last
on conflict (course_id, user_id) do update
set
  status = 'confirmed',
  enrolled_at = excluded.enrolled_at,
  removed_at = null;

-- Behaelt die Bereinigung aus der vorherigen Migration fuer reine Stornierungen bei.
update public.course_enrollments enrollment
set
  status = 'cancelled',
  removed_at = coalesce(enrollment.removed_at, now())
from public.courses course
where enrollment.course_id = course.id
  and enrollment.status in ('confirmed', 'waitlisted')
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
  );

commit;

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
