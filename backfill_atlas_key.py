#!/usr/bin/env python3
"""
backfill_atlas_key.py — one-off: populate crews.atlas_key on the 389 existing
Wildland Fire Handcrew Atlas rows, so atlas_import.py's next --commit can
UPSERT by key instead of delete-all/insert-all (see
atlas_stable_ids_migration.sql for why this exists).

RUN ORDER — this is step 2 of 3:
  1. atlas_stable_ids_migration.sql  "STEP 1"  (adds the empty column)
  2. THIS SCRIPT, --commit                     (fills it in)
  3. atlas_stable_ids_migration.sql  "STEP 3"  (unique index + RESTRICT FK)
Do not run step 3 until this script's dry run (or commit output) shows
"0 collisions". Do not run this before step 1 — it will fail loudly with a
missing-column error if you do (harmless, just re-run after step 1).

WHAT IT DOES
  Reads every source='handcrew_atlas' row's (id, crew_name, latitude,
  longitude) and computes the SAME key atlas_import.py will compute for that
  placemark on its next run:
      md5(name.strip() + "|" + round(lat, 4) + "|" + round(lon, 4))
  imported directly from atlas_import.py's own atlas_key() function, so the
  two can never drift apart by having the formula written out twice.

  Rows already carrying a value they wrote themselves are left alone (this
  script only fills rows where atlas_key is currently NULL) — so it's safe to
  interrupt and re-run.

SAFE, REVERSIBLE, IDEMPOTENT
  - DEFAULT IS A DRY RUN. Prints what it would write and writes nothing.
  - --commit writes the keys.
  - Re-running (dry or --commit) after a successful commit finds nothing left
    to do — every row already has a key and running the hash again on
    unchanged inputs produces the same value, so there's nothing new to PATCH.
  - Nothing here is destructive: it only ever sets one column on rows that
    already exist. There is no rollback flag because there is nothing to
    undo beyond clearing the column, which the migration file's STEP 1 could
    simply be re-run to re-add empty if you ever truly needed to start over
    (not expected).

COLLISION CHECK
  Two DIFFERENT placemarks hashing to the same key would be a real problem
  (an upsert would only ever be able to see one of them). This script checks
  for that BEFORE writing anything, on both the dry run and the commit, and
  refuses to write if it finds one — printing the colliding rows so you can
  look at them by hand.

BEFORE YOU RUN
  Same two secrets as atlas_import.py / import_to_supabase.py:
    export SUPABASE_URL="https://xxxxx.supabase.co"
    export SUPABASE_SERVICE_ROLE_KEY="paste-the-secret-key-here"
  Run this from the SAME folder as atlas_import.py (it imports atlas_key from
  that file directly — see the import below).

HOW TO RUN
      python3 backfill_atlas_key.py              # dry run: prints the plan
      python3 backfill_atlas_key.py --commit      # writes atlas_key
"""

import json, os, sys
from collections import defaultdict

try:
    import requests
except ImportError:
    print("Missing 'requests'. Run:  pip install requests")
    sys.exit(1)

# Import the SAME hash function atlas_import.py uses at import time, so a
# value written here is guaranteed to match what the next --commit computes
# for the same placemark. If this import fails, you're running the OLD
# atlas_import.py that doesn't define atlas_key() yet — replace it first.
try:
    from atlas_import import atlas_key
except ImportError as e:
    print("ERROR: couldn't import atlas_key() from atlas_import.py.")
    print("  Make sure you've replaced atlas_import.py with the version that")
    print("  defines atlas_key(), and that you're running this from the same folder.")
    print(f"  ({e})")
    sys.exit(1)

TABLE = "crews"

URL = os.environ.get("SUPABASE_URL", "").rstrip("/")
KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
if not URL or not KEY:
    print("ERROR: set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY first "
          "(see the top of this file).")
    sys.exit(1)

REST = f"{URL}/rest/v1/{TABLE}"
HEADERS = {"apikey": KEY, "Content-Type": "application/json"}
if KEY.startswith("eyJ"):
    HEADERS["Authorization"] = f"Bearer {KEY}"


def raise_on_error(r, action):
    if r.ok:
        return
    print(f"\nERROR while {action}: HTTP {r.status_code} {r.reason}")
    print(f"  Request: {r.request.method} {r.url}")
    print(f"  Response body: {r.text.strip() or '(empty)'}")
    sys.exit(1)


def fetch_atlas_rows():
    r = requests.get(REST, headers=HEADERS, params={
        "select": "id,crew_name,latitude,longitude,atlas_key",
        "source": "eq.handcrew_atlas", "limit": 100000,
    }, timeout=60)
    raise_on_error(r, "fetching Atlas rows")
    return r.json()


def patch_key(row_id, key):
    r = requests.patch(REST, headers={**HEADERS, "Prefer": "return=minimal"},
                       params={"id": f"eq.{row_id}"},
                       data=json.dumps({"atlas_key": key}), timeout=30)
    raise_on_error(r, f"setting atlas_key on crew id={row_id}")


def main():
    commit = "--commit" in sys.argv
    rows = fetch_atlas_rows()
    print(f"Fetched {len(rows)} source='handcrew_atlas' rows.\n")

    todo = [r for r in rows if not r.get("atlas_key")]
    already = len(rows) - len(todo)
    if already:
        print(f"{already} row(s) already have an atlas_key — leaving them alone.")

    # Compute the key every row WOULD have (including already-keyed ones,
    # cheaply, since it's pure) so the collision check covers the whole table
    # as it will exist after this run, not just the rows being written.
    computed = {}
    for r in rows:
        computed[r["id"]] = r["atlas_key"] or atlas_key(
            r.get("crew_name"), r["latitude"], r["longitude"])

    by_key = defaultdict(list)
    for row_id, k in computed.items():
        by_key[k].append(row_id)
    collisions = {k: ids for k, ids in by_key.items() if len(ids) > 1}

    if collisions:
        print(f"\n{len(collisions)} COLLISION(S) FOUND — refusing to write anything:")
        by_id = {r["id"]: r for r in rows}
        for k, ids in collisions.items():
            print(f"  key {k}:")
            for i in ids:
                r = by_id[i]
                print(f"    id={i}  {r.get('crew_name')!r}  "
                      f"({r['latitude']}, {r['longitude']})")
        print("\nThese need a human look before STEP 3 can safely add a unique")
        print("index on atlas_key. Most likely two placemarks share an exact")
        print("name and coordinate pair (rounded to 4dp, ~11m) — check whether")
        print("they're genuinely duplicate placemarks in the source KMZ.")
        sys.exit(1)

    print(f"0 collisions across all {len(rows)} rows.")
    print(f"{len(todo)} row(s) need atlas_key written.\n")

    if not todo:
        print("Nothing to do.")
        return

    for r in todo[:5]:
        k = computed[r["id"]]
        print(f"  id={r['id']:<5} {str(r.get('crew_name'))[:32]:32} -> {k}")
    if len(todo) > 5:
        print(f"  ... and {len(todo) - 5} more")

    if not commit:
        print("\nDRY RUN — nothing written. Re-run with --commit to apply.")
        return

    for r in todo:
        patch_key(r["id"], computed[r["id"]])
    print(f"\nWrote atlas_key to {len(todo)} row(s).")
    print("Next: run STEP 3 of atlas_stable_ids_migration.sql in the Supabase SQL editor.")


if __name__ == "__main__":
    main()
