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

## Phase 1 — remaining to finish CORE
- [x] Detail popup on pin click: crew name (district), forest, town/state,
      crew type, region, housing, website link (when present)
- [ ] Verify mobile usability (map + filter panel + popup on a phone screen)
- [ ] Deploy to Vercel
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

## Next up
Phase 1 CORE first, then the two Atlas follow-ups.

- [ ] **Verify mobile usability** (map + filter panel + popup on a phone screen)
      — the last Phase 1 CORE item, still open.

### Atlas follow-ups (the merge landed in the DB; the UI hasn't caught up)
- [ ] **Wire crew names + photos into the popup.** `crews` now has `crew_name`
      and `photo_url`, but `components/CrewPopup.js` still titles each popup with
      the ranger district — and its opening comment ("this dataset has no
      dedicated crew name field") is now out of date. Use `crew_name` when
      present, fall back to district → forest, and decide how/whether to display
      `photo_url`. Heads-up: those photo URLs are Google My Maps-hosted and may
      not be hotlink-stable long term.
- [ ] **Add "Suppression Module" + "Fire Effects" to the crew-type filter.** The
      import writes both labels, but the curated `CREW_TYPES` list in
      `components/CrewMap.js` doesn't include them, so those crews can't be
      filtered for. Also decide whether each needs a symbol in `lib/crewTypes.js`
      + the legend, or should fall through to "Other."
