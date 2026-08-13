-- Umbuchungs- und Nachholprozess fuer Gruppen- und Individualtraining.
-- Fachregeln:
--   * Aenderungen sind bis einschliesslich vier Stunden vor Beginn erlaubt.
--   * Bei Gruppen wird der urspruengliche Platz beim Antrag sofort freigegeben.
--   * Bei Individualtraining bleibt der urspruengliche Termin bis zur Bestaetigung erhalten.
--   * Gruppenkurse koennen innerhalb von vier Wochen durch einen kompatiblen Termin ersetzt werden.
--   * Individualtraining erzeugt eine gekennzeichnete Ersatzanfrage, die bei Bedarf
--     von einem anderen Trainer uebernommen werden kann.
begin;

alter table public.companies
  add column if not exists timezone text not null default 'Europe/Madrid';

create unique index if not exists course_sessions_course_start_key
  on public.course_sessions(course_id, start_at)
  where course_id is not null;

create table if not exists public.booking_change_requests (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  customer_id uuid not null references auth.users(id) on delete cascade,
  change_kind text not null check (change_kind in ('group', 'personal')),
  original_booking_id uuid not null references public.bookings(id) on delete restrict,
  original_session_id uuid not null references public.course_sessions(id) on delete restrict,
  original_course_id uuid references public.courses(id) on delete set null,
  original_trainer_id uuid not null references auth.users(id) on delete restrict,
  original_start_at timestamptz not null,
  original_end_at timestamptz not null,
  original_category text,
  original_level text,
  reason text not null check (char_length(btrim(reason)) between 3 and 1000),
  status text not null default 'lost'
    check (status in ('pending', 'lost', 'recovered', 'rejected')),
  recovery_deadline timestamptz not null,
  recovered_booking_id uuid references public.bookings(id) on delete set null,
  recovered_session_id uuid references public.course_sessions(id) on delete set null,
  recovered_at timestamptz,
  waitlist_status text not null default 'none'
    check (waitlist_status in ('none', 'waiting', 'notified')),
  notified_session_id uuid references public.course_sessions(id) on delete set null,
  notified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (original_booking_id),
  check (original_end_at > original_start_at),
  check (recovery_deadline = original_start_at + interval '4 weeks'),
  check (
    (status in ('pending', 'lost', 'rejected')
      and recovered_booking_id is null
      and recovered_session_id is null
      and recovered_at is null)
    or
    (status = 'recovered' and recovered_booking_id is not null and recovered_session_id is not null and recovered_at is not null)
  )
);

create index if not exists idx_booking_changes_customer_created
  on public.booking_change_requests(customer_id, created_at desc);
create index if not exists idx_booking_changes_company_status
  on public.booking_change_requests(company_id, status, created_at desc);
create index if not exists idx_booking_changes_waiting
  on public.booking_change_requests(company_id, recovery_deadline)
  where status = 'lost' and waitlist_status = 'waiting';

drop trigger if exists booking_change_requests_set_updated_at
  on public.booking_change_requests;
create trigger booking_change_requests_set_updated_at
before update on public.booking_change_requests
for each row execute procedure private.set_updated_at();

alter table public.personal_training_requests
  add column if not exists change_request_id uuid
  references public.booking_change_requests(id) on delete set null;

drop index if exists public.personal_training_one_open_request_per_customer;
create unique index personal_training_one_open_request_per_customer
  on public.personal_training_requests(customer_id)
  where status in ('requested', 'proposed')
    and change_request_id is null;

create unique index if not exists personal_training_requests_change_key
  on public.personal_training_requests(change_request_id)
  where change_request_id is not null;

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
      and request.change_request_id is null
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

insert into public.permissions (resource, action, name, description)
values
  ('booking_changes', 'read', 'Ver cambios', 'Consultar solicitudes de cambio permitidas.'),
  ('booking_changes', 'create', 'Solicitar cambios', 'Cancelar a tiempo y solicitar una recuperacion.'),
  ('booking_changes', 'update', 'Gestionar cambios', 'Elegir una recuperacion o entrar en lista de espera.')
on conflict (resource, action) do update
set name = excluded.name, description = excluded.description;

