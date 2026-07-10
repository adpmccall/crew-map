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

### Phase 0 — Data ✅
- **Data cleaned:** 440 Forest Service crew records in `crews_cleaned.json`
  (12 fields each). Housing normalized to YES/NO/blank, an Oklahoma state typo
  fixed, and the `website` field recovered for 371/440 crews.
- **Geocoded 440/440:** `geocode.py` switched from the US Census geocoder to
  **Nominatim**, producing **`crews_with_coords.json`** with latitude/longitude
  for every crew. The 3 towns that failed were spacing typos (`CAVECREEK`,
  `BRIDGERVILLE`, `TROUTLAKE`) — fixed and filled. `still_missing.csv` is empty.
- **Supabase table created:** `schema.sql` run in Supabase SQL Editor. Table
  has 12 fields + auto `id`. RLS enabled with public-read policy. Two GRANTs
  required and applied:
  - `GRANT ALL ON public.crews TO service_role;` (for the import script)
  - `GRANT SELECT ON public.crews TO anon, authenticated;` (for the public app)
- **440 rows imported:** `import_to_supabase.py` run successfully. Script was
  updated during this session to handle Supabase's new `sb_secret_` key format
  and to print verbose error messages on failure.

### GitHub ✅
- Repo live at `github.com/adpmccall/crew-map` (public).
- `.gitignore` covers `.env`, `.env.local`, `node_modules/`, `.next/`,
  `__pycache__/`, `.DS_Store`, `dev-server.log`, `.claude/settings.local.json`.
- **github-manager subagent** created at `.claude/agents/github-manager.md` —
  handles all git/GitHub operations so Tone Dog doesn't have to. Has bash
  access. Contains explicit safety rules (never commit secrets, never
  force-push main). Note: must be spawned in a **fresh Claude Code session**
  to be recognized (session registry loads at startup).
- Two commits pushed:
  1. `Initial commit — Phase 0 complete: data cleaned, geocoded, schema ready`
  2. `Add Next.js + Leaflet map scaffold and schema GRANT fix`

### Phase 1 — Frontend (largely complete) ✅
- **Next.js app scaffolded:** App Router, plain JavaScript (no TypeScript),
  Next.js 14.2.35, React 18.
- **Map is the landing page:** `app/page.js` renders only the map — no
  homepage, splash, or login.
- **Leaflet + OSM tiles:** Free, no API key. `react-leaflet` used as the React
  wrapper. Markers use `CircleMarker` to avoid Leaflet's default icon loading
  issues with bundlers.
- **All 440 crews load from Supabase** via the public anon key only. Service
  role key never appears in app code.
- **Regional color coding:** Each of the 6 USFS regions (R1–R6) has a distinct
  color. Legend displayed on the map.
- **Click popup:** Clicking a pin shows crew name, forest, town/state, crew
  type, region, housing availability, and website (clickable link).
- **Filter controls:** State, Region, Crew Type, Housing filters visible on
  first load.
- **Zoom controls** repositioned to bottom-right to avoid overlapping the
  filter panel.
- **Multi-select checkboxes** for State, Region, and Crew Type were just
  requested — may be complete or in progress; verify on resume.

### Subagents ✅
- **code-reviewer** — `.claude/agents/code-reviewer.md` — read-only (Read,
  Grep, Glob). Reviews for correctness, beginner-friendliness, and adherence
  to the plan. Flags $0 / map-is-landing / no-login violations.
- **github-manager** — `.claude/agents/github-manager.md` — bash access.
  Handles all git/GitHub operations. Must be used in a fresh session to spawn.

### Node.js installed ✅
- Node.js v24.18.0 and npm 11.16.0 installed via the official nodejs.org
  `.pkg` installer. No Homebrew (not installed on this machine).

## Key gotchas resolved this session

- **Supabase 403 on import:** Two causes fixed:
  1. `.env.local` had `/rest/v1/` appended to the project URL — must be bare
     base URL only (`https://xxxx.supabase.co`).
  2. Missing `GRANT ALL ON public.crews TO service_role` — run in SQL Editor.
- **Supabase 403 on app (anon read):** Missing
  `GRANT SELECT ON public.crews TO anon, authenticated` — added to `schema.sql`
  and run in SQL Editor.
- **Supabase new key format:** `sb_secret_...` keys must be sent in `apikey`
  header only (not `Authorization: Bearer`), unlike old `eyJ...` JWT keys.
  `import_to_supabase.py` updated to handle both formats.
- **github-manager subagent registry:** Subagent definition files added
  mid-session aren't picked up until a fresh session is started.
- **Environment variables** don't persist between Terminal sessions — must
  re-export `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` each time.

## What's NEXT

- Verify multi-select checkboxes are working (may have been in progress at
  session end)
- Custom crew-type emoji/symbol markers — toggle between "color by region"
  and "symbol by crew type" (IHC text, 🚒 engine, 🚁 helitack, ✈️
  smokejumper, 🚁+R rappel)
- **Deploy to Vercel** — get a live public URL (free tier, connect GitHub repo)
- Phase 3 (future): user accounts, editing, RLS write rules

## Key safety rules

- **`service_role` key is LOCAL IMPORT ONLY.** Never in app code, screenshots,
  or git. Pass via environment variable only.
- **App uses only the public `anon` key** via `NEXT_PUBLIC_` env vars.
- **RLS stays public-read only** until Phase 3.
- **$0 constraint:** Vercel + Supabase + Leaflet/OSM only. No paid keys.
- **Map is the landing page:** No homepage, splash, or login gate to view.
