begin;

alter table public.user_profiles
  add column if not exists avatar_path text;

alter table public.user_profiles
  drop constraint if exists user_profiles_avatar_path_length_check;
alter table public.user_profiles
  add constraint user_profiles_avatar_path_length_check check (
    avatar_path is null or char_length(avatar_path) between 1 and 250
  );

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'profile-photos',
  'profile-photos',
  false,
  5242880,
  array['image/jpeg']::text[]
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Approved company users can read profile photos"
  on storage.objects;
create policy "Approved company users can read profile photos"
on storage.objects for select
to authenticated
using (
  bucket_id = 'profile-photos'
  and exists (
    select 1
    from public.user_profiles actor
    where actor.user_id = (select auth.uid())
      and actor.status = 'approved'
      and actor.company_id::text = (storage.foldername(name))[1]
  )
);

drop policy if exists "Approved users can upload own profile photo"
  on storage.objects;
create policy "Approved users can upload own profile photo"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'profile-photos'
  and (storage.foldername(name))[2] = (select auth.uid())::text
  and exists (
    select 1
    from public.user_profiles actor
    where actor.user_id = (select auth.uid())
      and actor.status = 'approved'
      and actor.company_id::text = (storage.foldername(name))[1]
  )
);

drop policy if exists "Approved users can update own profile photo"
  on storage.objects;
create policy "Approved users can update own profile photo"
on storage.objects for update
to authenticated
using (
  bucket_id = 'profile-photos'
  and (storage.foldername(name))[2] = (select auth.uid())::text
)
with check (
  bucket_id = 'profile-photos'
  and (storage.foldername(name))[2] = (select auth.uid())::text
  and exists (
    select 1
    from public.user_profiles actor
    where actor.user_id = (select auth.uid())
      and actor.status = 'approved'
      and actor.company_id::text = (storage.foldername(name))[1]
  )
);

drop policy if exists "Approved users can delete own profile photo"
  on storage.objects;
create policy "Approved users can delete own profile photo"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'profile-photos'
  and (storage.foldername(name))[2] = (select auth.uid())::text
);

create or replace function public.update_own_avatar_path(new_avatar_path text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  actor_profile public.user_profiles%rowtype;
  expected_prefix text;
  normalized_path text := nullif(btrim(new_avatar_path), '');
begin
  if actor_id is null then
    raise exception 'Debes iniciar sesion.';
  end if;

  select profile.*
  into actor_profile
  from public.user_profiles profile
  where profile.user_id = actor_id
    and profile.status = 'approved';

  if not found then
    raise exception 'Tu perfil no esta autorizado.';
  end if;

  if normalized_path is not null then
    expected_prefix := actor_profile.company_id::text || '/' || actor_id::text || '/';

    if left(normalized_path, char_length(expected_prefix)) <> expected_prefix
      or normalized_path !~ '/avatar-[0-9]+[.]jpg$'
      or char_length(normalized_path) > 250 then
      raise exception 'La ruta de la foto de perfil no es valida.';
    end if;
  end if;

  update public.user_profiles
  set avatar_path = normalized_path
  where user_id = actor_id;

  return normalized_path;
end;
$$;

revoke all on function public.update_own_avatar_path(text)
  from public, anon;
grant execute on function public.update_own_avatar_path(text)
  to authenticated;

commit;

select
  exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'user_profiles'
      and column_name = 'avatar_path'
  ) as avatar_path_column_exists,
  exists (
    select 1 from storage.buckets where id = 'profile-photos' and not public
  ) as private_profile_photo_bucket_exists,
  to_regprocedure('public.update_own_avatar_path(text)') is not null
    as own_avatar_function_exists,
  has_function_privilege(
    'authenticated', 'public.update_own_avatar_path(text)', 'EXECUTE'
  ) as authenticated_can_update_own_avatar,
  not has_function_privilege(
    'anon', 'public.update_own_avatar_path(text)', 'EXECUTE'
  ) as anonymous_cannot_update_avatar,
  exists (
    select 1
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'Approved company users can read profile photos'
  ) as profile_photo_read_policy_exists,
  exists (
    select 1
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'Approved users can upload own profile photo'
  ) as profile_photo_upload_policy_exists;
