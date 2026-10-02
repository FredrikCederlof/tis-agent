-- Per-user Tina Admin UI theme (Lime Licorice default).
-- Applied via Supabase MCP; keep as repo source of truth.

alter table public.admin_profiles
  add column if not exists ui_theme text not null default 'lime_licorice'
  check (ui_theme in ('lime_licorice', 'green_garden'));

comment on column public.admin_profiles.ui_theme is
  'Admin UI theme preference: lime_licorice (default) or green_garden.';
