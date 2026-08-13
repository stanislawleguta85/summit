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
  phone_number text
    check (
      phone_number is null
      or (
        char_length(phone_number) between 7 and 30
        and phone_number ~ '^[+0-9][0-9[:space:]().-]*$'
        and char_length(regexp_replace(phone_number, '[^0-9]', '', 'g')) between 7 and 15
      )
    ),
  assigned_trainer_id uuid references auth.users(id) on delete set null,
  role text not null default 'customer'
    check (role in ('owner', 'trainer', 'customer')),
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected')),
  approved_by uuid references auth.users(id),
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Fügt die Telefonnummer auch bei einer bereits vorhandenen Profiltabelle hinzu.
alter table public.user_profiles add column if not exists phone_number text;
alter table public.user_profiles
  add column if not exists assigned_trainer_id uuid references auth.users(id) on delete set null;
alter table public.user_profiles drop constraint if exists user_profiles_phone_number_check;
alter table public.user_profiles
  add constraint user_profiles_phone_number_check
  check (
    phone_number is null
    or (
      char_length(phone_number) between 7 and 30
      and phone_number ~ '^[+0-9][0-9[:space:]().-]*$'
      and char_length(regexp_replace(phone_number, '[^0-9]', '', 'g')) between 7 and 15
    )
  );

-- Mehrfachrollen ergänzen die kompatible Hauptrolle in user_profiles.role.
-- Das normalisierte Rollen- und Berechtigungsmodell wird anschliessend additiv mit
-- supabase/migrations/20260803_role_based_access_control.sql eingerichtet.
-- user_profiles.role bleibt bis zum Abschluss der Umstellung als Hauptrolle bestehen.

