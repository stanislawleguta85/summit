-- Nur lesen: prueft die datumsbezogene Gruppenbelegung.

select
  to_regprocedure('public.get_manageable_group_course_occurrences()') is not null
    as occurrence_function_exists,
  to_regprocedure('public.get_course_session_clients(uuid)') is not null
    as session_clients_function_exists,
  has_function_privilege(
    'authenticated',
    'public.get_manageable_group_course_occurrences()',
    'EXECUTE'
  ) as authenticated_can_read_occurrences,
  has_function_privilege(
    'authenticated',
    'public.get_course_session_clients(uuid)',
    'EXECUTE'
  ) as authenticated_can_read_session_clients,
  not has_function_privilege(
    'anon',
    'public.get_manageable_group_course_occurrences()',
    'EXECUTE'
  ) as anonymous_cannot_read_occurrences,
  not has_function_privilege(
    'anon',
    'public.get_course_session_clients(uuid)',
    'EXECUTE'
  ) as anonymous_cannot_read_session_clients;
