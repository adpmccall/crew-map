# CLAUDE.md — Crew Map

Standing instructions for working on this codebase. Read this first.

## What we're building

A **free, beginner-friendly web app**: an interactive map of US Forest Service
fire crews. The user:

- filters by **state**, **crew type**, **housing (yes/no)**, and **region**;
- sees matching crews appear as **pins** on a US map;
- **clicks a pin** to see that crew's details.

That's the whole product for v1. Resist scope creep.

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

**6 regions** (this is a Western-US dataset — there is no nationwide coverage):

```
NORTHERN REGION, REGION 1            (67)
ROCKY MOUNTAIN REGION, REGION 2      (59)
SOUTHWESTERN REGION, REGION 3        (61)
INTERMOUNTAIN REGION, REGION 4       (75)
PACIFIC SOUTHWEST REGION, REGION 5   (102)
PACIFIC NORTHWEST REGION, REGION 6   (76)
```

**16 states** (all Western / Plains — AZ, CA, CO, ID, KS, MT, NE, NV, NM, ND,
OK, OR, SD, UT, WA, WY). The map can still center on the continental US, but
don't expect East-Coast pins.

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
- looks up `lat`/`lng` for each crew's `town` + `state` via the **free US Census
  Bureau geocoder** (no key, no signup — consistent with our $0 rule),
- writes **`crews_with_coords.json`** (the map-ready file),
- writes `still_missing.csv` for any it couldn't place (fix those by hand),
- is **safe to re-run**: it skips records that already have coords, so an
  interrupted run just resumes.

If you change the data fields, keep this script in sync (it reads `town`,
`state`, and writes `latitude`/`longitude`).

## Build order — ship the simplest thing first

1. **Display first.** Get a Leaflet map rendering pins read from Supabase. Goal:
   see all crews on the map. (Prereq: run `geocode.py`, then load
   `crews_with_coords.json` into a Supabase table.)
2. **Filters.** Add state, crew type, housing, and region controls that narrow
   which pins show. (Remember crew type = case-insensitive "contains.")
3. **Detail popup.** Click a pin → show that crew's details (forest, district,
   town, resource, housing, website link, notes). Make it **mobile-friendly**.
4. **Only later: adding/editing data.** Defer this. When we get here, first
   decide *who* is allowed to edit (auth) — don't build open write access.

Don't jump ahead. A working map with no filters beats a half-built everything.

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
