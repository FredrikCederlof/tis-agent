-- TIS Agent Milestone 4 (Phase A): conversation logging & sessions
-- Run once in Supabase SQL Editor after 001_rag.sql and 002_sync.sql:
-- https://supabase.com/dashboard/project/ixjsiwedssgutrmegyzv/sql/new

-- A session ends when there is no message for 10 minutes (enforced in app code).
create table if not exists chat_sessions (
  id uuid primary key default gen_random_uuid(),
  wa_from text not null,
  started_at timestamptz not null default now(),
  last_message_at timestamptz not null default now(),
  message_count int not null default 0,
  primary_language text,
  created_at timestamptz not null default now()
);

create index if not exists chat_sessions_wa_from_last_idx
  on chat_sessions (wa_from, last_message_at desc);

create table if not exists interactions (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references chat_sessions (id) on delete cascade,
  wa_message_id text,
  wa_from text not null,
  question text not null,
  reply text,
  language text not null default 'en',
  outcome text not null,
  evidence_count int not null default 0,
  top_similarity float,
  document_titles jsonb not null default '[]'::jsonb,
  channel text not null default 'whatsapp',
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by text,
  constraint interactions_outcome_check check (
    outcome in ('success', 'no_evidence', 'low_confidence', 'fixed_answer', 'error')
  )
);

create unique index if not exists interactions_wa_message_id_idx
  on interactions (wa_message_id)
  where wa_message_id is not null;

create index if not exists interactions_outcome_created_idx
  on interactions (outcome, created_at desc);

create index if not exists interactions_session_idx
  on interactions (session_id);

create index if not exists interactions_created_at_idx
  on interactions (created_at desc);

-- Questions Tina could not answer confidently (for admin inbox & weekly email).
create or replace view unanswered_interactions as
select
  i.id,
  i.session_id,
  i.question,
  i.reply,
  i.language,
  i.outcome,
  i.top_similarity,
  i.document_titles,
  i.created_at,
  i.reviewed_at,
  i.reviewed_by
from interactions i
where i.outcome in ('no_evidence', 'low_confidence')
  and i.reviewed_at is null
order by i.created_at desc;
