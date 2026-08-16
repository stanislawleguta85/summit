select
  to_regprocedure('public.get_manageable_group_course_customer_matches()') is not null
    as group_customer_search_function_exists,
  has_function_privilege(
    'authenticated',
    'public.get_manageable_group_course_customer_matches()',
    'EXECUTE'
  ) as authenticated_can_search_group_customers,
  not has_function_privilege(
    'anon',
    'public.get_manageable_group_course_customer_matches()',
    'EXECUTE'
  ) as anonymous_cannot_search_group_customers;
