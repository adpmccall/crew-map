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
- **Database + API:** **Supabase** (hosted Postgres that auto-generates a REST
  API, so we don't write a backend). Free tier, no credit card.
- **Map:** **Leaflet** + **OpenStreetMap** tiles (no API key, no signup).
- **Geocoding:** **OpenStreetMap Nominatim**, run once locally at build time
  (not in the live app).

## What's DONE

- **Data cleaned:** 440 Forest Service crew records in `crews_cleaned.json`
  (12 fields each). Housing normalized to YES/NO/blank, an Oklahoma state typo
  fixed, and the `website` field recovered for 371/440 crews.
- **Geocoded 440/440:** `geocode.py` was switched from the US Census geocoder to
  **Nominatim** and run, producing **`crews_with_coords.json`** with latitude/
  longitude for **every** crew. The 3 towns that first failed were town-name
  spacing typos (`CAVECREEK`→`CAVE CREEK`, `BRIDGERVILLE`→`BRIDGEVILLE`,
  `TROUTLAKE`→`TROUT LAKE`), fixed and filled. `still_missing.csv` is now empty.
  (Phase 0 in ARCHITECTURE.md = ✅ done.)
- **Planning docs written:** `ARCHITECTURE.md` (source of truth: goal, stack,
  decisions, phases with definitions of done), `TODO_NOW.md`, `TODO_LATER.md`,
  and a pointer section added to `CLAUDE.md` telling every session to read these.
- **Read-only code-reviewer subagent set up:** `.claude/agents/code-reviewer.md`
  (tools: Read/Grep/Glob only — it can never modify anything). It reviews changes
  for correctness, clarity, beginner-friendliness, and adherence to the plan, and
  flags any $0 / map-is-landing / no-login-to-view violations.
- **Supabase files written (not run yet):**
  - `schema.sql` — creates the `crews` table (12 fields + auto `id`). Descriptive
    columns are nullable; **`latitude`/`longitude` are NOT NULL**. Turns on Row
    Level Security (RLS) with **one policy: public can READ**, and no write
    policies (so the public API can't modify data).
  - `import_to_supabase.py` — loads `crews_with_coords.json` into the table,
    **converting every blank/empty string to true NULL** (lat/lng left numeric).
    Re-run-safe (refuses to duplicate; `--replace` wipes and re-imports). Reuses
    `requests`; no new dependencies.

## What's IN PROGRESS / NEXT

The database isn't populated yet. Immediate next steps (require the user's own
browser + terminal, since they touch the private Supabase project):

1. **Run `schema.sql`** in the Supabase SQL Editor to create the `crews` table.
2. **Run `import_to_supabase.py`** to load all 440 rows. It needs two values set
   as environment variables **locally only**:
   `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`
   (from Supabase → Project Settings → API).
3. **Verify** the table shows **440 rows** and blanks appear as `NULL`.

After the data is in Supabase, **Phase 1**: scaffold the Next.js app, render the
Leaflet + OSM map as the landing page showing all pins from Supabase, then have
the **code-reviewer subagent** review it. (Filters and the click-to-detail popup
complete Phase 1 — see `TODO_LATER.md` / ARCHITECTURE.md Phase 1 definition.)

## Key safety notes

- The **`service_role` key is for the LOCAL import ONLY.** It bypasses security.
  Never put it in app code, screenshots, or git. Pass it via an environment
  variable just for the import run.
- The **website uses only the public `anon` key**, which can do exactly what RLS
  allows — i.e. read-only.
- **RLS stays as-is** (public read, no writes) until Phase 3, when editing is
  introduced behind authentication. Viewing/searching always stays login-free.

## Decisions and why (short list)

- **Nominatim over the US Census geocoder** — our data only has town + state;
  Census needs full street addresses and matched 0 towns. Nominatim does
  town-level lookups, is free/no-key, and is the same OSM project as our tiles.
- **NULL over empty string** — store true `NULL` for missing values so we can
  query `is null` cleanly, instead of hunting for `""`.
- **Map is the landing page** — the product is the map + filters on first load;
  no homepage or auth gate.
- **Display before edit** — ship a working read-only map first; defer all
  add/edit/account features to Phase 3.
- **Stay $0** — Vercel + Supabase + OSM only; no paid keys or extra services.
