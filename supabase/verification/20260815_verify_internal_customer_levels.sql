-- Nur lesen: prueft, dass Kundenlevel intern bleiben.

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
