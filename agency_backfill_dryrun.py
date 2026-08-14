#!/usr/bin/env python3
"""
agency_backfill_dryrun.py — work out which AGENCY each crew belongs to.

READ-ONLY BY CONSTRUCTION. There is no write path anywhere in this file: it
reads with the PUBLIC key and prints. agency_backfill_commit.py IMPORTS the
classifier from here (rather than copying it) so the two can never drift.
Same split as region_backfill_dryrun.py / region_backfill_commit.py.

USAGE
    python3 agency_backfill_dryrun.py            # summary + evidence breakdown
    python3 agency_backfill_dryrun.py --list     # every row, grouped by agency
    python3 agency_backfill_dryrun.py --unknown  # only the unclassified rows
    python3 agency_backfill_dryrun.py --csv agency_review.csv   # for eyeballing

Needs no key of its own — it reads NEXT_PUBLIC_* out of .env.local.


THE PROBLEM
    `source` says where a ROW came from, not who EMPLOYS the crew. Since the
    Atlas merge, `crews` mixes ~10 agencies with no way to tell them apart.

    The Atlas KMZ has no agency field — nothing was lost in the import, it was
    never there. So agency has to be INFERRED from free text. That makes this
    column different in kind from state/region/crew type, which come straight
    from source data. Treat it as a good guess that a human can correct, which
    is exactly why it is stored in a column rather than computed in the browser.

WHAT WE INFER FROM, in order of trust

    1. `source == 'usfs_official'`  -> 'usfs', with CERTAINTY, no guessing.
       Those 440 rows are the curated Forest Service dataset. This alone
       settles 53% of the table.

    2. The `website` DOMAIN. The strongest Atlas signal: 304 of 389 rows have
       one and a domain cannot be vague the way prose can. fs.usda.gov is the
       Forest Service; dnr.wa.gov is Washington state; kerncountyfire.org is a
       county.

    3. The `forest` free text. Present on 262 of 389 and often names the agency
       outright ("Carson City BLM", "Glacier NP SMOD").

    4. `notes`, then `crew_name` — weak. Crew names are things like "Alpine
       IHC" and "Zephyr HC", which name a place, not an employer. crew_name
       decides only a handful of rows and is checked last on purpose.

TWO TRAPS WORTH KNOWING
    * nifc.gov and social media (instagram/facebook) are INTERAGENCY or
      generic. They must count as NO evidence, not as a federal signal. They
      are listed in NEUTRAL_DOMAINS below.
    * "USFWS" does not match a naive \\bfws\\b regex — there is no word
      boundary between the "s" and the "f". An earlier draft of this
      classifier silently mislabeled the Kenai crew because of it. See
      _FWS_RE, which handles both spellings as ONE agency.
"""

import csv
import os
import re
import sys
from collections import Counter, defaultdict

try:
    import requests
except ImportError:
    print("Missing 'requests'. Run:  pip install requests")
    sys.exit(1)

# Reuse the env loader that region_backfill_dryrun.py already uses, so there is
# one way to find .env.local in this project rather than two.
from region_backfill_dryrun import load_env_local


# --- the vocabulary -------------------------------------------------------------
# Must match the check constraint in agency_schema.sql exactly. The labels are
# what the UI shows; the keys are what gets stored.
AGENCY_LABELS = {
    "usfs":    "US Forest Service",
    "blm":     "Bureau of Land Management",
    "nps":     "National Park Service",
    "bia":     "Bureau of Indian Affairs",
    "tribal":  "Tribal",
    "fws":     "US Fish and Wildlife Service",
    "state":   "State",
    "county":  "County",
    "local":   "City / local district",
    "other":   "Other federal / NGO",
    "unknown": "Unknown",
}
VALID = set(AGENCY_LABELS)


# --- domains that carry NO agency signal ----------------------------------------
# nifc.gov is the National Interagency Fire Center — by definition it says
# nothing about which agency a crew belongs to. Social links are just as empty.
# Treating either as evidence would have quietly mislabeled ~20 rows.
NEUTRAL_DOMAINS = {
    "nifc.gov", "instagram.com", "facebook.com", "youtube.com",
    "linkedin.com", "usajobs.gov", "lvinteragency.org",
}


# --- FWS: one agency, two spellings ---------------------------------------------
# FWS and USFWS are the SAME agency (US Fish and Wildlife Service) and must
# never split into two categories. \bfws\b alone does NOT match "USFWS", because
# "s"->"f" is not a word boundary — the bug that hid the Kenai crew.
_FWS_RE = re.compile(r"\b(?:us)?fws\b|national wildlife|fish and wildlife|\bnwr\b",
                     re.IGNORECASE)


