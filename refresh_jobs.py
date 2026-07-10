#!/usr/bin/env python3
"""
refresh_jobs.py — refresh the Supabase `jobs` table from USAJOBS.

WHAT IT DOES (one manual run, like geocode.py — nothing automated)
  1. Pulls open wildland-fire postings from USAJOBS (job series 0456 + 0462).
  2. Drops "national-announcement" noise (postings with > 8 duty locations —
     those are administrative HQ lists, not real field stations).
  3. Expands each remaining posting into one entry PER duty-station town.
  4. Geocodes each town to lat/lng via the free Nominatim geocoder, reusing the
     job_geocache.json cache so we never re-geocode a town we've already looked up.
  5. UPSERTS the results into the Supabase `jobs` table (insert new, update
     existing — keyed on announcement_number + town + state).
  6. Clears out postings that have closed (any table row not re-confirmed by
     this run is deleted), so the table always reflects what's open right now.

  It does NOT touch the map, the crews table, or any app code.

TWO SETS OF CREDENTIALS (all read from the environment — never hardcoded)
  For READING USAJOBS (same as fetch_jobs.py):
      USAJOBS_API_KEY   - your free key from developer.usajobs.gov
      USAJOBS_EMAIL     - the email you registered that key with
  For WRITING to Supabase (same secret as import_to_supabase.py):
      SUPABASE_URL              - Project Settings -> API -> "Project URL"
      SUPABASE_SERVICE_ROLE_KEY - Project Settings -> API -> "service_role" key

  The service_role key is a SECRET that BYPASSES Row Level Security — that's why
  it can write to a table the public can only read. Use it ONLY for this local
  script. NEVER put it in the website or commit it anywhere. (This file reads it
  from the environment precisely so it never has to live in the code.)

  Convenience: the two USAJOBS values (and the Supabase URL) can also live in
  your gitignored .env.local — this script will read them from there if present.
  Keep the service_role KEY out of .env.local; pass it by `export` (see below).

HOW TO RUN (macOS / Linux, in this folder)
  export SUPABASE_URL="https://xxxxx.supabase.co"          # or rely on .env.local
  export SUPABASE_SERVICE_ROLE_KEY="paste-the-service_role-key-here"
  python3 refresh_jobs.py

  Safe to re-run any time: it upserts (no duplicates) and prunes closed postings.
"""

import os
import sys
import json
import time
from datetime import datetime, timezone, date

try:
    import requests
except ImportError:
    print("Missing 'requests'. Run:  pip install requests")
    sys.exit(1)


# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------

USAJOBS_URL = "https://data.usajobs.gov/api/search"
JOB_SERIES = ["0456", "0462"]     # search BOTH (0462->0456 transition)
RESULTS_PER_PAGE = 500            # max the API allows per page
MAX_DUTY_LOCATIONS = 8            # drop postings with more than this (HQ noise)

NOMINATIM_URL = "https://nominatim.openstreetmap.org/search"
# Same identifying User-Agent we use in geocode.py (Nominatim requires one).
NOMINATIM_HEADERS = {"User-Agent": "crew-map/1.0 (firecrewreview@gmail.com)"}
GEOCACHE = "job_geocache.json"    # reused from the proximity dry-run (gitignored)

TABLE = "jobs"
# The composite unique key on the table. PostgREST points its upsert here so a
# re-run UPDATES the matching row instead of creating a duplicate.
CONFLICT_COLS = "announcement_number,town,state"


# ---------------------------------------------------------------------------
# Credentials — read from environment (or .env.local); never hardcoded
# ---------------------------------------------------------------------------

