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

**Hard constraints:** stay at **$0** (no paid keys, no credit-card services — so
no Mapbox/Google Maps); keep the service count small (Vercel + Supabase + OSM is
the whole list); don't add a fourth service without raising it first.

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

### Phase 3+ — Community features  · ICING · ⬜ DEFERRED
- **Goal:** let people contribute crew data.
- **Definition of done:** add/edit/submit crews, accounts, moderation —
  **with viewing/search staying login-free**; only editing requires auth. Decide
  *who* can edit before building any write access.

## Current status

- **Phase 0: ✅ done.** `crews_with_coords.json` written, **440/440 geocoded**;
  `still_missing.csv` empty.
- **Phase 1: not started.** No Next.js app, no `package.json`, no Supabase
  project/table, no Leaflet map yet.
- Files present: `crews_cleaned.json` (440 source records), `geocode.py`
  (Nominatim), `crews_with_coords.json` (map-ready), `still_missing.csv`,
  `CLAUDE.md`, this file, `TODO_NOW.md`, `TODO_LATER.md`.

## How to resume (for a fresh session)

1. Read `CLAUDE.md` (how to work), this file (the plan), then `TODO_NOW.md`
   (immediate tasks) and `TODO_LATER.md` (backlog).
2. Phase 0 is done (440/440 geocoded). **Next concrete action: start Phase 1** —
   create the Supabase project + table, import `crews_with_coords.json`, scaffold
   the Next.js app, and render a Leaflet map of all pins as the landing page.
