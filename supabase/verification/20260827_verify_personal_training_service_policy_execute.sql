-- Nur lesen: prueft das Ausfuehrungsrecht der RLS-Hilfsfunktion.

select
  has_function_privilege(
    'authenticated',
    'private.can_read_personal_training_service(uuid)',
    'EXECUTE'
  ) as authenticated_can_check_personal_training_service,
  not has_function_privilege(
    'anon',
    'private.can_read_personal_training_service(uuid)',
    'EXECUTE'
  ) as anonymous_cannot_check_personal_training_service;
