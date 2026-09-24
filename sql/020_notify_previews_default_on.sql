-- Show parent question previews in Needs attention notifications by default.
-- Existing users who never opted in still get the question in Chrome alerts.

alter table public.admin_profiles
  alter column notify_message_previews set default true;

update public.admin_profiles
set notify_message_previews = true
where notify_message_previews is distinct from true;
