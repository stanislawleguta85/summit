-- Flujo completo para solicitudes de entrenamiento personal.
-- Nach 20260803_role_based_access_control.sql ausfuehren.
begin;

alter table public.user_profiles
  add column if not exists assigned_trainer_id uuid references auth.users(id) on delete set null;

create index if not exists idx_user_profiles_assigned_trainer_id
  on public.user_profiles(assigned_trainer_id);

create table if not exists public.personal_training_requests (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  customer_id uuid not null references auth.users(id) on delete cascade,
  trainer_id uuid not null references auth.users(id) on delete restrict,
  status text not null default 'requested'
    check (status in ('requested', 'proposed', 'confirmed', 'cancelled')),
  requested_at timestamptz not null default now(),
  proposed_at timestamptz,
  confirmed_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists personal_training_one_open_request_per_customer
  on public.personal_training_requests(customer_id)
  where status in ('requested', 'proposed');
create index if not exists idx_personal_training_requests_trainer_status
  on public.personal_training_requests(trainer_id, status);
create index if not exists idx_personal_training_requests_customer
  on public.personal_training_requests(customer_id, created_at desc);

create table if not exists public.personal_training_proposals (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.personal_training_requests(id) on delete cascade,
  start_at timestamptz not null,
  end_at timestamptz not null,
  location text,
  room text,
  status text not null default 'proposed'
    check (status in ('proposed', 'accepted', 'declined', 'expired')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_at > start_at)
);

create index if not exists idx_personal_training_proposals_request
  on public.personal_training_proposals(request_id, status);
create index if not exists idx_personal_training_proposals_time
  on public.personal_training_proposals(start_at, end_at);

create table if not exists public.course_sessions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  course_id uuid references public.courses(id) on delete cascade,
  personal_training_request_id uuid references public.personal_training_requests(id) on delete set null,
  trainer_id uuid not null references auth.users(id) on delete restrict,
  start_at timestamptz not null,
  end_at timestamptz not null,
  status text not null default 'scheduled'
    check (status in ('scheduled', 'completed', 'cancelled')),
  capacity integer not null default 1 check (capacity between 1 and 1000),
  location text,
  room text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_at > start_at)
);

create index if not exists idx_course_sessions_trainer_time
  on public.course_sessions(trainer_id, start_at, end_at);
create index if not exists idx_course_sessions_request
  on public.course_sessions(personal_training_request_id);

create table if not exists public.bookings (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.course_sessions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'confirmed'
    check (status in ('confirmed', 'waitlisted', 'cancelled')),
  booked_at timestamptz not null default now(),
  confirmed_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (session_id, user_id)
);

create index if not exists idx_bookings_user_status
  on public.bookings(user_id, status);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references auth.users(id) on delete cascade,
  type text not null,
  title text not null,
  body text not null,
  payload jsonb not null default '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_notifications_recipient_created
  on public.notifications(recipient_id, created_at desc);
create index if not exists idx_notifications_recipient_unread
  on public.notifications(recipient_id)
  where read_at is null;

drop trigger if exists personal_training_requests_set_updated_at on public.personal_training_requests;
create trigger personal_training_requests_set_updated_at
before update on public.personal_training_requests
for each row execute procedure private.set_updated_at();

drop trigger if exists personal_training_proposals_set_updated_at on public.personal_training_proposals;
create trigger personal_training_proposals_set_updated_at
before update on public.personal_training_proposals
for each row execute procedure private.set_updated_at();

drop trigger if exists course_sessions_set_updated_at on public.course_sessions;
create trigger course_sessions_set_updated_at
before update on public.course_sessions
for each row execute procedure private.set_updated_at();

drop trigger if exists bookings_set_updated_at on public.bookings;
create trigger bookings_set_updated_at
before update on public.bookings
for each row execute procedure private.set_updated_at();

create or replace function private.can_access_personal_training_request(target_request_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.personal_training_requests request
    where request.id = target_request_id
      and (
        request.customer_id = (select auth.uid())
        or request.trainer_id = (select auth.uid())
        or (select private.is_approved_owner(request.company_id))
      )
  );
$$;

create or replace function private.can_access_course_session(target_session_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.course_sessions session
    where session.id = target_session_id
      and (
        session.trainer_id = (select auth.uid())
        or (select private.is_approved_owner(session.company_id))
        or exists (
          select 1
          from public.bookings booking
          where booking.session_id = session.id
            and booking.user_id = (select auth.uid())
        )
      )
  );
$$;

revoke all on function private.can_access_personal_training_request(uuid) from public;
revoke all on function private.can_access_course_session(uuid) from public;
grant execute on function private.can_access_personal_training_request(uuid) to authenticated;
grant execute on function private.can_access_course_session(uuid) to authenticated;