# --- domain rules ---------------------------------------------------------------
# Ordered: the first match wins, so put the specific before the general. The
# trailing ".gov / .us" catch-all must stay LAST or it would swallow everything.
DOMAIN_RULES = [
    ("usfs",   [r"fs\.usda\.gov$", r"fs\.fed\.us$"]),
    ("nps",    [r"nps\.gov$"]),
    ("blm",    [r"blm\.gov$"]),
    ("bia",    [r"bia\.gov$"]),
    ("fws",    [r"fws\.gov$"]),
    ("other",  [r"nature\.org$",              # The Nature Conservancy
                r"allhandsecology\.org$",
                r"mtadamsstewards\.org$",
                r"forestryfirerp\.org$"]),    # Forestry & Fire Recruitment Program
    # Tribal governments and Native consortia. "-nsn.gov" is the standard
    # sovereign-nation domain suffix, so it is a reliable tribal marker.
    ("tribal", [r"-nsn\.gov$", r"nation\.com$", r"rancheria\.com$",
                r"chugachmiut\.org$", r"catg\.org$", r"tananachiefs\.org$",
                r"baymills\.org$", r"karuk\.us$", r"mewuk\.com$",
                r"tribalecorestoration\.org$", r"blackfeetnation\.com$"]),
    # Job Corps Civilian Conservation Centers. The centers are Department of
    # Labor, but the ones with wildland fire crews are USFS-operated, and most
    # of these rows name a national forest in `forest` ("Umpqua NF/Job Corp").
    # Called 'usfs' for that reason — flagged in the dry run as a judgment call.
    ("usfs",   [r"\.jobcorps\.gov$"]),
    ("state",  [r"joincalfire\.com$", r"ccc\.ca\.gov$",   # CAL FIRE, CA Cons. Corps
                r"^dnr\.", r"\bdnr\b", r"forestry\.", r"ffsl\.", r"idl\.",
                r"dfpc\.", r"sfd\.wyo\.gov$", r"azstatejobs\.gov$",
                r"ncparks\.gov$", r"^sd\.gov$", r"\.state\.[a-z]{2}\.us$"]),
    ("county", [r"county", r"kerncountyfire", r"sbcfire", r"ocfa\.org$",
                r"sccfd\.org$", r"cccfpd\.org$", r"unifiedfireut\.gov$"]),
    ("local",  [r"lafd", r"cityof", r"^rcgov\.org$", r"draperutah\.gov$",
                r"chulavistaca\.gov$", r"idyllwildfire", r"borgertx\.gov$",
                r"sweethomefireor\.gov$", r"bigsurfire\.org$", r"nltfpd\.org$",
                r"tahoefire\.org$", r"eastforkfire\.org$", r"crfr\.us$",
                r"centralpiercefire\.org$", r"cfwfm\.com$", r"ebparks\.org$",
                r"ci\.[a-z]+\.[a-z]{2}\.us$",
                # Oregon Forest Protective Associations: private landowner
                # associations that carry out state protection duties. 'local'
                # is the closest honest fit; worth a human look.
                r"coosfpa\.net$", r"dfpa\.net$"]),
    # LAST RESORT: a government domain we could not place more precisely. Better
    # than 'unknown' (we do know it is a public agency) but deliberately vague.
    ("state",  [r"\.gov$", r"\.us$"]),
]


