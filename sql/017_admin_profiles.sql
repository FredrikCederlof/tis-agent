-- Admin personal profiles + avatar storage (INS-15)
-- Applied via Supabase MCP; keep as repo source of truth.

create table if not exists public.admin_profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  first_name text not null default '',
  last_name text not null default '',
  avatar_path text,
  role text not null default 'admin' check (role in ('admin', 'member')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists admin_profiles_role_idx on public.admin_profiles (role);

alter table public.admin_profiles enable row level security;

drop policy if exists admin_profiles_select_authenticated on public.admin_profiles;
create policy admin_profiles_select_authenticated on public.admin_profiles
  for select to authenticated using (true);

drop policy if exists admin_profiles_update_own on public.admin_profiles;
create policy admin_profiles_update_own on public.admin_profiles
  for update to authenticated
  using (auth.uid() = user_id)
  with check (
    auth.uid() = user_id
    and role = (select p.role from public.admin_profiles p where p.user_id = auth.uid())
  );

drop policy if exists admin_profiles_insert_own on public.admin_profiles;
create policy admin_profiles_insert_own on public.admin_profiles
  for insert to authenticated
  with check (auth.uid() = user_id);

grant select, insert, update on public.admin_profiles to authenticated;
grant all on public.admin_profiles to service_role;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'admin-avatars',
  'admin-avatars',
  true,
  10485760,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists admin_avatars_select_public on storage.objects;
create policy admin_avatars_select_public on storage.objects
  for select to public using (bucket_id = 'admin-avatars');

drop policy if exists admin_avatars_insert_own on storage.objects;
create policy admin_avatars_insert_own on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'admin-avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists admin_avatars_update_own on storage.objects;
create policy admin_avatars_update_own on storage.objects
  for update to authenticated
  using (
    bucket_id = 'admin-avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'admin-avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists admin_avatars_delete_own on storage.objects;
create policy admin_avatars_delete_own on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'admin-avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create or replace function public.handle_admin_profile_create()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  inferred_first text;
begin
  inferred_first := split_part(coalesce(new.raw_user_meta_data->>'full_name', new.email), ' ', 1);
  if inferred_first is null or inferred_first = '' then
    inferred_first := split_part(coalesce(new.email, 'Admin'), '@', 1);
  end if;
  insert into public.admin_profiles (user_id, email, first_name, last_name, role)
  values (
    new.id,
    coalesce(new.email, ''),
    inferred_first,
    coalesce(new.raw_user_meta_data->>'last_name', ''),
    'admin'
  )
  on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_admin_profile on auth.users;
create trigger on_auth_user_created_admin_profile
  after insert on auth.users
  for each row execute function public.handle_admin_profile_create();

insert into public.admin_profiles (user_id, email, first_name, last_name, role)
select
  u.id,
  coalesce(u.email, ''),
  coalesce(
    nullif(split_part(coalesce(u.raw_user_meta_data->>'full_name', u.email), ' ', 1), ''),
    split_part(coalesce(u.email, 'Admin'), '@', 1)
  ),
  coalesce(u.raw_user_meta_data->>'last_name', ''),
  'admin'
from auth.users u
on conflict (user_id) do nothing;
