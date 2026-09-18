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

    * ADD/UPDATE the crews only the Atlas has (far from any crew, or near one but
      a different forest — e.g. non-USFS TNC/NPS/BLM/BIA/state crews) as rows
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

SAFE, REVERSIBLE, IDEMPOTENT — genuinely, now, on the ADD/UPDATE side too
  - DEFAULT IS A DRY RUN. Running with no flags only PRINTS what it would do and
    writes NOTHING. You must pass --commit to actually write.
  - Re-runnable, by UPSERT, not delete-all/insert-all: each Atlas placemark gets
    a stable atlas_key = md5(name|lat 4dp|lon 4dp) (see atlas_key() below). A
    placemark whose key already exists on a crews row PATCHES that row IN PLACE
    — same `id` — instead of being deleted and reinserted. A placemark with no
    matching key is INSERTed as a genuinely new row. An existing Atlas row whose
    key no longer appears in the parsed KMZ is a candidate for removal.
    -- REQUIRES atlas_stable_ids_migration.sql to have been run first (adds the
       `atlas_key` column and a RESTRICT foreign key from crew_submissions.crew_id
       -> crews.id). Without that migration this script will fail loudly trying
       to read/write a column that doesn't exist yet — on purpose, rather than
       silently falling back to the old delete-all behavior.
    -- WHY THIS MATTERS: the OLD version of this script deleted the entire
       source='handcrew_atlas' group and reinserted it on every --commit, which
       handed every one of the ~389 Atlas crews a brand-new serial `id` on every
       run — whether or not the source KMZ had actually changed. Any
       crew_submissions row (a correction report) pointing at one of those ids
       was silently orphaned by the NEXT unrelated re-run, not just by a change
       to the crew it targeted. This version only ever changes an id when a
       placemark is genuinely new or genuinely gone from the source.
    -- REMOVALS ARE ONE ROW AT A TIME, ON PURPOSE. With the RESTRICT foreign key
       in place, a crew that still has an open submission/correction against it
       CANNOT be deleted — the delete is refused, reported, and the row is left
       in place rather than the whole run failing or the reference going stale.
       (A single bulk DELETE would instead fail ALL-OR-NOTHING: one blocked row
       would silently block every other legitimate removal in the same batch.)
  - The ENRICH side (curated crews) was already id-stable — it PATCHes existing
    rows by their existing `id` and always has. Nothing changes there.
  - Before its first write, it saves the pre-Atlas state of every row it will
    enrich to  atlas_import_backup.json  (kept, not overwritten on re-runs).
  - --rollback undoes the merge: removes Atlas rows (one at a time, same RESTRICT
    handling as above — a blocked row is reported and left in place, not silently
    kept or silently forced through) and restores the enriched rows from that
    backup file.

  Rollback the additions by hand (SQL) — NOTE this is now subject to the same
  RESTRICT foreign key, so it may refuse rows with open corrections:
      delete from crews where source = 'handcrew_atlas';

BEFORE YOU RUN
  1. Run atlas_schema.sql in the Supabase SQL Editor first (adds the columns),
     if you haven't already (it's from the original merge, additive+idempotent).
  2. Run atlas_stable_ids_migration.sql STEP 1, then backfill_atlas_key.py
     --commit, then atlas_stable_ids_migration.sql STEP 3 — in that order, once,
     before the first run of THIS version of the script. (Already-done ==
     skip straight to step 3 below.)
  3. Same two secrets as import_to_supabase.py, read from the environment so
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

import hashlib, json, os, re, sys, time, zipfile, math
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


class RestrictedDeleteError(Exception):
    """Raised when Postgres refuses to delete a crews row because a foreign
    key (crew_submissions.crew_id, ON DELETE RESTRICT) still points at it.
    Callers catch this per-row so one blocked crew never aborts the rest of
    a batch — see the module docstring for why that matters."""
    def __init__(self, row_id, detail):
        self.row_id = row_id
        self.detail = detail
        super().__init__(f"crew id={row_id} is still referenced: {detail}")


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


# --- stable identity for one Atlas placemark ------------------------------------

