# TODO_NOW — near-term, actively worked

Immediate next steps only. See `ARCHITECTURE.md` for the plan and
`TODO_LATER.md` for the deferred backlog.

## Phase 0 (data ready) — ✅ DONE
- [x] Switch `geocode.py` to Nominatim (free, town-level, no key)
- [x] Run geocoding → `crews_with_coords.json`
- [x] Fix the 3 towns that failed (town-name spacing typos):
  - [x] `CAVECREEK` → `CAVE CREEK, ARIZONA` (Tonto NF)
  - [x] `BRIDGERVILLE` → `BRIDGEVILLE, CALIFORNIA` (Six Rivers NF, Mad River)
  - [x] `TROUTLAKE` → `TROUT LAKE, WASHINGTON` (Gifford Pinchot NF)
- [x] Confirm 440/440 have non-null lat/lng (`still_missing.csv` empty)

## Phase 1 (the product) — ✅ map + filters done
- [x] Create a Supabase project (free tier)
- [x] Create a `crews` table (schema.sql) + grant anon read (fixes 42501)
- [x] Import all 440 crews into the `crews` table
- [x] Scaffold the Next.js app (deployable to Vercel)
- [x] Render a Leaflet + OSM map, no login. (It sat at `/` until 2026-08-18;
      it's at `/map` now, with a landing page at `/`.)
- [x] Load crews from Supabase (public anon key) and show all as pins — 440 live
- [x] Filter controls (state, region, crew type, housing) that narrow pins in
      real time, no reload

## Trust + corrections pass — 2026-08-21
Three decisions taken deliberately before sharing the site with real
firefighters. All three are the owner's calls, recorded here with the reasoning
so a later session doesn't quietly undo them.

- [x] **Hiring layer now defaults OFF.** Posting pins carry `zIndexOffset={1000}`
      and are larger than crew pins, so defaulting the layer on made job
      postings the loudest thing on a map whose stated purpose is finding crews.
      Crews first is the intended first impression. The toggle stays in the
      panel, and the landing page's hiring card links to **`/map?hiring=1`** so
      someone who arrived *for* the postings still lands with them on.
      Verified: cold load = 829 crew pins / 0 posting pins; `?hiring=1` = 58.

- [x] **Public correction reports** — `/submit?crew=<id>`, linked from the foot
      of every crew popup (gated by `NEXT_PUBLIC_SUBMISSIONS_ENABLED`, the same
      one switch as every other door into the submission flow).
      **Chosen over an email contact address on purpose:** one reviewed pipeline
      that already has RLS, a rate limit, and an email notification beats a
      second unstructured channel.
      Schema is `crew_corrections_schema.sql`. Key points:
      * `submission_kind` ('new_crew' | 'correction') + `crew_id` on the
        existing `crew_submissions` table — no second table, so no second RLS
        policy, trigger, or queue to keep in step.
      * `crew_name` / `agency` / `state` / `town` **lost their NOT NULL**, and a
        CHECK re-imposes them for `new_crew` only. Corrections don't carry those
        fields. Copying the target crew's values in was rejected outright: 316
        crews have no `crew_name` and most Atlas rows have no `town`, so it
        would have meant writing placeholder text to satisfy a constraint.
      * `approve_submission()` now **refuses** a correction — running it would
        create a duplicate crew from a report that the original was wrong.
        `resolve_correction()` closes a report out and deliberately does NOT
        touch `crews`; the fix is applied by hand.
      * **TWO REVIEW QUEUES NOW.** `pending_submissions` = new crews only;
        `pending_corrections` = corrections joined to the crew so the claim and
        the current value sit side by side.
      * `submission_notifications.sql` sends a different email per kind.

- [x] **About section on the landing page** (`/#about`), and the map panel's
      "About this map" link now points at it rather than at the hero, which
      explained nothing about the data.
      **This deliberately partially reverses the earlier privacy sweep** that
      removed data-sourcing disclosure — reinstated on purpose, for the
      liability/trust reason, not by forgetting that decision. The site uses
      agency names, FS region structure and live federal job postings and said
      nowhere that it isn't a government product; for an audience of federal
      employees that's the misunderstanding worth heading off.
      Still says nothing identifying: "a personal project", and the handcrew
      atlas is credited without being named or linked.
      Content: non-affiliation, the three data sources, and a "What it gets
      wrong" list (town-centre pins, unnamed crews, unknown housing, thin
      non-western coverage, duty-station-not-crew job postings).

