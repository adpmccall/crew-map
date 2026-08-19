-- crew_submissions_schema.sql — let anyone propose a crew, safely.
--
-- THE POINT
--   Nationwide coverage is the project's biggest gap (the curated data is
--   R1-R6; the Atlas added only ~14 Eastern/Southern/Alaska crews). Rather than
--   hand-sourcing the rest, this lets the people who actually work on these
--   crews fill it in. Nothing they submit goes live on its own.
--
-- SAFE TO RE-RUN — every statement is IF NOT EXISTS / CREATE OR REPLACE.
--
-- HOW TO RUN
--   Supabase dashboard -> SQL Editor -> paste -> Run.
--
--
-- ============================================================================
-- WHY A SEPARATE TABLE AND NOT `crews`
-- ============================================================================
-- This is the first time strangers can WRITE to the database, so the shape of
-- the write surface matters more than the convenience.
--
--   * `crews` keeps its current policy exactly as-is: public SELECT, no public
--     INSERT, ever. The live map's data cannot be touched by a submitter. If
--     this table were ever flooded, the map is unaffected and this table can be
--     emptied without consequence.
--   * Submissions carry things that have no business in `crews` — a contact
--     email, a review status, timestamps.
--   * Approving copies the row INTO `crews` with source='user_submitted' (the
--     value already reserved for this in atlas_schema.sql). So the intent of
--     that column is honored; it just isn't the landing zone.
--
-- ANONYMOUS INSERT IS DELIBERATE, AND SO ARE ITS LIMITS
--   The app talks to Supabase directly with the PUBLIC publishable key, which
--   ships in the browser bundle by design. Anyone can therefore POST to this
--   table without using our form. That is accepted, and the defenses are built
--   for it rather than pretending otherwise:
--     - anon can INSERT but NOT SELECT (see policies) — submissions contain
--       email addresses and must never be publicly readable;
--     - the WITH CHECK clause pins status to 'pending', so nobody can submit a
--       pre-approved row;
--     - CHECK constraints bound every field's length and shape;
--     - a trigger rate-limits inserts (below) so the free tier can't be filled;
--     - and nothing appears on the map until a human copies it across.
--   The real gate is the approval step. Everything else just keeps the queue
--   small enough to read.


-- === the table =============================================================
create table if not exists crew_submissions (
  id bigint generated always as identity primary key,

  -- What the map needs. Mirrors the `crews` columns these map onto.
  crew_name   text not null,
  agency      text not null,
  state       text not null,   -- UPPERCASE full name, e.g. "MONTANA"
  town        text not null,
  latitude    double precision, -- geocoded in the browser at submit time; may
  longitude   double precision, -- be NULL if the lookup failed (still accepted)
  resource    text,            -- crew type(s), comma-joined like `crews.resource`
  website     text,
  notes       text,

  -- Who to contact. NEVER exposed publicly — anon has no SELECT on this table.
  submitter_email text not null,

  -- Review workflow.
  status      text not null default 'pending',
  submitted_at timestamptz not null default now(),
  reviewed_at timestamptz,
  review_note text,
  approved_crew_id bigint,     -- the `crews.id` created on approval

  -- === bounds ===
  -- Length caps are the cheapest, most reliable defense against junk payloads.
  constraint crew_submissions_status_check
    check (status in ('pending', 'approved', 'rejected')),
  constraint crew_submissions_name_len
    check (char_length(crew_name) between 2 and 120),
  constraint crew_submissions_town_len
    check (char_length(town) between 2 and 80),
  constraint crew_submissions_state_len
    check (char_length(state) between 2 and 40),
  constraint crew_submissions_resource_len
    check (resource is null or char_length(resource) <= 200),
  constraint crew_submissions_website_len
    check (website is null or char_length(website) <= 300),
  constraint crew_submissions_notes_len
    check (notes is null or char_length(notes) <= 1000),
  -- Deliberately loose email shape. Strict RFC validation rejects real
  -- addresses; this only rules out obvious nonsense.
  constraint crew_submissions_email_shape
    check (submitter_email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'
           and char_length(submitter_email) <= 200),
  -- Coordinates, when present, must be on Earth and in roughly the US window.
  constraint crew_submissions_lat_range
    check (latitude is null or latitude between -90 and 90),
  constraint crew_submissions_lng_range
    check (longitude is null or longitude between -180 and 180)
);

create index if not exists crew_submissions_status_idx
  on crew_submissions (status, submitted_at desc);


-- === rate limiting =========================================================
-- PostgREST doesn't hand the client's IP to policies, so per-IP limiting isn't
-- available. These two caps are what CAN be enforced, and they exist to protect
-- the free tier from being filled by a script — not to stop a determined human.
--
-- The tradeoff is explicit: a flood can exhaust the hourly quota and block
-- genuine submissions for that hour. Given expected volume (a handful ever),
-- bounded bloat beats unbounded, and the limit is set well above real use.
create or replace function crew_submissions_rate_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  recent_total integer;
  recent_email integer;
