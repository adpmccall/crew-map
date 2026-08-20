# SESSION_SYNOPSIS — Crew Map

Plain-language summary of the project and what's been done, so anyone (human or
a fresh Claude session) can get oriented fast. For the authoritative plan see
`ARCHITECTURE.md`; for how to work see `CLAUDE.md`; for task lists see
`TODO_NOW.md` / `TODO_LATER.md`.

## The goal

A **free ($0)** interactive web map for wildland firefighters, covering **US
fire crews nationwide — all regions, all 50 states.** A user opens the site URL
and gets a short landing page explaining what this is, with the map one click
away at `/map`. Crews show as pins; filter controls (state, agency, crew type,
region, housing) are visible on first load and narrow the pins; clicking a pin
shows that crew's details. **Viewing/searching is always login-free** — that
part never changed.

**Note:** "the map IS the landing page" was a hard rule until 2026-08-18. It was
retired once the site had three things (map, hiring, submissions) that a cold
visitor couldn't discover from a screen of dots. No login was ever added.

## The stack (all free, no paid keys)

- **Frontend:** Next.js (React), deployed on **Vercel** (free tier).
  **Live at https://usfiremaps.com.**
- **Database + API:** **Supabase** (hosted Postgres + auto REST API). Free tier.
- **Map:** **Leaflet** + **OpenStreetMap** tiles (no API key, no signup).
- **Geocoding:** **OpenStreetMap Nominatim** — bulk runs happen locally at build
  time, **plus one runtime call**: the public submission form geocodes the town
  as it's typed (since 2026-08-15). Not a new service — same OSM project as the
  tiles — but the app is no longer strictly Supabase + tiles at runtime.
- **Jobs data:** **USAJOBS REST API** — a *build-time* source pulled by a local
  script (`refresh_jobs.py`) into Supabase; the live app never calls it. Free
  key. Does NOT add a runtime service — the pull happens on GitHub's machines.

## What's DONE

### Phase 0 — Data ✅
- **440 crews cleaned + geocoded** (`crews_cleaned.json` → Nominatim →
  `crews_with_coords.json`). `still_missing.csv` empty.
- **Supabase `crews` table** created (`schema.sql`), RLS public-read, explicit
  GRANTs (`select` to anon/authenticated, `all` to service_role), 440 rows
  imported via `import_to_supabase.py`.

### Phase 1 — The product ✅ COMPLETE
- Next.js App Router app (plain JS, Next 14). The map lives at **`/map`** (it
  was at `/` until the landing page arrived, 2026-08-18); no login either way.
  Leaflet + OSM; `CircleMarker` pins to avoid bundler icon issues.
- All crews load from Supabase via the **public key only**. (Was 440 when built;
  the table is **829** since the Atlas merge — the app reads the table, so the
  extra pins show automatically.)
- Two symbolize modes: **Region (color)** and **Crew type (symbol)** with a
  matching legend. Four filters (State, Region, Crew type, Housing) as
  multi-select checkbox dropdowns; live "Showing X of N" count.
- Click popup with crew details (crew name, forest, town/state, resource,
  region, housing, website when present). Blank fields are omitted entirely
  rather than rendered as empty rows.
- **Deployed to Vercel** (live URL above).
- **Every Phase 1 CORE item is done**, including mobile (verified at a true
  390px — see below). Phase 1 needs nothing further.

### Phase 2.5 — "Currently hiring" (USAJOBS) ✅ DONE
- **Backend:** `jobs_schema.sql` (a `jobs` table, public-read RLS, grants,
  composite upsert key `announcement_number,town,state`). `refresh_jobs.py`
  pulls open postings in **series 0456 + 0462**, drops national-announcement
  noise (>8 duty locations), expands each posting into one row per duty-station
  town, geocodes via Nominatim (cached in `job_geocache.json`), and **upserts**
  into `jobs`. Re-runnable; **won't wipe the table on an empty/bad pull**;
  prunes postings that have closed.
