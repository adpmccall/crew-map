#!/usr/bin/env python3
"""
atlas_import.py — merge the Wildland Fire Handcrew Atlas into the `crews` table.

WHAT IT DOES (see MERGE_PLAN.md for the full plan and the decisions behind it)
  Reads "Wildland Fire Handcrew Atlas.kmz" (527 placemarks) and folds it into the
  live `crews` table using proximity (<=5 mi) + forest-name confirmation:

    * ENRICH the crews that appear in BOTH sources (the confirmed matches):
        - add the Atlas crew NAME (new column crew_name)
        - add the Atlas PHOTO url when present (new column photo_url)
        - WEBSITE rule: prefer the Atlas link when both have one; use the Atlas
          link when only the Atlas has one; KEEP OURS when only we have one
          (never blanked). In one line: website = atlas_url OR keep-existing.
        - RESOURCE (crew type): fill from the Atlas ONLY if ours is blank; a
          curated crew type is never overwritten.
        - STATE: fill from a reverse-geocode of the coordinate ONLY if ours is
          blank (all 440 curated crews already have one, so this is a safety net).
        - these rows KEEP source='usfs_official' (they're still our records,
          just enriched).

    * ADD the crews only the Atlas has (far from any crew, or near one but a
      different forest — e.g. non-USFS TNC/NPS/BLM/BIA/state crews) as NEW rows
      tagged source='handcrew_atlas', carrying name, forest, notes, website,
      photo, coordinates, the extracted crew-type RESOURCE label (blank when the
      name/description gives no confident type), and a STATE reverse-geocoded from
      the coordinate. Region/district/town/housing are left NULL (the Atlas
      doesn't have them, and coordinates can't honestly supply them) — those pins
      still show.

      Crew-type extraction maps Atlas name/description tokens to our EXACT resource
      labels (see label_for): IHC->Hotshot Crew, SMOD->Suppression Module (new),
      WFM/Module->WFM, bare HC / T2IA / '/hand-crews'->Type 2/2IA Handcrew,
      Fuels->Fuels, Job Corps->Job Corps crew, Fire Effects->Fire Effects (new).

SAFE, REVERSIBLE, IDEMPOTENT
  - DEFAULT IS A DRY RUN. Running with no flags only PRINTS what it would do and
    writes NOTHING. You must pass --commit to actually write.
  - Re-runnable: --commit deletes the whole source='handcrew_atlas' group and
    re-inserts it, and re-applies the (idempotent) enrichment, so running twice
    leaves the same result — no duplicates.
  - Before its first write, it saves the pre-Atlas state of every row it will
    enrich to  atlas_import_backup.json  (kept, not overwritten on re-runs).
  - --rollback undoes EVERYTHING: deletes the Atlas additions and restores the
    enriched rows from that backup file.

  Rollback the additions by hand (SQL), any time:
      delete from crews where source = 'handcrew_atlas';

BEFORE YOU RUN
  1. Run atlas_schema.sql in the Supabase SQL Editor first (adds the columns).
  2. Same two secrets as import_to_supabase.py, read from the environment so
     they're never written into this file or committed:
       SUPABASE_URL              -> Project Settings -> API -> "Project URL"
       SUPABASE_SERVICE_ROLE_KEY -> the SECRET key (sb_secret_... or legacy)
     The secret key bypasses Row Level Security so this local script can write.
     NEVER put it in the website, a screenshot, or git.

HOW TO RUN (macOS/Linux, in this folder)
      export SUPABASE_URL="https://xxxxx.supabase.co"
      export SUPABASE_SERVICE_ROLE_KEY="paste-the-secret-key-here"
      python3 atlas_import.py              # dry run: prints the plan, writes nothing
      python3 atlas_import.py --commit     # performs the merge
      python3 atlas_import.py --rollback   # undoes it (additions + enrichment)
"""

import json, os, re, sys, time, zipfile, math
from collections import Counter

try:
    import requests