## Pre-launch review — ✅ FIXES SHIPPED 2026-08-21
A deliberate pass over the first-time experience before the site goes to real
firefighters. Everything below was reproduced at a true 390x760 phone viewport
or against a deliberately broken Supabase host, not reasoned about.

### Mobile
- [x] **The filter drawer stranded its own bottom.** `.filter-panel.is-open` was
      `height: 100vh` (the LARGE viewport — same trap as the legend) AND
      `content-box`, so its 20px of padding sat outside the height. The drawer
      was therefore ~20px taller than the screen at best, and it is its own
      scroll container, so scrolled fully to the end "About this map" was still
      off-screen — on any device. On a real phone the toolbar took "Clear
      filters" too. Fixed with `box-sizing: border-box` + `100dvh`.
      Measured after: panel height == viewport exactly, both controls reachable.
- [x] **The submit form never got a mobile pass.** Every input was 14px, which
      makes **iOS Safari zoom the page in on focus and not zoom back out** — six
      text fields, six lurches. Now 16px (the threshold that disables it) and
      44px minimum targets, matching the map panel. Crew-type rows are 44px+.
- [x] Remaining `vh` swept to `dvh`: `.landing`/`.submit-page` `min-height`
      (was forcing ~90px of pointless scroll on a phone) and `.checkbox-list`.

### Error states
- [x] **Raw `TypeError: Failed to fetch` was shown to users.** The map's failure
      box printed `error.message` verbatim. Now the raw text goes to the console
      and the screen says "The map couldn't load", explains it's usually a
      connection problem, and offers **Try again** (the load was pulled into a
      `useCallback` so it can retry without a page reload).
- [x] **A dead host took ~40s to fail, showing only "Loading crews…"** the whole
      time — indistinguishable from a hang. After 8s it now says "Still loading
      crews…" with a note that a slow connection will do it.
- [x] **Added `app/error.js`.** Without it, any unhandled client exception showed
      Next's own production fallback: "Application error: a client-side
      exception has occurred (see the browser console)". Now plain words, a
      Try again that calls `reset()`, and a link to the map.
- [x] **Added `app/not-found.js`.** The built-in 404 was unstyled and, worse,
      had no links at all — a dead end you could only escape via the URL bar.
- [x] Checked and left alone: the geocode-failure copy on the submit form
      ("Couldn't find that town automatically. Send it anyway…") is already
      right, and the submit failure path already avoids raw text.

### Empty / edge states
- [x] **Zero results looked broken.** The only feedback was "Showing 0 of 829" —
      over a map still covered in amber posting pins, because Hiring is a
      separate layer that stays on. Now a centred card: "No crews match these
      filters", a Clear filters button, and — only when posting pins are
      actually on screen — a line saying the amber pins are jobs, not crews.
- [x] **`/submit` with JavaScript off** rendered a complete, typeable form whose
      submit button silently did nothing (React handles submit; there is no
      `action` fallback). Added a `<noscript>` notice so a contribution can't be
      swallowed in silence.

## Popup + mobile pass — ✅ DONE 2026-08-21
Three UI issues, all verified in Chrome at a real mobile viewport (a 390x760 /
390x844 frame, so the `max-width: 768px` rules genuinely applied — Chrome on
macOS refuses to make a *window* narrower than ~500px, which is why the frame).

- [x] **Agency is now in the crew popup**, as the FIRST row. It's the most
      identifying fact after the name, and it frames the rest: Forest and Region
      only mean anything for Forest Service crews, so leading with "Forest" was
      burying the one field that applies to all 829. Order matches the filter
      panel, where Agency also sits above Region.

- [x] **Honest fallback titles for the 316 crews with no `crew_name`.**
      Measured first: 316 of 829 (38%) have none — all `usfs_official`; 308 fall
      back to `district`, 8 to `forest`. The old title printed the raw value,
      so pins read "CLEAR CREEK RD" — which looks like a street address.
      Now `tidyPlaceName()` in `CrewPopup.js` title-cases it and expands the
      abbreviations (`RD`→Ranger District, `RDS`→Ranger Districts, `NF`→National
      Forest, `NP`→National Park), and a muted italic line under the title says
      **"Crew name not on file — showing the base"**.
      **Why not invent a name:** "Clear Creek Crew" would assert something the
      data doesn't say, and it produces nonsense for the 18 districts that
      aren't districts ("Supervisors Office", "PAWNEE NATIONAL GRASSLAND",
      "GRANGEVILLE AIR CENTER"). Showing the real place plus a stated gap keeps
      it truthful. Verified against all the awkward real values, including
      `LOCHSA/POWELL RD` → "Lochsa/Powell Ranger District".

