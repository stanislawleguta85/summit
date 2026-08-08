-- Erlaubt Ownern, vollstaendig unbelegte Gruppenkurse sicher zu bearbeiten.
begin;

create or replace function public.get_course_editability(
  target_course_id uuid
)
returns table (
  can_edit boolean,
  enrollment_count integer,
  booking_count integer,
  related_change_count integer
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  course_record public.courses%rowtype;
begin
  select course.*
  into course_record
  from public.courses course
  where course.id = target_course_id
    and course.format = 'group';

  if not found then
    raise exception 'El curso no existe o no es un curso de grupo.';
  end if;

  if not (
    (select private.has_permission(
      (select auth.uid()), course_record.company_id, 'courses', 'update', 'all'
    ))
    and (select private.has_permission(
      (select auth.uid()), course_record.company_id, 'courses', 'assign_trainer', 'all'
    ))
    and (select private.has_permission(
      (select auth.uid()), course_record.company_id, 'courses', 'publish', 'all'
    ))
  ) then
    raise exception 'No tienes permiso para editar este curso.';
  end if;

  return query
  with edit_counts as (
    select
      (
        select count(*)::integer
        from public.course_enrollments enrollment
        where enrollment.course_id = course_record.id
      ) as enrollments,
      (
        select count(*)::integer
        from public.bookings booking
        join public.course_sessions session on session.id = booking.session_id
        where session.course_id = course_record.id
      ) as bookings,
      (
        select count(*)::integer
        from public.booking_change_requests change_request
        where change_request.original_session_id in (
            select session.id
            from public.course_sessions session
            where session.course_id = course_record.id
          )
          or change_request.recovered_session_id in (
            select session.id
            from public.course_sessions session
            where session.course_id = course_record.id
          )
          or change_request.notified_session_id in (
            select session.id
            from public.course_sessions session
            where session.course_id = course_record.id
          )
      ) as changes
  )
  select
    edit_counts.enrollments = 0
      and edit_counts.bookings = 0
      and edit_counts.changes = 0,
    edit_counts.enrollments,
    edit_counts.bookings,
    edit_counts.changes
  from edit_counts;
end;
$$;

create or replace function public.update_unoccupied_course(
  target_course_id uuid,
  p_title text,
  p_category text,
  p_level text,
  p_trainer_id uuid,
  p_repetition text,
  p_weekdays text[],
  p_start_time time,
  p_end_time time,
  p_start_date timestamptz,
  p_end_date timestamptz,
  p_max_participants integer,
  p_price text,
  p_room text,
  p_waitlist_enabled boolean,
  p_approval_required boolean,
  p_published boolean
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  course_record public.courses%rowtype;
begin
  select course.*
  into course_record
  from public.courses course
  where course.id = target_course_id
    and course.format = 'group'
  for update;

  if not found then
    raise exception 'El curso no existe o no es un curso de grupo.';
  end if;

  if not (
    (select private.has_permission(
      (select auth.uid()), course_record.company_id, 'courses', 'update', 'all'
    ))
    and (select private.has_permission(
      (select auth.uid()), course_record.company_id, 'courses', 'assign_trainer', 'all'
    ))
    and (select private.has_permission(
      (select auth.uid()), course_record.company_id, 'courses', 'publish', 'all'
    ))
  ) then
    raise exception 'No tienes permiso para editar este curso.';
  end if;

  if exists (
    select 1
    from public.course_enrollments enrollment
    where enrollment.course_id = course_record.id
  ) or exists (
    select 1
    from public.bookings booking
    join public.course_sessions session on session.id = booking.session_id
    where session.course_id = course_record.id
  ) or exists (
    select 1
    from public.booking_change_requests change_request
    where change_request.original_session_id in (
        select session.id
        from public.course_sessions session
        where session.course_id = course_record.id
      )
      or change_request.recovered_session_id in (
        select session.id
        from public.course_sessions session
        where session.course_id = course_record.id
      )
      or change_request.notified_session_id in (
        select session.id
        from public.course_sessions session
        where session.course_id = course_record.id
      )
  ) then
    raise exception 'Este curso ya tiene inscripciones o reservas y no se puede editar.';
  end if;

  if nullif(btrim(p_title), '') is null or char_length(btrim(p_title)) > 120 then
    raise exception 'El nombre del curso debe tener entre 1 y 120 caracteres.';
  end if;

  if p_repetition not in ('once', 'weekly') then
    raise exception 'La repeticion no es valida.';
  end if;

  if p_level not in ('Bajo', 'Medio', 'Alto') then
    raise exception 'El nivel debe ser Bajo, Medio o Alto.';
  end if;

  if p_start_time is null or p_end_time is null or p_end_time <= p_start_time then
    raise exception 'La hora final debe ser posterior a la hora inicial.';
  end if;

  if p_repetition = 'once'
    and (p_start_date is null or p_end_date is null or p_end_date <= p_start_date) then
    raise exception 'Un curso unico necesita una fecha valida.';
  end if;

  if p_repetition = 'weekly' and (
    cardinality(coalesce(p_weekdays, '{}'::text[])) = 0
    or exists (
      select 1
      from unnest(coalesce(p_weekdays, '{}'::text[])) as selected_weekday(value)
      where value not in ('L', 'M', 'X', 'J', 'V', 'S', 'D')
    )
  ) then
    raise exception 'Selecciona al menos un dia de la semana valido.';
  end if;

  if p_max_participants is null or p_max_participants < 1 or p_max_participants > 1000 then
    raise exception 'La capacidad debe estar entre 1 y 1000.';
  end if;

  if not exists (
    select 1
    from public.user_profiles trainer
    where trainer.user_id = p_trainer_id
      and trainer.company_id = course_record.company_id
      and trainer.status = 'approved'
      and (select private.has_permission(
        trainer.user_id, trainer.company_id, 'courses', 'update', 'assigned'
      ))
  ) then
    raise exception 'La persona seleccionada no puede gestionar cursos asignados en esta sede.';
  end if;

  -- Leere, automatisch erzeugte Sitzungen muessen nach einer Zeitplan-Aenderung
  -- aus den neuen Kursdaten erneut aufgebaut werden.
  delete from public.course_sessions session
  where session.course_id = course_record.id;

  update public.courses course
  set
    trainer_id = p_trainer_id,
    title = btrim(p_title),
    category = coalesce(nullif(btrim(p_category), ''), 'ET'),
    level = p_level,
    repetition = p_repetition,
    weekdays = case
      when p_repetition = 'weekly' then p_weekdays
      else '{}'::text[]
    end,
    start_time = p_start_time,
    end_time = p_end_time,
    start_date = case when p_repetition = 'once' then p_start_date else null end,
    end_date = case when p_repetition = 'once' then p_end_date else null end,
    max_participants = p_max_participants,
    price = coalesce(nullif(btrim(p_price), ''), 'Incluido'),
    room = coalesce(nullif(btrim(p_room), ''), 'Sala principal'),
    waitlist_enabled = coalesce(p_waitlist_enabled, true),
    approval_required = coalesce(p_approval_required, false),
    published = coalesce(p_published, false)
  where course.id = course_record.id;

  return course_record.id;
end;
$$;

revoke all on function public.get_course_editability(uuid) from public, anon;
revoke all on function public.update_unoccupied_course(
  uuid, text, text, text, uuid, text, text[], time, time, timestamptz,
  timestamptz, integer, text, text, boolean, boolean, boolean
) from public, anon;

grant execute on function public.get_course_editability(uuid) to authenticated;
grant execute on function public.update_unoccupied_course(
  uuid, text, text, text, uuid, text, text[], time, time, timestamptz,
  timestamptz, integer, text, text, boolean, boolean, boolean
) to authenticated;

commit;

select
  to_regprocedure('public.get_course_editability(uuid)') is not null
    as course_editability_function_exists,
  to_regprocedure(
    'public.update_unoccupied_course(uuid,text,text,text,uuid,text,text[],time without time zone,time without time zone,timestamp with time zone,timestamp with time zone,integer,text,text,boolean,boolean,boolean)'
  ) is not null as unoccupied_course_update_function_exists,
  has_function_privilege(
    'authenticated',
    'public.get_course_editability(uuid)',
    'EXECUTE'
  ) as authenticated_can_check_course_editability,
  has_function_privilege(
    'authenticated',
    'public.update_unoccupied_course(uuid,text,text,text,uuid,text,text[],time without time zone,time without time zone,timestamp with time zone,timestamp with time zone,integer,text,text,boolean,boolean,boolean)',
    'EXECUTE'
  ) as authenticated_can_update_unoccupied_course;
