-- Manual + automatic Needs Attention queue (Tina Admin UI refresh).
-- Run in Supabase SQL editor after 013_human_reply.sql.

alter table public.interactions
  add column if not exists manual_attention_at timestamptz,
  add column if not exists manual_attention_by text;

create index if not exists interactions_manual_attention_idx
  on public.interactions (manual_attention_at)
  where manual_attention_at is not null and reviewed_at is null;

-- Session list: gaps OR manually flagged, still unreviewed.
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
  coalesce(a.attention_count, 0)::int as needs_attention_count,
  coalesce(a.attention_count, 0) > 0 as needs_attention,
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
  select count(*) as attention_count
  from public.interactions
  where session_id = s.id
    and reviewed_at is null
    and (
      outcome in ('no_evidence', 'low_confidence')
      or manual_attention_at is not null
    )
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

-- Unified Needs Attention inbox: automatic gaps + manual flags.
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
  i.knowledge_entry_id,
  i.manual_attention_at,
  i.manual_attention_by,
  case
    when i.manual_attention_at is not null then 'manual'
    else 'auto'
  end as attention_source
from public.interactions i
where i.reviewed_at is null
  and (
    i.outcome in ('no_evidence', 'low_confidence')
    or i.manual_attention_at is not null
  )
order by coalesce(i.manual_attention_at, i.created_at) desc;

grant select on public.unanswered_interactions to authenticated;