# --- text rules -----------------------------------------------------------------
# Order matters: most specific first. Tribal is checked BEFORE bia on purpose
# (see below). usfs is LAST because "NF"/"national forest" appear in other
# agencies' descriptions ("near Umpqua NF"), so it should only win if nothing
# more specific matched.
TEXT_RULES = [
    ("other",  [r"\btnc\b", r"nature conservancy", r"ecology", r"stewardship",
                r"recruitment program"]),
    # TRIBAL BEFORE BIA, deliberately. Many rows read "Navajo BIA" or "Blackfeet
    # BIA" — those are TRIBAL crews that BIA administers and funds. The crew
    # belongs to the nation, so naming a tribal entity wins over the bare
    # bureau name. A row that names ONLY a BIA office ("Phoenix District BIA")
    # with no tribal entity falls through to 'bia' below.
    ("tribal", [r"\btribe\b", r"\btribes\b", r"\btribal\b", r"\bnation\b",
                r"\bpueblo\b", r"rancheria", r"band of ", r"indian community",
                r"confederated tribes", r"\bnavajo\b", r"\bzuni\b",
                r"\bblackfeet\b", r"\bapache\b", r"\byakama\b", r"\bkaruk\b",
                r"\bklamath tribes\b", r"chugachmiut", r"athabascan",
                r"tanana chiefs", r"bay mills", r"shingle springs",
                r"\bmiwok\b", r"\bluise\wo\b", r"\bkumeyaay\b"]),
    ("fws",    [_FWS_RE.pattern]),
    ("nps",    [r"\bnps\b", r"\bnp\b", r"national park", r"national preserve",
                r"national monument", r"national seashore",
                r"national recreation area", r"national historic"]),
    ("blm",    [r"\bblm\b", r"bureau of land"]),
    ("bia",    [r"\bbia\b", r"bureau of indian"]),
    ("county", [r"\bcounty\b"]),
    ("state",  [r"\bdnr\b", r"\bdnrc\b", r"\bodf\b", r"state of ",
                r"state forestry", r"forestry division", r"division of fire",
                r"department of lands", r"department of natural resources",
                r"state park", r"state forest", r"state land",
                r"\bcal ?fire\b",
                # The data writes it "California Conservation Corp" — SINGULAR.
                # A `corps` rule silently missed all three CCC centers.
                r"conservation corps?", r"\bccc\b",
                # NM's Energy, Minerals and Natural Resources Dept houses the
                # State Forestry Division.
                r"new mexico energy", r"energy, minerals",
                r"forest protective association"]),
    ("local",  [r"city of", r"fire department", r"fire district",
                r"fire protection", r"volunteer fire", r"rural fire",
                r"fire authority", r"regional park"]),
    ("usfs",   [r"\bnf\b", r"national forest", r"\busfs\b", r"forest service",
                r"ranger district", r"job corp"]),
]

# Fields searched for text evidence, in descending order of trust. crew_name is
# last because names describe PLACES, not employers.
TEXT_FIELDS = ("forest", "notes", "crew_name")


# --- explicit, hand-identified units --------------------------------------------
# Last resort, and deliberately tiny. These rows carry NO agency text at all —
# no forest, no notes, no website — but their crew_name names a well-known unit
# that a person in this field would recognize on sight. Same escape hatch the
# region backfill used for R8/R9/R10 forests it held no curated crew for.
#
# EVERY entry is listed individually so it can be checked and argued with. Add
# one only when the identification is not in doubt; if a name is ambiguous, the
# honest answer is to leave it 'unknown'. Matched on the exact crew_name.
EXPLICIT_BY_CREW_NAME = {
    "SEKI Fire Effects": ("nps", "Sequoia & Kings Canyon NP (SEKI)"),
    "Kilauea WFM":       ("nps", "Hawai'i Volcanoes NP"),
    "Whiskeytown WFM":   ("nps", "Whiskeytown National Recreation Area"),
    "Saguaro WFM":       ("nps", "Saguaro NP"),
}


def domain_of(url):
    """Bare hostname, lowercased, no leading www. None when there's no URL."""
    m = re.match(r"https?://([^/]+)", (url or "").strip(), re.IGNORECASE)
    if not m:
        return None
    return m.group(1).lower().lstrip(".").removeprefix("www.")


def classify(row):
    """Decide one row's agency.

    Returns (agency, evidence) where evidence is a short human-readable string
    naming WHAT decided it — so a person reviewing the dry run can tell a solid
    call from a shaky one without re-reading the rules.
    """
    # 1. Provenance beats every guess. These are the curated Forest Service 440.
    if row.get("source") == "usfs_official":
        return "usfs", "source=usfs_official (certain)"

    # 2. Website domain.
    d = domain_of(row.get("website"))
    if d and d not in NEUTRAL_DOMAINS:
        for agency, pats in DOMAIN_RULES:
            if any(re.search(p, d) for p in pats):
                return agency, f"domain:{d}"

    # 3. Free text, most-trusted field first.
    for field in TEXT_FIELDS:
        text = (row.get(field) or "").lower()
        if not text:
            continue
        for agency, pats in TEXT_RULES:
            if any(re.search(p, text) for p in pats):
                snippet = (row.get(field) or "")[:40]
                return agency, f"{field}:{snippet!r}"

    # 4. The hand-identified handful, checked LAST so any real evidence in the
    #    row always beats a name we recognized by eye.
    name = (row.get("crew_name") or "").strip()
    if name in EXPLICIT_BY_CREW_NAME:
        agency, why = EXPLICIT_BY_CREW_NAME[name]
        return agency, f"explicit:{why}"

    return "unknown", "no agency evidence"


