# TODO_LATER — deferred backlog

Big-picture items so they're not forgotten. Pull an item into `TODO_NOW.md` only
when it becomes the active work. See `ARCHITECTURE.md` for phase definitions.

## Currently-hiring feature — follow-ups (Phase 2.5 shipped; these extend it)
- [ ] **Automate `refresh_jobs.py` via GitHub Actions.** Today the `jobs` table
      is refreshed by running the script manually (like `geocode.py`). A
      scheduled Action (e.g. daily/weekly cron) would keep "currently hiring"
      fresh without anyone remembering to run it. Needs the Supabase secret key
      and USAJOBS creds stored as **encrypted GitHub Actions secrets** (never
      committed).
- [ ] Revisit the ">8 duty-location" national-announcement noise filter if it
      ever drops real field postings.

## Housing layer — the next big build (future)
- [ ] Add a **Housing** layer to the layers-based control panel. The panel was
      deliberately refactored into reusable `LayerSection`s so this is a clean
      addition, not a rewrite: a toggleable overlay with its own controls and its
      own source labeling, alongside the Crews base layer and the Hiring overlay.

## Observability / sharing
- [ ] Add Vercel Web Analytics (free tier) to track traffic — worth doing before
      sharing the link widely, so we can see if anyone actually uses it.

## Third-party data (permission pending)
- [ ] "Wildland Fire Handcrew Atlas" KMZ (527 placemarks) — **exploration only**
      so far; DO NOT import or merge until the creator grants permission. File is
      gitignored (`*.kml` / `*.kmz`). Rough comparison found ~55% looked like new
      locations vs our 440 (wider geography + non-USFS crews).

## Phase 2 — Polish (ICING) — not started
- [ ] Nicer / styled detail popups
- [ ] Pin clustering for dense areas
- [ ] Visual refinement
- [ ] Performance pass with all ~440 pins

## Phase 3+ — Community features (ICING, DEFERRED) — not started
- [ ] Decide *who* may edit (no open write access)
- [ ] Auth/accounts (editing only — viewing/search stays login-free)
- [ ] Add / edit / submit crews
- [ ] Moderation workflow

## Nice-to-have ideas (unscheduled)
- [ ] Search box (free-text) in addition to filters
- [ ] Link/share a filtered view via URL params
