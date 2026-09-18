# CLAUDE.md — Crew Map

Standing instructions for working on this codebase. Read this first.

## What we're building

A **free, public web app** at **https://usfiremaps.com**: a searchable map of US
wildland fire crews, plus the open federal fire jobs near them. Viewing and
searching are **always free and never require an account** — that part has not
changed and is non-negotiable.

What is actually live today:

- **The crew map** (`/map`) — **843 crews** as pins, narrowed by **state**,
  **region**, **crew type**, **housing**, and **agency**. Click a pin for that
  crew's details. This is still the CORE product; everything else is icing.
- **Not Forest Service only — not since the Atlas merge.** `crews` spans 11
  agencies (usfs, state, nps, local, county, blm, tribal, bia, fws, other, and
  17 honestly `unknown`). **Don't write code, UI or copy that assumes USFS.**
- **A hiring layer** — open USAJOBS fire postings as their own amber markers,
  one per duty-station town, filtered by appointment type, pay grade and salary.
  It defaults **off**: the map is for finding crews first.
- **Public submissions and corrections** (`/submit`) — anyone can add a missing
  crew, or report an error on an existing one via `/submit?crew=<id>`. Both land
  in `crew_submissions`, **never** directly in `crews`, and nothing reaches the
  map without a human approving it in SQL.
- **A landing page** (`/`) explaining the site, with the map one click away at
  `/map`. Regulars bookmark `/map` and never see it twice.

**Scope is nationwide — all US fire crews, all regions.** The data we hold is
Western-heavy today; that is an incomplete dataset we are actively filling, not
a boundary we chose. Sourcing the missing Eastern, Southern and Alaska crews is
the main open work — see `TODO_NOW.md`.

**Scope creep is still worth resisting, but the line has moved.** The test is no
longer "is it one of the four filters" — it's *does this help someone find a
crew?*, and **`ARCHITECTURE.md`'s CORE/ICING tag is what settles it.** Don't use
this section as a reason to refuse work the phase plan already accepted.

## Who this is for (read before writing code)

The person building this is a **beginner working alongside an expert friend**.
That changes how you write:

- Favor clear, conventional code over clever code.
- **Comment non-obvious steps**, and when you introduce a new concept or tool,
  briefly say what it is and why we're using it.
- Prefer one obvious way to do something over flexible-but-confusing
  abstractions. Boring is good.
- When you make a decision (a library, a data shape, a tradeoff), state it and
  why in plain language.

## Tech stack — all free tiers, keep it that way

| Concern        | Tool                                  | Why |
|----------------|---------------------------------------|-----|
| Frontend       | **Next.js** (React)                   | Deploys to Vercel with zero config |
| Database + API | **Supabase** (Postgres + auto REST API) | Free Postgres; gives us a queryable API without writing a backend |
| Map            | **Leaflet** + **OpenStreetMap** tiles | No API key, no signup, free |
| Hosting        | **Vercel**                            | Free tier, integrates with Next.js |

**Hard constraints — do not violate without asking:**

- **Stay at $0.** Every service above has a free tier. Don't introduce a tool,
  API, or tile provider that costs money or requires a credit card / paid key.
  (Note: Mapbox, Google Maps, etc. need keys/billing — **don't use them**. We use
  Leaflet + OSM specifically to avoid that.)
- **Keep the number of separate services small.** Frontend (Vercel) + database
  (Supabase) + map tiles (OSM) is the whole list. Don't add a fourth thing
  unless there's no alternative — and if you think there is, raise it first.

## The data

