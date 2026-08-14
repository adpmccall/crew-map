#!/usr/bin/env python3
"""
agency_backfill_commit.py — write the agency classification to Supabase.

Same shape as region_backfill_commit.py: DRY RUN unless you pass --commit,
snapshots every row it will touch before the first write, and has a --rollback
that puts it back.

It IMPORTS the classifier from agency_backfill_dryrun rather than copying it,
so this writes exactly what that dry run showed you. The two cannot drift.

USAGE
    python3 agency_backfill_commit.py                # dry run (default)
    python3 agency_backfill_commit.py --commit       # actually write
    python3 agency_backfill_commit.py --rollback     # undo, from the backup
    python3 agency_backfill_commit.py --reclassify   # see below

PREREQUISITE
    Run agency_schema.sql in the Supabase SQL editor first. It adds the column
    with a default of 'unknown'; this script fills in the real values.

CREDENTIALS — the SECRET key, and only from the environment:
    export SUPABASE_URL="https://xxxxx.supabase.co"
    export SUPABASE_SERVICE_ROLE_KEY="the-sb_secret_-key"

    NEVER put the secret key in the app, a screenshot, or git. Environment
    variables don't survive closing Terminal, so re-export them each session.
    (The dry run needs no key at all — it reads with the public one.)


THE WRITE GUARD, AND WHY IT'S SHAPED THIS WAY

    Every write carries  agency=eq.unknown  in the URL. Because the schema
    defaults every row to 'unknown', that single guard buys three things:

      1. First run assigns everything, because everything starts 'unknown'.
      2. HAND-CORRECTIONS ARE PERMANENT. If you fix a row in the Supabase
         table editor, it is no longer 'unknown', so re-running this script
         cannot silently overwrite your judgement with the classifier's guess.
         This is the main reason the agency lives in a column at all.
      3. Re-running later (say, after Phase 3 community submissions land)
         touches only the new rows.

    The cost is that improving the classifier does NOT update rows already
    assigned. --reclassify lifts the guard for exactly that case. It will
    overwrite hand-corrections too, so it warns and lists what it would change.
"""

import json
import os
import re
import sys
from collections import Counter

try:
    import requests
except ImportError:
    print("Missing 'requests'. Run:  pip install requests")
    sys.exit(1)

# Reuse the reviewed classifier + reader rather than copying them.
from agency_backfill_dryrun import (
    AGENCY_LABELS, compute_agencies, fetch_crews, load_env_local,
)

BACKUP = "agency_backfill_backup.json"

# Sanity rail. The first run legitimately writes ~812 of 829 rows, so this is
# set above the table size rather than below it — its job is catching a runaway
# loop or a misread, not a large-but-expected first pass.
MAX_REASONABLE_WRITES = 900

# PATCH sends ids in the URL. Chunk them so a 582-id list can't produce a URL
# long enough to be rejected by the server or a proxy.
ID_CHUNK = 200


# --- Supabase (writes use the SECRET key) ---------------------------------------

def normalize_supabase_url(raw):
    """Reduce whatever the user exported to the bare project origin.

    Supabase shows the URL in two places and they are NOT the same string: the
    "Project URL" in Settings is https://xxxxx.supabase.co, but the API docs
    show https://xxxxx.supabase.co/rest/v1. Exporting the second one makes this
    script build .../rest/v1/rest/v1/crews, which PostgREST rejects with a
    confusing 404 PGRST125 "Invalid path specified in request URL" — confusing
    because reads keep working (they use a different variable).

    Rather than make that a documentation problem, just accept either form.
    """
    url = (raw or "").strip().rstrip("/")
    # Drop a trailing /rest/v1 (with or without anything after it).
    trimmed = re.sub(r"/rest/v1(/.*)?$", "", url)
    if trimmed != url:
        print(f"NOTE: trimmed '/rest/v1' off SUPABASE_URL — using {trimmed}")
        url = trimmed
    return url


def write_config():
    load_env_local()   # picks up SUPABASE_URL if it's in .env.local
    url = normalize_supabase_url(
        os.environ.get("SUPABASE_URL")
        or os.environ.get("NEXT_PUBLIC_SUPABASE_URL", "")
    )
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")

    # Catch the other easy mistake: exporting the placeholder verbatim.
    if "xxxxx" in url:
        print(f"SUPABASE_URL is still the placeholder ({url}).\n"
              "Use your real project URL from Supabase -> Settings -> API.")
        sys.exit(1)

    if not url or not key:
        print("Missing Supabase config for WRITING. Set these first:\n"
              '    export SUPABASE_URL="https://xxxxx.supabase.co"\n'
              '    export SUPABASE_SERVICE_ROLE_KEY="the-secret-key"')
        sys.exit(1)
    headers = {"apikey": key, "Content-Type": "application/json"}
    # Legacy service_role keys are JWTs and want Bearer too; sb_secret_ keys are
    # not JWTs and must NOT be sent that way (same rule as refresh_jobs.py).
    if key.startswith("eyJ"):
        headers["Authorization"] = f"Bearer {key}"
    return f"{url}/rest/v1/crews", headers


def patch(rest, headers, params, body):
    """One guarded PATCH. Returns the rows the database actually changed."""
    r = requests.patch(rest, headers={**headers, "Prefer": "return=representation"},
                       params=params, json=body, timeout=60)
    if r.status_code not in (200, 204):
        print(f"  WRITE FAILED: HTTP {r.status_code} — {r.text[:300]}")
        sys.exit(1)
    try:
        return r.json()
    except ValueError:
        return []


def chunks(seq, n):
    for i in range(0, len(seq), n):
        yield seq[i:i + n]


# --- rollback -------------------------------------------------------------------

