-- Knowledge Hub: curated parent Q&A that projects into the existing RAG store.
-- Admin writes metadata here; Railway ingest_bytes() creates documents/chunks
-- with source_type = 'knowledge' and drive_file_id = 'knowledge:<entry-id>'.
-- Run in Supabase SQL editor after 001–009.

create table if not exists public.knowledge_entries (
  id uuid primary key default gen_random_uuid(),
  primary_question text not null,
  similar_questions text[] not null default '{}',
  answer text not null,
  category text,
  tags text[] not null default '{}',
  source_note text,
  origin text not null default 'manual'
    check (origin in ('manual', 'inbox')),
  origin_interaction_id uuid references public.interactions (id) on delete set null,
  status text not null default 'active'
    check (status in ('active', 'archived')),
  document_id uuid references public.documents (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by text
);

create index if not exists knowledge_entries_status_idx
  on public.knowledge_entries (status, updated_at desc);
create index if not exists knowledge_entries_origin_idx
  on public.knowledge_entries (origin);
create index if not exists knowledge_entries_tags_idx
  on public.knowledge_entries using gin (tags);
create index if not exists knowledge_entries_origin_interaction_idx
  on public.knowledge_entries (origin_interaction_id);

alter table public.interactions
  add column if not exists knowledge_entry_id uuid
    references public.knowledge_entries (id) on delete set null;

create index if not exists interactions_knowledge_entry_idx
  on public.interactions (knowledge_entry_id);

drop view if exists public.unanswered_interactions;
create view public.unanswered_interactions as
select
  i.id,
  i.session_id,
  i.question,
  i.reply,
  i.language,
  i.outcome,
  i.top_similarity,
  i.document_titles,
  i.created_at,
  i.reviewed_at,
  i.reviewed_by,
  i.knowledge_entry_id
from public.interactions i
where i.outcome in ('no_evidence', 'low_confidence')
  and i.reviewed_at is null
order by i.created_at desc;

alter table public.knowledge_entries enable row level security;

drop policy if exists "knowledge_entries_select_auth" on public.knowledge_entries;
create policy "knowledge_entries_select_auth"
  on public.knowledge_entries for select
  to authenticated
  using (true);

drop policy if exists "knowledge_entries_insert_auth" on public.knowledge_entries;
create policy "knowledge_entries_insert_auth"
  on public.knowledge_entries for insert
  to authenticated
  with check (true);

drop policy if exists "knowledge_entries_update_auth" on public.knowledge_entries;
create policy "knowledge_entries_update_auth"
  on public.knowledge_entries for update
  to authenticated
  using (true)
  with check (true);

grant select, insert, update on public.knowledge_entries to authenticated;
grant select on public.unanswered_interactions to authenticated;

-- Optional filter so related-entry checks stay inside Knowledge Hub chunks.
drop function if exists public.match_chunks(vector, integer);
drop function if exists public.match_chunks(vector, integer, text);

create or replace function public.match_chunks (
  query_embedding vector(1536),
  match_count int default 8,
  filter_source_type text default null
)
returns table (
  id uuid,
  document_id uuid,
  content text,
  section_title text,
  page_start int,
  page_end int,
  chunk_index int,
  document_title text,
  source_type text,
  start_date date,
  end_date date,
  event_type text,
  similarity float
)
language sql
stable
as $$
  select
    c.id,
    c.document_id,
    c.content,
    c.section_title,
    c.page_start,
    c.page_end,
    c.chunk_index,
    d.title as document_title,
    d.source_type,
    c.start_date,
    c.end_date,
    c.event_type,
    (1 - (c.embedding <=> query_embedding))::float as similarity
  from public.chunks c
  join public.documents d on d.id = c.document_id
  where filter_source_type is null or d.source_type = filter_source_type
  order by c.embedding <=> query_embedding
  limit match_count;
$$;
