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
   - The app is LIVE at https://crew-map-five.vercel.app (Next.js on Vercel,
     Supabase, Leaflet/OSM). The map IS the landing page (no homepage/login).
   - Phase 0 (data) and Phase 1 (map + filters + popup + deploy) are DONE, except
     one item: mobile usability has NOT been verified in a browser yet.
   - Phase 2.5 "currently hiring" (USAJOBS) is DONE end-to-end:
     * Backend: jobs_schema.sql + refresh_jobs.py pull open fire jobs (series
       0456 + 0462), drop noise, geocode, and upsert into a public-read `jobs`
       table (32 rows). Run MANUALLY for now (no scheduler yet).
     * Map layer: browser-side 50-mi proximity match (lib/proximity.js); amber
       ring on crews hiring nearby (both symbolize modes); a "hiring nearby"
       filter; popup lists nearby postings with Apply-on-USAJOBS links; an
       "updated {date}" freshness label. ~90/440 crews lit up when measured
       (that count predates the Atlas merge below).
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
       (still usfs_official); 138 of them were ENRICHED with an Atlas crew name
       (+ photo/website where the Atlas had one) — curated values are never
       overwritten and the website is never blanked. 389 NEW rows were added
       tagged source='handcrew_atlas', with crew type extracted from the crew
       names and state reverse-geocoded from the coordinates. Those new rows
       have NULL region/district/town/housing (the Atlas doesn't have them);
       the pins still show.
     * Crew-type extraction introduced two NEW labels: "Suppression Module"
       and "Fire Effects".
   - Supabase keys migrated to the new system: app uses the sb_publishable_ key,
     local scripts use the sb_secret_ key, and the old legacy keys are DISABLED.
   - The control panel was refactored into collapsible LAYERS (Crews = base,
     Hiring = toggleable overlay) — built so a Housing layer is a clean add.
   - Mobile responsive CSS was added (drawer + collapsible legend + tap targets)
     but is committed as [UNVERIFIED] — it has NOT been tested at ~390px.

4. Immediate next steps (in priority order — confirm with me before starting):
   a) VERIFY MOBILE at ~390px (iPhone width): filter drawer opens/closes, the
      count stays visible when closed, the legend collapses/expands, tap targets
      are finger-sized, and crew popups don't overflow. This is the last Phase 1
      CORE item. Fix anything that's off, then mark it done in TODO_NOW.md +
      ARCHITECTURE.md.
   b) ATLAS FOLLOW-UP — wire crew names + photos into the popup. `crews` now has
      crew_name and photo_url, but components/CrewPopup.js still titles each
      popup with the ranger district, and its opening comment ("this dataset has
      no dedicated crew name field") is now out of date. Use crew_name when
      present, fall back to district -> forest, and decide how/whether to show
      photo_url (those URLs are Google My Maps-hosted and may not be
      hotlink-stable long term).
   c) ATLAS FOLLOW-UP — add "Suppression Module" and "Fire Effects" to the
      crew-type filter. The import writes both labels, but the curated
      CREW_TYPES list in components/CrewMap.js doesn't include them, so those
      crews can't be filtered for. Also decide whether each needs a symbol in
      lib/crewTypes.js + the legend, or should fall through to "Other".
   d) (Backlog, when ready) Automate refresh_jobs.py via GitHub Actions (cron),
      with Supabase + USAJOBS creds as encrypted Actions secrets.
   e) (Backlog) Add Vercel Web Analytics (free tier) before sharing the link.
   f) (Future big build) Add a Housing layer to the layers panel. Note the 389
      Atlas rows have NULL housing, so they'll read as unknown.

5. Subagents available:
   - code-reviewer (.claude/agents/code-reviewer.md) — read-only, reviews code
   - github-manager (.claude/agents/github-manager.md) — handles all git ops;
     use this for commits and pushes.

6. Safety rules — never violate these:
   - App uses ONLY the public sb_publishable_ key (NEXT_PUBLIC_SUPABASE_ANON_KEY).
   - The secret key (sb_secret_) is for local scripts only — never in app code,
     screenshots, or git. NEVER paste any key into chat (one leaked before and
     had to be rotated).
   - Stay $0: Next.js/Vercel + Supabase + Leaflet/OpenStreetMap (+ free
     USAJOBS/Nominatim at build time only). No paid keys.
   - Map IS the landing page: no homepage, splash, or login to view.
   - RLS stays public-read only (no write policies until Phase 3).
   - Environment variables don't persist between Terminal sessions — re-export
     the secret key if running refresh_jobs.py / import_to_supabase.py.

Start by reading the files in step 1, then give me the short summary in step 2.
```

---

(That block is self-contained — the new session learns the rest from the files
it reads.)
