-- INS-21: store English translations for admin reading (originals unchanged).
-- Run in Supabase SQL Editor after previous migrations.

alter table interactions
  add column if not exists question_en text,
  add column if not exists reply_en text,
  add column if not exists source_language text,
  add column if not exists translation_status text;

alter table interactions
  drop constraint if exists interactions_translation_status_check;

alter table interactions
  add constraint interactions_translation_status_check
  check (
    translation_status is null
    or translation_status in ('pending', 'done', 'skipped', 'failed')
  );

comment on column interactions.question_en is 'English translation of question for Tina Admin; original question is never overwritten.';
comment on column interactions.reply_en is 'English translation of Tina reply for Tina Admin; original reply is never overwritten.';
comment on column interactions.source_language is 'Detected/declared language of the original parent message.';
comment on column interactions.translation_status is 'pending | done | skipped (already English) | failed';
