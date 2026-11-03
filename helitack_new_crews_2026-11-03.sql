-- helitack_new_crews_2026-11-03.sql — inserts 6 real helitack crews with NO
-- existing `crews` row at all (crew-map-handoff.md, section 7 — 2 were
-- already confirmed, 4 more verified directly this session after the owner
-- flagged the Helitack social file looked "slim"). Run AFTER
-- instagram_facebook_migration_2026-11-03.sql and AFTER
-- helitack_social_2026-11-03.sql — independent of the other buckets' files,
-- no overlapping ids.
--
-- Same reasoning as smokejumper_new_crews_2026-11-03.sql: these are real,
-- active, crew-run accounts with nothing in `crews` to attach a social link
-- to, so they need their own row before the link means anything.
--
-- ⚠️ SAME source CHECK-CONSTRAINT WIDENING AS THE SMOKEJUMPER FILE — this
-- file includes the identical `drop constraint if exists` / `add
-- constraint` pair so it works whether or not that file already ran. If you
-- changed the widened value's name there, change it here too (both say
-- 'social_research').
--
-- ⚠️ ONE JUDGMENT CALL TO REVIEW — Northern Colorado Helitack's own Facebook
-- Intro describes it as an "Exclusive Use Interagency Helitack program," not
-- explicitly a Colorado DFPC resource like Montrose/Flatiron clearly are.
-- Tagged `agency='state'` here on the strength of it being based alongside
-- other DFPC aviation resources at the same Broomfield facility, but this is
-- a weaker inference than the other 5 rows — worth a second look if you know
-- more about who actually runs it.
--
-- COORDINATES — real base/airport locations, not estimated, sourced from
-- airport/NIFC reference data:
--   Boise Helitack: 43.567, -116.209 — NIFC headquarters campus, Boise, ID.
--   Las Vegas Helitack: 36.210703, -115.194443 — North Las Vegas Airport
--     (the BLM helicopter commonly dispatches from here as "Carpenter 1").
--   Montrose Helitack: 38.458315, -107.867818 — the Montrose BLM Heliport
--     itself (a named USGS place), Montrose, CO.
--   Flatiron Helitack: 39.570119, -104.849293 — Centennial Airport, CO,
--     per DFPC's own published aircraft-basing page.
--   Northern Colorado Helitack: 39.908806, -105.117194 — Rocky Mountain
--     Metropolitan Airport (the "Jeffco Airtanker Base" named in its own
--     Facebook Intro), Broomfield, CO.
--   Burns Helitack: 43.588871, -118.955073 — Burns Municipal Airport, OR.
-- None of these 6 are tied to a specific national forest the way the
-- Smokejumper insert's 3 rows were, so `forest`/`district` are left NULL
-- rather than guessed.
--
-- NOT included here: Southern Rockies Wildland Fire Module (the WFM
-- bucket's own new-crew lead) — its Facebook page is real and confirmed
-- (257 followers) but no specific base town/location could be pinned down
-- this session, so no real coordinates to use. Left as a lead in the doc,
-- not inserted — a future pass should nail down its actual base first.
--
-- ----------------------------------------------------------------------------
-- WIDEN THE source CHECK CONSTRAINT (idempotent — safe even if already done)
-- ----------------------------------------------------------------------------
alter table crews drop constraint if exists crews_source_check;
alter table crews add constraint crews_source_check
  check (source in ('usfs_official', 'handcrew_atlas', 'user_submitted', 'doi_directory', 'social_research'));

-- ----------------------------------------------------------------------------
-- INSERT
-- ----------------------------------------------------------------------------
insert into crews (
  crew_name, town, state, resource, agency, source,
  latitude, longitude, instagram_url, facebook_url
) values
  (
    'Boise Helitack', 'BOISE', 'IDAHO', 'Helitack', 'blm', 'social_research',
    43.567, -116.209,
    'https://www.instagram.com/boise_helitack/', null
  ),
  (
    'Las Vegas Helitack', 'LAS VEGAS', 'NEVADA', 'Helitack', 'blm', 'social_research',
    36.210703, -115.194443,
    'https://www.instagram.com/lasvegashelitack/', null
  ),
  (
    'Montrose Helitack', 'MONTROSE', 'COLORADO', 'Helitack', 'state', 'social_research',
    38.458315, -107.867818,
    'https://www.instagram.com/montrosehelitack/', null
  ),
  (
    'Flatiron Helitack', 'CENTENNIAL', 'COLORADO', 'Helitack', 'state', 'social_research',
    39.570119, -104.849293,
    'https://www.instagram.com/flatironhelitack/', null
  ),
  (
    'Northern Colorado Helitack', 'BROOMFIELD', 'COLORADO', 'Helitack', 'state', 'social_research',
    39.908806, -105.117194,
    null, 'https://www.facebook.com/p/Northern-Colorado-Helitack-100063539953561/'
  ),
  (
    'Burns Helitack', 'BURNS', 'OREGON', 'Helitack', 'blm', 'social_research',
    43.588871, -118.955073,
    null, 'https://www.facebook.com/p/Burns-Helitack-100064391511638/'
  );

-- ----------------------------------------------------------------------------
-- CHECK IT WORKED
-- ----------------------------------------------------------------------------
select id, crew_name, town, state, latitude, longitude, region,
       instagram_url, facebook_url, agency, source
from crews
where crew_name in (
  'Boise Helitack', 'Las Vegas Helitack', 'Montrose Helitack',
  'Flatiron Helitack', 'Northern Colorado Helitack', 'Burns Helitack'
)
order by id;
-- expect: 6 new rows, each with a non-null `region` (auto-filled by the
-- existing crews_set_region trigger), the coordinates above, and exactly
-- one of instagram_url/facebook_url set per row as shown.

-- UNDO, if anything looks wrong:
--   delete from crews
--   where crew_name in (
--     'Boise Helitack', 'Las Vegas Helitack', 'Montrose Helitack',
--     'Flatiron Helitack', 'Northern Colorado Helitack', 'Burns Helitack'
--   );
-- (leaves the widened source constraint in place, which is harmless either way)
