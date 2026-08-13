-- Nachvollziehbare Verantwortlichkeit und Ablehnung fuer Cambio-Vorgaenge.
begin;

alter table public.booking_change_requests
  add column if not exists rejected_by uuid references auth.users(id) on delete set null;
alter table public.booking_change_requests
  add column if not exists rejected_at timestamptz;

-- Bestehende Ablehnungen lassen sich ueber die weiterhin verknuepfte PT-Anfrage zuordnen.
update public.booking_change_requests change_request
set
  rejected_by = request.trainer_id,
  rejected_at = coalesce(change_request.updated_at, now())
from public.personal_training_requests request
where request.change_request_id = change_request.id
  and change_request.status = 'rejected'
  and change_request.rejected_by is null;

update public.booking_change_requests change_request
set
  rejected_by = change_request.original_trainer_id,
  rejected_at = coalesce(change_request.rejected_at, change_request.updated_at, now())
where change_request.status = 'rejected'
  and change_request.rejected_by is null;

create or replace function private.capture_booking_change_rejection()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'rejected' and old.status is distinct from 'rejected' then
    new.rejected_by := coalesce(
      new.rejected_by,
      (select auth.uid()),
      old.original_trainer_id
    );
    new.rejected_at := coalesce(new.rejected_at, now());
  end if;
  return new;
end;
$$;

drop trigger if exists booking_change_capture_rejection
  on public.booking_change_requests;
create trigger booking_change_capture_rejection
before update of status on public.booking_change_requests
for each row execute procedure private.capture_booking_change_rejection();

alter table public.booking_change_requests
  drop constraint if exists booking_change_rejection_audit_check;
alter table public.booking_change_requests
  add constraint booking_change_rejection_audit_check check (
    status <> 'rejected' or (rejected_by is not null and rejected_at is not null)
  );

create or replace function public.get_my_booking_change_audit()
returns table (
  change_id uuid,
  customer_first_name text,
  customer_last_name text,
  original_trainer_id uuid,
  original_trainer_name text,
  responsible_trainer_id uuid,
  responsible_trainer_name text,
  rejected_by uuid,
  rejected_by_name text,
  rejected_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    change_request.id,
    customer_profile.first_name,
    customer_profile.last_name,
    change_request.original_trainer_id,
    coalesce(
      nullif(btrim(concat_ws(
        ' ', original_trainer.first_name, original_trainer.last_name
      )), ''),
      'Entrenador'
    ),
    coalesce(request.trainer_id, change_request.original_trainer_id),
    coalesce(
      nullif(btrim(concat_ws(
        ' ', responsible_trainer.first_name, responsible_trainer.last_name
      )), ''),
      'Entrenador'
    ),
    change_request.rejected_by,
    case
      when change_request.rejected_by is null then null
      else coalesce(
        nullif(btrim(concat_ws(
          ' ', rejecting_trainer.first_name, rejecting_trainer.last_name
        )), ''),
        'Entrenador'
      )
    end,
    change_request.rejected_at
  from public.booking_change_requests change_request
  join public.user_profiles customer_profile
    on customer_profile.user_id = change_request.customer_id
   and customer_profile.company_id = change_request.company_id
  join public.user_profiles original_trainer
    on original_trainer.user_id = change_request.original_trainer_id
   and original_trainer.company_id = change_request.company_id
  left join public.personal_training_requests request
    on request.change_request_id = change_request.id
  left join public.user_profiles responsible_trainer
    on responsible_trainer.user_id = coalesce(
      request.trainer_id, change_request.original_trainer_id
    )
   and responsible_trainer.company_id = change_request.company_id
  left join public.user_profiles rejecting_trainer
    on rejecting_trainer.user_id = change_request.rejected_by
   and rejecting_trainer.company_id = change_request.company_id
  where (select private.can_read_booking_change(change_request.id))
  order by change_request.created_at desc;
$$;

revoke all on function private.capture_booking_change_rejection() from public;
revoke all on function public.get_my_booking_change_audit() from public, anon;
grant execute on function public.get_my_booking_change_audit() to authenticated;

commit;

select
  exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'booking_change_requests'
      and column_name = 'rejected_by'
  ) as rejected_by_is_recorded,
  exists (
    select 1
    from pg_trigger trigger_record
    where trigger_record.tgrelid = 'public.booking_change_requests'::regclass
      and trigger_record.tgname = 'booking_change_capture_rejection'
      and not trigger_record.tgisinternal
  ) as rejection_audit_trigger_exists,
  has_function_privilege(
    'authenticated',
    'public.get_my_booking_change_audit()',
    'EXECUTE'
  ) as trainer_can_read_change_audit;
