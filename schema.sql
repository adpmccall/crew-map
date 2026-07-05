-- schema.sql — the Supabase (Postgres) table for Crew Map.
--
-- HOW TO USE (after creating your Supabase project):
--   Supabase dashboard -> "SQL Editor" -> "New query" -> paste this whole file
--   -> click "Run". It creates the `crews` table and lets the public READ it.
--
-- WHY EACH PIECE EXISTS is explained in comments below. This mirrors the 12
-- fields in crews_with_coords.json, plus an `id` Postgres adds for us.

-- ---------------------------------------------------------------------------
-- 1) The table
-- ---------------------------------------------------------------------------
-- `if not exists` makes this safe to run more than once without erroring.
create table if not exists crews (
  -- A surrogate primary key. Every table should have one unique id per row.
  -- "generated always as identity" = Postgres auto-numbers it (1, 2, 3, ...);
  -- we never set it ourselves.
  id         bigint generated always as identity primary key,

  -- The 12 fields from our data. All the descriptive ones are free text and
  -- nullable (a `text` column allows NULL unless we add NOT NULL). In our data
  -- many are "blank" — e.g. 184 crews have no `resource`/`housing`. The import
  -- script converts those blanks to true NULL (not the empty string ""), so we
  -- can ask "is null" in queries. Those crews must still appear on the map, so
  -- we deliberately do NOT force these columns to be filled.
  region     text,   -- e.g. "NORTHERN REGION, REGION 1"  (one of 6)
  forest     text,   -- e.g. "BEAVERHEAD-DEERLODGE NF"
  district   text,   -- e.g. "BUTTE RD"  (8 are NULL)
  town       text,   -- e.g. "BUTTE"
  state      text,   -- full uppercase name, e.g. "MONTANA"  (one of 16)
  location   text,   -- "TOWN, STATE" convenience string
  resource   text,   -- messy comma-separated crew types; filter by "contains" (184 NULL)
  housing    text,   -- "YES" / "NO" / NULL (NULL = unknown)
  notes      text,   -- usually NULL (only 62 set)
  website    text,   -- a URL when present, else NULL (69 NULL)

  -- Coordinates from geocode.py. These are required: the map can't place a
  -- pin without them, and all 440 rows have them, so we enforce NOT NULL.
  -- "double precision" is Postgres's standard type for decimal numbers.
  latitude   double precision not null,
  longitude  double precision not null
);

-- ---------------------------------------------------------------------------
-- 2) Make the table publicly READABLE (and nothing more)
-- ---------------------------------------------------------------------------
-- Supabase exposes an auto API protected by "Row Level Security" (RLS).
-- With RLS on and no policies, NOBODY can read the table through the API.
-- Our product rule is "viewing is always login-free", so we add ONE policy
-- that lets anyone read (select) every row. We deliberately add NO insert/
-- update/delete policies, so the public API cannot change the data. That
-- matches "display before edit" — editing comes much later, behind auth.

alter table crews enable row level security;

-- "anon" = visitors with no account (the role the website uses by default).
-- "using (true)" = allow reading every row, with no row-level restriction.
create policy "Public can read crews"
  on crews
  for select
  to anon, authenticated
  using (true);

-- The RLS policy above decides WHICH rows a role may see, but Postgres also
-- requires a base table-level privilege to read the table AT ALL. Supabase
-- usually grants this to `anon` automatically, but grant it explicitly so this
-- schema is self-contained and the public website can actually read the data.
grant select on crews to anon, authenticated;

-- Note: no index needed. 440 rows is tiny; Postgres scans it instantly.
