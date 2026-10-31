-- hike_submissions_schema.sql — Hotshot Crew Hikes: let anyone submit a
-- crew's signature PT/conditioning hike, safely.
--
-- THE POINT
--   Lots of hotshot crews have a well-known conditioning hike they take pride
--   in (Lolo IHC's Mount Sentinel hike is the example that kicked this off:
--   https://www.lolohotshots.com/preparation-pt). This lets crews (or anyone
--   who knows a crew's hike) submit a recorded .gpx track for it, computes
--   distance and elevation gain from the file itself, and shows it on the map
--   as a new toggleable layer. See crew-map-handoff.md for the full proposal
--   and the explicit call NOT to build a leaderboard or tracked times —
--   this is route + stats only, same spirit as crew_submissions/crews.
--
-- SAFE TO RE-RUN — every statement is IF NOT EXISTS / CREATE OR REPLACE /
-- ON CONFLICT DO NOTHING, same convention as every other schema file here.
--
-- HOW TO RUN
--   Supabase dashboard -> SQL Editor -> paste -> Run.
--
--
-- ============================================================================
-- SAME SHAPE AS crew_submissions -> crews, ON PURPOSE
-- ============================================================================
--   * hike_submissions is the public write surface: anon can INSERT (and only
--     as 'pending'), never SELECT (it holds an email address).
--   * hikes is the live, public-read table the map actually queries — no
--     public write, ever, exactly like `crews`.
--   * approve_hike_submission() / reject_hike_submission() are the only way a
--     pending row becomes a live one, and only service_role can call them —
--     the owner runs these from the SQL editor, same as approve_submission().
--   Reusing this exact pattern (rather than inventing a new one for hikes)
--   means the security reasoning already reviewed for crew_submissions
--   applies here unchanged — see that file for the fuller writeup.
--
-- WHAT'S NEW HERE THAT crew_submissions DOESN'T HAVE: a file upload. The
-- browser uploads the submitter's .gpx to a public Storage bucket
-- ('crew-hikes') BEFORE inserting the submission row, then the row just
-- stores that file's URL plus the numbers computed FROM it (distance,
-- elevation gain, a simplified point path for drawing the line) — see
-- lib/gpx.js for that math, which runs entirely in the submitter's browser.


-- === storage bucket for the uploaded .gpx files ==============================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'crew-hikes',
  'crew-hikes',
  -- PUBLIC, same as the existing 'crew-photos' bucket: a file here is
  -- readable at its URL by anyone who has it, no login required. That's a
  -- deliberate difference from crew_submissions (which stays private because
  -- it holds an email address) — a .gpx track has no contact info in it, only
  -- a recorded path, so there's nothing here that needs hiding once it's
  -- uploaded. What's NOT public until review is whether the site links to
  -- it: the file can exist in storage while its submission is still
  -- 'pending' the same way a pending crew_submissions row exists without
  -- being on the map.
  true,
  3145728, -- 3 MB. Keep in sync with MAX_GPX_FILE_BYTES in lib/gpx.js.
  array['application/gpx+xml','application/xml','text/xml','application/octet-stream']
  -- Several types listed because browsers are inconsistent about what MIME
  -- type they report for a .gpx file (some send generic XML, some send
  -- "unknown"/octet-stream). This is a coarse backstop — the app itself also
  -- checks the file actually parses as a GPX track before ever uploading it.
)
on conflict (id) do nothing;

-- Anyone can upload INTO this bucket (required for the public form to work
-- with no backend and no login) but this policy only ever lets someone
-- CREATE a new object — never list the bucket's contents, overwrite an
-- existing file, or delete one. Reading a specific file by its exact URL
-- still works regardless of this policy, because the bucket itself is
-- public — see the note above.
drop policy if exists "Anyone can upload a hike GPX" on storage.objects;
create policy "Anyone can upload a hike GPX"
  on storage.objects
  for insert
  to anon, authenticated
  with check (bucket_id = 'crew-hikes');


