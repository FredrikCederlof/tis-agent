-- Staff Sandbox: try Tina in Admin without WhatsApp.
-- Per-user private conversations; not linked to chat_sessions / interactions.
-- Run in Supabase SQL editor after 001–022.

create table if not exists public.sandbox_conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  title text not null default 'New chat',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists sandbox_conversations_user_updated_idx
  on public.sandbox_conversations (user_id, updated_at desc);

create table if not exists public.sandbox_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null
    references public.sandbox_conversations (id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  outcome text,
  document_titles text[] not null default '{}',
  created_at timestamptz not null default now()
);

create index if not exists sandbox_messages_conversation_created_idx
  on public.sandbox_messages (conversation_id, created_at);

alter table public.sandbox_conversations enable row level security;
alter table public.sandbox_messages enable row level security;

drop policy if exists "sandbox_conversations_select_own" on public.sandbox_conversations;
create policy "sandbox_conversations_select_own"
  on public.sandbox_conversations for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "sandbox_conversations_insert_own" on public.sandbox_conversations;
create policy "sandbox_conversations_insert_own"
  on public.sandbox_conversations for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "sandbox_conversations_update_own" on public.sandbox_conversations;
create policy "sandbox_conversations_update_own"
  on public.sandbox_conversations for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "sandbox_conversations_delete_own" on public.sandbox_conversations;
create policy "sandbox_conversations_delete_own"
  on public.sandbox_conversations for delete
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "sandbox_messages_select_own" on public.sandbox_messages;
create policy "sandbox_messages_select_own"
  on public.sandbox_messages for select
  to authenticated
  using (
    exists (
      select 1 from public.sandbox_conversations c
      where c.id = conversation_id and c.user_id = auth.uid()
    )
  );

drop policy if exists "sandbox_messages_insert_own" on public.sandbox_messages;
create policy "sandbox_messages_insert_own"
  on public.sandbox_messages for insert
  to authenticated
  with check (
    exists (
      select 1 from public.sandbox_conversations c
      where c.id = conversation_id and c.user_id = auth.uid()
    )
  );

drop policy if exists "sandbox_messages_delete_own" on public.sandbox_messages;
create policy "sandbox_messages_delete_own"
  on public.sandbox_messages for delete
  to authenticated
  using (
    exists (
      select 1 from public.sandbox_conversations c
      where c.id = conversation_id and c.user_id = auth.uid()
    )
  );

grant select, insert, update, delete on public.sandbox_conversations to authenticated;
grant select, insert, delete on public.sandbox_messages to authenticated;
