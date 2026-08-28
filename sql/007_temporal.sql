-- Temporal retrieval: date metadata on chunks + date-filtered lookup.
-- Run once in Supabase SQL Editor after 006_whatsapp_dedup.sql:
-- https://supabase.com/dashboard/project/ixjsiwedssgutrmegyzv/sql/new

alter table chunks
  add column if not exists start_date date,
  add column if not exists end_date date,
  add column if not exists event_type text;

create index if not exists chunks_start_date_idx on chunks (start_date);
create index if not exists chunks_date_span_idx on chunks (start_date, end_date);

create or replace function match_chunks (
  query_embedding vector(1536),
  match_count int default 8
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
  from chunks c
  join documents d on d.id = c.document_id
  order by c.embedding <=> query_embedding
  limit match_count;
$$;

create or replace function chunks_overlapping_dates (
  filter_start date,
  filter_end date,
  match_count int default 24
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
  with days as (
    select generate_series(filter_start, filter_end, interval '1 day')::date as day
  )
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
    case
      when d.source_type = 'calendar' then 0.99
      else 0.85
    end::float as similarity
  from chunks c
  join documents d on d.id = c.document_id
  where
    (
      c.start_date is not null
      and c.start_date <= filter_end
      and coalesce(c.end_date, c.start_date) >= filter_start
    )
    or exists (
      select 1
      from days
      where c.content ilike '%' || days.day::text || '%'
         or c.content ilike '%' || to_char(days.day, 'FMMonth FMDD') || '%'
         or c.content ilike '%' || to_char(days.day, 'FMDD FMMonth') || '%'
    )
  order by
    case when d.source_type = 'calendar' then 0 else 1 end,
    coalesce(c.start_date, filter_start)
  limit match_count;
$$;
