-- Nur lesen: prueft Avatarspalte, privaten Bucket und RPC-Rechte.

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
