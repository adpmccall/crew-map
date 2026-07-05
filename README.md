# Crew Map

Interactive map of US Forest Service fire crews. The map is the landing page:
open the site and you immediately see all crews as dots on a free
OpenStreetMap-tiled Leaflet map, loaded from Supabase. No homepage, no login.

See `ARCHITECTURE.md` for the full plan and `CLAUDE.md` for how we work.

## Run it locally

1. Install dependencies (first time only):

   ```sh
   npm install
   ```

2. Set up your Supabase connection (public anon key only):

   ```sh
   cp .env.example .env.local
   ```

   Then edit `.env.local` and fill in `NEXT_PUBLIC_SUPABASE_URL` and
   `NEXT_PUBLIC_SUPABASE_ANON_KEY` from your Supabase project
   (Project Settings → API). `.env.local` is gitignored, so your values are
   never committed.

3. Start the dev server:

   ```sh
   npm run dev
   ```

   Open http://localhost:3000 — the map should load with all crew pins.

## Stack (all free / $0)

- **Next.js** (React) — the app, deployable to Vercel.
- **Supabase** — Postgres + auto REST API; the app reads crews with the public
  anon key.
- **Leaflet + OpenStreetMap** — the map and tiles, no API key.
