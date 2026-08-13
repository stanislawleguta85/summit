-- Kundenlevel pro Kurskategorie und serverseitige Sichtbarkeitskontrolle.
-- Nach 20260802_course_client_management.sql ausführen.
begin;

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

create index if not exists idx_customer_category_levels_company
  on public.customer_category_levels(company_id, category, level);

drop trigger if exists customer_category_levels_set_updated_at
  on public.customer_category_levels;
create trigger customer_category_levels_set_updated_at
before update on public.customer_category_levels
for each row execute procedure private.set_updated_at();

create or replace function private.can_manage_customer_level(
  target_customer_id uuid,
  target_company_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.user_profiles customer
    join public.user_profiles actor
      on actor.user_id = (select auth.uid())
     and actor.company_id = customer.company_id
     and actor.status = 'approved'
    where customer.user_id = target_customer_id
      and customer.company_id = target_company_id
      and customer.role = 'customer'
      and customer.status = 'approved'
      and (
        actor.role = 'owner'
        or (
          actor.role = 'trainer'
          and customer.assigned_trainer_id = actor.user_id
        )
      )
  );
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
    join public.user_profiles actor
      on actor.user_id = (select auth.uid())
     and actor.company_id = course.company_id
     and actor.status = 'approved'
    where course.id = target_course_id
      and (
        actor.role = 'owner'
        or (
          actor.role = 'trainer'
          and (course.published or course.trainer_id = actor.user_id)
        )
        or (
          actor.role = 'customer'
          and course.published
          and (
            course.level is null
            or exists (
              select 1
              from public.customer_category_levels customer_level
              where customer_level.customer_id = actor.user_id
                and customer_level.company_id = course.company_id
                and customer_level.category = upper(btrim(course.category))
                and customer_level.level = course.level
            )
          )
        )
      )
  );
$$;

create or replace function private.enforce_course_enrollment_level()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  course_record public.courses%rowtype;
begin
  if new.status not in ('confirmed', 'waitlisted') then
    return new;
  end if;

  select course.*
  into course_record
  from public.courses course
  where course.id = new.course_id;

  if course_record.format = 'group'
    and course_record.level is not null
    and not exists (
      select 1
      from public.customer_category_levels customer_level
      where customer_level.customer_id = new.user_id
        and customer_level.company_id = course_record.company_id
        and customer_level.category = upper(btrim(course_record.category))
        and customer_level.level = course_record.level
    ) then
    raise exception 'El nivel del cliente no corresponde al nivel del curso.';
  end if;

  return new;
end;
$$;

drop trigger if exists course_enrollments_enforce_level on public.course_enrollments;
create trigger course_enrollments_enforce_level
before insert or update of course_id, user_id, status on public.course_enrollments
for each row execute procedure private.enforce_course_enrollment_level();

create or replace function public.set_customer_category_level(
  target_customer_id uuid,
  target_category text,
  target_level text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  customer_profile public.user_profiles%rowtype;
  actor_role text;
  normalized_category text;
  normalized_level text;
  previous_level text;
begin
  normalized_category := upper(btrim(coalesce(target_category, '')));
  normalized_level := case lower(btrim(coalesce(target_level, '')))
    when 'bajo' then 'Bajo'
    when 'medio' then 'Medio'
    when 'alto' then 'Alto'
    else null
  end;

  if normalized_category = '' or char_length(normalized_category) > 60 then
    raise exception 'La categoría no es válida.';
  end if;

  if normalized_level is null then
    raise exception 'El nivel debe ser Bajo, Medio o Alto.';
  end if;

  select profile.*
  into customer_profile
  from public.user_profiles profile
  where profile.user_id = target_customer_id
    and profile.role = 'customer'
    and profile.status = 'approved';

  if not found then
    raise exception 'El cliente no existe o no está aprobado.';
  end if;

  select actor.role
  into actor_role
  from public.user_profiles actor
  where actor.user_id = (select auth.uid())
    and actor.company_id = customer_profile.company_id
    and actor.status = 'approved'
    and (
      actor.role = 'owner'
      or (
        actor.role = 'trainer'
        and customer_profile.assigned_trainer_id = actor.user_id
      )
    );

  if actor_role is null then
    raise exception 'No tienes permiso para cambiar el nivel de este cliente.';
  end if;

  if not exists (
    select 1
    from public.courses course
    where course.company_id = customer_profile.company_id
      and upper(btrim(course.category)) = normalized_category
      and course.format = 'group'
  ) then
    raise exception 'La categoría no tiene cursos de grupo en esta sede.';
  end if;

  select customer_level.level
  into previous_level
  from public.customer_category_levels customer_level
  where customer_level.customer_id = target_customer_id
    and customer_level.category = normalized_category;

  if previous_level is not distinct from normalized_level then
    return;
  end if;

  insert into public.customer_category_levels (
    customer_id,
    company_id,
    category,
    level,
    assigned_by
  )
  values (
    target_customer_id,
    customer_profile.company_id,
    normalized_category,
    normalized_level,
    (select auth.uid())
  )
  on conflict (customer_id, category) do update
  set
    company_id = excluded.company_id,
    level = excluded.level,
    assigned_by = excluded.assigned_by;

  insert into public.notifications (recipient_id, type, title, body, payload)
  values (
    target_customer_id,
    'customer_level_updated',
    'Nivel actualizado',
    format('Tu nivel de %s es ahora %s.', normalized_category, lower(normalized_level)),
    jsonb_build_object('category', normalized_category, 'level', normalized_level)
  );
end;
$$;

-- Zeigt aktive Teilnehmer auch nach einer Leveländerung, bietet aber nur passende neue Kunden an.
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

revoke all on function private.can_manage_customer_level(uuid, uuid) from public;
revoke all on function private.can_view_course(uuid) from public;
revoke all on function private.enforce_course_enrollment_level() from public;
revoke all on function public.set_customer_category_level(uuid, text, text) from public, anon;
revoke all on function public.get_course_clients(uuid) from public, anon;
grant execute on function private.can_manage_customer_level(uuid, uuid) to authenticated;
grant execute on function private.can_view_course(uuid) to authenticated;
grant execute on function public.set_customer_category_level(uuid, text, text) to authenticated;
grant execute on function public.get_course_clients(uuid) to authenticated;

alter table public.customer_category_levels enable row level security;

drop policy if exists "Customers and managers can view category levels"
  on public.customer_category_levels;
create policy "Customers and managers can view category levels"
on public.customer_category_levels for select
to authenticated
using (
  customer_id = (select auth.uid())
  or (select private.can_manage_customer_level(customer_id, company_id))
);

drop policy if exists "Courses are viewable by approved users" on public.courses;
drop policy if exists "Approved members can view courses" on public.courses;
create policy "Approved members can view courses"
on public.courses for select
to authenticated
using ((select private.can_view_course(id)));

revoke all on public.customer_category_levels from anon, authenticated;
grant select on public.customer_category_levels to authenticated;

commit;
