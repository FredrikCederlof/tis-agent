-- Public pages edited in Tina Admin. The privacy notice is slug "privacy".
-- Safe to re-run: the seed does not overwrite an edited article.

create table if not exists public.content_pages (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null,
  body_html text not null default '',
  published boolean not null default true,
  sort_order integer not null default 0,
  updated_at timestamptz not null default now(),
  updated_by text not null default '',
  constraint content_pages_slug_check
    check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' and char_length(slug) <= 60)
);

alter table public.content_pages enable row level security;

drop policy if exists content_pages_public_select on public.content_pages;
create policy content_pages_public_select on public.content_pages
  for select to anon, authenticated
  using (published = true);

drop policy if exists content_pages_admin_all on public.content_pages;
create policy content_pages_admin_all on public.content_pages
  for all to authenticated
  using (public.is_active_admin())
  with check (public.is_active_admin());

revoke all on table public.content_pages from public;
grant select on table public.content_pages to anon, authenticated;
grant insert, update, delete on table public.content_pages to authenticated;

create or replace function public.content_pages_guard()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    if old.slug = 'privacy' then
      raise exception 'The privacy page cannot be deleted';
    end if;
    return old;
  end if;

  if new.slug in (
    'login', 'api', 'content', 'settings', 'auth', 'pages', 'account',
    'onboard', 'inbox', 'chats', 'knowledge', 'sync', 'sandbox', 'users', 'config'
  ) then
    raise exception 'That address is reserved';
  end if;

  if tg_op = 'UPDATE' and old.slug = 'privacy' and new.slug is distinct from 'privacy' then
    raise exception 'The privacy page address cannot change';
  end if;

  return new;
end;
$$;

drop trigger if exists content_pages_guard on public.content_pages;
create trigger content_pages_guard
  before insert or update or delete on public.content_pages
  for each row execute function public.content_pages_guard();

revoke all on function public.content_pages_guard() from public;
grant execute on function public.content_pages_guard() to authenticated, service_role;

insert into public.content_pages (slug, title, body_html, published, sort_order, updated_by)
values (
  'privacy',
  'How Tina handles information',
  $body$
<h2>About this project</h2>
<p>Tina is an independent assistant a parent at Tokyo International School set up so other parents can find everyday school information more easily. It is a non-commercial project: there is no fee, no advertising, and information is not sold.</p>
<p>Tina is not affiliated with, endorsed by, or operated by Tokyo International School. The school has not commissioned this assistant.</p>
<p>Answers are generated and can be wrong. For official information, contact Tokyo International School directly.</p>
<p>This page describes how Tina works. It is not a legal opinion, and it is not a statement that Tina meets a particular law.</p>
<h2>Privacy notice</h2>
<p>Questions about this notice go to Fredrik Sterner Cederlöf at <a href="mailto:{privacy_contact_email}">{privacy_contact_email}</a>.</p>
<p>Using Tina is optional. You start by sending a WhatsApp message. The first reply to a new number includes a link to this notice. That first message is received and answered before the link is shown. If you do not want Tina to keep the conversation, stop messaging, or ask for deletion.</p>
<p>When you message Tina, Tina stores your phone number, your message, Tina’s reply, the language, the time, and the titles of documents used in the answer. A short copy of the question is also kept so a retried WhatsApp delivery is not answered twice.</p>
<h2>How we use your information</h2>
<ul>
<li>Receive a WhatsApp question and reply to it.</li>
<li>Keep recent messages in the same chat so a follow-up can be understood.</li>
<li>Ignore a duplicate delivery of the same message.</li>
<li>Let an invited administrator review a question Tina could not answer.</li>
<li>Let an administrator save a reviewed, general article into the knowledge base.</li>
<li>Notify staff of a question. In that notification the phone number is masked.</li>
<li>Respond to a request for a copy, a correction, or deletion, and look into a technical problem.</li>
</ul>
<p>Information is not sold and is not used for advertising. Improving Tina means a person writes a general article. The raw chat is not kept for that purpose beyond the retention period below.</p>
<h2>Children</h2>
<p>Tina does not keep student profiles, grades, medical records, or a named child’s school account. The material used to answer is general school information.</p>
<p>A message you send can still name a child or include other personal details. That message is stored as you sent it. Please do not share information about children or other people unless you need to. Weekly school mail is cleaned before it is added, and child names are removed from that mail.</p>
<h2>Data retention</h2>
<p>Conversation records are kept for {retention_days} days, then deleted from Tina’s active database. School documents and knowledge articles stay. The chat on your phone, copies held by WhatsApp or other providers, and temporary backups can remain for a different period.</p>
<h2>Who can see conversations</h2>
<p>Tina Admin is only for people an administrator has invited. Conversation records are not public. Invited staff can read them in order to handle questions Tina could not answer. Some documents are marked so they stay in storage and are left out of answers.</p>
<h2>Your request</h2>
<p>You can ask for a copy, a correction, or deletion of the information stored for your WhatsApp number. Contact Fredrik Sterner Cederlöf at <a href="mailto:{privacy_contact_email}">{privacy_contact_email}</a>. We may need to confirm that you control that phone number before completing the request. Deleting the rows in Tina’s database does not delete the chat on your phone, copies held by other providers, or temporary backups.</p>
<h2>Where information is handled</h2>
<p>Some of this happens outside Japan.</p>
<ul>
<li>Meta (WhatsApp) carries the phone number and the message.</li>
<li>A service in Singapore receives the message and sends the reply.</li>
<li>OpenAI writes the reply from the question, recent messages in the same chat, and short excerpts from school documents. The phone number is not included.</li>
<li>Supabase, in Tokyo, stores the conversation and the searchable knowledge base.</li>
<li>Vercel hosts this website.</li>
<li>Google Drive holds the source documents that are chosen for indexing.</li>
<li>Slack can show staff the text of a question. The phone number in that notice is masked.</li>
</ul>
<p>Each company handles its own part under that company’s terms. This page does not describe a completed legal arrangement for transfers outside Japan.</p>
<h2>Knowledge</h2>
<p>Answers come from general school information, not from a file about a student. Google Drive holds the source documents. Supabase holds the copy used to search and answer. Tina Admin holds knowledge articles a person writes and saves. An article can start from a question Tina could not answer. The person reviews it and is expected to keep it general before it is saved. A saved article stays after the conversation itself is deleted.</p>
$body$,
  true,
  0,
  'seed'
)
on conflict (slug) do nothing;

-- Supabase may grant new public tables to anon. Keep anon to published reads only.
revoke insert, update, delete, truncate, references, trigger on table public.content_pages from anon;
revoke all on function public.content_pages_guard() from anon;
