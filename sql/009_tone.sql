-- Tina tone of voice (INS-6): warmer greeting + no-evidence pool.
-- Does not overwrite system_prompt (admin-editable).
-- Run once in Supabase SQL Editor after 008_fallback_messages.sql:
-- https://supabase.com/dashboard/project/ixjsiwedssgutrmegyzv/sql/new

update agent_config
set greeting_message =
  'Hi — I''m Tina. Ask me about the calendar, absences, school times, '
  || 'and the rest of the official TIS info.'
where id = 1
  and greeting_message in (
    'Hi! I''m Tina. What can I help you with today?' || E'\n'
      || 'I answer from official TIS information — calendar, absences, school times, and more.',
    'Hi! I''m Tina. What can I help you with today?'
  );

update agent_config
set no_evidence_messages = jsonb_build_array(
  'Hmm, I don''t have anything on that one yet. It might be worth checking directly with TIS.',
  'I don''t have enough information on that one.',
  'I couldn''t find anything on this yet.',
  'It doesn''t look like this is covered in the information I have.',
  'I''m not finding a clear answer to that yet.',
  'I don''t have that one yet — try rephrasing or add a bit more detail?',
  'Looks like I don''t have a clear answer for that.',
  'I''m not seeing anything on that yet.'
)
where id = 1
  and no_evidence_messages = jsonb_build_array(
    'I don''t have enough verified TIS information to answer that confidently.',
    'I wasn''t able to confirm that from the TIS information I have access to.',
    'I can''t find a clear answer to that in the available TIS information.',
    'It looks like this isn''t covered in the TIS information currently available to me.',
    'I couldn''t verify this from the available TIS information.',
    'I don''t have a reliable TIS source for that yet. Feel free to rephrase or add a bit more detail.',
    'I''m not seeing anything in the TIS information that clearly answers this.',
    'That one doesn''t seem to be covered clearly in the information I have.'
  );

update agent_config
set no_evidence_message = coalesce(
  nullif(trim(no_evidence_messages ->> 1), ''),
  nullif(trim(no_evidence_messages ->> 0), ''),
  no_evidence_message
)
where id = 1
  and no_evidence_message in (
    'I couldn''t find an official TIS source that answers that.',
    'I don''t have enough verified TIS information to answer that confidently.'
  );
