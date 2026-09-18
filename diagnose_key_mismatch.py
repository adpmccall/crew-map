#!/usr/bin/env python3
"""
diagnose_key_mismatch.py — one-off, READ-ONLY. Why does a REMOVE-flagged
crews row not match any placemark in today's KMZ by atlas_key?

Run this from the same folder as atlas_import.py, with the same env vars
already exported. It writes NOTHING — just fetches + parses + prints.

    python3 diagnose_key_mismatch.py
"""
import sys
import atlas_import as ai

# The ids atlas_import.py's dry run flagged for REMOVE, worth a close look.
# Edit this list if you want to check different ones.
TARGET_IDS = [448, 444, 445, 446, 447, 639, 539, 541, 549, 588]

print("Parsing KMZ and fetching existing Atlas rows (read-only)...\n")
atlas = ai.load_atlas()
existing = ai.fetch_atlas_rows()
existing_by_id = {r["id"]: r for r in existing}

for rid in TARGET_IDS:
    row = existing_by_id.get(rid)
    if not row:
        print(f"--- id={rid}: not found in crews (already gone or wrong id) ---\n")
        continue

    print(f"--- crews.id={rid} ---")
    print(f"  DB crew_name : {row['crew_name']!r}")
    print(f"  DB lat/lon   : {row['latitude']!r}, {row['longitude']!r}")
    print(f"  DB atlas_key : {row['atlas_key']}")

    db_name_norm = (row["crew_name"] or "").strip().lower()
    exact = [a for a in atlas if (a["name"] or "").strip().lower() == db_name_norm]
    fuzzy = [] if exact else [
        a for a in atlas
        if db_name_norm and db_name_norm in (a["name"] or "").lower()
    ]
    candidates = exact or fuzzy

    if not candidates:
        print("  NO similarly-named placemark found anywhere in today's KMZ.")
        print("  -> this one may genuinely be gone from the source, or the name")
        print("     changed enough that substring matching missed it too.\n")
        continue

    for a in candidates:
        k = ai.atlas_key(a["name"], a["latitude"], a["longitude"])
        same_name = a["name"] == row["crew_name"]
        same_coord = (round(a["latitude"], 4) == round(row["latitude"], 4)
                      and round(a["longitude"], 4) == round(row["longitude"], 4))
        print(f"  KMZ name     : {a['name']!r}"
              f"{'  <-- DIFFERS' if not same_name else ''}")
        print(f"  KMZ lat/lon  : {a['latitude']!r}, {a['longitude']!r}"
              f"{'  <-- DIFFERS (rounded)' if not same_coord else ''}")
        print(f"  KMZ atlas_key: {k}")
        print(f"  KEYS MATCH   : {k == row['atlas_key']}")
    print()

print("Look at the 'DIFFERS' flags above: if it's the NAME that differs while")
print("coordinates match, compare the two repr()'d strings character by character")
print("-- an invisible character (non-breaking space \\xa0, or leftover")
print("<![CDATA[...]]> wrapper text) will show up as an extra character in the")
print("repr() even though both strings LOOK identical when printed normally.")