def atlas_key(name, lat, lon):
    """The identity atlas_import.py uses to recognize 'this is the same
    placemark as last time', across re-runs and across --commit's delete/
    insert boundary. Deliberately EXACT, not fuzzy: name + coordinate rounded
    to 4 decimal degrees (~11m) — the same string a KMZ re-export of an
    UNCHANGED placemark will always produce.

    TRADE-OFF, STATED PLAINLY: if the Atlas maintainer edits a placemark's
    name or nudges its pin, this key changes, and the next --commit will see
    it as one crew removed + one crew added (new id) rather than an in-place
    update. That's accepted — it only happens when the source genuinely
    changed, which is rare, versus the old bug where EVERY crew got a new id
    on EVERY run regardless of whether anything changed. A renamed/moved
    placemark arguably deserves a fresh look anyway.

    MUST MATCH backfill_atlas_key.py's computation exactly — that script
    imports this function directly rather than reimplementing the formula, so
    the two can never drift apart.
    """
    raw = f"{(name or '').strip()}|{round(lat, 4)}|{round(lon, 4)}"
    return hashlib.md5(raw.encode("utf-8")).hexdigest()


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

_GOOGLE_HOST_RE = re.compile(r"google|gstatic|hostedimage|mymaps|ggpht", re.I)

def _is_google_hosted(url):
    """True for a Google-served URL — the ones photo_rehost.py (2026-08-28)
    exists specifically to get AWAY from, because Google serves them with a
    cross-origin-resource-policy header that blocks them in every real
    browser (see TODO_LATER.md; curl can't detect it, which is exactly how
    that bug hid the first time). Used to make sure a routine Atlas re-sync
    never overwrites an already-rehosted photo_url (pointing at our own
    Supabase Storage) with this kind of URL again."""
    return bool(url) and bool(_GOOGLE_HOST_RE.search(url))

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

def _clean_name(raw):
    """Normalize a placemark's <name> EXACTLY the way the one-time Phase 2.7
    pass normalized the same text after it was already sitting in the
    database: strip a CDATA wrapper if present, and collapse any run of
    whitespace -- most commonly Google's non-breaking space (U+00A0),
    which Python's \\s matches same as a normal space -- down to one plain
    space.

    WHY THIS EXISTS: without it, a KMZ placemark named e.g.
    'Yellowstone\\xa0WFM' (real example, confirmed via
    diagnose_by_location.py) parses to a DIFFERENT atlas_key than the
    ALREADY-CLEANED 'Yellowstone WFM' sitting in `crews.crew_name` -- so
    every one of the ~55 placemarks Phase 2.7 cleaned once would look like
    it vanished from the source on every future re-run, get REMOVEd, and
    get immediately re-INSERTed under a brand-new id. That's the exact
    id-churn bug atlas_key was built to stop, sneaking back in through a
    single un-normalized field. Confirmed empirically before this fix
    landed: 54 of the ~55 originally-cleaned rows hit this on a real re-run.
    """
    if raw is None:
        return None
    s = re.sub(r"<!\[CDATA\[|\]\]>", "", raw)
    s = re.sub(r"\s+", " ", s).strip()
    return s or None

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
            "name": _clean_name(_tag(pm, "name")),
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

def fetch_atlas_rows():
    """Existing source='handcrew_atlas' rows, keyed by atlas_key, so a fresh
    parse of the KMZ can be diffed against what's already in the table instead
    of blindly deleting and reinserting everything."""
    r = requests.get(REST, headers=HEADERS, params={
        "select": "id,atlas_key,crew_name,forest,notes,website,photo_url,"
                  "resource,state,latitude,longitude",
        "source": "eq.handcrew_atlas", "limit": 100000,
    }, timeout=60)
    raise_on_error(r, "fetching existing Atlas rows")
    rows = r.json()
    missing_key = [row["id"] for row in rows if not row.get("atlas_key")]
    if missing_key:
        print(f"ERROR: {len(missing_key)} existing handcrew_atlas row(s) have no "
              f"atlas_key (ids: {missing_key[:10]}{'...' if len(missing_key) > 10 else ''}).")
        print("  Run atlas_stable_ids_migration.sql STEP 1 and backfill_atlas_key.py")
        print("  --commit before using this version of atlas_import.py.")
        sys.exit(1)
    return rows

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

