-- helitack_social_2026-11-03.sql — Instagram/Facebook for the Helitack
-- research bucket (crew-map-handoff.md, section 7). Run AFTER
-- instagram_facebook_migration_2026-11-03.sql, and independent of the
-- Smokejumper/Rappel files (no overlapping ids).
--
-- SCOPE NOTE: `resource ilike '%helitack%'` returns exactly 35 rows, matching
-- expectations going in. Of those 35, 10 are primarily Hotshot crews with
-- Helitack listed as a secondary capability (Idaho Panhandle IHC id 42, Lolo
-- IHC id 54, Pike IHC id 107, North Peak IA id 163, Prescott Crew 2 id 166,
-- a Carson City NV hotshot crew id 195, an Emmett ID hotshot crew id 208,
-- Snake River IHC id 248, Iron Mountain HC id 337, Plumas IHC id 339) —
-- these are already covered by the 2026-10-02 Hotshot research and are
-- intentionally OUT OF SCOPE here, same convention as the Rappel bucket's
-- Lolo/Salmon River/Prineville exclusions. That leaves 25 rows researched
-- here.
--
-- CONFIRMED (directly opened and verified) — 3 rows:
--   id 60, Grangeville, ID (Nez Perce-Clearwater NF / Grangeville Air
--     Center) — Facebook "Grangeville Helitack": 3.9K followers, intro
--     "Region 1 Helitack crew. Type III helicopter based on the Nez
--     Perce-Clearwater National Forest." — exact match. (Note: this is the
--     same row already researched for Smokejumper — its resource field
--     says "Smokejumper, Helitack" — no Smokejumper-specific social was
--     found there, but this Helitack-specific account is real and separate.)
--   id 155, Los Alamos, NM (Santa Fe NF / Interagency Fire Center) —
--     Facebook "Santa Fe Helitack": 4.1K followers, active posts (a recent
--     one about fall 2026 hiring), location tag "Los Alamos NM" — exact
--     match.
--   id 861, Rawlins, WY ("High Desert Helitack" is the crew's formal DB
--     name; its own Instagram uses the informal geographic name) —
--     Instagram @rawlinshelitack, 1,354 followers, bio "High Desert
--     Helitack is based out of Rawlins Wyo." — exact match, confirms the
--     2026-09-22 session's note that "Rawlins Helitack" was just the
--     informal label for this same real crew.
--
-- NOT updated here, and why — no dedicated account found despite a
-- thorough search (named/branded rows first, then town+forest hub searches
-- for the unnamed rows):
--   Named rows with no account found: id 187 (Williams Crew 7, Williams AZ),
--     id 294 (Happy Camp HC, Happy Camp CA), id 846 (Fishlake Helitack,
--     Richfield UT), id 847 (Yellowstone Helitack, Mammoth WY — only a
--     general NPS "Wildland Fire Helitack" IG and unrelated park social
--     found, nothing Yellowstone-specific), id 852 (Twin Falls Helitack,
--     Twin Falls ID), id 860 (Salt Lake Helitack, Salt Lake City UT), id 862
--     (Moab Helitack, Moab UT), id 863 (Ravendale Helitack Crew, Ravendale
--     CA — only BLM's own posted training videos found, not a crew-run
--     account), id 864 (SEKI Helitack, Three Rivers CA — the park's own
--     general NPS account dominates search, no helitack-specific one).
--   Unnamed rows, searched by town + national forest/district: id 7 (Wise
--     River/Wisdom RD, Beaverhead-Deerlodge NF, MT), id 9 (Hamilton,
--     Bitterroot NF, MT), id 113 (Rifle, White River NF, CO — found several
--     OTHER real Colorado helitack accounts, Northern Colorado/Flatiron/
--     Montrose, none specific to Rifle or White River NF), id 199 (Challis,
--     Salmon-Challis NF, ID — only the Forest's own post naming "the
--     Challis Helitack Module," not a dedicated account), id 220 (Jackson,
--     Bridger-Teton NF, WY), id 225 (Ketchum, Sawtooth NF, ID), id 233
--     (McCall, Payette NF/Krassel RD, ID), id 239 (Mountain Green, Uinta-
--     Wasatch-Cache NF, UT), id 257 (Swan Valley, Caribou-Targhee NF, ID),
--     id 279 (Chester, Lassen NF, CA), id 289 (Frazier Park, Los Padres NF,
--     CA), id 343 (Santa Barbara, Los Padres NF, CA), id 403 (Lakeview, OR —
--     found "Burns Helitack," a different real BLM Oregon crew in a
--     different town, not a match for this row).
--
-- 📦 NEW-CREW LEADS (confirmed accounts, no existing `crews` row to attach
-- them to — same pattern as the Smokejumper bucket's McCall/Missoula/North
-- Cascades leads; logged in the project doc, NOT inserted here):
--   Boise Helitack (Boise, ID, BLM) — Instagram @boise_helitack, 4,867
--     followers, bio "24-person firefighting crew based in Boise, ID."
--   Las Vegas Helitack (Las Vegas, NV, BLM) — Instagram @lasvegashelitack,
--     3,858 followers, bio "Initial Attack Helitack Crew based out of Las
--     Vegas, NV."
--   Unverified sightings only (found in search, not directly opened — same
--     "strong lead" tier, logged for completeness, not confirmed): Montrose
--     Helitack, Flatiron Helitack, and Northern Colorado Helitack (all CO),
--     Burns Helitack (OR).
--
-- ----------------------------------------------------------------------------
-- DRY RUN — review before running the UPDATE below
-- ----------------------------------------------------------------------------
select id, crew_name, town, state, forest, district, resource,
       instagram_url, facebook_url
from crews
where id in (60, 155, 861)
order by id;
-- expect: all 3 rows' instagram_url and facebook_url both NULL (not yet set).

-- ----------------------------------------------------------------------------
-- UPDATE
-- ----------------------------------------------------------------------------
update crews set facebook_url = 'https://www.facebook.com/Gvillehelitack/'
where id = 60;

update crews set facebook_url = 'https://www.facebook.com/p/Santa-Fe-Helitack-100064331036019/'
where id = 155;

update crews set instagram_url = 'https://www.instagram.com/rawlinshelitack/'
where id = 861;

-- ----------------------------------------------------------------------------
-- CHECK IT WORKED
-- ----------------------------------------------------------------------------
select id, town, forest, instagram_url, facebook_url
from crews
where id in (60, 155, 861)
order by id;
-- expect: id 60 and 155 have facebook_url set, instagram_url NULL;
--         id 861 has instagram_url set, facebook_url NULL.

-- UNDO, if anything looks wrong:
--   update crews set facebook_url = null where id in (60, 155);
--   update crews set instagram_url = null where id = 861;