insert into public.role_permissions (role_id, permission_id, scope)
select role_record.id, permission_record.id, grant_record.scope
from (
  values
    ('owner', 'read', 'all'),
    ('trainer', 'read', 'assigned'),
    ('customer', 'read', 'own'),
    ('customer', 'create', 'own'),
    ('customer', 'update', 'own')
) as grant_record(role_code, action, scope)
join public.roles role_record
  on role_record.code = grant_record.role_code
 and role_record.company_id is null
join public.permissions permission_record
  on permission_record.resource = 'booking_changes'
 and permission_record.action = grant_record.action
on conflict (role_id, permission_id, scope) do nothing;

create or replace function private.ensure_group_course_sessions(
  target_company_id uuid,
  range_start date,
  range_end date
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if range_start is null or range_end is null or range_end < range_start then
    raise exception 'El intervalo del calendario no es valido.';
  end if;

  if range_end - range_start > 70 then
    raise exception 'El intervalo del calendario es demasiado amplio.';
  end if;

  insert into public.course_sessions (
    company_id,
    course_id,
    trainer_id,
    start_at,
    end_at,
    capacity,
    room
  )
  select
    course.company_id,
    course.id,
    course.trainer_id,
    course.start_date,
    course.end_date,
    greatest(coalesce(course.max_participants, 1), 1),
    course.room
  from public.courses course
  where course.company_id = target_company_id
    and course.format = 'group'
    and course.published
    and course.repetition = 'once'
    and course.start_date is not null
    and course.end_date is not null
    and course.start_date::date between range_start and range_end
  on conflict (course_id, start_at) where course_id is not null do nothing;

  insert into public.course_sessions (
    company_id,
    course_id,
    trainer_id,
    start_at,
    end_at,
    capacity,
    room
  )
  select
    course.company_id,
    course.id,
    course.trainer_id,
    (generated.day_value::date + course.start_time)
      at time zone company.timezone,
    (generated.day_value::date + course.end_time)
      at time zone company.timezone,
    greatest(coalesce(course.max_participants, 1), 1),
    course.room
  from public.courses course
  join public.companies company on company.id = course.company_id
  cross join lateral generate_series(
    range_start::timestamp,
    range_end::timestamp,
    interval '1 day'
  ) as generated(day_value)
  where course.company_id = target_company_id
    and course.format = 'group'
    and course.published
    and course.repetition = 'weekly'
    and course.start_time is not null
    and course.end_time is not null
    and course.end_time > course.start_time
    and case extract(isodow from generated.day_value)::integer
      when 1 then 'L'
      when 2 then 'M'
      when 3 then 'X'
      when 4 then 'J'
      when 5 then 'V'
      when 6 then 'S'
      when 7 then 'D'
    end = any(course.weekdays)
  on conflict (course_id, start_at) where course_id is not null do nothing;

  insert into public.bookings (
    session_id,
    user_id,
    status,
    confirmed_at
  )
  select
    session.id,
    enrollment.user_id,
    'confirmed',
    coalesce(enrollment.enrolled_at, now())
  from public.course_sessions session
  join public.course_enrollments enrollment
    on enrollment.course_id = session.course_id
   and enrollment.status = 'confirmed'
  where session.company_id = target_company_id
    and session.course_id is not null
    and session.start_at::date between range_start and range_end
  on conflict (session_id, user_id) do nothing;
end;
$$;

create or replace function private.can_read_booking_change(target_change_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.booking_change_requests change_request
    where change_request.id = target_change_id
      and (
        (
          change_request.customer_id = (select auth.uid())
          and (
            select private.has_permission(
              (select auth.uid()), change_request.company_id,
              'booking_changes', 'read', 'own'
            )
          )
        )
        or (
          change_request.original_trainer_id = (select auth.uid())
          and (
            select private.has_permission(
              (select auth.uid()), change_request.company_id,
              'booking_changes', 'read', 'assigned'
            )
          )
        )
        or (
          exists (
            select 1
            from public.personal_training_requests request
            where request.change_request_id = change_request.id
              and request.trainer_id = (select auth.uid())
          )
          and (
            select private.has_permission(
              (select auth.uid()), change_request.company_id,
              'booking_changes', 'read', 'assigned'
            )
          )
        )
        or (
          select private.has_permission(
            (select auth.uid()), change_request.company_id,
            'booking_changes', 'read', 'all'
          )
        )
      )
  );
$$;

create or replace function public.get_my_calendar(
  window_start timestamptz,
  window_end timestamptz
)
returns table (
  booking_id uuid,
  session_id uuid,
  event_kind text,
  course_id uuid,
  personal_training_request_id uuid,
  trainer_id uuid,
  start_at timestamptz,
  end_at timestamptz,
  title text,
  category text,
  level text,
  room text,
  location text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  actor_company_id uuid;
  actor_timezone text;
begin
  if actor_id is null then
    raise exception 'Debes iniciar sesion.';
  end if;

  if window_start is null or window_end is null or window_end <= window_start
    or window_end - window_start > interval '70 days' then
    raise exception 'El intervalo del calendario no es valido.';
  end if;

  select profile.company_id, company.timezone
  into actor_company_id, actor_timezone
  from public.user_profiles profile
  join public.companies company on company.id = profile.company_id
  where profile.user_id = actor_id
    and profile.status = 'approved';

  if actor_company_id is null then
    raise exception 'No se encontro un perfil aprobado.';
  end if;

  perform private.ensure_group_course_sessions(
    actor_company_id,
    (window_start at time zone actor_timezone)::date,
    (window_end at time zone actor_timezone)::date
  );

  return query
  select
    booking.id,
    session.id,
    case when session.course_id is null then 'personal' else 'group' end,
    session.course_id,
    session.personal_training_request_id,
    session.trainer_id,
    session.start_at,
    session.end_at,
    case
      when session.course_id is null then 'Entrenamiento individual'
      else coalesce(course.title, 'Curso de grupo')
    end,
    course.category,
    course.level,
    session.room,
    session.location
  from public.bookings booking
  join public.course_sessions session on session.id = booking.session_id
  left join public.courses course on course.id = session.course_id
  where booking.user_id = actor_id
    and booking.status = 'confirmed'
    and session.status = 'scheduled'
    and session.start_at >= window_start
    and session.start_at < window_end
  order by session.start_at;
end;
$$;

create or replace function private.notify_group_change_waiters(freed_session_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  freed_session public.course_sessions%rowtype;
  freed_course public.courses%rowtype;
begin
  select session.* into freed_session
  from public.course_sessions session
  where session.id = freed_session_id
    and session.course_id is not null
    and session.status = 'scheduled';

  if not found then return; end if;

  select course.* into freed_course
  from public.courses course
  where course.id = freed_session.course_id;

  insert into public.notifications (recipient_id, type, title, body, payload)
  select
    change_request.customer_id,
    'booking_change_slot_available',
    'Hay una plaza disponible',
    format('Se ha liberado una plaza para %s.', coalesce(freed_course.title, 'tu curso')),
    jsonb_build_object(
      'change_request_id', change_request.id,
      'session_id', freed_session.id,
      'route', '/booking-change/' || change_request.id::text
    )
  from public.booking_change_requests change_request
  where change_request.company_id = freed_session.company_id
    and change_request.change_kind = 'group'
    and change_request.status = 'lost'
    and change_request.waitlist_status = 'waiting'
    and now() <= change_request.recovery_deadline
    and freed_session.start_at >= now()
    and freed_session.start_at <= change_request.recovery_deadline
    and freed_session.end_at - freed_session.start_at =
      change_request.original_end_at - change_request.original_start_at
    and change_request.original_category is not distinct from freed_course.category
    and change_request.original_level is not distinct from freed_course.level
    and not exists (
      select 1 from public.bookings existing_booking
      where existing_booking.session_id = freed_session.id
        and existing_booking.user_id = change_request.customer_id
        and existing_booking.status = 'confirmed'
    );

  update public.booking_change_requests change_request
  set
    waitlist_status = 'notified',
    notified_session_id = freed_session.id,
    notified_at = now()
  where change_request.company_id = freed_session.company_id
    and change_request.change_kind = 'group'
    and change_request.status = 'lost'
    and change_request.waitlist_status = 'waiting'
    and now() <= change_request.recovery_deadline
    and freed_session.start_at >= now()
    and freed_session.start_at <= change_request.recovery_deadline
    and freed_session.end_at - freed_session.start_at =
      change_request.original_end_at - change_request.original_start_at
    and change_request.original_category is not distinct from freed_course.category
    and change_request.original_level is not distinct from freed_course.level
    and not exists (
      select 1 from public.bookings existing_booking
      where existing_booking.session_id = freed_session.id
        and existing_booking.user_id = change_request.customer_id
        and existing_booking.status = 'confirmed'
    );
end;
$$;

create or replace function private.notify_waiters_after_booking_cancelled()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.status = 'confirmed' and new.status = 'cancelled' then
    perform private.notify_group_change_waiters(new.session_id);
  end if;
  return new;
end;
$$;

drop trigger if exists bookings_notify_change_waiters on public.bookings;
create trigger bookings_notify_change_waiters
after update of status on public.bookings
for each row execute procedure private.notify_waiters_after_booking_cancelled();

create or replace function public.request_booking_change(
  target_booking_id uuid,
  change_reason text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  booking_record public.bookings%rowtype;
  session_record public.course_sessions%rowtype;
  course_record public.courses%rowtype;
  created_change_id uuid;
  created_replacement_request_id uuid;
begin
  if actor_id is null then raise exception 'Debes iniciar sesion.'; end if;

  if char_length(btrim(coalesce(change_reason, ''))) not between 3 and 1000 then
    raise exception 'Indica el motivo del cambio.';
  end if;

  select booking.* into booking_record
  from public.bookings booking
  where booking.id = target_booking_id
    and booking.user_id = actor_id
    and booking.status = 'confirmed'
  for update;

  if not found then raise exception 'La reserva ya no se puede cambiar.'; end if;

  select session.* into session_record
  from public.course_sessions session
  where session.id = booking_record.session_id
    and session.status = 'scheduled'
  for update;

  if not found then raise exception 'El entrenamiento ya no esta programado.'; end if;

  if now() > session_record.start_at - interval '4 hours' then
    raise exception 'Los cambios requieren al menos 4 horas de antelacion.';
  end if;

  if not (
    select private.has_permission(
      actor_id, session_record.company_id, 'booking_changes', 'create', 'own'
    )
  ) then
    raise exception 'No tienes permiso para solicitar este cambio.';
  end if;

  if session_record.course_id is not null then
    select course.* into course_record
    from public.courses course
    where course.id = session_record.course_id
      and course.format = 'group';

    if not found then raise exception 'El curso original no es valido.'; end if;
  end if;

  insert into public.booking_change_requests (
    company_id,
    customer_id,
    change_kind,
    original_booking_id,
    original_session_id,
    original_course_id,
    original_trainer_id,
    original_start_at,
    original_end_at,
    original_category,
    original_level,
    reason,
    status,
    recovery_deadline
  )
  values (
    session_record.company_id,
    actor_id,
    case when session_record.course_id is null then 'personal' else 'group' end,
    booking_record.id,
    session_record.id,
    session_record.course_id,
    session_record.trainer_id,
    session_record.start_at,
    session_record.end_at,
    course_record.category,
    course_record.level,
    btrim(change_reason),
    case when session_record.course_id is null then 'pending' else 'lost' end,
    session_record.start_at + interval '4 weeks'
  )
  returning id into created_change_id;

  if session_record.course_id is null then
    insert into public.personal_training_requests (
      company_id,
      customer_id,
      trainer_id,
      status,
      change_request_id
    )
    values (
      session_record.company_id,
      actor_id,
      session_record.trainer_id,
      'requested',
      created_change_id
    )
    returning id into created_replacement_request_id;

    insert into public.notifications (recipient_id, type, title, body, payload)
    values (
      session_record.trainer_id,
      'personal_training_replacement_requested',
      'Solicitud de horario alternativo',
      'Un cliente solicita cambiar un entrenamiento existente. La cita original sigue reservada.',
      jsonb_build_object(
        'request_id', created_replacement_request_id,
        'change_request_id', created_change_id,
        'route', '/training-request/' || created_replacement_request_id::text
      )
    );
  else
    update public.bookings
    set status = 'cancelled', cancelled_at = now()
    where id = booking_record.id;
  end if;

  return created_change_id;
end;
$$;

create or replace function public.get_booking_change_alternatives(target_change_id uuid)
returns table (
  session_id uuid,
  course_id uuid,
  trainer_id uuid,
  start_at timestamptz,
  end_at timestamptz,
  title text,
  category text,
  level text,
  room text,
  available_places integer
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  change_record public.booking_change_requests%rowtype;
  change_timezone text;
begin
  select change_request.* into change_record
  from public.booking_change_requests change_request
  where change_request.id = target_change_id
    and change_request.customer_id = actor_id
    and change_request.change_kind = 'group'
    and change_request.status = 'lost';

  if not found then raise exception 'La solicitud de cambio no esta disponible.'; end if;

  select company.timezone into change_timezone
  from public.companies company
  where company.id = change_record.company_id;

  perform private.ensure_group_course_sessions(
    change_record.company_id,
    (least(change_record.original_start_at, now()) at time zone change_timezone)::date,
    (change_record.recovery_deadline at time zone change_timezone)::date
  );

  return query
  select
    session.id,
    course.id,
    session.trainer_id,
    session.start_at,
    session.end_at,
    course.title,
    course.category,
    course.level,
    session.room,
    greatest(
      session.capacity - (
        select count(*)::integer
        from public.bookings booking
        where booking.session_id = session.id
          and booking.status = 'confirmed'
      ),
      0
    )
  from public.course_sessions session
  join public.courses course on course.id = session.course_id
  where session.company_id = change_record.company_id
    and session.status = 'scheduled'
    and session.id <> change_record.original_session_id
    and session.start_at >= now()
    and session.start_at <= change_record.recovery_deadline
    and session.end_at - session.start_at =
      change_record.original_end_at - change_record.original_start_at
    and course.format = 'group'
    and course.published
    and course.category is not distinct from change_record.original_category
    and course.level is not distinct from change_record.original_level
    and (
      select count(*)
      from public.bookings booking
      where booking.session_id = session.id
        and booking.status = 'confirmed'
    ) < session.capacity
    and not exists (
      select 1
      from public.bookings own_booking
      where own_booking.session_id = session.id
        and own_booking.user_id = actor_id
        and own_booking.status = 'confirmed'
    )
  order by session.start_at;
end;
$$;

create or replace function public.recover_group_booking(
  target_change_id uuid,
  target_session_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  change_record public.booking_change_requests%rowtype;
  target_session public.course_sessions%rowtype;
  target_course public.courses%rowtype;
  confirmed_count integer;
  created_booking_id uuid;
begin
  select change_request.* into change_record
  from public.booking_change_requests change_request
  where change_request.id = target_change_id
    and change_request.customer_id = actor_id
    and change_request.change_kind = 'group'
    and change_request.status = 'lost'
  for update;

  if not found then raise exception 'La solicitud de cambio ya no esta disponible.'; end if;
  if now() > change_record.recovery_deadline then
    raise exception 'El plazo de cuatro semanas ha finalizado.';
  end if;

  select session.* into target_session
  from public.course_sessions session
  where session.id = target_session_id
    and session.company_id = change_record.company_id
    and session.status = 'scheduled'
    and session.start_at >= now()
    and session.start_at <= change_record.recovery_deadline
    and session.end_at - session.start_at =
      change_record.original_end_at - change_record.original_start_at
  for update;

  if not found then raise exception 'El horario ya no esta disponible.'; end if;

  select course.* into target_course
  from public.courses course
  where course.id = target_session.course_id
    and course.format = 'group'
    and course.published
    and course.category is not distinct from change_record.original_category
    and course.level is not distinct from change_record.original_level;

  if not found then raise exception 'El curso no es compatible con el cambio.'; end if;

  select count(*) into confirmed_count
  from public.bookings booking
  where booking.session_id = target_session.id
    and booking.status = 'confirmed';

  if confirmed_count >= target_session.capacity then
    raise exception 'El horario ya no tiene plazas disponibles.';
  end if;

  insert into public.bookings (session_id, user_id, status, confirmed_at, cancelled_at)
  values (target_session.id, actor_id, 'confirmed', now(), null)
  on conflict (session_id, user_id) do update
  set status = 'confirmed', confirmed_at = now(), cancelled_at = null
  returning id into created_booking_id;

  update public.booking_change_requests
  set
    status = 'recovered',
    recovered_booking_id = created_booking_id,
    recovered_session_id = target_session.id,
    recovered_at = now(),
    waitlist_status = 'none',
    notified_session_id = null,
    notified_at = null
  where id = change_record.id;

  return created_booking_id;
end;
$$;

create or replace function public.join_booking_change_waitlist(target_change_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  change_record public.booking_change_requests%rowtype;
  change_timezone text;
begin
  select change_request.* into change_record
  from public.booking_change_requests change_request
  where change_request.id = target_change_id
    and change_request.customer_id = actor_id
    and change_request.change_kind = 'group'
    and change_request.status = 'lost'
  for update;

  if not found then raise exception 'La solicitud de cambio ya no esta disponible.'; end if;
  if now() > change_record.recovery_deadline then
    raise exception 'El plazo de cuatro semanas ha finalizado.';
  end if;

  select company.timezone into change_timezone
  from public.companies company
  where company.id = change_record.company_id;

  perform private.ensure_group_course_sessions(
    change_record.company_id,
    (least(change_record.original_start_at, now()) at time zone change_timezone)::date,
    (change_record.recovery_deadline at time zone change_timezone)::date
  );

  if exists (
    select 1
    from public.course_sessions session
    join public.courses course on course.id = session.course_id
    where session.company_id = change_record.company_id
      and session.status = 'scheduled'
      and session.id <> change_record.original_session_id
      and session.start_at >= now()
      and session.start_at <= change_record.recovery_deadline
      and session.end_at - session.start_at =
        change_record.original_end_at - change_record.original_start_at
      and course.format = 'group'
      and course.published
      and course.category is not distinct from change_record.original_category
      and course.level is not distinct from change_record.original_level
      and (
        select count(*) from public.bookings booking
        where booking.session_id = session.id and booking.status = 'confirmed'
      ) < session.capacity
  ) then
    raise exception 'Ya hay un horario alternativo disponible.';
  end if;

  update public.booking_change_requests
  set waitlist_status = 'waiting', notified_session_id = null, notified_at = null
  where id = change_record.id;
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
  change_record public.booking_change_requests%rowtype;
  slot jsonb;
  slot_start timestamptz;
  slot_end timestamptz;
  slot_count integer;
begin
  if jsonb_typeof(proposed_slots) <> 'array' then
    raise exception 'Los horarios propuestos deben enviarse como una lista.';
  end if;

  slot_count := jsonb_array_length(proposed_slots);
  if slot_count < 1 then raise exception 'Selecciona al menos un horario.'; end if;

  select request.* into request_record
  from public.personal_training_requests request
  where request.id = target_request_id
    and request.trainer_id = (select auth.uid())
    and request.status in ('requested', 'proposed')
    and (
      select private.has_permission(
        (select auth.uid()), request.company_id,
        'training_requests', 'respond', 'assigned'
      )
    )
  for update;

  if not found then
    raise exception 'No tienes permiso para responder a esta solicitud.';
  end if;

  if request_record.change_request_id is not null then
    select change_request.* into change_record
    from public.booking_change_requests change_request
    where change_request.id = request_record.change_request_id
      and change_request.change_kind = 'personal'
      and change_request.status = 'pending'
    for update;

    if not found or now() > change_record.recovery_deadline then
      raise exception 'El plazo para recuperar este entrenamiento ha finalizado.';
    end if;
  end if;

  perform pg_advisory_xact_lock(hashtextextended(request_record.trainer_id::text, 0));

  delete from public.personal_training_proposals
  where request_id = request_record.id and status = 'proposed';

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

    if request_record.change_request_id is not null and (
      slot_end - slot_start <> change_record.original_end_at - change_record.original_start_at
      or slot_start < change_record.original_start_at
      or slot_start > change_record.recovery_deadline
    ) then
      raise exception 'El horario alternativo debe tener la misma duracion y estar dentro de las cuatro semanas permitidas.';
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
      request_id, start_at, end_at, location, room
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
    case when request_record.change_request_id is null
      then 'personal_training_proposed'
      else 'personal_training_replacement_proposed'
    end,
    case when request_record.change_request_id is null
      then 'Nuevos horarios disponibles'
      else 'Horarios alternativos disponibles'
    end,
    case when request_record.change_request_id is null
      then 'Tu entrenador ha propuesto horarios para tu entrenamiento individual.'
      else 'Tu entrenador ha propuesto horarios para recuperar tu entrenamiento.'
    end,
    jsonb_build_object(
      'request_id', request_record.id,
      'change_request_id', request_record.change_request_id,
      'slot_count', slot_count,
      'route', '/courses'
    )
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
  change_record public.booking_change_requests%rowtype;
  proposal_record public.personal_training_proposals%rowtype;
  created_session_id uuid;
  created_booking_id uuid;
  selected_count integer;
  matching_count integer;
begin
  selected_count := cardinality(coalesce(selected_proposal_ids, '{}'::uuid[]));
  if selected_count < 1 then raise exception 'Selecciona al menos un horario.'; end if;

  if (
    select count(distinct proposal_id)
    from unnest(selected_proposal_ids) as selected(proposal_id)
  ) <> selected_count then
    raise exception 'La seleccion contiene horarios duplicados.';
  end if;

  select request.* into request_record
  from public.personal_training_requests request
  where request.id = target_request_id
    and request.customer_id = (select auth.uid())
    and request.status = 'proposed'
    and (
      select private.has_permission(
        (select auth.uid()), request.company_id,
        'training_requests', 'confirm', 'own'
      )
    )
  for update;

  if not found then
    raise exception 'No tienes permiso para confirmar esta solicitud.';
  end if;

  if request_record.change_request_id is not null then
    if selected_count <> 1 then
      raise exception 'Selecciona exactamente un horario para recuperar el entrenamiento.';
    end if;

    select change_request.* into change_record
    from public.booking_change_requests change_request
    where change_request.id = request_record.change_request_id
      and change_request.change_kind = 'personal'
      and change_request.status = 'pending'
    for update;

    if not found or now() > change_record.recovery_deadline then
      raise exception 'El plazo para recuperar este entrenamiento ha finalizado.';
    end if;
  end if;

  perform pg_advisory_xact_lock(hashtextextended(request_record.trainer_id::text, 0));

  select count(*) into matching_count
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

  if request_record.change_request_id is not null then
    update public.bookings
    set status = 'cancelled', cancelled_at = now()
    where id = change_record.original_booking_id
      and status = 'confirmed';

    if not found then
      raise exception 'La cita original ya no se puede sustituir.';
    end if;

    update public.course_sessions
    set status = 'cancelled'
    where id = change_record.original_session_id
      and status = 'scheduled';

    if not found then
      raise exception 'La cita original ya no se puede sustituir.';
    end if;
  end if;

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
    returning id into created_session_id;

    insert into public.bookings (session_id, user_id, status, confirmed_at)
    values (created_session_id, request_record.customer_id, 'confirmed', now())
    returning id into created_booking_id;
  end loop;

  update public.personal_training_proposals
  set status = case
    when id = any(selected_proposal_ids) then 'accepted'
    else 'declined'
  end
  where request_id = request_record.id and status = 'proposed';

  update public.personal_training_requests
  set status = 'confirmed', confirmed_at = now()
  where id = request_record.id;

  if request_record.change_request_id is not null then
    update public.booking_change_requests
    set
      status = 'recovered',
      recovered_booking_id = created_booking_id,
      recovered_session_id = created_session_id,
      recovered_at = now(),
      waitlist_status = 'none',
      notified_session_id = null,
      notified_at = null
    where id = request_record.change_request_id;
  end if;

  insert into public.notifications (recipient_id, type, title, body, payload)
  values (
    request_record.trainer_id,
    case when request_record.change_request_id is null
      then 'personal_training_confirmed'
      else 'personal_training_replacement_confirmed'
    end,
    case when request_record.change_request_id is null
      then 'Entrenamientos confirmados'
      else 'Entrenamiento recuperado'
    end,
    case when request_record.change_request_id is null
      then format('El cliente ha reservado %s entrenamiento(s).', selected_count)
      else 'El cliente ha confirmado el horario alternativo.'
    end,
    jsonb_build_object(
      'request_id', request_record.id,
      'change_request_id', request_record.change_request_id,
      'booking_count', selected_count
    )
  );

  return selected_count;
end;
$$;

create or replace function public.reject_personal_training_replacement(
  target_request_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  request_record public.personal_training_requests%rowtype;
  change_record public.booking_change_requests%rowtype;
begin
  select request.* into request_record
  from public.personal_training_requests request
  where request.id = target_request_id
    and request.trainer_id = (select auth.uid())
    and request.change_request_id is not null
    and request.status in ('requested', 'proposed')
    and (
      select private.has_permission(
        (select auth.uid()), request.company_id,
        'training_requests', 'respond', 'assigned'
      )
    )
  for update;

  if not found then
    raise exception 'La solicitud alternativa ya no se puede rechazar.';
  end if;

  if exists (
    select 1
    from public.personal_training_request_transfers transfer_record
    where transfer_record.request_id = request_record.id
      and transfer_record.status = 'pending'
  ) then
    raise exception 'Responde o cancela primero la transferencia pendiente.';
  end if;

  select change_request.* into change_record
  from public.booking_change_requests change_request
  where change_request.id = request_record.change_request_id
    and change_request.change_kind = 'personal'
    and change_request.status = 'pending'
  for update;

  if not found then
    raise exception 'La solicitud de cambio ya no esta pendiente.';
  end if;

  update public.personal_training_proposals
  set status = 'declined'
  where request_id = request_record.id
    and status = 'proposed';

  update public.personal_training_requests
  set status = 'cancelled', cancelled_at = now()
  where id = request_record.id;

  update public.booking_change_requests
  set status = 'rejected'
  where id = change_record.id;

  insert into public.notifications (recipient_id, type, title, body, payload)
  values (
    request_record.customer_id,
    'personal_training_replacement_rejected',
    'No se puede cambiar la cita',
    'Lo sentimos, no se ha encontrado una cita alternativa en las próximas cuatro semanas. Tu cita original se mantiene.',
    jsonb_build_object(
      'request_id', request_record.id,
      'change_request_id', change_record.id,
      'original_booking_id', change_record.original_booking_id,
      'route', '/changes'
    )
  );

  return change_record.id;
end;
$$;

drop trigger if exists personal_training_transfer_block_replacement
  on public.personal_training_request_transfers;
drop function if exists private.prevent_replacement_request_transfer();

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

alter table public.booking_change_requests enable row level security;

drop policy if exists "Permitted users can view booking changes"
  on public.booking_change_requests;
create policy "Permitted users can view booking changes"
on public.booking_change_requests for select
to authenticated
using ((select private.can_read_booking_change(id)));

revoke all on public.booking_change_requests from anon, authenticated;
grant select on public.booking_change_requests to authenticated;

revoke all on function private.ensure_group_course_sessions(uuid, date, date) from public;
revoke all on function private.can_read_booking_change(uuid) from public;
revoke all on function private.notify_group_change_waiters(uuid) from public;
revoke all on function private.notify_waiters_after_booking_cancelled() from public;
revoke all on function private.protect_processed_replacement_request() from public;
grant execute on function private.can_read_booking_change(uuid) to authenticated;

revoke all on function public.get_my_calendar(timestamptz, timestamptz) from public, anon;
revoke all on function public.request_booking_change(uuid, text) from public, anon;
revoke all on function public.get_booking_change_alternatives(uuid) from public, anon;
revoke all on function public.recover_group_booking(uuid, uuid) from public, anon;
revoke all on function public.join_booking_change_waitlist(uuid) from public, anon;
revoke all on function public.reject_personal_training_replacement(uuid) from public, anon;

grant execute on function public.get_my_calendar(timestamptz, timestamptz) to authenticated;
grant execute on function public.request_booking_change(uuid, text) to authenticated;
grant execute on function public.get_booking_change_alternatives(uuid) to authenticated;
grant execute on function public.recover_group_booking(uuid, uuid) to authenticated;
grant execute on function public.join_booking_change_waitlist(uuid) to authenticated;
grant execute on function public.reject_personal_training_replacement(uuid) to authenticated;

commit;
