-- Greeting reply + multi-line no-evidence fallback pool for admin editing.
-- Run once in Supabase SQL Editor after 005_admin.sql:
-- https://supabase.com/dashboard/project/ixjsiwedssgutrmegyzv/sql/new

alter table agent_config
  add column if not exists greeting_message text,
  add column if not exists no_evidence_messages jsonb;

update agent_config
set greeting_message = coalesce(
  nullif(trim(greeting_message), ''),
  'Hi! I''m Tina. What can I help you with today?' || E'\n' ||
  'I answer from official TIS information — calendar, absences, school times, and more.'
)
where id = 1;

update agent_config
set no_evidence_messages = jsonb_build_array(
  'I don''t have enough verified TIS information to answer that confidently.',
  'I wasn''t able to confirm that from the TIS information I have access to.',
  'I can''t find a clear answer to that in the available TIS information.',
  'It looks like this isn''t covered in the TIS information currently available to me.',
  'I couldn''t verify this from the available TIS information.',
  'I don''t have a reliable TIS source for that yet. Feel free to rephrase or add a bit more detail.',
  'I''m not seeing anything in the TIS information that clearly answers this.',
  'That one doesn''t seem to be covered clearly in the information I have.'
)
where id = 1
  and (no_evidence_messages is null or no_evidence_messages = '[]'::jsonb);

-- Keep legacy single-column field aligned with the first pool entry.
update agent_config
set no_evidence_message = coalesce(
  nullif(trim(no_evidence_messages ->> 0), ''),
  no_evidence_message
)
where id = 1
  and no_evidence_messages is not null;
