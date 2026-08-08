-- Ein company-weites Individualangebot als Elternobjekt fuer Anfragen und konkrete Sessions.
begin;

create table if not exists public.personal_training_services (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  code text not null default 'individual',
  title text not null default 'Entrenamiento individual',
  description text,
  default_duration_minutes smallint not null default 60
    check (default_duration_minutes between 30 and 240),
  price text not null default 'Incluido',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, code),
  check (code = lower(btrim(code)) and char_length(code) between 2 and 60)
);

drop trigger if exists personal_training_services_set_updated_at
  on public.personal_training_services;
create trigger personal_training_services_set_updated_at
before update on public.personal_training_services
for each row execute procedure private.set_updated_at();

insert into public.personal_training_services (
  company_id,
  code,
  title,
  description,
  default_duration_minutes,
  price,
  active
)
select
  company.id,
  'individual',
  'Entrenamiento individual',
  'Entrenamientos personales coordinados mediante solicitudes y propuestas de horario.',
  60,
  'Incluido',
  true
from public.companies company
on conflict (company_id, code) do nothing;

alter table public.personal_training_requests
  add column if not exists personal_training_service_id uuid
  references public.personal_training_services(id) on delete restrict;

alter table public.course_sessions
  add column if not exists personal_training_service_id uuid
  references public.personal_training_services(id) on delete restrict;

update public.personal_training_requests request
set personal_training_service_id = service.id
from public.personal_training_services service
where service.company_id = request.company_id
  and service.code = 'individual'
  and request.personal_training_service_id is null;

alter table public.personal_training_requests
  alter column personal_training_service_id set not null;

update public.course_sessions session
set personal_training_service_id = request.personal_training_service_id
from public.personal_training_requests request
where request.id = session.personal_training_request_id
  and session.course_id is null
  and session.personal_training_service_id is null;

-- Historische Individual-Sessions koennen nach dem Loeschen ihrer Anfrage keinen Request-Link
-- mehr besitzen. Sie bleiben trotzdem eindeutig dem company-weiten Individualangebot zugeordnet.
update public.course_sessions session
set personal_training_service_id = service.id
from public.personal_training_services service
where service.company_id = session.company_id
  and service.code = 'individual'
  and session.course_id is null
  and session.personal_training_service_id is null;

create index if not exists idx_personal_training_requests_service
  on public.personal_training_requests(personal_training_service_id, created_at desc);
create index if not exists idx_course_sessions_personal_service_time
  on public.course_sessions(personal_training_service_id, start_at);

create or replace function private.assign_personal_training_request_service()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.personal_training_service_id is null then
    select service.id
    into new.personal_training_service_id
    from public.personal_training_services service
    where service.company_id = new.company_id
      and service.code = 'individual'
      and service.active;
  end if;

  if new.personal_training_service_id is null or not exists (
    select 1
    from public.personal_training_services service
    where service.id = new.personal_training_service_id
      and service.company_id = new.company_id
  ) then
    raise exception 'No hay un servicio de entrenamiento individual valido para esta sede.';
  end if;

  return new;
end;
$$;

drop trigger if exists personal_training_requests_assign_service
  on public.personal_training_requests;
create trigger personal_training_requests_assign_service
before insert or update of company_id, personal_training_service_id
on public.personal_training_requests
for each row execute procedure private.assign_personal_training_request_service();

create or replace function private.assign_course_session_parent()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  request_record public.personal_training_requests%rowtype;
begin
  if new.course_id is not null then
    if new.personal_training_request_id is not null
      or new.personal_training_service_id is not null then
      raise exception 'Una sesion de grupo no puede pertenecer a un servicio individual.';
    end if;
    return new;
  end if;

  if new.personal_training_request_id is not null then
    select request.*
    into request_record
    from public.personal_training_requests request
    where request.id = new.personal_training_request_id;

    if not found or request_record.company_id <> new.company_id then
      raise exception 'La solicitud individual no pertenece a esta sede.';
    end if;

    if new.personal_training_service_id is null then
      new.personal_training_service_id := request_record.personal_training_service_id;
    elsif new.personal_training_service_id <> request_record.personal_training_service_id then
      raise exception 'La sesion y la solicitud pertenecen a servicios diferentes.';
    end if;
  end if;

  if new.personal_training_service_id is null then
    raise exception 'La sesion necesita un curso de grupo o un servicio individual.';
  end if;

  return new;
end;
$$;

drop trigger if exists course_sessions_assign_parent on public.course_sessions;
create trigger course_sessions_assign_parent
before insert or update of
  company_id, course_id, personal_training_request_id, personal_training_service_id
on public.course_sessions
for each row execute procedure private.assign_course_session_parent();

alter table public.course_sessions
  drop constraint if exists course_sessions_exactly_one_service_parent;
