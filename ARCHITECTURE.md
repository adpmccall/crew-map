# ARCHITECTURE.md — Crew Map

Single source of truth for the build. If this and the code/data disagree, fix
one of them on purpose. (CLAUDE.md = how to work; this file = what we're building.)

## Core goal (non-negotiable)

A **queryable website where wildland firefighters can search Forest Service fire
crews across the US and find that crew's info.** Everything else is icing.

**Scope is nationwide — all US fire crews, all regions.** That is the target the
project is built against. The data we hold today is Western-heavy (the original
440-crew source file covers only R1–R6, and the Handcrew Atlas added partial
R8/R9/R10), but that is an **incomplete dataset, not a deliberate limit**.
Sourcing the missing regions is tracked work, not a "maybe someday" — see
`TODO_NOW.md`. Don't write code, copy, or UI that treats Western-only as the
intended scope.

**The intended experience:** all crews appear as **pins**, the **filter
controls** are visible and usable on first load, and clicking a pin shows that
crew's details. Viewing never requires an account.

**On "the map IS the landing page" — this rule was retired on 2026-08-18.**
It held for most of the project's life and was right while the map was the only
thing here: no splash, no marketing page, straight to the pins. It stopped being
right once there were three things — the map, a hiring layer, and a public
submission form. Someone arriving cold at 829 dots has no way to discover the
other two.

So: **`/` is a landing page that explains the place, and `/map` is the map**,
one click away and bookmarkable, so regulars never see the landing page twice.
What has NOT changed: no login, no signup wall, nothing gated. Viewing is still
free and anonymous — the rule that actually mattered.

Viewing and searching are **always login-free.** (Only future editing would ever
need an account — see Phase 3.)

## Stack (all free / $0 — keep it that way)

| Concern        | Tool                                   | Why |
|----------------|----------------------------------------|-----|
| Frontend       | **Next.js** (React) on **Vercel**      | Deploys to Vercel with zero config; free tier |
| Database + API | **Supabase** (Postgres + auto REST API)| Free Postgres; queryable API without writing a backend |
| Map            | **Leaflet** + **OpenStreetMap** tiles  | No API key, no signup, free |
| Geocoding      | **OpenStreetMap Nominatim** — build-time, **plus one runtime call** (see below) | Free, no key, town-level; same OSM project as our tiles |
| Jobs data      | **USAJOBS REST API** (build-time only)        | Official US federal jobs API; free with a self-registered key; pulled by a **local refresh script**, never by the app |

**Hard constraints:** stay at **$0** (no paid keys, no credit-card services — so
no Mapbox/Google Maps); keep the service count small (Vercel + Supabase + OSM is
the whole list); don't add a fourth service without raising it first.

**Note on USAJOBS:** it does **not** add a fourth runtime service. It's a
**build-time data source** — a local script (`refresh_jobs.py`) queries it on
our machine and writes rows into Supabase. The USAJOBS key is free (no
billing), so we stay at $0.

**Note on Nominatim — this changed on 2026-08-15.** It used to be strictly
build-time, and this file used to say the running app talked only to Supabase
and OSM. That is no longer true: the public submission form geocodes the town
the submitter types, live in the browser, so a crew is placed at the same
town-centre precision as every other pin without a separate approval step.

It is **not a fourth service** — Nominatim is the same OpenStreetMap project
that already serves our tiles, it needs no key, and it stays at $0. But the
claim "the live app only talks to Supabase and OSM tiles" is now wrong, and the
honest version is: **Supabase + OSM tiles on every page, plus Nominatim on the
submission form only.** The map itself still calls nothing else.

One caveat that comes with it: a browser can't set the descriptive User-Agent
Nominatim's usage policy asks for. Volume is a handful of lookups per
submission, so this is well inside their limits, but it's worth knowing if
submissions ever get busy.

## Key decisions and why

- **No auth gate, ever, for viewing.** This is the part of the old
  "map is the landing page" rule that still stands and is non-negotiable. The
  map itself lives at `/map`; `/` explains what the site is (see above). Neither
  requires an account.
- **Control panel is organized as LAYERS, not tabs.** As we add data beyond the
  base crews (jobs now; maybe housing later), the panel groups controls into
  stacked, collapsible **layer sections** rather than tabs or separate pages —
  this keeps everything spatially connected on the single map (no tabs, no
  sub-pages inside the map itself). Each layer owns its controls and its honest
  data-source/freshness label. **Crews** is the always-on base layer; other
  layers (e.g. **Hiring**) are toggleable overlays. A reusable `LayerSection`
  component means a new layer is a clean addition, not a panel rewrite. Layer
  visibility (on/off) is distinct from that layer's internal filters.
- **Viewing is always login-free.** Search/view never requires an account; only
  editing (Phase 3) would.
- **Leaflet + OSM over Mapbox/Google Maps.** Those need API keys and billing;
  Leaflet + OSM tiles are free and key-free, which keeps us at $0.
- **Nominatim for geocoding** (not the US Census geocoder). The data only has
  `town` + `state`; the Census geocoder only resolves full street addresses and
  returned 0 matches for every town. Nominatim does town-level lookups, is free
  and key-free, and is the same OSM project that serves our map tiles — so it
  adds no new service. Bulk geocoding runs **at build time** (`geocode.py`,
  `refresh_jobs.py`). **Since 2026-08-15 there is also one runtime call**: the
  public submission form geocodes the town as it's typed. See the Nominatim
  note under the stack table.
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
  committed (identical safety rules to `import_to_supabase.py`). **Runs
  automatically** — see the decision below.
- **The jobs refresh runs on GitHub Actions, daily.** `.github/workflows/
  refresh-jobs.yml` runs `refresh_jobs.py` at 09:17 UTC (odd minute on purpose;
  GitHub's scheduler is busiest on the hour), plus a manual trigger. Free on a
  public repo, and it adds **no runtime service** — the refresh happens on
  GitHub's machines, not in anyone's browser. (Separately, the submission form
  does add one runtime Nominatim call — see the Nominatim note above.)
  - **Credentials are encrypted Actions secrets**, and the Supabase one is a
    **separate CI-only `sb_secret_` key**, deliberately not the maintainer's
    local key, so it can be revoked on its own. The workflow token is
    `contents: read` — it writes to Supabase, never back to the repo. Forked-PR
    workflows never receive secrets, and this workflow doesn't run on
    `pull_request` at all.
  - **A red run is not data loss.** The script exits non-zero rather than
    writing when it fetched zero postings, so a failure means "USAJOBS returned
    nothing", not "the table was emptied".
  - **`job_geocache.json` is cached between runs** (`actions/cache`). It's
    gitignored, so a fresh runner would otherwise re-geocode every town every
    day against Nominatim — a free service with a 1 req/sec policy.
  - **⚠️ GitHub disables scheduled workflows after 60 days of repo inactivity.**
    First thing to check if the hiring data goes stale.
- **Search both job series 0456 AND 0462.** The Forest Service is mid-transition
  from 0462 (Forestry Technician) to the new 0456 (Wildland Fire Management), and
  DOI already uses 0456 — so we query both to catch every open posting.
- **Drop "national-announcement" noise.** Postings listing **>8 duty locations**
  are administrative HQ lists, not field stations; we exclude them so a job maps
  to real towns.
- **One posting → many town rows.** A posting open in several towns is expanded
  into one `jobs` row per geocoded duty-station town.
- **Postings are their own markers — an amber teardrop per TOWN.** Superseded
  the original design, where a posting showed only as an amber ring around a
  nearby crew (later graded by distance).

  **Why the ring went.** A ring drawn on a crew reads as "this crew is hiring".
  USAJOBS gives a duty-station **town**, never a worksite — and neither its
  coordinates nor ours are finer than a town centroid — so tying a posting to a
  particular crew was always a stronger claim than the data supports. A pin
  makes the weaker, true claim: there are real openings in this town. The ring
  was removed outright rather than kept as a secondary signal, which would have
  preserved the same overreach next to its fix.

  **Why one pin per town, with a count.** Every posting in a town resolves to a
  byte-identical coordinate: 48 of 98 live postings share a point, and Boise
  holds 6. One pin per posting would leave half of them invisible and
  unclickable. **Offsetting or spiderfying them is rejected on principle** —
  nudging pins apart fabricates spatial precision USAJOBS never gave us. The
  town is the data's real granularity, so it is the map's unit.

  **Why a teardrop, not a dot.** Crew pins are radius-6 filled circles and R2
  Rocky Mountain is `#ff7f0e`, close enough to the hiring amber that a
  standalone amber dot would read as an R2 crew. Shape carries the distinction:
  a pin sits *on* the map, a dot sits *in* it.
- **Crew↔posting proximity survives in exactly one place.** The crew popup lists
  "Open postings near here" within 50 mi, with real computed distances. That is
  a geographic statement the data supports, shown passively when you are already
  looking at a crew. The **"show only crews hiring nearby" filter was removed** —
  it reshaped the whole map on proximity, which is what the ring got wrong.
- **The hiring filters narrow POSTINGS, never crews.** Appointment / pay grade /
  salary decide which posting pins appear and what a crew popup lists. The crew
  count never moves when you touch them.

## Phases

### Phase 0 — Data ready  · CORE · ✅ DONE
- **Goal:** all 440 crews geocoded to lat/lng.
- **Definition of done:** `crews_with_coords.json` exists and every record has
  non-null `latitude`/`longitude`; any failures listed in `still_missing.csv`.
- **Status:** ✅ **440/440 geocoded** via Nominatim. The 3 initial failures were
  town-name spacing typos (`CAVECREEK`→`CAVE CREEK`, `BRIDGERVILLE`→`BRIDGEVILLE`,
  `TROUTLAKE`→`TROUT LAKE`), fixed in `crews_cleaned.json` and filled in
  `crews_with_coords.json`. `still_missing.csv` is now empty (header only).

### Phase 1 — The product  · CORE · ✅ COMPLETE
- **Goal:** opening the URL immediately loads the interactive map (no
  homepage/login) with every crew as a pin from Supabase; the four filters are
  present on load and narrow the pins; clicking a pin shows crew details;
  mobile-usable.
- **Deployed:** live at **https://crew-map-five.vercel.app**, served from
  Supabase via the public `sb_publishable_` key (legacy keys disabled).
- **Definition of done (test the whole flow, no intermediate pages):**
  1. ✅ Load the site URL → an interactive US map appears immediately (no
     homepage, splash, or login).
  2. ✅ All crews (with coords) show as pins, loaded from Supabase.
  3. ✅ State / crew type / housing / region filter controls are visible on first
     load and narrow the visible pins when used (crew type = case-insensitive
     "contains").
  4. ✅ Clicking a pin shows that crew's details: forest, district, town,
     resource, housing, website link (only if present), notes (only if present).
  5. ✅ Works on a phone-sized screen — verified 2026-07-25 at 390px: filter
     drawer opens/closes, count stays visible when closed, legend
     collapses/expands, tap targets finger-sized, no horizontal overflow, and
     popups fit (after a `min-width` fix that stopped them collapsing to ~137px).

### Phase 2 — Polish  · ICING · ⬜ NOT STARTED
- **Goal:** make it nicer without changing the core flow.
- **Definition of done:** improved popups, pin clustering for dense areas,
  mobile/visual refinement, acceptable performance with all pins.

### Phase 2.5 — "Currently hiring" jobs layer  · ICING · ✅ DONE
- **Goal:** show which crews have an open USAJOBS fire posting nearby (≤50 mi),
  as a layer on top of the existing map.
- **Note on ordering:** this is ICING; the CORE product is the Phase 1 crew map.
  Built at the owner's direction ahead of Phase 1's last CORE items (mobile
  verification + Vercel deploy), which remain the priority.
- **What shipped:**
  1. **Schema** — `jobs_schema.sql`: `jobs` table, public-read RLS, explicit
     grants (`select` to anon/authenticated + `all` to service_role).
  2. **Refresh script** — `refresh_jobs.py`: pull 0456+0462 → drop >8-location
     noise → expand to town duty-stations → geocode (reuse `job_geocache.json`)
     → upsert into `jobs` (secret key, local-only) → prune closed postings.
     Re-runnable; refuses to wipe the table on an empty/bad pull.
  3. **Map layer** — originally an amber ring on crews with a posting within
     50 mi, plus a "hiring nearby" crew filter. **Both were replaced on
     2026-08-14** by standalone posting markers; see the decision above and
     Phase 2.8 below.
  4. **Automated refresh** — `.github/workflows/refresh-jobs.yml` runs the
     script daily at 09:17 UTC. No more running it by hand.
  5. **Filters + posting detail** — appointment type, pay grade and salary
     narrow which postings appear; each posting shows its pay exactly as
     advertised, its grade and its appointment type.
- **Definition of done — met:** `jobs` populated and public-readable; refresh is
  safe, re-runnable and automated; open postings are findable on the map.

### Phase 2.8 — Postings as their own markers  · ICING · ✅ DONE (2026-08-14)
- **Goal:** stop representing a posting implicitly, as a property of a nearby
  crew, and give it its own marker making only the claim the data supports.
- **What shipped:**
  - **An amber teardrop per town with open postings**, badged with a count when
    it holds more than one (`postingPinHtml` / `postingTowns` in `CrewMap.js`).
  - **`PostingPopup`** — every posting in that town, no cap, with a standing
    note that the location is the duty-station town and not a worksite.
    `maxHeight` scrolls it internally; Boise's 6 already overflow a laptop.
  - **`PostingList`** — one component renders a posting identically in the town
    popup and in a crew popup's "near here" list, so they cannot drift.
  - **Removed:** the amber ring (both the flat and distance-graded versions),
    `HIRING_BANDS` / `hiringBandFor`, the legend's three ring rows, and the
    "show only crews hiring nearby" filter.
- **Definition of done — met, verified in-browser against live data:** 66 pins
  for 66 distinct points; 16 count badges which with the singles total 98
  postings; zero rings; crews unchanged at 829. Filtering to Temporary gives
  13 pins / 13 postings and Permanent 56 / 83, while the crew count never moves.
- **Security note:** the original legacy `service_role` key was exposed and has
  been rotated; we migrated to Supabase's new key system (`sb_secret_` for the
  local script, `sb_publishable_` for the app at deploy time).

### Phase 3 — Community submissions (v1)  · ✅ DONE (2026-08-15)
- **Goal:** fill nationwide coverage gaps organically, by letting the people who
  work these crews add the ones we're missing — instead of hand-sourcing data.
- **Key decision: submissions land in their own table, never in `crews`.**
  `crew_submissions` is the only table the public can write to. `crews` keeps
  public-SELECT-only exactly as before, so the live map cannot be touched by a
  submitter, and a flooded queue can be emptied without consequence. Approval
  copies the row into `crews` with `source='user_submitted'` — the value
  reserved for this back in atlas_schema.sql.
- **Anonymous, by design.** No auth system. The publishable key ships in the
  browser, so anyone can POST directly without our form; the defenses assume
  that rather than pretending otherwise:
  - anon may INSERT but **not SELECT** — the table holds submitter emails and
    must never be publicly readable or enumerable;
  - the RLS `WITH CHECK` pins `status='pending'`, so nobody can self-approve;
  - CHECK constraints bound every field's length and shape;
  - a `BEFORE INSERT` trigger caps 60 submissions/hour globally and 5/day per
    email, which is the only rate limit available (PostgREST doesn't expose the
    client IP to policies);
  - `approve_submission()` / `reject_submission()` are revoked from anon so they
    can't be called through PostgREST's RPC endpoint.
  **The real gate is human approval.** Everything else just keeps the queue
  small enough to read.
- **Reviewing is plain SQL**, no admin UI: `select * from pending_submissions;`
  then `select approve_submission(id);` or `reject_submission(id, 'why')`.
- **Location:** town + state, geocoded in the browser at submit time via the
  same free Nominatim service `geocode.py` uses — so a submitted crew lands at
  the same town-centre precision as every other pin. A failed lookup still
  accepts the submission with NULL coordinates and flags it in the review view.
  Note this is the first time the *live app* calls Nominatim; it was previously
  build-time only.
- **Submitted crews have no `region`, on purpose.** `region` means a Forest
  Service region (R1-R10). Most submitted crews won't have one — a county or
  tribal crew has no FS region — and for a USFS crew we'd be guessing from the
  town. The form doesn't ask, so nothing is asserted. Same principle as the 17
  crews at `agency='unknown'` and the 304 Atlas rows with NULL region: NULL is
  the honest answer. The consequence — a submitted crew won't appear under a
  Forest Service region filter — is correct, not a bug.
- **Known limitations, accepted rather than fixed:** the hourly rate limit is
  also a DoS vector, the sequence grant is broader than needed, and reviewed
  submissions are never cleaned up. All three are written up in `TODO_LATER.md`
  with the reasoning and the real fix for each.
- **Discoverability is env-gated:** the map only shows the "Add a missing crew"
  link when `NEXT_PUBLIC_SUBMISSIONS_ENABLED === "true"`, so the feature can be
  reviewed on a live deploy before anyone can find it, and switched off from
  Vercel in seconds without a code change.

### Phase 3+ — Community features (rest)  · ICING · ⬜ DEFERRED
- **Goal:** editing existing crews, accounts, a moderation UI.
- **Definition of done:** add/edit/submit crews, accounts, moderation —
  **with viewing/search staying login-free**; only editing requires auth. Decide
  *who* can edit before building any write access.

## Current status

- **Phase 0: ✅ done.** `crews_with_coords.json` written, **440/440 geocoded**;
  `still_missing.csv` empty.
- **Phase 1: ✅ deployed & live** at **https://crew-map-five.vercel.app**. Next.js
  app on Vercel, Supabase `crews` table (440 rows) read via the public
  `sb_publishable_` key (legacy keys disabled), Leaflet/OSM map as the landing
  page, all four filters, and the detail popup all work. Control panel is
  organized as layers (Crews base + Hiring overlay). **All CORE items done** —
  mobile verified at 390px on 2026-07-25.
- **Phase 2.7 (Atlas region backfill): ✅ done.** 85 of 389 Atlas crews given a
  `region` (52 exact + 19 fuzzy borrowed from the curated 440, plus 14 from an
  explicit R8/R9/R10 table for forests we hold no curated crew for). 304 left
  NULL on purpose — non-USFS units and rows with no forest name. R8/R9/R10 added
  to the region palette; the legend only shows regions that actually have crews.
  Same run cleaned 58 rows of CDATA/non-breaking-space artifacts.
  See `region_backfill_dryrun.py` (matcher) and `region_backfill_commit.py`.
  **These first R8/R9/R10 crews are a real start on the Eastern, Southern and
  Alaska regions — just an incomplete one (~14 crews).** Filling them out is
  tracked in `TODO_NOW.md`.
- **Phase 2.5 (Currently hiring): ✅ done.** Backend (`jobs_schema.sql`,
  `refresh_jobs.py`, ~98-row `jobs` table) plus a **daily GitHub Actions
  refresh**. Legacy service_role key rotated to the new
  `sb_secret_`/`sb_publishable_` system; the workflow uses a separate CI-only
  secret key.
- **Phase 2.8 (Postings as markers): ✅ done 2026-08-14.** Postings are amber
  teardrops, one per town with a count. The amber crew ring and the "hiring
  nearby" crew filter are gone — see the decision above for why.
- **Agency filter: ✅ done.** `crews.agency` classifies all 829 rows (usfs 582 ·
  state 82 · nps 36 · local 28 · county 27 · blm 20 · tribal 20 · unknown 17 ·
  other 10 · bia 5 · fws 2). See `agency_schema.sql` +
  `agency_backfill_dryrun.py` / `_commit.py`; 17 remain honestly `unknown` and
  are hand-correctable.
- **Hiring filters: ✅ done.** Appointment (Permanent/Temporary), pay grade
  (derived from the data) and salary (annualized for comparison, displayed as
  posted). Columns from `jobs_filters_schema.sql`.
- Files present: `crews_cleaned.json`, `geocode.py`, `crews_with_coords.json`,
  `import_to_supabase.py`, `schema.sql`, `jobs_schema.sql`, `refresh_jobs.py`,
  the Next.js app (now incl. `lib/proximity.js` + the jobs layer), plus
  exploration outputs `fetch_jobs.py` / `fire_jobs_raw.json` / `job_geocache.json`
  (last two gitignored).

## How to resume (for a fresh session)

1. Read `CLAUDE.md` (how to work), this file (the plan), then `TODO_NOW.md`
   (immediate tasks) and `TODO_LATER.md` (backlog).
2. Phase 0 is done (440/440 geocoded). **Next concrete action: start Phase 1** —
   create the Supabase project + table, import `crews_with_coords.json`, scaffold
   the Next.js app, and render a Leaflet map of all pins (now at `/map`).