def rollback():
    if not os.path.exists(BACKUP):
        print(f"No {BACKUP} found — nothing to roll back.")
        sys.exit(1)
    with open(BACKUP, encoding="utf-8") as f:
        snap = json.load(f)

    rest, headers = write_config()
    rows = snap.get("rows", [])
    print(f"Restoring `agency` on {len(rows)} rows to their pre-write values...\n")

    # Group by the value we're restoring TO, so this is a handful of requests
    # rather than one per row.
    by_value = {}
    for row in rows:
        by_value.setdefault(row["before"], []).append(row["id"])

    done = 0
    for value, ids in by_value.items():
        for chunk in chunks(ids, ID_CHUNK):
            # id-only guard: we are deliberately putting back whatever was there,
            # whatever the row says now.
            changed = patch(rest, headers,
                            {"id": f"in.({','.join(str(i) for i in chunk)})"},
                            {"agency": value})
            done += len(changed)
        print(f"  {len(ids):>4} rows -> {value}")
    print(f"\nRollback complete — {done} rows restored.")
    print(f"({BACKUP} kept, so you can inspect what was undone.)")


# --- main -----------------------------------------------------------------------

def main():
    commit = "--commit" in sys.argv
    reclassify = "--reclassify" in sys.argv
    if "--rollback" in sys.argv:
        rollback()
        return

    print("Reading current state (read-only, public key)...\n")
    rows = fetch_crews()

    if "agency" not in (rows[0] if rows else {}):
        print("The `agency` column doesn't exist yet.")
        print("Run agency_schema.sql in the Supabase SQL editor first, then re-run.")
        sys.exit(1)

    results = compute_agencies(rows)

    # What actually needs writing.
    #   - skip rows already holding the value we'd write (no-op)
    #   - skip rows we'd set to 'unknown' that are already 'unknown' (the default)
    #   - without --reclassify, only touch rows still sitting at 'unknown'
    todo, would_overwrite = [], []
    for res in results:
        row, want = res["row"], res["agency"]
        have = row.get("agency") or "unknown"
        if have == want:
            continue
        if have != "unknown" and not reclassify:
            would_overwrite.append((row, have, want))
            continue
        todo.append((row, have, want, res["evidence"]))

    print("=" * 72)
    print("PLAN" + ("  (--commit given: WILL WRITE)" if commit else "  (DRY RUN — no writes)"))
    print("=" * 72)
    print(f"  rows in table      : {len(rows)}")
    print(f"  rows to write      : {len(todo)}")
    print(f"  guard              : "
          + ("id only — --reclassify LIFTS the unknown guard"
             if reclassify else "agency = 'unknown'  (hand-corrections are safe)"))

    by_agency = Counter(want for _, _, want, _ in todo)
    print("\n  by agency:")
    for agency, n in by_agency.most_common():
        print(f"    {agency:<9} {AGENCY_LABELS[agency]:<32}{n:>5}")

    if would_overwrite:
        print(f"\n  {len(would_overwrite)} rows already have a non-'unknown' agency that")
        print("  differs from the classifier. LEFT ALONE — these are most likely your")
        print("  hand-corrections. Use --reclassify to overwrite them:")
        for row, have, want in would_overwrite[:12]:
            print(f"    id={row['id']:<5} {str(row.get('crew_name'))[:30]:<31} "
                  f"{have} -> {want}")
        if len(would_overwrite) > 12:
            print(f"    ... and {len(would_overwrite) - 12} more")

    if reclassify and would_overwrite:
        print("\n  !! --reclassify WILL overwrite the rows listed above, including any")
        print("     hand-corrections. Re-read that list before committing.")

    print()

    # Sanity rails.
    if not todo:
        print("Nothing to do — already applied, or nothing changed.")
        return
    if len(todo) > MAX_REASONABLE_WRITES:
        print(f"REFUSING: {len(todo)} writes exceeds the {MAX_REASONABLE_WRITES} "
              f"sanity limit. Re-check the dry run.")
        sys.exit(1)

    if not commit:
        print("DRY RUN — nothing was written.")
        print("Re-run with --commit to apply (needs SUPABASE_SERVICE_ROLE_KEY).")
        print("For the full reasoning per row: python3 agency_backfill_dryrun.py --list")
        return

    # ---- write ----
    rest, headers = write_config()

    # Snapshot BEFORE the first write, so --rollback always has something.
    snap = {"note": "pre-write snapshot for agency_backfill_commit.py",
            "rows": [{"id": row["id"], "before": have} for row, have, _, _ in todo]}
    with open(BACKUP, "w", encoding="utf-8") as f:
        json.dump(snap, f, indent=2)
    print(f"Wrote pre-write snapshot to {BACKUP}\n")

    ids_by_agency = {}
    for row, _, want, _ in todo:
        ids_by_agency.setdefault(want, []).append(row["id"])

    total = 0
    for agency, ids in ids_by_agency.items():
        written = 0
        for chunk in chunks(ids, ID_CHUNK):
            params = {"id": f"in.({','.join(str(i) for i in chunk)})"}
            if not reclassify:
                params["agency"] = "eq.unknown"   # <- never clobber a real value
            written += len(patch(rest, headers, params, {"agency": agency}))
        total += written
        flag = "" if written == len(ids) else f"  <- expected {len(ids)}, guard blocked {len(ids) - written}"
        print(f"  {written:>4} rows -> {agency}{flag}")

    print(f"\n  total written: {total} rows")
    print("\nDONE. Verify in Supabase:")
    print("  select agency, count(*) from crews group by agency order by 2 desc;")
    print("Then re-run this script — a second dry run should report 0 to do.")
    print("Use --rollback to undo.")


if __name__ == "__main__":
    main()
