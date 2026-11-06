-- Remove the two empty hike rows: Crane Valley IHC and Kings River IHC.
-- 2026-11-06, owner decision.
--
-- WHY: each of these crews has one `hikes` row (ids 11 and 12) with no hike
-- name, no distance, no elevation and no .gpx track. They're
-- source='contact_reported' placeholders, i.e. "someone told us this crew has a
-- hike" and nothing more. On the Hikes map they made both crews show the blue
-- "known" pin, which promised more than we have. Once deleted, both pins turn
-- grey ("no hike on file"), which is the honest state.
--
-- Deliberately NOT touched: Feather River's empty "The Pulga" row (id 9). It
-- sits next to Feather River's real Head Dam track, so it doesn't change that
-- pin's color, and the owner chose to keep it.
--
-- SAFE TO DELETE: no table has a foreign key into `hikes`. The only reference
-- is hike_submissions.approved_hike_id, a plain number with no constraint;
-- step 1 checks it anyway so a reviewed submission isn't left pointing at a
-- deleted row.
--
-- HOW TO RUN (Supabase dashboard -> SQL Editor):
--   1. Run STEP 1 alone. Check you see exactly 2 hike rows (ids 11 and 12),
--      both with empty name/distance/elevation/path, for Crane Valley and
--      Kings River, and 0 rows in the second result.
--   2. Only if that matches, select STEP 2 (remove the leading "-- " from
--      its lines first) and run it. It should report "DELETE 2".

-- === STEP 1: preview (read-only) ============================================

select h.id, c.crew_name, h.hike_name, h.source,
       h.distance_miles, h.elevation_gain_ft, (h.path is not null) as has_track
from hikes h
join crews c on c.id = h.crew_id
where h.id in (11, 12);

-- Should return 0 rows: no approved submission points at these hikes.
select id, status, approved_hike_id
from hike_submissions
where approved_hike_id in (11, 12);

-- === STEP 2: delete (uncomment to run) ======================================
-- The extra conditions are a safety net: if either row has gained a name,
-- numbers or a track since 2026-11-06, it is NOT deleted, and you'll see
-- "DELETE 1" or "DELETE 0" instead of "DELETE 2".

-- delete from hikes
-- where id in (11, 12)
--   and crew_id in (324, 353)          -- Crane Valley IHC, Kings River IHC
--   and coalesce(trim(hike_name), '') = ''
--   and distance_miles is null
--   and elevation_gain_ft is null
--   and path is null;
