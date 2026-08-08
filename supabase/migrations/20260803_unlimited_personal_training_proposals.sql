-- Hebt die Vier-Wochen- und Mengenbegrenzung fuer Personal-Training-Vorschlaege auf.
-- Vergangene Termine sowie die Dauergrenzen von 30 Minuten bis 4 Stunden bleiben bestehen.
-- Nach 20260803_client_permission_resolution.sql ausfuehren.
begin;

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
begin
  if jsonb_typeof(proposed_slots) <> 'array' then
    raise exception 'Los horarios propuestos deben enviarse como una lista.';
  end if;

  slot_count := jsonb_array_length(proposed_slots);
  if slot_count < 1 then
    raise exception 'Selecciona al menos un horario.';
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

    if slot_start <= now() then
      raise exception 'Todos los horarios deben estar en el futuro.';
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
  if selected_count < 1 then
    raise exception 'Selecciona al menos un horario.';
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

revoke all on function public.propose_personal_training_slots(uuid, jsonb) from public, anon;
revoke all on function public.confirm_personal_training_slots(uuid, uuid[]) from public, anon;
grant execute on function public.propose_personal_training_slots(uuid, jsonb) to authenticated;
grant execute on function public.confirm_personal_training_slots(uuid, uuid[]) to authenticated;

commit;
