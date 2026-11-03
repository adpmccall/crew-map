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