create or replace function public.assign_customer_trainer(
  target_customer_id uuid,
  target_trainer_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_company_id uuid;
  customer_name text;
begin
  select profile.company_id
  into actor_company_id
  from public.user_profiles profile
  where profile.user_id = (select auth.uid())
    and profile.status = 'approved'
    and (select private.has_role(profile.user_id, profile.company_id, 'owner'));

  if actor_company_id is null then
    raise exception 'Solo un administrador aprobado puede asignar entrenadores.';
  end if;

  select nullif(btrim(concat_ws(' ', customer.first_name, customer.last_name)), '')
  into customer_name
  from public.user_profiles customer
  where customer.user_id = target_customer_id
    and customer.company_id = actor_company_id
    and customer.role = 'customer'
    and customer.status = 'approved';

  if not found then
    raise exception 'El cliente no existe o pertenece a otra sede.';
  end if;

  if target_trainer_id is not null and not exists (
    select 1
    from public.user_profiles trainer
    where trainer.user_id = target_trainer_id
      and trainer.company_id = actor_company_id
      and trainer.status = 'approved'
      and (select private.has_role(trainer.user_id, trainer.company_id, 'trainer'))
  ) then
    raise exception 'El entrenador no está aprobado o pertenece a otra sede.';
  end if;

  update public.user_profiles
  set assigned_trainer_id = target_trainer_id
  where user_id = target_customer_id;

  if target_trainer_id is not null then
    insert into public.notifications (recipient_id, type, title, body, payload)
    values (
      target_trainer_id,
      'trainer_assignment',
      'Nuevo cliente asignado',
      coalesce(customer_name, 'Se te ha asignado un nuevo cliente.'),
      jsonb_build_object('customer_id', target_customer_id)
    );
  end if;
end;
$$;

create or replace function public.create_personal_training_request()
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  customer_profile public.user_profiles%rowtype;
  request_id uuid;
  customer_name text;
begin
  select profile.*
  into customer_profile
  from public.user_profiles profile
  where profile.user_id = (select auth.uid())
    and profile.status = 'approved'
    and (select private.has_role(profile.user_id, profile.company_id, 'customer'))
  for update;

  if not found then
    raise exception 'Solo un cliente aprobado puede solicitar un entrenamiento individual.';
  end if;

  if customer_profile.assigned_trainer_id is null then
    raise exception 'Todavía no tienes un entrenador asignado.';
  end if;

  if not exists (
    select 1
    from public.user_profiles trainer
    where trainer.user_id = customer_profile.assigned_trainer_id
      and trainer.company_id = customer_profile.company_id
      and trainer.status = 'approved'
      and (select private.has_role(trainer.user_id, trainer.company_id, 'trainer'))
  ) then
    raise exception 'El entrenador asignado no está disponible.';
  end if;

  if exists (
    select 1
    from public.personal_training_requests request
    where request.customer_id = customer_profile.user_id
      and request.status in ('requested', 'proposed')
  ) then
    raise exception 'Ya tienes una solicitud de entrenamiento individual abierta.';
  end if;

  insert into public.personal_training_requests (
    company_id,
    customer_id,
    trainer_id
  )
  values (
    customer_profile.company_id,
    customer_profile.user_id,
    customer_profile.assigned_trainer_id
  )
  returning id into request_id;

  customer_name := nullif(
    btrim(concat_ws(' ', customer_profile.first_name, customer_profile.last_name)),
    ''
  );

  insert into public.notifications (recipient_id, type, title, body, payload)
  values (
    customer_profile.assigned_trainer_id,
    'personal_training_requested',
    'Nueva solicitud de entrenamiento individual',
    coalesce(customer_name, 'Un cliente ha solicitado un entrenamiento individual.'),
    jsonb_build_object('request_id', request_id, 'customer_id', customer_profile.user_id)
  );

  return request_id;
end;
$$;

create or replace function public.propose_personal_training_slots(
  target_request_id uuid,
  proposed_slots jsonb
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  request_record public.personal_training_requests%rowtype;
  slot jsonb;
  slot_start timestamptz;
  slot_end timestamptz;
  slot_count integer;
  proposal_window_end timestamptz;
begin
  if jsonb_typeof(proposed_slots) <> 'array' then
    raise exception 'Los horarios propuestos deben enviarse como una lista.';
  end if;

  slot_count := jsonb_array_length(proposed_slots);
  if slot_count < 1 or slot_count > 20 then
    raise exception 'Selecciona entre 1 y 20 horarios.';
  end if;

  select request.*
  into request_record
  from public.personal_training_requests request
  where request.id = target_request_id
    and request.trainer_id = (select auth.uid())
    and request.status in ('requested', 'proposed')
    and exists (
      select 1
      from public.user_profiles trainer
      where trainer.user_id = (select auth.uid())
        and trainer.company_id = request.company_id
        and trainer.status = 'approved'
        and (select private.has_role(trainer.user_id, trainer.company_id, 'trainer'))
    )
  for update;

  if not found then
    raise exception 'No puedes responder a esta solicitud.';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(request_record.trainer_id::text, 0));
  proposal_window_end := date_trunc('week', now()) + interval '4 weeks';

  delete from public.personal_training_proposals
  where request_id = request_record.id
    and status = 'proposed';

  for slot in select value from jsonb_array_elements(proposed_slots)
  loop
    begin
      slot_start := nullif(slot ->> 'start_at', '')::timestamptz;
      slot_end := nullif(slot ->> 'end_at', '')::timestamptz;
    exception when others then
      raise exception 'Uno de los horarios no tiene una fecha válida.';
    end;

    if slot_start is null or slot_end is null or slot_end <= slot_start then
      raise exception 'Cada horario necesita una hora inicial y final válidas.';
    end if;

    if slot_start < now() or slot_start >= proposal_window_end then
      raise exception 'Los horarios deben estar dentro de las próximas cuatro semanas naturales.';
    end if;

    if slot_end - slot_start < interval '30 minutes'
      or slot_end - slot_start > interval '4 hours' then
      raise exception 'La duración debe estar entre 30 minutos y 4 horas.';
    end if;

    if exists (
      select 1
      from public.course_sessions session
      where session.trainer_id = request_record.trainer_id
        and session.status = 'scheduled'
        and tstzrange(session.start_at, session.end_at, '[)')
          && tstzrange(slot_start, slot_end, '[)')
    ) or exists (
      select 1
      from public.personal_training_proposals proposal
      join public.personal_training_requests other_request
        on other_request.id = proposal.request_id
      where other_request.trainer_id = request_record.trainer_id
        and proposal.status = 'proposed'
        and tstzrange(proposal.start_at, proposal.end_at, '[)')
          && tstzrange(slot_start, slot_end, '[)')
    ) then
      raise exception 'Uno de los horarios se solapa con otro compromiso del entrenador.';
    end if;

    insert into public.personal_training_proposals (
      request_id,
      start_at,
      end_at,
      location,
      room
    )
    values (
      request_record.id,
      slot_start,
      slot_end,
      nullif(btrim(slot ->> 'location'), ''),
      nullif(btrim(slot ->> 'room'), '')
    );
  end loop;

  update public.personal_training_requests
  set status = 'proposed', proposed_at = now()
  where id = request_record.id;

  insert into public.notifications (recipient_id, type, title, body, payload)
  values (
    request_record.customer_id,
    'personal_training_proposed',
    'Nuevos horarios disponibles',
    'Tu entrenador ha propuesto horarios para tu entrenamiento individual.',
    jsonb_build_object('request_id', request_record.id, 'slot_count', slot_count)
  );

  return slot_count;
end;
$$;

create or replace function public.confirm_personal_training_slots(
  target_request_id uuid,
  selected_proposal_ids uuid[]
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  request_record public.personal_training_requests%rowtype;
  proposal_record public.personal_training_proposals%rowtype;
  session_id uuid;
  selected_count integer;
  matching_count integer;
begin
  selected_count := cardinality(coalesce(selected_proposal_ids, '{}'::uuid[]));
  if selected_count < 1 or selected_count > 20 then
    raise exception 'Selecciona entre 1 y 20 horarios.';
  end if;

  if (
    select count(distinct proposal_id)
    from unnest(selected_proposal_ids) as selected(proposal_id)
  ) <> selected_count then
    raise exception 'La selección contiene horarios duplicados.';
  end if;

  select request.*
  into request_record
  from public.personal_training_requests request
  where request.id = target_request_id
    and request.customer_id = (select auth.uid())
    and request.status = 'proposed'
  for update;

  if not found then
    raise exception 'Esta solicitud ya no está disponible para confirmar.';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(request_record.trainer_id::text, 0));

  select count(*)
  into matching_count
  from public.personal_training_proposals proposal
  where proposal.request_id = request_record.id
    and proposal.id = any(selected_proposal_ids)
    and proposal.status = 'proposed';

  if matching_count <> selected_count then
    raise exception 'Uno o varios horarios ya no están disponibles.';
  end if;

  perform 1
  from public.personal_training_proposals proposal
  where proposal.id = any(selected_proposal_ids)
  for update;

  for proposal_record in
    select proposal.*
    from public.personal_training_proposals proposal
    where proposal.id = any(selected_proposal_ids)
    order by proposal.start_at
  loop
    if proposal_record.start_at <= now() or exists (
      select 1
      from public.course_sessions session
      where session.trainer_id = request_record.trainer_id
        and session.status = 'scheduled'
        and tstzrange(session.start_at, session.end_at, '[)')
          && tstzrange(proposal_record.start_at, proposal_record.end_at, '[)')
    ) then
      raise exception 'Uno de los horarios ya no está disponible.';
    end if;

    insert into public.course_sessions (
      company_id,
      personal_training_request_id,
      trainer_id,
      start_at,
      end_at,
      capacity,
      location,
      room
    )
    values (
      request_record.company_id,
      request_record.id,
      request_record.trainer_id,
      proposal_record.start_at,
      proposal_record.end_at,
      1,
      proposal_record.location,
      proposal_record.room
    )
    returning id into session_id;

    insert into public.bookings (
      session_id,
      user_id,
      status,
      confirmed_at
    )
    values (
      session_id,
      request_record.customer_id,
      'confirmed',
      now()
    );
  end loop;

  update public.personal_training_proposals
  set status = case
    when id = any(selected_proposal_ids) then 'accepted'
    else 'declined'
  end
  where request_id = request_record.id
    and status = 'proposed';

  update public.personal_training_requests
  set status = 'confirmed', confirmed_at = now()
  where id = request_record.id;

  insert into public.notifications (recipient_id, type, title, body, payload)
  values (
    request_record.trainer_id,
    'personal_training_confirmed',
    'Entrenamientos confirmados',
    format('El cliente ha reservado %s entrenamiento(s).', selected_count),
    jsonb_build_object('request_id', request_record.id, 'booking_count', selected_count)
  );

  return selected_count;
end;
$$;

create or replace function public.mark_notification_read(target_notification_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.notifications
  set read_at = coalesce(read_at, now())
  where id = target_notification_id
    and recipient_id = (select auth.uid());
$$;

revoke all on function public.assign_customer_trainer(uuid, uuid) from public, anon;
revoke all on function public.create_personal_training_request() from public, anon;
revoke all on function public.propose_personal_training_slots(uuid, jsonb) from public, anon;
revoke all on function public.confirm_personal_training_slots(uuid, uuid[]) from public, anon;
revoke all on function public.mark_notification_read(uuid) from public, anon;
grant execute on function public.assign_customer_trainer(uuid, uuid) to authenticated;
grant execute on function public.create_personal_training_request() to authenticated;
grant execute on function public.propose_personal_training_slots(uuid, jsonb) to authenticated;
grant execute on function public.confirm_personal_training_slots(uuid, uuid[]) to authenticated;
grant execute on function public.mark_notification_read(uuid) to authenticated;

alter table public.personal_training_requests enable row level security;
alter table public.personal_training_proposals enable row level security;
alter table public.course_sessions enable row level security;
alter table public.bookings enable row level security;
alter table public.notifications enable row level security;

drop policy if exists "Users and owners can view profiles" on public.user_profiles;
create policy "Users and owners can view profiles"
on public.user_profiles for select
to authenticated
using (
  user_id = (select auth.uid())
  or (select private.is_approved_owner(company_id))
  or (
    assigned_trainer_id = (select auth.uid())
    and (select private.is_approved_member(company_id))
  )
);

drop policy if exists "Participants can view personal training requests"
  on public.personal_training_requests;
create policy "Participants can view personal training requests"
on public.personal_training_requests for select
to authenticated
using ((select private.can_access_personal_training_request(id)));

drop policy if exists "Participants can view personal training proposals"
  on public.personal_training_proposals;
create policy "Participants can view personal training proposals"
on public.personal_training_proposals for select
to authenticated
using ((select private.can_access_personal_training_request(request_id)));

drop policy if exists "Participants can view course sessions" on public.course_sessions;
create policy "Participants can view course sessions"
on public.course_sessions for select
to authenticated
using ((select private.can_access_course_session(id)));

drop policy if exists "Participants can view bookings" on public.bookings;
create policy "Participants can view bookings"
on public.bookings for select
to authenticated
using (
  user_id = (select auth.uid())
  or (select private.can_access_course_session(session_id))
);

drop policy if exists "Users can view their notifications" on public.notifications;
create policy "Users can view their notifications"
on public.notifications for select
to authenticated
using (recipient_id = (select auth.uid()));

revoke all on public.personal_training_requests from anon, authenticated;
revoke all on public.personal_training_proposals from anon, authenticated;
revoke all on public.course_sessions from anon, authenticated;
revoke all on public.bookings from anon, authenticated;
revoke all on public.notifications from anon, authenticated;
grant select on public.personal_training_requests to authenticated;
grant select on public.personal_training_proposals to authenticated;
grant select on public.course_sessions to authenticated;
grant select on public.bookings to authenticated;
grant select on public.notifications to authenticated;

commit;
