-- Sichere Uebergabe einzelner Personal-Training-Anfragen zwischen Trainern.
-- Nach allen Migrationen vom 20260803 ausfuehren.
begin;

do $$
begin
  if to_regclass('public.personal_training_requests') is null
    or to_regclass('public.personal_training_proposals') is null
    or to_regclass('public.notifications') is null
    or to_regclass('public.permissions') is null
    or to_regclass('public.role_permissions') is null then
    raise exception 'Die Personal-Training- und RBAC-Migrationen muessen zuerst ausgefuehrt werden.';
  end if;
end;
$$;

insert into public.permissions (resource, action, name, description)
values (
  'training_requests',
  'transfer',
  'Transferir solicitudes de entrenamiento',
  'Solicitar, aceptar, rechazar o cancelar la transferencia de una solicitud.'
)
on conflict (resource, action) do update
set
  name = excluded.name,
  description = excluded.description;

insert into public.role_permissions (role_id, permission_id, scope)
select role_record.id, permission_record.id, grant_record.scope
from (
  values
    ('owner', 'all'),
    ('trainer', 'assigned')
) as grant_record(role_code, scope)
join public.roles role_record
  on role_record.code = grant_record.role_code
 and role_record.company_id is null
join public.permissions permission_record
  on permission_record.resource = 'training_requests'
 and permission_record.action = 'transfer'
on conflict (role_id, permission_id, scope) do nothing;

