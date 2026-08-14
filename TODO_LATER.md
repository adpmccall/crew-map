# TODO_LATER — deferred backlog

Big-picture items so they're not forgotten. Pull an item into `TODO_NOW.md` only
when it becomes the active work. See `ARCHITECTURE.md` for phase definitions.

## Currently-hiring feature — follow-ups (Phase 2.5 shipped; these extend it)
- [x] **Automate `refresh_jobs.py` via GitHub Actions** — ✅ DONE 2026-08-14.
      `.github/workflows/refresh-jobs.yml` ("Refresh jobs data") runs it daily
      at 09:17 UTC, plus a manual **Run workflow** button. Credentials are
      encrypted Actions secrets; the Supabase one is a **separate CI-only
      secret key** so it can be revoked without touching local scripts or the
      app. First run verified: 45 postings → 98 rows, 0 missing coords, 0 past
      their close date.
      **⚠️ GitHub disables scheduled workflows after 60 days of repo
      inactivity** (it emails first). If "hiring nearby" ever looks stale,
      check that before debugging anything else.
- [ ] Revisit the ">8 duty-location" national-announcement noise filter if it
      ever drops real field postings.

## Housing layer — the next big build (future)
- [ ] Add a **Housing** layer to the layers-based control panel. The panel was
      deliberately refactored into reusable `LayerSection`s so this is a clean
      addition, not a rewrite: a toggleable overlay with its own controls and its
      own source labeling, alongside the Crews base layer and the Hiring overlay.

## DATA LOSS — ~14 real crews are missing their own pins (Atlas merge bug)
**This is a data bug, not a documentation or naming issue.** ~14 crews that
exist in the Handcrew Atlas were silently swallowed by the merge and have no
row and no pin on the map. Do not close this by editing a number in a doc.

- [ ] **Fix `build_plan` in `atlas_import.py` so one curated crew can be claimed
      only once.** It currently lets several Atlas placemarks all match the same
      curated crew. Every match PATCHes that one row, so the last placemark
      processed wins the `crew_name` — and the earlier ones are counted as
      "matched", which means they are **never added as their own rows**.

      **Measured, not guessed:** `atlas_import_backup.json` holds **138 entries
      but only 124 unique ids** — 138 placemarks matched onto 124 curated crews,
      so 14 placemarks vanished. (This is also where the old "138 enriched"
      figure came from: it counted matches, not rows. The true number of
      enriched rows is 124 — the docs now say so.)

      **The 11 curated rows that absorbed extras:**
      - 3 placemarks each: Mormon Lake IHC (id 144), Springville IHC (id 350),
        Union IHC (id 402)
      - 2 placemarks each: ids 34, 54, 110, 162, 163, 356, 416, 418

      **The fix:** claim each curated crew at most once (best/closest match
      wins) and send the runners-up to the "new rows" pile so they get inserted
      as `source='handcrew_atlas'` like any other Atlas-only crew.

      **To verify it worked:** re-running the import should produce a backup
      whose entry count equals its unique-id count, and `crews` should gain
      ~14 rows.

      **Severity:** low urgency, real loss. Each missing crew is co-located with
      one that does show, so nothing looks broken — which is exactly why this
      would otherwise go unnoticed indefinitely.

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
