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

## Next up (Phase 1 CORE still open)
- [ ] Verify mobile usability (map + filter panel + popup on a phone screen)
- [ ] Deploy to Vercel — swap in the new `sb_publishable_` key as
      `NEXT_PUBLIC_SUPABASE_ANON_KEY`, then disable the old legacy keys.