except ImportError:
    print("Missing 'requests'. Run:  pip install requests")
    sys.exit(1)

KMZ = "Wildland Fire Handcrew Atlas.kmz"
TABLE = "crews"
BACKUP = "atlas_import_backup.json"
MATCH_RADIUS_MI = 5.0
FOREST_CONFIRM_MIN = 0.6   # token-overlap threshold to call two forests the same

# Reverse-geocoding (STATE only) — free OpenStreetMap Nominatim, same service and
# 1-request/second courtesy limit as geocode.py. Results cached to STATE_CACHE
# (gitignored) so re-runs don't re-hit the API.
STATE_CACHE = "state_geocache.json"
NOMINATIM_REVERSE = "https://nominatim.openstreetmap.org/reverse"
NOMINATIM_HEADERS = {"User-Agent": "crew-map/1.0 (firecrewreview@gmail.com)"}

# --- secrets from the environment (same pattern as import_to_supabase.py) ------
URL = os.environ.get("SUPABASE_URL", "").rstrip("/")
KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
if not URL or not KEY:
    print("ERROR: set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY first "
          "(see the top of this file).")
    sys.exit(1)

REST = f"{URL}/rest/v1/{TABLE}"
# Legacy keys are JWTs ("eyJ...") and go in BOTH headers; the newer "sb_secret_"
# keys are NOT JWTs and must go ONLY in `apikey` (Bearer would 403). Identical
# logic to import_to_supabase.py.
HEADERS = {"apikey": KEY, "Content-Type": "application/json"}
if KEY.startswith("eyJ"):
    HEADERS["Authorization"] = f"Bearer {KEY}"


def raise_on_error(r, action):
    """Print Supabase's full RESPONSE (never our request headers, so the secret
    key is never shown) and stop, on any HTTP error."""
    if r.ok:
        return
    print(f"\nERROR while {action}: HTTP {r.status_code} {r.reason}")
    print(f"  Request: {r.request.method} {r.url}")
    print(f"  Response body: {r.text.strip() or '(empty)'}")
    for h in ("www-authenticate", "content-range"):
        if h in r.headers:
            print(f"  {h}: {r.headers[h]}")
    sys.exit(1)


# --- parsing the Atlas ---------------------------------------------------------

def _tag(block, tag):
    m = re.search(rf"<{tag}>(.*?)</{tag}>", block, re.S)
    return m.group(1).strip() if m else ""

def _real_url(desc):
    """The crew's real website: first http(s) link that isn't a Google image."""
    for u in re.findall(r'https?://[^\s"<\]]+', desc):
        if not re.search(r"google|gstatic|hostedimage|mymaps|ggpht", u):
            return u.rstrip(".,")
    return ""

def _photo(block):
    """The one hosted photo, if any (Atlas stores it under gx_media_links)."""
    m = re.search(r'<Data name="gx_media_links">.*?<value>(.*?)</value>', block, re.S)
    if not m:
        return ""
    v = re.sub(r"<!\[CDATA\[|\]\]>", "", m.group(1)).strip()
    return v if v.startswith("http") else ""

def _forest_and_notes(desc):
    """From the free-text description, split off a forest guess and any trailing
    note. Drops the URL and any HTML/image junk first."""
    d = re.sub(r"<!\[CDATA.*", "", desc, flags=re.S)
    d = re.sub(r"https?://\S+", "", d).strip()
    parts = d.split(",", 1)
    forest = parts[0].strip()
    notes = parts[1].strip() if len(parts) > 1 else ""
    return (forest or None), (notes or None)

def _clean_desc(desc):
    """The description as readable text: drop CDATA wrappers and HTML/image tags,
    collapse whitespace. (The URL stays in; label_for ignores URLs.)"""
    d = re.sub(r"<!\[CDATA\[|\]\]>", " ", desc)
    d = re.sub(r"<[^>]+>", " ", d)
    return re.sub(r"\s+", " ", d).strip()

