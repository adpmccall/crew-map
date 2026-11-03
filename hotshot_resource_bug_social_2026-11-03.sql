-- hotshot_resource_bug_social_2026-11-03.sql — Instagram for Snake River IHC,
-- the one row from the 2026-10-02 "resource-field hotshot undercount" bug
-- (crew-map-handoff.md, section 7) that could be directly re-verified this
-- session. Run AFTER instagram_facebook_migration_2026-11-03.sql.
--
-- CONTEXT: 2026-10-02 research found 4 real hotshot crews whose `resource`
-- field doesn't contain "Hotshot Crew" (so they're invisible to the live
-- map's own crew-type filter): Snake River IHC (id 248), Bitterroot IHC
-- (id 8), Idaho Panhandle IHC (id 42), Redmond IHC (id 422). That research
-- noted social accounts for 3 of the 4, but never wrote them into the DB —
-- the `instagram_url`/`facebook_url` columns didn't exist until this
-- session's migration. This file re-verifies and inserts what checks out:
--
--   id 248, Snake River IHC (BLM, Pocatello, ID) — RE-CONFIRMED. Instagram
--     @snake_river_hotshots, 9,430 followers, bio "Snake River Hotshots were
--     established in 2001" — exact match, same account the owner originally
--     recognized from personal knowledge.
--   id 8, Bitterroot IHC (USFS, Montana) — NOT inserted. The
--     facebook.com/bitterroot.hotshots page logged 2026-10-02 as "confirmed"
--     renders as a personal-profile-shaped page (Friends/Work/College/High
--     school tabs, no follower count, no Intro) rather than a business Page,
--     and Facebook itself surfaces "Others named Bitterroot Hotshots" —
--     meaning this handle may not be uniquely the crew. Downgrading this
--     from "confirmed" to "needs a second look" rather than carrying the
--     2026-10-02 note through uncritically.
--   id 42, Idaho Panhandle IHC — no crew-run social was found 2026-10-02 and
--     none was found on a fresh check either. Left blank, as before.
--   id 422, Redmond IHC — intentionally NOT touched. See the separate
--     id 422 data-conflation flag (section 7): its forest/district field is
--     actually the Redmond Smokejumper base's location, not this Hotshot
--     crew's own, and the owner needs to decide on a row-split before either
--     entity's social link goes in cleanly.
--
-- ----------------------------------------------------------------------------
-- DRY RUN — review before running the UPDATE below
-- ----------------------------------------------------------------------------
select id, crew_name, town, state, resource, instagram_url, facebook_url
from crews
where id = 248;
-- expect: resource = 'Engine, Helitack, Fuels' (no "Hotshot Crew" string —
-- this is the known bug, not something this file fixes), instagram_url and
-- facebook_url both NULL.

-- ----------------------------------------------------------------------------
-- UPDATE
-- ----------------------------------------------------------------------------
update crews set instagram_url = 'https://www.instagram.com/snake_river_hotshots/'
where id = 248;

-- ----------------------------------------------------------------------------
-- CHECK IT WORKED
-- ----------------------------------------------------------------------------
select id, instagram_url, facebook_url from crews where id = 248;
-- expect: instagram_url set, facebook_url NULL.

-- UNDO, if anything looks wrong:
--   update crews set instagram_url = null where id = 248;
