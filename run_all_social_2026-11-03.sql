-- ============================================================================
-- run_all_social_2026-11-03.sql — combined run of all 8 pending SQL files for
-- the Instagram/Facebook crew-social research, in dependency-safe order:
--   1. instagram_facebook_migration_2026-11-03.sql   (adds the columns)
--   2. smokejumper_social_2026-11-03.sql
--   3. rappel_social_2026-11-03.sql
--   4. helitack_social_2026-11-03.sql
--   5. wfm_social_2026-11-03.sql
--   6. hotshot_resource_bug_social_2026-11-03.sql
--   7. smokejumper_new_crews_2026-11-03.sql
--   8. helitack_new_crews_2026-11-03.sql
-- Each file's own header comments are kept below, so you can still see what
-- each piece does and why. Paste this whole thing into the Supabase SQL
-- editor once and run it top to bottom.
-- ============================================================================


-- ############################################################################
-- FILE: instagram_facebook_migration_2026-11-03.sql
-- ############################################################################
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


-- ############################################################################
-- FILE: smokejumper_social_2026-11-03.sql
-- ############################################################################
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


-- ############################################################################
-- FILE: rappel_social_2026-11-03.sql
-- ############################################################################
-- rappel_social_2026-11-03.sql — Instagram/Facebook for the Rappel research
-- bucket (crew-map-handoff.md, section 7). Run AFTER
-- instagram_facebook_migration_2026-11-03.sql (adds the two columns) and
-- AFTER smokejumper_social_2026-11-03.sql (the other pending file from this
-- same research pass).
--
-- SCOPE NOTE: unlike the Smokejumper bucket, this one's `resource` field
-- tagging is accurate — exactly 11 rows match `resource ilike '%rappel%'`,
-- matching the real-world count of national rappel-program crews that
-- overlap this DB. Of those 11, 3 are really Hotshot crews that just list
-- Rappel as a secondary capability (Lolo IHC id 54, Salmon River IHC id 288,
-- Prineville IHC id 416) — those are already covered by the Hotshot-crew
-- research (section 7, 🔍 RESEARCHED 2026-10-02) and are intentionally
-- OUT OF SCOPE here, not re-researched. That leaves 8 genuine
-- dedicated-rappel-base rows, cross-checked by town/forest against the
-- USFS National Rappel Program's own list of bases (found via a crew's own
-- "Links" page, malheurrappelcrew.com/links.html).
--
-- CONFIRMED (directly opened and verified) — 4 rows:
--   id 17, Bozeman, MT (Custer Gallatin NF / Bozeman RD) — Gallatin Rappel
--     Crew. Instagram: @gallatinrappelcrew, 5,631 followers, bio "Aerially
--     Inserted Firefighters | Bozeman, Montana" — exact match.
--   id 242, New Meadows, ID (Payette NF) — Price Valley Heli-Rappellers.
--     Instagram: @pricevalleyrappellers, 4,276 followers, bio "Aerially
--     delivered wildland firefighters / Based in New Meadows, ID" — exact
--     match.
--   id 390, Grants Pass, OR (Rogue River-Siskiyou NF) — Siskiyou Rappel
--     Crew. Facebook (business page, not personal profile): 1.9K followers,
--     intro "Based out of Grants Pass, OR - The Siskiyou Rappel Crew is a
--     Forest Service Rappel Crew...", address 657 Flaming Rd, Grants Pass,
--     OR — exact match. No Instagram found.
--   id 402, La Grande, OR (Wallowa-Whitman NF) — Grande Ronde Rappellers.
--     Facebook: @grrrappellers, 2.4K followers — exact town match. No
--     Instagram found.
--
-- NOT updated here, and why:
--   id 371 (Cave Junction, OR, Rogue River-Siskiyou NF / Wild Rivers RD) —
--     this is a SEPARATE row from id 390 above, on the same national
--     forest. The confirmed Siskiyou Rappel Crew Facebook page's address
--     (Grants Pass) matches id 390, not this row's town (Cave Junction).
--     Possibly a duplicate/satellite listing for the same program rather
--     than a second distinct crew — not something to guess at here. Left
--     blank; worth a look at whether 371 and 390 should really be one row.
--   id 240 (Mountain Home, ID, Boise NF) — candidate match against the
--     national base list's "Lucky Peak Rappel Crew – Boise, ID," but Boise
--     and Mountain Home are different towns on the same forest, so this is
--     not a confident match, and no account was found under either name.
--     The only account found near this name was Instagram
--     @lucky_peak_wfm ("Lucky Peak Wildland Fire Module") — a DIFFERENT
--     crew/module, not the rappel crew. Left blank.
--   id 250 (Salmon, ID, Salmon-Challis NF) — real base is "Salmon
--     Heli-Rappellers" per the national list, but no dedicated Instagram or
--     Facebook found after a thorough search (only Challis Helitack and
--     generic Forest Service channels mention it). Left blank.
--   id 398 (John Day, OR, Malheur NF — "Blue Mountain C-120"/Malheur Rappel
--     Crew) — a Facebook page titled "Malheur Rappel Crew" exists
--     (facebook.com/profile.php?id=352873202157029) but it is an
--     auto-generated "Unofficial Page" (Facebook's own label): 0 followers,
--     0 posts, no content, just a placeholder "Interest" page created
--     2018-12-19. This is NOT a real, crew-run account — do not use it.
--     The crew's own website (malheurrappelcrew.com) is already known
--     separately and is unaffected by this. Left blank.
--   id 416 (Prineville IHC, Ochoco NF) — primarily a Hotshot crew, out of
--     scope per the note above. Separately worth flagging: news coverage
--     refers to a distinct "Central Oregon Rappelers" module also based in
--     Prineville/Ochoco NF — possibly a second real entity sharing this
--     row's town/forest with no row of its own, same pattern as the id 422
--     Redmond conflation already flagged in the Smokejumper bucket. No
--     account found for it either way, so nothing to insert, but worth
--     keeping in mind if this row ever gets revisited.
--   id 54 (Lolo IHC) and id 288 (Salmon River IHC) — out of scope, see
--     above; both already have social-presence findings on file from the
--     2026-10-02 Hotshot-crew research.
--
-- ----------------------------------------------------------------------------
-- DRY RUN — review before running the UPDATE below
-- ----------------------------------------------------------------------------
select id, crew_name, town, state, forest, district, resource,
       instagram_url, facebook_url
from crews
where id in (17, 242, 390, 402)
order by id;
-- expect: all 4 rows resource = 'Rappel' (or containing it), instagram_url
-- and facebook_url both NULL (not yet set).

-- ----------------------------------------------------------------------------
-- UPDATE
-- ----------------------------------------------------------------------------
update crews set instagram_url = 'https://www.instagram.com/gallatinrappelcrew/'
where id = 17;

update crews set instagram_url = 'https://www.instagram.com/pricevalleyrappellers/'
where id = 242;

update crews set facebook_url = 'https://www.facebook.com/p/Siskiyou-Rappel-Crew-100036847646053/'
where id = 390;

update crews set facebook_url = 'https://www.facebook.com/grrrappellers/'
where id = 402;

-- ----------------------------------------------------------------------------
-- CHECK IT WORKED
-- ----------------------------------------------------------------------------
select id, town, forest, instagram_url, facebook_url
from crews
where id in (17, 242, 390, 402)
order by id;
-- expect: id 17 and 242 have instagram_url set, facebook_url NULL;
--         id 390 and 402 have facebook_url set, instagram_url NULL.

-- UNDO, if anything looks wrong:
--   update crews set instagram_url = null where id in (17, 242);
--   update crews set facebook_url = null where id in (390, 402);


-- ############################################################################
-- FILE: helitack_social_2026-11-03.sql
-- ############################################################################
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


-- ############################################################################
-- FILE: wfm_social_2026-11-03.sql
-- ############################################################################
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


-- ############################################################################
-- FILE: hotshot_resource_bug_social_2026-11-03.sql
-- ############################################################################
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


-- ############################################################################
-- FILE: smokejumper_new_crews_2026-11-03.sql
-- ############################################################################
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


-- ############################################################################
-- FILE: helitack_new_crews_2026-11-03.sql
-- ############################################################################
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

