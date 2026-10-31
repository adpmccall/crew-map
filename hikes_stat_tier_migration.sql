-- hikes_stat_tier_migration.sql — lets the `hikes` table hold a hike with no
-- submitted .gpx track at all, not just the real-track rows it was built for.
--
-- THE POINT
--   hike_submissions_schema.sql (2026-09-27) built `hikes` assuming every row
--   comes from a real uploaded .gpx file: distance_miles, gpx_url, and path
--   were all NOT NULL because the pipeline computes them from a real track.
--   The first real hike data that actually showed up (2026-10-23, from the
--   r/Wildfire contact's KML export, plus the 2026-10-02 crew-website
--   research) isn't that shape at all — it's either a crew publishing real
--   stated numbers on their own site (Lolo IHC, Winema IHC) or a contact
--   stating numbers from memory (Diamond Mountain), with no GPS recording
--   behind either one. Forcing those into the existing NOT NULL columns would
--   mean inventing a fake .gpx file just to satisfy the schema — exactly the
--   kind of fabricated-precision move this project has avoided everywhere
--   else (see the posting-pin reasoning in CrewMap.js, or the "don't guess an
--   elevation delta from two dropped pins" call made 2026-10-24).
--
--   This migration does the minimum to let `hikes` hold three honest kinds
--   of row side by side, same table, same map:
--     1. submitted_gpx   — the original pipeline. distance_miles/gpx_url/path
--                          stay REQUIRED for this source, exactly as before.
--     2. crew_published  — a crew's own website states real numbers (no
--                          track). distance_miles/elevation_gain_ft can be
--                          set; gpx_url/path stay null; source_url points at
--                          the page so anyone can go verify it themselves.
--     3. contact_reported — numbers (or nothing at all) reported by someone
--                          who isn't the crew itself. Same shape as
--                          crew_published but no source_url, since there's
--                          no public page to point at.
--
--   A hike row with NO distance/elevation at all (the "we know this crew has
--   a hike, we just don't have real numbers yet" case) is still a valid row
--   under this migration — the map shows it as a known-but-incomplete entry
--   and invites a correction, rather than it needing a separate table.
--
-- SAFE TO RE-RUN — every statement either checks before acting or uses
-- DROP-then-ADD for the two constraints that Postgres has no IF NOT EXISTS
-- form for, same convention as every other schema file here.
--
-- HOW TO RUN
--   Supabase dashboard -> SQL Editor -> paste -> Run. This alone does not
--   add or change any data — it only changes what the table will ALLOW.


-- === relax the three columns that assumed a real .gpx file ==================
-- Each of these only matters going forward (existing rows, if any, already
-- satisfy NOT NULL and are untouched).
alter table hikes alter column distance_miles drop not null;
alter table hikes alter column gpx_url drop not null;
alter table hikes alter column path drop not null;


-- === where a row's numbers actually came from ================================
alter table hikes add column if not exists source text;

update hikes set source = 'submitted_gpx' where source is null;
-- Every row that existed before this migration came through the original
-- .gpx submission form, so backfilling them as 'submitted_gpx' is simply
-- stating what's already true, not a guess.

alter table hikes alter column source set not null;
alter table hikes alter column source set default 'submitted_gpx';

alter table hikes drop constraint if exists hikes_source_check;
alter table hikes add constraint hikes_source_check
  check (source in ('submitted_gpx', 'crew_published', 'contact_reported'));


-- === an optional link to verify a crew_published row against ================
-- e.g. https://lolohotshots.com/preparation-pt. Deliberately NOT used for
-- contact_reported rows -- there usually isn't a public page to point at,
-- and a blank field here is a more honest signal than a fake one.
alter table hikes add column if not exists source_url text;

alter table hikes drop constraint if exists hikes_source_url_len;
alter table hikes add constraint hikes_source_url_len
  check (source_url is null or char_length(source_url) <= 300);


-- === keep the original guarantee for the original pipeline ==================
-- A submitted_gpx row must still have the three things the feature was built
-- around -- this migration widens what OTHER sources can look like, it does
-- not loosen the real pipeline's own guarantee.
alter table hikes drop constraint if exists hikes_submitted_gpx_requires_track;
alter table hikes add constraint hikes_submitted_gpx_requires_track
  check (
    source <> 'submitted_gpx'
    or (gpx_url is not null and path is not null and distance_miles is not null)
  );


-- === distance, now optional, keeps the same sanity range when present ======
alter table hikes drop constraint if exists hikes_distance_range;
alter table hikes add constraint hikes_distance_range
  check (distance_miles is null or (distance_miles > 0 and distance_miles <= 60));


-- ============================================================================
-- CHECK IT WORKED
-- ============================================================================
--   select source, count(*) from hikes group by source;
--   -- every pre-existing row should show 'submitted_gpx'
--
--   \d hikes
--   -- distance_miles / gpx_url / path should show as nullable now
--
-- Nothing else changes: approve_hike_submission() / reject_hike_submission()
-- / pending_hike_submissions, the RLS policies, and the Storage bucket are
-- all untouched -- the public .gpx submission form keeps working exactly as
-- it does today, it just isn't the only way a row gets into `hikes` anymore.