- **Refreshes itself daily ✅** — `.github/workflows/refresh-jobs.yml`
  ("Refresh jobs data") runs the script at 09:17 UTC, plus a manual **Run
  workflow** button. No more running it by hand. Credentials are encrypted
  GitHub Actions secrets, and the Supabase one is a **separate CI-only secret
  key** so it can be revoked independently of the local key and the app.
  Verified on the first run: 100 postings pulled → 55 dropped as
  national-announcement noise → 45 kept → **98 rows** (a posting can cover
  several duty-station towns) → 28 closed postings pruned. Confirmed
  independently with the public key: 98 rows, 45 distinct announcements, one
  fresh `last_refreshed`, 0 missing coords, 0 past their close date.
  **⚠️ GitHub disables scheduled workflows after 60 days of repo inactivity** —
  check that first if the hiring data ever looks stale.
- **Map layer:** postings are their own amber teardrop markers — see Phase 2.8
  below. (This replaced the original amber ring drawn around nearby crews.)
- **Filters + posting detail ✅** — the Hiring layer filters by **appointment**
  (Permanent / Temporary), **pay grade** (options derived from the loaded
  postings, currently 2–13) and **salary** ("at least" thresholds). Each posting
  shows its appointment type, grade and **pay exactly as advertised** — an
  hourly posting reads `$25.37 – $28.69/hr`, never the annualized figure used
  for sorting. Postings that explicitly say **career seasonal** carry a small
  note (permanent, but not year-round); it is never a filter, because USAJOBS
  codes career-seasonal identically to year-round permanent and only reveals it
  in free text — 38 of 44 permanent postings say nothing either way.
- **Backing columns** (`jobs_filters_schema.sql`): `salary_interval` +
  `salary_min/max_annual`, `appointment_code` + `appointment_type`,
  `career_seasonal`, `pay_plan`, `grade_low/high`. Appointment codes were
  verified against USAJOBS' **official published code list**, not inferred from
  posting prose — which caught a real error (15327 is "Multiple", not
  "Detail/Temporary Promotion").

### Phase 2.8 — Postings as their own markers ✅ DONE (2026-08-14)
The "currently hiring" feature originally showed a posting only *implicitly*,
as an amber ring around a nearby crew. **That ring is gone entirely.**

- **Why.** A ring on a crew reads as "this crew is hiring". USAJOBS gives a
  duty-station **town**, never a worksite — verified: it reports exactly one
  coordinate per city across all 155, and its `AddressLine` (26 of 1376) is a
  facility *name* like "Yosemite National Park", not a street. So tying a
  posting to a particular crew was always more than the data could support. The
  ring was removed outright rather than kept alongside the fix.
- **What replaced it.** An **amber teardrop per TOWN**, badged with a count when
  it holds more than one. A pin says only "there are real openings here".
- **Why one pin per town.** Every posting in a town lands on a byte-identical
  coordinate — 48 of 98 postings share a point, Boise holds 6 — so one pin per
  posting would hide half of them. **Offsetting/spiderfying was rejected on
  principle:** nudging pins apart would fabricate precision USAJOBS never gave
  us, the same overreach as the ring.
- **Why a teardrop, not a dot.** Crew pins are radius-6 circles and R2 Rocky
  Mountain is `#ff7f0e`, close enough to the hiring amber that an amber *dot*
  would read as an R2 crew. Shape does the work.
- **Also removed: the "show only crews hiring nearby" filter.** It reshaped the
  whole map on crew proximity — nearer to the ring's mistake than a passive list
  is. The crew popup **keeps** its list, reworded to **"Open postings near
  here"** with real computed distances and no ownership language.
- **Verified in-browser:** 66 pins for 66 distinct points, 16 count badges
  totalling 98 postings with the singles, zero rings, crews unchanged at 829.
  Temporary → 13 pins / 13 postings; Permanent → 56 / 83; and "Showing 829 of
  829 crews" never moves, because posting filters no longer touch crews.

### Supabase key migration ✅
- The original **legacy `service_role` key was exposed** (pasted into chat) and
  has been **rotated**. Migrated to Supabase's new key system: **`sb_secret_`**
  for the local script, **`sb_publishable_`** for the app. **Legacy keys are
  disabled.** Scripts handle both key formats (JWT `eyJ…` vs `sb_…`).

### Control panel: layers refactor + UI fixes ✅
- Panel reorganized into collapsible **layer sections** (reusable
  `LayerSection`): **Crews** = always-on base layer; **Hiring** = toggleable
  overlay. No tabs/pages inside the map itself. Built so a future
  **Housing** layer is a clean addition.
