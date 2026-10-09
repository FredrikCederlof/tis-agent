-- Invitation-only Tina Admin access.
-- Applied to ixjsiwedssgutrmegyzv on 2026-10-09.
-- Production invites still go through Admin → Users. Do not re-run this file to "catch up".

create or replace function public.invite_admin_user(
  invite_email text,
  invite_role text default 'admin',
  invite_first text default '',
  invite_last text default ''
)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  clean_email text := lower(trim(coalesce(invite_email, '')));
  invitation_id uuid;
  token_hash text;
begin
  if not public.is_active_admin() then
    raise exception 'Only an active admin can invite users';
  end if;

  if clean_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception 'Enter a valid email address';
  end if;

  if invite_role is null or invite_role not in ('admin', 'member') then
    raise exception 'Role must be admin or member';
  end if;

  if exists (
    select 1 from auth.users u where lower(u.email) = clean_email
  ) then
    raise exception 'That person already has an account';
  end if;

  token_hash := encode(
    extensions.digest(gen_random_uuid()::text || clock_timestamp()::text, 'sha256'),
    'hex'
  );

  select i.id
  into invitation_id
  from public.admin_invitations i
  where lower(i.email) = clean_email
    and i.accepted_at is null
    and i.revoked_at is null
    and i.expires_at > now()
  order by i.created_at desc
  limit 1;

  if invitation_id is not null then
    update public.admin_invitations
    set role = invite_role,
        first_name = coalesce(nullif(trim(invite_first), ''), first_name),
        last_name = coalesce(nullif(trim(invite_last), ''), last_name),
        invited_by = auth.uid(),
        expires_at = now() + interval '7 days',
        updated_at = now()
    where id = invitation_id;
  else
    insert into public.admin_invitations (
      email, first_name, last_name, role, token_hash, invited_by, expires_at
    )
    values (
      clean_email,
      coalesce(trim(invite_first), ''),
      coalesce(trim(invite_last), ''),
      invite_role,
      token_hash,
      auth.uid(),
      now() + interval '7 days'
    )
    returning id into invitation_id;
  end if;

  insert into public.admin_audit_events (action, actor_user_id, target_email, metadata)
  values (
    'admin_invited',
    auth.uid(),
    clean_email,
    jsonb_build_object('role', invite_role, 'invitation_id', invitation_id)
  );

  return invitation_id;
end;
$function$;

create or replace function public.revoke_admin_invitation(invitation_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  invite_email text;
begin
  if not public.is_active_admin() then
    raise exception 'Only an active admin can revoke an invitation';
  end if;

  update public.admin_invitations
  set revoked_at = now(), updated_at = now()
  where id = invitation_id
    and accepted_at is null
    and revoked_at is null
  returning email into invite_email;

  if invite_email is null then
    raise exception 'That invitation is no longer pending';
  end if;

  insert into public.admin_audit_events (action, actor_user_id, target_email, metadata)
  values (
    'admin_invitation_revoked',
    auth.uid(),
    invite_email,
    jsonb_build_object('invitation_id', invitation_id)
  );
end;
$function$;

create or replace function public.deactivate_admin_user(target_user_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  target_email text;
  target_role text;
  remaining_admins int;
begin
  if not public.is_active_admin() then
    raise exception 'Only an active admin can remove access';
  end if;

  if target_user_id = auth.uid() then
    raise exception 'You cannot remove your own access';
  end if;

  select email, role
  into target_email, target_role
  from public.admin_profiles
  where user_id = target_user_id
    and status = 'active';

  if target_email is null then
    raise exception 'That person does not have active access';
  end if;

  if target_role = 'admin' then
    select count(*)
    into remaining_admins
    from public.admin_profiles
    where role = 'admin'
      and status = 'active'
      and user_id <> target_user_id;

    if remaining_admins < 1 then
      raise exception 'Keep at least one active admin';
    end if;
  end if;

  update public.admin_profiles
  set status = 'deactivated',
      deactivated_at = now(),
      deactivated_by = auth.uid(),
      updated_at = now()
  where user_id = target_user_id;

  insert into public.admin_audit_events (
    action, actor_user_id, target_user_id, target_email, metadata
  )
  values (
    'admin_access_removed',
    auth.uid(),
    target_user_id,
    target_email,
    '{}'::jsonb
  );
end;
$function$;

revoke all on function public.invite_admin_user(text, text, text, text) from public, anon;
revoke all on function public.revoke_admin_invitation(uuid) from public, anon;
revoke all on function public.deactivate_admin_user(uuid) from public, anon;
grant execute on function public.invite_admin_user(text, text, text, text) to authenticated;
grant execute on function public.revoke_admin_invitation(uuid) to authenticated;
grant execute on function public.deactivate_admin_user(uuid) to authenticated;

-- New accounts no longer get a profile from signup metadata.
-- Without a live invitation the auth insert is rejected.
create or replace function public.handle_admin_profile_create()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  invitation public.admin_invitations%rowtype;
  inferred_first text;
  inferred_last text;
  has_invitation boolean := false;
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
    has_invitation := found;
  end if;

  if not has_invitation then
    raise exception 'An invitation from an admin is required';
  end if;
  if invitation.role not in ('admin', 'member') then
    raise exception 'An invitation from an admin is required';
  end if;

  inferred_first := coalesce(
    nullif(trim(invitation.first_name), ''),
    nullif(trim(new.raw_user_meta_data->>'first_name'), ''),
    nullif(split_part(coalesce(new.raw_user_meta_data->>'full_name', new.email), ' ', 1), ''),
    split_part(coalesce(new.email, 'User'), '@', 1)
  );
  inferred_last := coalesce(
    nullif(trim(invitation.last_name), ''),
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
    invitation.role,
    'active'
  )
  on conflict (user_id) do nothing;

  update public.admin_invitations
  set accepted_at = now(), updated_at = now()
  where id = invitation.id;

  return new;
end;
$function$;

revoke all on function public.handle_admin_profile_create() from public, anon, authenticated;

alter table public.admin_invitations enable row level security;

drop policy if exists admin_invitations_admin_select on public.admin_invitations;
create policy admin_invitations_admin_select on public.admin_invitations
  for select to authenticated
  using (public.is_active_admin());
