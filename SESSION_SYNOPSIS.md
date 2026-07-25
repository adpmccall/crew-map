# SESSION_SYNOPSIS — Crew Map

Plain-language summary of the project and what's been done, so anyone (human or
a fresh Claude session) can get oriented fast. For the authoritative plan see
`ARCHITECTURE.md`; for how to work see `CLAUDE.md`; for task lists see
`TODO_NOW.md` / `TODO_LATER.md`.

## The goal

A **free ($0)** interactive web map for wildland firefighters. A user opens the
site URL and is **immediately** shown a queryable US map of US Forest Service
fire crews — **no homepage, no splash, no login to view.** Crews show as pins;
filter controls (state, crew type, housing, region) are visible on first load
and narrow the pins; clicking a pin shows that crew's details. **The map IS the
landing page.** Viewing/searching is always login-free.

## The stack (all free, no paid keys)

- **Frontend:** Next.js (React), deployed on **Vercel** (free tier).
  **Live at https://crew-map-five.vercel.app.**
- **Database + API:** **Supabase** (hosted Postgres + auto REST API). Free tier.
- **Map:** **Leaflet** + **OpenStreetMap** tiles (no API key, no signup).
- **Geocoding:** **OpenStreetMap Nominatim**, run once locally at build time.
- **Jobs data:** **USAJOBS REST API** — a *build-time* source pulled by a local
  script (`refresh_jobs.py`) into Supabase; the live app never calls it. Free
  key. Does NOT add a runtime service (app still talks only to Supabase + OSM).

## What's DONE

### Phase 0 — Data ✅
- **440 crews cleaned + geocoded** (`crews_cleaned.json` → Nominatim →
  `crews_with_coords.json`). `still_missing.csv` empty.
- **Supabase `crews` table** created (`schema.sql`), RLS public-read, explicit
  GRANTs (`select` to anon/authenticated, `all` to service_role), 440 rows
  imported via `import_to_supabase.py`.

### Phase 1 — The product ✅ LIVE (1 item left)
- Next.js App Router app (plain JS, Next 14). **Map is the landing page** — no
  homepage/splash/login. Leaflet + OSM; `CircleMarker` pins to avoid bundler
  icon issues.
- All crews load from Supabase via the **public key only**. (Was 440 when built;
  the table is **829** since the Atlas merge — the app reads the table, so the
  extra pins show automatically.)
- Two symbolize modes: **Region (color)** and **Crew type (symbol)** with a
  matching legend. Four filters (State, Region, Crew type, Housing) as
  multi-select checkbox dropdowns; live "Showing X of N" count.
- Click popup with crew details (forest, district, town/state, resource, region,
  housing, website when present).
- **Deployed to Vercel** (live URL above).
- **Only remaining Phase 1 item:** mobile-usability verification (see below).

### Phase 2.5 — "Currently hiring" (USAJOBS) ✅ shipped this session
- **Backend:** `jobs_schema.sql` (a `jobs` table, public-read RLS, grants,
  composite upsert key `announcement_number,town,state`). `refresh_jobs.py`
  pulls open postings in **series 0456 + 0462**, drops national-announcement
  noise (>8 duty locations), expands each posting into one row per duty-station
  town, geocodes via Nominatim (cached in `job_geocache.json`), and **upserts**
  into `jobs` using the secret key (local only). Re-runnable; **won't wipe the
  table on an empty/bad pull**; prunes postings that have closed. `jobs`
  populated (32 rows at last run).
- **Map layer:** browser-side proximity match (`lib/proximity.js`, haversine,
  **50-mi radius**). Crews with an open job within 50 mi get an **amber ring**
  (works in both symbolize modes). A **"hiring nearby" filter** narrows to those
  crews. The popup lists nearby postings (≤5, closest first) with
  **Apply-on-USAJOBS** links. Honest **"updated {date}"** freshness label + empty
  states. Verified against live data at the time: **90/440 crews light up** (that
  count predates the Atlas merge; the ring logic is coordinate-based, so the new
  Atlas crews participate too).

### Supabase key migration ✅
- The original **legacy `service_role` key was exposed** (pasted into chat) and
  has been **rotated**. Migrated to Supabase's new key system: **`sb_secret_`**
  for the local script, **`sb_publishable_`** for the app. **Legacy keys are
  disabled.** Scripts handle both key formats (JWT `eyJ…` vs `sb_…`).

### Control panel: layers refactor + UI fixes ✅
- Panel reorganized into collapsible **layer sections** (reusable
  `LayerSection`): **Crews** = always-on base layer; **Hiring** = toggleable
  overlay. No tabs/pages — map stays the landing page. Built so a future
  **Housing** layer is a clean addition.
- Fixed the multi-select dropdown layout (checkbox + label inline on one
  left-aligned, fully-clickable row; regular weight; tighter spacing).
- **State** filter labels now display title-case ("California") while filtering
  still uses the uppercase value.