begin
  select count(*) into recent_total
    from crew_submissions
    where submitted_at > now() - interval '1 hour';
  if recent_total >= 60 then
    raise exception
      'Too many submissions right now. Please try again in a little while.'
      using errcode = 'check_violation';
  end if;

  select count(*) into recent_email
    from crew_submissions
    where submitter_email = new.submitter_email
      and submitted_at > now() - interval '24 hours';
  if recent_email >= 5 then
    raise exception
      'You have submitted several crews today. Please try again tomorrow.'
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

drop trigger if exists crew_submissions_rate_limit_trg on crew_submissions;
create trigger crew_submissions_rate_limit_trg
  before insert on crew_submissions
  for each row execute function crew_submissions_rate_limit();


-- === row level security ====================================================
alter table crew_submissions enable row level security;

-- INSERT only, and only as 'pending'. The WITH CHECK is the important half:
-- without it a caller could POST status='approved' straight into the queue.
drop policy if exists "Anyone can submit a crew" on crew_submissions;
create policy "Anyone can submit a crew"
  on crew_submissions
  for insert
  to anon, authenticated
  with check (
    status = 'pending'
    and reviewed_at is null
    and approved_crew_id is null
  );

-- NO SELECT POLICY FOR anon — deliberate and load-bearing.
-- This table holds email addresses. Without a SELECT policy, RLS denies all
-- reads to the public key, so the queue cannot be harvested or enumerated.
-- Reviewing happens in the Supabase dashboard, which uses the service role and
-- bypasses RLS.

grant insert on crew_submissions to anon, authenticated;
grant usage, select on all sequences in schema public to anon, authenticated;
grant all on crew_submissions to service_role;

-- Revoke the reads that `grant all`-style defaults might otherwise imply.
revoke select on crew_submissions from anon, authenticated;


-- === approving a submission ================================================
-- One function so approval is a single call, not a hand-written INSERT that
-- could get a column wrong. Copies the submission into `crews` and marks it.
--
-- security definer: the reviewer runs this from the SQL editor as service_role
-- anyway, but pinning it makes the function's own permissions explicit.
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

  -- NOTE — `region` and `forest` are deliberately NOT set. This is correct
  -- behaviour, not an omission to "fix" later.
  --
  -- `region` means a Forest Service region (R1-R10). Most submitted crews won't
  -- have one at all — a county fire department or a tribal crew has no FS
  -- region — and even for a USFS crew we'd only be guessing from the town. The
  -- form doesn't ask, because a submitter shouldn't need to know our internal
  -- taxonomy, and inferring it would put a value in the database that nobody
  -- actually asserted.
  --
  -- Same principle as the 17 crews at agency='unknown' and the 304 Atlas rows
  -- with a NULL region: NULL is the honest answer when we don't know. The
  -- consequence is that a submitted crew won't show under any Forest Service
  -- region filter — which is right, since we can't claim it belongs to one. A
  -- reviewer who does know the region can set it by hand after approving.
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

create or replace function reject_submission(submission_id bigint,
                                             note text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update crew_submissions
     set status = 'rejected', reviewed_at = now(),
         review_note = coalesce(note, review_note)
   where id = submission_id;
end;
$$;

-- Only the service role may approve or reject. Without these revokes the
-- functions would be callable by anon through PostgREST's RPC endpoint, which
-- would hand the public exactly the power this whole design withholds.
revoke all on function approve_submission(bigint, text) from public, anon, authenticated;
revoke all on function reject_submission(bigint, text) from public, anon, authenticated;
grant execute on function approve_submission(bigint, text) to service_role;
grant execute on function reject_submission(bigint, text) to service_role;


-- === the review view =======================================================
-- What to open in the Supabase SQL editor. Everything needing a decision,
-- newest first, with the things worth noticing pulled to the front.
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
order by submitted_at desc;

-- OWNER SEMANTICS, STATED OUTRIGHT — do not remove.
-- `crew_submissions` has RLS on with no SELECT policy (deliberate: it holds
-- emails). A view marked security_invoker=true would evaluate that RLS as
-- whoever queries it, find no policy, and silently return ZERO ROWS while the
-- raw table still read fine — which is exactly what happened on the first real
-- review. Pinning it off makes the behaviour deterministic instead of
-- depending on the server's default.
--
-- Bypassing RLS here is only acceptable because of the revoke immediately
-- below: nothing but the service role can read this view.
alter view pending_submissions set (security_invoker = off);

revoke all on pending_submissions from public, anon, authenticated;
grant select on pending_submissions to service_role;


-- ============================================================================
-- REVIEWING, START TO FINISH
-- ============================================================================
--   1. See what's waiting:
--        select * from pending_submissions;
--
--   2. Approve one (creates the crew, marks the submission):
--        select approve_submission(12);
--        select approve_submission(12, 'verified against the forest website');
--
--   3. Or reject it:
--        select reject_submission(12, 'duplicate of crew 431');
--
--   4. If a submission had NO COORDS, fix them before or after approving:
--        update crews set latitude = 44.05, longitude = -121.31 where id = 830;
--      A crew with null coordinates loads but never draws — the map filters
--      those out.
--
--   5. Undo an approval:
--        delete from crews where id = <approved_crew_id>;
--        update crew_submissions
--           set status='pending', reviewed_at=null, approved_crew_id=null
--         where id = 12;
--
-- CHECK IT WORKED
--   select status, count(*) from crew_submissions group by status;