alter table public.course_sessions
  add constraint course_sessions_exactly_one_service_parent check (
    (course_id is not null and personal_training_service_id is null)
    or (course_id is null and personal_training_service_id is not null)
  ) not valid;
alter table public.course_sessions
  validate constraint course_sessions_exactly_one_service_parent;

create or replace function private.can_read_personal_training_service(target_company_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.user_profiles profile
    where profile.user_id = (select auth.uid())
      and profile.company_id = target_company_id
      and profile.status = 'approved'
  );
$$;

alter table public.personal_training_services enable row level security;
drop policy if exists "Approved users can read personal training services"
  on public.personal_training_services;
create policy "Approved users can read personal training services"
on public.personal_training_services for select
to authenticated
using ((select private.can_read_personal_training_service(company_id)));

grant select on public.personal_training_services to authenticated;

create or replace function public.get_manageable_personal_training_sessions()
returns table (
  session_id uuid,
  service_id uuid,
  service_title text,
  request_id uuid,
  trainer_id uuid,
  trainer_name text,
  customer_id uuid,
  customer_name text,
  start_at timestamptz,
  end_at timestamptz,
  status text,
  room text,
  location text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  actor_profile public.user_profiles%rowtype;
begin
  select profile.*
  into actor_profile
  from public.user_profiles profile
  where profile.user_id = actor_id
    and profile.status = 'approved';

  if not found then
    raise exception 'Tu perfil no esta autorizado.';
  end if;

  if not (
    (select private.has_permission(
      actor_id, actor_profile.company_id, 'sessions', 'read', 'all'
    ))
    or (select private.has_permission(
      actor_id, actor_profile.company_id, 'sessions', 'read', 'assigned'
    ))
  ) then
    raise exception 'No tienes permiso para consultar sesiones individuales.';
  end if;

  return query
  select
    session.id::uuid,
    service.id::uuid,
    service.title::text,
    request.id::uuid,
    session.trainer_id::uuid,
    nullif(btrim(concat_ws(' ', trainer.first_name, trainer.last_name)), '')::text,
    request.customer_id::uuid,
    nullif(btrim(concat_ws(' ', customer.first_name, customer.last_name)), '')::text,
    session.start_at::timestamptz,
    session.end_at::timestamptz,
    session.status::text,
    session.room::text,
    session.location::text
  from public.course_sessions session
  join public.personal_training_services service
    on service.id = session.personal_training_service_id
  join public.personal_training_requests request
    on request.id = session.personal_training_request_id
  left join public.user_profiles trainer on trainer.user_id = session.trainer_id
  left join public.user_profiles customer on customer.user_id = request.customer_id
  where session.company_id = actor_profile.company_id
    and session.course_id is null
    and session.status = 'scheduled'
    and session.end_at >= now()
    and session.start_at < now() + interval '4 weeks'
    and (
      (select private.has_permission(
        actor_id, session.company_id, 'sessions', 'read', 'all'
      ))
      or (
        session.trainer_id = actor_id
        and (select private.has_permission(
          actor_id, session.company_id, 'sessions', 'read', 'assigned'
        ))
      )
    )
  order by session.start_at;
end;
$$;

revoke all on function private.assign_personal_training_request_service() from public;
revoke all on function private.assign_course_session_parent() from public;
revoke all on function private.can_read_personal_training_service(uuid) from public;
grant execute on function private.can_read_personal_training_service(uuid)
  to authenticated;
revoke all on function public.get_manageable_personal_training_sessions()
  from public, anon;
grant execute on function public.get_manageable_personal_training_sessions()
  to authenticated;

commit;

select
  to_regclass('public.personal_training_services') is not null
    as personal_training_service_table_exists,
  not exists (
    select 1
    from public.companies company
    where not exists (
      select 1
      from public.personal_training_services service
      where service.company_id = company.id
        and service.code = 'individual'
    )
  ) as every_company_has_individual_service,
  not exists (
    select 1
    from public.personal_training_requests request
    where request.personal_training_service_id is null
  ) as every_personal_request_has_service,
  not exists (
    select 1
    from public.course_sessions session
    where (session.course_id is null) = (session.personal_training_service_id is null)
  ) as every_session_has_exactly_one_service_parent,
  to_regprocedure('public.get_manageable_personal_training_sessions()') is not null
    as manageable_personal_sessions_function_exists,
  has_function_privilege(
    'authenticated',
    'public.get_manageable_personal_training_sessions()',
    'EXECUTE'
  ) as authenticated_can_read_manageable_personal_sessions,
  not has_function_privilege(
    'anon',
    'public.get_manageable_personal_training_sessions()',
    'EXECUTE'
  ) as anonymous_cannot_read_manageable_personal_sessions;
