-- INS-21: expose stored English on session list + unanswered inbox.

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
  i.question_en as last_question_en,
  i.reply as last_reply,
  i.outcome as last_outcome,
  i.translation_status as last_translation_status,
  coalesce(a.attention_count, 0)::int as needs_attention_count,
  coalesce(a.attention_count, 0) > 0 as needs_attention,
  r.body as last_admin_reply,
  r.created_at as last_admin_reply_at
from public.chat_sessions s
left join lateral (
  select question, question_en, reply, outcome, translation_status
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

drop view if exists public.unanswered_interactions;
create view public.unanswered_interactions as
select
  i.id,
  i.session_id,
  i.wa_from,
  i.wa_message_id,
  i.question,
  i.question_en,
  i.reply,
  i.reply_en,
  i.language,
  i.source_language,
  i.translation_status,
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
