-- Close the access holes from docs/privacy-audit.md (C1, C2, C3, M3).
-- Applied to ixjsiwedssgutrmegyzv on 2026-10-09.
-- This file is not sql/008_fallback_messages.sql. Do not re-run it to "catch up".
-- Webhook writes stay on the service role, which bypasses RLS.
-- Existing admin_profiles rows are not changed.

-- C3. New accounts no longer become admin from editable user metadata.
-- A matching, unexpired invitation is the only way to receive a role.
create or replace function public.handle_admin_profile_create()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  inferred_first text;
  inferred_last text;
  assigned_role text := 'member';
  assigned_status text := 'deactivated';
  invitation public.admin_invitations%rowtype;
  invite_first text := '';
  invite_last text := '';
begin
  if new.email is not null then
    select *
    into invitation
    from public.admin_invitations
    where lower(email) = lower(new.email)
      and accepted_at is null
      and revoked_at is null
      and expires_at > now()
    order by created_at desc
    limit 1;

    if found and invitation.role in ('admin', 'member') then
      assigned_role := invitation.role;
      assigned_status := 'active';
      invite_first := coalesce(invitation.first_name, '');
      invite_last := coalesce(invitation.last_name, '');
      update public.admin_invitations
        set accepted_at = now(), updated_at = now()
        where id = invitation.id;
    end if;
  end if;

  inferred_first := coalesce(
    nullif(trim(invite_first), ''),
    nullif(trim(new.raw_user_meta_data->>'first_name'), ''),
    nullif(split_part(coalesce(new.raw_user_meta_data->>'full_name', new.email), ' ', 1), ''),
    split_part(coalesce(new.email, 'User'), '@', 1)
  );
  inferred_last := coalesce(
    nullif(trim(invite_last), ''),
    nullif(trim(new.raw_user_meta_data->>'last_name'), ''),
    ''
  );

  insert into public.admin_profiles (
    user_id, email, first_name, last_name, role, status
  )
  values (
    new.id,
    coalesce(new.email, ''),
    inferred_first,
    inferred_last,
    assigned_role,
    assigned_status
  )
  on conflict (user_id) do nothing;

  return new;
end;
$function$;

revoke all on function public.handle_admin_profile_create() from public, anon, authenticated;
revoke all on function public.is_active_admin() from public, anon;
grant execute on function public.is_active_admin() to authenticated;

-- C2. Conversation and config rows are visible only to an active admin.
drop policy if exists interactions_admin_select on public.interactions;
create policy interactions_admin_select on public.interactions
  for select to authenticated
  using (public.is_active_admin());

drop policy if exists interactions_admin_update on public.interactions;
create policy interactions_admin_update on public.interactions
  for update to authenticated
  using (public.is_active_admin())
  with check (public.is_active_admin());

drop policy if exists chat_sessions_admin_select on public.chat_sessions;
create policy chat_sessions_admin_select on public.chat_sessions
  for select to authenticated
  using (public.is_active_admin());

drop policy if exists chat_sessions_admin_update on public.chat_sessions;
create policy chat_sessions_admin_update on public.chat_sessions
  for update to authenticated
  using (public.is_active_admin())
  with check (public.is_active_admin());

drop policy if exists chat_sessions_admin_delete on public.chat_sessions;
create policy chat_sessions_admin_delete on public.chat_sessions
  for delete to authenticated
  using (public.is_active_admin());

drop policy if exists agent_config_admin_select on public.agent_config;
create policy agent_config_admin_select on public.agent_config
  for select to authenticated
  using (public.is_active_admin());

drop policy if exists admin_replies_admin_select on public.admin_replies;
create policy admin_replies_admin_select on public.admin_replies
  for select to authenticated
  using (public.is_active_admin());

drop policy if exists knowledge_entries_select_auth on public.knowledge_entries;
create policy knowledge_entries_select_auth on public.knowledge_entries
  for select to authenticated
  using (public.is_active_admin());

drop policy if exists knowledge_entries_insert_auth on public.knowledge_entries;
create policy knowledge_entries_insert_auth on public.knowledge_entries
  for insert to authenticated
  with check (public.is_active_admin());

drop policy if exists knowledge_entries_update_auth on public.knowledge_entries;
create policy knowledge_entries_update_auth on public.knowledge_entries
  for update to authenticated
  using (public.is_active_admin())
  with check (public.is_active_admin());

drop policy if exists admin_profiles_select_authenticated on public.admin_profiles;
create policy admin_profiles_select_own_or_admin on public.admin_profiles
  for select to authenticated
  using (auth.uid() = user_id or public.is_active_admin());

-- C1. Views must not bypass RLS, and anon must not be able to select them.
alter view public.admin_session_list set (security_invoker = true);
alter view public.unanswered_interactions set (security_invoker = true);
alter view public.admin_stats_7d set (security_invoker = true);

revoke all on table public.admin_session_list from public, anon;
revoke all on table public.unanswered_interactions from public, anon;
revoke all on table public.admin_stats_7d from public, anon;

-- M3. Source files stay on the service role. The app downloads with that key.
update storage.buckets
set public = false
where id = 'tis-ass';
