-- instagram_facebook_migration_2026-11-03.sql — adds crews.instagram_url and
-- crews.facebook_url, so the social-media research kicked off this session
-- (Hotshot / Helitack / WFM / Smokejumper / Rappel / Fire Effects crews —
-- see crew-map-handoff.md) has somewhere to land.
--
-- NEW, DEDICATED FIELDS — not a reuse of the existing `website` column.
-- Per the owner's explicit call 2026-11-03: `website` is a crew's own site;
-- Instagram/Facebook are a different kind of link, and a crew can have all
-- three at once (several already do, in `website`'s free-text notes).
--
-- SAFE TO RUN MORE THAN ONCE — `add column if not exists`, and the usual
-- drop-then-add for the two check constraints (Postgres has no
-- "add constraint if not exists").
--
-- NOTHING IS BACKFILLED HERE. This only opens the columns. The actual
-- Instagram/Facebook rows land in separate, smaller review-SQL batches, one
-- per crew-type bucket (Smokejumper, Rappel, Helitack, WFM, Fire Effects,
-- remaining Hotshot) — same dry-run-first pattern as every other data batch
-- on this project, and CONFIRMED accounts only (strong leads are logged in
-- the project doc for the owner to check later, not inserted here).
--
-- RLS: no policy change needed. The existing "Public can read crews" policy
-- (schema.sql) is row-level, not column-level — it already covers whatever
-- columns the table has, these two included.

alter table crews add column if not exists instagram_url text;
alter table crews add column if not exists facebook_url  text;

-- LOOSE constraints, not strict URL validation — same philosophy as
-- hikes.source_url (hikes_stat_tier_migration.sql): a sanity check against
-- an obviously wrong value, not a regex that could reject something real.
-- Requiring the platform's own domain is a little stronger than a bare
-- length cap — it catches the "pasted into the wrong column" mistake (e.g.
-- a Facebook link accidentally saved into instagram_url) — while still
-- accepting http/https, with or without www, a trailing slash, query
-- params, or a bare handle URL: anything that's actually that platform's
-- own link.

alter table crews drop constraint if exists crews_instagram_url_shape;
alter table crews add constraint crews_instagram_url_shape
  check (instagram_url is null or (
    char_length(instagram_url) <= 300
    and instagram_url ilike '%instagram.com%'
  ));

alter table crews drop constraint if exists crews_facebook_url_shape;
alter table crews add constraint crews_facebook_url_shape
  check (facebook_url is null or (
    char_length(facebook_url) <= 300
    and (facebook_url ilike '%facebook.com%' or facebook_url ilike '%fb.com%')
  ));


-- ============================================================================
-- CHECK IT WORKED
-- ============================================================================
--   select column_name, data_type, is_nullable
--   from information_schema.columns
--   where table_name = 'crews' and column_name in ('instagram_url', 'facebook_url');
--   -- expect both rows, data_type text, is_nullable YES.
--
-- UNDO, if anything looks wrong — nothing is backfilled yet, so this just
-- removes the empty columns:
--   alter table crews drop column if exists instagram_url;
--   alter table crews drop column if exists facebook_url;
