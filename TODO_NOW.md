# TODO_NOW — near-term, actively worked

Immediate next steps only. See `ARCHITECTURE.md` for the plan and
`TODO_LATER.md` for the deferred backlog.

## Phase 0 (data ready) — ✅ DONE
- [x] Switch `geocode.py` to Nominatim (free, town-level, no key)
- [x] Run geocoding → `crews_with_coords.json`
- [x] Fix the 3 towns that failed (town-name spacing typos):
  - [x] `CAVECREEK` → `CAVE CREEK, ARIZONA` (Tonto NF)
  - [x] `BRIDGERVILLE` → `BRIDGEVILLE, CALIFORNIA` (Six Rivers NF, Mad River)
  - [x] `TROUTLAKE` → `TROUT LAKE, WASHINGTON` (Gifford Pinchot NF)
- [x] Confirm 440/440 have non-null lat/lng (`still_missing.csv` empty)

## Phase 1 (the product — map is the landing page) — ✅ map + filters done
- [x] Create a Supabase project (free tier)
- [x] Create a `crews` table (schema.sql) + grant anon read (fixes 42501)
- [x] Import all 440 crews into the `crews` table
- [x] Scaffold the Next.js app (deployable to Vercel)
- [x] Render a Leaflet + OSM map; the map is the landing page (no homepage/login)
- [x] Load crews from Supabase (public anon key) and show all as pins — 440 live
- [x] Filter controls (state, region, crew type, housing) that narrow pins in
      real time, no reload

## Phase 1 — CORE ✅ COMPLETE
- [x] Detail popup on pin click: crew name, forest, town/state,
      crew type, region, housing, website link (when present)
- [x] **Verify mobile usability** — verified 2026-07-25. Filter drawer
      opens/closes, the crew count stays visible when the drawer is closed, the
      legend collapses/expands, tap targets are finger-sized, and there is no
      horizontal overflow. Popup width confirmed at a true 390px (iPhone) after
      the `min-width` fix below. **Phase 1 is now fully done.**
