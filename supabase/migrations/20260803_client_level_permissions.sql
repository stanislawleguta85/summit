-- Etappe 4: Trainerzuweisung, Kundenansicht und Kundenlevel ueber Berechtigungen absichern.
-- Nach 20260803_course_client_result_type_fix.sql ausfuehren.
begin;

do $$
begin
  if exists (
    select required.code
    from (
      values
        ('clients.read'),
        ('clients.assign_trainer'),
        ('clients.set_level'),
        ('training_requests.respond')
    ) as required(code)
    where not exists (
      select 1
      from public.permissions permission_record
      where permission_record.code = required.code
    )
  ) then
    raise exception 'Eine oder mehrere erforderliche Kundenberechtigungen fehlen.';
  end if;
end;
$$;

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
    where customer.user_id = target_customer_id
      and customer.company_id = target_company_id
      and customer.status = 'approved'
      and (
        select private.has_role(customer.user_id, customer.company_id, 'customer')
      )
      and (
        (
          select private.has_permission(
            (select auth.uid()),
            customer.company_id,
            'clients',
            'set_level',
            'all'
          )
        )
        or (
          customer.assigned_trainer_id = (select auth.uid())
          and (
            select private.has_permission(
              (select auth.uid()),
              customer.company_id,
              'clients',
              'set_level',
              'assigned'
            )
          )
        )
      )
  );
$$;

-- Aktualisiert die Profil-Policy-Hilfe, damit customer aus user_roles statt nur aus profile.role kommt.
create or replace function private.can_read_user_profile(
  target_user_id uuid,
  target_company_id uuid,
  target_primary_role text,
  target_status text,
  target_assigned_trainer_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    target_user_id = (select auth.uid())
    or (
      select private.has_permission(
        (select auth.uid()),
        target_company_id,
        'members',
        'read',
        'all'
      )
    )
    or (
      target_status = 'approved'
      and (
        select private.has_role(target_user_id, target_company_id, 'customer')
      )
      and (
        (
          select private.has_permission(
            (select auth.uid()),
            target_company_id,
            'clients',
            'read',
            'all'
          )
        )
        or (
          target_assigned_trainer_id = (select auth.uid())
          and (
            select private.has_permission(
              (select auth.uid()),
              target_company_id,
              'clients',
              'read',
              'assigned'
            )
          )
        )
      )
    );
$$;

create or replace function public.assign_customer_trainer(
  target_customer_id uuid,
  target_trainer_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_company_id uuid;
  customer_name text;
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
        'clients',
        'assign_trainer',
        'all'
      )
    );

  if actor_company_id is null then
    raise exception 'No tienes permiso para asignar entrenadores.';
  end if;

  select nullif(btrim(concat_ws(' ', customer.first_name, customer.last_name)), '')
  into customer_name
  from public.user_profiles customer
  where customer.user_id = target_customer_id
    and customer.company_id = actor_company_id
    and customer.status = 'approved'
    and (
      select private.has_role(customer.user_id, customer.company_id, 'customer')
    );

  if not found then
    raise exception 'El cliente no existe o pertenece a otra sede.';
  end if;

  if target_trainer_id is not null and not exists (
    select 1
    from public.user_profiles trainer
    where trainer.user_id = target_trainer_id
      and trainer.company_id = actor_company_id
      and trainer.status = 'approved'
      and (
        select private.has_permission(
          trainer.user_id,
          trainer.company_id,
          'clients',
          'read',
          'assigned'
        )
      )
      and (
        select private.has_permission(
          trainer.user_id,
          trainer.company_id,
          'clients',
          'set_level',
          'assigned'
        )
      )
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
    raise exception 'La persona seleccionada no puede gestionar clientes asignados en esta sede.';
  end if;

  update public.user_profiles
  set assigned_trainer_id = target_trainer_id
  where user_id = target_customer_id
    and company_id = actor_company_id;

  if target_trainer_id is not null then
    insert into public.notifications (recipient_id, type, title, body, payload)
    values (
      target_trainer_id,
      'trainer_assignment',
      'Nuevo cliente asignado',
      coalesce(customer_name, 'Se te ha asignado un nuevo cliente.'),
      jsonb_build_object('customer_id', target_customer_id)
    );
  end if;
end;
$$;

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
    raise exception 'La categoria no es valida.';
  end if;

  if normalized_level is null then
    raise exception 'El nivel debe ser Bajo, Medio o Alto.';
  end if;

  select profile.*
  into customer_profile
  from public.user_profiles profile
  where profile.user_id = target_customer_id
    and profile.status = 'approved'
    and (
      select private.has_role(profile.user_id, profile.company_id, 'customer')
    );

  if not found then
    raise exception 'El cliente no existe o no esta aprobado.';
  end if;

  if not (
    (
      select private.has_permission(
        (select auth.uid()),
        customer_profile.company_id,
        'clients',
        'set_level',
        'all'
      )
    )
    or (
      customer_profile.assigned_trainer_id = (select auth.uid())
      and (
        select private.has_permission(
          (select auth.uid()),
          customer_profile.company_id,
          'clients',
          'set_level',
          'assigned'
        )
      )
    )
  ) then
    raise exception 'No tienes permiso para cambiar el nivel de este cliente.';
  end if;

  if not exists (
    select 1
    from public.courses course
    where course.company_id = customer_profile.company_id
      and upper(btrim(course.category)) = normalized_category
      and course.format = 'group'
  ) then
    raise exception 'La categoria no tiene cursos de grupo en esta sede.';
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

revoke all on function private.can_manage_customer_level(uuid, uuid) from public;
revoke all on function private.can_read_user_profile(uuid, uuid, text, text, uuid) from public;
revoke all on function public.assign_customer_trainer(uuid, uuid) from public, anon;
revoke all on function public.set_customer_category_level(uuid, text, text) from public, anon;
grant execute on function private.can_manage_customer_level(uuid, uuid) to authenticated;
grant execute on function private.can_read_user_profile(uuid, uuid, text, text, uuid)
  to authenticated;
grant execute on function public.assign_customer_trainer(uuid, uuid) to authenticated;
grant execute on function public.set_customer_category_level(uuid, text, text) to authenticated;

drop policy if exists "Customers and managers can view category levels"
  on public.customer_category_levels;
drop policy if exists "Users with client permissions can view category levels"
  on public.customer_category_levels;
create policy "Users with client permissions can view category levels"
on public.customer_category_levels for select
to authenticated
using (
  customer_id = (select auth.uid())
  or (select private.can_manage_customer_level(customer_id, company_id))
);

commit;