def compute_agencies(rows):
    """Classify every row. Pure computation — reads nothing, writes nothing."""
    results = []
    for row in rows:
        agency, evidence = classify(row)
        assert agency in VALID, f"classifier produced invalid agency {agency!r}"
        results.append({"row": row, "agency": agency, "evidence": evidence})
    return results


# --- reading (PUBLIC key, read-only) --------------------------------------------

def fetch_crews():
    """Every column the classifier needs. Read-only, public key."""
    load_env_local()
    url = os.environ.get("NEXT_PUBLIC_SUPABASE_URL", "").rstrip("/")
    key = os.environ.get("NEXT_PUBLIC_SUPABASE_ANON_KEY", "")
    if not url or not key:
        print("Missing Supabase config. Expected NEXT_PUBLIC_SUPABASE_URL and\n"
              "NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local.")
        sys.exit(1)

    headers = {"apikey": key}
    # Legacy keys are JWTs and want Bearer too; sb_publishable_ keys are not
    # JWTs and must NOT be sent that way. Same rule as the other scripts.
    if key.startswith("eyJ"):
        headers["Authorization"] = f"Bearer {key}"

    base = "id,source,crew_name,forest,district,town,state,region,notes,website"

    # Ask for `agency` too, but survive without it. This dry run has to be
    # runnable BEFORE agency_schema.sql is applied — that's the whole point of
    # previewing first — and PostgREST 400s on a column that doesn't exist yet.
    cols = base + ",agency"
    probe = requests.get(f"{url}/rest/v1/crews", headers=headers, timeout=60,
                         params={"select": cols, "limit": 1})
    if probe.status_code == 400 and "agency" in probe.text:
        print("NOTE: the `agency` column doesn't exist yet, so this is a preview")
        print("      of what the classifier WOULD assign. Apply agency_schema.sql")
        print("      when you're happy with it.\n")
        cols = base
    elif probe.status_code != 200:
        print(f"Read failed: HTTP {probe.status_code} — {probe.text[:300]}")
        sys.exit(1)

    rows, offset, page = [], 0, 1000
    while True:
        r = requests.get(f"{url}/rest/v1/crews", headers=headers, timeout=60,
                         params={"select": cols, "limit": page, "offset": offset,
                                 "order": "id"})
        if r.status_code != 200:
            print(f"Read failed: HTTP {r.status_code} — {r.text[:300]}")
            sys.exit(1)
        batch = r.json()
        rows.extend(batch)
        if len(batch) < page:
            break
        offset += page
    return rows


# --- reporting ------------------------------------------------------------------

