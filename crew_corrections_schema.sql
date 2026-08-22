-- crew_corrections_schema.sql — let people report that a crew on the map is wrong.
--
-- RUN THIS AFTER crew_submissions_schema.sql. It extends that table rather than
-- adding a new one.
--
-- SAFE TO RE-RUN — every statement is IF NOT EXISTS / CREATE OR REPLACE, and the
-- constraint adds are guarded.
--
-- HOW TO RUN
--   Supabase dashboard -> SQL Editor -> paste -> Run.
--
--
-- ============================================================================
-- WHY THIS REUSES crew_submissions INSTEAD OF A NEW TABLE
-- ============================================================================
-- A correction is a different KIND of the same thing: an unverified claim from
-- a stranger that a human has to read before anything changes on the map. It
-- wants the identical machinery — anon INSERT with no SELECT, the same rate
-- limit, the same email notification, the same pending/approved/rejected
-- lifecycle. A second table would mean a second RLS policy to get right, a
-- second trigger, a second notification path, and two queues to remember to
-- check. One pipeline, already trusted, is worth the extra column.
--
--
-- ============================================================================
-- WHY THE NOT NULLs HAD TO COME OFF
-- ============================================================================
-- `crew_name`, `agency`, `state` and `town` were NOT NULL because a proposed
-- NEW crew is useless without them. A CORRECTION doesn't carry them at all — it
-- points at a crew that already exists and says what's wrong with it.
--
-- The obvious shortcut is to copy the target crew's values into those columns
-- so the constraint is satisfied. That does not survive contact with the data:
-- 316 crews have no `crew_name`, and most Handcrew Atlas rows have no `town`.
-- Copying would mean either writing NULLs anyway or inventing placeholder text
-- to get past a constraint — which is how a database starts lying.
--
-- So: the columns become nullable, and a CHECK re-imposes them for new crews
-- only. Postgres can't express a conditional NOT NULL any other way. The
-- guarantee for new-crew submissions is exactly as strong as it was before.
-- ============================================================================


-- === 1. the two new columns ================================================
alter table crew_submissions
  add column if not exists submission_kind text not null default 'new_crew';

-- ON DELETE SET NULL, not CASCADE: if a crew is later deleted, we keep the
-- report and its review history rather than silently destroying the record of
-- someone having told us something. The orphaned row still reads fine — the
-- description of what was wrong is in `notes`.
alter table crew_submissions
  add column if not exists crew_id bigint references crews (id) on delete set null;


-- === 2. constraints ========================================================
-- Wrapped in DO blocks because `add constraint` has no IF NOT EXISTS.
do $$
begin
  if not exists (select 1 from pg_constraint
                  where conname = 'crew_submissions_kind_check') then
    alter table crew_submissions add constraint crew_submissions_kind_check
      check (submission_kind in ('new_crew', 'correction'));
  end if;

  -- A correction is meaningless without a target and a description. 10
  -- characters is a low bar that still rules out "wrong" and "bad".
  if not exists (select 1 from pg_constraint
                  where conname = 'crew_submissions_correction_shape') then
    alter table crew_submissions add constraint crew_submissions_correction_shape
      check (
        submission_kind <> 'correction'
        or (crew_id is not null
            and notes is not null
            and char_length(notes) >= 10)
      );
  end if;

  -- The old NOT NULLs, re-imposed for new crews only.
  if not exists (select 1 from pg_constraint
                  where conname = 'crew_submissions_new_crew_shape') then
    alter table crew_submissions add constraint crew_submissions_new_crew_shape
      check (
        submission_kind <> 'new_crew'
        or (crew_name is not null
            and agency is not null
            and state is not null
            and town is not null)
      );
  end if;
end $$;

-- Only now is it safe to drop the column-level NOT NULLs: the CHECK above is
-- already in place, so there is no window in which a new-crew submission could
-- be written without them.
alter table crew_submissions alter column crew_name  drop not null;
alter table crew_submissions alter column agency     drop not null;
alter table crew_submissions alter column state      drop not null;
alter table crew_submissions alter column town       drop not null;

-- NOTE on the existing length checks (`..._name_len`, `..._town_len`, etc.):
-- they need no change. A CHECK whose expression evaluates to NULL passes, so
-- `char_length(crew_name) between 2 and 120` is satisfied when crew_name is
-- NULL. The bounds still bite whenever a value is actually present.

create index if not exists crew_submissions_kind_idx
  on crew_submissions (submission_kind, status, submitted_at desc);


-- === 3. approving ==========================================================
-- approve_submission() copies a submission into `crews`. Running it on a
-- correction would create a DUPLICATE crew from a report that the original was
-- wrong — the exact opposite of what the reporter asked for. Refuse loudly.
create or replace function approve_submission(submission_id bigint,
                                              note text default null)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  s crew_submissions%rowtype;
  new_id bigint;
