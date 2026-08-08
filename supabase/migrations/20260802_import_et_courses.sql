-- Importiert die 37 ET-Gruppenkurse aus "Notizen/Tabla Cursos.xlsx".
-- Die 9 bisherigen Individual-Zeilen werden absichtlich nicht importiert.
-- Alle Kurse werden der bereits freigegebenen Ownerin Esther als Trainerin zugewiesen.

begin;

do $$
declare
  target_trainer_id uuid;
  target_company_id uuid;
  matching_trainers integer;
  imported_count integer;
begin
  select count(*)
  into matching_trainers
  from public.user_profiles profile
  where lower(btrim(coalesce(profile.first_name, ''))) = 'esther'
    and profile.role in ('trainer', 'owner')
    and profile.status = 'approved';

  if matching_trainers = 0 then
    raise exception 'Keine freigegebene Trainerin oder Ownerin namens Esther gefunden.';
  end if;

  if matching_trainers > 1 then
    raise exception 'Mehrere passende Profile namens Esther gefunden. Bitte Import eindeutig zuordnen.';
  end if;

  select profile.user_id, profile.company_id
  into target_trainer_id, target_company_id
  from public.user_profiles profile
  where lower(btrim(coalesce(profile.first_name, ''))) = 'esther'
    and profile.role in ('trainer', 'owner')
    and profile.status = 'approved';

  insert into public.courses (
    id,
    company_id,
    trainer_id,
    title,
    description,
    category,
    level,
    format,
    repetition,
    weekdays,
    start_time,
    end_time,
    max_participants,
    price,
    room,
    waitlist_enabled,
    approval_required,
    published
  )
  select
    import.id,
    target_company_id,
    target_trainer_id,
    'ET',
    'Entrenamiento Personal · Grupo',
    'ET',
    import.level,
    'group',
    'weekly',
    array[import.weekday],
    import.start_time,
    import.end_time,
    6,
    'Incluido',
    'Sala principal',
    true,
    true,
    true
  from (
    values
      ('fe4874b4-ead0-4faa-89e5-22cac2847022'::uuid, 'Bajo',  'L', '09:00'::time, '10:00'::time),
      ('6fd496ab-503b-4a9c-89b1-7c60201abd18'::uuid, 'Bajo',  'L', '12:30'::time, '13:30'::time),
      ('89b3a6b4-304a-4267-b3f3-54d3a6641997'::uuid, 'Bajo',  'L', '18:00'::time, '19:00'::time),
      ('e864686d-9309-41ae-88b2-6515ed51a067'::uuid, 'Bajo',  'L', '20:00'::time, '21:00'::time),
      ('1838d0af-1f41-4d4c-9d97-fa5062084f7e'::uuid, 'Bajo',  'M', '09:00'::time, '10:00'::time),
      ('82f5a313-6b68-4a2d-ad67-b42dabf938ee'::uuid, 'Bajo',  'M', '13:30'::time, '14:30'::time),
      ('4b620c3b-b54a-41a5-8ee1-bd0c77c8b90f'::uuid, 'Bajo',  'M', '18:00'::time, '19:00'::time),
      ('3af845d6-47df-453d-8cf8-f4a85132afb2'::uuid, 'Bajo',  'M', '15:30'::time, '16:30'::time),
      ('d7b00ee3-2fd7-4548-81c0-a8182ab231f4'::uuid, 'Bajo',  'X', '09:00'::time, '10:00'::time),
      ('aa0bfcdc-216d-4824-bf5d-eb9ed0974415'::uuid, 'Bajo',  'X', '11:00'::time, '12:00'::time),
      ('eadd261a-8115-4b38-9c93-ff114bc3e038'::uuid, 'Bajo',  'X', '12:30'::time, '13:30'::time),
      ('bf57b7b9-8cce-4d9b-95b8-f3bcb287a458'::uuid, 'Bajo',  'X', '18:00'::time, '19:00'::time),
      ('e2b7989a-1d52-462d-8f4f-7fdd540d56f3'::uuid, 'Bajo',  'X', '20:00'::time, '21:00'::time),
      ('d0666240-869d-49ba-872e-7b6b153912b0'::uuid, 'Bajo',  'J', '09:00'::time, '10:00'::time),
      ('7d8af6f9-fc25-43ad-b413-c9882926d2a1'::uuid, 'Bajo',  'J', '13:30'::time, '14:30'::time),
      ('8e444353-ac67-449a-aba1-e433ffc38490'::uuid, 'Bajo',  'J', '15:30'::time, '16:30'::time),
      ('4e8a0ae0-4b95-4b00-ae9f-3f207ff4076f'::uuid, 'Bajo',  'J', '18:00'::time, '19:00'::time),
      ('b2ea5e3a-d2a1-43ef-b4c5-a82e29213e3c'::uuid, 'Bajo',  'V', '11:00'::time, '12:00'::time),
      ('39d28623-bba8-44e4-a9a6-e62cfaf6b6e7'::uuid, 'Medio', 'L', '10:00'::time, '11:00'::time),
      ('d8241ccc-6b1e-401c-829a-d00adc2d4cca'::uuid, 'Medio', 'L', '14:30'::time, '15:30'::time),
      ('9d52621b-85b2-4d2e-9eb5-56feeab2d68b'::uuid, 'Medio', 'L', '17:00'::time, '18:00'::time),
      ('c8add3c4-6cbc-4def-8081-21f08b8f21e5'::uuid, 'Medio', 'M', '08:00'::time, '09:00'::time),
      ('78ef936e-7fb2-4fc9-9b61-943fd632e345'::uuid, 'Medio', 'M', '10:00'::time, '11:00'::time),
      ('c73e96b6-a415-4932-b205-27d303bfc4fd'::uuid, 'Medio', 'M', '17:00'::time, '18:00'::time),
      ('ea8416de-fe7f-4cf4-9e60-ebb1968d3c11'::uuid, 'Medio', 'M', '20:00'::time, '21:00'::time),
      ('aec86fdc-ed23-4f71-b49e-75d6564f79a9'::uuid, 'Medio', 'X', '14:30'::time, '15:30'::time),
      ('f962a17b-46b0-4c08-be81-a2b96bae4342'::uuid, 'Medio', 'X', '17:00'::time, '18:00'::time),
      ('5ea44d29-1a06-4dcc-89a9-97451eb67580'::uuid, 'Medio', 'J', '08:00'::time, '09:00'::time),
      ('cb82b452-efd3-414b-ad99-c3c95f388436'::uuid, 'Medio', 'J', '10:00'::time, '11:00'::time),
      ('0609b03f-7e55-402f-b031-bc0d38003f1e'::uuid, 'Medio', 'J', '17:00'::time, '18:00'::time),
      ('73bd90db-cc27-4d10-9e30-26a011cdcc64'::uuid, 'Medio', 'V', '10:00'::time, '11:00'::time),
      ('ae9a302c-5c98-4423-aa46-956bc74b4e9c'::uuid, 'Alto',  'L', '10:00'::time, '11:00'::time),
      ('a58b5dd5-c9ea-4c50-a40e-9b56f6eda259'::uuid, 'Alto',  'L', '19:00'::time, '20:00'::time),
      ('e748c981-feb0-4bcb-8612-40bf5ab2c70f'::uuid, 'Alto',  'M', '19:00'::time, '20:00'::time),
      ('c26e7774-2e09-4e2d-b4e3-28d2fcbaa935'::uuid, 'Alto',  'X', '10:00'::time, '11:00'::time),
      ('9b968754-461c-42b2-bd31-021adbadef19'::uuid, 'Alto',  'X', '19:00'::time, '20:00'::time),
      ('127a8110-6870-4810-9f96-fe711b9f6186'::uuid, 'Alto',  'J', '19:00'::time, '20:00'::time)
  ) as import(id, level, weekday, start_time, end_time)
  on conflict (id) do update
  set
    company_id = excluded.company_id,
    trainer_id = excluded.trainer_id,
    title = excluded.title,
    description = excluded.description,
    category = excluded.category,
    level = excluded.level,
    format = excluded.format,
    repetition = excluded.repetition,
    weekdays = excluded.weekdays,
    start_time = excluded.start_time,
    end_time = excluded.end_time,
    max_participants = excluded.max_participants,
    price = excluded.price,
    room = excluded.room,
    waitlist_enabled = excluded.waitlist_enabled,
    approval_required = excluded.approval_required,
    published = excluded.published;

  get diagnostics imported_count = row_count;
  raise notice '% ET-Gruppenkurse wurden importiert oder aktualisiert.', imported_count;
end;
$$;

commit;
