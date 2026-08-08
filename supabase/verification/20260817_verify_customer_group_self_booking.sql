-- Nur lesen: prueft Selbstbuchung und serverseitiges Gruppen-Wochenkontingent.

select
  to_regprocedure('public.book_own_group_course(uuid)') is not null
    as self_booking_function_exists,
  has_function_privilege(
    'authenticated',
    'public.book_own_group_course(uuid)',
    'EXECUTE'
  ) as authenticated_can_book_own_group_course,
  not has_function_privilege(
    'anon',
    'public.book_own_group_course(uuid)',
    'EXECUTE'
  ) as anonymous_cannot_book_group_course,
  to_regprocedure('private.assert_customer_group_weekly_quota(uuid,uuid,uuid)') is not null
    as weekly_quota_function_exists,
  to_regprocedure('public.set_customer_training_contract(uuid,text,smallint)') is not null
    as contract_update_function_exists,
  has_function_privilege(
    'authenticated',
    'public.set_customer_training_contract(uuid,text,smallint)',
    'EXECUTE'
  ) as authenticated_can_set_permitted_customer_contract,
  exists (
    select 1
    from pg_trigger trigger_record
    where trigger_record.tgrelid = 'public.course_enrollments'::regclass
      and trigger_record.tgname = 'course_enrollments_enforce_group_weekly_quota'
      and not trigger_record.tgisinternal
  ) as weekly_quota_trigger_exists;