-- 3. Kurse
create table if not exists public.courses (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  trainer_id uuid not null references auth.users(id),
  title text not null,
  description text,
  category text not null default 'ET',
  level text check (level is null or level in ('Bajo', 'Medio', 'Alto')),
  format text not null default 'group'
    check (format in ('group', 'individual')),
  repetition text not null default 'once'
    check (repetition in ('once', 'weekly')),
  weekdays text[] not null default '{}',
  start_time time,
  end_time time,
  start_date timestamptz,
  end_date timestamptz,
  max_participants integer,
  price text not null default 'Incluido',
  room text not null default 'Sala principal',
  waitlist_enabled boolean not null default true,
  approval_required boolean not null default false,
  published boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Fügt die Admin-Kursfelder auch bei einer bereits vorhandenen Tabelle hinzu.
alter table public.courses add column if not exists category text not null default 'ET';
alter table public.courses alter column category set default 'ET';
alter table public.courses add column if not exists level text;
alter table public.courses add column if not exists format text not null default 'group';
alter table public.courses add column if not exists repetition text not null default 'once';
alter table public.courses add column if not exists weekdays text[] not null default '{}';
alter table public.courses add column if not exists start_time time;
alter table public.courses add column if not exists end_time time;
alter table public.courses add column if not exists price text not null default 'Incluido';
alter table public.courses add column if not exists room text not null default 'Sala principal';
alter table public.courses add column if not exists waitlist_enabled boolean not null default true;
alter table public.courses add column if not exists approval_required boolean not null default false;
alter table public.courses add column if not exists published boolean not null default true;
alter table public.courses alter column published set default false;

-- Benennt bereits migrierte PT-Kurse in ET (Entrenamiento Personal) um.
update public.courses
set
  title = case when upper(btrim(title)) = 'PT' then 'ET' else title end,
  category = 'ET'
where upper(btrim(coalesce(category, ''))) = 'PT'
   or upper(btrim(title)) = 'PT';

-- Überführt die bisher als Baja/Media/Alta benannten Kurse in ET + Nivel.
update public.courses
set
  title = 'ET',
  category = 'ET',
  level = case
    when lower(btrim(coalesce(category, ''))) in ('baja', 'bajo')
      or lower(btrim(title)) in ('baja', 'bajo') then 'Bajo'
    when lower(btrim(coalesce(category, ''))) in ('media', 'medio')
      or lower(btrim(title)) in ('media', 'medio') then 'Medio'
    when lower(btrim(coalesce(category, ''))) in ('alta', 'alto')
      or lower(btrim(title)) in ('alta', 'alto') then 'Alto'
  end,
  format = 'group'
where lower(btrim(coalesce(category, ''))) in ('baja', 'bajo', 'media', 'medio', 'alta', 'alto')
   or lower(btrim(title)) in ('baja', 'bajo', 'media', 'medio', 'alta', 'alto');

-- Individuelle Trainings bleiben historisch erhalten, sind aber kein festes Kursangebot mehr.
update public.courses
set format = 'individual', published = false
where lower(btrim(coalesce(category, ''))) = 'individual'
   or lower(btrim(title)) like 'individual%';

alter table public.courses drop constraint if exists courses_repetition_check;
alter table public.courses
  add constraint courses_repetition_check check (repetition in ('once', 'weekly'));
alter table public.courses drop constraint if exists courses_level_check;
alter table public.courses
  add constraint courses_level_check check (level is null or level in ('Bajo', 'Medio', 'Alto'));
alter table public.courses drop constraint if exists courses_format_check;
alter table public.courses
  add constraint courses_format_check check (format in ('group', 'individual'));

-- 4. Kursanmeldungen
create table if not exists public.course_enrollments (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'confirmed'
    check (status in ('confirmed', 'waitlisted', 'cancelled')),
  source text not null default 'customer'
    check (source in ('owner', 'trainer', 'customer', 'import')),
  assigned_by uuid references auth.users(id) on delete set null,
  enrolled_at timestamptz not null default now(),
  removed_at timestamptz,
  updated_at timestamptz not null default now()
);

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

-- Kundenlevel werden pro Kurskategorie gespeichert (z. B. ET -> Bajo).
create table if not exists public.customer_category_levels (
  customer_id uuid not null references auth.users(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  category text not null,
  level text not null check (level in ('Bajo', 'Medio', 'Alto')),
  assigned_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (customer_id, category),
  check (category = upper(btrim(category)) and char_length(category) between 1 and 60)
);

create unique index if not exists user_profiles_user_id_key
  on public.user_profiles(user_id);
create index if not exists idx_user_profiles_company_id
  on public.user_profiles(company_id);
create index if not exists idx_user_profiles_status
  on public.user_profiles(status);
create index if not exists idx_user_profiles_assigned_trainer_id
  on public.user_profiles(assigned_trainer_id);
create index if not exists idx_courses_company_id
  on public.courses(company_id);
create index if not exists idx_courses_trainer_id
  on public.courses(trainer_id);
create index if not exists idx_course_enrollments_user_id
  on public.course_enrollments(user_id);
create index if not exists idx_course_enrollments_course_id
  on public.course_enrollments(course_id);
create index if not exists idx_course_enrollments_course_status
  on public.course_enrollments(course_id, status);
create index if not exists idx_customer_category_levels_company
  on public.customer_category_levels(company_id, category, level);
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

drop trigger if exists course_enrollments_set_updated_at on public.course_enrollments;
create trigger course_enrollments_set_updated_at
before update on public.course_enrollments
for each row execute procedure private.set_updated_at();

drop trigger if exists customer_category_levels_set_updated_at
  on public.customer_category_levels;
create trigger customer_category_levels_set_updated_at
before update on public.customer_category_levels
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
  signup_phone_number text;
begin
  selected_company_id := (new.raw_user_meta_data ->> 'company_id')::uuid;
  signup_phone_number := nullif(btrim(new.raw_user_meta_data ->> 'phone_number'), '');

  if not exists (
    select 1 from public.companies where id = selected_company_id
  ) then
    raise exception 'Eine gültige Filiale ist für die Registrierung erforderlich.';
  end if;

  if signup_phone_number is null
    or char_length(signup_phone_number) not between 7 and 30
    or signup_phone_number !~ '^[+0-9][0-9[:space:]().-]*$'
    or char_length(regexp_replace(signup_phone_number, '[^0-9]', '', 'g')) not between 7 and 15 then
    raise exception 'Eine gültige Telefonnummer ist für die Registrierung erforderlich.';
  end if;

  insert into public.user_profiles (
    user_id,
    company_id,
    first_name,
    last_name,
    phone_number,
    role,
    status
  )
  values (
    new.id,
    selected_company_id,
    nullif(btrim(new.raw_user_meta_data ->> 'first_name'), ''),
    nullif(btrim(new.raw_user_meta_data ->> 'last_name'), ''),
    signup_phone_number,
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

-- Nur ein freigegebener Owner darf Kurse für seine eigene Filiale anlegen.
-- Der zugewiesene Trainer muss ebenfalls freigegeben und derselben Filiale zugeordnet sein.
drop function if exists public.create_course(
  text, text, uuid, text, text[], time, time, timestamptz, timestamptz,
  integer, text, text, boolean, boolean, boolean
);

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
    and profile.role = 'owner'
    and profile.status = 'approved';

  if actor_company_id is null then
    raise exception 'Nur ein freigegebener Owner darf Kurse anlegen.';
  end if;

  if nullif(btrim(p_title), '') is null or char_length(btrim(p_title)) > 120 then
    raise exception 'Der Kursname muss zwischen 1 und 120 Zeichen lang sein.';
  end if;

  if p_repetition not in ('once', 'weekly') then
    raise exception 'Ungültige Wiederholung.';
  end if;

  if p_level not in ('Bajo', 'Medio', 'Alto') then
    raise exception 'El nivel debe ser Bajo, Medio o Alto.';
  end if;

  if p_start_time is null or p_end_time is null or p_end_time <= p_start_time then
    raise exception 'Die Endzeit muss nach der Startzeit liegen.';
  end if;

  if p_repetition = 'once'
    and (p_start_date is null or p_end_date is null or p_end_date <= p_start_date) then
    raise exception 'Ein einmaliger Kurs benötigt ein gültiges Datum.';
  end if;

  if p_repetition = 'weekly' and (
    cardinality(coalesce(p_weekdays, '{}'::text[])) = 0
    or exists (
      select 1
      from unnest(coalesce(p_weekdays, '{}'::text[])) as selected_weekday(value)
      where value not in ('L', 'M', 'X', 'J', 'V', 'S', 'D')
    )
  ) then
    raise exception 'Wähle mindestens einen gültigen Wochentag.';
  end if;

  if p_max_participants is null or p_max_participants < 1 or p_max_participants > 1000 then
    raise exception 'Die Kapazität muss zwischen 1 und 1000 liegen.';
  end if;

  if not exists (
    select 1
    from public.user_profiles trainer
    where trainer.user_id = p_trainer_id
      and trainer.company_id = actor_company_id
      and trainer.status = 'approved'
      and trainer.role in ('trainer', 'owner')
  ) then
    raise exception 'Der Trainer ist nicht freigegeben oder gehört zu einer anderen Filiale.';
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

revoke all on function public.create_course(
  text, text, text, uuid, text, text[], time, time, timestamptz, timestamptz,
  integer, text, text, boolean, boolean, boolean
) from public;
revoke all on function public.create_course(
  text, text, text, uuid, text, text[], time, time, timestamptz, timestamptz,
  integer, text, text, boolean, boolean, boolean
) from anon;
grant execute on function public.create_course(
  text, text, text, uuid, text, text[], time, time, timestamptz, timestamptz,
  integer, text, text, boolean, boolean, boolean
) to authenticated;

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
using (
  (select private.is_approved_member(company_id))
  and (
    published
    or trainer_id = (select auth.uid())
    or (select private.is_approved_owner(company_id))
  )
);

drop policy if exists "Users can view permitted enrollments" on public.course_enrollments;
create policy "Users can view permitted enrollments"
on public.course_enrollments for select
to authenticated
using (
  (select private.can_view_enrollment(course_id, user_id))
);

-- Minimale Tabellenrechte; Schreibvorgänge erfolgen über gezielte Funktionen.
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