-- === hike_submissions (the staging table) ====================================
create table if not exists hike_submissions (
  id bigint generated always as identity primary key,

  crew_id bigint not null references crews(id) on delete restrict,
  hike_name text,              -- optional ("Mount Sentinel"); blank falls back
                                -- to "<crew name> PT Hike" in the UI, not here
                                -- -- same "don't invent data" rule as crews.region
  notes text,                  -- optional free text, e.g. "full gear, ~50 minutes"
                                -- (the same convention Lolo's own page uses)

  -- Computed IN THE BROWSER at submit time by lib/gpx.js, from the uploaded
  -- file itself -- never typed in by hand, so there's no "the submitter
  -- guessed wrong" failure mode for these two numbers.
  distance_miles    numeric not null,
  elevation_gain_ft numeric,  -- null when the file had no elevation data at all
                              -- (allowed by the GPX spec) -- null, not zero,
                              -- because those are different facts.

  -- The uploaded file's public URL, and a simplified point array for
  -- rendering the line on the map (lib/gpx.js simplifyPath -- a downsampled
  -- copy of the same points, always regenerable from gpx_url, not a second
  -- source of truth).
  gpx_url text not null,
  path    jsonb not null,       -- [[lat, lon], ...]

  -- Where the recording starts/ends, so a REVIEWER can see this without
  -- opening the file -- see the privacy note on pending_hike_submissions
  -- below (cropping a track to the trailhead was flagged as a real concern
  -- when this feature was scoped; this is the human-review-side mitigation).
  start_lat double precision not null,
  start_lon double precision not null,
  end_lat   double precision not null,
  end_lon   double precision not null,

  submitter_email text not null,

  status       text not null default 'pending',
  submitted_at timestamptz not null default now(),
  reviewed_at  timestamptz,
  review_note  text,
  approved_hike_id bigint,

  constraint hike_submissions_status_check
    check (status in ('pending', 'approved', 'rejected')),
  constraint hike_submissions_name_len
    check (hike_name is null or char_length(hike_name) <= 120),
  constraint hike_submissions_notes_len
    check (notes is null or char_length(notes) <= 500),
  constraint hike_submissions_gpx_url_len
    check (char_length(gpx_url) <= 500),
  constraint hike_submissions_distance_range
    -- A generous upper bound (a 60-mile PT hike would be extraordinary) --
    -- mainly to catch a units bug or a non-hike file, not to police real
    -- hikes.
    check (distance_miles > 0 and distance_miles <= 60),
  constraint hike_submissions_elevation_range
    check (elevation_gain_ft is null or elevation_gain_ft between 0 and 20000),
  constraint hike_submissions_lat_range
    check (start_lat between -90 and 90 and end_lat between -90 and 90),
  constraint hike_submissions_lon_range
    check (start_lon between -180 and 180 and end_lon between -180 and 180),
  constraint hike_submissions_email_shape
    check (submitter_email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'
           and char_length(submitter_email) <= 200)
);

create index if not exists hike_submissions_status_idx
  on hike_submissions (status, submitted_at desc);


-- === rate limiting (same pattern as crew_submissions_rate_limit) ============
create or replace function hike_submissions_rate_limit()
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
    from hike_submissions
    where submitted_at > now() - interval '1 hour';
  if recent_total >= 60 then
    raise exception
      'Too many submissions right now. Please try again in a little while.'
      using errcode = 'check_violation';
  end if;

  select count(*) into recent_email
    from hike_submissions
    where submitter_email = new.submitter_email
      and submitted_at > now() - interval '24 hours';
  if recent_email >= 10 then
    -- Higher than crew_submissions' 5/day cap: the initial ~14-file batch
    -- coming from one known contact is expected real usage, not abuse. This
    -- still bounds a runaway script.
    raise exception
      'You have submitted several hikes today. Please try again tomorrow.'
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

drop trigger if exists hike_submissions_rate_limit_trg on hike_submissions;
create trigger hike_submissions_rate_limit_trg
  before insert on hike_submissions
  for each row execute function hike_submissions_rate_limit();


-- === row level security ======================================================
alter table hike_submissions enable row level security;

drop policy if exists "Anyone can submit a hike" on hike_submissions;
create policy "Anyone can submit a hike"
  on hike_submissions
  for insert
  to anon, authenticated
  with check (
    status = 'pending'
    and reviewed_at is null
    and approved_hike_id is null
  );

-- NO SELECT POLICY FOR anon -- deliberate, same reasoning as
-- crew_submissions: this table holds an email address, so RLS must deny all
-- public reads. Reviewing happens in the Supabase dashboard (service_role).

grant insert on hike_submissions to anon, authenticated;
grant usage, select on all sequences in schema public to anon, authenticated;
grant all on hike_submissions to service_role;
revoke select on hike_submissions from anon, authenticated;


-- === hikes (the live table the map actually reads) ===========================
create table if not exists hikes (
  id bigint generated always as identity primary key,
  crew_id bigint not null references crews(id) on delete restrict,
  hike_name text,
  notes text,
  distance_miles    numeric not null,
  elevation_gain_ft numeric,
  gpx_url text not null,
  path    jsonb not null,
  source_submission_id bigint references hike_submissions(id),
  created_at timestamptz not null default now()
);

create index if not exists hikes_crew_id_idx on hikes (crew_id);

alter table hikes enable row level security;

-- Public SELECT, no public write -- the exact same shape as `crews`. This is
-- the table CrewMap.js reads directly with the anon key.
drop policy if exists "Anyone can view hikes" on hikes;
create policy "Anyone can view hikes"
  on hikes
  for select
  to anon, authenticated
  using (true);

grant select on hikes to anon, authenticated;
grant all on hikes to service_role;


-- === approving / rejecting (mirrors approve_submission / reject_submission) ==
create or replace function approve_hike_submission(submission_id bigint,
                                                    note text default null)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  s hike_submissions%rowtype;
  new_id bigint;
begin
  select * into s from hike_submissions where id = submission_id;
  if not found then
    raise exception 'No hike submission with id %', submission_id;
  end if;
  if s.status = 'approved' then
    raise exception 'Submission % is already approved (hike id %)',
      submission_id, s.approved_hike_id;
  end if;

  insert into hikes (crew_id, hike_name, notes, distance_miles,
                     elevation_gain_ft, gpx_url, path, source_submission_id)
  values (s.crew_id, s.hike_name, s.notes, s.distance_miles,
          s.elevation_gain_ft, s.gpx_url, s.path, s.id)
  returning id into new_id;

  update hike_submissions
     set status = 'approved',
         reviewed_at = now(),
         review_note = coalesce(note, review_note),
         approved_hike_id = new_id
   where id = submission_id;

  return new_id;
end;
$$;

create or replace function reject_hike_submission(submission_id bigint,
                                                   note text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update hike_submissions
     set status = 'rejected', reviewed_at = now(),
         review_note = coalesce(note, review_note)
   where id = submission_id;
end;
$$;

revoke all on function approve_hike_submission(bigint, text) from public, anon, authenticated;
revoke all on function reject_hike_submission(bigint, text) from public, anon, authenticated;
grant execute on function approve_hike_submission(bigint, text) to service_role;
grant execute on function reject_hike_submission(bigint, text) to service_role;


-- === the review view ==========================================================
-- What to open in the Supabase SQL editor. Everything needing a decision,
-- newest first.
create or replace view pending_hike_submissions as
select
  hs.id,
  hs.crew_id,
  c.crew_name,
  hs.hike_name,
  hs.distance_miles,
  hs.elevation_gain_ft,
  hs.notes,
  hs.submitter_email,
  hs.submitted_at,
  -- Rounded coordinates so a reviewer can eyeball whether the recording
  -- starts somewhere that looks like a trailhead vs. somewhere residential
  -- (a home driveway, say) WITHOUT us building any real reverse-geocoding
  -- for it. This is the human-review-side half of the trailhead-privacy
  -- concern flagged when this feature was scoped -- the other half is the
  -- submission form itself telling submitters to start recording at the
  -- trailhead, not from home.
  round(hs.start_lat::numeric, 4) || ', ' || round(hs.start_lon::numeric, 4) as starts_near,
  round(hs.end_lat::numeric, 4)   || ', ' || round(hs.end_lon::numeric, 4)   as ends_near,
  hs.gpx_url
from hike_submissions hs
left join crews c on c.id = hs.crew_id
where hs.status = 'pending'
order by hs.submitted_at desc;

-- Same reasoning as pending_submissions in crew_submissions_schema.sql:
-- security_invoker OFF is only safe because of the revoke immediately below.
alter view pending_hike_submissions set (security_invoker = off);
revoke all on pending_hike_submissions from public, anon, authenticated;
grant select on pending_hike_submissions to service_role;


-- ============================================================================
-- REVIEWING, START TO FINISH
-- ============================================================================
--   1. See what's waiting:
--        select * from pending_hike_submissions;
--
--   2. Look at starts_near / ends_near. If either looks like it could be a
--      home address rather than a trailhead, open gpx_url and check before
--      approving -- or just ask the submitter.
--
--   3. Approve one (creates the live hike, marks the submission):
--        select approve_hike_submission(3);
--        select approve_hike_submission(3, 'confirmed against crew site');
--
--   4. Or reject it:
--        select reject_hike_submission(3, 'starts at what looks like a house');
--
--   5. Undo an approval:
--        delete from hikes where id = <approved_hike_id>;
--        update hike_submissions
--           set status='pending', reviewed_at=null, approved_hike_id=null
--         where id = 3;
--
-- CHECK IT WORKED
--   select status, count(*) from hike_submissions group by status;
--   select id, crew_id, hike_name, distance_miles, elevation_gain_ft from hikes;
--
--
-- ============================================================================
-- TESTING (do this once, before the real .gpx files arrive)
-- ============================================================================
-- 1. Run this whole file in the SQL editor.
-- 2. On the live site, open any crew's popup and use its new
--    "Add this crew's PT hike" link (or go straight to
--    /submit-hike?crew=<any real crew id>) and submit the sample .gpx file
--    provided alongside this feature (test-hike.gpx) -- pick any crew, this
--    is just to prove the pipeline works end to end. In the form's "Anything
--    worth knowing" (notes) field, type exactly: TEST HIKE -- DELETE ME
--    (this is just so step 6 below can find and remove this one row safely
--    -- it isn't generated automatically, you type it in when you submit).
-- 3. select * from pending_hike_submissions;  -- confirm your test row is there
--    with sane-looking distance/elevation numbers.
-- 4. select approve_hike_submission(<that id>, 'test -- delete me');
-- 5. Reload the map, turn on the "Hotshot Crew Hikes" layer in the filter
--    panel, and confirm a line appears on the crew you picked, with a working
--    popup (distance, elevation, notes).
-- 6. Clean up the test row so it doesn't sit on the live map:
--        delete from hikes where notes = 'TEST HIKE -- DELETE ME';
--    The uploaded test file itself can be deleted from
--    Storage -> crew-hikes in the dashboard, or just left -- it's a few KB
--    and nothing on the site will link to it once the row above is gone.
