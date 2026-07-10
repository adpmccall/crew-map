#!/usr/bin/env python3
"""
fetch_jobs.py — pull open wildland-fire job postings from the USAJOBS API.

WHAT THIS IS (exploration only)
  A standalone script (run on your own computer, NOT inside the website) that
  asks the official USAJOBS search API for currently-open federal fire jobs and
  saves the raw results to a local file, fire_jobs_raw.json.
  It does NOT touch the map, the crews table, or Supabase. We're just looking at
  what the API actually returns so we can design the real feature later.

WHY TWO JOB SERIES (0456 AND 0462)
  Wildland fire jobs are grouped by a federal "job series" number.
    * 0462 = the OLD "Forestry Technician" series.
    * 0456 = the NEW "Wildland Fire Management" series (2026 change).
  The Forest Service is moving 0462 -> 0456, and DOI agencies (BLM/NPS) already
  use 0456. During this transition a posting could be under EITHER number, so we
  search BOTH to catch everything. (The API lets us pass both at once.)

WHAT YOU NEED BEFORE RUNNING (see the README section at the bottom of the
conversation, or the steps your teammate gave you):
  1. A free USAJOBS API key from https://developer.usajobs.gov/
  2. The email address you registered with that key.
  Put BOTH in your gitignored .env.local file (never commit them):

      USAJOBS_API_KEY=the-long-key-they-email-you
      USAJOBS_EMAIL=the-email-you-registered

HOW TO RUN (on your own computer)
  1. Make sure Python 3 is installed.
  2. Open a terminal in this project folder.
  3. Run:   pip install requests
  4. Run:   python fetch_jobs.py
  It prints a summary and writes fire_jobs_raw.json (already gitignored).

NOTES
  - The key + email are read from the environment, never hardcoded here. That's
    why this file is safe to commit but your .env.local is not.
  - The API returns results in "pages." We loop through ALL pages so we get every
    open posting, not just the first 25/500.
"""

import os
import sys
import json
import time

try:
    import requests
except ImportError:
    print("Missing 'requests'. Run:  pip install requests")
    sys.exit(1)


# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------

# The official USAJOBS search endpoint (documented at developer.usajobs.gov).
USAJOBS_URL = "https://data.usajobs.gov/api/search"

# The two fire job series we must search (see the note at the top of the file).
# The API accepts several series at once, separated by semicolons.
JOB_SERIES = ["0456", "0462"]

# Max the API allows per page. Bigger pages = fewer requests.
RESULTS_PER_PAGE = 500

OUTPUT = "fire_jobs_raw.json"


# ---------------------------------------------------------------------------
# Credentials — read from the environment (or .env.local), never hardcoded
# ---------------------------------------------------------------------------