begin
  select * into s from crew_submissions where id = submission_id;
  if not found then
    raise exception 'No submission with id %', submission_id;
  end if;
  if s.status = 'approved' then
    raise exception 'Submission % is already approved (crew id %)',
      submission_id, s.approved_crew_id;
  end if;
  if s.submission_kind = 'correction' then
    raise exception
      'Submission % is a CORRECTION to crew %, not a new crew. Approving it '
      'here would create a duplicate. Fix the crew by hand, then run: '
      'select resolve_correction(%);',
      submission_id, s.crew_id, submission_id;
  end if;

  -- `region` and `forest` are deliberately NOT set — see the long note in
  -- crew_submissions_schema.sql. NULL is the honest answer when we don't know.
  insert into crews (crew_name, agency, state, town, latitude, longitude,
                     resource, website, notes, source)
  values (s.crew_name, s.agency, s.state, s.town, s.latitude, s.longitude,
          s.resource, s.website, s.notes, 'user_submitted')
  returning id into new_id;

  update crew_submissions
     set status = 'approved',
         reviewed_at = now(),
         review_note = coalesce(note, review_note),
         approved_crew_id = new_id
   where id = submission_id;

  return new_id;
end;
$$;


-- === 4. closing out a correction ===========================================
-- Corrections are applied BY HAND — the reviewer edits `crews` themselves,
-- because what needs changing is different every time and no function can guess
-- it. This just marks the report dealt with so it leaves the queue.
--
-- It deliberately does NOT touch `crews`. Marking a report resolved and editing
-- the crew are separate acts, and conflating them would let a mis-typed call
-- silently rewrite live map data.
create or replace function resolve_correction(submission_id bigint,
                                              note text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  s crew_submissions%rowtype;
begin
  select * into s from crew_submissions where id = submission_id;
  if not found then
    raise exception 'No submission with id %', submission_id;
  end if;
  if s.submission_kind <> 'correction' then
    raise exception
      'Submission % is a new-crew submission, not a correction. '
      'Use approve_submission(%) instead.', submission_id, submission_id;
  end if;

  update crew_submissions
     set status = 'approved',
         reviewed_at = now(),
         review_note = coalesce(note, review_note)
   where id = submission_id;
end;
$$;

revoke all on function approve_submission(bigint, text) from public, anon, authenticated;
revoke all on function resolve_correction(bigint, text) from public, anon, authenticated;
grant execute on function approve_submission(bigint, text) to service_role;
grant execute on function resolve_correction(bigint, text) to service_role;


-- === 5. the review views ===================================================
-- `pending_submissions` now means NEW CREWS ONLY. Corrections have their own
-- view because they need different columns — the crew they point at, and what
-- that crew currently says — and mixing them produced rows where `crew_name`
-- meant two different things depending on the kind.
create or replace view pending_submissions as
select
  id,
  crew_name,
  agency,
  town || ', ' || state as location,
  resource as crew_type,
  website,
  notes,
  submitter_email,
  submitted_at,
  case
    when latitude is null then 'NO COORDS — will not appear on the map until fixed'
    else round(latitude::numeric, 4) || ', ' || round(longitude::numeric, 4)
  end as coordinates
from crew_submissions
where status = 'pending'
  and submission_kind = 'new_crew'
order by submitted_at desc;

-- What's wrong, and what the crew currently says, side by side — so a decision
-- can usually be made without opening the `crews` table separately.
create or replace view pending_corrections as
select
  s.id,
  s.crew_id,
  coalesce(c.crew_name, c.district, c.forest, '(unnamed)') as crew_on_map,
  coalesce(c.town || ', ' || c.state, c.state, '(no location)') as crew_location,
  c.agency   as crew_agency,
  c.resource as crew_type_now,
  c.website  as crew_website_now,
  s.notes    as what_they_say_is_wrong,
  s.submitter_email,
  s.submitted_at,
  case when c.id is null
       then 'CREW DELETED since this was reported'
       else null
  end as warning
from crew_submissions s
left join crews c on c.id = s.crew_id
where s.status = 'pending'
  and s.submission_kind = 'correction'
order by s.submitted_at desc;

-- Same owner semantics as pending_submissions, and for the same reason:
-- crew_submissions has RLS on with no SELECT policy, so a security_invoker view
-- would silently return zero rows. See the long note in the other file.
alter view pending_submissions  set (security_invoker = off);
alter view pending_corrections  set (security_invoker = off);

revoke all on pending_submissions from public, anon, authenticated;
revoke all on pending_corrections from public, anon, authenticated;
grant select on pending_submissions to service_role;
grant select on pending_corrections to service_role;


-- ============================================================================
-- REVIEWING — THERE ARE NOW TWO QUEUES. CHECK BOTH.
-- ============================================================================
--   New crews:
--     select * from pending_submissions;
--     select approve_submission(12);
--     select reject_submission(12, 'duplicate of crew 431');
--
--   Corrections:
--     select * from pending_corrections;
--     -- fix the crew yourself, e.g.
--     update crews set website = 'https://...' where id = 417;
--     -- then close the report out
--     select resolve_correction(13, 'updated the website');
--     -- or, if the report was wrong
--     select reject_submission(13, 'checked the forest site, current value is right');
--
--   Anything waiting at all:
--     select submission_kind, count(*) from crew_submissions
--      where status = 'pending' group by submission_kind;
--
-- CHECK THIS FILE APPLIED CLEANLY
--   select column_name from information_schema.columns
--    where table_name = 'crew_submissions'
--      and column_name in ('submission_kind', 'crew_id');
--   -- expect 2 rows