### Mobile responsive ⚠️ built, NOT yet verified
- Narrow-screen (`<=768px`) responsive pass; **desktop untouched** (all changes
  gated inside a media query). Filter panel collapses into a dismissible drawer
  (Filters button + scrim); legend collapsible (collapsed by default on mobile);
  crew count stays visible when the panel is closed; finger-sized tap targets;
  popups constrained to fit. **Compiles cleanly but has NOT been tested at
  ~390px in a browser** — committed with an `[UNVERIFIED]` tag.

### Phase 2.6 — Handcrew Atlas merge ✅ DONE (verified in Supabase)
**Permission to USE the Atlas data is secured.** The source KMZ is still *not*
republished — it stays gitignored, and so do the review CSVs and caches.

- **Schema (`atlas_schema.sql`)** — purely additive, idempotent. Adds three
  columns to `crews`: **`crew_name`** (our data never had one), **`photo_url`**
  (one Google My Maps image when present), and **`source`** (provenance on every
  row). `source` is backfilled to `usfs_official`, made `NOT NULL` with a default,
  and constrained to `usfs_official` / `handcrew_atlas` / `user_submitted` — so
  Phase 3 community rows drop in with no further migration.
- **Import (`atlas_import.py`)** — reads the 527-placemark KMZ and folds it in by
  **proximity (≤5 mi) + forest-name confirmation**. Dry-run by default; `--commit`
  writes, `--rollback` undoes. Before its first write it snapshots every row it
  will touch to `atlas_import_backup.json` (local only).
- **Result — `crews` is now 829 rows, verified in Supabase:**
  - **440 curated rows unchanged** in identity, still `source='usfs_official'`.
  - **138 of them enriched** with an Atlas crew name (+ photo/website when the
    Atlas had one). Non-destructive rules: website = Atlas link *or* keep ours
    (never blanked); `resource` and `state` only fill when ours was **blank** — a
    curated value is never overwritten.
  - **389 new rows added** as `source='handcrew_atlas'` — crews only the Atlas
    has, including non-USFS (TNC/NPS/BLM/BIA/state) crews. These carry name,
    forest, notes, website, photo, coords, an extracted crew type, and a
    **state reverse-geocoded from the coordinate** (cached in
    `state_geocache.json`). Region/district/town/housing are left NULL — the
    Atlas doesn't have them and coordinates can't honestly supply them. Those
    pins still show.
  - **Crew type extracted from crew names** into our exact resource labels
    (IHC→Hotshot Crew, WFM/Module→WFM, HC/T2IA→Type 2/2IA Handcrew, Fuels,
    Job Corps), plus **two new labels: "Suppression Module" and "Fire Effects."**
- **Two follow-ups are open** — see "Open items" below.

### Tooling ✅
- **github-manager** subagent handles all git ops (never commits secrets, never
  force-pushes main). Used for every commit this session.
- Node v24, npm 11. Repo pushed to GitHub (`main`), commits directly to `main`.

## Open items / What's NEXT

**The two Atlas follow-ups (the merge landed in the database; the UI hasn't
caught up yet):**

- **Wire crew names + photos into the popup.** `crews` now has `crew_name` and
  `photo_url`, but `components/CrewPopup.js` still derives its title from the
  ranger district (its comment at the top — "this dataset has no dedicated crew
  name field" — is now out of date). Use the real `crew_name` when present, fall
  back to district → forest, and decide how/whether to show `photo_url`. Note the
  photo URLs are Google My Maps-hosted and may not be hotlink-stable long term.
- **Add "Suppression Module" + "Fire Effects" to the crew-type filter.** The
  import writes these two new labels, but the curated dropdown list
  (`CREW_TYPES` in `components/CrewMap.js`) doesn't include them, so those crews
  can't be filtered for. Also consider whether they need a symbol in
  `lib/crewTypes.js` / the legend, or should fall through to "Other."

**Everything else, unchanged:**

- **Verify mobile at ~390px** (iPhone width) — the last Phase 1 CORE item. The
  responsive work is committed but untested in a real browser.
- **Automate `refresh_jobs.py` via GitHub Actions** (scheduled cron) so the jobs
  table stays fresh without manual runs. Needs secrets stored as encrypted
  Actions secrets.
- **Vercel Web Analytics** (free tier) — add before sharing the link widely.
- **Housing layer** — the next big build; drops into the layers panel as another
  overlay. Note the 389 Atlas rows have NULL housing, so they'll read as unknown.

## Key safety rules

- **Secret key (`sb_secret_` / old `service_role`) is LOCAL SCRIPTS ONLY.** Never
  in app code, screenshots, or git; pass via env var. (One leaked this session —
  it was rotated. Don't paste keys into chat.)
- **App uses only the public `sb_publishable_` key** via `NEXT_PUBLIC_` env vars.
- **RLS stays public-read only** until Phase 3.
- **$0 constraint:** Vercel + Supabase + Leaflet/OSM (+ free USAJOBS/Nominatim at
  build time). No paid keys.
- **Map is the landing page:** no homepage, splash, or login gate to view.
- Environment variables don't persist between Terminal sessions — re-export the
  secret key when running local scripts.
