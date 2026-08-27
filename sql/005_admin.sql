-- TIS Agent Milestone 4 (Phase C): answer policy + admin RLS
-- Run once in Supabase SQL Editor after 004_agent_config.sql:
-- https://supabase.com/dashboard/project/ixjsiwedssgutrmegyzv/sql/new

alter table agent_config
  add column if not exists strict_grounding boolean not null default true,
  add column if not exists similarity_threshold float not null default 0.40,
  add column if not exists no_evidence_message text not null default
    'I couldn''t find an official TIS source that answers that.

Source: none found.';

-- Admin analytics helpers (read-only for authenticated staff).
create or replace view admin_stats_7d as
select
  count(distinct cs.id)::int as sessions,
  count(i.id)::int as questions,
  round(avg(cs.message_count)::numeric, 1) as avg_questions_per_session,
  count(i.id) filter (where i.outcome = 'success')::int as success_count,
  count(i.id) filter (where i.outcome in ('no_evidence', 'low_confidence'))::int as gap_count,
  count(i.id) filter (where i.outcome = 'fixed_answer')::int as fixed_answer_count,
  count(i.id) filter (where i.outcome = 'error')::int as error_count
from chat_sessions cs
left join interactions i on i.session_id = cs.id
where cs.started_at >= now() - interval '7 days';

-- Row level security: webhook uses service role (bypasses RLS); admin uses Supabase Auth.
alter table agent_config enable row level security;
alter table interactions enable row level security;
alter table chat_sessions enable row level security;

drop policy if exists agent_config_admin_select on agent_config;
create policy agent_config_admin_select on agent_config
  for select to authenticated using (true);

drop policy if exists agent_config_admin_update on agent_config;
create policy agent_config_admin_update on agent_config
  for update to authenticated using (true) with check (true);

drop policy if exists interactions_admin_select on interactions;
create policy interactions_admin_select on interactions
  for select to authenticated using (true);

drop policy if exists interactions_admin_update on interactions;
create policy interactions_admin_update on interactions
  for update to authenticated using (true) with check (true);

drop policy if exists chat_sessions_admin_select on chat_sessions;
create policy chat_sessions_admin_select on chat_sessions
  for select to authenticated using (true);

grant select on admin_stats_7d to authenticated;
grant select on unanswered_interactions to authenticated;