- [x] **Legend fixed on mobile** — `.map-wrapper` was `height: 100vh`. On phone
      browsers `vh` is the LARGE viewport (the height with browser chrome
      hidden); the map fills the screen so nothing scrolls, the URL bar never
      hides, and the legend at `bottom: 10px` sat *underneath* the toolbar. Now
      `height: 100vh` followed by `height: 100dvh` — dynamic viewport height,
      which tracks the visible area. Desktop is unchanged (there vh == dvh).

- [x] **Also fixed, found while testing:** a tall crew popup autopanned flush to
      the top edge and its title landed under the floating "Filters" button and
      the "Showing N of N" chip — so the crew name was unreadable on a phone,
      which defeated the point of the title work above. Leaflet measures against
      the raw viewport and knows nothing about our own floating UI, so all three
      `<Popup>`s now pass `autoPanPaddingTopLeft={[5, 72]}`. Verified: the popup
      now stops at exactly y=72 and the title is the topmost element at its own
      coordinates.

## Phase 1 — CORE ✅ COMPLETE
- [x] Detail popup on pin click: crew name, forest, town/state,
      crew type, region, housing, website link (when present)
- [x] **Verify mobile usability** — verified 2026-07-25. Filter drawer
      opens/closes, the crew count stays visible when the drawer is closed, the
      legend collapses/expands, tap targets are finger-sized, and there is no
      horizontal overflow. Popup width confirmed at a true 390px (iPhone) after
      the `min-width` fix below. **Phase 1 is now fully done.**
- [x] Deploy to Vercel (live at https://usfiremaps.com)
      (note: popup shows the user-requested fields; `notes` was not included —
      add later if wanted)

## Phase 2.5 — "Currently hiring" jobs layer (ICING) — ✅ DONE
Owner-directed. Backend + map layer both shipped and verified. See
ARCHITECTURE.md for the decisions.
- [x] **Step 1 — Schema:** `jobs_schema.sql` — `jobs` table (composite upsert key
      `announcement_number,town,state`), public-read RLS + explicit grants
      (`select` to anon/authenticated, `all` to service_role — the 403 fix).
- [x] **Step 2 — Refresh script:** `refresh_jobs.py` — pull 0456+0462, drop
      >8-location noise, expand to town duty-stations, geocode (reuse
      `job_geocache.json`), upsert into `jobs` via the key (local-only), and
      clear postings that have closed. Re-runnable; won't wipe on a bad pull.
- [x] **Step 3 — Run + verify:** ran locally, `jobs` table populated (32 rows,
      good lat/lng + apply URLs). Migrated off the leaked legacy service_role key
      (that key is now confirmed REVOKED — legacy keys disabled project-wide,
      verified 2026-08-20 — and was never committed to git)
      to the new `sb_secret_` key (scripts already handled both formats).
- [x] **Map layer:** shipped as an amber ring on crews with a posting within
      50 mi, plus a "hiring nearby" crew filter.
      **⚠️ SUPERSEDED 2026-08-14 — both were removed.** Postings are their own
      amber teardrop markers now, one per town with a count. The ring implied a
      job-to-crew connection USAJOBS' data (a duty-station town, never a
      worksite) can't support. Kept here only as a record of what was built;
      see the "Postings as their own markers" section below for current
      behaviour, and don't reintroduce the ring.
- [x] **Automated + filterable:** daily GitHub Actions refresh; appointment /
      pay grade / salary filters; pay, grade and appointment shown per posting.

## Landing page + form voice — ✅ DONE (2026-08-18)
- [x] **`/` is now a landing page**; the map moved to **`/map`**. Explains what
      the site is, then three cards — find crews, see what's hiring, add a crew.
      The cards come from one `SECTIONS` array in `components/Landing.js`, and
      the grid is `auto-fit`, so a fourth section is one object and no CSS.
- [x] **Retired "the map IS the landing page."** It was right while the map was
      the only thing here; it stopped being right once a cold visitor had to
      discover a hiring layer and a submission form from a screen of dots.
      **No login was added** — that part of the old rule still stands.
