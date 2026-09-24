-- Notification message preview preference (INS-18)
-- Applied via Supabase MCP; keep as repo source of truth.

alter table public.admin_profiles
  add column if not exists notify_message_previews boolean not null default false;