def delete_row(row_id):
    """Delete ONE crews row. Raises RestrictedDeleteError if Postgres refuses
    because a crew_submissions row still references it (the RESTRICT foreign
    key from atlas_stable_ids_migration.sql) — callers handle that per row so
    it never aborts a whole batch. Any OTHER failure still stops the script,
    same as raise_on_error everywhere else."""
    r = requests.delete(REST, headers={**HEADERS, "Prefer": "return=minimal"},
                        params={"id": f"eq.{row_id}"}, timeout=30)
    if r.ok:
        return
    if r.status_code == 409 or "23503" in r.text or "foreign key" in r.text.lower():
        raise RestrictedDeleteError(row_id, r.text.strip())
    raise_on_error(r, f"deleting crew id={row_id}")


# --- plan: decide matches vs new vs update (pure, no writes) -------------------

def build_plan(atlas, crews):
    """Decide which Atlas placemarks enrich an existing curated crew, and which
    are Atlas-sourced crews in their own right. Pure: works out a plan, writes
    nothing.

    ONE CURATED CREW CAN BE CLAIMED BY ONLY ONE PLACEMARK.
    Several Atlas placemarks often sit inside the match radius of the same
    curated crew — a base with three modules sharing one address, for instance.
    The first version of this function let all of them "match" it. Every match
    PATCHed that same row, so the last placemark processed won the crew_name,
    and the earlier ones were recorded as matched and therefore NEVER inserted
    as rows of their own. 14 real crews disappeared that way: no row, no pin,
    and nothing looked broken because each one sits next to a crew that does
    show. So a crew is claimed once, by its CLOSEST placemark, and the
    runners-up fall through to `new` — which is where they belonged all along.
    """
    # --- pass 1: collect claims -------------------------------------------
    # Per placemark this is the original rule, unchanged: the single nearest
    # curated crew, accepted only if it is close enough AND the forest names
    # agree. Deliberately NOT widened to "any crew in range" — that would
    # invent matches the old code never made and quietly rewrite live rows.
    # Nothing is decided here; we only note who wants what.
    claims = []      # (distance, order, placemark, crew) — qualifying placemarks
    leftovers = []   # (order, placemark) — no qualifying candidate at all
    for order, a in enumerate(atlas):
        best, bd = None, 1e9
        for c in crews:
            d = _miles(a["latitude"], a["longitude"], c["latitude"], c["longitude"])
            if d < bd:
                bd, best = d, c
        if best and bd <= MATCH_RADIUS_MI and _forest_match(a["forest"], best.get("forest")):
            claims.append((bd, order, a, best))
        else:
            leftovers.append((order, a))

    # --- pass 2: settle contested crews ------------------------------------
    # Sorting by distance means the closest claim on any crew is seen first and
    # wins it. `order` is only a tie-breaker, so two identical distances always
    # resolve the same way and re-runs stay deterministic. Losing a contest
    # does not mean the placemark is a duplicate — it means it is a different
    # crew that happens to sit nearby, so it becomes its own row.
    winner_by_crew = {}          # crew id -> (order, placemark, crew, distance)
    for bd, order, a, c in sorted(claims, key=lambda t: (t[0], t[1])):
        if c["id"] in winner_by_crew:
            leftovers.append((order, a))
        else:
            winner_by_crew[c["id"]] = (order, a, c, bd)

    # Hand both lists back in the original Atlas order, so the dry-run output
    # and the inserted rows read the same way from one run to the next.
    matches = [(a, c, bd)
               for order, a, c, bd in sorted(winner_by_crew.values(),
                                             key=lambda t: t[0])]
    new = [a for order, a in sorted(leftovers, key=lambda t: t[0])]
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
    # Never let a routine re-sync overwrite an already-rehosted photo (see
    # _is_google_hosted's docstring) with the raw Google URL the KMZ still
    # carries. Only take the Atlas photo when this crew doesn't already have
    # a working one on file (blank, or still an un-rehosted Google URL).
    if a["photo_url"] and (_blank(crew.get("photo_url"))
                            or _is_google_hosted(crew.get("photo_url"))):
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
        "atlas_key": atlas_key(a["name"], a["latitude"], a["longitude"]),
    }

# Fields atlas_import.py owns on an Atlas-sourced row. Used to tell "matched
# by key AND already identical" apart from "matched by key but content moved
# on" — atlas_key alone only proves it's the same PLACEMARK, not that nothing
# about it changed (a website could've been added, a forest name corrected).
_ATLAS_FIELDS = ("crew_name", "forest", "notes", "website", "photo_url",
                  "resource", "state", "latitude", "longitude")

def _row_differs(existing, desired):
    return any(existing.get(f) != desired.get(f) for f in _ATLAS_FIELDS)

