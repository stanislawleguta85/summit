-- Nur lesen: prueft Individualdefinition, Verknuepfungen und Adminabfrage.

select
  to_regclass('public.personal_training_services') is not null
    as personal_training_service_table_exists,
  not exists (
    select 1
    from public.companies company
    where not exists (
      select 1
      from public.personal_training_services service
      where service.company_id = company.id
        and service.code = 'individual'
    )
  ) as every_company_has_individual_service,
  not exists (
    select 1
    from public.personal_training_requests request
    where request.personal_training_service_id is null
  ) as every_personal_request_has_service,
  not exists (
    select 1
    from public.course_sessions session
    where (session.course_id is null) = (session.personal_training_service_id is null)
  ) as every_session_has_exactly_one_service_parent,
  to_regprocedure('public.get_manageable_personal_training_sessions()') is not null
    as manageable_personal_sessions_function_exists,
  has_function_privilege(
    'authenticated',
    'public.get_manageable_personal_training_sessions()',
    'EXECUTE'
  ) as authenticated_can_read_manageable_personal_sessions,
  not has_function_privilege(
    'anon',
    'public.get_manageable_personal_training_sessions()',
    'EXECUTE'
  ) as anonymous_cannot_read_manageable_personal_sessions;
