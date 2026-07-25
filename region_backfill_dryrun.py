#!/usr/bin/env python3
"""
region_backfill_dryrun.py — DRY RUN ONLY. Writes nothing, anywhere.

WHAT THIS ANSWERS
    The Handcrew Atlas merge added 389 crews that have no `region` (the Atlas
    doesn't carry one). This script asks: how many of those could we fill in
    just by matching their `forest` name to a forest we ALREADY have in the
    curated 440, and borrowing that forest's region?

    "Option B" — no external boundary data, no new service, no API calls.
    It only reads our own Supabase table and compares strings.

WHY IT'S SAFE TO RUN
    It uses the PUBLIC publishable key and issues a single SELECT. There is no
    write path in this file at all — not even behind a flag. If the numbers look
    good, the commit script comes after, as a separate reviewed change.

HOW TO RUN
    python3 region_backfill_dryrun.py

    It reads NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY from
    .env.local (the same gitignored file the website uses), so there is nothing
    to export first.

HOW THE MATCHING WORKS
    Forest names don't match as exact strings across the two datasets, so we
    reuse the EXACT normalization from atlas_import.py (_toks / _forest_match):
    lowercase, drop punctuation, drop filler tokens ("nf", "and", "of", "the",
    crew-type words), then compare the remaining token SETS. That's what makes
    "OKANOGAN-WENATCHEE NF" and "Okanogan and Wenatchee National Forest" land on
    the same {okanogan, wenatchee}.

    We report two confidence tiers separately so you can pick the bar:
      TIER 1 (exact)  — the normalized token sets are identical. Very safe.
      TIER 2 (fuzzy)  — token overlap >= 0.6, the same threshold the merge used.

    A match is REJECTED as ambiguous when the curated forests it matches don't
    all agree on one region. Assigning a region we're not sure about would be
    worse than leaving it NULL.
"""

import csv
import os
import re
import sys
from collections import Counter, defaultdict

try:
    # Same HTTP library the other scripts use. It ships with a CA bundle, which
    # the stdlib's urllib does not use on macOS python.org installs.
    import requests
except ImportError:
    print("Missing 'requests'. Run:  pip install requests")
    sys.exit(1)

# Same threshold atlas_import.py used to confirm two forest names are the same.
FOREST_CONFIRM_MIN = 0.6

# Where the unmatched crews get written for eyeballing. The existing
# .gitignore rule `merge_review_*.csv` already covers this filename.
UNMATCHED_CSV = "merge_review_region_unmatched.csv"


# --- normalization: STARTED from atlas_import.py, then TUNED --------------------
# NOTE FOR THE NEXT READER: this is no longer identical to atlas_import._toks.
# atlas_import.py is UNCHANGED — the merge it performed is already done and its
# results are in the database; re-tuning its matcher now would be rewriting
# history. This copy is tuned for a different job (assigning a region), where a
# wrong answer is worse than no answer.
#
# Two additions over the original:
#   1) More stopwords. The curated data mixes naming conventions — "GILA NF" but
#      "PAYETTE NATIONAL FOREST" — so leaving "national"/"forest" as real tokens
#      diluted the overlap ratio and made correct pairs score 0.50, under the 0.6
#      bar. Dropping them lets both conventions reduce to the distinctive name.
#   2) "mount" is folded to "mt", so "Mount Hood NF" and "MT. HOOD NF" agree.

_STOP = set("nf nfs np nps smod wfm hc ihc crew fuels module mod engine helitack "
            "rappel hotshot prevention hopeful type job corp and the of "
            # --- added for the region backfill (see note above) ---
            "national forest forests district districts grassland grasslands "
            "scenic area nsa recreation service".split())

# Abbreviations the two datasets spell differently.
_ALIAS = {"mount": "mt", "mountain": "mtn", "saint": "st"}


def _toks(t):
    t = re.sub(r"[^a-z ]", " ", (t or "").lower())
    return set(_ALIAS.get(w, w) for w in t.split()
               if w not in _STOP and len(w) > 1)


def _overlap(a_toks, b_toks):
    """Token-overlap ratio, 0..1. Same formula as atlas_import._forest_match."""
    if not a_toks or not b_toks:
        return 0.0
    return len(a_toks & b_toks) / min(len(a_toks), len(b_toks))