def load_env_local():
    """
    Read simple KEY=VALUE lines from a .env.local file (if present) into the
    environment, without overwriting anything already exported. Lets you keep the
    USAJOBS values (and the Supabase URL) in the same gitignored file the website
    uses, instead of exporting them by hand every time.
    """
    path = os.path.join(os.path.dirname(os.path.abspath(__file__)), ".env.local")
    if not os.path.exists(path):
        return
    with open(path, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, value = line.split("=", 1)
            os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


def get_usajobs_credentials():
    """Return (api_key, email) for the USAJOBS API, or exit with a clear message."""
    api_key = os.environ.get("USAJOBS_API_KEY")
    email = os.environ.get("USAJOBS_EMAIL")
    if not api_key or not email:
        print("Missing USAJOBS credentials. Add to .env.local (or export):\n"
              "    USAJOBS_API_KEY=...\n    USAJOBS_EMAIL=...")
        sys.exit(1)
    return api_key, email


def get_supabase_config():
    """
    Return (rest_url, headers) for writing to Supabase, or exit with a clear
    message. The auth header depends on the key FORMAT (same rule as
    import_to_supabase.py):
      - Legacy service_role keys are JWTs (start with "eyJ"): send in BOTH the
        `apikey` header and `Authorization: Bearer`.
      - Newer secret keys (e.g. "sb_secret_...") are NOT JWTs: send ONLY in
        `apikey`. Putting them in `Authorization: Bearer` makes Supabase try to
        parse them as a JWT and reject the request.
    """
    # URL isn't secret, so we accept the app's public var as a fallback.
    url = (os.environ.get("SUPABASE_URL")
           or os.environ.get("NEXT_PUBLIC_SUPABASE_URL", "")).rstrip("/")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
    if not url or not key:
        print("Missing Supabase config. Set these (service_role key via export):\n"
              "    export SUPABASE_URL=\"https://xxxxx.supabase.co\"\n"
              "    export SUPABASE_SERVICE_ROLE_KEY=\"the-service_role-key\"")
        sys.exit(1)
    headers = {"apikey": key, "Content-Type": "application/json"}
    if key.startswith("eyJ"):
        headers["Authorization"] = f"Bearer {key}"
    return f"{url}/rest/v1/{TABLE}", headers


# ---------------------------------------------------------------------------
# 1) Fetch open postings from USAJOBS (with pagination)
# ---------------------------------------------------------------------------

def fetch_all_postings(api_key, email):
    """Return every open posting (raw descriptor dicts) across ALL result pages."""
    headers = {
        "Host": "data.usajobs.gov",
        "User-Agent": email,                 # the email registered to the key
        "Authorization-Key": api_key,
    }
    params = {
        "JobCategoryCode": ";".join(JOB_SERIES),
        "ResultsPerPage": RESULTS_PER_PAGE,
        "Page": 1,
    }
    all_jobs, page = [], 1
    while True:
        params["Page"] = page
        resp = requests.get(USAJOBS_URL, headers=headers, params=params, timeout=30)
        if resp.status_code == 401:
            print("USAJOBS rejected the request (401). Check USAJOBS_API_KEY and\n"
                  "USAJOBS_EMAIL — the email must match the one the key is registered to.")
            sys.exit(1)
        resp.raise_for_status()

        result = resp.json().get("SearchResult", {})
        items = result.get("SearchResultItems", [])
        total_all = int(result.get("SearchResultCountAll", 0))
        for item in items:
            d = item.get("MatchedObjectDescriptor")
            if d:
                all_jobs.append(d)
        print(f"  page {page}: {len(items)} postings (running total {len(all_jobs)}/{total_all})")

        if len(items) < RESULTS_PER_PAGE or len(all_jobs) >= total_all:
            break
        page += 1
        time.sleep(0.5)     # be polite between page requests
    return all_jobs


# ---------------------------------------------------------------------------
# 2) Tidy a raw posting into the fields we care about
# ---------------------------------------------------------------------------

def only_date(value):
    """USAJOBS dates are usually 'YYYY-MM-DD'; if a datetime sneaks in, keep the
    date part so it fits the table's `date` columns."""
    if not value:
        return None
    return value[:10]     # "2026-07-09T23:59:59Z" -> "2026-07-09"


def to_number(value):
    """Salary values arrive as strings like '45000.0'; return a float or None."""
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def tidy(job):
    """Pull the useful, mostly-flat fields out of one raw posting."""
    # Duty locations: a posting can list several towns. Keep city + state.
    locations = []
    for loc in job.get("PositionLocation", []) or []:
        city = loc.get("CityName")
        state = loc.get("CountrySubDivisionCode")
        if city and state:
            # CityName is sometimes "Boise, Idaho"; keep the part before the comma.
            locations.append((city.split(",")[0].strip(), state.strip()))

    series = [c.get("Code") for c in (job.get("JobCategory") or []) if c.get("Code")]
    pay_plans = [g.get("Code") for g in (job.get("JobGrade") or []) if g.get("Code")]
    details = job.get("UserArea", {}).get("Details", {}) or {}
    salary = (job.get("PositionRemuneration") or [{}])[0]

    # Build a readable pay grade like "GS 03-05" when we have the pieces.
    plan = pay_plans[0] if pay_plans else None
    low, high = details.get("LowGrade"), details.get("HighGrade")
    if plan and low and high:
        pay_grade = f"{plan} {low}-{high}"
    elif plan:
        pay_grade = plan
    else:
        pay_grade = None

    return {
        "announcement_number": job.get("PositionID"),
        "title": job.get("PositionTitle"),
        "agency": job.get("OrganizationName"),
        "department": job.get("DepartmentName"),
        "job_series": ",".join(series) if series else None,
        "pay_grade": pay_grade,
        "salary_min": to_number(salary.get("MinimumRange")),
        "salary_max": to_number(salary.get("MaximumRange")),
        "open_date": only_date(job.get("PositionStartDate")),
        "close_date": only_date(job.get("PositionEndDate")),
        "apply_url": job.get("PositionURI"),
        "locations": locations,       # list of (town, state) tuples
    }


# ---------------------------------------------------------------------------
# 3) Geocode duty-station towns (reusing the on-disk cache)
# ---------------------------------------------------------------------------

def geocode_towns(town_state_pairs):
    """
    Given a set of (town, state) pairs, return a dict {(TOWN, STATE): [lat, lng]}.
    Uses job_geocache.json so we never re-geocode a town we've already looked up.
    Towns that can't be geocoded are simply left out (we won't insert rows for
    them, since latitude/longitude are required).
    """
    cache = json.load(open(GEOCACHE)) if os.path.exists(GEOCACHE) else {}

    # Build the query string for each pair and figure out what's new.
    queries = {}                       # (TOWN,STATE) -> "Town, State, USA"
    for town, state in town_state_pairs:
        key = (town.upper(), state.upper())
        queries[key] = f"{town}, {state}, USA"

    new = [q for q in set(queries.values()) if q not in cache]
    print(f"Geocoding {len(new)} new towns ({len(set(queries.values())) - len(new)} cached)...")
    for q in new:
        try:
            r = requests.get(NOMINATIM_URL, headers=NOMINATIM_HEADERS, timeout=20,
                             params={"q": q, "format": "json", "limit": 1, "countrycodes": "us"})
            r.raise_for_status()
            res = r.json()
            cache[q] = [round(float(res[0]["lat"]), 5), round(float(res[0]["lon"]), 5)] if res else None
        except Exception as e:
            print(f"   error geocoding {q}: {e}")
            cache[q] = None
        time.sleep(1.1)                # stay under Nominatim's ~1 req/sec limit

    json.dump(cache, open(GEOCACHE, "w"), indent=2)   # persist for next time

    coords = {}
    for key, q in queries.items():
        if cache.get(q):
            coords[key] = cache[q]
    return coords


# ---------------------------------------------------------------------------
# 4) Build the rows to write (one per posting-town), then upsert + prune
# ---------------------------------------------------------------------------

def build_rows(postings, coords, run_stamp):
    """
    Turn tidied postings into `jobs` rows: one row per geocoded duty-station town.
    Skips already-closed postings and towns we couldn't geocode. De-dupes on the
    composite key so a single upsert batch never lists the same key twice.
    """
    today = date.today().isoformat()
    rows, seen = [], set()
    skipped_closed = skipped_nogeo = 0

    for p in postings:
        # Guard: never insert a posting whose application window already ended.
        if p["close_date"] and p["close_date"] < today:
            skipped_closed += 1
            continue
        for town, state in p["locations"]:
            key = (p["announcement_number"], town.upper(), state.upper())
            if key in seen:
                continue                      # same posting+town already added
            latlng = coords.get((town.upper(), state.upper()))
            if not latlng:
                skipped_nogeo += 1
                continue
            seen.add(key)
            rows.append({
                "announcement_number": p["announcement_number"],
                "title": p["title"],
                "agency": p["agency"],
                "department": p["department"],
                "town": town,                 # readable town for the row
                "state": state.upper(),       # UPPERCASE to match the crews table
                "latitude": latlng[0],
                "longitude": latlng[1],
                "job_series": p["job_series"],
                "pay_grade": p["pay_grade"],
                "salary_min": p["salary_min"],
                "salary_max": p["salary_max"],
                "open_date": p["open_date"],
                "close_date": p["close_date"],
                "apply_url": p["apply_url"],
                # Stamp EVERY row with this run's time. Rows not re-stamped by this
                # run (i.e. closed postings) are pruned afterward.
                "last_refreshed": run_stamp,
            })
    return rows, skipped_closed, skipped_nogeo


def raise_on_error(r, action):
    """Print Supabase's full RESPONSE (never our request headers, so the secret
    key is not exposed) and stop, if the call failed."""
    if r.ok:
        return
    print(f"\nERROR while {action}: HTTP {r.status_code} {r.reason}")
    print(f"  Request: {r.request.method} {r.url}")     # URL carries no secret
    print(f"  Response body: {r.text.strip() or '(empty)'}")
    sys.exit(1)


def upsert_rows(rest_url, headers, rows):
    """Insert-or-update rows in batches, keyed on the composite unique columns."""
    up_headers = {**headers, "Prefer": "resolution=merge-duplicates,return=minimal"}
    params = {"on_conflict": CONFLICT_COLS}
    for start in range(0, len(rows), 100):
        batch = rows[start:start + 100]
        r = requests.post(rest_url, headers=up_headers, params=params,
                          data=json.dumps(batch), timeout=60)
        raise_on_error(r, f"upserting rows {start + 1}-{start + len(batch)}")
        print(f"  upserted {min(start + len(batch), len(rows))}/{len(rows)}")


def delete_closed(rest_url, headers, run_stamp):
    """
    Remove postings that have closed: any row whose last_refreshed is OLDER than
    this run's stamp was not re-confirmed as open, so it's gone. Returns how many
    rows were deleted.
    """
    del_headers = {**headers, "Prefer": "return=representation"}
    r = requests.delete(rest_url, headers=del_headers,
                        params={"last_refreshed": f"lt.{run_stamp}", "select": "id"},
                        timeout=60)
    raise_on_error(r, "deleting closed postings")
    return len(r.json())


def count_rows(rest_url, headers):
    """Return the total number of rows currently in the table."""
    r = requests.get(rest_url, headers={**headers, "Prefer": "count=exact"},
                     params={"select": "id", "limit": 1}, timeout=30)
    raise_on_error(r, "reading the row count")
    return int(r.headers.get("content-range", "*/0").split("/")[-1])


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    load_env_local()
    api_key, email = get_usajobs_credentials()
    rest_url, sb_headers = get_supabase_config()

    # A single timestamp for this whole run (used to prune closed postings).
    run_stamp = datetime.now(timezone.utc).isoformat()

    print(f"Pulling open fire jobs (series {', '.join(JOB_SERIES)}) from USAJOBS...")
    raw = fetch_all_postings(api_key, email)
    tidied = [tidy(j) for j in raw]

    # Drop the national-announcement noise (postings with too many duty locations).
    kept = [p for p in tidied if len(p["locations"]) <= MAX_DUTY_LOCATIONS]
    print(f"\nFetched {len(tidied)} postings; kept {len(kept)} after dropping "
          f"{len(tidied) - len(kept)} with > {MAX_DUTY_LOCATIONS} duty locations.")

    # Collect the unique towns across kept postings, then geocode them.
    pairs = {loc for p in kept for loc in p["locations"]}
    coords = geocode_towns(pairs)

    rows, skipped_closed, skipped_nogeo = build_rows(kept, coords, run_stamp)
    print(f"\nBuilt {len(rows)} job rows (one per posting-town). "
          f"Skipped {skipped_closed} closed, {skipped_nogeo} un-geocodable.")

    # Safety: if we somehow fetched nothing, do NOT wipe the table — that's more
    # likely an API hiccup than "zero fire jobs open in the whole country."
    if not rows:
        print("No rows to write — skipping upsert AND cleanup to avoid emptying "
              "the table on a bad pull. Investigate before re-running.")
        sys.exit(1)

    print("\nUpserting into Supabase...")
    upsert_rows(rest_url, sb_headers, rows)

    print("\nPruning postings that have closed...")
    deleted = delete_closed(rest_url, sb_headers, run_stamp)
    print(f"  removed {deleted} stale row(s).")

    total = count_rows(rest_url, sb_headers)
    print(f"\nDone. The `{TABLE}` table now has {total} row(s) "
          f"({len(rows)} confirmed open this run).")


if __name__ == "__main__":
    main()
