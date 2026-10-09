-- Privacy notice settings, retention, and knowledge access class.
-- Applied to ixjsiwedssgutrmegyzv on 2026-10-09. Do not re-run it to "catch up".
-- Webhook writes stay on the service role.

alter table public.agent_config
  add column if not exists retention_days integer not null default 90,
  add column if not exists privacy_contact_email text not null default '';

alter table public.agent_config
  drop constraint if exists agent_config_retention_days_check;
alter table public.agent_config
  add constraint agent_config_retention_days_check
  check (retention_days in (30, 90, 180, 365));

alter table public.documents
  add column if not exists access_class text not null default 'parents_only';

alter table public.documents
  drop constraint if exists documents_access_class_check;
alter table public.documents
  add constraint documents_access_class_check
  check (access_class in ('public', 'parents_only', 'restricted'));

update public.documents
set access_class = 'restricted'
where title in (
  'Asthma Action Plan - Linked to Toddle',
  'Authorization for Medications - Linked to Toddle',
  'Communicable Disease Protocols - Linked to Toddle',
  'Influenza Confinement Policy - Linked to Toddle',
  'Night Emergency for children',
  'Over the Counter Medicine in Japan - Linked to Toddle',
  'Staff List School',
  'How to Access_Download Previous Report Cards - Linked to Toddle',
  'TIS School Fees Agreement - Linked to Toddle'
);

create table if not exists public.privacy_events (
  id uuid primary key default gen_random_uuid(),
  event_type text not null,
  actor text not null,
  retention_days integer,
  sessions_deleted integer not null default 0,
  dedup_deleted integer not null default 0,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.privacy_events enable row level security;

drop policy if exists privacy_events_admin_select on public.privacy_events;
create policy privacy_events_admin_select on public.privacy_events
  for select to authenticated
  using (public.is_active_admin());

drop policy if exists whatsapp_message_dedup_admin_select on public.whatsapp_message_dedup;
create policy whatsapp_message_dedup_admin_select on public.whatsapp_message_dedup
  for select to authenticated
  using (public.is_active_admin());

drop policy if exists documents_admin_select on public.documents;
create policy documents_admin_select on public.documents
  for select to authenticated
  using (public.is_active_admin());

drop policy if exists documents_admin_update on public.documents;
create policy documents_admin_update on public.documents
  for update to authenticated
  using (public.is_active_admin())
  with check (public.is_active_admin());

-- Narrow public read: retention and contact only. agent_config itself stays closed.
create or replace view public.privacy_notice_public
with (security_invoker = false) as
select retention_days, privacy_contact_email
from public.agent_config
where id = 1;

revoke all on table public.privacy_notice_public from public;
grant select on table public.privacy_notice_public to anon, authenticated;

-- Keep the live 3-argument signature. Omit restricted documents.
create or replace function public.match_chunks(
  query_embedding vector,
  match_count integer default 8,
  filter_source_type text default null
)
returns table (
  id uuid,
  document_id uuid,
  content text,
  section_title text,
  page_start integer,
  page_end integer,
  chunk_index integer,
  document_title text,
  source_type text,
  start_date date,
  end_date date,
  event_type text,
  similarity double precision
)
language sql
stable
set search_path to 'public'
as $function$
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
  where (filter_source_type is null or d.source_type = filter_source_type)
    and d.access_class <> 'restricted'
  order by c.embedding <=> query_embedding
  limit match_count;
$function$;

create or replace function public.chunks_overlapping_dates(
  filter_start date,
  filter_end date,
  match_count integer default 24
)
returns table (
  id uuid,
  document_id uuid,
  content text,
  section_title text,
  page_start integer,
  page_end integer,
  chunk_index integer,
  document_title text,
  source_type text,
  start_date date,
  end_date date,
  event_type text,
  similarity double precision
)
language sql
stable
set search_path to 'public'
as $function$
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
  from public.chunks c
  join public.documents d on d.id = c.document_id
  where d.access_class <> 'restricted'
    and (
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
    )
  order by
    case when d.source_type = 'calendar' then 0 else 1 end,
    coalesce(c.start_date, filter_start)
  limit match_count;
$function$;

update public.agent_config
set system_prompt = replace(
  system_prompt,
  'You are Tina, Tokyo International School''s official information assistant for parents on WhatsApp.',
  'You are Tina, an independent parent information assistant on WhatsApp. You are not operated by Tokyo International School.'
)
where id = 1
  and system_prompt like 'You are Tina, Tokyo International School''s official information assistant%';

update public.agent_config
set system_prompt = replace(
  system_prompt,
  'You are Tina, a well-informed fellow TIS parent on WhatsApp — warm, clear, and careful with school facts.',
  'You are Tina, an independent parent information assistant on WhatsApp. You are not operated by, affiliated with, or endorsed by Tokyo International School. Be warm, clear, and careful with school facts.'
)
where id = 1
  and system_prompt like 'You are Tina, a well-informed fellow TIS parent%';

update public.agent_config
set fixed_answers = (
  select jsonb_agg(
    case elem->>'key'
      when 'who_are_you' then jsonb_set(
        elem,
        '{en}',
        to_jsonb(
          'I''m Tina, an independent parent information assistant. I am not operated by Tokyo International School. I answer from documents prepared for parents on WhatsApp.'::text
        )
      )
      when 'who_created_you' then jsonb_set(
        elem,
        '{en}',
        to_jsonb(
          'I''m Tina, built privately by a parent to help families find school information. I am not affiliated with, endorsed by, or operated by Tokyo International School.'::text
        )
      )
      else elem
    end
    order by ordinality
  )
  from jsonb_array_elements(fixed_answers) with ordinality as answers(elem, ordinality)
)
where id = 1;