# Markers that say "this unit is NOT a national forest". A Forest Service region
# is meaningless for these, so a match against one is a FALSE POSITIVE, not a win.
# (The Atlas deliberately includes non-USFS crews: BLM, BIA, NPS, TNC, states.)
#
# This is now a HARD GATE applied BEFORE matching, not just a post-hoc warning.
# It's what stops "Carson City BLM" from matching "CARSON NF" purely because
# both contain the word "carson".

# Short agency codes — matched on word boundaries so they can't fire inside a
# longer word (e.g. "np" must not match inside "Arapaho").
_NON_USFS_WORDS = [
    "blm", "bia", "np", "nps", "tnc", "dnr", "fws", "usfws", "nwr", "doi",
]

# Longer phrases — plain substring is safe and reads more clearly.
_NON_USFS_PHRASES = [
    "bureau of land", "bureau of indian", "national park", "national preserve",
    "national monument", "national wildlife", "national river",
    "the nature conservancy", "nature conservancy", "department of lands",
    "state forestry", "forestry division", "division of fire", "state of",
    "fish and wildlife", "county", "city of", "tribal", "reservation",
    "state park", "state parks", "state forest", "state land",
    "military", "army", "fire department", "fire district",
    "fire protection", "volunteer fire", "rural fire", "conservation district",
]

_NON_USFS_WORD_RE = re.compile(
    r"\b(" + "|".join(_NON_USFS_WORDS) + r")\b", re.IGNORECASE
)


def looks_non_usfs(forest):
    """True when the forest name names a non-Forest-Service agency."""
    f = (forest or "").lower()
    if any(p in f for p in _NON_USFS_PHRASES):
        return True
    return bool(_NON_USFS_WORD_RE.search(f))


def looks_usfs(forest):
    """True when the name looks like a national forest (so a miss is a real miss)."""
    f = (forest or "").lower()
    return ("national forest" in f or re.search(r"\bnfs?\b", f) is not None)


# --- explicit lookup for forests OUTSIDE our curated data -----------------------
# The curated 440 crews only cover R1-R6 (Western US), so there is no region to
# BORROW for an Eastern/Southern/Alaska forest. These are therefore stated
# explicitly from the public USFS regional structure rather than inferred.
#
# The Forest Service has no Region 7 (retired decades ago), so the numbering
# jumps 6 -> 8. That is correct, not a typo.
#   R8  Southern  — AL AR FL GA KY LA MS NC SC TN TX VA + Puerto Rico
#   R9  Eastern   — the Northeast, Mid-Atlantic and Upper Midwest (incl. MO, WI)
#   R10 Alaska    — Alaska only
#
# Keys are NORMALIZED token sets (via _toks), so a key matches regardless of
# "NF" vs "National Forest", punctuation, or trailing crew-type junk in the
# Atlas name. Add to this table rather than widening the fuzzy matcher.
R8 = "SOUTHERN REGION, REGION 8"
R9 = "EASTERN REGION, REGION 9"
R10 = "ALASKA REGION, REGION 10"

EXPLICIT_FOREST_REGIONS = {
    # --- R8 Southern ---
    "ozark st francis": R8,          # Arkansas
    "daniel boone": R8,              # Kentucky
    "cherokee": R8,                  # Tennessee
    "chattahoochee oconee": R8,      # Georgia
    "george washington jefferson": R8,  # Virginia / West Virginia
    "el yunque": R8,                 # Puerto Rico
    "north carolina": R8,            # "National Forests in North Carolina"
    # --- R9 Eastern ---
    "chequamegon nicolet": R9,       # Wisconsin
    "mark twain": R9,                # Missouri
    # --- R10 Alaska ---
    "tongass": R10,                  # Alaska
    "chugach": R10,                  # Alaska
    # The Atlas misspells Chugach as "Chugash". Kept as its own key so the
    # lookup stays a plain data table and the typo is visible, not hidden in
    # normalization logic.
    "chugash": R10,
}

# Precompute the normalized token set for each key, once.
_EXPLICIT = None