- Fixed the multi-select dropdown layout (checkbox + label inline on one
  left-aligned, fully-clickable row; regular weight; tighter spacing).
- **State** filter labels now display title-case ("California") while filtering
  still uses the uppercase value.

### Mobile responsive ✅ VERIFIED at 390px
- Narrow-screen (`<=768px`) responsive pass; **desktop untouched** (all changes
  gated inside a media query). Filter panel collapses into a dismissible drawer
  (Filters button + scrim); legend collapsible (collapsed by default on mobile);
  crew count stays visible when the panel is closed; finger-sized tap targets;
  popups constrained to fit.
- **Verified in a browser (2026-07-25):** drawer opens/closes, count stays
  visible when closed, legend collapses/expands, tap targets are finger-sized,
  and there is no horizontal overflow. Confirmed at a true 390px.
- One real bug was found and fixed during that check: popups were collapsing to
  **~137px** (a third of the 76vw they were allowed) because `min-width` was 0
  and `word-break: break-all` let links wrap arbitrarily narrow. A
  `min-width: min(240px, 76vw)` floor inside the mobile media query fixes it.

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
  - **124 of them enriched** with an Atlas crew name (+ photo/website when the
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
- **The UI has since caught up** — see the two sections below.

### Atlas UI catch-up ✅ DONE
The merge put `crew_name`, `photo_url` and two new crew-type labels in the
database; the app now actually uses them.

- **Popups are titled with the real `crew_name`** when there is one (every Atlas
  row, plus the 124 curated rows the Atlas matched), falling back to ranger
  district → forest → "Unnamed crew". `CrewMap.js` had to add `crew_name,
  photo_url` to its Supabase `select` — Supabase returns only the columns you
  ask for, so the popup couldn't see them before.
- **`photo_url` renders as a bounded image** (full popup width, cropped to
  130px) that removes itself if the image fails to load, so a dead URL leaves no
  broken-image icon. The `src` is gated to http(s) only.
- **"Suppression Module" and "Fire Effects" are filterable**, each with its own
  SVG glyph and color (deep-teal droplet / olive magnifier) in `lib/crewTypes.js`
  and the legend. They were appended to the END of `CREW_TYPE_SYMBOLS` on
  purpose: `crewTypeFor()` returns the first match scanning in order, so
  appending guarantees no existing pin changed the symbol it already showed.

### Phase 2.7 — Atlas region backfill ✅ DONE (written + verified)
The 389 Atlas rows had no `region`. This filled it in where it could be known
honestly, using **only our own data plus public USFS structure** — no external
boundary data, no new service, no cost.

- **`region_backfill_dryrun.py`** — the matcher. Read-only; there is no write
  path in the file at all. Matches an Atlas crew's `forest` to a forest already
  in the curated 440 and borrows that forest's region.
- **`region_backfill_commit.py`** — dry-run by default, `--commit` writes,
  `--rollback` undoes, snapshots to `region_backfill_backup.json` (gitignored)
  before the first write. It **imports** the matcher rather than copying it, so
  the two can't drift.
- **Result: 85 of 389 assigned** — 52 exact + 19 fuzzy borrowed from curated
  data, plus **14 from an explicit R8/R9/R10 table** for Eastern/Southern/Alaska
  forests we hold no curated crew for (nothing to borrow). Breakdown: R5 36 ·
  R8 10 · R3 9 · R2 8 · R6 8 · R4 6 · R1 4 · R9 2 · R10 2.
- **304 left NULL on purpose** — 113 non-USFS units (BLM/NPS/BIA/TNC/state/
  county), 127 rows with no forest name at all, 64 state/tribal/county agencies.
  NULL is the honest answer for these, not a gap to be filled.
- **Three matcher bugs were found and fixed before committing anything.** The
  first pass looked like 75 matches but contained **8 false positives** — the
  0.6 token-overlap rule divides by the shorter name, so a one-token curated
  forest like `CARSON NF` matched *anything* containing "carson" at 1.00
  ("Carson City BLM"). It also *missed* real forests because the curated data
  mixes "GILA NF" with "PAYETTE NATIONAL FOREST", diluting correct pairs to
  0.50. Fixes: more stopwords (`national`/`forest`/`district`, `mount`→`mt`), a
  hard non-USFS gate applied before matching, and a "distinctive token" rule so
  generic words like "river" can't carry a match alone. The script keeps a
  **REGRESSION CHECK** block naming the specific rows that were wrong — keep it
  passing.
- **R8/R9/R10 added to the region palette** (`lib/regions.js`), colors chosen by
  measuring CIELAB deltaE against *both* the region and crew-type palettes so
  nothing clashes when you switch symbolize modes. `Legend.js` is gated on
  `presentRegions` so a region only appears once crews actually have it.
  (There is no Region 7 — the Forest Service retired it. The 6→8 jump is real.)
- **Same run cleaned 58 rows of text artifacts** left by the original Atlas
  import: 3 with literal `<![CDATA[...]]>` wrappers and 55 with non-breaking
  spaces (which block line-wrapping and widen popups). Only 3 had been spotted
  by eye; searching by content found the rest. 3 of the 58 are `usfs_official`
  rows enriched by the Atlas, so that write is guarded by **id, not by source** —
  a source filter would have silently skipped them.

### Agency filter — who employs each crew ✅ DONE (2026-08-14)
`source` records where a ROW came from (usfs_official / handcrew_atlas /
user_submitted), not who employs the crew. Since the Atlas merge the table mixes
ten-odd agencies with no way to tell them apart. `crews.agency` fixes that.

- **`agency_schema.sql`** adds a NOT NULL `agency` column defaulting to
  `'unknown'`, constrained to 11 values and indexed.
- **`agency_backfill_dryrun.py`** classifies; read-only, no write path in the
  file. **`agency_backfill_commit.py`** writes, importing the matcher so they
  can't drift — dry-run default, `--commit`, `--rollback`, snapshot first.
- **How it's decided:** the 440 curated rows are `usfs` **by provenance**, no
  guessing. The 389 Atlas rows are inferred from **website domain** first
  (strongest — `fs.usda.gov`, `blm.gov`, `dnr.wa.gov`, county domains), then
  `forest` / `notes` / `crew_name` text, plus a tiny explicit table for units
  identifiable by name alone (SEKI, Kilauea…). Two domains are treated as **zero
  evidence**: `nifc.gov` (interagency) and social links.
- **Result, verified:** usfs 582 · state 82 · nps 36 · local 28 · county 27 ·
  blm 20 · tribal 20 · **unknown 17** · other 10 · bia 5 · fws 2 = 829.
- **`tribal` is separate from `bia`, deliberately** — a tribal government is not
  the Bureau of Indian Affairs. Where a row names a nation *and* "BIA" the
  nation wins, because the crew belongs to the community, not the paperwork.
- **`fws` is first-class from the start** despite only 2 rows, since Phase 3
  submissions are expected to add more. Note **FWS and USFWS are one agency**;
  a naive `\bfws\b` regex misses "USFWS" and did silently mislabel a crew during
  development.
- **The 17 `unknown` rows are shown honestly** — a visible "Unknown" checkbox,
  not hidden. Every write is guarded by `agency=eq.unknown`, so **hand-corrections
  in Supabase survive re-runs**; that guard is the whole reason this lives in a
  column instead of the browser. `--reclassify` lifts it deliberately.
  List them with `python3 agency_backfill_dryrun.py --unknown`.
- **`lib/agencies.js`** owns the vocabulary and ordering, the way
  `lib/regions.js` owns regions. Options are gated to agencies actually present.

### Phase 3 v1 — public crew submissions ⚠️ BUILT, NOT YET LIVE (2026-08-15)
The answer to the coverage gap: rather than hand-sourcing R8/R9/R10 data, let
the people who work those crews add them. **Nothing appears on the map without a
human approving it.**

- **Submissions land in their own table.** `crew_submissions`, never `crews`.
  This is the first public WRITE path in the project, so the write surface is
  kept off the map's data entirely: `crews` stays public-SELECT-only, and a
  flooded queue can be emptied with no consequence. Approving copies the row
  into `crews` with `source='user_submitted'`.
- **Anonymous, no auth** — the publishable key is in the browser bundle by
  design, so anyone can POST directly. The defenses assume that:
  anon may INSERT but **not SELECT** (the table holds emails and must not be
  harvestable), RLS `WITH CHECK` pins `status='pending'` so nobody can
  self-approve, CHECK constraints bound every field, and a trigger caps 60
  submissions/hour and 5/day per email — the only rate limit available, since
  PostgREST doesn't expose client IP to policies. `approve_submission()` and
  `reject_submission()` are revoked from anon so they can't be called via RPC.
- **Review is plain SQL**, no admin UI: `select * from pending_submissions;`
  then `approve_submission(id)` / `reject_submission(id, 'why')`.
- **Location** is town + state, geocoded in the browser at submit time through
  the same Nominatim service `geocode.py` uses — same town-centre precision as
  every other pin. A failed lookup still accepts the submission with NULL
  coords and flags it in the review view. **This is the first time the live app
  calls Nominatim**; it was build-time only before.
- **Gated:** the map's "Add a missing crew" link only renders when
  `NEXT_PUBLIC_SUBMISSIONS_ENABLED === "true"`, so it can be reviewed on a live
  deploy before anyone can find it, and killed from Vercel without a code change.
- **Two owner steps remain:** run the schema SQL, then flip the env flag.

### Tooling ✅
- **github-manager** subagent handles all git ops (never commits secrets, never
  force-pushes main). Used for every commit — don't run git by hand.
- Node v24, npm 11. Repo pushed to GitHub (`main`), commits directly to `main`.

## Open items / What's NEXT

**Nothing is blocking Phase 1 — it is fully done.** Everything below is ICING or
backlog. `TODO_LATER.md` is the authoritative list; these are the highlights.

**Two issues surfaced during the Atlas UI work, deliberately deferred:**

- **The Atlas photo URLs are dead — all 114 of them.** Load-tested in a browser:
  every stored `photo_url` fails. Each contains a literal `*` in the path
  (`.../hostedimage/m/*/3AE5a_...`), which looks like an unsubstituted
  placeholder rather than a real image URL — so the bug is probably in
  `atlas_import.py`'s `gx_media_links` extraction, not in the data. **Low
  priority on purpose:** `CrewPopup.js` hides an image that fails to load, so
  popups already look correct. The photo feature is simply inert until fixed.
- **Nationwide coverage is started but incomplete.** The project's scope is all
  US fire crews in every region. The Atlas gave us our **first ~14 R8/R9/R10
  crews** — a genuine beginning on the Eastern, Southern and Alaska regions, but
  nowhere near complete, and the original 440-crew source file only covered
  R1–R6. So the map currently shows less than it aims to. The fix is to **source
  real R8/R9/R10 crew data** (tracked in `TODO_NOW.md`); until that lands, be
  straightforward in the UI about which regions are still thin rather than
  implying the data is complete.

**Longer-standing backlog, unchanged:**

- **Automate `refresh_jobs.py` via GitHub Actions** (scheduled cron) so the jobs
  table stays fresh without manual runs. Needs secrets stored as encrypted
  Actions secrets.
- **Vercel Web Analytics** (free tier) — add before sharing the link widely.
- **Housing layer** — the next big build; drops into the layers panel as another
  overlay. Note the 389 Atlas rows have NULL housing, so they'll read as unknown.
- **Next.js is two majors behind** (14.2.35). `npm audit` reports 2 high
  advisories via Next + its bundled postcss. Assessed as **not exploitable
  here** — the app has no API routes, middleware, Server Actions, `next/image`,
  rewrites or i18n; it's a client-rendered map (`ssr: false`). Treat the upgrade
  as scheduled maintenance, not an emergency, but don't leave it forever.

## Key safety rules

- **Secret key (`sb_secret_` / old `service_role`) is LOCAL SCRIPTS ONLY.** Never
  in app code, screenshots, or git; pass via env var. (One leaked in an earlier
  session and had to be rotated. Don't paste keys into chat.)
- **App uses only the public `sb_publishable_` key** via `NEXT_PUBLIC_` env vars.
- **RLS stays public-read only** until Phase 3.
- **$0 constraint:** Vercel + Supabase + Leaflet/OSM (+ free USAJOBS/Nominatim at
  build time). No paid keys.
- **No login gate to view**, ever. (The map moved from `/` to `/map` on
  2026-08-18 when a landing page was added; nothing became gated.)
- Environment variables don't persist between Terminal sessions — re-export the
  secret key when running local scripts.
