-- Nur lesen: prueft, dass beide Mengenlimits und das Vier-Wochen-Fenster entfernt wurden.

with function_definitions as (
  select
    pg_get_functiondef(
      'public.propose_personal_training_slots(uuid,jsonb)'::regprocedure
    ) as propose_definition,
    pg_get_functiondef(
      'public.confirm_personal_training_slots(uuid,uuid[])'::regprocedure
    ) as confirm_definition
)
select
  propose_definition not like '%interval ''4 weeks''%' as four_week_limit_removed,
  propose_definition not like '%slot_count > 20%' as proposal_count_limit_removed,
  confirm_definition not like '%selected_count > 20%' as selection_count_limit_removed
from function_definitions;