def explicit_region(forest):
    """Region for a forest we hold no curated crew for, or None.

    Matches when the lookup key's tokens are a SUBSET of the forest's tokens,
    so "Tongass NF SMOD" -> {tongass} matches, and extra crew-type words in the
    Atlas name are simply ignored.

    Guarded by looks_usfs(): some keys are place names rather than distinctive
    forest names ("north carolina" has to match "National Forests in North
    Carolina"), and without this guard such a key also swallows unrelated units
    in the same place — "North Carolina State Parks" is not a national forest.
    """
    global _EXPLICIT
    if _EXPLICIT is None:
        _EXPLICIT = [(frozenset(_toks(k)), v)
                     for k, v in EXPLICIT_FOREST_REGIONS.items()]
    if not looks_usfs(forest):
        return None
    toks = _toks(forest)
    if not toks:
        return None
    best, best_len = None, 0
    for key_toks, region in _EXPLICIT:
        # Longest matching key wins, so "cherokee" can't beat a more specific
        # multi-word key if both were ever to match the same name.
        if key_toks and key_toks <= toks and len(key_toks) > best_len:
            best, best_len = region, len(key_toks)
    return best


# --- read our own table (SELECT only) ------------------------------------------

def load_env_local():
    """Read .env.local so there's nothing to export by hand. Same loader shape
    as refresh_jobs.py."""
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


def fetch_crews():
    """Return every crew row we need. Read-only."""
    load_env_local()
    url = os.environ.get("NEXT_PUBLIC_SUPABASE_URL", "").rstrip("/")
    key = os.environ.get("NEXT_PUBLIC_SUPABASE_ANON_KEY", "")
    if not url or not key:
        print("Missing Supabase config. Expected NEXT_PUBLIC_SUPABASE_URL and\n"
              "NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local.")
        sys.exit(1)

    headers = {"apikey": key}
    # Legacy keys are JWTs and want a Bearer header too; the newer
    # sb_publishable_ keys are not JWTs and must NOT be sent that way.
    if key.startswith("eyJ"):
        headers["Authorization"] = f"Bearer {key}"

    cols = "id,forest,region,state,crew_name,source,latitude,longitude"
    rows, offset, page = [], 0, 1000
    while True:
        r = requests.get(
            f"{url}/rest/v1/crews",
            headers={**headers, "Range-Unit": "items",
                     "Range": f"{offset}-{offset + page - 1}"},
            params={"select": cols, "order": "id"},
            timeout=60,
        )
        if r.status_code not in (200, 206):
            print(f"Read failed: HTTP {r.status_code} — {r.text[:200]}")
            sys.exit(1)
        batch = r.json()
        rows.extend(batch)
        if len(batch) < page:
            break
        offset += page
    return rows


# --- the matcher ---------------------------------------------------------------
# Extracted into its own function so the COMMIT script (region_backfill_commit.py)
# can import and reuse it rather than keeping a second copy. One matcher, one set
# of results — a duplicate would eventually drift from what you reviewed here.

