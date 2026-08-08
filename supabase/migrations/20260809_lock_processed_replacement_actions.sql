-- Sobald Alternativtermine versendet wurden, darf eine Aenderungsanfrage nicht mehr
-- als "keine Alternative" abgelehnt oder an einen anderen Trainer uebertragen werden.
begin;

create or replace function private.protect_processed_replacement_request()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.change_request_id is not null
    and old.status = 'proposed'
    and new.status in ('requested', 'cancelled') then
    raise exception 'Ya se han enviado alternativas al cliente. La solicitud no se puede transferir ni rechazar.';
  end if;
  return new;
end;
$$;

drop trigger if exists personal_training_requests_protect_processed_replacement
  on public.personal_training_requests;
create trigger personal_training_requests_protect_processed_replacement
before update of status on public.personal_training_requests
for each row execute procedure private.protect_processed_replacement_request();

revoke all on function private.protect_processed_replacement_request() from public;

commit;

select exists (
  select 1
  from pg_trigger trigger_record
  where trigger_record.tgrelid = 'public.personal_training_requests'::regclass
    and trigger_record.tgname = 'personal_training_requests_protect_processed_replacement'
    and not trigger_record.tgisinternal
) as processed_replacement_actions_locked;
