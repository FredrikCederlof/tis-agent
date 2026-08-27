-- TIS Agent: persistent WhatsApp message deduplication
-- Prevents Meta webhook retries / post-deploy replays from sending duplicate replies.
-- Run once after 005_admin.sql:
-- https://supabase.com/dashboard/project/ixjsiwedssgutrmegyzv/sql/new

create table if not exists whatsapp_message_dedup (
  wa_message_id text primary key,
  wa_from text not null,
  question text not null,
  processed_at timestamptz not null default now()
);

create index if not exists whatsapp_message_dedup_processed_at_idx
  on whatsapp_message_dedup (processed_at desc);

-- Service role (Railway webhook) inserts; no admin UI needed.
alter table whatsapp_message_dedup enable row level security;
