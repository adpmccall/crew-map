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
   - a short summary of where the project currently stands, and
   - what the immediate next action is.
   Do NOT change any files or run anything yet — confirm with me first.

3. The immediate next step is the Supabase data load. First ASK me whether
   schema.sql has been run and the 440 rows imported into Supabase yet:
   - If NOT done: help me run schema.sql (creates the `crews` table) and then
     import_to_supabase.py (loads all 440 rows from crews_with_coords.json,
     converting blanks to NULL). The import needs SUPABASE_URL and
     SUPABASE_SERVICE_ROLE_KEY set as environment variables locally only.
   - If already done (table shows 440 rows): move on to Phase 1 — scaffold the
     Next.js app and render the Leaflet + OpenStreetMap map as the landing page,
     showing all crews as pins loaded from Supabase. Then have the read-only
     code-reviewer subagent (.claude/agents/code-reviewer.md) review the work.

4. Respect these safety rules at all times:
   - The website may use ONLY the public Supabase "anon" key. The "service_role"
     key is for the LOCAL import ONLY — never put it in app code, screenshots,
     or git.
   - Stay $0: Next.js/Vercel + Supabase + Leaflet/OpenStreetMap only. No paid
     keys or services (no Mapbox/Google Maps).
   - The map IS the landing page: opening the URL shows the interactive map
     immediately — no homepage, no splash, and no login to view. Viewing and
     searching are always login-free; only future editing (Phase 3) needs auth.
   - Keep Supabase Row Level Security as-is: public read, no writes.

Start by reading the files in step 1, then give me the summary in step 2.
```

---

(That block is self-contained — the new session learns the rest from the files
it reads.)