- [x] Quiet "About this map" link on the map panel so `/map` isn't a dead end.
- [x] **Submission form copy rewritten** in the owner's voice — plainer, less
      polished, no startup-marketing gloss. Same claims, fewer flourishes.
- [x] Fixed `titleCaseState` capitalising "District Of Columbia".

## Visibility: analytics + submission alerts — ⚠️ NEEDS 2 SETUP STEPS
Added once the site went public, because both blind spots were created by the
launch itself.
- [x] **Vercel Web Analytics** (`@vercel/analytics`, mounted in `app/layout.js`).
      Page views and referrers only — no cookies, no cross-site tracking, so no
      consent banner needed. It's Vercel's own, on the same free tier, so it
      adds no service. **Why it matters:** coverage now depends on submissions
      arriving, and without measurement "no submissions" can't be told apart
      from "nobody saw the form."
- [ ] **OWNER STEP: turn Analytics on** in Vercel → project → Analytics tab →
      Enable. The code is deployed; data only starts collecting after that.
- [x] **Email alert on every new submission** (`submission_notifications.sql`) —
      a Postgres trigger calling Resend directly via `pg_net`. No Edge Function,
      no API route, no polling. Secrets live in Supabase Vault. The trigger
      swallows every error: a broken mailer must never cost us a submission.
- [ ] **OWNER STEP: create a free Resend account + API key**, then store it and
      your address in Vault and run `submission_notifications.sql`. Full
      instructions are in the header of that file.

## Public crew submissions (Phase 3 v1) — ✅ LIVE (2026-08-19)
Our answer to nationwide coverage: let the people who work the missing crews add
them, instead of hand-sourcing data. Nothing goes live without human approval.
- [x] `crew_submissions_schema.sql` — own table (NOT `crews`), anon INSERT only
      with no SELECT, status pinned to 'pending' by RLS, length/shape CHECKs, a
      rate-limit trigger (60/hour global, 5/day per email), plus
      `approve_submission()` / `reject_submission()` and a `pending_submissions`
      review view. Both functions are revoked from anon.
- [x] `/submit` page + `components/SubmitForm.js` — crew name, agency, town +
      state (geocoded live via Nominatim), crew types, optional website/notes,
      required email. Honeypot + 4-second minimum + 30s cooldown.
- [x] Map link gated behind `NEXT_PUBLIC_SUBMISSIONS_ENABLED === "true"`.
- [x] **Schema applied** in Supabase; a test submission was written, read back
      as `pending`, and `approve_submission()` exercised in a BEGIN/ROLLBACK.
- [x] **`NEXT_PUBLIC_SUBMISSIONS_ENABLED=true`** set in Vercel and redeployed
      (2026-08-19). Both entry points verified on the live domain.
      **Gotcha for next time:** it's a `NEXT_PUBLIC_` var, compiled in at build
      time. Setting it without a redeploy changes nothing — and it has to be
      the exact string `true`.
- **Reviewing:** `select * from pending_submissions;` then
  `select approve_submission(id);` or `select reject_submission(id, 'why');`

## Postings as their own markers — ✅ DONE (2026-08-14)
Replaced the amber crew ring. A posting is now its own object on the map.
- [x] **Amber teardrop per TOWN**, badged with a count when it holds more than
      one. Shape (not colour) separates it from a crew dot: crew pins are
      radius-6 circles and R2 is `#ff7f0e`, close enough to the hiring amber
      that a standalone amber dot would read as an R2 crew.
- [x] **One pin per town, never offset.** Every posting in a town shares a
      byte-identical coordinate — 48 of 98 share a point, Boise holds 6 — so
      one pin per posting would hide half of them. Spiderfying was rejected on
      principle: it fabricates precision USAJOBS never gave us.
- [x] **Removed:** the ring (flat and graded), `HIRING_BANDS`/`hiringBandFor`,
      the legend's three ring rows, and the "show only crews hiring nearby"
      crew filter.
- [x] **Kept:** the crew popup's list, reworded to **"Open postings near here"**
      — real computed distances, no ownership language.
- [x] **New files:** `components/PostingPopup.js`, `components/PostingList.js`
      (one posting renders identically in both places), `lib/formatting.js`.
- [x] **Verified in-browser:** 66 pins / 66 points; 16 badges totalling 98
      postings with the singles; 0 rings; crews unchanged at 829. Temporary →
      13 pins / 13 postings, Permanent → 56 / 83, crew count never moves.