def plan_atlas_upsert(new_records, existing_rows):
    """Diff freshly-parsed Atlas placemarks against what's already in `crews`,
    by atlas_key. Returns (to_update, to_insert, to_remove, unchanged_count):
      to_update  — [(existing crews.id, desired row body)] — same id, PATCHed,
                    ONLY when some field actually differs (see _row_differs) —
                    a placemark that's genuinely identical to what's already
                    stored is counted in unchanged_count instead and never
                    touched at all.
      to_insert  — [row body] — genuinely new placemarks, get a new id
      to_remove  — [existing row dict] — no placemark in this parse still
                    claims this key (removed/renamed upstream), candidate for
                    deletion, handled one row at a time by the RESTRICT FK.
      unchanged_count — matched AND byte-identical; zero writes for these.
    This is the whole fix: the OLD code's equivalent of this function was
    "delete everything, then insert everything" — which is `to_remove = all
    existing rows` and `to_insert = all new rows`, EVERY run, regardless of
    whether anything changed. Here, a placemark that's exactly what's already
    on file produces neither a write nor an id change.

    PHOTO PROTECTION: an UPDATE never overwrites an already-rehosted photo
    (see _is_google_hosted) with the raw Google URL the KMZ still carries —
    same reasoning as enrich_body(). This only matters for to_update (an
    existing row to preserve); a fresh to_insert has nothing to protect.
    """
    by_key = {row["atlas_key"]: row for row in existing_rows}
    seen_keys = set()
    to_update, to_insert, unchanged = [], [], 0
    for a in new_records:
        row = new_row(a)
        seen_keys.add(row["atlas_key"])
        existing = by_key.get(row["atlas_key"])
        if existing:
            if row["photo_url"] and not _blank(existing.get("photo_url")) \
                    and not _is_google_hosted(existing.get("photo_url")):
                row["photo_url"] = existing["photo_url"]   # keep the rehosted one
            if _row_differs(existing, row):
                to_update.append((existing["id"], row))
            else:
                unchanged += 1
        else:
            to_insert.append(row)
    to_remove = [row for row in existing_rows if row["atlas_key"] not in seen_keys]
    return to_update, to_insert, to_remove, unchanged


# --- the three modes -----------------------------------------------------------

def do_rollback():
    print("ROLLBACK — undoing the Atlas merge.\n")
    atlas_rows = fetch_atlas_rows()
    removed, blocked = 0, []
    # One at a time, ON PURPOSE (see module docstring): a single bulk DELETE
    # would be all-or-nothing under the RESTRICT foreign key, so one crew with
    # an open correction would silently block every other legitimate removal
    # in the same statement. This way the 388 unblocked rows still go.
    for row in atlas_rows:
        try:
            delete_row(row["id"])
            removed += 1
        except RestrictedDeleteError:
            blocked.append(row)
    print(f"  deleted {removed} of {len(atlas_rows)} rows tagged source='handcrew_atlas'.")
    if blocked:
        print(f"\n  KEPT {len(blocked)} row(s) — still referenced by an open "
              f"submission/correction (crew_submissions.crew_id):")
        for row in blocked:
            print(f"    id={row['id']:<6} {row.get('crew_name')}")
        print("  Resolve those in `pending_corrections` / `pending_submissions`")
        print("  (resolve_correction() / reject_submission()), then re-run --rollback")
        print("  to remove them too.")
    if os.path.exists(BACKUP):
        saved = json.load(open(BACKUP, encoding="utf-8"))
        for row in saved:
            patch_row(row["id"], {"crew_name": row.get("crew_name"),
                                  "photo_url": row.get("photo_url"),
                                  "website": row.get("website"),
                                  "resource": row.get("resource"),
                                  "state": row.get("state")})
        print(f"\n  restored {len(saved)} enriched rows from {BACKUP}.")
        print(f"  ({BACKUP} left in place; delete it yourself once you're happy.)")
    else:
        print(f"\n  no {BACKUP} found — nothing to restore for enrichment.")
    print("\nDone." if not blocked else "\nDone, partially — see KEPT rows above.")

