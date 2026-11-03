-- wfm_social_2026-11-03.sql — Instagram/Facebook for the Wildland Fire Module
-- (WFM) research bucket (crew-map-handoff.md, section 7). Run AFTER
-- instagram_facebook_migration_2026-11-03.sql, and independent of the
-- Smokejumper/Rappel/Helitack files (no overlapping ids).
--
-- SCOPE NOTE: `resource ilike '%WFM%'` returns exactly 114 rows. Of those,
-- 4 are primarily Hotshot crews with WFM listed as a secondary capability,
-- confirmed via the `resource` field containing "Hotshot Crew" (id 25,
-- unnamed, Bigfork MT; id 54 Lolo IHC; id 288 Salmon River IHC; id 416
-- Prineville IHC) — already covered by the 2026-10-02 Hotshot research and
-- intentionally OUT OF SCOPE here. That leaves 110 rows in scope.
--
-- This is the largest and most heterogeneous bucket researched so far (83
-- named crews + 27 unnamed rows, spread across every region of the country,
-- including several Nature Conservancy-run prescribed-fire modules that
-- carry the WFM tag). Given the scale, this pass prioritized the named rows
-- (far more searchable than town+forest hub searches) and is NOT
-- exhaustive — see the "NOT YET RESEARCHED" section below for what a future
-- pass should pick up.
--
-- CONFIRMED (directly opened and verified) — 12 rows:
--   id 545, Lucky Peak WFM, Idaho — Instagram @lucky_peak_wfm, 1,527
--     followers, bio "Backcountry Specialists | Boise NF | Boise, ID" —
--     exact match.
--   id 478, Skyway WFM, Colorado — Instagram @skyway_wfm, 1,292 followers,
--     bio "Grand Mesa, Uncompahgre, Gunnison National Forest | Grand
--     Junction, Colorado" — exact match.
--   id 542, Hells Canyon WFM, Idaho — Instagram @hellscanyonwfm, 2,041
--     followers, bio "Hells Canyon Wildland Fire Module | Payette National
--     Forest | Council, ID" — exact match.
--   id 728, Devils Staircase WFM, Oregon — Instagram @devilsstaircasewfm,
--     1,422 followers, bio "Type 2 WFM - Siuslaw NF - Hebo, OR" — exact
--     match.
--   id 512, Saguaro WFM, Arizona — Facebook "Saguaro Wildland Fire Module":
--     817 followers, active posts (USAJOBS hiring announcements), links to
--     wildlandfiremodules.info — exact match.
--   id 467, Black Hills WFM, South Dakota — Facebook "Black Hills Wildland
--     Fire Module": 3.6K followers, active posts (fire-assignment travel
--     updates) — exact match.
--   id 503, Tava Module, Colorado — Instagram @tava_dfpc ("DFPC Tava
--     Module"), 1,195 followers, bio "Wildland fire suppression module
--     under the Colorado Division of Fire Prevention & Control. Based in
--     Colorado Springs..." — exact match. (This is the account that
--     revealed Colorado DFPC's modules commonly use a "<name>_dfpc" IG
--     handle convention — but that pattern did NOT hold for the other 6
--     DFPC-affiliated "Module" rows searched this pass; see below.)
--   id 543, Kings Peak WFM, Utah — Facebook "Kings Peak WFM: USDA Forest
--     Service": 48 followers, 0 visible posts, but a substantive, specific
--     Intro ("Kings Peak is a Forest Service Wildland Fire Module based out
--     of Duchesne, Utah from the Duchesne R[anger District]"), address (85 W
--     Main St, Duchesne, UT), phone, and crew-specific email
--     (kings.peak.wfm@gmail.com) — low-activity but genuinely crew-run, not
--     a placeholder (contrast the Malheur Rappel Crew false-positive logged
--     in the Rappel bucket, which had zero content of any kind).
--   id 547, Snowslide WFM, Idaho — Instagram @snowslide_wfm, 1,658
--     followers, bio "Recruiting and Promotional page for Snowslide. A Type
--     1 Wildland Fire Module based out of McCall, ID." — exact match.
--   id 638, Mammoth WFM, California — Instagram @mammoth_wfm_unofficial
--     ("Mammoth Wildland Fire Module"), 1,130 followers, active posts
--     (USAJOBS hiring, "Night Ops", "RX") — the "_unofficial" in the handle
--     is this crew's own informal-account naming convention (same pattern as
--     Snowslide's "Recruiting and Promotional page" framing), not a
--     fan/parody account — treated as genuinely crew-run.
--   id 729, Eagle Cap WFM, Oregon — Instagram @eaglecapwfm, 1,510
--     followers, bio "Wildland Fire Module on the Wallowa Whitman National
--     Forest" — exact match.
--   id 313, unnamed row (town MACDOEL, state CALIFORNIA) — Facebook "Mt.
--     Hebron Wildland Fire Module": 1.3K followers, location tag "Macdoel
--     CA" — exact town match; this crew's informal/working name is "Mt.
--     Hebron," not reflected in the DB's crew_name field (NULL).
--
-- NOT updated here, and why:
--   id 492, Platte Canyon WFM, Colorado — an earlier pass in this same
--     research session noted this as confirmed, but a direct re-search just
--     now found no dedicated Platte Canyon WFM account (only an unrelated
--     Platte Canyon Fire Protection District / Chamber / school district /
--     plumbing company). Rather than guess which finding was right, this is
--     left blank out of caution — worth a second look in a future pass.
--   id 428 / id 733 — BOTH named "Metolius WFM," both state OREGON, no town
--     set on either. These look like a duplicate pair for the same crew
--     (Metolius WFM, Sisters/Camp Sherman area, Deschutes NF) rather than
--     two distinct modules — flagging for the owner to check, not something
--     to resolve by guessing which id is "correct." No account was found
--     for either id regardless.
--   Southern Rockies Wildland Fire Module (Facebook, 257 followers) kept
--     surfacing in searches for several Colorado rows (Columbine WFM id 471,
--     Unaweep WFM id 480, White River WFM id 481, Burning Mountain WFM id
--     493) but its own name doesn't match any of those (or any other) named
--     row in the DB — logged as a 📦 NEW-CREW LEAD (see below), not attached
--     to any of those four ids.
--   Named rows searched directly, no dedicated account found (52 rows):
--     id 31 Lewis and Clark WFM (Augusta, MT), id 44 Kaniksu WFM (Sandpoint,
--     ID), id 83 Silver Thread WFM (Del Norte, CO), id 121 Storm Peak WFM
--     (Steamboat Springs, CO), id 156 Apache Kid WFM (Magdalena, NM), id 167
--     Escondido HC (Quemado, NM), id 228 Fremont River WFM (Loa, UT), id 368
--     Bly Crew 21 (Bly, OR), id 444 Selway WFM, id 445 Spotted Bear WFM, id
--     446 St. Joe WFM, id 447 Woodhawk WFM, id 448 Yellowstone WFM (WY —
--     only a general NPS "Wildland Fire Modules" umbrella video found, not
--     Yellowstone-specific), id 468 Black Tooth WFM (WY), id 471 Columbine
--     WFM (CO), id 472 Crow Peak WFM (SD), id 474 Pilot Peak WFM (WY), id
--     480 Unaweep WFM (CO), id 481 White River WFM (CO), id 490 Elk Creek
--     WFM (CO), id 493 Burning Mountain WFM (CO), id 496 Grizzly Peak
--     Module, id 497 James Peak Module, id 499 Mad Creek Module, id 500
--     Overland Module, id 501 Shadow Mountain Module, id 502 Steel City
--     Module (all 6 Colorado "Module"/DFPC-affiliated — the "<name>_dfpc"
--     handle guess was tried and failed for Grizzly Peak and abandoned as
--     unreliable; proper searches for all 6 found nothing crew-specific),
--     id 509 Bandelier WFM (NM), id 511 Rio Puerco WFM (NM), id 513 San
--     Carlos WFM (AZ), id 538 Arc Dome Interagency WFM (NV), id 539 Black
--     Canyon WFM (NV), id 540 Cascade WFM (ID), id 541 Flaming Gorge WFM
--     (UT), id 544 Krassel Crew 6 (McCall, ID), id 546 Ramshorn WFM (ID), id
--     548 Teton WFM (WY), id 549 Tushar Mountain WFM (UT), id 583 Almanor
--     WFM (CA), id 586 Eagle Lake WFM (CA), id 587 Grass Lake WFM (CA), id
--     588 Kilauea WFM (HI), id 591 Six Rivers WFM (CA), id 593 Redwood WFM
--     (CA), id 594 Whiskeytown WFM (CA), id 595 Lassen WFM (CA), id 637
--     Kaweah WFM (CA), id 639 Summit WFM (CA), id 641 Yosemite WFM (CA), id
--     725 Cabin Lake WFM (OR), id 727 Crater Lake WFM (OR), id 731 Galice
--     WFM (OR), id 733/428 Metolius WFM (OR, duplicate pair, see above), id
--     734 Olympic WFM (WA), id 736 Snow Creek WFM (OR), id 744 Warm Springs
--     WFM (OR), id 780 Balcones WFM (TX), id 781 Buffalo River WFM (AR —
--     only the National Park Service's own Buffalo National River page
--     posting ABOUT this module found, not a dedicated module account), id
--     785 Great Smoky WFM (TN — only the park's general NPS account found),
--     id 802 Great Lakes WFM (MI), id 811 Eastern Alaska Fire Management
--     WFM, id 812 Kenai WFM (AK), id 821 Denali WFM (AK).
--
-- NOT YET RESEARCHED (left for a future pass — scope boundary of this
-- session, not a "no account exists" finding):
--   id 70 Columbine Fuels (Bayfield, CO), id 77 SHF NZ Fuels (Cody, WY) —
--     these are Fuels-crew-flavored rows tagged WFM; not yet searched.
--   6 Nature Conservancy prescribed-fire modules, tagged WFM but
--     functionally different from operational suppression WFMs: id 461 TNC
--     North Dakota Rx Mod, id 462 TNC North Idaho Rx Module, id 778 TNC
--     Oregon Rx Module, id 799 TNC North America Fire's Prescribed Fire
--     Module, id 808 TNC Fire in the Forest Rx Mod, id 809 TNC Northwoods Rx
--     Mod — worth a quick check of The Nature Conservancy's own org-level
--     social for these rather than per-module accounts, in a future pass.
--   25 of the 27 unnamed WFM rows (the ones not matched to a named account
--     above) — ids 30, 40, 61, 62, 63, 72, 93, 113, 195, 196, 200, 201, 204,
--     207, 215, 232, 233, 235, 238, 316, 328, 367, 371, 390, 399 — a
--     systematic town + national-forest/district hub search (the method
--     used successfully for the Helitack bucket's unnamed rows) has not yet
--     been run on these.
--
-- 📦 NEW-CREW LEAD (confirmed account, no existing `crews` row to attach it
-- to — same pattern as the Smokejumper/Helitack buckets' leads; logged in
-- the project doc, NOT inserted here):
--   Southern Rockies Wildland Fire Module (Facebook, 257 followers) — kept
--     surfacing for several Colorado WFM searches (Columbine, Unaweep,
--     White River, Burning Mountain) but doesn't specifically match any one
--     of those rows' names or towns.
--
-- ----------------------------------------------------------------------------
-- DRY RUN — review before running the UPDATE below
-- ----------------------------------------------------------------------------
select id, crew_name, town, state, forest, district, resource,
       instagram_url, facebook_url
from crews
where id in (545, 478, 542, 728, 512, 467, 503, 543, 547, 638, 729, 313)
order by id;
-- expect: all 12 rows' instagram_url and facebook_url both NULL (not yet set).

-- ----------------------------------------------------------------------------
-- UPDATE
-- ----------------------------------------------------------------------------
update crews set instagram_url = 'https://www.instagram.com/lucky_peak_wfm/'
where id = 545;

update crews set instagram_url = 'https://www.instagram.com/skyway_wfm/'
where id = 478;

update crews set instagram_url = 'https://www.instagram.com/hellscanyonwfm/'
where id = 542;

update crews set instagram_url = 'https://www.instagram.com/devilsstaircasewfm/'
where id = 728;

update crews set facebook_url = 'https://www.facebook.com/SaguaroWFM/'
where id = 512;

update crews set facebook_url = 'https://www.facebook.com/BlackHillsWFM/'
where id = 467;

update crews set instagram_url = 'https://www.instagram.com/tava_dfpc/'
where id = 503;

update crews set facebook_url = 'https://www.facebook.com/people/Kings-Peak-WFM-USDA-Forest-Service/100068911507273/'
where id = 543;

update crews set instagram_url = 'https://www.instagram.com/snowslide_wfm/'
where id = 547;

update crews set instagram_url = 'https://www.instagram.com/mammoth_wfm_unofficial/'
where id = 638;

update crews set instagram_url = 'https://www.instagram.com/eaglecapwfm/'
where id = 729;

update crews set facebook_url = 'https://www.facebook.com/MtHebronWFM/'
where id = 313;

-- ----------------------------------------------------------------------------
-- CHECK IT WORKED
-- ----------------------------------------------------------------------------
select id, crew_name, town, instagram_url, facebook_url
from crews
where id in (545, 478, 542, 728, 512, 467, 503, 543, 547, 638, 729, 313)
order by id;
-- expect: id 545, 478, 542, 728, 503, 547, 638, 729 have instagram_url set,
--         facebook_url NULL; id 512, 467, 543, 313 have facebook_url set,
--         instagram_url NULL.

-- UNDO, if anything looks wrong:
--   update crews set instagram_url = null
--     where id in (545, 478, 542, 728, 503, 547, 638, 729);
--   update crews set facebook_url = null
--     where id in (512, 467, 543, 313);
