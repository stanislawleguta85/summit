-- Additives Rollen- und Berechtigungsfundament fuer Summit.
-- Bestehende Hauptrollen in user_profiles.role bleiben waehrend der Migration erhalten.
begin;

-- Bricht mit einer klaren Meldung ab, falls das verworfene Zwischenmodell bereits angelegt wurde.
do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'user_roles'
      and column_name = 'role'
  ) and not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'user_roles'
      and column_name = 'role_id'
  ) then
    raise exception 'Es existiert bereits das alte user_roles-Zwischenmodell. Bitte nicht weiter ausfuehren und zuerst die vorhandene Tabelle pruefen.';
  end if;
end;
$$;

create table if not exists public.roles (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references public.companies(id) on delete cascade,
  code text not null check (code ~ '^[a-z][a-z0-9_]{1,49}$'),
  name text not null check (char_length(btrim(name)) between 2 and 80),
  description text,
  is_system boolean not null default false,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint roles_owner_check check (
    (is_system and company_id is null)
    or (not is_system and company_id is not null)
  )
);

create unique index if not exists idx_roles_system_code
  on public.roles (lower(code))
  where company_id is null;
create unique index if not exists idx_roles_company_code
  on public.roles (company_id, lower(code))
  where company_id is not null;

create table if not exists public.permissions (
  id uuid primary key default gen_random_uuid(),
  resource text not null check (resource ~ '^[a-z][a-z0-9_]{1,49}$'),
  action text not null check (action ~ '^[a-z][a-z0-9_]{1,49}$'),
  code text generated always as (resource || '.' || action) stored,
  name text not null check (char_length(btrim(name)) between 2 and 100),
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (resource, action),
  unique (code)
);

create table if not exists public.role_permissions (
  role_id uuid not null references public.roles(id) on delete cascade,
  permission_id uuid not null references public.permissions(id) on delete cascade,
  scope text not null check (scope in ('all', 'assigned', 'own', 'eligible')),
  assigned_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (role_id, permission_id, scope)
);

create table if not exists public.user_roles (
  user_id uuid not null references auth.users(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  role_id uuid not null references public.roles(id) on delete cascade,
  assigned_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, company_id, role_id)
);

create index if not exists idx_role_permissions_permission
  on public.role_permissions(permission_id, role_id);
create index if not exists idx_user_roles_company_role
  on public.user_roles(company_id, role_id);

drop trigger if exists roles_set_updated_at on public.roles;
create trigger roles_set_updated_at
before update on public.roles
for each row execute procedure private.set_updated_at();

drop trigger if exists permissions_set_updated_at on public.permissions;
create trigger permissions_set_updated_at
before update on public.permissions
for each row execute procedure private.set_updated_at();

drop trigger if exists user_roles_set_updated_at on public.user_roles;
create trigger user_roles_set_updated_at
before update on public.user_roles
for each row execute procedure private.set_updated_at();

-- Systemrollen haben feste IDs, damit die Migration wiederholbar bleibt.
insert into public.roles (id, code, name, description, is_system)
values
  (
    '00000000-0000-4000-8000-000000000001',
    'owner',
    'Propietario',
    'Administra la sede, sus usuarios, cursos y configuracion.',
    true
  ),
  (
    '00000000-0000-4000-8000-000000000002',
    'trainer',
    'Entrenador',
    'Gestiona los cursos y clientes que tiene asignados.',
    true
  ),
  (
    '00000000-0000-4000-8000-000000000003',
    'customer',
    'Cliente',
    'Consulta cursos elegibles y gestiona sus propias solicitudes y reservas.',
    true
  )
on conflict (id) do update
set
  name = excluded.name,
  description = excluded.description,
  is_system = true;