## Agency filter — ✅ DONE (2026-08-14)
- [x] `agency_schema.sql` + `agency_backfill_dryrun.py` / `_commit.py` classify
      all 829 crews: usfs 582 · state 82 · nps 36 · local 28 · county 27 ·
      blm 20 · tribal 20 · unknown 17 · other 10 · bia 5 · fws 2.
- [x] `tribal` separate from `bia` (a nation is not the Bureau); FWS and USFWS
      are one agency; the 17 `unknown` show as a visible checkbox.
- [ ] **Optional, whenever:** hand-correct the 17 `unknown` rows in Supabase.
      Writes are guarded by `agency=eq.unknown`, so corrections survive
      re-runs. List them: `python3 agency_backfill_dryrun.py --unknown`.

## Panel UI: layers refactor + fixes — ✅ DONE
- [x] Reorganized the control panel into collapsible **layer sections**
      (reusable `LayerSection`): **Crews** = always-on base layer; **Hiring** =
      toggleable overlay. No tabs/pages inside the map itself. A future
      layer (e.g. Housing) is a clean add. See ARCHITECTURE.md decision.
- [x] Fixed multi-select dropdown layout: checkbox + label now inline on one
      left-aligned, fully-clickable row (out-specified the panel's stacked-label
      rule); regular weight; tighter spacing.
- [x] State filter labels now display title-case ("California") while filtering
      still uses the uppercase value.

## Deploy + key migration — ✅ DONE
- [x] Deployed to Vercel — **live at https://usfiremaps.com**
- [x] Key migration complete: app runs on the new `sb_publishable_` key
      (`NEXT_PUBLIC_SUPABASE_ANON_KEY`); the old legacy keys are disabled.

## Phase 2.6 — Handcrew Atlas merge — ✅ DONE (verified in Supabase)
Permission to USE the Atlas data is secured. The source KMZ is still NOT
republished — it, the review CSVs, and `state_geocache.json` /
`atlas_import_backup.json` all stay gitignored. See MERGE_PLAN.md for the plan.
- [x] **Schema:** `atlas_schema.sql` — additive + idempotent. Adds `crew_name`,
      `photo_url`, and `source` to `crews`; backfills `source='usfs_official'`;
      makes it NOT NULL with a default and a check constraint allowing
      `usfs_official` / `handcrew_atlas` / `user_submitted` (so Phase 3 community
      rows need no further migration). Grants + a `source` index for rollback.
- [x] **Import:** `atlas_import.py` — folds the 527-placemark KMZ in by proximity
      (≤5 mi) + forest-name confirmation. Dry-run by default, `--commit` writes,
      `--rollback` undoes; snapshots pre-merge state to `atlas_import_backup.json`.
- [x] **Ran + verified: `crews` is now 829 rows.**
      - 440 curated rows unchanged, still `source='usfs_official'`
      - 124 of them **enriched** with an Atlas crew name (+ photo/website where
        the Atlas had one). Website = Atlas link OR keep ours (never blanked);
        `resource` / `state` fill ONLY when ours was blank — curated values are
        never overwritten.
      - 389 **new** rows tagged `source='handcrew_atlas'` (crews only the Atlas
        has, incl. non-USFS TNC/NPS/BLM/BIA/state). Region/district/town/housing
        left NULL — the Atlas doesn't have them; those pins still show.
      - **Crew type extracted from crew names** into our exact labels, plus two
        NEW labels: **Suppression Module** and **Fire Effects**.
      - **State reverse-geocoded** from coordinates (cached, `state_geocache.json`).
- [x] Committed `atlas_schema.sql`, `atlas_import.py`, and the `.gitignore`
      additions; confirmed no third-party data or caches were committed.

## Atlas follow-ups — ✅ DONE (UI has caught up with the merge)
- [x] **Crew names + photos in the popup.** `CrewPopup.js` now titles each popup
      with `crew_name`, falling back to district → forest → "Unnamed crew".
      `photo_url` renders as a bounded image that hides itself if it fails to
      load. **Known issue:** the Google My Maps photo URLs currently 404 (all
      114 of them) — see TODO_LATER.
- [x] **"Suppression Module" + "Fire Effects" added to the crew-type filter**,
      each with its own SVG glyph and color in `lib/crewTypes.js` + the legend
      (deep-teal droplet / olive magnifier). Colors were chosen by measuring
      CIELAB deltaE against both palettes so nothing clashes across modes.