def run(commit):
    atlas = load_atlas()
    print(f"Parsed {len(atlas)} Atlas placemarks from {KMZ}.")
    crews = fetch_curated_crews()
    print(f"Fetched {len(crews)} curated crews from Supabase.\n")

    matches, new = build_plan(atlas, crews)

    # Derive STATE from coordinates for crews that lack one: ALL Atlas-sourced
    # placemarks, plus any matched curated crew whose state is blank (we never
    # overwrite an existing state).
    need_state = list(new) + [a for a, c, _ in matches if _blank(c.get("state"))]
    derive_states(need_state)

    photos_m = sum(1 for a, _, _ in matches if a["photo_url"])
    web_changes = sum(1 for a, _, _ in matches if a["website"])
    print("PLAN")
    print(f"  ENRICH (confirmed matches): {len(matches)}")
    print(f"      + crew_name on all {len(matches)}")
    print(f"      + photo_url on {photos_m}")
    print(f"      + website set/preferred-to-Atlas on {web_changes} (others keep ours)")

    # Diff the Atlas-sourced side against what's already in the table, instead
    # of assuming it all needs writing (see plan_atlas_upsert's docstring).
    # Fetched on the dry run too, deliberately — "show me before you build it"
    # means the printed plan below must match what --commit will actually do.
    existing_atlas = fetch_atlas_rows()
    to_update, to_insert, to_remove, unchanged = plan_atlas_upsert(new, existing_atlas)
    print(f"  ATLAS-SOURCED CREWS ({len(new)} placemarks, {len(existing_atlas)} "
          f"currently in `crews`):")
    print(f"      unchanged (same atlas_key AND same content, zero writes): "
          f"{unchanged}")
    print(f"      UPDATE in place (same id, some field changed): {len(to_update)}")
    if to_update:
        existing_by_id = {r["id"]: r for r in existing_atlas}
        print(f"        sample of what's actually changing (first 8 of {len(to_update)}):")
        for row_id, desired in to_update[:8]:
            old = existing_by_id[row_id]
            diffs = [f for f in _ATLAS_FIELDS if old.get(f) != desired.get(f)]
            print(f"          id={row_id:<6} {desired.get('crew_name')}")
            for f in diffs:
                print(f"              {f}: {old.get(f)!r}  ->  {desired.get(f)!r}")
    print(f"      INSERT (new placemark, new id): {len(to_insert)}")
    print(f"      REMOVE (no longer in the source KMZ): {len(to_remove)}")
    if to_remove:
        for row in to_remove[:10]:
            print(f"        id={row['id']:<6} {row.get('crew_name')}")
        if len(to_remove) > 10:
            print(f"        ... and {len(to_remove) - 10} more")
        print("        (each REMOVE is attempted individually on --commit; one still")
        print("         referenced by an open correction is kept and reported, not")
        print("         forced through or silently skipped.)")

    # Crew-type extraction summary (new/updated rows get the label; matched
    # curated rows only fill resource when ours is blank).
    new_labels = Counter(a["label"] for a in new)
    fill, kept = Counter(), 0
    for a, c, _ in matches:
        if not _blank(c.get("resource")):
            kept += 1
        elif a["label"]:
            fill[a["label"]] += 1
    print("  CREW-TYPE resource extraction:")
    print(f"      atlas-sourced labeled: {sum(v for k, v in new_labels.items() if k)}"
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
    print(f"      atlas-sourced crews given a state: {state_new}/{len(new)}"
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

    for row_id, body in to_update:
        patch_row(row_id, body)
    print(f"Updated {len(to_update)} existing Atlas-sourced crews in place (same id).")

    insert_rows(to_insert)
    print(f"Inserted {len(to_insert)} new Atlas-sourced crews.")

    removed, blocked = 0, []
    for row in to_remove:
        try:
            delete_row(row["id"])
            removed += 1
        except RestrictedDeleteError:
            blocked.append(row)
    print(f"Removed {removed} of {len(to_remove)} Atlas-sourced crews no longer "
          f"in the source KMZ.")
    if blocked:
        print(f"  KEPT {len(blocked)} — referenced by an open submission/correction:")
        for row in blocked:
            print(f"    id={row['id']:<6} {row.get('crew_name')}")
        print("  Resolve those, then re-run --commit to finish removing them.")

    total = count_where()
    added = count_where("handcrew_atlas")
    print(f"\nDone. `crews` now has {total} rows ({added} tagged handcrew_atlas).")
    print("Rollback anytime with:  python3 atlas_import.py --rollback")


def main():
    if "--rollback" in sys.argv:
        do_rollback()
    else:
        run(commit="--commit" in sys.argv)

if __name__ == "__main__":
    main()
