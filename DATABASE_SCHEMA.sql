-- Summit / Supabase schema
-- Kann sowohl auf einer neuen als auch auf der bestehenden Datenbank ausgeführt werden.
-- Bestehende Tabellen und Daten bleiben erhalten.

begin;

create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated;

-- 1. Unternehmen / Filialen
create table if not exists public.companies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  logo_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 2. Benutzerprofile
create table if not exists public.user_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  company_id uuid not null references public.companies(id),
  first_name text,
  last_name text,
  role text not null default 'customer'
    check (role in ('owner', 'trainer', 'customer')),
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected')),
  approved_by uuid references auth.users(id),
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 3. Kurse
create table if not exists public.courses (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  trainer_id uuid not null references auth.users(id),
  title text not null,
  description text,
  start_date timestamptz,
  end_date timestamptz,
  max_participants integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 4. Kursanmeldungen
create table if not exists public.course_enrollments (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  enrolled_at timestamptz not null default now()
);

create unique index if not exists user_profiles_user_id_key
  on public.user_profiles(user_id);
create index if not exists idx_user_profiles_company_id
  on public.user_profiles(company_id);
create index if not exists idx_user_profiles_status
  on public.user_profiles(status);
create index if not exists idx_courses_company_id
  on public.courses(company_id);
create index if not exists idx_course_enrollments_user_id
  on public.course_enrollments(user_id);
create index if not exists idx_course_enrollments_course_id
  on public.course_enrollments(course_id);
create unique index if not exists course_enrollments_course_user_key
  on public.course_enrollments(course_id, user_id);

-- updated_at automatisch pflegen
create or replace function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists companies_set_updated_at on public.companies;
create trigger companies_set_updated_at
before update on public.companies
for each row execute procedure private.set_updated_at();

drop trigger if exists user_profiles_set_updated_at on public.user_profiles;
create trigger user_profiles_set_updated_at
before update on public.user_profiles
for each row execute procedure private.set_updated_at();

drop trigger if exists courses_set_updated_at on public.courses;
create trigger courses_set_updated_at
before update on public.courses
for each row execute procedure private.set_updated_at();

-- RLS-Hilfsfunktionen. SECURITY DEFINER verhindert rekursive Policies auf user_profiles.
create or replace function private.is_approved_member(target_company_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.user_profiles
    where user_id = (select auth.uid())
      and company_id = target_company_id
      and status = 'approved'
  );
$$;

create or replace function private.is_approved_owner(target_company_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.user_profiles
    where user_id = (select auth.uid())
      and company_id = target_company_id
      and role = 'owner'
      and status = 'approved'
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
      join public.user_profiles actor
        on actor.user_id = (select auth.uid())
       and actor.company_id = course.company_id
       and actor.status = 'approved'
      where course.id = target_course_id
        and (actor.role = 'owner' or course.trainer_id = actor.user_id)
    );
$$;

revoke all on function private.is_approved_member(uuid) from public;
revoke all on function private.is_approved_owner(uuid) from public;
revoke all on function private.can_view_enrollment(uuid, uuid) from public;
grant execute on function private.is_approved_member(uuid) to authenticated;
grant execute on function private.is_approved_owner(uuid) to authenticated;
grant execute on function private.can_view_enrollment(uuid, uuid) to authenticated;

-- Profil wird serverseitig aus sicheren Defaults und Signup-Metadaten erzeugt.
-- role/status kommen ausdrücklich nicht aus den editierbaren User-Metadaten.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  selected_company_id uuid;
begin
  selected_company_id := (new.raw_user_meta_data ->> 'company_id')::uuid;

  if not exists (
    select 1 from public.companies where id = selected_company_id
  ) then
    raise exception 'Eine gültige Filiale ist für die Registrierung erforderlich.';
  end if;

  insert into public.user_profiles (
    user_id,
    company_id,
    first_name,
    last_name,
    role,
    status
  )
  values (
    new.id,
    selected_company_id,
    nullif(btrim(new.raw_user_meta_data ->> 'first_name'), ''),
    nullif(btrim(new.raw_user_meta_data ->> 'last_name'), ''),
    'customer',
    'pending'
  )
  on conflict (user_id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user();

revoke all on function public.handle_new_user() from public;
revoke all on function public.handle_new_user() from anon;
revoke all on function public.handle_new_user() from authenticated;

-- Owner dürfen nur den Freigabestatus fremder Nicht-Owner derselben Filiale ändern.
create or replace function public.review_user(
  target_user_id uuid,
  new_status text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_company_id uuid;
begin
  if new_status not in ('approved', 'rejected') then
    raise exception 'Ungültiger Freigabestatus.';
  end if;

  select company_id
  into actor_company_id
  from public.user_profiles
  where user_id = (select auth.uid())
    and role = 'owner'
    and status = 'approved';

  if actor_company_id is null then
    raise exception 'Nur ein genehmigter Owner darf Benutzer freigeben.';
  end if;

  update public.user_profiles
  set
    status = new_status,
    approved_by = (select auth.uid()),
    approved_at = now()
  where user_id = target_user_id
    and user_id <> (select auth.uid())
    and company_id = actor_company_id
    and role <> 'owner';

  if not found then
    raise exception 'Benutzer nicht gefunden oder keine Berechtigung.';
  end if;
end;
$$;

revoke all on function public.review_user(uuid, text) from public;
revoke all on function public.review_user(uuid, text) from anon;
grant execute on function public.review_user(uuid, text) to authenticated;

-- Row Level Security
alter table public.companies enable row level security;
alter table public.user_profiles enable row level security;
alter table public.courses enable row level security;
alter table public.course_enrollments enable row level security;

drop policy if exists "Companies are viewable by everyone" on public.companies;
drop policy if exists "Public can view companies" on public.companies;
create policy "Public can view companies"
on public.companies for select
to anon, authenticated
using (true);

drop policy if exists "User profiles are viewable by the user or owner" on public.user_profiles;
drop policy if exists "Public can insert pending customer profiles for signup" on public.user_profiles;
drop policy if exists "Users can update their own profile or owner can update same company" on public.user_profiles;
drop policy if exists "Users and owners can view profiles" on public.user_profiles;
create policy "Users and owners can view profiles"
on public.user_profiles for select
to authenticated
using (
  user_id = (select auth.uid())
  or (select private.is_approved_owner(company_id))
);

drop policy if exists "Courses are viewable by approved users" on public.courses;
drop policy if exists "Approved members can view courses" on public.courses;
create policy "Approved members can view courses"
on public.courses for select
to authenticated
using ((select private.is_approved_member(company_id)));

drop policy if exists "Users can view permitted enrollments" on public.course_enrollments;
create policy "Users can view permitted enrollments"
on public.course_enrollments for select
to authenticated
using (
  (select private.can_view_enrollment(course_id, user_id))
);

-- Minimale Tabellenrechte; Schreibvorgänge erfolgen später über gezielte Funktionen.
revoke all on public.companies from anon, authenticated;
grant select on public.companies to anon, authenticated;

revoke all on public.user_profiles from anon, authenticated;
grant select on public.user_profiles to authenticated;

revoke all on public.courses from anon, authenticated;
grant select on public.courses to authenticated;

revoke all on public.course_enrollments from anon, authenticated;
grant select on public.course_enrollments to authenticated;

commit;

-- Falls noch kein Owner-Profil existiert, nach der Registrierung einmalig im SQL Editor:
-- update public.user_profiles
-- set role = 'owner', status = 'approved', approved_at = now()
-- where user_id = (select id from auth.users where email = 'DEINE-EMAIL');
