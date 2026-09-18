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

## Crew submissions — known limitations, ACCEPTED not forgotten
**Note (2026-08-21):** corrections now share this table via `submission_kind`.
Every limitation below applies to them too — in particular the global hourly
rate limit is shared between new-crew submissions and correction reports.
Three trade-offs made knowingly when public submissions shipped (2026-08-15).
None is a bug; all are written down so a future session doesn't "discover" them
and assume they were oversights. Revisit if submissions get real traffic.

- [ ] **The rate limit is also a denial-of-service vector.** The `BEFORE INSERT`
      trigger in `crew_submissions_schema.sql` caps **60 submissions/hour
      globally**. Hitting that cap blocks *legitimate* submissions for the rest
      of the hour, and an attacker can reach it cheaply.
      **Why accepted:** there is no public audience yet, and PostgREST doesn't
      expose the client IP to policies, so per-IP limiting — the thing that
      would actually fix this — isn't available. Bounded bloat beat unbounded.
      **The real fix if it ever bites:** Cloudflare Turnstile (free). Note the
      cost honestly — it needs server-side verification, so it means adding the
      project's **first API route** and a **fourth service dependency**, both of
      which the architecture has deliberately avoided. Don't reach for it until
      the problem is real.

- [ ] **The sequence grant is broader than this table needs.**
      `grant usage, select on all sequences in schema public to anon,
      authenticated` covers *every* sequence in `public`, not just
      `crew_submissions`'. It's the standard Supabase incantation required for
      anon INSERT to draw an id.
      **Why low risk:** sequences expose a counter value, not row data. The
      no-read guarantee on `crew_submissions` is unaffected — it rests on
      having no SELECT policy plus an explicit `revoke select`.
      **Worth doing eventually:** scope it to the single sequence
      (`crew_submissions_id_seq`). Tightening, not urgent.

- [ ] **No retention policy on reviewed submissions.** Approved and rejected
      rows stay in `crew_submissions` forever. Approved ones double as an audit
      trail (`approved_crew_id` links to the crew created), which is useful.
      **Why fine for now:** expected volume is a handful.
      **If it gets busy:** add a cleanup — e.g. delete rejected rows older than
      90 days, keep approved ones as provenance. Consider whether submitter
      emails should be purged on a schedule regardless of volume, since they're
      personal data we only need while a submission is under review.

## Use USAJOBS' own coordinates instead of geocoding towns ourselves
- [ ] **`refresh_jobs.py` geocodes `"{town}, {state}, USA"` through Nominatim —
      but USAJOBS already hands us `Latitude`/`Longitude` on every
      `PositionLocation`.** Verified on the live corpus: all 1376 location
      entries carry coordinates.
      **Same precision, not better** — USAJOBS reports exactly one coordinate
      per city across all 155 cities, so it's a town centroid too. This is a
      simplification, not an accuracy upgrade, with one exception below.
      **What it removes:** the Nominatim call, its ~1 req/sec throttle, the
      `job_geocache.json` cache, and the `actions/cache` step in the workflow
      that exists only to preserve it.
      **What it fixes:** the two sources agree to a median of 0.11 mi but
      disagree badly on a few — Holloman AFB **17.3 mi**, Hawaii National Park
      **13.3 mi** — where Nominatim resolved to a different feature. USAJOBS is
      describing its own posting, so its answer is likelier right.
      **Also worth grabbing while in there:** `AddressLine` (26 of 1376) gives a
      facility NAME, not a street — "Yosemite National Park", "Central CA BLM
      Bishop Field Office". Useless as a coordinate, but a nice popup label
      where present.
      Kept separate from the posting-markers change on purpose; it touches the
      refresh pipeline, not the map.

## Housing layer — the next big build (future)
- [ ] Add a **Housing** layer to the layers-based control panel. The panel was
      deliberately refactored into reusable `LayerSection`s so this is a clean
      addition, not a rewrite: a toggleable overlay with its own controls and its
      own source labeling, alongside the Crews base layer and the Hiring overlay.

## DATA LOSS — ~14 Atlas crews had no pin (Atlas merge dedup bug)
**Moved to `TODO_NOW.md` on 2026-09-18** — it became active work. The
`build_plan` fix is written; the import still has to be re-run to apply it.

## Atlas crew patches — ✅ FIXED 2026-08-28 (re-hosted on Supabase Storage)
**The 114 images are crew logos/patches**, one per Atlas crew — bespoke artwork
("NORTH CENTRAL MONTANA BLM / WOODHAWK WFM", "ST. JOE WFM · EST 2019 · IDAHO
PANHANDLE N.F."). Worth preserving, which is why we're re-hosting rather than
dropping them.

**The real cause is Google's CORP header, not our code.** The images are served
with:

    cross-origin-resource-policy: same-site

CORP is enforced by the **browser**, not the server. Google returns the image
bytes *and* a header saying only a same-site page may use them, so a patch
renders on Google's own My Maps page and is discarded everywhere else. This is
deliberate hotlink protection. No URL variant defeats it — stripping
`?authuser=0&fife=`, adding a referrer, resizing: the header comes back
regardless. Verified on every sampled image, with and without the query string.

**TWO EARLIER DIAGNOSES WERE WRONG. Do not revive them:**

1. *"The `*` is an unsubstituted placeholder / a bug in `atlas_import.py`'s
   `gx_media_links` extraction."* No. The literal `*` appears in all 114
   entries of the **source KMZ itself**, before our code touches it, and our
   stored values match the KMZ byte for byte. The `*` is Google's normal export
   format and has nothing to do with the failure. `atlas_import.py` is correct
   and needs no change.

2. *"The URLs return HTTP 200, so they aren't dead and this was a
   misdiagnosis."* Also no — this was my error. **curl does not implement CORP**,
   so it reports 200 and real image bytes for a URL no browser will ever
   display. All 114 return 200 from the command line and all 114 fail in a real
   browser. Command-line testing cannot detect this class of fault; only a
   browser can. That is the lesson worth keeping from this whole episode.

**DONE.** All 114 re-hosted and confirmed rendering in a real browser: the
load-test page reported 114/114, and the patches show in live crew popups.
Verified in the database afterwards — 0 rows still point at Google, 114 point at
Supabase Storage, 829 crews total, 715 still with no photo at all (untouched).

**The fix:** `photo_rehost.py` — downloads the originals, converts to WebP
(49.1 MB -> 4.4 MB at 900px/q82, transparency preserved), uploads to the
Supabase Storage bucket `crew-photos`, verifies each new URL is 200, an image,
and **not** CORP-locked, and only then rewrites the 114 `photo_url` values. The
other 715 crews are excluded by the query filter, not just by intent.
Backup in `photo_rehost_backup.json`; `--rollback` restores from it.

## National coverage
Now tracked as active work — see **"Finish nationwide coverage"** in
`TODO_NOW.md`. The project's goal is **all US fire crews nationwide**; the
current data is Western-heavy because that's what the source files gave us, not
because the scope stops there.

## Observability / sharing
- [x] **Vercel Web Analytics — DONE 2026-08-20.** Mounted in `app/layout.js`.
      Needs enabling in the Vercel dashboard to start collecting.

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
