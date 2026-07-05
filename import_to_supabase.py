#!/usr/bin/env python3
"""
import_to_supabase.py — loads crews_with_coords.json into the Supabase `crews` table.

WHAT IT DOES
  Reads crews_with_coords.json (all 440 crews, with coordinates).
  Converts every blank/empty-string value to NULL, so the database holds true
  NULLs instead of "". Leaves latitude/longitude as numbers.
  Inserts all rows into the `crews` table via Supabase's auto REST API.

BEFORE YOU RUN
  1. Create the table first by running schema.sql in the Supabase SQL Editor.
  2. This script needs TWO values from your Supabase project, read from the
     environment so they're never written into this file or committed to git:

       SUPABASE_URL              -> Project Settings -> API -> "Project URL"
       SUPABASE_SERVICE_ROLE_KEY -> Project Settings -> API -> "service_role" key

     The service_role key is a SECRET and bypasses Row Level Security — that's
     why we use it here: our table only allows the public to READ, so a normal
     (anon) key couldn't insert. Use it ONLY for this local one-time import.
     NEVER put the service_role key in the website or commit it anywhere.

HOW TO RUN (macOS / Linux, in this folder)
  export SUPABASE_URL="https://xxxxx.supabase.co"
  export SUPABASE_SERVICE_ROLE_KEY="paste-the-service_role-key-here"
  python3 import_to_supabase.py

  Re-running is safe: if the table already has rows, the script stops and tells
  you to re-run with --replace, which clears the table first and re-imports a
  clean 440. (That avoids accidentally creating duplicate rows.)
"""

import json, os, sys

try:
    import requests
except ImportError:
    print("Missing 'requests'. Run:  pip install requests")
    sys.exit(1)

INPUT = "crews_with_coords.json"
TABLE = "crews"

# Read the two secrets from the environment (see header). Fail clearly if unset.
URL = os.environ.get("SUPABASE_URL", "").rstrip("/")
KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
if not URL or not KEY:
    print("ERROR: set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY first. See the")
    print("instructions at the top of this file.")
    sys.exit(1)

REST = f"{URL}/rest/v1/{TABLE}"
# Both headers are required by Supabase's REST API: `apikey` identifies the
# project, and the Bearer token authorizes the request.
HEADERS = {
    "apikey": KEY,
    "Authorization": f"Bearer {KEY}",
    "Content-Type": "application/json",
}

def blanks_to_null(record):
    """Return a copy of the record with empty/whitespace-only strings -> None.
    Numbers (latitude/longitude) pass through untouched."""
    cleaned = {}
    for field, value in record.items():
        if isinstance(value, str) and value.strip() == "":
            cleaned[field] = None       # becomes a true SQL NULL on insert
        else:
            cleaned[field] = value
    return cleaned

def count_existing_rows():
    """Ask the API how many rows are already in the table (so we don't
    silently create duplicates on a re-run)."""
    # `Prefer: count=exact` makes Supabase return the total in a Content-Range
    # header, e.g. "0-0/440". We request zero rows (limit=1) just to read it.
    r = requests.get(REST, headers={**HEADERS, "Prefer": "count=exact"},
                     params={"select": "id", "limit": 1}, timeout=30)
    r.raise_for_status()
    content_range = r.headers.get("content-range", "*/0")  # ".../<total>"
    return int(content_range.split("/")[-1])

def delete_all_rows():
    """Clear the table (used by --replace). REST requires a filter, and every
    auto-generated id is >= 1, so `id=gte.1` matches every row."""
    r = requests.delete(REST, headers={**HEADERS, "Prefer": "return=minimal"},
                        params={"id": "gte.1"}, timeout=60)
    r.raise_for_status()

def main():
    replace = "--replace" in sys.argv

    with open(INPUT, encoding="utf-8") as f:
        data = json.load(f)
    rows = [blanks_to_null(r) for r in data]
    print(f"Read {len(rows)} crews from {INPUT}.")

    existing = count_existing_rows()
    if existing > 0 and not replace:
        print(f"\nThe `{TABLE}` table already has {existing} rows.")
        print("To avoid duplicates, this script won't add more on top.")
        print("If you want to wipe and re-import a clean copy, run:")
        print("    python3 import_to_supabase.py --replace")
        sys.exit(1)
    if existing > 0 and replace:
        print(f"--replace: deleting {existing} existing rows first...")
        delete_all_rows()

    # Insert in batches of 100 — small, polite requests that are easy to retry.
    inserted = 0
    for start in range(0, len(rows), 100):
        batch = rows[start:start + 100]
        r = requests.post(REST, headers={**HEADERS, "Prefer": "return=minimal"},
                          data=json.dumps(batch), timeout=60)
        if not r.ok:
            print(f"\nInsert failed (HTTP {r.status_code}): {r.text}")
            sys.exit(1)
        inserted += len(batch)
        print(f"  inserted {inserted}/{len(rows)}")

    # Verify by reading the count back from the database.
    total = count_existing_rows()
    print(f"\nDone. The `{TABLE}` table now has {total} rows.")
    if total != len(rows):
        print(f"WARNING: expected {len(rows)} — please check the table.")

if __name__ == "__main__":
    main()
