-- smokejumper_social_2026-11-03.sql — Instagram for the Smokejumper research
-- bucket (crew-map-handoff.md, section 7/11). Run AFTER
-- instagram_facebook_migration_2026-11-03.sql (adds the two columns).
--
-- SCOPE NOTE, read this first: the live DB's `resource` field only tags 2-3
-- crews "Smokejumper" (same resource-field undercount bug already logged for
-- hotshot crews — see crew-map-handoff.md section 7). There are really ~9
-- national USFS/BLM smokejumper bases. Per your call, this file researches
-- all ~9 real bases, not just the DB-tagged ones. Only ONE row can actually
-- be updated here — the rest have no existing `crews` row to attach to (see
-- the project doc for the full findings, including 3 bases with CONFIRMED
-- active accounts that currently have no crew row at all).
--
-- CONFIRMED (directly opened and verified) — 1 row:
--   id 341, Redding, CA (Shasta-Trinity NF / Redding Air Center) — resource
--   is currently NULL for this crew (a separate, pre-existing data gap, not
--   part of this batch) — real-world identity confirmed by forest+district
--   match. Instagram: @california_smokejumpers, 23.4K followers, bio
--   "Providing SPEED RANGE & PAYLOAD since 1957" (matches Redding's 1957
--   founding) — the Shasta-Trinity NF's own account, not a generic one.
--   No matching Facebook page found.
--
-- NOT updated here, and why:
--   id 851 (Great Basin Smokejumpers, Boise) — no dedicated Instagram/
--     Facebook found after a thorough search; only generic NIFC/BLM Fire
--     channels mention it. Leaving blank rather than guessing.
--   id 60 (Grangeville, unnamed crew) — same: no dedicated account found.
--   id 422 (Redmond IHC) — do NOT touch this row for Smokejumper purposes.
--     Its forest/district (Deschutes NF / Redmond Air Center) is the real
--     Redmond Smokejumper Base's location, but its crew_name and existing
--     social research (section 7) are for the separate Redmond HOTSHOTS
--     crew (@redmondhotshots). This one row has apparently absorbed data
--     from two distinct real-world entities — flagged as a new, separate
--     data-integrity item in the project doc (not the same as the simpler
--     resource-field-undercount bug already logged). Needs a real decision
--     (likely splitting into two rows) before either crew's Instagram should
--     be written here — not something to guess at in a review SQL file.
--
-- Everything else — McCall Smokejumpers (confirmed IG + FB, no DB row),
-- Missoula Smokejumpers (confirmed IG, no DB row), North Cascades
-- Smokejumpers/Winthrop (confirmed IG, no DB row), West Yellowstone
-- Smokejumpers (no social found, no DB row), Alaska Smokejumpers/BLM AFS
-- Fairbanks (only a general BLM-AFS account found, not jumper-specific, no
-- DB row) — is logged in the project doc as new-crew-candidate leads, same
-- pattern as the 2026-09-22 DOI-directory additions. Nothing to insert here
-- until you decide whether/how to add them as crews (they'd need real
-- coordinates too).

-- ----------------------------------------------------------------------------
-- DRY RUN — review before running the UPDATE below
-- ----------------------------------------------------------------------------
select id, crew_name, town, state, forest, district, resource, instagram_url
from crews
where id = 341;
-- expect: crew_name NULL, town REDDING, forest SHASTA-TRINITY NF,
-- district REDDING AIR CENTER, instagram_url NULL (not yet set).

-- ----------------------------------------------------------------------------
-- UPDATE
-- ----------------------------------------------------------------------------
update crews
set instagram_url = 'https://www.instagram.com/california_smokejumpers/'
where id = 341;

-- ----------------------------------------------------------------------------
-- CHECK IT WORKED
-- ----------------------------------------------------------------------------
select id, town, forest, instagram_url, facebook_url from crews where id = 341;
-- expect instagram_url = the URL above, facebook_url still NULL.

-- UNDO, if anything looks wrong:
--   update crews set instagram_url = null where id = 341;
