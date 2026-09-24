-- Web Push subscriptions + delivery idempotency for Needs attention (INS-16).
-- Applied via Supabase MCP; keep this file as the repo source of truth.

create table if not exists public.admin_push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  endpoint text not null,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint admin_push_subscriptions_endpoint_key unique (endpoint)
);

create index if not exists admin_push_subscriptions_user_id_idx
  on public.admin_push_subscriptions (user_id);

create table if not exists public.admin_push_deliveries (
  id uuid primary key default gen_random_uuid(),
  interaction_id uuid not null references public.interactions (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  idempotency_key text not null,
  status text not null check (status in ('sent', 'skipped', 'failed')),
  error text,
  created_at timestamptz not null default now(),
  constraint admin_push_deliveries_idempotency_key unique (idempotency_key)
);

create index if not exists admin_push_deliveries_interaction_id_idx
  on public.admin_push_deliveries (interaction_id);

alter table public.admin_push_subscriptions enable row level security;
alter table public.admin_push_deliveries enable row level security;

drop policy if exists admin_push_subscriptions_select_own on public.admin_push_subscriptions;
create policy admin_push_subscriptions_select_own on public.admin_push_subscriptions
  for select to authenticated using (auth.uid() = user_id);

drop policy if exists admin_push_subscriptions_insert_own on public.admin_push_subscriptions;
create policy admin_push_subscriptions_insert_own on public.admin_push_subscriptions
  for insert to authenticated with check (auth.uid() = user_id);

drop policy if exists admin_push_subscriptions_update_own on public.admin_push_subscriptions;
create policy admin_push_subscriptions_update_own on public.admin_push_subscriptions
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists admin_push_subscriptions_delete_own on public.admin_push_subscriptions;
create policy admin_push_subscriptions_delete_own on public.admin_push_subscriptions
  for delete to authenticated using (auth.uid() = user_id);

-- Deliveries are service-role only (no authenticated policies).
grant select, insert, update, delete on public.admin_push_subscriptions to authenticated;
grant all on public.admin_push_subscriptions to service_role;
grant all on public.admin_push_deliveries to service_role;
