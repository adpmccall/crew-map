#!/usr/bin/env python3
"""
geocode.py — fills in latitude/longitude for the crew data.

WHAT IT DOES
  Reads  crews_cleaned.json
  Looks up coordinates for each crew's town + state using the free
  OpenStreetMap "Nominatim" geocoder (no API key, no signup, no cost).
  Writes crews_with_coords.json  (map-ready)
  Also writes still_missing.csv listing any it couldn't find, so you
  can fix those few by hand.

WHY NOMINATIM (and not the Census geocoder)
  Our data only has a town + state (no street address). The US Census
  geocoder only resolves full street addresses, so "BUTTE, MONTANA"
  returns zero matches there. Nominatim is OpenStreetMap's geocoder and
  it *does* understand towns/cities. It's also the same OpenStreetMap
  project that already gives us our map tiles, so we're not adding a new
  paid service — still $0, still no key.

HOW TO RUN  (on your own computer, not inside Claude)
  1. Install Python 3 if you don't have it: https://www.python.org/downloads/
  2. Open a terminal in the folder that has this file AND crews_cleaned.json
  3. Run:   pip install requests
  4. Run:   python geocode.py
  It will print progress. When done you'll have crews_with_coords.json.

NOTES
  - Nominatim's free public server asks that we send AT MOST 1 request per
    second and identify ourselves with a "User-Agent". We do both. With one
    lookup per second, 440 records takes roughly 8 minutes. Let it finish.
  - Safe to re-run. It only looks up records that don't have coords yet,
    so if it's interrupted, just run it again and it resumes.
"""

import json, csv, time, sys

try:
    import requests
except ImportError:
    print("Missing 'requests'. Run:  pip install requests")
    sys.exit(1)

INPUT  = "crews_cleaned.json"
OUTPUT = "crews_with_coords.json"
MISSING = "still_missing.csv"

# Nominatim's free server. The "search" endpoint takes a free-form address.
NOMINATIM_URL = "https://nominatim.openstreetmap.org/search"

# Nominatim REQUIRES a User-Agent that identifies the app + a contact, or it
# may block the request. (This is their stated usage policy, not optional.)
HEADERS = {"User-Agent": "crew-map/1.0 (firecrewreview@gmail.com)"}

def geocode(town, state):
    """Return (lat, lng) or (None, None) using the free Nominatim geocoder."""
    # We add ", USA" so a town name isn't matched to a same-named place abroad.
    query = f"{town}, {state}, USA"
    params = {
        "q": query,
        "format": "json",
        "limit": 1,            # we only want the single best match
        "countrycodes": "us",  # extra guard: keep results inside the US
    }
    try:
        r = requests.get(NOMINATIM_URL, params=params, headers=HEADERS, timeout=20)
        r.raise_for_status()
        results = r.json()
        if results:
            # Nominatim returns lat/lon as strings, so convert to float.
            return round(float(results[0]["lat"]), 5), round(float(results[0]["lon"]), 5)
    except Exception as e:
        print(f"   (error on '{query}': {e})")
    return None, None

def main():
    with open(INPUT, encoding="utf-8") as f:
        data = json.load(f)

    total = len(data)
    need = [r for r in data if not r.get("latitude")]
    print(f"{total} records total; {len(need)} need coordinates.\n")

    done = 0
    for i, r in enumerate(data, 1):
        if r.get("latitude"):      # already has coords (resume support)
            continue
        lat, lng = geocode(r["town"], r["state"])
        r["latitude"], r["longitude"] = lat, lng
        done += 1
        status = f"{lat},{lng}" if lat else "NOT FOUND"
        print(f"[{i}/{total}] {r['town']}, {r['state']} -> {status}")
        time.sleep(1.1)   # stay under Nominatim's 1-request-per-second limit

        # save progress every 25 so nothing is lost if interrupted
        if done % 25 == 0:
            with open(OUTPUT, "w", encoding="utf-8") as f:
                json.dump(data, f, indent=2, ensure_ascii=False)

    # final save
    with open(OUTPUT, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)

    # report what's still missing
    missing = [r for r in data if not r.get("latitude")]
    with open(MISSING, "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["town", "state", "location", "forest", "district"])
        for r in missing:
            w.writerow([r["town"], r["state"], r["location"], r["forest"], r["district"]])

    found = total - len(missing)
    print(f"\nDone. {found}/{total} geocoded.")
    print(f"Wrote {OUTPUT}")
    if missing:
        print(f"{len(missing)} still missing -> see {MISSING} (fix those few by hand).")
    else:
        print("Everything geocoded!")

if __name__ == "__main__":
    main()
