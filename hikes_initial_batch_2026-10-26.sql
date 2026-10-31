-- hikes_initial_batch_2026-10-26.sql — the first 13 hikes for the new
-- standalone Hikes map: 6 crew-published (Lolo IHC, Winema IHC), 1 contact-
-- reported-with-stats (Diamond Mountain), 6 location-only / stats-missing
-- (the rest of the r/Wildfire contact's KML batch), ready to invite
-- corrections once live.
--
-- RUN hikes_stat_tier_migration.sql FIRST — this file needs the relaxed
-- columns and the new `source`/`source_url` fields that migration adds.
--
-- WHY A DRY RUN FIRST, SAME AS EVERY OTHER DATA BATCH ON THIS PROJECT: every
-- insert below needs a real crews.id, found by matching on crew_name. Run
-- PART 1 and read the results before running PART 2 -- a wrong or missing
-- match here would attach a hike to the wrong crew, or fail outright.


-- ============================================================================
-- PART 1 -- DRY RUN: confirm every crew name resolves to exactly one row
-- ============================================================================
-- Each line should come back with exactly one id. Zero rows or more than one
-- means PART 2's subquery for that crew needs a different ilike pattern.
-- (Ukonom is looked up here only to confirm it's excluded on purpose -- see
-- the note below, not because its insert needs the id.)

select 'lolo'           as lookup, id, crew_name, resource from crews where crew_name ilike '%lolo%'
union all
select 'winema',            id, crew_name, resource from crews where crew_name ilike '%winema%'
union all
select 'feather river',     id, crew_name, resource from crews where crew_name ilike '%feather river%'
union all
select 'ukonom',            id, crew_name, resource from crews where crew_name ilike '%ukonom%'
union all
select 'eldorado',          id, crew_name, resource from crews where crew_name ilike '%eldorado%'
union all
select 'crane valley',      id, crew_name, resource from crews where crew_name ilike '%crane valley%'
union all
select 'kings river',       id, crew_name, resource from crews where crew_name ilike '%kings river%'
union all
select 'truckee',           id, crew_name, resource from crews where crew_name ilike '%truckee%'
union all
select 'diamond mountain',  id, crew_name, resource from crews where crew_name ilike '%diamond mountain%';

-- RESULTS FROM THE OWNER'S ACTUAL RUN, 2026-10-31 -- two things this caught:
--
-- 1. "lolo" matched TWO crews: id 54 "Lolo IHC" (resource includes "Hotshot
--    Crew" -- the real one) and id 833 "Lolo Regulars" (a separate,
--    non-hotshot Type 2/2IA Handcrew that just shares the name). PART 2
--    below is now pinned to id 54 specifically so Lolo's 5 hikes don't also
--    land on the wrong crew.
--
-- 2. "ukonom" DID resolve -- id 603, "Ukonom HC", resource "Type 2/2IA
--    Handcrew". Checked against the owner's own knowledge (2026-10-31):
--    Ukonom HC genuinely isn't a hotshot crew -- that classification is
--    correct, not a repeat of the Snake River/Bitterroot/Idaho Panhandle/
--    Redmond resource-field bug. So "The Front Yard" (its hike from the
--    r/Wildfire batch) is left out of PART 2 below entirely, same as any
--    other non-hotshot crew would be -- nothing to fix here.


-- ============================================================================
-- PART 2 -- THE INSERT. Pinned to the exact ids from the 2026-10-31 dry run.
-- ============================================================================

-- --- Lolo IHC (id 54 specifically -- NOT id 833 "Lolo Regulars"), 5 hikes,
--     all from lolohotshots.com/preparation-pt, confirmed live 2026-10-26.
--     No path/gpx -- these are the crew's own stated numbers.
insert into hikes (crew_id, hike_name, notes, distance_miles, elevation_gain_ft, source, source_url)
values
  (54, 'North Sentinel', 'Full gear. Crew''s own time: under 50 minutes, first day of critical.', 1.35, 1737,
   'crew_published', 'https://lolohotshots.com/preparation-pt'),
  (54, 'South Sentinel', null, 1.97, 1539,
   'crew_published', 'https://lolohotshots.com/preparation-pt'),
  (54, 'Jumper Trail', 'Run, from the Kim Williams trail to the top, running shoes, no gear. Crew''s own time: under 35 minutes.', 2.25, 1441,
   'crew_published', 'https://lolohotshots.com/preparation-pt'),
  (54, 'Mad Maddie', 'Run. Crew''s own fastest recorded time: 29:39.', 1.4, 1853,
   'crew_published', 'https://lolohotshots.com/preparation-pt'),
  (54, 'GINA', 'Part of the crew''s "Matrix" fitness-test course, not a standalone PT hike.', 0.87, 1120,
   'crew_published', 'https://lolohotshots.com/preparation-pt');

-- --- Winema IHC (id 401), 1 hike, from
--     winemahotshots.org/physical-fitness-standards/, confirmed live 2026-10-26.
insert into hikes (crew_id, hike_name, notes, distance_miles, elevation_gain_ft, source, source_url)
values
  (401, 'Hogback Mountain',
   'Roughly 1.6 miles one way. The crew''s own page notes this public, AllTrails-documented route approximates but isn''t exactly their actual route.',
   1.6, 1700, 'crew_published', 'https://winemahotshots.org/physical-fitness-standards/');

-- --- Diamond Mountain IHC (id 597), 1 hike ("Mo"), stats as stated by the
--     r/Wildfire contact. No source_url (no public page to point at) and
--     deliberately no narrative/memorial text carried over -- per the
--     owner's explicit 2026-10-24/26 call to drop all commentary, everywhere,
--     with no exception for this one.
insert into hikes (crew_id, hike_name, notes, distance_miles, elevation_gain_ft, source)
values
  (597, null, 'Crew time: 1 hour (as reported by the submitter, not computed from a track).', 1.9, 2000,
   'contact_reported');

-- --- The rest of the r/Wildfire KML batch: real named/located hikes, but no
--     stated distance/elevation/time -- shown with location only, inviting a
--     correction or a real .gpx via the existing /submit-hike form.
insert into hikes (crew_id, hike_name, notes, source)
values
  (598, 'Head Dam', null, 'contact_reported'),                                            -- Feather River IHC
  (598, 'The Pulga', null, 'contact_reported'),                                            -- Feather River IHC
  (273, 'Henry', 'Not yet confirmed firsthand by the person who reported it.', 'contact_reported'), -- Eldorado IHC
  (324, null, null, 'contact_reported'),                                                   -- Crane Valley IHC
  (353, null, null, 'contact_reported'),                                                   -- Kings River IHC
  (354, 'Acid Flats', null, 'contact_reported');                                           -- Truckee IHC

-- --- NOT inserted: "The Front Yard" (Ukonom HC, id 603). Left out on
--     purpose -- Ukonom HC isn't a hotshot crew (confirmed 2026-10-31), so
--     its hike doesn't belong in a hotshot-crew-only batch. Nothing to fix,
--     nothing to revisit later.


-- ============================================================================
-- CHECK IT WORKED
-- ============================================================================
--   select h.id, c.crew_name, h.hike_name, h.distance_miles,
--          h.elevation_gain_ft, h.source
--   from hikes h join crews c on c.id = h.crew_id
--   order by h.source, c.crew_name;
--   -- expect 13 rows: 5 Lolo + 1 Winema + 1 Diamond Mountain (all with real
--   -- numbers) + 6 location-only (Head Dam, The Pulga, Henry, Crane Valley,
--   -- Kings River, Acid Flats -- null distance/elevation on all 6). Ukonom
--   -- HC's "The Front Yard" is intentionally not in this batch.
--
-- UNDO, if anything looks wrong -- these are brand new rows with no
-- submission behind them, so just delete by source and re-run:
--   delete from hikes where source in ('crew_published', 'contact_reported');
