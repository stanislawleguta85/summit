-- Hotfix fuer bestehende Datenbanken: exakte Rueckgabetypen von get_course_clients.
-- Veraendert keine Kurs-, Profil- oder Teilnehmerdaten.
begin;

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

revoke all on function public.get_course_clients(uuid) from public, anon;
grant execute on function public.get_course_clients(uuid) to authenticated;

commit;