-- Technische Berechtigungen werden kontrolliert per Migration erweitert.
insert into public.permissions (resource, action, name, description)
values
  ('members', 'read', 'Ver miembros', 'Consultar los miembros de una sede.'),
  ('members', 'approve', 'Aprobar miembros', 'Aprobar o rechazar solicitudes de registro.'),
  ('roles', 'read', 'Ver roles', 'Consultar roles y sus asignaciones.'),
  ('roles', 'manage', 'Gestionar roles', 'Crear roles y asignar permisos y usuarios.'),
  ('courses', 'read', 'Ver cursos', 'Consultar cursos dentro del alcance autorizado.'),
  ('courses', 'create', 'Crear cursos', 'Crear nuevos cursos para una sede.'),
  ('courses', 'update', 'Editar cursos', 'Modificar cursos dentro del alcance autorizado.'),
  ('courses', 'delete', 'Eliminar cursos', 'Eliminar cursos dentro del alcance autorizado.'),
  ('courses', 'publish', 'Publicar cursos', 'Publicar o retirar cursos.'),
  ('courses', 'assign_trainer', 'Asignar entrenadores', 'Asignar un entrenador a un curso.'),
  ('courses', 'assign_clients', 'Asignar clientes', 'Inscribir clientes en un curso.'),
  ('clients', 'read', 'Ver clientes', 'Consultar clientes dentro del alcance autorizado.'),
  ('clients', 'assign_trainer', 'Asignar entrenador al cliente', 'Asignar un entrenador responsable a un cliente.'),
  ('clients', 'set_level', 'Definir nivel', 'Definir el nivel de entrenamiento de un cliente.'),
  ('training_requests', 'read', 'Ver solicitudes de entrenamiento', 'Consultar solicitudes de entrenamiento personal.'),
  ('training_requests', 'create', 'Crear solicitud de entrenamiento', 'Solicitar un entrenamiento personal.'),
  ('training_requests', 'respond', 'Responder solicitudes de entrenamiento', 'Proponer horarios para una solicitud asignada.'),
  ('training_requests', 'confirm', 'Confirmar propuesta', 'Confirmar de forma vinculante los horarios seleccionados.'),
  ('sessions', 'read', 'Ver sesiones', 'Consultar sesiones de entrenamiento.'),
  ('sessions', 'update', 'Gestionar sesiones', 'Modificar el estado de sesiones autorizadas.'),
  ('bookings', 'read', 'Ver reservas', 'Consultar reservas dentro del alcance autorizado.'),
  ('bookings', 'create', 'Crear reservas', 'Crear reservas propias.'),
  ('bookings', 'cancel', 'Cancelar reservas', 'Cancelar reservas propias.'),
  ('notifications', 'read', 'Ver notificaciones', 'Consultar las notificaciones propias.'),
  ('notifications', 'update', 'Gestionar notificaciones', 'Marcar las notificaciones propias como leidas.'),
  ('metrics', 'read', 'Ver metricas', 'Consultar metricas de la sede.'),
  ('settings', 'update', 'Gestionar configuracion', 'Modificar la configuracion de la sede.')
on conflict (resource, action) do update
set
  name = excluded.name,
  description = excluded.description;

