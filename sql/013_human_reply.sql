-- Human in the loop (INS-12): admin replies to parents over WhatsApp.
-- Run in Supabase SQL editor after 012_chat_sessions_admin.sql.

-- Who answered by hand, and when. reviewed_at/reviewed_by stay the escalation state.
alter table public.interactions
  add column if not exists human_replied_at timestamptz,
  add column if not exists human_replied_by text;

-- One row per outbound admin message, so the full lifecycle stays traceable:
-- inbound WhatsApp message -> unanswered question -> human reply -> knowledge entry.
create table if not exists public.admin_replies (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.chat_sessions (id) on delete cascade,
  interaction_id uuid references public.interactions (id) on delete set null,
  wa_from text not null,
  wa_message_id text,
  body text not null,
  status text not null default 'sent',
  error text,
  sent_by text,
  created_at timestamptz not null default now(),
  constraint admin_replies_status_check check (status in ('sent', 'failed'))
);

create index if not exists admin_replies_session_idx
  on public.admin_replies (session_id, created_at);

create index if not exists admin_replies_interaction_idx
  on public.admin_replies (interaction_id);

alter table public.admin_replies enable row level security;

drop policy if exists admin_replies_admin_select on public.admin_replies;
create policy admin_replies_admin_select
  on public.admin_replies for select
  to authenticated
  using (true);

grant select on public.admin_replies to authenticated;

-- Session list gains needs-attention state and the newest admin reply preview.
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
  i.outcome as last_outcome,
  coalesce(a.gap_count, 0)::int as needs_attention_count,
  coalesce(a.gap_count, 0) > 0 as needs_attention,
  r.body as last_admin_reply,
  r.created_at as last_admin_reply_at
from public.chat_sessions s
left join lateral (
  select question, reply, outcome
  from public.interactions
  where session_id = s.id
  order by created_at desc
  limit 1
) i on true
left join lateral (
  select count(*) as gap_count
  from public.interactions
  where session_id = s.id
    and outcome in ('no_evidence', 'low_confidence')
    and reviewed_at is null
) a on true
left join lateral (
  select body, created_at
  from public.admin_replies
  where session_id = s.id
    and status = 'sent'
  order by created_at desc
  limit 1
) r on true;

grant select on public.admin_session_list to authenticated;

-- Unanswered inbox: expose the identifiers a human reply needs.
drop view if exists public.unanswered_interactions;
create view public.unanswered_interactions as
select
  i.id,
  i.session_id,
  i.wa_from,
  i.wa_message_id,
  i.question,
  i.reply,
  i.language,
  i.outcome,
  i.top_similarity,
  i.document_titles,
  i.created_at,
  i.reviewed_at,
  i.reviewed_by,
  i.human_replied_at,
  i.human_replied_by,
  i.knowledge_entry_id
from public.interactions i
where i.outcome in ('no_evidence', 'low_confidence')
  and i.reviewed_at is null
order by i.created_at desc;

grant select on public.unanswered_interactions to authenticated;
