-- Nur lesen: prueft die Funktion fuer eigene Stammdaten und ihre Rechte.

select
  to_regprocedure('public.update_own_master_data(text,text,text)') is not null
    as own_master_data_function_exists,
  has_function_privilege(
    'authenticated',
    'public.update_own_master_data(text,text,text)',
    'EXECUTE'
  ) as authenticated_can_update_own_master_data,
  not has_function_privilege(
    'anon',
    'public.update_own_master_data(text,text,text)',
    'EXECUTE'
  ) as anonymous_cannot_update_master_data;
