-- Dashboard Time saved KPI: minutes of manual work avoided per Tina success.
-- Run in Supabase SQL Editor after 005_admin.sql:
-- https://supabase.com/dashboard/project/ixjsiwedssgutrmegyzv/sql/new

alter table agent_config
  add column if not exists minutes_saved_per_question integer not null default 5;

alter table agent_config
  drop constraint if exists agent_config_minutes_saved_check;

alter table agent_config
  add constraint agent_config_minutes_saved_check
  check (minutes_saved_per_question >= 1 and minutes_saved_per_question <= 180);

comment on column agent_config.minutes_saved_per_question is
  'Minutes of manual work typically saved when Tina successfully answers a parent question without human intervention.';
