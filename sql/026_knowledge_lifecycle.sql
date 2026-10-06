-- INS-23: Knowledge Hub lifecycle, ownership, audience, AI guidance, last_ingested_at.
-- Run in Supabase SQL editor after 010–025.

alter table public.knowledge_entries
  drop constraint if exists knowledge_entries_status_check;

alter table public.knowledge_entries
  add constraint knowledge_entries_status_check
  check (status in ('draft', 'active', 'expired', 'archived'));

alter table public.knowledge_entries
  add column if not exists valid_until date,
  add column if not exists review_due_date date,
  add column if not exists content_owner text,
  add column if not exists source_url text,
  add column if not exists audience text[] not null default '{All}',
  add column if not exists exclusion_notes text,
  add column if not exists last_ingested_at timestamptz;

-- Existing rows stay active/archived; default audience All.
update public.knowledge_entries
set audience = '{All}'
where audience is null or cardinality(audience) = 0;

create index if not exists knowledge_entries_valid_until_idx
  on public.knowledge_entries (valid_until)
  where valid_until is not null;

create index if not exists knowledge_entries_review_due_idx
  on public.knowledge_entries (review_due_date)
  where review_due_date is not null;

create index if not exists knowledge_entries_document_id_idx
  on public.knowledge_entries (document_id)
  where document_id is not null;
