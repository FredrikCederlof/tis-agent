-- TIS Agent Milestone 2: Drive sync metadata on documents
-- Run once in Supabase SQL Editor after 001_rag.sql

alter table documents
  add column if not exists drive_file_id text,
  add column if not exists drive_modified_time timestamptz,
  add column if not exists storage_path text,
  add column if not exists content_hash text,
  add column if not exists mime_type text;

create unique index if not exists documents_drive_file_id_key
  on documents (drive_file_id)
  where drive_file_id is not null;

create index if not exists documents_storage_path_idx on documents (storage_path);