# --- crew-type extraction (Atlas name/description -> our resource labels) -------
# Maps the tokens in an Atlas crew's NAME/DESCRIPTION to the EXACT resource labels
# our data already uses, so filters treat them as one vocabulary. Two labels are
# NEW: "Suppression Module" and "Fire Effects". Precedence = most specific wins:
#   Fire Effects > (desc) Job Corps / T2IA / Fuels > IHC > (name) WFM/Module/Mod
#   > (desc) SMOD > bare HC > URL '/hand-crews'.
# Tokens are scoped on purpose: WFM/Module/Mod/IHC/HC/Fire Effects come from the
# NAME, SMOD/T2IA/Job Corps from the DESCRIPTION (Fuels from either). This means
# name-WFM beats description-SMOD (e.g. "Bandelier WFM" -> WFM), and aspirational
# text like "WFM hopeful" in a description never mislabels a handcrew as a WFM.
def label_for(a):
    N = (a["name"] or "").upper()
    D = re.sub(r"https?://\S+", "", a["desc"] or "").upper()
    U = (a["website"] or "").lower()
    if re.search(r"\bFIRE EFFECTS\b", N) or re.search(r"\bEFFECTS\b", N):
        return "Fire Effects"
    if re.search(r"JOB\s*CORPS?", D + " " + N):
        return "Job Corps crew"
    if re.search(r"\bT2IA?\b|\bTYPE\s*2\b|\bTYPE\s*II\b", D + " " + N):
        return "Type 2/2IA Handcrew"
    if re.search(r"\bFUELS?\b", D + " " + N):
        return "Fuels"
    if re.search(r"\bIHC\b", N):
        return "Hotshot Crew"
    if re.search(r"\bWFM\b|\bMODULES?\b|\bMOD\b", N):   # NAME-WFM beats desc-SMOD
        return "WFM"
    if re.search(r"\bSMOD\b", D):
        return "Suppression Module"
    if re.search(r"\bHC\b", N):
        return "Type 2/2IA Handcrew"
    if "/hand-crews" in U:
        return "Type 2/2IA Handcrew"
    return None

def load_atlas():
    with zipfile.ZipFile(KMZ) as z:
        name = next((n for n in z.namelist() if n.endswith(".kml")), None)
        if not name:
            print(f"ERROR: no .kml inside {KMZ}")
            sys.exit(1)
        kml = z.read(name).decode("utf-8", "replace")
    out = []
    for pm in re.findall(r"<Placemark>.*?</Placemark>", kml, re.S):
        coord = _tag(pm, "coordinates").replace("\n", " ")
        nums = re.findall(r"-?\d+\.\d+", coord)
        if len(nums) < 2:
            continue
        desc = _tag(pm, "description")
        forest, notes = _forest_and_notes(desc)
        rec = {
            "name": _tag(pm, "name") or None,
            "desc": _clean_desc(desc),        # full text, for crew-type tokens
            "forest": forest,
            "notes": notes,
            "website": _real_url(desc) or None,
            "photo_url": _photo(pm) or None,  # photo lives in ExtendedData, not desc
            "latitude": float(nums[1]),
            "longitude": float(nums[0]),
        }
        rec["label"] = label_for(rec)         # our resource label, or None
        out.append(rec)
    return out


# --- matching (proximity + forest confirm) -------------------------------------

_STOP = set("nf nfs np nps smod wfm hc ihc crew fuels module mod engine helitack "
            "rappel hotshot prevention hopeful type job corp and the of".split())

def _toks(t):
    t = re.sub(r"[^a-z ]", " ", (t or "").lower())
    return set(w for w in t.split() if w not in _STOP and len(w) > 1)

def _forest_match(a, b):
    A, B = _toks(a), _toks(b)
    return bool(A and B) and len(A & B) / min(len(A), len(B)) >= FOREST_CONFIRM_MIN

