-- Nur lesen: prueft die geschuetzten Funktionen fuer die Trainerauswahl.

select
  has_function_privilege(
    'authenticated',
    'public.get_customer_creation_trainers()',
    'EXECUTE'
  ) as authenticated_can_list_creation_trainers,
  has_function_privilege(
    'service_role',
    'public.finalize_admin_created_member(uuid,uuid,text,uuid,uuid)',
    'EXECUTE'
  ) as service_role_can_finalize_member_with_trainer,
  not has_function_privilege(
    'authenticated',
    'public.finalize_admin_created_member(uuid,uuid,text,uuid,uuid)',
    'EXECUTE'
  ) as authenticated_cannot_finalize_member_with_trainer;