## Phase 2.7 — Atlas region backfill — ✅ DONE (written + verified)
Filled `region` for Atlas crews by matching their forest to our curated data,
plus an explicit table for forests we hold no curated crew for.
- [x] **`region_backfill_dryrun.py`** — the matcher, read-only, no write path at
      all. Normalization started from `atlas_import.py` and was tuned (see the
      note in the file): `national`/`forest`/`district` added as stopwords and
      `mount`→`mt`, because the curated data mixes "GILA NF" with "PAYETTE
      NATIONAL FOREST" and the mismatch was scoring correct pairs at 0.50.
      Adds a hard non-USFS gate (BLM/NPS/BIA/TNC/state/county) and a
      "distinctive token" rule so generic words like "river" can't carry a
      match. Has a REGRESSION CHECK block naming the specific rows that were
      previously wrong — keep it passing.
- [x] **`region_backfill_commit.py`** — dry-run by default, `--commit` writes,
      `--rollback` undoes; snapshots to `region_backfill_backup.json` (gitignored)
      before the first write. Imports the matcher rather than copying it.
- [x] **Ran + verified in Supabase: 85 of 389 assigned.**
      R5 36 · R8 10 · R3 9 · R2 8 · R6 8 · R4 6 · R1 4 · R9 2 · R10 2.
      Zero false positives. 304 correctly left NULL (113 non-USFS, 127 no forest
      name, 64 state/tribal/county).
- [x] **R8/R9/R10 added** to `lib/regions.js` with new colors; `Legend.js` is
      gated to regions that actually have crews, so they only appear now that
      data exists. (There is no Region 7 — the numbering really does skip.)
- [x] **CDATA / non-breaking-space cleanup** — same script, phase 2. Found **58**
      rows, not the 3 originally spotted: 3 with `<![CDATA[...]]>` wrappers and
      55 with non-breaking spaces (which block line-wrapping and widened
      popups). All 58 cleaned and verified; 3 were curated rows enriched by the
      Atlas, so the write is guarded by id, not by source.

## Nationwide coverage — ⬜ OPEN, strategy settled 2026-08-15
**This project covers all US fire crews nationwide.** The data doesn't match
that yet. Where we are: the original curated file covered **R1–R6 only**, and
the Handcrew Atlas added our **first ~14 crews in R8/R9/R10** — whatever the
Atlas happened to include, not deliberate coverage of those regions.

**HOW WE'RE CLOSING IT: public submissions, not manual sourcing.**
This section used to call for going out and finding comprehensive R8/R9/R10
crew data ourselves. That plan was **dropped on 2026-08-15** in favour of
letting the people who work those crews add them — see "Public crew
submissions" above. Don't restart the hand-sourcing effort thinking it's still
the plan; it was replaced, not forgotten.

Why: the missing crews are mostly non-USFS (state, county, tribal, local), and
no single public dataset covers them the way the Forest Service list covered
R1–R6. Someone who works a crew knows it better than any list we could go find.

The trade-off, stated plainly: this fills in **slowly and unevenly**, and only
where someone bothers to submit. That's accepted. It also means coverage now
depends on the submission form being findable and working — so that feature is
load-bearing for the project's core goal, not a nice-to-have.

- [ ] **Watch whether submissions actually arrive** once the form is live. If
      months pass with none, the strategy needs revisiting — that's the signal,
      not a fixed date.
- [ ] **Consider seeding it** if uptake is slow: approaching a few crews
      directly beats a general appeal, and each approved submission makes the
      map more worth submitting to.
- [ ] **Until coverage lands, don't overstate it in the UI.** Thin regions should
      read as "we're still building this out," not as "no crews here." (The
      legend is already gated to regions that actually have crews.)
- [x] **Recenter the map on the whole continental US.** Done — `US_CENTER` in
      `components/CrewMap.js` moved from `[42, -113]` / zoom 5 (Western-centered,
      which left our R8/R9/R10 crews off-screen on first load) to `[39.5, -98.5]`
      / zoom 4.
- [ ] **Make Alaska (R10) reachable on first load.** The continental-US view
      above still leaves Alaska off-screen, so those crews are only findable by
      panning. Options: an inset, a "jump to Alaska" control, or fitting bounds
      to the data. Worth doing as R10 coverage grows.
- [ ] **Revisit the default view once the data is fuller.** If pins end up truly
      spread nationwide, consider fitting the initial view to the data's bounds
      instead of a hardcoded center/zoom.
