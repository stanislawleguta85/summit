-- Etappe 5: Personal-Training-Anfragen, Sessions, Buchungen und Benachrichtigungen
-- ueber Berechtigungen und Scopes absichern.
-- Nach 20260803_client_level_permissions.sql ausfuehren.
begin;

do $$
begin
  if exists (
    select required.resource, required.action
    from (
      values
        ('training_requests', 'read'),
        ('training_requests', 'create'),
        ('training_requests', 'respond'),
        ('training_requests', 'confirm'),
        ('sessions', 'read'),
        ('bookings', 'read'),
        ('notifications', 'read'),
        ('notifications', 'update')
    ) as required(resource, action)
    where not exists (
      select 1
      from public.permissions permission_record
      where permission_record.resource = required.resource
        and permission_record.action = required.action
    )
  ) then
    raise exception 'Eine oder mehrere erforderliche Personal-Training-Berechtigungen fehlen.';
  end if;
end;
$$;

create or replace function private.can_access_personal_training_request(
  target_request_id uuid
)
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
        (
          select private.has_permission(
            (select auth.uid()),
            request.company_id,
            'training_requests',
            'read',
            'all'
          )
        )
        or (
          request.trainer_id = (select auth.uid())
          and (
            select private.has_permission(
              (select auth.uid()),
              request.company_id,
              'training_requests',
              'read',
              'assigned'
            )
          )
        )
        or (
          request.customer_id = (select auth.uid())
          and (
            select private.has_permission(
              (select auth.uid()),
              request.company_id,
              'training_requests',
              'read',
              'own'
            )
          )
        )
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
        (
          select private.has_permission(
            (select auth.uid()),
            session.company_id,
            'sessions',
            'read',
            'all'
          )
        )
        or (
          session.trainer_id = (select auth.uid())
          and (
            select private.has_permission(
              (select auth.uid()),
              session.company_id,
              'sessions',
              'read',
              'assigned'
            )
          )
        )
        or (
          exists (
            select 1
            from public.bookings booking
            where booking.session_id = session.id
              and booking.user_id = (select auth.uid())
          )
          and (
            select private.has_permission(
              (select auth.uid()),
              session.company_id,
              'sessions',
              'read',
              'own'
            )
          )
        )
      )
  );
$$;

create or replace function private.can_access_booking(target_booking_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.bookings booking
    join public.course_sessions session on session.id = booking.session_id
    where booking.id = target_booking_id
      and (
        (
          select private.has_permission(
            (select auth.uid()),
            session.company_id,
            'bookings',
            'read',
            'all'
          )
        )
        or (
          session.trainer_id = (select auth.uid())
          and (
            select private.has_permission(
              (select auth.uid()),
              session.company_id,
              'bookings',
              'read',
              'assigned'
            )
          )
        )
        or (
          booking.user_id = (select auth.uid())
          and (
            select private.has_permission(
              (select auth.uid()),
              session.company_id,
              'bookings',
              'read',
              'own'
            )
          )
        )
      )
  );
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
    and (
      select private.has_permission(
        profile.user_id,
        profile.company_id,
        'training_requests',
        'create',
        'own'
      )
    )
  for update;

  if not found then
    raise exception 'No tienes permiso para solicitar un entrenamiento individual.';
  end if;

  if customer_profile.assigned_trainer_id is null then
    raise exception 'Todavia no tienes un entrenador asignado.';
  end if;

  if not exists (
    select 1
    from public.user_profiles trainer
    where trainer.user_id = customer_profile.assigned_trainer_id
      and trainer.company_id = customer_profile.company_id
      and trainer.status = 'approved'
      and (
        select private.has_permission(
          trainer.user_id,
          trainer.company_id,
          'training_requests',
          'respond',
          'assigned'
        )
      )
  ) then
    raise exception 'El entrenador asignado no esta disponible.';
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
    and (
      select private.has_permission(
        (select auth.uid()),
        request.company_id,
        'training_requests',
        'respond',
        'assigned'
      )
    )
  for update;

  if not found then
    raise exception 'No tienes permiso para responder a esta solicitud.';
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
      raise exception 'Uno de los horarios no tiene una fecha valida.';
    end;

    if slot_start is null or slot_end is null or slot_end <= slot_start then
      raise exception 'Cada horario necesita una hora inicial y final validas.';
    end if;

    if slot_start < now() or slot_start >= proposal_window_end then
      raise exception 'Los horarios deben estar dentro de las proximas cuatro semanas naturales.';
    end if;

    if slot_end - slot_start < interval '30 minutes'
      or slot_end - slot_start > interval '4 hours' then
      raise exception 'La duracion debe estar entre 30 minutos y 4 horas.';
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
    raise exception 'La seleccion contiene horarios duplicados.';
  end if;

  select request.*
  into request_record
  from public.personal_training_requests request
  where request.id = target_request_id
    and request.customer_id = (select auth.uid())
    and request.status = 'proposed'
    and (
      select private.has_permission(
        (select auth.uid()),
        request.company_id,
        'training_requests',
        'confirm',
        'own'
      )
    )
  for update;

  if not found then
    raise exception 'No tienes permiso para confirmar esta solicitud.';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(request_record.trainer_id::text, 0));

  select count(*)
  into matching_count
  from public.personal_training_proposals proposal
  where proposal.request_id = request_record.id
    and proposal.id = any(selected_proposal_ids)
    and proposal.status = 'proposed';

  if matching_count <> selected_count then
    raise exception 'Uno o varios horarios ya no estan disponibles.';
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
      raise exception 'Uno de los horarios ya no esta disponible.';
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
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.notifications notification
  set read_at = coalesce(notification.read_at, now())
  where notification.id = target_notification_id
    and notification.recipient_id = (select auth.uid())
    and exists (
      select 1
      from public.user_profiles profile
      where profile.user_id = (select auth.uid())
        and profile.status = 'approved'
        and (
          select private.has_permission(
            profile.user_id,
            profile.company_id,
            'notifications',
            'update',
            'own'
          )
        )
    );

  if not found then
    raise exception 'No tienes permiso para actualizar esta notificacion.';
  end if;