-- Standardrechte der drei Systemrollen. Der Scope wird spaeter in RLS konkret geprueft.
insert into public.role_permissions (role_id, permission_id, scope)
select role_record.id, permission_record.id, grant_record.scope
from (
  values
    ('owner', 'members', 'read', 'all'),
    ('owner', 'members', 'approve', 'all'),
    ('owner', 'roles', 'read', 'all'),
    ('owner', 'roles', 'manage', 'all'),
    ('owner', 'courses', 'read', 'all'),
    ('owner', 'courses', 'create', 'all'),
    ('owner', 'courses', 'update', 'all'),
    ('owner', 'courses', 'delete', 'all'),
    ('owner', 'courses', 'publish', 'all'),
    ('owner', 'courses', 'assign_trainer', 'all'),
    ('owner', 'courses', 'assign_clients', 'all'),
    ('owner', 'clients', 'read', 'all'),
    ('owner', 'clients', 'assign_trainer', 'all'),
    ('owner', 'clients', 'set_level', 'all'),
    ('owner', 'training_requests', 'read', 'all'),
    ('owner', 'sessions', 'read', 'all'),
    ('owner', 'bookings', 'read', 'all'),
    ('owner', 'notifications', 'read', 'own'),
    ('owner', 'notifications', 'update', 'own'),
    ('owner', 'metrics', 'read', 'all'),
    ('owner', 'settings', 'update', 'all'),
    ('trainer', 'courses', 'read', 'assigned'),
    ('trainer', 'courses', 'update', 'assigned'),
    ('trainer', 'courses', 'assign_clients', 'assigned'),
    ('trainer', 'clients', 'read', 'assigned'),
    ('trainer', 'clients', 'set_level', 'assigned'),
    ('trainer', 'training_requests', 'read', 'assigned'),
    ('trainer', 'training_requests', 'respond', 'assigned'),
    ('trainer', 'sessions', 'read', 'assigned'),
    ('trainer', 'sessions', 'update', 'assigned'),
    ('trainer', 'bookings', 'read', 'assigned'),
    ('trainer', 'notifications', 'read', 'own'),
    ('trainer', 'notifications', 'update', 'own'),
    ('customer', 'courses', 'read', 'eligible'),
    ('customer', 'training_requests', 'read', 'own'),
    ('customer', 'training_requests', 'create', 'own'),
    ('customer', 'training_requests', 'confirm', 'own'),
    ('customer', 'sessions', 'read', 'own'),
    ('customer', 'bookings', 'read', 'own'),
    ('customer', 'bookings', 'create', 'own'),
    ('customer', 'bookings', 'cancel', 'own'),
    ('customer', 'notifications', 'read', 'own'),
    ('customer', 'notifications', 'update', 'own')
) as grant_record(role_code, resource, action, scope)
join public.roles role_record
  on role_record.code = grant_record.role_code
 and role_record.company_id is null
join public.permissions permission_record
  on permission_record.resource = grant_record.resource
 and permission_record.action = grant_record.action
on conflict (role_id, permission_id, scope) do nothing;

-- Eine Firmenrolle darf nur Benutzern derselben Firma zugewiesen werden.
create or replace function private.validate_user_role_assignment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  role_company_id uuid;
begin
  select role_record.company_id
  into role_company_id
  from public.roles role_record
  where role_record.id = new.role_id;

  if not found then
    raise exception 'El rol seleccionado no existe.';
  end if;

  if role_company_id is not null and role_company_id <> new.company_id then
    raise exception 'El rol pertenece a otra sede.';
  end if;

  if not exists (
    select 1
    from public.user_profiles profile
    where profile.user_id = new.user_id
      and profile.company_id = new.company_id
  ) then
    raise exception 'El usuario no pertenece a la sede seleccionada.';
  end if;

  return new;
end;
$$;

drop trigger if exists user_roles_validate_assignment on public.user_roles;
create trigger user_roles_validate_assignment
before insert or update of user_id, company_id, role_id on public.user_roles
for each row execute procedure private.validate_user_role_assignment();

create or replace function private.has_role(
  target_user_id uuid,
  target_company_id uuid,
  target_role_code text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.user_profiles profile
    where profile.user_id = target_user_id
      and profile.company_id = target_company_id
      and profile.status = 'approved'
      and (
        profile.role = target_role_code
        or exists (
          select 1
          from public.user_roles assignment
          join public.roles role_record on role_record.id = assignment.role_id
          where assignment.user_id = profile.user_id
            and assignment.company_id = profile.company_id
            and role_record.code = target_role_code
            and (role_record.company_id is null or role_record.company_id = profile.company_id)
        )
      )
  );
$$;

create or replace function private.has_permission(
  target_user_id uuid,
  target_company_id uuid,
  target_resource text,
  target_action text,
  target_scope text default null
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.user_profiles profile
    join public.user_roles assignment
      on assignment.user_id = profile.user_id
     and assignment.company_id = profile.company_id
    join public.roles role_record
      on role_record.id = assignment.role_id
     and (role_record.company_id is null or role_record.company_id = assignment.company_id)
    join public.role_permissions role_permission
      on role_permission.role_id = role_record.id
    join public.permissions permission_record
      on permission_record.id = role_permission.permission_id
    where profile.user_id = target_user_id
      and profile.company_id = target_company_id
      and profile.status = 'approved'
      and permission_record.resource = target_resource
      and permission_record.action = target_action
      and (target_scope is null or role_permission.scope = target_scope)
  );
