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

## National coverage
Now tracked as active work — see **"Finish nationwide coverage"** in
`TODO_NOW.md`. The project's goal is **all US fire crews nationwide**; the
current data is Western-heavy because that's what the source files gave us, not
because the scope stops there.

## Observability / sharing
- [ ] Add Vercel Web Analytics (free tier) to track traffic — worth doing before
      sharing the link widely, so we can see if anyone actually uses it.

## Third-party data — ✅ RESOLVED (Phase 2.6)
- [x] "Wildland Fire Handcrew Atlas" KMZ (527 placemarks) — **permission to use
      the data is secured**, and the merge shipped as **Phase 2.6** (see
      `TODO_NOW.md`): `crews` went from 440 to 829 rows. The source KMZ is still
      **not republished** — it stays gitignored (`*.kml` / `*.kmz`), along with
      the review CSVs and caches. The pre-merge estimate (~55% new locations vs
      our 440) held up: 389 of the 527 placemarks were genuinely new.

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
