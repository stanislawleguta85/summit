-- Owner-Kursverwaltung: persistente Kursfelder und abgesicherte Kurserstellung.
begin;

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
-- Bestehende Kurse waren bisher immer sichtbar und bleiben bei der ersten Migration veröffentlicht.
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

create index if not exists idx_courses_trainer_id on public.courses(trainer_id);

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

commit;
