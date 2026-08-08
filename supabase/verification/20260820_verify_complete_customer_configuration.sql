-- Nur lesen: prueft die atomare Speicherfunktion der Kundendetailseite.

select
  to_regprocedure(
    'public.update_complete_customer_configuration(uuid,text,text,text,uuid,text,smallint,text)'
  ) is not null
    as complete_customer_save_function_exists,
  has_function_privilege(
    'authenticated',
    'public.update_complete_customer_configuration(uuid,text,text,text,uuid,text,smallint,text)',
    'EXECUTE'
  ) as authenticated_can_save_permitted_complete_customer_configuration,
  not has_function_privilege(
    'anon',
    'public.update_complete_customer_configuration(uuid,text,text,text,uuid,text,smallint,text)',
    'EXECUTE'
  ) as anonymous_cannot_save_customer_configuration;