def _miles(a1, o1, a2, o2):
    R = 3958.8; p = math.pi / 180
    dlat = (a2 - a1) * p; dlon = (o2 - o1) * p
    x = math.sin(dlat / 2) ** 2 + math.cos(a1 * p) * math.cos(a2 * p) * math.sin(dlon / 2) ** 2
    return 2 * R * math.asin(math.sqrt(x))


# --- reverse-geocode STATE from coordinates (Nominatim, cached) -----------------
# The coordinate reliably determines the US STATE — and only the state. We do NOT
# infer region/town/housing, which coordinates don't give us honestly. Cached to
# STATE_CACHE (gitignored); only cache MISSES hit the network (and sleep 1.1s).

def _load_state_cache():
    if os.path.exists(STATE_CACHE):
        try:
            return json.load(open(STATE_CACHE, encoding="utf-8"))
        except Exception:
            return {}
    return {}

def _reverse_state(lat, lng, cache):
    """UPPERCASE state name for a coordinate, or None. Uses/updates `cache`
    (keyed by rounded lat,lng); calls Nominatim only on a miss."""
    key = f"{round(lat, 4)},{round(lng, 4)}"
    if key in cache:
        return cache[key]
    state = None
    try:
        r = requests.get(NOMINATIM_REVERSE, headers=NOMINATIM_HEADERS, timeout=20,
                         params={"lat": lat, "lon": lng, "format": "json",
                                 "zoom": 5, "addressdetails": 1})
        r.raise_for_status()
        st = (r.json().get("address", {}) or {}).get("state")
        state = st.upper() if st else None
    except Exception as e:
        print(f"   (reverse-geocode error at {key}: {e})")
    cache[key] = state
    time.sleep(1.1)   # Nominatim asks for <= 1 request/second
    return state

def derive_states(records):
    """Set rec['derived_state'] for each record that needs a state. Loads + saves
    the on-disk cache and prints light progress. Safe to interrupt (cache is saved
    every 25 lookups) and idempotent (cached coords are instant)."""
    cache = _load_state_cache()
    def key(a): return f"{round(a['latitude'], 4)},{round(a['longitude'], 4)}"
    misses = sum(1 for a in records if key(a) not in cache)
    if misses:
        print(f"Reverse-geocoding state for {misses} new coordinate(s) via Nominatim "
              f"(~{misses * 1.1 / 60:.0f} min the first time; cached afterwards)…")
    for i, a in enumerate(records, 1):
        a["derived_state"] = _reverse_state(a["latitude"], a["longitude"], cache)
        if i % 25 == 0:
            json.dump(cache, open(STATE_CACHE, "w", encoding="utf-8"), indent=2)
    json.dump(cache, open(STATE_CACHE, "w", encoding="utf-8"), indent=2)


# --- Supabase helpers ----------------------------------------------------------

def count_where(source=None):
    params = {"select": "id", "limit": 1}
    if source:
        params["source"] = f"eq.{source}"
    r = requests.get(REST, headers={**HEADERS, "Prefer": "count=exact"},
                     params=params, timeout=30)
    raise_on_error(r, "counting rows")
    return int(r.headers.get("content-range", "*/0").split("/")[-1])

def fetch_curated_crews():
    """All non-Atlas rows (our curated base), with the fields we need to match
    and to back up before enriching."""
    r = requests.get(REST, headers=HEADERS, params={
        "select": "id,latitude,longitude,forest,town,state,website,crew_name,photo_url,resource",
        "source": "neq.handcrew_atlas", "limit": 100000,
    }, timeout=60)
    raise_on_error(r, "fetching current crews")
    return r.json()

def delete_atlas_additions():
    r = requests.delete(REST, headers={**HEADERS, "Prefer": "return=minimal"},
                        params={"source": "eq.handcrew_atlas"}, timeout=60)
    raise_on_error(r, "deleting existing Atlas additions")

