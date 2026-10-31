# DOI Fire Contacts (firejobs.doi.gov) — Part A Review

*Prepared 2026-09-19. Companion file: `doi_contact_matches_2026-09-19.csv` (the apply-ready rows). This doc explains methodology, lists what didn't make the CSV and why, and flags leads for crews not yet in the database.*

## Scope (per your instruction)

Part A only: contacts for crews **already in the `crews` table**, added only when there's a definite or confidently-researched connection. Generic HR/admin contacts, multi-state "Human Resources" reps (Julia Roach, Tanea Ware, etc.), and the blanket "NPS Spark Team" hiring-inbox line were treated as out of scope (Part C) and excluded entirely — they appear on nearly every state's page and aren't crew-specific.

Source: all 50 states pulled from `firejobs.doi.gov/contacts/{STATE}?agency=All&state={STATE}`, Sept 2026. Cross-referenced against a live read of your `crews` table (via the public anon key the site itself uses — read-only, same access any visitor's browser has) filtered to `agency in (bia, blm, nps, fws)`, which is 76 crews total. **16 of those 76 already have contact info** from the earlier hotshot-crew backfill (all IHCs) — those were skipped. That left **60 crews with no contact info**, which is what this pass worked against.

## What's in the CSV (27 rows — corrected count; an earlier version of this doc miscounted this as 25)

- **9 DEFINITE** — the DOI listing's role/title field explicitly names the crew (e.g. "Unaweep WFM Supt.", "Veteran Crew Superintendent" at Billings).
- **13 RESEARCHED-CONFIDENT** — no explicit crew name, but duty station + role + agency triangulate to one specific crew with good confidence (e.g. a "Fire Ecologist" at a park that has a "Fire Effects" crew record, a "Module Lead" at the park a WFM crew is tied to).
- **5 WEAK** — included because they're the only plausible candidate, but genuinely uncertain (no job title given, a park-level role standing in for a crew-specific one, or a dual-candidate case at Medford, OR). You've reviewed and approved all five as-is.

That leaves **35 of the 60 contact-less crews with no match** — mostly "Fire Effects" monitoring crews and a handful of WFM/Handcrew crews where the DOI directory simply doesn't list anyone with a title specific enough to point at that exact crew (only a park-level FMO/AFMO, or nothing at that park at all). Better to leave these blank than guess.

## Possible new crews (not in your `crews` table at all)

These are real, named crews I found in the DOI directory with no matching record in the database. Not auto-inserted — flagging per your standing convention so you can decide whether to add them:

- **Salt Lake Helitack** (BLM, Salt Lake City, UT) — Austin Blackett, Helitack Supt., 801-320-8330, austin.blackett@blm.gov. Confirmed as a real, separately-named crew via BLM's own blog and Instagram (@saltlakehelitack) — distinct from Bonneville Hotshots, which is also Salt Lake-based and already in your DB.
- **Rawlins Helitack** (BLM, Rawlins, WY) — Zach Hartshorn, Helicopter Superintendent, 307-328-7106. Confirmed via Instagram (@rawlinshelitack).
- **Moab-area BLM Helitack** (UT) — Tyler Maine, Helitack Supt., 435-259-1869. Real module, exact official crew name unconfirmed.
- **Eagle Lake / Ravendale BLM Helitack ("H553")** (CA) — Grant Gifford, Helitack Crew Supervisor, 530-252-5301.
- **A Sequoia & Kings Canyon NP hotshot and/or helitack crew** (CA) — Larissa Perez (Helitack) and Nick Chavira ("Hotshot Info"), both at Three Rivers, CA. The "Hotshot Info" title suggests SEKI runs its own IHC, currently unlisted.
- **Indiana Dunes NP engine crew** (Porter, IN) — Joe James, Engine Captain, 219-395-8139. Lowest-confidence of this group — minimal info, may not warrant its own record.

## Worth a quick sanity check (not new rows — your existing data)

- **Snake River IHC** (id 248, Pocatello, ID) — this is the Kenneth Bochniak / "Hotshot Superintendent" crew from the Idaho DOI data. An earlier version of this doc flagged it as a possible new/missing crew; that was wrong — it's already in the database (contact already correctly stored) via the original fs.usda.gov hotshot backfill, on Caribou-Targhee NF. It's currently tagged `agency='usfs'`, but the DOI directory lists this contact under BLM, and you confirmed firsthand it's a BLM crew. Optional agency correction (`usfs` → `blm` for id 248) included as its own step at the top of `doi_contacts_apply_2026-09-19.sql`, separate from the 27-row contact batch.
- **Bonneville IHC** (id 554, already has a contact) — the DOI directory currently lists Erik Fusselman as "IHC Supt." in Salt Lake City. If that's a different name than what's stored, leadership may have changed since the original fs.usda.gov pull.
- **Aravaipa Veterans IHC** and **Jackson IHC** both showed up again in the DOI data (Greg N. Smith / Daniel Stone) consistent with what's already stored — good cross-confirmation, no action needed.

## States with nothing usable

AL, CT, DE, NH, OH, RI, VT returned no contacts at all on the DOI site. AR, IL, IA, KS, KY, LA, ME, MD, MA, NJ returned contacts but none tied to any crew in your `crews` table (mostly FWS refuge fire contacts with no corresponding crew record, or NPS Spark Team only).

## Data quality note

A handful of email addresses on the source pages (mainly in the Alaska and Idaho NIFC listings) render as an obfuscated placeholder rather than the real address — those are left blank in the CSV rather than filled with a fake value.