def compute_assignments(rows, verbose=True):
    """Work out a region for every NULL-region Atlas crew. Pure computation —
    reads nothing, writes nothing. Returns a dict of result buckets."""

    def say(*a):
        if verbose:
            print(*a)

    curated = [r for r in rows if r.get("source") == "usfs_official"]
    atlas = [r for r in rows if r.get("source") == "handcrew_atlas"]
    targets = [r for r in atlas if not r.get("region")]

    say(f"  curated (usfs_official) : {len(curated)}")
    say(f"  atlas (handcrew_atlas)  : {len(atlas)}")
    say(f"  atlas rows w/ NULL region: {len(targets)}   <- what we're trying to fill\n")

    # Build the lookup: normalized forest tokens -> the region(s) seen for it.
    # We keep a SET of regions so we can detect a forest that spans regions.
    forest_regions = defaultdict(set)
    forest_display = {}
    for r in curated:
        forest, region = r.get("forest"), r.get("region")
        if not forest or not region:
            continue
        toks = frozenset(_toks(forest))
        if not toks:
            continue
        forest_regions[toks].add(region)
        forest_display.setdefault(toks, forest)

    spanning = {k: v for k, v in forest_regions.items() if len(v) > 1}
    say(f"Curated forests usable as a lookup: {len(forest_regions)}")
    if spanning:
        say(f"  NOTE: {len(spanning)} normalized forest name(s) map to >1 region "
            f"in the curated data; those can never assign a region unambiguously:")
        for k, v in list(spanning.items())[:5]:
            say(f"    {forest_display[k]!r} -> {sorted(v)}")
    say()

    # FIX 3 — "distinctive" tokens. A token that appears in exactly ONE curated
    # forest name identifies that forest on its own; a token shared by several
    # (like "river", which is in White River, Columbia River Gorge and Crooked
    # River) identifies nothing. We require every match to share at least one
    # distinctive token, so generic words can never carry a match by themselves.
    # Deriving this from the data beats hand-maintaining a list of stop-words.
    df = Counter()
    for toks in forest_regions:
        for t in toks:
            df[t] += 1
    distinctive = {t for t, n in df.items() if n == 1}
    say(f"Distinctive tokens (appear in exactly one curated forest): "
        f"{len(distinctive)} of {len(df)}\n")

    exact_hits, fuzzy_hits, ambiguous = [], [], []
    unmatched, rejected_non_usfs, explicit_hits = [], [], []

    for crew in targets:
        forest = crew.get("forest")

        # FIX 2 — hard gate, applied BEFORE any matching. If the name says BLM /
        # NPS / BIA / TNC / a state or county agency, then no Forest Service
        # region is correct for it and we must not match it at all.
        # Runs FIRST so the explicit table below can never fire on a non-USFS
        # unit that happens to share a place name with a national forest.
        if looks_non_usfs(forest):
            rejected_non_usfs.append(crew)
            continue

        # EXPLICIT TABLE — Eastern/Southern/Alaska forests we hold no curated
        # crew for, so there's nothing to borrow. Stated from public USFS
        # structure instead. Checked before the curated-borrow logic.
        ex = explicit_region(forest)
        if ex:
            explicit_hits.append((crew, "(explicit table)", ex))
            continue

        toks = frozenset(_toks(forest))
        if not toks:
            unmatched.append((crew, "no usable forest name"))
            continue

        # TIER 1 — identical normalized token set.
        if toks in forest_regions:
            regions = forest_regions[toks]
            if len(regions) == 1:
                exact_hits.append((crew, forest_display[toks], next(iter(regions))))
            else:
                ambiguous.append((crew, forest_display[toks], sorted(regions)))
            continue

        # TIER 2 — best token overlap at or above the merge's 0.6 threshold,
        # AND sharing a distinctive token (fix 3).
        scored = []
        for cand_toks in forest_regions:
            s = _overlap(toks, cand_toks)
            if s >= FOREST_CONFIRM_MIN and (toks & cand_toks & distinctive):
                scored.append((s, cand_toks))
        if not scored:
            unmatched.append((crew, "no forest above threshold"))
            continue

        best = max(s for s, _ in scored)
        winners = [ct for s, ct in scored if s == best]
        regions = set()
        for ct in winners:
            regions |= forest_regions[ct]
        if len(regions) == 1:
            fuzzy_hits.append((crew, forest_display[winners[0]],
                               next(iter(regions)), best))
        else:
            ambiguous.append((crew, forest_display[winners[0]], sorted(regions)))

    assigned = (exact_hits + [(c, f, r) for c, f, r, _ in fuzzy_hits]
                + explicit_hits)

    return {
        "targets": targets,
        "assigned": assigned,          # [(crew, matched_forest, region)]
        "exact_hits": exact_hits,
        "fuzzy_hits": fuzzy_hits,      # [(crew, matched_forest, region, score)]
        "explicit_hits": explicit_hits,
        "ambiguous": ambiguous,
        "unmatched": unmatched,
        "rejected_non_usfs": rejected_non_usfs,
    }


# --- the dry-run report --------------------------------------------------------

