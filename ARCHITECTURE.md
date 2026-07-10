# ARCHITECTURE.md — Crew Map

Single source of truth for the build. If this and the code/data disagree, fix
one of them on purpose. (CLAUDE.md = how to work; this file = what we're building.)

## Core goal (non-negotiable)

A **queryable website where wildland firefighters can search Forest Service fire
crews across the US and find that crew's info from this dataset.** Everything
else is icing.

**The intended experience — Phase 1 must deliver this alone:** a user opens the
site URL and is **immediately** shown an interactive US map. No homepage, no
splash screen, no login/signup wall. All crews appear as **pins**, and the
**filter controls (state, crew type, housing, region)** are visible and usable
on first load. Clicking a pin shows that crew's details. **The map IS the
landing page.**

Viewing and searching are **always login-free.** (Only future editing would ever
need an account — see Phase 3.)

## Stack (all free / $0 — keep it that way)

| Concern        | Tool                                   | Why |
|----------------|----------------------------------------|-----|
| Frontend       | **Next.js** (React) on **Vercel**      | Deploys to Vercel with zero config; free tier |
| Database + API | **Supabase** (Postgres + auto REST API)| Free Postgres; queryable API without writing a backend |
| Map            | **Leaflet** + **OpenStreetMap** tiles  | No API key, no signup, free |
| Geocoding      | **OpenStreetMap Nominatim** (build-time only) | Free, no key, town-level; same OSM project as our tiles |
| Jobs data      | **USAJOBS REST API** (build-time only)        | Official US federal jobs API; free with a self-registered key; pulled by a **local refresh script**, never by the app |

**Hard constraints:** stay at **$0** (no paid keys, no credit-card services — so
no Mapbox/Google Maps); keep the service count small (Vercel + Supabase + OSM is
the whole list); don't add a fourth service without raising it first.

**Note on USAJOBS:** it does **not** add a fourth runtime service. Like Nominatim,
it's a **build-time data source** — a local script (`refresh_jobs.py`) queries it
on our machine and writes rows into Supabase. The live app still talks only to
Supabase (data) + OSM (tiles). The USAJOBS key is free (no billing), so we stay
at $0.

## Key decisions and why

- **Map is the landing page.** No homepage or auth gate in Phase 1. The product
  is the map + filters on first load. This is the whole point, not a later polish.
- **Viewing is always login-free.** Search/view never requires an account; only
  editing (Phase 3) would.
- **Leaflet + OSM over Mapbox/Google Maps.** Those need API keys and billing;
  Leaflet + OSM tiles are free and key-free, which keeps us at $0.
- **Nominatim for geocoding** (not the US Census geocoder). The data only has
  `town` + `state`; the Census geocoder only resolves full street addresses and
  returned 0 matches for every town. Nominatim does town-level lookups, is free
  and key-free, and is the same OSM project that serves our map tiles — so it
  adds no new service. Geocoding runs **once at build time** (`geocode.py`), not
  in the live app.
- **Display before edit.** Ship a working read-only map first; defer all
  add/edit/account features (Phase 3).
- **Crew-type filter matches by "contains," case-insensitively.** `resource`
  holds multiple messy comma-separated types per crew; we present a curated
  canonical list in the dropdown rather than the raw distinct strings.
- **Blank `housing` = "unknown."** The housing filter only narrows when the user
  explicitly picks YES or NO; blank-housing crews still show otherwise.
- **Records with no `resource`/`housing` still appear** on the map and only drop
  out when a filter genuinely excludes them.

### "Currently hiring" jobs layer (new feature — decisions)

- **Separate `jobs` table, not merged into `crews`.** Jobs are a different kind
  of thing (they open and close over time); keeping them in their own table means
  a refresh can freely replace them without ever touching the curated crew data.
- **Public-read, same as `crews`.** RLS on, one `select` policy for
  `anon, authenticated`, plus the explicit `grant select` (the 42501 fix we
  already learned we need). No public writes.
- **A local refresh script owns all writes.** `refresh_jobs.py` pulls from
  USAJOBS, filters noise, geocodes, and **upserts** into `jobs` using the
  **service_role key** — local-only, from an env var, never hardcoded or
  committed (identical safety rules to `import_to_supabase.py`). Run **manually
  for now**, like `geocode.py`; no scheduler yet.
- **Search both job series 0456 AND 0462.** The Forest Service is mid-transition
  from 0462 (Forestry Technician) to the new 0456 (Wildland Fire Management), and
  DOI already uses 0456 — so we query both to catch every open posting.
- **Drop "national-announcement" noise.** Postings listing **>8 duty locations**
  are administrative HQ lists, not field stations; we exclude them so a job maps
  to real towns.
- **One posting → many town rows.** A posting open in several towns is expanded
  into one `jobs` row per geocoded duty-station town (so it can light up the
  right pins).
- **Proximity matching in the browser, radius 50 miles.** The app compares crew
  lat/lng to job lat/lng client-side; a crew "lights up as hiring" when an open
  job falls within 50 mi. (50 mi chosen from a dry-run: ~90/440 crews light up —
  enough to feel alive, still a genuine commute-shed. See the exploration notes.)

## Phases

### Phase 0 — Data ready  · CORE · ✅ DONE
- **Goal:** all 440 crews geocoded to lat/lng.
- **Definition of done:** `crews_with_coords.json` exists and every record has
  non-null `latitude`/`longitude`; any failures listed in `still_missing.csv`.
- **Status:** ✅ **440/440 geocoded** via Nominatim. The 3 initial failures were
  town-name spacing typos (`CAVECREEK`→`CAVE CREEK`, `BRIDGERVILLE`→`BRIDGEVILLE`,
  `TROUTLAKE`→`TROUT LAKE`), fixed in `crews_cleaned.json` and filled in
  `crews_with_coords.json`. `still_missing.csv` is now empty (header only).

### Phase 1 — The product  · CORE · ⬜ NOT STARTED
- **Goal:** opening the URL immediately loads the interactive map (no
  homepage/login) with every crew as a pin from Supabase; the four filters are
  present on load and narrow the pins; clicking a pin shows crew details;
  mobile-usable.
- **Definition of done (test the whole flow, no intermediate pages):**
  1. Load the site URL → an interactive US map appears immediately (no
     homepage, splash, or login).
  2. All crews (with coords) show as pins, loaded from Supabase.
  3. State / crew type / housing / region filter controls are visible on first
     load and narrow the visible pins when used (crew type = case-insensitive
     "contains").
  4. Clicking a pin shows that crew's details: forest, district, town,
     resource, housing, website link (only if present), notes (only if present).
  5. Works on a phone-sized screen.

### Phase 2 — Polish  · ICING · ⬜ NOT STARTED
- **Goal:** make it nicer without changing the core flow.
- **Definition of done:** improved popups, pin clustering for dense areas,
  mobile/visual refinement, acceptable performance with all pins.

### Phase 2.5 — "Currently hiring" jobs layer  · ICING · 🔨 IN PROGRESS (backend)
- **Goal:** show which crews have an open USAJOBS fire posting nearby (≤50 mi),
  as a layer on top of the existing map.
- **Note on ordering:** this is ICING; the CORE product is the Phase 1 crew map.
  We're building it now at the owner's direction, but Phase 1's last CORE items
  (mobile verification + Vercel deploy) are still open and remain the priority.
- **Build order (stop-and-verify after each):**
  1. **Schema** — `jobs_schema.sql`: the `jobs` table + public-read RLS + grant.
  2. **Refresh script** — `refresh_jobs.py`: pull 0456+0462 → drop >8-location
     noise → expand to town duty-stations → geocode (reuse `job_geocache.json`)
     → upsert into `jobs` (service_role, local-only) → clear closed postings.
  3. **Run + verify** — populate `jobs` in Supabase and confirm it looks right
     **before any map work**.
- **Definition of done (backend only, this task):** `jobs` table exists,
  public-readable; `refresh_jobs.py` populates it safely and re-runnably; the
  table holds only currently-open, geocoded, non-noise postings.
- **Map UI is a LATER, separate task** — not in scope here.

### Phase 3+ — Community features  · ICING · ⬜ DEFERRED
- **Goal:** let people contribute crew data.
- **Definition of done:** add/edit/submit crews, accounts, moderation —
  **with viewing/search staying login-free**; only editing requires auth. Decide
  *who* can edit before building any write access.

## Current status

- **Phase 0: ✅ done.** `crews_with_coords.json` written, **440/440 geocoded**;
  `still_missing.csv` empty.
- **Phase 1: ✅ map + filters + popup live.** Next.js app, Supabase `crews` table
  (440 rows), Leaflet/OSM map as the landing page, all four filters, and the
  detail popup all work. **Remaining CORE:** mobile verification + Vercel deploy.
- **Phase 2.5 (Currently hiring): 🔨 backend in progress.** Data-source
  exploration done (USAJOBS API, series 0456+0462, >8-location noise filter,
  50-mi proximity dry-run). Now building the backend: `jobs_schema.sql` →
  `refresh_jobs.py` → run + verify. **No map UI yet.**
- Files present: `crews_cleaned.json`, `geocode.py`, `crews_with_coords.json`,
  `import_to_supabase.py`, `schema.sql`, the Next.js app, plus exploration
  outputs `fetch_jobs.py` / `fire_jobs_raw.json` / `job_geocache.json`
  (gitignored). New this phase: `jobs_schema.sql`, `refresh_jobs.py`.

## How to resume (for a fresh session)

1. Read `CLAUDE.md` (how to work), this file (the plan), then `TODO_NOW.md`
   (immediate tasks) and `TODO_LATER.md` (backlog).
2. Phase 0 is done (440/440 geocoded). **Next concrete action: start Phase 1** —
   create the Supabase project + table, import `crews_with_coords.json`, scaffold
   the Next.js app, and render a Leaflet map of all pins as the landing page.
