-- atlas_schema.sql — additive columns on `crews` for the Handcrew Atlas merge.
--
-- HOW TO USE
--   Supabase dashboard -> "SQL Editor" -> "New query" -> paste this whole file
--   -> click "Run". Safe to run more than once (every step is idempotent).
--
-- WHAT THIS ADDS (and why)
--   Three new columns on the existing `crews` table. Nothing here deletes or
--   rewrites your 440 curated rows — it only ADDS columns and backfills the new
--   `source` tag on the rows you already have. The Atlas import script then
--   fills these in.
--
--   This is purely additive, so it's reversible: see atlas_import.py for the
--   rollback (everything the Atlas adds is tagged source='handcrew_atlas').

-- ---------------------------------------------------------------------------
-- 1) New columns  (`if not exists` = safe to re-run)
-- ---------------------------------------------------------------------------
-- The Atlas gives us a crew NAME (our data never had one) ...
alter table crews add column if not exists crew_name text;

-- ... and ONE photo per crew when present (a Google My Maps hosted image URL).
-- NOTE: these URLs live on mymaps.usercontent.google.com and may be unstable /
-- not hotlink-friendly long term. We store them now; how (and whether) to show
-- them is a later display decision.
alter table crews add column if not exists photo_url text;

-- ... and a provenance tag on EVERY row. This is the backbone of future
-- moderation (Phase 3) and of this merge's rollback story.
alter table crews add column if not exists source text;

-- ---------------------------------------------------------------------------
-- 2) Backfill provenance for the existing (curated) rows
-- ---------------------------------------------------------------------------
-- Everything already in the table is our original USFS data. Tag it. The
-- `where source is null` makes this a no-op on a re-run.
update crews set source = 'usfs_official' where source is null;

-- ---------------------------------------------------------------------------
-- 3) Make `source` reliable going forward
-- ---------------------------------------------------------------------------
-- New rows default to 'usfs_official' unless the inserter says otherwise (the
-- Atlas import passes 'handcrew_atlas' explicitly; future community rows will
-- pass 'user_submitted').
alter table crews alter column source set default 'usfs_official';

-- Now that every row has a value, require one — no row may be left unlabeled.
alter table crews alter column source set not null;

-- Only allow the three known provenance values. This still permits
-- 'user_submitted' later, so the community-contribution feature drops in with no
-- further migration. (drop-then-add makes the whole file safe to re-run.)
alter table crews drop constraint if exists crews_source_check;
alter table crews add constraint crews_source_check
  check (source in ('usfs_official', 'handcrew_atlas', 'user_submitted'));

-- ---------------------------------------------------------------------------
-- 4) Privileges + a small index
-- ---------------------------------------------------------------------------
-- The import writes with the SECRET service_role key, which bypasses RLS but
-- still needs table privileges. Granting explicitly makes this self-contained
-- (mirrors what jobs_schema.sql already does for the jobs table).
grant all on public.crews to service_role;

-- We group-delete by `source` for rollback, and may filter by it in the app.
-- The table is tiny, but this index is cheap and states the intent.
create index if not exists crews_source_idx on crews (source);

-- The public read policy from schema.sql still applies unchanged: anon/
-- authenticated can SELECT all rows (including the new columns); no public
-- write. Nothing to change here.