def main():
    show_list = "--list" in sys.argv
    only_unknown = "--unknown" in sys.argv
    csv_path = None
    if "--csv" in sys.argv:
        i = sys.argv.index("--csv")
        csv_path = sys.argv[i + 1] if len(sys.argv) > i + 1 else "agency_review.csv"

    print("Reading crews (read-only, public key)...\n")
    rows = fetch_crews()
    results = compute_agencies(rows)

    by_source = Counter(r["source"] for r in rows)
    print(f"  total rows: {len(rows)}   by source: {dict(by_source)}\n")

    print("=" * 72)
    print("PROPOSED AGENCY ASSIGNMENT")
    print("=" * 72)
    counts = Counter(r["agency"] for r in results)
    for agency, n in counts.most_common():
        print(f"  {agency:<9} {AGENCY_LABELS[agency]:<32} {n:>4}  ({n/len(results)*100:>4.1f}%)")

    # Atlas rows only — the curated 440 are certain, so they'd flatter the number.
    atlas = [r for r in results if r["row"].get("source") == "handcrew_atlas"]
    atlas_known = [r for r in atlas if r["agency"] != "unknown"]
    print(f"\n  the 440 curated rows are 'usfs' with certainty (provenance, not a guess)")
    print(f"  of the {len(atlas)} Atlas rows, {len(atlas_known)} classified "
          f"({len(atlas_known)/len(atlas)*100:.1f}%), "
          f"{len(atlas) - len(atlas_known)} unknown")

    print("\n  what the evidence was (Atlas rows only):")
    kinds = Counter(r["evidence"].split(":")[0] for r in atlas)
    for kind, n in kinds.most_common():
        print(f"    {kind:<28}{n:>4}")

    # Judgment calls a human should confirm rather than trust.
    print("\n" + "=" * 72)
    print("JUDGMENT CALLS — worth your eyes before committing")
    print("=" * 72)
    jobcorps = [r for r in results if "jobcorps" in (r["evidence"] or "")]
    print(f"\n  Job Corps centers -> 'usfs'  ({len(jobcorps)} rows)")
    print("    Centers are Dept of Labor, but the fire-crew ones are USFS-run and")
    print("    most name a national forest. Say the word and I'll split them out.")
    for r in jobcorps[:4]:
        print(f"      {str(r['row'].get('crew_name'))[:34]:<35} {str(r['row'].get('forest'))[:30]}")

    tribal_bia = [r for r in results
                  if r["agency"] == "tribal" and re.search(r"\bbia\b",
                     str(r["row"].get("forest") or ""), re.I)]
    print(f"\n  named a tribe AND 'BIA' -> 'tribal'  ({len(tribal_bia)} rows)")
    print("    The crew belongs to the nation; BIA administers. Flip to 'bia' if")
    print("    you'd rather follow the funding line than the employer.")
    for r in tribal_bia[:4]:
        print(f"      {str(r['row'].get('crew_name'))[:34]:<35} {str(r['row'].get('forest'))[:30]}")

    # Only rows that actually LANDED on 'state' via the last-resort .gov/.us
    # rule. An earlier version filtered on the evidence string alone and so
    # listed Job Corps rows here, which are classified 'usfs' — misleading.
    vague = [r for r in results
             if r["agency"] == "state"
             and r["evidence"].startswith("domain:")
             and re.search(r"\.(gov|us)$", r["evidence"].split(":", 1)[1])
             and not re.search(r"(dnr|forestry|ffsl|idl|dfpc|ccc\.ca|wyo|"
                               r"azstate|ncparks|joincalfire|\.state\.)",
                               r["evidence"])]
    print(f"\n  generic .gov/.us domain -> 'state'  ({len(vague)} rows)")
    print("    We know it's a public agency but not which level. Could be local.")
    for r in vague[:4]:
        print(f"      {str(r['row'].get('crew_name'))[:34]:<35} {r['evidence'][:36]}")

    # The unknowns, always shown in full — they're the whole point of honesty here.
    unknown = [r for r in results if r["agency"] == "unknown"]
    print("\n" + "=" * 72)
    print(f"UNKNOWN — {len(unknown)} rows with no agency evidence")
    print("=" * 72)
    print("  These get agency='unknown' and an 'Unknown' checkbox in the UI.")
    print("  Hand-correct any you recognize; that's why this is a column.\n")
    for r in unknown:
        w = domain_of(r["row"].get("website")) or "-"
        print(f"    id={r['row']['id']:<5} {str(r['row'].get('crew_name'))[:32]:<33}"
              f"| {str(r['row'].get('forest') or '-')[:24]:<25}| {w[:20]}")

    if show_list or only_unknown:
        print("\n" + "=" * 72)
        print("FULL LISTING")
        print("=" * 72)
        grouped = defaultdict(list)
        for r in results:
            grouped[r["agency"]].append(r)
        for agency in sorted(grouped, key=lambda a: -len(grouped[a])):
            if only_unknown and agency != "unknown":
                continue
            print(f"\n--- {agency} ({len(grouped[agency])}) ---")
            for r in grouped[agency]:
                if agency == "usfs" and r["row"].get("source") == "usfs_official":
                    continue   # 440 identical lines helps nobody
                print(f"    {str(r['row'].get('crew_name'))[:34]:<35} {r['evidence'][:44]}")

    if csv_path:
        with open(csv_path, "w", newline="", encoding="utf-8") as f:
            w = csv.writer(f)
            w.writerow(["id", "agency", "evidence", "source", "crew_name",
                        "forest", "state", "website"])
            for r in results:
                row = r["row"]
                w.writerow([row["id"], r["agency"], r["evidence"], row.get("source"),
                            row.get("crew_name"), row.get("forest"),
                            row.get("state"), row.get("website")])
        print(f"\nWrote {csv_path} ({len(results)} rows) for review.")
        print("(Add it to .gitignore if it'll linger — it's derived data.)")

    print("\nREAD-ONLY — nothing was written. "
          "Run agency_backfill_commit.py to apply.")


if __name__ == "__main__":
    main()