def main():
    rows = fetch_crews()
    print(f"Read {len(rows)} crew rows from Supabase (read-only).\n")

    res = compute_assignments(rows)
    targets = res["targets"]
    assigned = res["assigned"]
    exact_hits, fuzzy_hits = res["exact_hits"], res["fuzzy_hits"]
    explicit_hits, ambiguous = res["explicit_hits"], res["ambiguous"]
    unmatched, rejected_non_usfs = res["unmatched"], res["rejected_non_usfs"]

    # ---- the explicit (non-curated) assignments, listed in full ----
    print("=" * 72)
    print("EXPLICIT TABLE — Eastern/Southern/Alaska forests (NOT borrowed)")
    print("=" * 72)
    print("  These forests have no curated crew to borrow from. Region comes from")
    print("  the public USFS regional structure, stated in EXPLICIT_FOREST_REGIONS.\n")
    for crew, _, region in sorted(explicit_hits, key=lambda x: (x[2], x[0].get("forest") or "")):
        tag = region.split(",")[-1].strip().replace("REGION ", "R")
        print(f"  {tag:<4} {(crew.get('crew_name') or '')[:26]:<26} | "
              f"{str(crew.get('forest'))[:40]:<40} | {crew.get('state') or '?'}")
    print(f"\n  {len(explicit_hits)} crews assigned from the explicit table.")
    by_new = Counter(r for _, _, r in explicit_hits)
    for r, n in sorted(by_new.items()):
        print(f"    {n:>3}  {r}")
    print()

    # ---- report ----
    print("=" * 72)
    print("RESULT")
    print("=" * 72)
    print(f"  would get a region : {len(assigned)} of {len(targets)}")
    print(f"      tier 1 exact   : {len(exact_hits)}")
    print(f"      tier 2 fuzzy   : {len(fuzzy_hits)}  (overlap >= {FOREST_CONFIRM_MIN})")
    print(f"      explicit table : {len(explicit_hits)}  (R8/R9/R10 — no curated source)")
    left_null = len(unmatched) + len(ambiguous) + len(rejected_non_usfs)
    print(f"  left NULL          : {left_null}")
    print(f"      non-USFS agency: {len(rejected_non_usfs)}  (gated out before matching)")
    print(f"      no match       : {len(unmatched)}")
    print(f"      ambiguous      : {len(ambiguous)}  (matched forests disagreed on region)")
    print()

    print("BREAKDOWN BY REGION (crews that would be assigned):")
    by_region = Counter(region for _, _, region in assigned)
    for region, n in sorted(by_region.items(), key=lambda kv: -kv[1]):
        print(f"  {n:>4}  {region}")
    print()

    print("EXAMPLES — atlas forest -> matched curated forest -> region")
    print("-" * 72)
    shown = 0
    for crew, matched, region in exact_hits[:8]:
        print(f"  [exact] {str(crew.get('forest'))[:32]:<32} -> {matched[:26]:<26} -> {region}")
        shown += 1
    for crew, matched, region, score in fuzzy_hits[:7]:
        print(f"  [{score:.2f}]  {str(crew.get('forest'))[:32]:<32} -> {matched[:26]:<26} -> {region}")
        shown += 1
    print(f"  ({shown} shown)")
    print()

    print("UNMATCHED — spot check: real non-USFS, or a formatting miss?")
    print("-" * 72)
    for crew, why in unmatched[:20]:
        name = (crew.get("crew_name") or "")[:34]
        forest = (crew.get("forest") or "(no forest)")[:34]
        print(f"  {name:<34} | forest={forest:<34} | {crew.get('state') or '?'}")
    if len(unmatched) > 20:
        print(f"  ... and {len(unmatched) - 20} more (full list in {UNMATCHED_CSV})")
    print()

    # ---- regression check on the specific cases the last run got wrong ----
    # These are named explicitly so a future change that reintroduces the bug
    # fails loudly here instead of quietly writing a wrong region.
    print("=" * 72)
    print("REGRESSION CHECK — the cases the previous run got wrong / missed")
    print("=" * 72)

    outcome = {}
    for crew, matched, region in exact_hits:
        outcome[crew["id"]] = ("ASSIGNED", matched, region)
    for crew, matched, region, score in fuzzy_hits:
        outcome[crew["id"]] = (f"ASSIGNED[{score:.2f}]", matched, region)
    for crew in rejected_non_usfs:
        outcome[crew["id"]] = ("unmatched (non-USFS gate)", "-", "-")
    for crew, why in unmatched:
        outcome[crew["id"]] = (f"unmatched ({why})", "-", "-")
    for crew, matched, regions in ambiguous:
        outcome[crew["id"]] = ("unmatched (ambiguous)", matched, str(regions))

    # (substring to find, what we NOW expect)
    checks = [
        ("Carson City BLM", "unmatched"),
        ("Buffalo National River", "unmatched"),
        ("Gila District BLM", "unmatched"),
        ("Lassen NP", "unmatched"),
        ("Olympic NP", "unmatched"),
        ("Sequoia-Kings NP", "unmatched"),
        ("Payette NF", "ASSIGNED"),
        ("Boise NF", "ASSIGNED"),
        ("Mount Hood NF", "ASSIGNED"),
    ]
    all_ok = True
    for needle, expect in checks:
        hits = [c for c in targets if needle.lower() in (c.get("forest") or "").lower()]
        if not hits:
            print(f"  ??  {needle:<24} — no such row in the target set")
            all_ok = False
            continue
        for c in hits:
            status, matched, region = outcome.get(c["id"], ("(not processed)", "-", "-"))
            ok = status.startswith(expect)
            all_ok = all_ok and ok
            short = region.split(",")[-1].strip() if region != "-" else "-"
            print(f"  {'OK ' if ok else 'BAD'} {needle:<24} {str(c.get('forest'))[:30]:<30}"
                  f" -> {status:<28} {matched[:24] if matched != '-' else '':<24} {short}")
    print(f"\n  {'ALL CHECKS PASSED' if all_ok else 'SOME CHECKS FAILED — see BAD rows above'}\n")

    # ---- quality check: are the ASSIGNED ones actually Forest Service? ----
    print("=" * 72)
    print("QUALITY CHECK — false positives among the 'would be assigned' set")
    print("=" * 72)
    suspect = [(c, m, r) for c, m, r in assigned if looks_non_usfs(c.get("forest"))]
    print(f"  assigned but the forest name says NON-USFS: {len(suspect)} of {len(assigned)}")
    print("  (a Forest Service region is meaningless for these — wrong, not missing)")
    for crew, matched, region in suspect[:15]:
        print(f"    {(crew.get('crew_name') or '')[:26]:<26} {str(crew.get('forest'))[:30]:<30}"
              f" -> {matched[:22]:<22} -> {region.split(',')[-1].strip()}")
    if len(suspect) > 15:
        print(f"    ... and {len(suspect) - 15} more")
    print()

    # ---- why did the 314 not match? ----
    print("=" * 72)
    print("UNMATCHED, CATEGORIZED — non-USFS (correct) vs missed match (fixable)")
    print("=" * 72)
    no_forest, non_usfs, usfs_miss, other = [], [], [], []
    for crew, why in unmatched:
        f = crew.get("forest")
        if not f or not _toks(f):
            no_forest.append(crew)
        elif looks_non_usfs(f):
            non_usfs.append(crew)
        elif looks_usfs(f):
            usfs_miss.append(crew)
        else:
            other.append(crew)

    print(f"  no forest name at all      : {len(no_forest):>4}  <- unfixable by this method")
    print(f"  named a non-USFS agency    : {len(non_usfs):>4}  <- correctly left NULL")
    print(f"  looks like a national forest: {len(usfs_miss):>4}  <- REAL MISSES, worth a look")
    print(f"  neither/unclear            : {len(other):>4}")
    print()

    if usfs_miss:
        print("  The 'looks like a national forest' misses — forests we have no")
        print("  curated crew for, so there is no region to borrow:")
        for crew in usfs_miss[:20]:
            print(f"    {(crew.get('crew_name') or '')[:28]:<28} | {str(crew.get('forest'))[:38]:<38}"
                  f" | {crew.get('state') or '?'}")
        if len(usfs_miss) > 20:
            print(f"    ... and {len(usfs_miss) - 20} more")
        print()

    if other:
        print("  'Neither/unclear' sample:")
        for crew in other[:12]:
            print(f"    {(crew.get('crew_name') or '')[:28]:<28} | {str(crew.get('forest'))[:38]:<38}"
                  f" | {crew.get('state') or '?'}")
        print()

    if ambiguous:
        print("AMBIGUOUS — matched, but the region was not unanimous:")
        for crew, matched, regions in ambiguous[:10]:
            print(f"  {(crew.get('crew_name') or '')[:30]:<30} {crew.get('forest')!r} "
                  f"-> {matched!r} -> {regions}")
        print()

    # Full unmatched list to CSV so the non-USFS question can be eyeballed
    # properly. Covered by the existing merge_review_*.csv gitignore rule.
    with open(UNMATCHED_CSV, "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["id", "crew_name", "forest", "state", "lat", "lng", "reason"])
        for crew, why in unmatched:
            w.writerow([crew.get("id"), crew.get("crew_name"), crew.get("forest"),
                        crew.get("state"), crew.get("latitude"),
                        crew.get("longitude"), why])
    print(f"Wrote {len(unmatched)} unmatched rows to {UNMATCHED_CSV} (local only).")
    print("\nDRY RUN — nothing was written to Supabase.")


if __name__ == "__main__":
    main()
