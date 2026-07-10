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
   - Phase 0 is 100% complete: 440 crews geocoded and imported into Supabase.
   - GitHub repo is live at github.com/adpmccall/crew-map (public).
   - Phase 1 frontend is largely complete:
     * Next.js app scaffolded (App Router, plain JS, Next.js 14.2.35)
     * Leaflet + OpenStreetMap map IS the landing page (no homepage/splash/login)
     * All 440 crew pins load from Supabase via anon key only
     * Regional color coding with legend (R1–R6)
     * Click popup showing crew details
     * Filter panel with State, Region, Crew Type, Housing filters
     * Zoom controls positioned bottom-right
     * Multi-select checkboxes for State/Region/Crew Type were just requested
       at session end — CHECK if this is done before building anything new.

4. Immediate next steps (in order):
   a) Check if multi-select checkboxes for State, Region, and Crew Type are
      working. If not complete, finish them first.
   b) Add crew-type symbol mode: a toggle that switches pins from "color by
      region" to "symbol by crew type" using Leaflet DivIcon with emojis:
      - Hotshot (IHC) → text label "IHC"
      - Engine → 🚒
      - Helitack → 🚁
      - Smokejumper → ✈️
      - Rappel → 🚁 with small "R" to distinguish from Helitack
      Update the legend to match whichever mode is active.
   c) Deploy to Vercel (free tier) — connect the GitHub repo and get a live
      public URL. The site needs NEXT_PUBLIC_SUPABASE_URL and
      NEXT_PUBLIC_SUPABASE_ANON_KEY set as environment variables in Vercel
      (NOT the service_role key — anon/publishable key only).

5. Subagents available:
   - code-reviewer (.claude/agents/code-reviewer.md) — read-only, reviews code
   - github-manager (.claude/agents/github-manager.md) — handles all git ops;
     use this for commits and pushes. It WILL be available since this is a
     fresh session.

6. Safety rules — never violate these:
   - App uses ONLY the public anon/publishable key (NEXT_PUBLIC_SUPABASE_ANON_KEY)
   - service_role / secret key is for local import only — never in app code,
     screenshots, or git
   - Stay $0: Next.js/Vercel + Supabase + Leaflet/OpenStreetMap only
   - Map IS the landing page: no homepage, splash, or login to view
   - RLS stays public-read only (no write policies until Phase 3)
   - Environment variables don't persist between Terminal sessions — re-export
     SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY if running import scripts

Start by reading the files in step 1, then give me the short summary in step 2.
```

---

(That block is self-contained — the new session learns the rest from the files
it reads.)
