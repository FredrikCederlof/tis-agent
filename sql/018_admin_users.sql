-- Admin user management: status, invitations, audit (INS-17)
-- Applied via Supabase MCP; keep as repo source of truth.

-- Profile status (soft deactivate)
alter table public.admin_profiles
  add column if not exists status text not null default 'active';

alter table public.admin_profiles
  drop constraint if exists admin_profiles_status_check;

alter table public.admin_profiles
  add constraint admin_profiles_status_check check (status in ('active', 'deactivated'));

alter table public.admin_profiles
  add column if not exists deactivated_at timestamptz;

alter table public.admin_profiles
  add column if not exists deactivated_by uuid references auth.users (id) on delete set null;

create index if not exists admin_profiles_status_idx on public.admin_profiles (status);

-- New auth users default to member; invite flow sets role via metadata / service role.
create or replace function public.handle_admin_profile_create()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  inferred_first text;
  inferred_last text;
  assigned_role text;
  assigned_status text;
begin
  inferred_first := coalesce(
    nullif(trim(new.raw_user_meta_data->>'first_name'), ''),
    nullif(split_part(coalesce(new.raw_user_meta_data->>'full_name', new.email), ' ', 1), ''),
    split_part(coalesce(new.email, 'User'), '@', 1)
  );
  inferred_last := coalesce(
    nullif(trim(new.raw_user_meta_data->>'last_name'), ''),
    ''
  );
  assigned_role := coalesce(
    nullif(trim(new.raw_user_meta_data->>'admin_role'), ''),
    'member'
  );
  if assigned_role not in ('admin', 'member') then
    assigned_role := 'member';
  end if;
  assigned_status := coalesce(
    nullif(trim(new.raw_user_meta_data->>'admin_status'), ''),
    'active'
  );
  if assigned_status not in ('active', 'deactivated') then
    assigned_status := 'active';
  end if;

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
$$;

-- Invitations (token stored as SHA-256 hex only)
create table if not exists public.admin_invitations (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  first_name text not null default '',
  last_name text not null default '',
  role text not null default 'member' check (role in ('admin', 'member')),
  token_hash text not null unique,
  invited_by uuid references auth.users (id) on delete set null,
  expires_at timestamptz not null,
  accepted_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists admin_invitations_email_idx
  on public.admin_invitations (lower(email));

create index if not exists admin_invitations_pending_idx
  on public.admin_invitations (expires_at)
  where accepted_at is null and revoked_at is null;

alter table public.admin_invitations enable row level security;

-- Only service role manages invitations (no authenticated policies).
revoke all on public.admin_invitations from authenticated;
grant all on public.admin_invitations to service_role;

-- Audit log
create table if not exists public.admin_audit_events (
  id uuid primary key default gen_random_uuid(),
  action text not null,
  actor_user_id uuid references auth.users (id) on delete set null,
  target_user_id uuid references auth.users (id) on delete set null,
  target_email text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists admin_audit_events_created_idx
  on public.admin_audit_events (created_at desc);

alter table public.admin_audit_events enable row level security;

revoke all on public.admin_audit_events from authenticated;
grant all on public.admin_audit_events to service_role;

-- Helper: is current user an active administrator?
create or replace function public.is_active_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.admin_profiles p
    where p.user_id = auth.uid()
      and p.role = 'admin'
      and p.status = 'active'
  );
$$;

revoke all on function public.is_active_admin() from public;
grant execute on function public.is_active_admin() to authenticated, service_role;

-- Tighten agent_config writes to active admins (read stays for all authenticated).
drop policy if exists agent_config_admin_update on public.agent_config;
drop policy if exists agent_config_update_authenticated on public.agent_config;
drop policy if exists agent_config_update_admin on public.agent_config;

create policy agent_config_update_admin on public.agent_config
  for update to authenticated
  using (public.is_active_admin())
  with check (public.is_active_admin());
