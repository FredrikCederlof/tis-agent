-- TIS Agent Milestone 1: handbook RAG storage
-- Run once in Supabase SQL Editor:
-- https://supabase.com/dashboard/project/ixjsiwedssgutrmegyzv/sql/new

create extension if not exists vector;

create table if not exists documents (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  source_type text not null,
  source_path text,
  language text default 'en',
  created_at timestamptz not null default now()
);

create table if not exists chunks (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references documents (id) on delete cascade,
  content text not null,
  section_title text,
  page_start int,
  page_end int,
  chunk_index int not null,
  embedding vector(1536) not null,
  created_at timestamptz not null default now()
);

create index if not exists chunks_document_id_idx on chunks (document_id);
create index if not exists chunks_embedding_hnsw_idx
  on chunks
  using hnsw (embedding vector_cosine_ops);

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
    (1 - (c.embedding <=> query_embedding))::float as similarity
  from chunks c
  join documents d on d.id = c.document_id
  order by c.embedding <=> query_embedding
  limit match_count;
$$;