def patch_row(row_id, body):
    r = requests.patch(REST, headers={**HEADERS, "Prefer": "return=minimal"},
                       params={"id": f"eq.{row_id}"}, data=json.dumps(body), timeout=30)
    raise_on_error(r, f"updating crew id={row_id}")

def insert_rows(rows):
    for start in range(0, len(rows), 100):
        batch = rows[start:start + 100]
        r = requests.post(REST, headers={**HEADERS, "Prefer": "return=minimal"},
                          data=json.dumps(batch), timeout=60)
        raise_on_error(r, f"inserting new rows {start + 1}-{start + len(batch)}")


# --- plan: decide matches vs new (pure, no writes) -----------------------------

def build_plan(atlas, crews):
    matches, new = [], []
    for a in atlas:
        best, bd = None, 1e9
        for c in crews:
            d = _miles(a["latitude"], a["longitude"], c["latitude"], c["longitude"])
            if d < bd:
                bd, best = d, c
        if best and bd <= MATCH_RADIUS_MI and _forest_match(a["forest"], best.get("forest")):
            matches.append((a, best, bd))
        else:
            new.append(a)
    return matches, new

def _blank(v):
    return v is None or str(v).strip() == ""

def enrich_body(a, crew):
    """The PATCH body for a matched row. Only sets a field when the Atlas has a
    value, so we never blank one of ours (satisfies the website rule). Resource
    is filled ONLY if ours is currently blank — a curated crew type is never
    overwritten."""
    body = {"crew_name": a["name"]}
    if a["website"]:
        body["website"] = a["website"]     # atlas present -> prefer/fill with atlas
    if a["photo_url"]:
        body["photo_url"] = a["photo_url"]
    if a["label"] and _blank(crew.get("resource")):
        body["resource"] = a["label"]      # fill-only-if-blank; never overwrite
    if a.get("derived_state") and _blank(crew.get("state")):
        body["state"] = a["derived_state"] # fill-only-if-blank; never overwrite
    return body

def new_row(a):
    return {
        "crew_name": a["name"], "forest": a["forest"], "notes": a["notes"],
        "website": a["website"], "photo_url": a["photo_url"],
        "resource": a["label"],              # extracted crew type (may be None)
        "state": a.get("derived_state"),     # reverse-geocoded from coords (may be None)
        "latitude": a["latitude"], "longitude": a["longitude"],
        "source": "handcrew_atlas",
    }


# --- the three modes -----------------------------------------------------------

def do_rollback():
    print("ROLLBACK — undoing the Atlas merge.\n")
    removed = count_where("handcrew_atlas")
    delete_atlas_additions()
    print(f"  deleted {removed} rows tagged source='handcrew_atlas' (the additions).")
    if os.path.exists(BACKUP):
        saved = json.load(open(BACKUP, encoding="utf-8"))
        for row in saved:
            patch_row(row["id"], {"crew_name": row.get("crew_name"),
                                  "photo_url": row.get("photo_url"),
                                  "website": row.get("website"),
                                  "resource": row.get("resource"),
                                  "state": row.get("state")})
        print(f"  restored {len(saved)} enriched rows from {BACKUP}.")
        print(f"  ({BACKUP} left in place; delete it yourself once you're happy.)")
    else:
        print(f"  no {BACKUP} found — nothing to restore for enrichment.")
    print("\nDone. The table is back to its pre-Atlas state.")