$$;

-- Neue Profile und spaetere Aenderungen der kompatiblen Hauptrolle werden gespiegelt.
create or replace function private.sync_primary_user_role()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  system_role_id uuid;
begin
  select role_record.id
  into system_role_id
  from public.roles role_record
  where role_record.company_id is null
    and role_record.code = new.role;

  if system_role_id is not null then
    insert into public.user_roles (user_id, company_id, role_id)
    values (new.user_id, new.company_id, system_role_id)
    on conflict (user_id, company_id, role_id) do nothing;
  end if;

  return new;
end;
$$;

drop trigger if exists user_profiles_sync_primary_role on public.user_profiles;
create trigger user_profiles_sync_primary_role
after insert or update of user_id, company_id, role on public.user_profiles
for each row execute procedure private.sync_primary_user_role();

-- Bestehende Hauptrollen werden ohne Aenderung an user_profiles uebernommen.
insert into public.user_roles (user_id, company_id, role_id)
select profile.user_id, profile.company_id, role_record.id
from public.user_profiles profile
join public.roles role_record
  on role_record.company_id is null
 and role_record.code = profile.role
on conflict (user_id, company_id, role_id) do nothing;

-- Owner, die bereits Kurse leiten, erhalten zusaetzlich die Trainerrolle.
insert into public.user_roles (user_id, company_id, role_id)
select distinct profile.user_id, profile.company_id, role_record.id
from public.user_profiles profile
join public.courses course
  on course.trainer_id = profile.user_id
 and course.company_id = profile.company_id
join public.roles role_record
  on role_record.company_id is null
 and role_record.code = 'trainer'
where profile.role = 'owner'
  and profile.status = 'approved'
on conflict (user_id, company_id, role_id) do nothing;

revoke all on function private.validate_user_role_assignment() from public;
revoke all on function private.has_role(uuid, uuid, text) from public;
revoke all on function private.has_permission(uuid, uuid, text, text, text) from public;
revoke all on function private.sync_primary_user_role() from public;
grant execute on function private.has_role(uuid, uuid, text) to authenticated;
grant execute on function private.has_permission(uuid, uuid, text, text, text) to authenticated;

alter table public.roles enable row level security;
alter table public.permissions enable row level security;
alter table public.role_permissions enable row level security;
alter table public.user_roles enable row level security;

drop policy if exists "Approved users can view available roles" on public.roles;
create policy "Approved users can view available roles"
on public.roles for select
to authenticated
using (
  company_id is null
  or (select private.is_approved_member(company_id))
);

drop policy if exists "Approved users can view permissions" on public.permissions;
create policy "Approved users can view permissions"
on public.permissions for select
to authenticated
using (
  exists (
    select 1
    from public.user_profiles profile
    where profile.user_id = (select auth.uid())
      and profile.status = 'approved'
  )
);

drop policy if exists "Approved users can view role permissions" on public.role_permissions;
create policy "Approved users can view role permissions"
on public.role_permissions for select
to authenticated
using (
  exists (
    select 1
    from public.roles role_record
    where role_record.id = role_id
      and (
        role_record.company_id is null
        or (select private.is_approved_member(role_record.company_id))
      )
  )
);

drop policy if exists "Users and role managers can view assignments" on public.user_roles;
create policy "Users and role managers can view assignments"
on public.user_roles for select
to authenticated
using (
  user_id = (select auth.uid())
  or (
    select private.has_permission(
      (select auth.uid()),
      company_id,
      'roles',
      'read',
      'all'
    )
  )
);

revoke all on public.roles from anon, authenticated;
revoke all on public.permissions from anon, authenticated;
revoke all on public.role_permissions from anon, authenticated;
revoke all on public.user_roles from anon, authenticated;
grant select on public.roles to authenticated;
grant select on public.permissions to authenticated;
grant select on public.role_permissions to authenticated;
grant select on public.user_roles to authenticated;

commit;
