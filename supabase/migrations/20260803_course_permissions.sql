-- Etappe 3: Kursansicht und Kursverwaltung ueber Berechtigungen und Scopes absichern.
-- Nach 20260803_member_permissions.sql ausfuehren.
begin;

do $$
begin
  if to_regclass('public.roles') is null
    or to_regclass('public.permissions') is null
    or to_regclass('public.role_permissions') is null
    or to_regclass('public.user_roles') is null then
    raise exception 'Zuerst 20260803_role_based_access_control.sql ausfuehren.';
  end if;

  if exists (
    select required.code
    from (
      values
        ('courses.read'),
        ('courses.create'),
        ('courses.update'),
        ('courses.assign_trainer'),
        ('courses.assign_clients')
    ) as required(code)
    where not exists (
      select 1
      from public.permissions permission_record
      where permission_record.code = required.code
    )
  ) then
    raise exception 'Eine oder mehrere erforderliche Kursberechtigungen fehlen.';
  end if;
end;
$$;

create or replace function private.can_view_course(target_course_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.courses course
    where course.id = target_course_id
      and (
        (
          select private.has_permission(
            (select auth.uid()),
            course.company_id,
            'courses',
            'read',
            'all'
          )
        )
        or (
          course.trainer_id = (select auth.uid())
          and (
            select private.has_permission(
              (select auth.uid()),
              course.company_id,
              'courses',
              'read',
              'assigned'
            )
          )
        )
        or (
          course.published
          and (
            select private.has_permission(
              (select auth.uid()),
              course.company_id,
              'courses',
              'read',
              'eligible'
            )
          )
          and (
            course.level is null
            or exists (
              select 1
              from public.customer_category_levels customer_level
              where customer_level.customer_id = (select auth.uid())
                and customer_level.company_id = course.company_id
                and customer_level.category = upper(btrim(course.category))
                and customer_level.level = course.level
            )
          )
        )
      )
  );
$$;