create table if not exists public.personal_training_request_transfers (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null
    references public.personal_training_requests(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  from_trainer_id uuid not null references auth.users(id) on delete cascade,
  to_trainer_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pending'
    check (status in ('pending', 'accepted', 'declined', 'cancelled')),
  note text check (note is null or char_length(note) <= 500),
  requested_at timestamptz not null default now(),
  responded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (from_trainer_id <> to_trainer_id)
);

create unique index if not exists idx_personal_training_transfer_one_pending
  on public.personal_training_request_transfers(request_id)
  where status = 'pending';
create index if not exists idx_personal_training_transfer_incoming
  on public.personal_training_request_transfers(to_trainer_id, status, requested_at);
create index if not exists idx_personal_training_transfer_outgoing
  on public.personal_training_request_transfers(from_trainer_id, status, requested_at);

create or replace function private.can_read_user_profile(
  target_user_id uuid,
  target_company_id uuid,
  target_primary_role text,
  target_status text,
  target_assigned_trainer_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    target_user_id = (select auth.uid())
    or (
      select private.has_permission(
        (select auth.uid()),
        target_company_id,
        'members',
        'read',
        'all'
      )
    )
    or (
      target_primary_role = 'customer'
      and target_status = 'approved'
      and (
        (
          select private.has_permission(
            (select auth.uid()),
            target_company_id,
            'clients',
            'read',
            'all'
          )
        )
        or (
          (
            select private.has_permission(
              (select auth.uid()),
              target_company_id,
              'clients',
              'read',
              'assigned'
            )
          )
          and (
            target_assigned_trainer_id = (select auth.uid())
            or exists (
              select 1
              from public.personal_training_requests request
              where request.customer_id = target_user_id
                and request.company_id = target_company_id
                and request.trainer_id = (select auth.uid())
                and request.status in ('requested', 'proposed')
            )
          )
        )
      )
    );
$$;

drop trigger if exists personal_training_request_transfers_set_updated_at
  on public.personal_training_request_transfers;
create trigger personal_training_request_transfers_set_updated_at
before update on public.personal_training_request_transfers
for each row execute procedure private.set_updated_at();

create or replace function private.prevent_proposal_during_pending_transfer()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (
    select 1
    from public.personal_training_request_transfers transfer_record
    where transfer_record.request_id = new.request_id
      and transfer_record.status = 'pending'
  ) then
    raise exception 'La solicitud se esta transfiriendo a otro entrenador.';
  end if;

  return new;
end;
$$;

drop trigger if exists personal_training_proposals_block_pending_transfer
  on public.personal_training_proposals;
create trigger personal_training_proposals_block_pending_transfer
before insert on public.personal_training_proposals
for each row execute procedure private.prevent_proposal_during_pending_transfer();

create or replace function public.get_personal_training_transfer_candidates(
  target_request_id uuid
)
returns table (
  user_id uuid,
  first_name text,
  last_name text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  request_record public.personal_training_requests%rowtype;
begin
  select request.*
  into request_record
  from public.personal_training_requests request
  where request.id = target_request_id
    and request.trainer_id = (select auth.uid())
    and request.status in ('requested', 'proposed')
    and (
      select private.has_permission(
        (select auth.uid()),
        request.company_id,
        'training_requests',
        'transfer',
        'assigned'
      )
    );

  if not found then
    raise exception 'No tienes permiso para transferir esta solicitud.';
  end if;

  return query
  select
    trainer_profile.user_id,
    trainer_profile.first_name,
    trainer_profile.last_name
  from public.user_profiles trainer_profile
  where trainer_profile.company_id = request_record.company_id
    and trainer_profile.user_id <> request_record.trainer_id
    and trainer_profile.status = 'approved'
    and (
      select private.has_permission(
        trainer_profile.user_id,
        trainer_profile.company_id,
        'training_requests',
        'respond',
        'assigned'
      )
    )
  order by trainer_profile.last_name nulls last, trainer_profile.first_name nulls last;
end;
$$;

create or replace function public.get_incoming_personal_training_transfers()
returns table (
  transfer_id uuid,
  request_id uuid,
  company_id uuid,
  from_trainer_id uuid,
  from_trainer_name text,
  customer_id uuid,
  customer_name text,
  note text,
  requested_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    transfer_record.id,
    transfer_record.request_id,
    transfer_record.company_id,
    transfer_record.from_trainer_id,
    coalesce(
      nullif(btrim(concat_ws(' ', from_profile.first_name, from_profile.last_name)), ''),
      'Entrenador'
    ),
    request.customer_id,
    coalesce(
      nullif(btrim(concat_ws(' ', customer_profile.first_name, customer_profile.last_name)), ''),
      'Cliente'
    ),
    transfer_record.note,
    transfer_record.requested_at
  from public.personal_training_request_transfers transfer_record
  join public.personal_training_requests request
    on request.id = transfer_record.request_id
   and request.company_id = transfer_record.company_id
   and request.trainer_id = transfer_record.from_trainer_id
  join public.user_profiles from_profile
    on from_profile.user_id = transfer_record.from_trainer_id
   and from_profile.company_id = transfer_record.company_id
  join public.user_profiles customer_profile
    on customer_profile.user_id = request.customer_id
   and customer_profile.company_id = transfer_record.company_id
  where transfer_record.to_trainer_id = (select auth.uid())
    and transfer_record.status = 'pending'
    and request.status in ('requested', 'proposed')
    and (
      select private.has_permission(
        (select auth.uid()),
        transfer_record.company_id,
        'training_requests',
        'transfer',
        'assigned'
      )
    )
  order by transfer_record.requested_at;
$$;

create or replace function public.get_own_personal_training_request_trainer(
  target_request_id uuid
)
returns table (
  trainer_id uuid,
  trainer_name text,
  transfer_pending boolean,
  pending_trainer_name text
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    request.trainer_id,
    coalesce(
      nullif(btrim(concat_ws(' ', trainer_profile.first_name, trainer_profile.last_name)), ''),
      'Entrenador'
    ),
    transfer_record.id is not null,
    case
      when transfer_record.id is null then null
      else coalesce(
        nullif(btrim(concat_ws(' ', pending_profile.first_name, pending_profile.last_name)), ''),
        'otro entrenador'
      )
    end
  from public.personal_training_requests request
  join public.user_profiles trainer_profile
    on trainer_profile.user_id = request.trainer_id
   and trainer_profile.company_id = request.company_id
  left join public.personal_training_request_transfers transfer_record
    on transfer_record.request_id = request.id
   and transfer_record.status = 'pending'
  left join public.user_profiles pending_profile
    on pending_profile.user_id = transfer_record.to_trainer_id
   and pending_profile.company_id = request.company_id
  where request.id = target_request_id
    and request.customer_id = (select auth.uid())
    and (
      select private.has_permission(
        (select auth.uid()),
        request.company_id,
        'training_requests',
        'read',
        'own'
      )
    );
$$;

create or replace function public.request_personal_training_transfer(
  target_request_id uuid,
  target_trainer_id uuid,
  transfer_note text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  request_record public.personal_training_requests%rowtype;
  transfer_id uuid;
  source_trainer_name text;
  target_trainer_name text;
  customer_name text;
  clean_note text := nullif(btrim(transfer_note), '');
begin
  if clean_note is not null and char_length(clean_note) > 500 then
    raise exception 'La nota no puede superar 500 caracteres.';
  end if;

  select request.*
  into request_record
  from public.personal_training_requests request
  where request.id = target_request_id
    and request.trainer_id = (select auth.uid())
    and request.status in ('requested', 'proposed')
    and (
      select private.has_permission(
        (select auth.uid()),
        request.company_id,
        'training_requests',
        'transfer',
        'assigned'
      )
    )
  for update;

  if not found then
    raise exception 'No tienes permiso para transferir esta solicitud.';
  end if;

  if target_trainer_id = request_record.trainer_id then
    raise exception 'Selecciona otro entrenador.';
  end if;

  if not exists (
    select 1
    from public.user_profiles trainer_profile
    where trainer_profile.user_id = target_trainer_id
      and trainer_profile.company_id = request_record.company_id
      and trainer_profile.status = 'approved'
      and (
        select private.has_permission(
          trainer_profile.user_id,
          trainer_profile.company_id,
          'training_requests',
          'respond',
          'assigned'
        )
      )
  ) then
    raise exception 'El entrenador seleccionado no esta disponible para esta solicitud.';
  end if;

  if exists (
    select 1
    from public.personal_training_request_transfers transfer_record
    where transfer_record.request_id = request_record.id
      and transfer_record.status = 'pending'
  ) then
    raise exception 'Ya existe una transferencia pendiente para esta solicitud.';
  end if;

  update public.personal_training_proposals
  set status = 'expired'
  where request_id = request_record.id
    and status = 'proposed';

  update public.personal_training_requests
  set status = 'requested', proposed_at = null
  where id = request_record.id;

  insert into public.personal_training_request_transfers (
    request_id,
    company_id,
    from_trainer_id,
    to_trainer_id,
    note
  )
  values (
    request_record.id,
    request_record.company_id,
    request_record.trainer_id,
    target_trainer_id,
    clean_note
  )
  returning id into transfer_id;

  select coalesce(
    nullif(btrim(concat_ws(' ', profile.first_name, profile.last_name)), ''),
    'Tu entrenador'
  )
  into source_trainer_name
  from public.user_profiles profile
  where profile.user_id = request_record.trainer_id
    and profile.company_id = request_record.company_id;

  select coalesce(
    nullif(btrim(concat_ws(' ', profile.first_name, profile.last_name)), ''),
    'otro entrenador'
  )
  into target_trainer_name
  from public.user_profiles profile
  where profile.user_id = target_trainer_id
    and profile.company_id = request_record.company_id;

  select coalesce(
    nullif(btrim(concat_ws(' ', profile.first_name, profile.last_name)), ''),
    'un cliente'
  )
  into customer_name
  from public.user_profiles profile
  where profile.user_id = request_record.customer_id
    and profile.company_id = request_record.company_id;

  insert into public.notifications (recipient_id, type, title, body, payload)
  values
    (
      target_trainer_id,
      'personal_training_transfer_requested',
      'Nueva transferencia de entrenamiento',
      format('%s quiere transferirte la solicitud de %s.', source_trainer_name, customer_name),
      jsonb_build_object('request_id', request_record.id, 'transfer_id', transfer_id)
    ),
    (
      request_record.customer_id,
      'personal_training_transfer_pending',
      'Cambio de entrenador en curso',
      format('%s ha solicitado que %s se haga cargo de esta solicitud.', source_trainer_name, target_trainer_name),
      jsonb_build_object('request_id', request_record.id, 'transfer_id', transfer_id)
    );

  return transfer_id;
end;
$$;

create or replace function public.respond_personal_training_transfer(
  target_transfer_id uuid,
  new_status text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  transfer_record public.personal_training_request_transfers%rowtype;
  request_record public.personal_training_requests%rowtype;
  source_trainer_name text;
  target_trainer_name text;
begin
  if new_status not in ('accepted', 'declined') then
    raise exception 'Respuesta de transferencia no valida.';
  end if;

  select transfer_item.*
  into transfer_record
  from public.personal_training_request_transfers transfer_item
  where transfer_item.id = target_transfer_id
    and transfer_item.to_trainer_id = (select auth.uid())
    and transfer_item.status = 'pending'
    and (
      select private.has_permission(
        (select auth.uid()),
        transfer_item.company_id,
        'training_requests',
        'transfer',
        'assigned'
      )
    )
  for update;

  if not found then
    raise exception 'La transferencia ya no esta disponible.';
  end if;

  select request.*
  into request_record
  from public.personal_training_requests request
  where request.id = transfer_record.request_id
    and request.company_id = transfer_record.company_id
    and request.trainer_id = transfer_record.from_trainer_id
    and request.status in ('requested', 'proposed')
  for update;

  if not found then
    raise exception 'La solicitud ya no se puede transferir.';
  end if;

  if new_status = 'accepted' and not exists (
    select 1
    from public.user_profiles trainer_profile
    where trainer_profile.user_id = transfer_record.to_trainer_id
      and trainer_profile.company_id = transfer_record.company_id
      and trainer_profile.status = 'approved'
      and (
        select private.has_permission(
          trainer_profile.user_id,
          trainer_profile.company_id,
          'training_requests',
          'respond',
          'assigned'
        )
      )
  ) then
    raise exception 'Ya no tienes permisos para aceptar esta solicitud.';
  end if;

  update public.personal_training_request_transfers
  set status = new_status, responded_at = now()
  where id = transfer_record.id;

  select coalesce(
    nullif(btrim(concat_ws(' ', profile.first_name, profile.last_name)), ''),
    'El entrenador anterior'
  )
  into source_trainer_name
  from public.user_profiles profile
  where profile.user_id = transfer_record.from_trainer_id
    and profile.company_id = transfer_record.company_id;

  select coalesce(
    nullif(btrim(concat_ws(' ', profile.first_name, profile.last_name)), ''),
    'El nuevo entrenador'
  )
  into target_trainer_name
  from public.user_profiles profile
  where profile.user_id = transfer_record.to_trainer_id
    and profile.company_id = transfer_record.company_id;

  if new_status = 'accepted' then
    update public.personal_training_requests
    set trainer_id = transfer_record.to_trainer_id,
        status = 'requested',
        proposed_at = null
    where id = request_record.id;

    insert into public.notifications (recipient_id, type, title, body, payload)
    values
      (
        transfer_record.from_trainer_id,
        'personal_training_transfer_accepted',
        'Transferencia aceptada',
        format('%s ha aceptado la solicitud transferida.', target_trainer_name),
        jsonb_build_object('request_id', request_record.id, 'transfer_id', transfer_record.id)
      ),
      (
        request_record.customer_id,
        'personal_training_trainer_changed',
        'Nuevo entrenador para tu solicitud',
        format('%s se encargara de proponerte nuevos horarios.', target_trainer_name),
        jsonb_build_object(
          'request_id', request_record.id,
          'transfer_id', transfer_record.id,
          'trainer_id', transfer_record.to_trainer_id
        )
      );
  else
    insert into public.notifications (recipient_id, type, title, body, payload)
    values
      (
        transfer_record.from_trainer_id,
        'personal_training_transfer_declined',
        'Transferencia rechazada',
        format('%s no puede aceptar esta solicitud.', target_trainer_name),
        jsonb_build_object('request_id', request_record.id, 'transfer_id', transfer_record.id)
      ),
      (
        request_record.customer_id,
        'personal_training_transfer_not_completed',
        'Cambio de entrenador cancelado',
        format('%s sigue siendo responsable de tu solicitud.', source_trainer_name),
        jsonb_build_object('request_id', request_record.id, 'transfer_id', transfer_record.id)
      );
  end if;

  return request_record.id;
end;
$$;

create or replace function public.cancel_personal_training_transfer(
  target_transfer_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  transfer_record public.personal_training_request_transfers%rowtype;
  request_record public.personal_training_requests%rowtype;
  source_trainer_name text;
begin
  select transfer_item.*
  into transfer_record
  from public.personal_training_request_transfers transfer_item
  where transfer_item.id = target_transfer_id
    and transfer_item.from_trainer_id = (select auth.uid())
    and transfer_item.status = 'pending'
    and (
      select private.has_permission(
        (select auth.uid()),
        transfer_item.company_id,
        'training_requests',
        'transfer',
        'assigned'
      )
    )
  for update;

  if not found then
    raise exception 'La transferencia ya no se puede cancelar.';
  end if;

  select request.*
  into request_record
  from public.personal_training_requests request
  where request.id = transfer_record.request_id
    and request.trainer_id = transfer_record.from_trainer_id
  for update;

  if not found then
    raise exception 'La solicitud ya ha cambiado de entrenador.';
  end if;

  update public.personal_training_request_transfers
  set status = 'cancelled', responded_at = now()
  where id = transfer_record.id;

  select coalesce(
    nullif(btrim(concat_ws(' ', profile.first_name, profile.last_name)), ''),
    'El entrenador anterior'
  )
  into source_trainer_name
  from public.user_profiles profile
  where profile.user_id = transfer_record.from_trainer_id
    and profile.company_id = transfer_record.company_id;

  insert into public.notifications (recipient_id, type, title, body, payload)
  values
    (
      transfer_record.to_trainer_id,
      'personal_training_transfer_cancelled',
      'Transferencia cancelada',
      format('%s ha cancelado la transferencia.', source_trainer_name),
      jsonb_build_object('request_id', request_record.id, 'transfer_id', transfer_record.id)
    ),
    (
      request_record.customer_id,
      'personal_training_transfer_not_completed',
      'Cambio de entrenador cancelado',
      format('%s sigue siendo responsable de tu solicitud.', source_trainer_name),
      jsonb_build_object('request_id', request_record.id, 'transfer_id', transfer_record.id)
    );

  return request_record.id;
end;
$$;

revoke all on function private.prevent_proposal_during_pending_transfer() from public;
revoke all on function private.can_read_user_profile(uuid, uuid, text, text, uuid) from public;
revoke all on function public.get_personal_training_transfer_candidates(uuid) from public, anon;
revoke all on function public.get_incoming_personal_training_transfers() from public, anon;
revoke all on function public.get_own_personal_training_request_trainer(uuid) from public, anon;
revoke all on function public.request_personal_training_transfer(uuid, uuid, text) from public, anon;
revoke all on function public.respond_personal_training_transfer(uuid, text) from public, anon;
revoke all on function public.cancel_personal_training_transfer(uuid) from public, anon;

grant execute on function public.get_personal_training_transfer_candidates(uuid) to authenticated;
grant execute on function private.can_read_user_profile(uuid, uuid, text, text, uuid)
  to authenticated;
grant execute on function public.get_incoming_personal_training_transfers() to authenticated;
grant execute on function public.get_own_personal_training_request_trainer(uuid) to authenticated;
grant execute on function public.request_personal_training_transfer(uuid, uuid, text) to authenticated;
grant execute on function public.respond_personal_training_transfer(uuid, text) to authenticated;
grant execute on function public.cancel_personal_training_transfer(uuid) to authenticated;

alter table public.personal_training_request_transfers enable row level security;
revoke all on public.personal_training_request_transfers from anon, authenticated;
grant select on public.personal_training_request_transfers to authenticated;

drop policy if exists "Transfer participants can view transfers"
  on public.personal_training_request_transfers;
create policy "Transfer participants can view transfers"
on public.personal_training_request_transfers for select
to authenticated
using (
  from_trainer_id = (select auth.uid())
  or to_trainer_id = (select auth.uid())
  or (
    select private.has_permission(
      (select auth.uid()),
      company_id,
      'training_requests',
      'read',
      'all'
    )
  )
);

commit;