- [x] Deploy to Vercel (live at https://crew-map-five.vercel.app)
      (note: popup shows the user-requested fields; `notes` was not included —
      add later if wanted)

## Phase 2.5 — "Currently hiring" jobs layer (ICING) — ✅ DONE
Owner-directed. Backend + map layer both shipped and verified. See
ARCHITECTURE.md for the decisions.
- [x] **Step 1 — Schema:** `jobs_schema.sql` — `jobs` table (composite upsert key
      `announcement_number,town,state`), public-read RLS + explicit grants
      (`select` to anon/authenticated, `all` to service_role — the 403 fix).
- [x] **Step 2 — Refresh script:** `refresh_jobs.py` — pull 0456+0462, drop
      >8-location noise, expand to town duty-stations, geocode (reuse
      `job_geocache.json`), upsert into `jobs` via the key (local-only), and
      clear postings that have closed. Re-runnable; won't wipe on a bad pull.
- [x] **Step 3 — Run + verify:** ran locally, `jobs` table populated (32 rows,
      good lat/lng + apply URLs). Migrated off the leaked legacy service_role key
      to the new `sb_secret_` key (scripts already handled both formats).
- [x] **Map layer:** browser-side proximity match (haversine, 50-mi radius);
      amber ring on hiring pins in BOTH modes; "hiring nearby" filter toggle;
      popup lists nearby postings (≤5, closest first) with Apply-on-USAJOBS
      links; "updated {date}" freshness label + empty states.
      Verified: 90/440 crews light up; Redding/Flagstaff/Bishop ringed.

## Panel UI: layers refactor + fixes — ✅ DONE
- [x] Reorganized the control panel into collapsible **layer sections**
      (reusable `LayerSection`): **Crews** = always-on base layer; **Hiring** =
      toggleable overlay. Map stays the landing page (no tabs/pages). A future
      layer (e.g. Housing) is a clean add. See ARCHITECTURE.md decision.
- [x] Fixed multi-select dropdown layout: checkbox + label now inline on one
      left-aligned, fully-clickable row (out-specified the panel's stacked-label
      rule); regular weight; tighter spacing.
- [x] State filter labels now display title-case ("California") while filtering
      still uses the uppercase value.

## Deploy + key migration — ✅ DONE
- [x] Deployed to Vercel — **live at https://crew-map-five.vercel.app**
- [x] Key migration complete: app runs on the new `sb_publishable_` key
      (`NEXT_PUBLIC_SUPABASE_ANON_KEY`); the old legacy keys are disabled.

## Phase 2.6 — Handcrew Atlas merge — ✅ DONE (verified in Supabase)
Permission to USE the Atlas data is secured. The source KMZ is still NOT
republished — it, the review CSVs, and `state_geocache.json` /
`atlas_import_backup.json` all stay gitignored. See MERGE_PLAN.md for the plan.
- [x] **Schema:** `atlas_schema.sql` — additive + idempotent. Adds `crew_name`,
      `photo_url`, and `source` to `crews`; backfills `source='usfs_official'`;
      makes it NOT NULL with a default and a check constraint allowing
      `usfs_official` / `handcrew_atlas` / `user_submitted` (so Phase 3 community
      rows need no further migration). Grants + a `source` index for rollback.
- [x] **Import:** `atlas_import.py` — folds the 527-placemark KMZ in by proximity
      (≤5 mi) + forest-name confirmation. Dry-run by default, `--commit` writes,
      `--rollback` undoes; snapshots pre-merge state to `atlas_import_backup.json`.
- [x] **Ran + verified: `crews` is now 829 rows.**
      - 440 curated rows unchanged, still `source='usfs_official'`
      - 138 of them **enriched** with an Atlas crew name (+ photo/website where
        the Atlas had one). Website = Atlas link OR keep ours (never blanked);
        `resource` / `state` fill ONLY when ours was blank — curated values are
        never overwritten.
      - 389 **new** rows tagged `source='handcrew_atlas'` (crews only the Atlas
        has, incl. non-USFS TNC/NPS/BLM/BIA/state). Region/district/town/housing
        left NULL — the Atlas doesn't have them; those pins still show.
      - **Crew type extracted from crew names** into our exact labels, plus two
        NEW labels: **Suppression Module** and **Fire Effects**.
      - **State reverse-geocoded** from coordinates (cached, `state_geocache.json`).
- [x] Committed `atlas_schema.sql`, `atlas_import.py`, and the `.gitignore`
      additions; confirmed no third-party data or caches were committed.

## Atlas follow-ups — ✅ DONE (UI has caught up with the merge)
- [x] **Crew names + photos in the popup.** `CrewPopup.js` now titles each popup
      with `crew_name`, falling back to district → forest → "Unnamed crew".
      `photo_url` renders as a bounded image that hides itself if it fails to
      load. **Known issue:** the Google My Maps photo URLs currently 404 (all
      114 of them) — see TODO_LATER.
- [x] **"Suppression Module" + "Fire Effects" added to the crew-type filter**,
      each with its own SVG glyph and color in `lib/crewTypes.js` + the legend
      (deep-teal droplet / olive magnifier). Colors were chosen by measuring
      CIELAB deltaE against both palettes so nothing clashes across modes.

## Phase 2.7 — Atlas region backfill — ✅ DONE (written + verified)
Filled `region` for Atlas crews by matching their forest to our curated data,
plus an explicit table for forests we hold no curated crew for.
- [x] **`region_backfill_dryrun.py`** — the matcher, read-only, no write path at
      all. Normalization started from `atlas_import.py` and was tuned (see the
      note in the file): `national`/`forest`/`district` added as stopwords and
      `mount`→`mt`, because the curated data mixes "GILA NF" with "PAYETTE
      NATIONAL FOREST" and the mismatch was scoring correct pairs at 0.50.
      Adds a hard non-USFS gate (BLM/NPS/BIA/TNC/state/county) and a
      "distinctive token" rule so generic words like "river" can't carry a
      match. Has a REGRESSION CHECK block naming the specific rows that were
      previously wrong — keep it passing.
- [x] **`region_backfill_commit.py`** — dry-run by default, `--commit` writes,
      `--rollback` undoes; snapshots to `region_backfill_backup.json` (gitignored)
      before the first write. Imports the matcher rather than copying it.
- [x] **Ran + verified in Supabase: 85 of 389 assigned.**
      R5 36 · R8 10 · R3 9 · R2 8 · R6 8 · R4 6 · R1 4 · R9 2 · R10 2.
      Zero false positives. 304 correctly left NULL (113 non-USFS, 127 no forest
      name, 64 state/tribal/county).
- [x] **R8/R9/R10 added** to `lib/regions.js` with new colors; `Legend.js` is
      gated to regions that actually have crews, so they only appear now that
      data exists. (There is no Region 7 — the numbering really does skip.)
- [x] **CDATA / non-breaking-space cleanup** — same script, phase 2. Found **58**
      rows, not the 3 originally spotted: 3 with `<![CDATA[...]]>` wrappers and
      55 with non-breaking spaces (which block line-wrapping and widened
      popups). All 58 cleaned and verified; 3 were curated rows enriched by the
      Atlas, so the write is guarded by id, not by source.

**Coverage caveat:** the Atlas brought in a handful of R8/R9/R10 crews. That is
NOT real Eastern/Southern/Alaska coverage — see the "National coverage" item in
`TODO_LATER.md` before treating this map as nationwide.
