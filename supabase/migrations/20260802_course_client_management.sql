-- Owner und zuständige Trainer können freigegebene Kunden zu Gruppenkursen hinzufügen.
-- Nach 20260802_personal_training_workflow.sql ausführen (verwendet notifications).
begin;

alter table public.course_enrollments
  add column if not exists status text not null default 'confirmed';
alter table public.course_enrollments
  add column if not exists source text not null default 'customer';
alter table public.course_enrollments
  add column if not exists assigned_by uuid references auth.users(id) on delete set null;
alter table public.course_enrollments
  add column if not exists removed_at timestamptz;
alter table public.course_enrollments
  add column if not exists updated_at timestamptz not null default now();

alter table public.course_enrollments
  drop constraint if exists course_enrollments_status_check;
alter table public.course_enrollments
  add constraint course_enrollments_status_check
  check (status in ('confirmed', 'waitlisted', 'cancelled'));

alter table public.course_enrollments
  drop constraint if exists course_enrollments_source_check;
alter table public.course_enrollments
  add constraint course_enrollments_source_check
  check (source in ('owner', 'trainer', 'customer', 'import'));

create index if not exists idx_course_enrollments_course_status
  on public.course_enrollments(course_id, status);

drop trigger if exists course_enrollments_set_updated_at on public.course_enrollments;
create trigger course_enrollments_set_updated_at
before update on public.course_enrollments
for each row execute procedure private.set_updated_at();

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

  if not exists (
    select 1
    from public.user_profiles actor
    where actor.user_id = (select auth.uid())
      and actor.company_id = course_record.company_id
      and actor.status = 'approved'
      and (
        actor.role = 'owner'
        or (actor.role = 'trainer' and course_record.trainer_id = actor.user_id)
      )
  ) then
    raise exception 'No tienes permiso para gestionar los clientes de este curso.';
  end if;

  return query
  select
    profile.user_id,
    profile.first_name,
    profile.last_name,
    enrollment.status,
    enrollment.enrolled_at
  from public.user_profiles profile
  left join public.course_enrollments enrollment
    on enrollment.course_id = course_record.id
   and enrollment.user_id = profile.user_id
  where profile.company_id = course_record.company_id
    and profile.role = 'customer'
    and profile.status = 'approved'
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
  actor_role text;
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
    raise exception 'La selección contiene clientes duplicados.';
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

  select actor.role
  into actor_role
  from public.user_profiles actor
  where actor.user_id = (select auth.uid())
    and actor.company_id = course_record.company_id
    and actor.status = 'approved'
    and (
      actor.role = 'owner'
      or (actor.role = 'trainer' and course_record.trainer_id = actor.user_id)
    );

  if actor_role is null then
    raise exception 'No tienes permiso para añadir clientes a este curso.';
  end if;

  select count(*)
  into matching_customer_count
  from public.user_profiles profile
  where profile.user_id = any(target_customer_ids)
    and profile.company_id = course_record.company_id
    and profile.role = 'customer'
    and profile.status = 'approved';

  if matching_customer_count <> selected_count then
    raise exception 'Uno o varios clientes no están aprobados o pertenecen a otra sede.';
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
      raise exception 'El curso está lleno y no tiene lista de espera.';
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
      actor_role,
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
        then 'Inscripción confirmada'
        else 'Lista de espera'
      end,
      case when next_status = 'confirmed'
        then format('Has sido añadido a %s%s.', course_record.title,
          case when course_record.level is null then '' else ' · Nivel ' || lower(course_record.level) end)
        else format('Has sido añadido a la lista de espera de %s%s.', course_record.title,
          case when course_record.level is null then '' else ' · Nivel ' || lower(course_record.level) end)
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

revoke all on function public.get_course_clients(uuid) from public, anon;
revoke all on function public.add_clients_to_course(uuid, uuid[]) from public, anon;
grant execute on function public.get_course_clients(uuid) to authenticated;
grant execute on function public.add_clients_to_course(uuid, uuid[]) to authenticated;

commit;