create or replace function private.can_view_enrollment(
  target_course_id uuid,
  enrollment_user_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    (select auth.uid()) = enrollment_user_id
    or exists (
      select 1
      from public.courses course
      where course.id = target_course_id
        and (
          (
            select private.has_permission(
              (select auth.uid()),
              course.company_id,
              'courses',
              'assign_clients',
              'all'
            )
          )
          or (
            course.trainer_id = (select auth.uid())
            and (
              select private.has_permission(
                (select auth.uid()),
                course.company_id,
                'courses',
                'assign_clients',
                'assigned'
              )
            )
          )
        )
    );
$$;

create or replace function public.create_course(
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
  actor_company_id uuid;
  created_course_id uuid;
begin
  select profile.company_id
  into actor_company_id
  from public.user_profiles profile
  where profile.user_id = (select auth.uid())
    and profile.status = 'approved'
    and (
      select private.has_permission(
        profile.user_id,
        profile.company_id,
        'courses',
        'create',
        'all'
      )
    )
    and (
      select private.has_permission(
        profile.user_id,
        profile.company_id,
        'courses',
        'assign_trainer',
        'all'
      )
    );

  if actor_company_id is null then
    raise exception 'No tienes permiso para crear cursos y asignar entrenadores.';
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
      and trainer.company_id = actor_company_id
      and trainer.status = 'approved'
      and (
        select private.has_permission(
          trainer.user_id,
          trainer.company_id,
          'courses',
          'update',
          'assigned'
        )
      )
  ) then
    raise exception 'La persona seleccionada no puede gestionar cursos asignados en esta sede.';
  end if;

  insert into public.courses (
    company_id,
    trainer_id,
    title,
    category,
    level,
    format,
    repetition,
    weekdays,
    start_time,
    end_time,
    start_date,
    end_date,
    max_participants,
    price,
    room,
    waitlist_enabled,
    approval_required,
    published
  )
  values (
    actor_company_id,
    p_trainer_id,
    btrim(p_title),
    coalesce(nullif(btrim(p_category), ''), 'ET'),
    p_level,
    'group',
    p_repetition,
    case when p_repetition = 'weekly' then p_weekdays else '{}'::text[] end,
    p_start_time,
    p_end_time,
    case when p_repetition = 'once' then p_start_date else null end,
    case when p_repetition = 'once' then p_end_date else null end,
    p_max_participants,
    coalesce(nullif(btrim(p_price), ''), 'Incluido'),
    coalesce(nullif(btrim(p_room), ''), 'Sala principal'),
    coalesce(p_waitlist_enabled, true),
    coalesce(p_approval_required, false),
    coalesce(p_published, false)
  )
  returning id into created_course_id;

  return created_course_id;
end;
$$;

-- Zeigt aktive Teilnehmer auch nach einer Levelaenderung, bietet aber nur passende neue Kunden an.
create or replace function public.get_course_clients(target_course_id uuid)
returns table (
  user_id uuid,
  first_name text,
  last_name text,
  enrollment_status text,
  enrolled_at timestamptz
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
  where course.id = target_course_id;

  if not found then
    raise exception 'El curso no existe.';
  end if;

  if not (
    (
      select private.has_permission(
        (select auth.uid()),
        course_record.company_id,
        'courses',
        'assign_clients',
        'all'
      )
    )
    or (
      course_record.trainer_id = (select auth.uid())
      and (
        select private.has_permission(
          (select auth.uid()),
          course_record.company_id,
          'courses',
          'assign_clients',
          'assigned'
        )
      )
    )
  ) then
    raise exception 'No tienes permiso para gestionar los clientes de este curso.';
  end if;

  return query
  select
    profile.user_id::uuid,
    profile.first_name::text,
    profile.last_name::text,
    enrollment.status::text,
    enrollment.enrolled_at::timestamptz
  from public.user_profiles profile
  left join public.course_enrollments enrollment
    on enrollment.course_id = course_record.id
   and enrollment.user_id = profile.user_id
  where profile.company_id = course_record.company_id
    and profile.status = 'approved'
    and (
      select private.has_role(profile.user_id, profile.company_id, 'customer')
    )
    and (
      enrollment.status in ('confirmed', 'waitlisted')
      or course_record.level is null
      or exists (
        select 1
        from public.customer_category_levels customer_level
        where customer_level.customer_id = profile.user_id
          and customer_level.company_id = course_record.company_id
          and customer_level.category = upper(btrim(course_record.category))
          and customer_level.level = course_record.level
      )
    )
  order by profile.last_name nulls last, profile.first_name nulls last;
end;
$$;

create or replace function public.add_clients_to_course(
  target_course_id uuid,
  target_customer_ids uuid[]
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  course_record public.courses%rowtype;
  actor_source text;
  selected_count integer;
  distinct_count integer;
  matching_customer_count integer;
  confirmed_count integer;
  capacity_limit integer;
  customer_id uuid;
  existing_status text;
  next_status text;
  confirmed_added integer := 0;
  waitlisted_added integer := 0;
  skipped_count integer := 0;
begin
  selected_count := cardinality(coalesce(target_customer_ids, '{}'::uuid[]));
  if selected_count < 1 or selected_count > 100 then
    raise exception 'Selecciona entre 1 y 100 clientes.';
  end if;

  select count(distinct selected_id)
  into distinct_count
  from unnest(target_customer_ids) as selected(selected_id);

  if distinct_count <> selected_count then
    raise exception 'La seleccion contiene clientes duplicados.';
  end if;

  select course.*
  into course_record
  from public.courses course
  where course.id = target_course_id
    and course.format = 'group'
  for update;

  if not found then
    raise exception 'El curso no existe o no es un curso de grupo.';
  end if;

  if (
    select private.has_permission(
      (select auth.uid()),
      course_record.company_id,
      'courses',
      'assign_clients',
      'all'
    )
  ) then
    actor_source := 'owner';
  elsif course_record.trainer_id = (select auth.uid())
    and (
      select private.has_permission(
        (select auth.uid()),
        course_record.company_id,
        'courses',
        'assign_clients',
        'assigned'
      )
    ) then
    actor_source := 'trainer';
  else
    raise exception 'No tienes permiso para anadir clientes a este curso.';
  end if;

  select count(*)
  into matching_customer_count
  from public.user_profiles profile
  where profile.user_id = any(target_customer_ids)
    and profile.company_id = course_record.company_id
    and profile.status = 'approved'
    and (
      select private.has_role(profile.user_id, profile.company_id, 'customer')
    );

  if matching_customer_count <> selected_count then
    raise exception 'Uno o varios clientes no estan aprobados o pertenecen a otra sede.';
  end if;

  select count(*)
  into confirmed_count
  from public.course_enrollments enrollment
  where enrollment.course_id = course_record.id
    and enrollment.status = 'confirmed';

  capacity_limit := coalesce(course_record.max_participants, 2147483647);

  for customer_id in
    select selected.selected_id
    from unnest(target_customer_ids) with ordinality as selected(selected_id, position)
    order by selected.position
  loop
    existing_status := null;
    select enrollment.status
    into existing_status
    from public.course_enrollments enrollment
    where enrollment.course_id = course_record.id
      and enrollment.user_id = customer_id;

    if existing_status in ('confirmed', 'waitlisted') then
      skipped_count := skipped_count + 1;
      continue;
    end if;

    if confirmed_count < capacity_limit then
      next_status := 'confirmed';
      confirmed_count := confirmed_count + 1;
      confirmed_added := confirmed_added + 1;
    elsif course_record.waitlist_enabled then
      next_status := 'waitlisted';
      waitlisted_added := waitlisted_added + 1;
    else
      raise exception 'El curso esta lleno y no tiene lista de espera.';
    end if;

    insert into public.course_enrollments (
      course_id,
      user_id,
      status,
      source,
      assigned_by,
      enrolled_at,
      removed_at
    )
    values (
      course_record.id,
      customer_id,
      next_status,
      actor_source,
      (select auth.uid()),
      now(),
      null
    )
    on conflict (course_id, user_id) do update
    set
      status = excluded.status,
      source = excluded.source,
      assigned_by = excluded.assigned_by,
      enrolled_at = excluded.enrolled_at,
      removed_at = null;

    insert into public.notifications (recipient_id, type, title, body, payload)
    values (
      customer_id,
      case when next_status = 'confirmed'
        then 'course_enrollment_confirmed'
        else 'course_enrollment_waitlisted'
      end,
      case when next_status = 'confirmed'
        then 'Inscripcion confirmada'
        else 'Lista de espera'
      end,
      case when next_status = 'confirmed'
        then format('Has sido anadido a %s%s.', course_record.title,
          case when course_record.level is null then '' else ' - Nivel ' || lower(course_record.level) end)
        else format('Has sido anadido a la lista de espera de %s%s.', course_record.title,
          case when course_record.level is null then '' else ' - Nivel ' || lower(course_record.level) end)
      end,
      jsonb_build_object(
        'course_id', course_record.id,
        'enrollment_status', next_status
      )
    );
  end loop;

  return jsonb_build_object(
    'confirmed', confirmed_added,
    'waitlisted', waitlisted_added,
    'skipped', skipped_count
  );
end;
$$;

revoke all on function private.can_view_course(uuid) from public;
revoke all on function private.can_view_enrollment(uuid, uuid) from public;
revoke all on function public.create_course(
  text, text, text, uuid, text, text[], time, time, timestamptz, timestamptz,
  integer, text, text, boolean, boolean, boolean
) from public, anon;
revoke all on function public.get_course_clients(uuid) from public, anon;
revoke all on function public.add_clients_to_course(uuid, uuid[]) from public, anon;
grant execute on function private.can_view_course(uuid) to authenticated;
grant execute on function private.can_view_enrollment(uuid, uuid) to authenticated;
grant execute on function public.create_course(
  text, text, text, uuid, text, text[], time, time, timestamptz, timestamptz,
  integer, text, text, boolean, boolean, boolean
) to authenticated;
grant execute on function public.get_course_clients(uuid) to authenticated;
grant execute on function public.add_clients_to_course(uuid, uuid[]) to authenticated;

drop policy if exists "Courses are viewable by approved users" on public.courses;
drop policy if exists "Approved members can view courses" on public.courses;
drop policy if exists "Users with course permissions can view courses" on public.courses;
create policy "Users with course permissions can view courses"
on public.courses for select
to authenticated
using ((select private.can_view_course(id)));

drop policy if exists "Users can view permitted enrollments" on public.course_enrollments;
drop policy if exists "Users with enrollment permissions can view enrollments"
  on public.course_enrollments;
create policy "Users with enrollment permissions can view enrollments"
on public.course_enrollments for select
to authenticated
using ((select private.can_view_enrollment(course_id, user_id)));

commit;
