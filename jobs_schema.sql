-- jobs_schema.sql — the Supabase (Postgres) table for the "currently hiring" layer.
--
-- HOW TO USE
--   Supabase dashboard -> "SQL Editor" -> "New query" -> paste this whole file
--   -> click "Run". It creates the `jobs` table and lets the public READ it.
--
-- WHAT THIS TABLE HOLDS
--   Open USAJOBS wildland-fire postings (series 0456 + 0462), already geocoded,
--   with the "national announcement" noise removed. The local refresh script
--   (`refresh_jobs.py`) writes into this table; the website only READS it.
--
-- RELATIONSHIP TO `crews`
--   Separate table on purpose: jobs open and close over time, so a refresh can
--   freely replace them without ever touching the curated crew data. The app
--   matches jobs to crews in the browser by comparing lat/lng (≤ 50 miles).

-- ---------------------------------------------------------------------------
-- 1) The table
-- ---------------------------------------------------------------------------
-- `if not exists` makes this safe to run more than once without erroring.
create table if not exists jobs (
  -- Surrogate primary key. Postgres auto-numbers it (1, 2, 3, ...); we never
  -- set it ourselves. Same pattern as the `crews` table.
  id                   bigint generated always as identity primary key,

  -- The USAJOBS announcement number (e.g. "24-R1-12345-DP"). It identifies a
  -- posting, but a single posting can be open in SEVERAL towns, and we store
  -- ONE ROW PER TOWN (so each row can light up the right map pin). That means
  -- the announcement number is NOT unique by itself — see the composite unique
  -- constraint at the bottom of this CREATE, which is what makes upserts work.
  announcement_number  text not null,

  title                text,   -- e.g. "Wildland Firefighter (Engine)"
  agency               text,   -- e.g. "Forest Service"
  department           text,   -- e.g. "Department of Agriculture"

  -- The duty-station town this row represents (one town from the posting).
  town                 text,
  state                text,   -- full name, e.g. "MONTANA" (kept UPPERCASE to
                               -- match how the crews table stores state)

  -- Coordinates for this town, filled in by the refresh script's geocoder.
  -- Required: the map can't match a job to nearby crews without them, and the
  -- refresh script only inserts rows it successfully geocoded, so we enforce
  -- NOT NULL. "double precision" is Postgres's standard decimal-number type.
  latitude             double precision not null,
  longitude            double precision not null,

  job_series           text,   -- "0456", "0462", or "0456,0462" if both apply
  pay_grade            text,   -- e.g. "GS 03-05" (pay plan + grade range)

  -- Salary range. Nullable: not every posting lists one. `numeric` holds exact
  -- decimal money values without floating-point rounding surprises.
  salary_min           numeric,
  salary_max           numeric,

  -- Application window. `date` is enough (we only need the day, not the time).
  -- close_date is what the refresh script uses to drop postings that have ended.
  open_date            date,
  close_date           date,

  apply_url            text,   -- direct USAJOBS link to apply

  -- When this row was last written by a refresh run. Defaults to the moment of
  -- insert; the refresh script sets it on every upsert so you can see how fresh
  -- the data is. `timestamptz` = timestamp WITH time zone (stored as UTC).
  last_refreshed       timestamptz not null default now(),

  -- The natural key for a single row = one announcement in one town. Making it
  -- UNIQUE is what lets the refresh script UPSERT: re-running updates the
  -- existing (announcement + town) row instead of creating a duplicate.
  -- (PostgREST upsert points its `on_conflict` at exactly these columns.)
  constraint jobs_announcement_town_unique
    unique (announcement_number, town, state)
);

-- ---------------------------------------------------------------------------
-- 2) Make the table publicly READABLE (and nothing more)  — same as `crews`
-- ---------------------------------------------------------------------------
-- Supabase's auto API is protected by Row Level Security (RLS). With RLS on and
-- no policies, NOBODY can read the table through the API. Our rule is "viewing
-- is always login-free", so we add ONE policy that lets anyone SELECT. We add NO
-- insert/update/delete policies, so the public (anon) API cannot change data.
-- The refresh script writes using the SECRET service_role key, which BYPASSES
-- RLS entirely — so it can upsert even though the public policy is read-only.

alter table jobs enable row level security;

-- "anon" = visitors with no account (the role the website uses by default).
-- "using (true)" = allow reading every row, with no row-level restriction.
create policy "Public can read jobs"
  on jobs
  for select
  to anon, authenticated
  using (true);

-- The RLS policy decides WHICH rows a role may see, but Postgres also requires a
-- base table-level privilege to read the table AT ALL. Supabase usually grants
-- these automatically, but we grant them EXPLICITLY so a fresh setup works with
-- no manual dashboard fixes.
--
-- 1) Public read: without this, the website's reads fail with 42501 "permission
--    denied" (same fix the crews table needed).
grant select on public.jobs to anon, authenticated;
--
-- 2) Full access for `service_role`: the local refresh script (refresh_jobs.py)
--    writes with the service_role key, which bypasses RLS but STILL needs table
--    privileges. Without this, its upsert can fail with a 403 — exactly the error
--    that had to be fixed by hand on first setup. Granting it here makes the
--    schema self-contained so the next fresh project never hits that.
grant all on public.jobs to service_role;

-- ---------------------------------------------------------------------------
-- 3) A small index to make "who's hiring" lookups snappy (optional but cheap)
-- ---------------------------------------------------------------------------
-- The dataset is small, but the app will read jobs by location a lot. An index
-- on (latitude, longitude) costs almost nothing and keeps things fast as the
-- table grows over repeated refreshes.
create index if not exists jobs_lat_lng_idx on jobs (latitude, longitude);
