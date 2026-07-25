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

## Atlas photo URLs are dead (deferred — popup degrades gracefully)
- [ ] **Investigate `atlas_import.py`'s `gx_media_links` extraction.** All 114
      stored `photo_url` values fail to load — verified by load-testing them in
      the browser. Every one contains a literal `*` in the path
      (`.../hostedimage/m/*/3AE5a_...`), which looks like an unsubstituted
      placeholder rather than a real Google My Maps image URL. Low priority:
      `CrewPopup.js` hides an image that fails, so the popup already looks
      correct — the photo feature is simply inert until this is fixed.

## National coverage — the honest gap
- [ ] **Consider genuinely expanding to national coverage** — source real
      Eastern/Southern/Alaska USFS crew data (not just incidental Atlas
      stragglers). The current 440 curated crews are **Western-only by design
      (R1–R6)**. The Handcrew Atlas merge pulled in a handful of R8/R9/R10 crews
      as a side effect, which is not the same as covering those regions: it
      makes the map *look* national while the underlying data isn't. Either
      source real data for those regions or be explicit in the UI about what the
      map does and doesn't cover.

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
- [ ] **Community contributions** — let users add/edit crews, with a
      moderation/review workflow to police submissions (firefighters will want to
      contribute). Requires Phase 3 auth. Design so every crew record carries a
      `source` field (`usfs_official` / `handcrew_atlas` / `user_submitted`) —
      provenance is the backbone of moderation. Viewing stays login-free; only
      contributing needs an account.
- [ ] Decide *who* may edit (no open write access)
- [ ] Auth/accounts (editing only — viewing/search stays login-free)
- [ ] Add / edit / submit crews
- [ ] Moderation workflow

## Nice-to-have ideas (unscheduled)
- [ ] Search box (free-text) in addition to filters
- [ ] Link/share a filtered view via URL params
