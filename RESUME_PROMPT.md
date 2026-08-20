# RESUME_PROMPT — paste into a fresh Claude Code session

Copy everything in the block below and paste it as your first message in a new
Claude Code session opened in this project. It brings a zero-context session
fully up to speed and tells it exactly where to pick up.

---

```
We're resuming work on the "Crew Map" project. You have NO prior context, so
load it before doing anything.

1. Read these files first, in this order, to get full context:
   - CLAUDE.md            (how to work on this codebase; the rules)
   - ARCHITECTURE.md      (the plan: goal, stack, decisions, phases)
   - TODO_NOW.md          (immediate tasks)
   - TODO_LATER.md        (deferred backlog)
   - SESSION_SYNOPSIS.md  (plain-language summary of everything done so far)

2. Then STOP and tell me, in a few lines:
   - a short summary of where the project currently stands
   - what the immediate next action is
   Do NOT change any files or run anything yet — confirm with me first.

3. Here is where we are:
   - The app is LIVE at https://usfiremaps.com (custom domain since
     2026-08-19; registered + DNS at Cloudflare, both records CNAME'd to
     Vercel and set to DNS-ONLY on purpose — proxying them breaks Vercel's
     cert and causes a redirect loop. www.usfiremaps.com 308-redirects to the
     bare domain, which is canonical. crew-map-five.vercel.app STILL WORKS and
     is deliberately not redirected, so old bookmarks survive — don't "tidy"
     that away.) (Next.js on Vercel,
     Supabase, Leaflet/OSM). "/" is a LANDING PAGE explaining the site; the
     MAP is at "/map". The old "map IS the landing page" rule was retired
     2026-08-18 — don't restore it. No login anywhere, which is the part that
     still matters.
   - Phase 0 (data) and Phase 1 (map + filters + popup + deploy + mobile) are
     FULLY DONE. Mobile was verified in a browser at a true 390px. There is no
     remaining CORE work — everything below is ICING or a decision to make.
   - Phase 2.5 "currently hiring" (USAJOBS) is DONE end-to-end:
     * Backend: jobs_schema.sql + refresh_jobs.py pull open fire jobs (series
       0456 + 0462), drop noise, geocode, and upsert into a public-read `jobs`
       table. RUNS ITSELF DAILY via GitHub Actions
       (.github/workflows/refresh-jobs.yml, 09:17 UTC, plus a manual Run
       workflow button) — do NOT run it by hand. Creds are encrypted Actions
       secrets; the Supabase one is a SEPARATE CI-only secret key.
     * Map layer: POSTINGS ARE THEIR OWN MARKERS — an amber teardrop per TOWN,
       badged with a count when it holds more than one. There is NO amber ring
       on crews any more and no "hiring nearby" crew filter; both were removed
       2026-08-14. Do not reintroduce either. Reason: USAJOBS gives a
       duty-station TOWN, never a worksite (it reports one coordinate per city
       across all 155), so a ring drawn on a crew claimed a job-to-crew
       connection the data can't support. A pin claims only "there are openings
       in this town".
       - One pin per TOWN because every posting in a town shares a
         byte-identical coordinate (48 of 98 postings share a point; Boise
         holds 6). DO NOT offset or spiderfy them — that fabricates precision
         we don't have, which is the same mistake the ring made.
       - Crew popups KEEP a passive "Open postings near here" list (50 mi, real
         computed distances, no ownership language). That's fine; it's a
         geographic fact, not a claim about the crew.
     * Hiring filters: appointment (Permanent/Temporary), pay grade (derived
       from the data, currently 2-13), salary ("at least" thresholds). They
       narrow POSTINGS only — the crew count never moves. Pay is displayed
       exactly as advertised ($/hr stays $/hr); the annualized figure is for
       sorting and is never shown.
   - The AGENCY filter is DONE. crews.agency classifies all 829 rows (usfs 582,
     state 82, nps 36, local 28, county 27, blm 20, tribal 20, unknown 17,
     other 10, bia 5, fws 2). 'tribal' is deliberately separate from 'bia'; FWS
     and USFWS are ONE agency. The 17 'unknown' are shown honestly as a
     checkbox and are hand-correctable in Supabase — every write is guarded by
     agency=eq.unknown so your corrections survive re-runs.
   - Phase 2.6 "Wildland Fire Handcrew Atlas" merge is DONE and verified in
     Supabase. Permission to USE the Atlas data is now SECURED (it was pending
     before) — but the source KMZ is still NOT republished; it, the review CSVs,
     state_geocache.json and atlas_import_backup.json all stay gitignored.
     * atlas_schema.sql added three columns to `crews`: crew_name, photo_url,
       and source (provenance on every row: usfs_official / handcrew_atlas /
       user_submitted, NOT NULL + check constraint, so Phase 3 community
       contributions need no further migration).
     * atlas_import.py folded the KMZ in by proximity (<=5 mi) + forest-name
       confirmation. Dry-run by default; --commit writes; --rollback undoes.
     * RESULT: `crews` is now 829 rows. The 440 curated rows are unchanged
       (still usfs_official); 124 of them were ENRICHED with an Atlas crew name
       (+ photo/website where the Atlas had one) — curated values are never
       overwritten and the website is never blanked. 389 NEW rows were added
       tagged source='handcrew_atlas', with crew type extracted from the crew
       names and state reverse-geocoded from the coordinates. Those new rows
       have NULL region/district/town/housing (the Atlas doesn't have them);
       the pins still show.
     * Crew-type extraction introduced two NEW labels: "Suppression Module"
       and "Fire Effects".
   - The Atlas UI catch-up is DONE: popups are titled with the real crew_name
     (falling back district -> forest -> "Unnamed crew"), photo_url renders as a
     bounded image that hides itself if it fails to load, and both new crew-type
     labels are filterable with their own glyph + color in the legend. Blank
     Forest/Location/Region rows are omitted rather than shown empty.
   - Phase 2.7 "Atlas region backfill" is DONE and verified in Supabase:
     * 85 of the 389 Atlas crews were given a `region` — 52 exact + 19 fuzzy
       borrowed by matching their forest name to the curated 440, plus 14 from
       an EXPLICIT R8/R9/R10 table for Eastern/Southern/Alaska forests we hold
       no curated crew for (nothing to borrow from).
     * 304 are deliberately still NULL: 113 non-USFS units (BLM/NPS/BIA/TNC/
       state/county), 127 with no forest name at all, 64 state/tribal/county
       agencies. NULL is the honest answer for these — do NOT try to "fix" it.
     * region_backfill_dryrun.py is the matcher (read-only, no write path);
       region_backfill_commit.py writes (dry-run default, --commit, --rollback)
       and IMPORTS the matcher so the two can't drift. The dry-run has a
       REGRESSION CHECK block naming rows an earlier buggy version got wrong —
       keep it passing if you touch the matching.
     * R8/R9/R10 were added to lib/regions.js; Legend.js is gated on which
       regions actually have crews, so they only appear now that data exists.
       (There is no Region 7 — the 6->8 jump is real, not a typo.)
     * The same run cleaned 58 rows of CDATA / non-breaking-space artifacts left
       in crew_name by the original Atlas import.
   - Supabase keys migrated to the new system: app uses the sb_publishable_ key,
     local scripts use the sb_secret_ key, and the old legacy keys are DISABLED.
   - The control panel was refactored into collapsible LAYERS (Crews = base,
     Hiring = toggleable overlay) — built so a Housing layer is a clean add.

   - PUBLIC CREW SUBMISSIONS (Phase 3 v1) are LIVE as of 2026-08-19. Anyone
     can submit a crew from the site. Schema is applied, the env flag is set
     in Vercel, and both entry points render: the "Submit a crew" card on "/"
     and "+ Add a missing crew" on the map panel. Verified end to end on the
     live site (landing card -> /submit -> form).
     crew_submissions_schema.sql + /submit + components/SubmitForm.js.
     Submissions go to their own crew_submissions table (NEVER directly into
     crews), anon can INSERT but NOT SELECT (it holds emails), RLS pins
     status='pending', a trigger rate-limits, and approve_submission(id) copies
     an approved row into crews with source='user_submitted'.
     REVIEW THE QUEUE: `select * from pending_submissions;` then
     `select approve_submission(id);` or `select reject_submission(id,'why')`.
     NOTHING a stranger submits reaches the map without that approval.
     KILL SWITCH: set NEXT_PUBLIC_SUBMISSIONS_ENABLED to anything but "true"
     in Vercel and REDEPLOY. It is a NEXT_PUBLIC_ var, so it is compiled into
     the bundle at build time — changing it without a rebuild does nothing.
     Known limitations were accepted deliberately, not missed; they're written
     up in TODO_LATER.md (rate limit doubles as a DoS vector, broad sequence
     grant, no retention policy on reviewed rows).

4. Open items (confirm with me before starting anything):

   a) NATIONWIDE COVERAGE — the gap is real, but the PLAN IS SETTLED.
      THIS PROJECT IS NATIONWIDE — all US fire crews, every region. Nothing
      about the scope is Western-only; the DATA is just incomplete. The
      original curated file covered R1-R6 only, and the Atlas merge added our
      first ~14 R8/R9/R10 crews.
      **We are closing the gap with PUBLIC SUBMISSIONS, not by hand-sourcing
      datasets.** That decision was made 2026-08-15. An earlier version of this
      file told you to go find comprehensive R8/R9/R10 data — DO NOT restart
      that; it was replaced, not forgotten. The missing crews are mostly
      non-USFS (state, county, tribal, local) and no single public dataset
      covers them.
      Consequence: the submission form is load-bearing for the project's core
      goal, not a nice-to-have. Coverage fills in slowly and unevenly, which is
      accepted. Until it lands, thin regions should read in the UI as "still
      building this out," never as "no crews here."

   b) FIX THE DEAD ATLAS PHOTO URLS. All 114 stored photo_url values fail to
      load — verified by load-testing them in a browser. Every one contains a
      literal `*` in the path (.../hostedimage/m/*/3AE5a_...), which looks like
      an unsubstituted placeholder, so the bug is probably in atlas_import.py's
      gx_media_links extraction rather than in the data. Low urgency because
      CrewPopup.js hides an image that fails, so popups already look right —
      the photo feature is just inert. Investigate the extraction, re-run the
      import for photo_url only, and don't regress the graceful-hide behavior.

   c) DONE (2026-08-14) — refresh_jobs.py is automated. Nothing to do here.
      Only relevant if the hiring data ever looks stale: GitHub DISABLES
      SCHEDULED WORKFLOWS AFTER 60 DAYS of repo inactivity, so check the
      Actions tab before debugging anything else.

   d) (Backlog) Add Vercel Web Analytics (free tier) before sharing the link
      widely, so we can tell whether anyone actually uses it.

   e) (Future big build) Add a Housing layer to the layers panel. The panel was
      built as reusable LayerSections so this is an addition, not a rewrite.
      Note the 389 Atlas rows have NULL housing, so they'll read as unknown.

   f) (Maintenance, not urgent) Next.js is two majors behind (14.2.35) and
      `npm audit` reports 2 high advisories via Next + its bundled postcss.
      Assessed as NOT exploitable here — this app has no API routes,
      middleware, Server Actions, next/image, rewrites or i18n; it's a
      client-rendered map (ssr: false). Treat the upgrade as scheduled
      maintenance, not an emergency, but don't leave it forever.

5. Subagents available:
   - code-reviewer (.claude/agents/code-reviewer.md) — read-only, reviews code
   - github-manager (.claude/agents/github-manager.md) — handles all git ops;
     use this for commits and pushes.

6. Safety rules — never violate these:
   - App uses ONLY the public sb_publishable_ key (NEXT_PUBLIC_SUPABASE_ANON_KEY).
   - The secret key (sb_secret_) is for local scripts only — never in app code,
     screenshots, or git. NEVER paste any key into chat — one leaked this way
     before. That key is CONFIRMED DEAD (legacy API keys are disabled
     project-wide, verified 2026-08-20) and was never committed to git
     (verified by scanning all history). Note that with Supabase, issuing a new
     key does NOT revoke an old legacy one — only disabling legacy keys or
     rotating the JWT secret does.
   - Stay $0: Next.js/Vercel + Supabase + Leaflet/OpenStreetMap (+ free
     USAJOBS/Nominatim at build time only). No paid keys.
   - No login gate to view anything. ('/' = landing page, '/map' = the map.)
   - RLS stays public-read only (no write policies until Phase 3).
   - Environment variables don't persist between Terminal sessions — re-export
     the secret key if running refresh_jobs.py / import_to_supabase.py /
     region_backfill_commit.py.
   - Practical consequence: Claude CANNOT run the write scripts itself. Its
     shell state doesn't persist between commands, so the only way would be one
     command containing the key, which would put the secret in the chat
     transcript. Claude should hand you the exact command to run in your own
     terminal, then verify the result with a read-only query using the PUBLIC
     key. Don't work around this.

Start by reading the files in step 1, then give me the short summary in step 2.
```

---

(That block is self-contained — the new session learns the rest from the files
it reads.)
