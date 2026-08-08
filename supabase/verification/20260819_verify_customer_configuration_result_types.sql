-- Nur lesen: prueft die expliziten Rueckgabetypen der Kundenkonfiguration.

select
  to_regprocedure('public.get_customer_configuration(uuid)') is not null
    and pg_get_functiondef(
      'public.get_customer_configuration(uuid)'::regprocedure
    ) like '%customer_profile.first_name::text%'
    and pg_get_functiondef(
      'public.get_customer_configuration(uuid)'::regprocedure
    ) like '%customer_profile.last_name::text%'
    and pg_get_functiondef(
      'public.get_customer_configuration(uuid)'::regprocedure
    ) like '%training_contract.group_days_per_week::smallint%'
    and pg_get_functiondef(
      'public.get_customer_configuration(uuid)'::regprocedure
    ) like '%customer_profile.created_at::timestamptz%'
    as customer_configuration_result_types_fixed;