def load_env_local():
    """
    Tiny helper so you don't need any extra library.

    If a .env.local file exists next to this script, read simple KEY=VALUE lines
    from it into the environment (without overwriting anything you've already
    exported in your terminal). This lets you keep your key in .env.local — the
    same gitignored file the website uses — instead of exporting it by hand.
    """
    path = os.path.join(os.path.dirname(os.path.abspath(__file__)), ".env.local")
    if not os.path.exists(path):
        return
    with open(path, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            # skip blank lines and comments
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, value = line.split("=", 1)
            key, value = key.strip(), value.strip().strip('"').strip("'")
            # real environment variables win over the file
            os.environ.setdefault(key, value)


def get_credentials():
    """Return (api_key, email) or exit with a clear message if either is missing."""
    load_env_local()
    api_key = os.environ.get("USAJOBS_API_KEY")
    email = os.environ.get("USAJOBS_EMAIL")
    if not api_key or not email:
        print(
            "Missing credentials.\n"
            "Add these two lines to your .env.local file (gitignored), then re-run:\n\n"
            "    USAJOBS_API_KEY=the-key-usajobs-emails-you\n"
            "    USAJOBS_EMAIL=the-email-you-registered\n"
        )
        sys.exit(1)
    return api_key, email


# ---------------------------------------------------------------------------
# Fetching (with pagination)
# ---------------------------------------------------------------------------

def fetch_all_postings(api_key, email):
    """
    Ask USAJOBS for every open posting in our fire job series, across ALL pages.

    Returns a list of the API's raw "MatchedObjectDescriptor" dicts (one per job).
    We keep them raw here; extract_fields() below pulls out the tidy bits.
    """
    # USAJOBS requires these exact headers:
    #   Host           - always data.usajobs.gov
    #   User-Agent     - the email you registered (how they identify you)
    #   Authorization-Key - your API key
    headers = {
        "Host": "data.usajobs.gov",
        "User-Agent": email,
        "Authorization-Key": api_key,
    }

    # JobCategoryCode is how the API filters by job series; join with ";".
    params = {
        "JobCategoryCode": ";".join(JOB_SERIES),
        "ResultsPerPage": RESULTS_PER_PAGE,
        "Page": 1,
    }

    all_jobs = []
    page = 1
    while True:
        params["Page"] = page
        resp = requests.get(USAJOBS_URL, headers=headers, params=params, timeout=30)

        # If the key/email are wrong, USAJOBS returns 401. Explain it plainly.
        if resp.status_code == 401:
            print(
                "USAJOBS rejected the request (401 Unauthorized).\n"
                "Double-check USAJOBS_API_KEY and USAJOBS_EMAIL in .env.local — the\n"
                "User-Agent MUST be the exact email you registered the key with."
            )
            sys.exit(1)
        resp.raise_for_status()

        result = resp.json().get("SearchResult", {})
        items = result.get("SearchResultItems", [])

        # SearchResultCountAll = total matches across ALL pages (for progress).
        total_all = int(result.get("SearchResultCountAll", 0))

        for item in items:
            descriptor = item.get("MatchedObjectDescriptor")
            if descriptor:
                all_jobs.append(descriptor)

        print(f"  page {page}: got {len(items)} postings "
              f"(running total {len(all_jobs)} of {total_all})")

        # Stop when this page came back smaller than a full page, or we've
        # collected everything the API says exists. Either means we're done.
        if len(items) < RESULTS_PER_PAGE or len(all_jobs) >= total_all:
            break

        page += 1
        time.sleep(0.5)  # be polite; small pause between page requests

    return all_jobs


# ---------------------------------------------------------------------------
# Field extraction — pull the parts useful for matching jobs to crews
# ---------------------------------------------------------------------------

def extract_fields(job):
    """
    Turn one raw USAJOBS record into a small, flat dict with just the fields we
    care about for location-matching. Everything uses .get() so a missing field
    becomes None/empty rather than crashing.
    """
    # Duty locations: a posting can list MANY (a job open in several towns).
    # Each has a city and a state (CountrySubDivisionCode is the state name).
    locations = []
    for loc in job.get("PositionLocation", []) or []:
        locations.append({
            "location_name": loc.get("LocationName"),          # "Missoula, Montana"
            "city": loc.get("CityName"),                       # "Missoula"
            "state": loc.get("CountrySubDivisionCode"),        # "Montana"
            "country": loc.get("CountryCode"),
        })

    # Job series: list of {Name, Code}. We keep just the codes (e.g. "0456").
    series_codes = [c.get("Code") for c in (job.get("JobCategory") or []) if c.get("Code")]

    # Pay plan (e.g. "GS") and the low/high grade numbers, when present.
    pay_plans = [g.get("Code") for g in (job.get("JobGrade") or []) if g.get("Code")]
    details = job.get("UserArea", {}).get("Details", {}) or {}

    # Salary: PositionRemuneration is a list; the first entry is the main range.
    salary = (job.get("PositionRemuneration") or [{}])[0]

    return {
        "title": job.get("PositionTitle"),
        "announcement_number": job.get("PositionID"),
        "department": job.get("DepartmentName"),        # e.g. "Department of Agriculture"
        "agency": job.get("OrganizationName"),          # e.g. "Forest Service"
        "job_series": series_codes,
        "pay_plan": pay_plans,                           # e.g. ["GS"]
        "low_grade": details.get("LowGrade"),
        "high_grade": details.get("HighGrade"),
        "salary_min": salary.get("MinimumRange"),
        "salary_max": salary.get("MaximumRange"),
        "salary_interval": salary.get("RateIntervalCode"),  # e.g. "Per Year"
        "open_date": job.get("PositionStartDate"),       # applications open
        "close_date": job.get("PositionEndDate"),        # applications close
        "apply_url": job.get("PositionURI"),             # direct USAJOBS link
        "locations": locations,
    }


# ---------------------------------------------------------------------------
# Summary — the numbers we want to eyeball before designing the integration
# ---------------------------------------------------------------------------

def print_summary(jobs):
    """Print the counts the team asked for: total, by state, by agency, examples."""
    print("\n" + "=" * 60)
    print(f"TOTAL OPEN FIRE POSTINGS: {len(jobs)}")
    print("=" * 60)

    # Count postings per state. A posting open in several states counts once per
    # unique state, so these tallies can add up to more than the total above.
    by_state = {}
    for j in jobs:
        states = {loc["state"] for loc in j["locations"] if loc["state"]}
        for s in states:
            by_state[s] = by_state.get(s, 0) + 1

    print("\nBy state (postings with at least one duty location there):")
    for state, count in sorted(by_state.items(), key=lambda kv: -kv[1]):
        print(f"  {state:<28} {count}")

    # Count postings per hiring agency.
    by_agency = {}
    for j in jobs:
        agency = j["agency"] or "(unknown)"
        by_agency[agency] = by_agency.get(agency, 0) + 1

    print("\nBy agency:")
    for agency, count in sorted(by_agency.items(), key=lambda kv: -kv[1]):
        print(f"  {agency:<40} {count}")

    # Show a few complete example records so we can see the real structure.
    print("\nExample records (first 4):")
    for j in jobs[:4]:
        print("\n  " + "-" * 56)
        print(f"  Title:        {j['title']}")
        print(f"  Announcement: {j['announcement_number']}")
        print(f"  Agency:       {j['agency']}  ({j['department']})")
        print(f"  Series:       {j['job_series']}   Grade: {j['pay_plan']} "
              f"{j['low_grade']}-{j['high_grade']}")
        print(f"  Salary:       {j['salary_min']}-{j['salary_max']} {j['salary_interval']}")
        print(f"  Open/Close:   {j['open_date']}  ->  {j['close_date']}")
        loc_str = "; ".join(l["location_name"] for l in j["locations"] if l["location_name"])
        print(f"  Locations:    {loc_str}")
        print(f"  Apply:        {j['apply_url']}")


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    api_key, email = get_credentials()

    print(f"Searching USAJOBS for open fire jobs in series {', '.join(JOB_SERIES)} ...")
    raw_jobs = fetch_all_postings(api_key, email)

    # Tidy each record down to the fields we care about.
    jobs = [extract_fields(j) for j in raw_jobs]

    # Save the tidy results. (fire_jobs_raw.json is gitignored for now.)
    with open(OUTPUT, "w", encoding="utf-8") as f:
        json.dump(jobs, f, indent=2, ensure_ascii=False)

    print_summary(jobs)
    print(f"\nWrote {len(jobs)} postings to {OUTPUT}  (gitignored — not committed).")


if __name__ == "__main__":
    main()
