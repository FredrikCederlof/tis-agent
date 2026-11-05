-- Teacher contact is a normal parent question. Staff List School is searchable.
-- Health forms, fee agreements, and report-card downloads stay restricted.
-- Applied to ixjsiwedssgutrmegyzv. Safe to re-run.

update public.documents
set access_class = 'parents_only'
where title = 'Staff List School'
  and access_class is distinct from 'parents_only';
