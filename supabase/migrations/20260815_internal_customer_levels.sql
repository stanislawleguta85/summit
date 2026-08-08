-- Kundenlevel bleiben intern. Ein Levelwechsel beendet alte zukuenftige Kursbindungen still.
begin;

create or replace function public.set_customer_category_level(
  target_customer_id uuid,
  target_category text,
  target_level text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  customer_profile public.user_profiles%rowtype;
  normalized_category text;
  normalized_level text;
  previous_level text;
begin
  normalized_category := upper(btrim(coalesce(target_category, '')));
  normalized_level := case lower(btrim(coalesce(target_level, '')))
    when 'bajo' then 'Bajo'
    when 'medio' then 'Medio'
    when 'alto' then 'Alto'
    else null
  end;

  if normalized_category = '' or char_length(normalized_category) > 60 then
    raise exception 'La categoria no es valida.';
  end if;

  if normalized_level is null then
    raise exception 'El nivel debe ser Bajo, Medio o Alto.';
  end if;

  select profile.*
  into customer_profile
  from public.user_profiles profile
  where profile.user_id = target_customer_id
    and profile.status = 'approved'
    and (select private.has_role(profile.user_id, profile.company_id, 'customer'));

  if not found then
    raise exception 'El cliente no existe o no esta aprobado.';
  end if;

  if not (
    (select private.has_permission(
      (select auth.uid()), customer_profile.company_id, 'clients', 'set_level', 'all'
    ))
    or (
      customer_profile.assigned_trainer_id = (select auth.uid())
      and (select private.has_permission(
        (select auth.uid()), customer_profile.company_id, 'clients', 'set_level', 'assigned'
      ))
    )
  ) then
    raise exception 'No tienes permiso para cambiar el nivel de este cliente.';
  end if;

  if not exists (
    select 1
    from public.courses course
    where course.company_id = customer_profile.company_id
      and upper(btrim(course.category)) = normalized_category
      and course.format = 'group'
  ) then
    raise exception 'La categoria no tiene cursos de grupo en esta sede.';
  end if;

  select customer_level.level
  into previous_level
  from public.customer_category_levels customer_level
  where customer_level.customer_id = target_customer_id
    and customer_level.category = normalized_category;

  if previous_level is not distinct from normalized_level then
    return;
  end if;

  insert into public.customer_category_levels (
    customer_id,
    company_id,
    category,
    level,
    assigned_by
  )
  values (
    target_customer_id,
    customer_profile.company_id,
    normalized_category,
    normalized_level,
    (select auth.uid())
  )
  on conflict (customer_id, category) do update
  set
    company_id = excluded.company_id,
    level = excluded.level,
    assigned_by = excluded.assigned_by;

  if previous_level is not null then
    update public.bookings booking
    set
      status = 'cancelled',
      cancelled_at = coalesce(booking.cancelled_at, now())
    from public.course_sessions session
    join public.courses course on course.id = session.course_id
    where booking.session_id = session.id
      and booking.user_id = target_customer_id
      and booking.status in ('confirmed', 'waitlisted')
      and session.start_at > now()
      and course.company_id = customer_profile.company_id
      and upper(btrim(course.category)) = normalized_category
      and course.level = previous_level;

    update public.course_enrollments enrollment
    set
      status = 'cancelled',
      removed_at = coalesce(enrollment.removed_at, now())
    from public.courses course
    where enrollment.course_id = course.id
      and enrollment.user_id = target_customer_id
      and enrollment.status in ('confirmed', 'waitlisted')
      and course.company_id = customer_profile.company_id
      and upper(btrim(course.category)) = normalized_category
      and course.level = previous_level;
  end if;
end;
$$;

revoke all on function public.set_customer_category_level(uuid, text, text)
  from public, anon;
grant execute on function public.set_customer_category_level(uuid, text, text)
  to authenticated;

drop policy if exists "Customers and managers can view category levels"
  on public.customer_category_levels;
drop policy if exists "Users with client permissions can view category levels"
  on public.customer_category_levels;
create policy "Managers can view category levels"
on public.customer_category_levels for select
to authenticated
using ((select private.can_manage_customer_level(customer_id, company_id)));

delete from public.notifications
where type = 'customer_level_updated';

update public.notifications notification
set body = regexp_replace(
  notification.body,
  '[[:space:]]*(-|·)[[:space:]]*Nivel[[:space:]]+(bajo|medio|alto)',
  '',
  'gi'
)
where notification.type in ('course_enrollment_confirmed', 'course_enrollment_waitlisted');

create or replace function private.hide_internal_level_from_customer_notification()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.type in ('course_enrollment_confirmed', 'course_enrollment_waitlisted') then
    new.body := regexp_replace(
      new.body,
      '[[:space:]]*(-|·)[[:space:]]*Nivel[[:space:]]+(bajo|medio|alto)',
      '',
      'gi'
    );
  end if;
  return new;
end;
$$;

drop trigger if exists notifications_hide_internal_customer_level
  on public.notifications;
create trigger notifications_hide_internal_customer_level
before insert or update of type, body on public.notifications
for each row execute procedure private.hide_internal_level_from_customer_notification();

revoke all on function private.hide_internal_level_from_customer_notification()
  from public, anon, authenticated;

commit;

with level_function as (
  select pg_get_functiondef(
    'public.set_customer_category_level(uuid,text,text)'::regprocedure
  ) as definition
)
select
  definition not ilike '%customer_level_updated%'
    as customer_level_notification_removed,
  definition ilike '%update public.bookings%'
    and definition ilike '%update public.course_enrollments%'
    as old_future_course_bindings_cancelled,
  exists (
    select 1
    from pg_policies policy_record
    where policy_record.schemaname = 'public'
      and policy_record.tablename = 'customer_category_levels'
      and policy_record.policyname = 'Managers can view category levels'
  ) as manager_only_level_policy_exists,
  exists (
    select 1
    from pg_trigger trigger_record
    where trigger_record.tgrelid = 'public.notifications'::regclass
      and trigger_record.tgname = 'notifications_hide_internal_customer_level'
      and not trigger_record.tgisinternal
  ) as customer_notification_level_filter_exists,
  not exists (
    select 1
    from public.notifications notification
    where notification.type = 'customer_level_updated'
  ) as old_customer_level_notifications_removed
from level_function;