Source file: **`crews_cleaned.json`** — a JSON array of **440** Forest Service
crew records (the spec said "~440"; it's exactly 440).

**⚠️ 440 is the SOURCE FILE, not the live dataset.** The Supabase `crews` table
holds **843 rows**: the original 440 (still `source='usfs_official'`) plus 403
added by the Handcrew Atlas merge, and it grows again as public submissions are
approved. (It was 829/389 until 2026-09-18, when re-running the fixed importer
recovered 14 crews an earlier dedup bug had swallowed.) Every count in this section — 440 records, 6 regions, 16 states,
371 websites — describes `crews_cleaned.json` as it was imported, and is
deliberately left as a record of that file. For what's actually on the map,
query the table or see `SESSION_SYNOPSIS.md`.

Each record has these 12 fields:

```
region, forest, district, town, state, location,
resource, housing, notes, website, latitude, longitude
```

Example record:

```json
{
  "region": "NORTHERN REGION, REGION 1",
  "forest": "BEAVERHEAD-DEERLODGE NF",
  "district": "BUTTE RD",
  "town": "BUTTE",
  "state": "MONTANA",
  "location": "BUTTE,MONTANA",
  "resource": "Engine, Fuels, Prevention, Type 2/2IA Handcrew (Dedicated 20+person), IA Crew/Squad (4-10 person), Hotshot Crew",
  "housing": "NO",
  "notes": "",
  "website": "",
  "latitude": null,
  "longitude": null
}
```

### The four filters map to these fields

- **State** → `state` (full name, UPPERCASE, e.g. `"CALIFORNIA"`).
- **Region** → `region` (e.g. `"NORTHERN REGION, REGION 1"`).
- **Housing** → `housing` (`"YES"`, `"NO"`, or blank).
- **Crew type** → `resource` (see the quirk below — filter by *contains*).

### Actual values you'll filter against (verified from the data)

**6 regions.** Note this describes the *source file*, not the project's scope.
**The goal is nationwide coverage of all US fire crews.** `crews_cleaned.json`
happens to contain only R1–R6 — that's a gap in the source data we intend to
close, not a boundary we chose:

```
NORTHERN REGION, REGION 1            (67)
ROCKY MOUNTAIN REGION, REGION 2      (59)
SOUTHWESTERN REGION, REGION 3        (61)
INTERMOUNTAIN REGION, REGION 4       (75)
PACIFIC SOUTHWEST REGION, REGION 5   (102)
PACIFIC NORTHWEST REGION, REGION 6   (76)
```

**16 states** in this source file (AZ, CA, CO, ID, KS, MT, NE, NV, NM, ND, OK,
OR, SD, UT, WA, WY). The map centers on the continental US and should stay built
for **all 50 states** — Eastern, Southern and Alaska crews are data we still
need to source, not places the map excludes. (The Handcrew Atlas merge has since
added some R8/R9/R10 crews; see `TODO_NOW.md`.)

**Housing:** `YES` (206), `NO` (50), blank (184).

### Data quirks — remember these, they will bite you

1. **Coordinates are NOT in `crews_cleaned.json` yet.** Every record has
   `latitude: null` / `longitude: null`. They get filled in by **`geocode.py`**
   (see below), which writes **`crews_with_coords.json`**. **The map needs the
   coords file, not the cleaned file.** That file does not exist until someone
   runs the script.

2. **`resource` holds multiple comma-separated crew types per crew**, e.g.
   `"Engine, Fuels, Prevention, Hotshot Crew"`. **Filter by "contains," not by
   equality.** Also, the values are *messy*: inconsistent casing and spacing
   (`Engine` / `ENGINE` / `Engines`, `Hotshot Crew` / `HOTSHOT CREW`,
   `Smokejumper` / `smokejumper`), double spaces, and at least one mashed-together
   value (`...Handcrew  (Dedicated 20+person)Prevention`). So:
   - Do crew-type matching **case-insensitively**.
   - When building the filter dropdown, present a small curated list of canonical
     crew types (Engine, Hotshot Crew, Helitack, Rappel, Smokejumper, Fuels,
     Prevention, WFM, IA Crew/Squad, Type 2/2IA Handcrew, Water Tender, Dozer)
     rather than the raw distinct strings. Don't try to perfectly normalize the
     source data right now — match loosely and move on.

3. **`housing` is normalized to `YES`/`NO`** — but **184 records are blank**.
   Decide how blank shows in the UI (suggest: treat blank as "unknown," and have
   the housing filter only narrow when the user explicitly picks YES or NO).

4. **184 records lack a `resource` value and 184 lack `housing`** (183 lack
   both). That's a large chunk with no crew-type/housing data — those crews
   should still appear on the map and only drop out when a user applies a filter
   that genuinely excludes them.

5. **`website`** was extracted from an originally unnamed field. **371 of 440**
   have one (e.g. `http://www.fs.usda.gov/whiteriver`); the rest are blank. Show
   it as a link in the detail popup only when present.

6. **An Oklahoma state typo was already fixed** in the cleaned data. State values
   are full uppercase names — keep them that way; don't re-introduce abbreviations.

7. **`notes`** is present on only 62 records; usually blank. Show only when set.

### `geocode.py`

A standalone, beginner-friendly Python script (run on the user's own machine,
**not** inside Claude). It:

- reads `crews_cleaned.json`,
- looks up `lat`/`lng` for each crew's `town` + `state` via **Nominatim**,
  OpenStreetMap's free geocoder — no key, no signup, and the same OSM project
  that already serves our map tiles, so it keeps us at $0 and adds no new
  service. (**Not** the US Census geocoder, which this file used to claim:
  Census only resolves full street addresses, so it returned zero matches for
  our town + state data.)
- writes **`crews_with_coords.json`** (the map-ready file),
- writes `still_missing.csv` for any it couldn't place (fix those by hand),
- is **safe to re-run**: it skips records that already have coords, so an
  interrupted run just resumes.

If you change the data fields, keep this script in sync (it reads `town`,
`state`, and writes `latitude`/`longitude`).

### `atlas_import.py` — UPSERT, never delete-and-reinsert

**Changed 2026-09-18. Don't undo this.** The script used to delete every
`source='handcrew_atlas'` row and re-insert them from scratch. `crews.id` is
`generated always as identity`, so that handed every Atlas crew a brand-new id
on each run — which silently broke any correction report pointing at one.

Now each placemark carries a stable **`atlas_key`**: `md5(name|lat 4dp|lon 4dp)`,
unique-indexed, and required by CHECK on `handcrew_atlas` rows. The importer
diffs against that key and UPDATEs, INSERTs or REMOVEs individual rows, so
**ids survive re-runs** and a run that changes nothing writes nothing.

- **Never reintroduce delete-all/insert-all**, however much simpler it looks.
- `atlas_key()` lives in `atlas_import.py` and **`backfill_atlas_key.py`
  imports it** (`from atlas_import import atlas_key`) rather than
  reimplementing the formula, so the two cannot drift. That's deliberate —
  keep it that way, because a second copy of the hash is exactly how the id
  churn would come back.
- Placemark names need `_clean_name()` (non-breaking spaces and CDATA
  artifacts). An uncleaned name hashes to a different key, which reads as
  "this crew vanished from the Atlas."
- Atlas photos were re-hosted to Supabase Storage on 2026-08-28 because the
  original Google URLs are CORP-blocked. The update path is guarded by
  `_is_google_hosted()` so a re-run can't overwrite a re-hosted URL with the
  dead Google one the KMZ still carries. **Keep those guards.**

### Deleting crews: the FK is RESTRICT

`crew_submissions.crew_id` has an **`ON DELETE RESTRICT`** foreign key to
`crews.id` (set 2026-09-18, replacing an `ON DELETE SET NULL` that contradicted
the CHECK requiring a correction to keep its target).

Practical consequence: **a bulk `delete from crews ...` can fail partway** the
moment it reaches a crew someone has reported a correction against. If a delete
might touch referenced rows, do them **one row at a time** so one refusal
doesn't abort the batch, and resolve or reassign the correction first. The
refusal is correct behaviour — it's protecting a real person's report.

## Build order — ship the simplest thing first

**The original v1 order is finished**, all four steps: the map rendered, the
filters landed, the detail popup shipped and went mobile-friendly, and
add/edit is no longer deferred — public submissions went live 2026-08-19 and
correction reports 2026-08-21. So are the phases after it (hiring layer, agency
filter, Handcrew Atlas merge, region backfill). **`ARCHITECTURE.md` holds the
phase list and `TODO_NOW.md` holds what's next — read them, not this section,
for the current queue.**

What still governs how any *new* work gets sequenced:

1. **CORE before ICING, always.** Every phase in `ARCHITECTURE.md` carries one
   tag or the other, and a CORE item outranks an ICING one even when the icing
   is more interesting.
2. **Ship the simplest version first.** A working small thing beats a half-built
   everything. Don't jump ahead.
3. **Display before edit.** Read-only shipped first on purpose, and any new data
   layer should do the same.
4. **Public writes go to their own table and wait for a human.** This is settled
   and shipped, not an open question. The public may INSERT into
   `crew_submissions` and do nothing else; `crews` stays public-read-only;
   approval is a manual SQL call (`approve_submission()` /
   `resolve_correction()`). **Don't open write access to `crews`, and don't add
   an auth system without raising it first** — there deliberately isn't one, and
   human review is the real gate.

Point 4 replaces the old "only later: adding/editing data — defer this, and
first decide *who* may edit." That question has been answered: **nobody edits
directly; everything goes through the review queue.**

## Conventions recap

- Beginner audience + expert reviewer → clear, well-commented code; explain the
  non-obvious.
- **Everything stays within free tiers**; few services.
- When the data and this file disagree, trust the data — and update this file.

## The plan lives in ARCHITECTURE.md + the TODO files — read them at session start

This file is *how to work*. The *what to build* lives in three files. **At the
start of every session, read them:**

- **`ARCHITECTURE.md`** — the single source of truth: core goal, stack, key
  decisions, and the phased plan (with a Definition of Done and a CORE-or-ICING
  tag per phase). Follow the phase order. Respect the **core-vs-icing**
  distinction: CORE before ICING, always.
- **`TODO_NOW.md`** — the immediate, actively-worked tasks. Start here for what
  to do next.
- **`TODO_LATER.md`** — the deferred backlog. Don't pull from it until an item
  becomes the active work.

**Keep the TODO files current** as you go: check off completed items, and move
items between `TODO_NOW.md` and `TODO_LATER.md` as work starts or is deferred.
Don't duplicate the plan into this file — these three files are authoritative.
