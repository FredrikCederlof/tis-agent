-- A removed user could turn their own access back on.
-- admin_profiles_update_own froze role and left status open. Deactivation runs
-- as the service role. The removed person's access token still works until it
-- expires, and that token can update this table directly.
-- Safe to re-run. Depends on auth.uid() and auth.role() (Supabase).

create or replace function public.protect_admin_profile_privileges()
returns trigger
language plpgsql
security invoker
set search_path to 'public'
as $function$
begin
  if new.role is not distinct from old.role
     and new.status is not distinct from old.status
     and new.deactivated_at is not distinct from old.deactivated_at
     and new.deactivated_by is not distinct from old.deactivated_by
  then
    return new;
  end if;

  -- Service role (Tina Admin user management) and the SQL owner may change
  -- access. A signed-in user may not, including a still-valid access token
  -- after deactivation. Checked separately so a privileged database role does
  -- not need to call auth.role().
  if current_user in ('service_role', 'postgres', 'supabase_admin', 'supabase_auth_admin') then
    return new;
  end if;

  if coalesce(auth.role(), '') = 'service_role' then
    return new;
  end if;

  raise exception 'role and access status cannot be changed from this session'
    using errcode = '42501';
end;
$function$;

drop trigger if exists protect_admin_profile_privileges on public.admin_profiles;
create trigger protect_admin_profile_privileges
  before update on public.admin_profiles
  for each row
  execute function public.protect_admin_profile_privileges();

drop policy if exists admin_profiles_update_own on public.admin_profiles;
create policy admin_profiles_update_own on public.admin_profiles
  for update to authenticated
  using (auth.uid() = user_id)
  with check (
    auth.uid() = user_id
    and role = (select p.role from public.admin_profiles p where p.user_id = auth.uid())
    and status = (select p.status from public.admin_profiles p where p.user_id = auth.uid())
  );
