-- Track Slack Needs-attention reminders so each milestone fires once per interaction.
-- Milestones: 4h / 1h remaining on the WhatsApp 24h reply window.

create table if not exists public.slack_attention_reminders (
  interaction_id uuid not null references public.interactions (id) on delete cascade,
  milestone text not null,
  sent_at timestamptz not null default now(),
  primary key (interaction_id, milestone)
);

create index if not exists slack_attention_reminders_sent_at_idx
  on public.slack_attention_reminders (sent_at desc);

alter table public.slack_attention_reminders enable row level security;

comment on table public.slack_attention_reminders is
  'Dedupes Slack #tina-needs-attention reminders before the WhatsApp 24h window closes.';
