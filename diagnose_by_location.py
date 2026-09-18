#!/usr/bin/env python3
"""
diagnose_by_location.py — one-off, READ-ONLY, follow-up to
diagnose_key_mismatch.py. That script searched today's KMZ by NAME and found
nothing for several flagged crews -- but a name search misses a placemark
that was simply RENAMED and left in the same spot. This script instead finds
whatever placemark sits closest to each flagged crew's STORED coordinate,
regardless of what it's currently named, so we can tell "renamed, still
here" apart from "genuinely gone from the source."

    python3 diagnose_by_location.py
"""
import atlas_import as ai

TARGET_IDS = [448, 444, 445, 446, 639, 539, 541, 549, 588]  # skip 447, already confirmed matching

print("Parsing KMZ and fetching existing Atlas rows (read-only)...\n")
atlas = ai.load_atlas()
existing = ai.fetch_atlas_rows()
existing_by_id = {r["id"]: r for r in existing}

for rid in TARGET_IDS:
    row = existing_by_id.get(rid)
    if not row:
        print(f"--- id={rid}: not found in crews at all ---\n")
        continue

    print(f"--- crews.id={rid}  DB name: {row['crew_name']!r} "
          f"@ ({row['latitude']}, {row['longitude']}) ---")

    # closest placemark in today's KMZ, by straight-line distance, no name
    # filtering at all -- this is the ground-truth check.
    best, bd = None, 1e9
    for a in atlas:
        d = ai._miles(row["latitude"], row["longitude"], a["latitude"], a["longitude"])
        if d < bd:
            bd, best = d, a

    if best is None:
        print("  KMZ appears to be empty?!\n")
        continue

    same_name = best["name"] == row["crew_name"]
    print(f"  Closest KMZ placemark: {best['name']!r}  ({bd*5280:.0f} ft away)")
    if bd * 5280 < 200:   # under ~200ft -- essentially the same pin
        if same_name:
            print("  SAME NAME, SAME SPOT -- this should have matched. "
                  "(If you're seeing this, tell Claude -- something else is wrong.)")
        else:
            print("  SAME SPOT, DIFFERENT NAME -- this crew was almost certainly "
                  "RENAMED in the source since your original import, not removed.")
    elif bd < 5:
        print(f"  Nearby ({bd:.2f} mi) but not the same pin -- could be a moved "
              f"placemark, or just a different nearby crew. Worth a human look.")
    else:
        print(f"  Nothing close by ({bd:.1f} mi to the nearest placemark at all) -- "
              f"this one does look genuinely absent from today's source file.")
    print()
