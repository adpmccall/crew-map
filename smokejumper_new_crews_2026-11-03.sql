-- smokejumper_new_crews_2026-11-03.sql — inserts 3 real national smokejumper
-- bases that have NO existing `crews` row at all (crew-map-handoff.md,
-- section 7, "📦 NEW-CREW LEADS FOUND 2026-11-03"). Run AFTER
-- instagram_facebook_migration_2026-11-03.sql and AFTER
-- smokejumper_social_2026-11-03.sql — independent of the other buckets'
-- files, no overlapping ids.
--
-- WHY THESE AREN'T UPDATES: `smokejumper_social_2026-11-03.sql` only touched
-- id 341 (Redding) because that's the one real jumper base that already had
-- a matching `crews` row. These 3 are real, active, confirmed bases with no
-- row to attach to — the existing McCall rows (ids 232/233) are the
-- Payette NF district's regular engine/WFM/helitack crews, not the
-- smokejumper base, and the existing Missoula row (id 54, "Lolo IHC") is a
-- hotshot crew, not the jumper base — both already cross-checked and
-- confirmed distinct during this session's research, same duplicate-check
-- habit used for the 2026-09-22 DOI-directory batch. No existing row for
-- Winthrop/North Cascades at all.
--
-- ⚠️ SOURCE-FIELD DECISION NEEDED — review before running: `crews.source`
-- has a check constraint currently allowing only 'usfs_official',
-- 'handcrew_atlas', 'user_submitted', 'doi_directory' (widened once already,
-- 2026-09-22, for the same honesty reason). None of those honestly describe
-- "found via direct Instagram/Facebook research, not from the DOI
-- directory." This file widens the constraint again to add a 5th value,
-- 'social_research', rather than mistagging these as 'doi_directory' (which
-- they aren't) or 'user_submitted' (nobody submitted these — I found them).
-- If you'd rather use a different label, change the ALTER and the 3 INSERT
-- rows' `source` value together before running.
--
-- COORDINATES — real, sourced, not estimated:
--   McCall: 44.88861, -116.10167 — McCall Municipal Airport (the smokejumper
--     base sits on the airport grounds), via Wikipedia.
--   Missoula: 46.924923, -114.092890 — the Aerial Fire Depot itself (a named
--     USFS locale), via a USGS-sourced place record (TopoQuest).
--   North Cascades: 48.429590, -120.145638 — the North Cascade Smokejumper
--     Base itself (a named USGS place), via the same source type.
-- `latitude`/`longitude` are NOT NULL on this table, and the existing
-- `crews_set_region` trigger will auto-compute each row's `region` on
-- insert — no need to set it manually, but worth confirming it filled in
-- after running (see verify query).
--
-- OPTIONAL — run this first if you want extra certainty beyond the above:
-- select id, crew_name, town, state, forest, district, resource
-- from crews
-- where town ilike '%mccall%' or town ilike '%missoula%' or town ilike '%winthrop%'
-- order by id;
-- (expect: the McCall/Missoula rows already known above, nothing at Winthrop)
--
-- ----------------------------------------------------------------------------
-- WIDEN THE source CHECK CONSTRAINT
-- ----------------------------------------------------------------------------
alter table crews drop constraint if exists crews_source_check;
alter table crews add constraint crews_source_check
  check (source in ('usfs_official', 'handcrew_atlas', 'user_submitted', 'doi_directory', 'social_research'));

-- ----------------------------------------------------------------------------
-- INSERT
-- ----------------------------------------------------------------------------
insert into crews (
  crew_name, town, state, forest, district, resource, agency, source,
  latitude, longitude, instagram_url, facebook_url
) values
  (
    'McCall Smokejumpers', 'MCCALL', 'IDAHO',
    'PAYETTE NATIONAL FOREST', 'MCCALL RANGER DISTRICT',
    'Smokejumper', 'usfs', 'social_research',
    44.88861, -116.10167,
    'https://www.instagram.com/mccallsmokejumpers/',
    'https://www.facebook.com/p/McCall-Smokejumper-Base-100069398910586/'
  ),
  (
    'Missoula Smokejumpers', 'MISSOULA', 'MONTANA',
    'LOLO NATIONAL FOREST', 'MISSOULA RANGER DISTRICT',
    'Smokejumper', 'usfs', 'social_research',
    46.924923, -114.092890,
    'https://www.instagram.com/missoulasmokejumpers/',
    null
  ),
  (
    'North Cascades Smokejumpers', 'WINTHROP', 'WASHINGTON',
    'OKANOGAN-WENATCHEE NATIONAL FOREST', 'METHOW VALLEY RANGER DISTRICT',
    'Smokejumper', 'usfs', 'social_research',
    48.429590, -120.145638,
    'https://www.instagram.com/northwesternsmokejumpers/',
    null
  );

-- ----------------------------------------------------------------------------
-- CHECK IT WORKED
-- ----------------------------------------------------------------------------
select id, crew_name, town, state, forest, latitude, longitude, region,
       instagram_url, facebook_url, source
from crews
where crew_name in ('McCall Smokejumpers', 'Missoula Smokejumpers', 'North Cascades Smokejumpers')
order by id;
-- expect: 3 new rows, each with a non-null `region` (auto-filled by the
-- existing trigger), the coordinates above, and the instagram_url (and for
-- McCall only, facebook_url) set as shown.

-- UNDO, if anything looks wrong:
--   delete from crews
--   where crew_name in ('McCall Smokejumpers', 'Missoula Smokejumpers', 'North Cascades Smokejumpers');
-- (leaves the widened source constraint in place, which is harmless either way)