end;
$$;

revoke all on function private.can_access_personal_training_request(uuid) from public;
revoke all on function private.can_access_course_session(uuid) from public;
revoke all on function private.can_access_booking(uuid) from public;
revoke all on function public.create_personal_training_request() from public, anon;
revoke all on function public.propose_personal_training_slots(uuid, jsonb) from public, anon;
revoke all on function public.confirm_personal_training_slots(uuid, uuid[]) from public, anon;
revoke all on function public.mark_notification_read(uuid) from public, anon;
grant execute on function private.can_access_personal_training_request(uuid) to authenticated;
grant execute on function private.can_access_course_session(uuid) to authenticated;
grant execute on function private.can_access_booking(uuid) to authenticated;
grant execute on function public.create_personal_training_request() to authenticated;
grant execute on function public.propose_personal_training_slots(uuid, jsonb) to authenticated;
grant execute on function public.confirm_personal_training_slots(uuid, uuid[]) to authenticated;
grant execute on function public.mark_notification_read(uuid) to authenticated;

drop policy if exists "Participants can view personal training requests"
  on public.personal_training_requests;
drop policy if exists "Users with training request permissions can view requests"
  on public.personal_training_requests;
create policy "Users with training request permissions can view requests"
on public.personal_training_requests for select
to authenticated
using ((select private.can_access_personal_training_request(id)));

drop policy if exists "Participants can view personal training proposals"
  on public.personal_training_proposals;
drop policy if exists "Users with training request permissions can view proposals"
  on public.personal_training_proposals;
create policy "Users with training request permissions can view proposals"
on public.personal_training_proposals for select
to authenticated
using ((select private.can_access_personal_training_request(request_id)));

drop policy if exists "Participants can view course sessions" on public.course_sessions;
drop policy if exists "Users with session permissions can view sessions"
  on public.course_sessions;
create policy "Users with session permissions can view sessions"
on public.course_sessions for select
to authenticated
using ((select private.can_access_course_session(id)));

drop policy if exists "Participants can view bookings" on public.bookings;
drop policy if exists "Users with booking permissions can view bookings" on public.bookings;
create policy "Users with booking permissions can view bookings"
on public.bookings for select
to authenticated
using ((select private.can_access_booking(id)));

drop policy if exists "Users can view their notifications" on public.notifications;
drop policy if exists "Users with notification permissions can view notifications"
  on public.notifications;
create policy "Users with notification permissions can view notifications"
on public.notifications for select
to authenticated
using (
  recipient_id = (select auth.uid())
  and exists (
    select 1
    from public.user_profiles profile
    where profile.user_id = (select auth.uid())
      and profile.status = 'approved'
      and (
        select private.has_permission(
          profile.user_id,
          profile.company_id,
          'notifications',
          'read',
          'own'
        )
      )
  )
);

commit;