def run(commit):
    atlas = load_atlas()
    print(f"Parsed {len(atlas)} Atlas placemarks from {KMZ}.")
    # Start from a clean base every run: drop any prior additions so proximity
    # matching only ever considers our curated crews (never a self-match against
    # a row we added last time). On --commit this also makes re-runs idempotent.
    if commit:
        delete_atlas_additions()
    crews = fetch_curated_crews()
    print(f"Fetched {len(crews)} curated crews from Supabase.\n")

    matches, new = build_plan(atlas, crews)

    # Derive STATE from coordinates for crews that lack one: ALL new crews, plus
    # any matched crew whose state is blank (we never overwrite an existing state).
    need_state = list(new) + [a for a, c, _ in matches if _blank(c.get("state"))]
    derive_states(need_state)

    photos_m = sum(1 for a, _, _ in matches if a["photo_url"])
    web_changes = sum(1 for a, _, _ in matches if a["website"])
    print("PLAN")
    print(f"  ENRICH (confirmed matches): {len(matches)}")
    print(f"      + crew_name on all {len(matches)}")
    print(f"      + photo_url on {photos_m}")
    print(f"      + website set/preferred-to-Atlas on {web_changes} (others keep ours)")
    print(f"  ADD (Atlas-only new crews): {len(new)}  -> source='handcrew_atlas'")
    print(f"      (of which carry a photo: {sum(1 for a in new if a['photo_url'])})")

    # Crew-type extraction summary (new rows get the label; matched rows only
    # fill resource when ours is blank).
    new_labels = Counter(a["label"] for a in new)
    fill, kept = Counter(), 0
    for a, c, _ in matches:
        if not _blank(c.get("resource")):
            kept += 1
        elif a["label"]:
            fill[a["label"]] += 1
    print("  CREW-TYPE resource extraction:")
    print(f"      new labeled: {sum(v for k, v in new_labels.items() if k)}"
          f"  (blank: {new_labels[None]})")
    for lbl, n in new_labels.most_common():
        if lbl:
            print(f"        {n:>4}  {lbl}")
    print(f"      matched filled (were blank): {sum(fill.values())};"
          f"  kept existing: {kept}")
    for lbl, n in fill.most_common():
        print(f"        {n:>4}  {lbl}  (fill)")

    # State-fill summary (reverse-geocoded from coordinates; fill-only-if-blank).
    state_new = sum(1 for a in new if a.get("derived_state"))
    state_matched = sum(1 for a, c, _ in matches
                        if _blank(c.get("state")) and a.get("derived_state"))
    print("  STATE (reverse-geocoded from coordinates, fill-only-if-blank):")
    print(f"      new crews given a state: {state_new}/{len(new)}"
          f"  (couldn't resolve: {len(new) - state_new})")
    print(f"      matched crews filled (were blank): {state_matched}")
    for a in [x for x in new if x.get("derived_state")][:5]:
        print(f"        {a['name'][:24]:24} ({a['latitude']:.3f},{a['longitude']:.3f})"
              f" -> {a['derived_state']}")
    print()

    if not commit:
        print("DRY RUN — nothing written. Re-run with --commit to apply.")
        return

    # Safety backup of the exact pre-enrichment state (written once, then kept).
    if not os.path.exists(BACKUP):
        snap = [{"id": c["id"], "crew_name": c.get("crew_name"),
                 "photo_url": c.get("photo_url"), "website": c.get("website"),
                 "resource": c.get("resource"), "state": c.get("state")}
                for a, c, _ in matches]
        json.dump(snap, open(BACKUP, "w", encoding="utf-8"), indent=2)
        print(f"Wrote pre-Atlas backup of {len(snap)} rows to {BACKUP}.")
    else:
        print(f"Keeping existing {BACKUP} (original pre-Atlas snapshot).")

    for a, c, _ in matches:
        patch_row(c["id"], enrich_body(a, c))
    print(f"Enriched {len(matches)} existing crews.")

    insert_rows([new_row(a) for a in new])
    print(f"Inserted {len(new)} new Atlas crews.")

    total = count_where()
    added = count_where("handcrew_atlas")
    print(f"\nDone. `crews` now has {total} rows ({added} tagged handcrew_atlas).")
    print("Rollback anytime with:  python3 atlas_import.py --rollback")
    print("             or in SQL:  delete from crews where source = 'handcrew_atlas';")


def main():
    if "--rollback" in sys.argv:
        do_rollback()
    else:
        run(commit="--commit" in sys.argv)

if __name__ == "__main__":
    main()
