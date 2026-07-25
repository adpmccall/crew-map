#!/usr/bin/env python3
"""
region_backfill_commit.py — write the region backfill + clean the CDATA names.

Same shape as atlas_import.py: DRY RUN unless you pass --commit, snapshots
everything it will touch before the first write, and has a --rollback that puts
it back.

WHAT IT DOES  (two independent phases, both safe to re-run)

  PHASE 1 — assign `region` to Atlas crews that have none.
      The 85 assignments come from region_backfill_dryrun.compute_assignments —
      IMPORTED, not re-implemented, so this writes exactly what that dry run
      showed you. 52 exact + 19 fuzzy borrowed from the curated 440, plus 14
      from the explicit R8/R9/R10 table.

      Every write is guarded in the URL itself with
          region=is.null AND source=eq.handcrew_atlas
      so it is impossible for this script to overwrite a region that already
      has a value, or to touch one of your 440 curated rows — even if the data
      changed between the read and the write.

  PHASE 2 — strip `<![CDATA[ ... ]]>` wrappers and non-breaking spaces out of
      crew_name / forest. Three rows carry them (a KMZ parsing artifact from the
      original Atlas import). They only became visible when crew_name was wired
      into the popup title. Rows are found by CONTENT, not by hard-coded id, so
      this stays correct if the ids ever differ.

USAGE
    python3 region_backfill_commit.py              # dry run (default)
    python3 region_backfill_commit.py --commit     # actually write
    python3 region_backfill_commit.py --rollback   # undo, from the backup file

CREDENTIALS — the SECRET key, and only from the environment:
    export SUPABASE_URL="https://xxxxx.supabase.co"
    export SUPABASE_SERVICE_ROLE_KEY="the-sb_secret_-key"

    NEVER put the secret key in the app, a screenshot, or git. Environment
    variables don't survive closing Terminal, so re-export them each session.
    (The dry run needs no key at all — it reads with the public one.)
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

# Reuse the reviewed matcher + reader rather than copying them.
from region_backfill_dryrun import compute_assignments, fetch_crews, load_env_local

BACKUP = "region_backfill_backup.json"

# Sanity rail: the reviewed dry run assigned 85. If a future run suddenly wants
# to touch far more than that, something upstream changed and a human should
# look before we write. Mirrors refresh_jobs.py refusing to act on a bad pull.
MAX_REASONABLE_WRITES = 150


# --- cleaning -------------------------------------------------------------------

def clean_text(v):
    """Strip CDATA wrappers and non-breaking spaces. Returns None unchanged."""
    if not isinstance(v, str):
        return v
    out = re.sub(r"<!\[CDATA\[|\]\]>", "", v)
    out = out.replace("\xa0", " ")       # non-breaking space -> normal space
    out = re.sub(r"\s+", " ", out).strip()
    return out


def needs_cleaning(row):
    """The fields whose stored value differs from its cleaned form."""
    changes = {}
    for field in ("crew_name", "forest"):
        v = row.get(field)
        if isinstance(v, str):
            c = clean_text(v)
            if c != v:
                changes[field] = c
    return changes


def has_cdata(row):
    """True for the rows with a literal <![CDATA[ ... ]]> wrapper (the loud
    breakage), as opposed to only a non-breaking space (the quiet one)."""
    return any("CDATA" in str(row.get(f) or "") for f in ("crew_name", "forest"))


# --- Supabase (writes use the SECRET key) ---------------------------------------

def write_config():
    load_env_local()   # picks up SUPABASE_URL if it's in .env.local
    url = (os.environ.get("SUPABASE_URL")
           or os.environ.get("NEXT_PUBLIC_SUPABASE_URL", "")).rstrip("/")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
    if not url or not key:
        print("Missing Supabase config for WRITING. Set these first:\n"
              '    export SUPABASE_URL="https://xxxxx.supabase.co"\n'
              '    export SUPABASE_SERVICE_ROLE_KEY="the-secret-key"')
        sys.exit(1)
    headers = {"apikey": key, "Content-Type": "application/json"}
    # Legacy service_role keys are JWTs and want Bearer too; sb_secret_ keys
    # are not JWTs and must NOT be sent that way (same rule as refresh_jobs.py).
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


# --- rollback -------------------------------------------------------------------

def rollback():
    if not os.path.exists(BACKUP):
        print(f"No {BACKUP} found — nothing to roll back.")
        sys.exit(1)
    with open(BACKUP, encoding="utf-8") as f:
        snap = json.load(f)

    rest, headers = write_config()
    rows = snap.get("rows", [])
    print(f"Rolling back {len(rows)} rows to their pre-write values...\n")

    done = 0
    for row in rows:
        body = {}
        if "region" in row["before"]:
            body["region"] = row["before"]["region"]     # usually None
        for field in ("crew_name", "forest"):
            if field in row["before"]:
                body[field] = row["before"][field]
        if not body:
            continue
        # id-only guard, matching how the writes were made (phase 2 touches a
        # few curated rows, so a source filter here would leave them un-restored).
        changed = patch(rest, headers, {"id": f"eq.{row['id']}"}, body)
        done += len(changed) if changed else 1
    print(f"Rollback complete — {done} rows restored.")
    print(f"({BACKUP} kept, so you can inspect what was undone.)")


# --- main -----------------------------------------------------------------------

def main():
    commit = "--commit" in sys.argv
    # Phase 2 finds 58 rows, but only 3 carry the visible <![CDATA[ ]]> wrapper;
    # the rest have a non-breaking space. --cdata-only narrows to just the 3.
    cdata_only = "--cdata-only" in sys.argv
    if "--rollback" in sys.argv:
        rollback()
        return

    print("Reading current state...\n")
    rows = fetch_crews()
    res = compute_assignments(rows, verbose=False)
    assigned = res["assigned"]

    # PHASE 2 candidates: find dirty text by content, not by id.
    dirty = []
    for row in rows:
        ch = needs_cleaning(row)
        if ch:
            dirty.append((row, ch))

    # ---- the plan ----
    print("=" * 72)
    print("PLAN" + ("  (--commit given: WILL WRITE)" if commit else "  (DRY RUN — no writes)"))
    print("=" * 72)
    print(f"  PHASE 1  assign region to {len(assigned)} Atlas crews")
    print(f"           guard: region IS NULL AND source = 'handcrew_atlas'")
    by_region = Counter(r for _, _, r in assigned)
    for region, n in sorted(by_region.items(), key=lambda kv: -kv[1]):
        print(f"             {n:>3}  {region}")
    cdata_rows = [(r, ch) for r, ch in dirty if has_cdata(r)]
    nbsp_rows = [(r, ch) for r, ch in dirty if not has_cdata(r)]

    print(f"\n  PHASE 2  clean text artifacts in {len(dirty)} rows"
          f"{'   (--cdata-only: just the CDATA ones)' if cdata_only else ''}")
    print(f"           guard: id only — 3 of these are curated rows that were")
    print(f"           enriched with an Atlas name, so a source filter would miss them\n")

    print(f"    (a) CDATA-wrapped names — {len(cdata_rows)} rows, shown in full:")
    for row, ch in cdata_rows:
        for field, new in ch.items():
            print(f"          id={row['id']:<5} {field}")
            print(f"            before: {row[field]!r}")
            print(f"            after : {new!r}")

    print(f"\n    (b) non-breaking space only — {len(nbsp_rows)} rows"
          f"{' (SKIPPED with --cdata-only)' if cdata_only else ''}:")
    for row, ch in nbsp_rows[:6]:
        for field, new in ch.items():
            print(f"          id={row['id']:<5} {field}: {row[field]!r} -> {new!r}")
    if len(nbsp_rows) > 6:
        print(f"          ... and {len(nbsp_rows) - 6} more of the same shape")
    by_src = Counter(r.get("source") for r, _ in dirty)
    print(f"\n    by source: {dict(by_src)}")
    print()

    if cdata_only:
        dirty = cdata_rows

    # Sanity rails.
    if not assigned and not dirty:
        print("Nothing to do — already applied, or the matcher found nothing.")
        return
    if len(assigned) > MAX_REASONABLE_WRITES:
        print(f"REFUSING: {len(assigned)} region writes exceeds the "
              f"{MAX_REASONABLE_WRITES} sanity limit. Re-check the dry run.")
        sys.exit(1)

    # Confirm none of the targets somehow already has a region (belt and braces —
    # the URL guard enforces this too, but catching it here gives a clear message).
    bad = [c for c, _, _ in assigned if c.get("region")]
    if bad:
        print(f"REFUSING: {len(bad)} target rows already have a region. Stale read?")
        sys.exit(1)

    if not commit:
        print("DRY RUN — nothing was written.")
        print("Re-run with --commit to apply (needs SUPABASE_SERVICE_ROLE_KEY).")
        return

    # ---- write ----
    rest, headers = write_config()

    # Snapshot BEFORE the first write, so --rollback always has something.
    snap = {"note": "pre-write snapshot for region_backfill_commit.py",
            "rows": []}
    for crew, _, _ in assigned:
        snap["rows"].append({"id": crew["id"], "before": {"region": crew.get("region")}})
    for row, ch in dirty:
        snap["rows"].append({"id": row["id"],
                             "before": {f: row[f] for f in ch}})
    with open(BACKUP, "w", encoding="utf-8") as f:
        json.dump(snap, f, indent=2)
    print(f"Wrote pre-write snapshot to {BACKUP}\n")

    # PHASE 1 — one PATCH per region, ids batched. Guard travels in the URL.
    print("PHASE 1 — assigning regions...")
    ids_by_region = {}
    for crew, _, region in assigned:
        ids_by_region.setdefault(region, []).append(crew["id"])

    total = 0
    for region, ids in ids_by_region.items():
        changed = patch(
            rest, headers,
            {"id": f"in.({','.join(str(i) for i in ids)})",
             "region": "is.null",                 # <- never overwrite
             "source": "eq.handcrew_atlas"},      # <- never touch curated rows
            {"region": region},
        )
        n = len(changed)
        total += n
        flag = "" if n == len(ids) else f"  <- expected {len(ids)}, guard blocked {len(ids) - n}"
        print(f"  {n:>3} rows -> {region}{flag}")
    print(f"  PHASE 1 total: {total} rows\n")

    # PHASE 2 — clean the text artifacts.
    # Guarded by id ONLY — deliberately not by source. Three of these rows are
    # source='usfs_official' (curated rows the Atlas merge enriched with a name
    # that carried the artifact), so a source filter would silently skip them.
    # Instead of a pre-write guard we verify AFTER the write, using the row the
    # database returns.
    print("PHASE 2 — cleaning text artifacts...")
    cleaned, mismatched = 0, []
    for row, ch in dirty:
        changed = patch(rest, headers, {"id": f"eq.{row['id']}"}, ch)
        if not changed:
            mismatched.append((row["id"], "no row updated"))
            continue
        got = changed[0]
        bad = [f for f, want in ch.items() if got.get(f) != want]
        if bad:
            mismatched.append((row["id"], f"unexpected value in {bad}"))
        else:
            cleaned += 1
    print(f"  PHASE 2 total: {cleaned} of {len(dirty)} rows verified clean")
    if mismatched:
        print("  PROBLEM — these did not come back as expected:")
        for rid, why in mismatched:
            print(f"    id={rid}: {why}")
    print()

    print("DONE. Verify in Supabase, then re-run this script — a second dry run")
    print("should report 0 to do. Use --rollback to undo.")


if __name__ == "__main__":
    main()
