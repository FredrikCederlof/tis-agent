-- Admin Chats (INS-11): unread state, session list view, delete/update RLS.
-- Run in Supabase SQL editor after 003_analytics.sql and 005_admin.sql.

alter table public.chat_sessions
  add column if not exists admin_read_at timestamptz;

create index if not exists chat_sessions_last_message_idx
  on public.chat_sessions (last_message_at desc);

create index if not exists chat_sessions_admin_read_idx
  on public.chat_sessions (admin_read_at);

drop view if exists public.admin_session_list;
create view public.admin_session_list as
select
  s.id,
  s.wa_from,
  s.started_at,
  s.last_message_at,
  s.message_count,
  s.primary_language,
  s.admin_read_at,
  (s.admin_read_at is null or s.last_message_at > s.admin_read_at) as unread,
  i.question as last_question,
  i.reply as last_reply,
  i.outcome as last_outcome
from public.chat_sessions s
left join lateral (
  select question, reply, outcome
  from public.interactions
  where session_id = s.id
  order by created_at desc
  limit 1
) i on true;

drop policy if exists chat_sessions_admin_update on public.chat_sessions;
create policy chat_sessions_admin_update
  on public.chat_sessions for update
  to authenticated
  using (true)
  with check (true);

drop policy if exists chat_sessions_admin_delete on public.chat_sessions;
create policy chat_sessions_admin_delete
  on public.chat_sessions for delete
  to authenticated
  using (true);

grant select on public.admin_session_list to authenticated;
grant update, delete on public.chat_sessions to authenticated;
