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

## Begin Phase 1 (the product — map is the landing page)
- [ ] Create a Supabase project (free tier)
- [ ] Create a `crews` table matching the 12 data fields + lat/lng
- [ ] Import `crews_with_coords.json` into the `crews` table
- [ ] Scaffold the Next.js app (deployable to Vercel)
- [ ] Render a Leaflet + OSM map centered on the continental US
- [ ] Load crews from Supabase and show all (coord-having) crews as pins
- [ ] Make the map the landing page: opening the URL shows it immediately
      (no homepage, no splash, no login)
