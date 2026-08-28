"""photo_rehost.py — re-host the 114 Handcrew Atlas crew patches on Supabase.

WHY THIS EXISTS
---------------
The 114 Atlas `photo_url` values point at Google My Maps' image host. Those URLs
return HTTP 200 with real image bytes to curl, and NEVER render in a browser.
The reason is a response header:

    cross-origin-resource-policy: same-site

CORP is enforced by the BROWSER, not the server. Google hands over the bytes and
attaches a header saying "only a same-site page may use this" — so the patch
displays on Google's own My Maps page and is discarded everywhere else. curl
doesn't implement CORP, which is why command-line testing said the URLs were
fine while a real browser failed all 114.

This is deliberate hotlink protection, and no URL variant defeats it: stripping
`?authuser=0&fife=`, adding a referrer, changing the size — the header comes
back regardless. The only way to display these images is to serve them
ourselves. Hence this script.

(Two earlier diagnoses were wrong and are recorded so nobody re-litigates them:
the literal `*` in the path is Google's normal export format, not an
unsubstituted placeholder, and `atlas_import.py` extracted it faithfully. The
`*` has nothing to do with the failure.)

WHAT IT DOES
------------
  1. Reads the 114 crews whose photo_url still points at Google.
  2. Downloads each original image.
  3. Converts to WebP, max 900px on the long edge, quality 82. That takes the
     set from 49.1 MB to 4.4 MB (~40 KB each) with no visible loss — the popup
     displays them at roughly 286x130 CSS px, so 900px is generous even on a 2x
     screen. WebP is used over PNG because it keeps transparency (many patches
     have it) at a tenth of the size.
  4. Uploads them to the Supabase Storage bucket `crew-photos`.
  5. VERIFIES each uploaded URL loads AND does not carry a restrictive CORP
     header — i.e. checks for the exact fault we are fixing, before trusting it.
  6. Only then rewrites those 114 photo_url values.

SAFETY
------
  * DRY RUN by default. Nothing is written without --commit.
  * Touches ONLY rows whose photo_url matches the Google host. The other 715
    crews are never in the query, let alone the update.
  * Refuses to run if the row count isn't what we expect, unless --force.
  * Writes photo_rehost_backup.json (old id -> photo_url) BEFORE the first
    database write, and --rollback restores exactly from it.
  * Uploads and verifies FIRST, patches rows LAST. If anything fails partway,
    the database still points at the old URLs and nothing is half-migrated.

CREDENTIALS — the SECRET key, from the environment only
-------------------------------------------------------
Never paste a key into a file, a terminal you'll screenshot, or a chat.

    export SUPABASE_URL="https://xxxxx.supabase.co"
    export SUPABASE_SERVICE_ROLE_KEY="the-secret-key"

USAGE
-----
    python3 photo_rehost.py                # dry run: report only, no writes
    python3 photo_rehost.py --prepare      # also download + convert locally
    python3 photo_rehost.py --commit       # upload, verify, then update rows
    python3 photo_rehost.py --rollback     # restore old URLs from the backup

--commit is re-runnable: uploads overwrite by name and the row update is
idempotent, so an interrupted run can simply be run again.
"""

import json
import os
import sys
import time

try:
    import requests
except ImportError:
    print("Missing 'requests'. Run:  pip install requests")
    sys.exit(1)

try:
    from PIL import Image
except ImportError:
    print("Missing 'Pillow'. Run:  pip install Pillow")
    sys.exit(1)


BACKUP = "photo_rehost_backup.json"
WORKDIR = "photo_rehost_files"          # local originals + converted, gitignored
BUCKET = "crew-photos"
EXPECTED_ROWS = 114

# Only rows whose photo_url is still a Google-hosted image are in scope. This is
# the guard that keeps the other 715 crews out of every query in this script.
GOOGLE_HOST = "mymaps.usercontent.google.com"

MAX_EDGE = 900
WEBP_QUALITY = 82


# --- http with backoff ------------------------------------------------------
# The first --commit run uploaded all 114 files fine and then failed verifying
# one of them with HTTP 429 (Too Many Requests). That was self-inflicted: the
# script fired 114 requests back to back with no pacing and no retry, and
# verification additionally pulled every full image body — 4.4 MB of downloads
# purely to read a header.
#
# 429 is not a failure, it is the server asking us to slow down. So: pace the
# requests, and retry 429s and transient 5xxs with exponential backoff,
# honouring Retry-After when the server sends one.

RETRY_STATUS = {429, 500, 502, 503, 504}
REQUEST_PACE = 0.06     # seconds between requests; ~17/sec, polite and still quick
MAX_TRIES = 5


def _retry_after(resp):
    """Seconds the server asked us to wait, if it said. Ignores HTTP-date form."""
    raw = (resp.headers.get("Retry-After") or "").strip()
    try:
        return max(0.0, float(raw))
    except ValueError:
        return None


def http(method, url, *, tries=MAX_TRIES, pace=True, **kwargs):
    """One HTTP request, retried on 429/5xx. Returns the final response."""
    delay = 1.0
    resp = None
    for attempt in range(1, tries + 1):
        if pace:
            time.sleep(REQUEST_PACE)
        try:
            resp = requests.request(method, url, **kwargs)
        except requests.RequestException:
            # A connection-level error is worth one more go for the same reason.
            if attempt == tries:
                raise
            time.sleep(delay)
            delay = min(delay * 2, 30)
            continue

        if resp.status_code not in RETRY_STATUS or attempt == tries:
            return resp

        wait = _retry_after(resp) or delay
        print(f"    HTTP {resp.status_code} — backing off {wait:.1f}s "
              f"(attempt {attempt}/{tries})")
        time.sleep(wait)
        delay = min(delay * 2, 30)
    return resp


# --- config ----------------------------------------------------------------

def load_env_local():
    """Pick up SUPABASE_URL from .env.local if it isn't already exported.

    Deliberately does NOT read any key from that file — keys come from the
    environment only, so a key is never read from disk by this script.
    """
    if os.environ.get("SUPABASE_URL"):
        return
    try:
        with open(".env.local", encoding="utf-8") as fh:
            for line in fh:
                if line.startswith("NEXT_PUBLIC_SUPABASE_URL="):
                    os.environ.setdefault(
                        "SUPABASE_URL", line.split("=", 1)[1].strip()
                    )
    except FileNotFoundError:
        pass


def config(need_secret):
    load_env_local()
    url = (
        os.environ.get("SUPABASE_URL")
        or os.environ.get("NEXT_PUBLIC_SUPABASE_URL", "")
    ).rstrip("/")
    if url.endswith("/rest/v1"):
        url = url[: -len("/rest/v1")]

    if not url or "xxxxx" in url:
        print("Set SUPABASE_URL to your real project URL first:\n"
              '    export SUPABASE_URL="https://xxxxx.supabase.co"')
        sys.exit(1)

    if not need_secret:
        # Reading crews only needs the public key — same read the website does.
        key = os.environ.get("NEXT_PUBLIC_SUPABASE_ANON_KEY", "") or os.environ.get(
            "SUPABASE_SERVICE_ROLE_KEY", ""
        )
        if not key:
            print("For a dry run, set either the anon or the secret key:\n"
                  '    export NEXT_PUBLIC_SUPABASE_ANON_KEY="the-publishable-key"')
            sys.exit(1)
    else:
        key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
        if not key:
            print("Writing needs the SECRET key:\n"
                  '    export SUPABASE_SERVICE_ROLE_KEY="the-secret-key"')
            sys.exit(1)

    rest_headers = {"apikey": key, "Content-Type": "application/json"}
    # Legacy service_role keys are JWTs and want Bearer too; sb_secret_ keys are
    # not JWTs and must NOT be sent that way (same rule as refresh_jobs.py).
    if key.startswith("eyJ"):
        rest_headers["Authorization"] = f"Bearer {key}"

    # Storage is a different API from PostgREST and does want Bearer for both
    # key styles.
    storage_headers = {"apikey": key, "Authorization": f"Bearer {key}"}
    return url, rest_headers, storage_headers


# --- read ------------------------------------------------------------------

def fetch_targets(base, headers):
    """The crews still pointing at Google. Nothing else is ever selected."""
    r = http("GET", f"{base}/rest/v1/crews",
        headers=headers,
        params={
            "select": "id,crew_name,photo_url",
            "photo_url": f"like.*{GOOGLE_HOST}*",
            "order": "id",
        },
        timeout=60,
    )
    r.raise_for_status()
    return r.json()


# --- prepare (download + convert) -------------------------------------------

def prepare(rows):
    """Download each original and write a web-sized WebP beside it."""
    orig_dir = os.path.join(WORKDIR, "original")
    web_dir = os.path.join(WORKDIR, "web")
    os.makedirs(orig_dir, exist_ok=True)
    os.makedirs(web_dir, exist_ok=True)

    done = failed = 0
    total_in = total_out = 0

    for row in rows:
        cid = row["id"]
        src = os.path.join(orig_dir, f"{cid}.bin")
        out = os.path.join(web_dir, f"{cid}.webp")

        if not (os.path.exists(src) and os.path.getsize(src) > 500):
            try:
                resp = http("GET", row["photo_url"], timeout=90)
                resp.raise_for_status()
                with open(src, "wb") as fh:
                    fh.write(resp.content)
            except Exception as exc:                      # noqa: BLE001
                print(f"  DOWNLOAD FAILED  id={cid}  {row['crew_name']}: {exc}")
                failed += 1
                continue

        try:
            im = Image.open(src)
            im.load()
            im.thumbnail((MAX_EDGE, MAX_EDGE), Image.LANCZOS)
            # Palette images can't be saved straight to WebP with alpha intact.
            if im.mode == "P":
                im = im.convert("RGBA")
            im.save(out, "WEBP", quality=WEBP_QUALITY, method=6)
        except Exception as exc:                          # noqa: BLE001
            print(f"  CONVERT FAILED   id={cid}  {row['crew_name']}: {exc}")
            failed += 1
            continue

        total_in += os.path.getsize(src)
        total_out += os.path.getsize(out)
        done += 1

    print(f"  prepared {done} images, {failed} failed")
    if done:
        print(f"  {total_in / 1048576:.1f} MB originals -> "
              f"{total_out / 1048576:.1f} MB webp "
              f"({total_out / done / 1024:.0f} KB average)")
    return failed == 0


# --- storage ----------------------------------------------------------------

def ensure_bucket(base, sheaders):
    """Create the public bucket if it isn't there. Safe to call repeatedly."""
    r = http("GET", f"{base}/storage/v1/bucket/{BUCKET}",
             headers=sheaders, timeout=30)
    if r.status_code == 200:
        info = r.json()
        if not info.get("public"):
            print(f"  bucket '{BUCKET}' exists but is PRIVATE — making it public")
            http("PUT", f"{base}/storage/v1/bucket/{BUCKET}",
                         headers={**sheaders, "Content-Type": "application/json"},
                         json={"public": True}, timeout=30).raise_for_status()
        else:
            print(f"  bucket '{BUCKET}' already exists and is public")
        return

    print(f"  creating public bucket '{BUCKET}'")
    r = http("POST", f"{base}/storage/v1/bucket",
        headers={**sheaders, "Content-Type": "application/json"},
        # Public read only. Writes still require the secret key, so the site can
        # display patches while nobody can upload to it.
        json={"id": BUCKET, "name": BUCKET, "public": True,
              "file_size_limit": 5 * 1024 * 1024,
              "allowed_mime_types": ["image/webp", "image/png", "image/jpeg"]},
        timeout=30,
    )
    if r.status_code not in (200, 201):
        print(f"  could not create bucket: {r.status_code} {r.text[:300]}")
        sys.exit(1)


def public_url(base, cid):
    return f"{base}/storage/v1/object/public/{BUCKET}/{cid}.webp"


def upload_all(base, sheaders, rows):
    """Upload every converted file. Returns {crew_id: public_url}."""
    web_dir = os.path.join(WORKDIR, "web")
    urls = {}
    failed = 0

    for row in rows:
        cid = row["id"]
        path = os.path.join(web_dir, f"{cid}.webp")
        if not os.path.exists(path):
            print(f"  MISSING local file for id={cid} — run --prepare first")
            failed += 1
            continue

        with open(path, "rb") as fh:
            blob = fh.read()

        r = http("POST", f"{base}/storage/v1/object/{BUCKET}/{cid}.webp",
            headers={**sheaders,
                     "Content-Type": "image/webp",
                     # Overwrite on re-run rather than erroring on conflict.
                     "x-upsert": "true",
                     "Cache-Control": "public, max-age=31536000, immutable"},
            data=blob,
            timeout=120,
        )
        if r.status_code not in (200, 201):
            print(f"  UPLOAD FAILED id={cid}: {r.status_code} {r.text[:200]}")
            failed += 1
            continue
        urls[cid] = public_url(base, cid)

    print(f"  uploaded {len(urls)} files, {failed} failed")
    return urls if failed == 0 else None


def verify_urls(urls, sample=None):
    """Check the new URLs load AND are not CORP-locked like the Google ones.

    This is the whole point of the exercise, so it is checked explicitly rather
    than assumed. A 200 alone is NOT sufficient evidence — that is exactly what
    the Google URLs returned while failing in every browser.
    """
    items = list(urls.items())
    if sample:
        items = items[:sample]

    bad = []
    for cid, url in items:
        try:
            # stream=True returns as soon as the headers are in, so we read the
            # status and headers without pulling the image body. Same request a
            # browser makes; a fraction of the bandwidth.
            r = http("GET", url, timeout=60, stream=True)
            r.close()
        except Exception as exc:                          # noqa: BLE001
            bad.append((cid, f"request failed: {exc}"))
            continue

        corp = r.headers.get("cross-origin-resource-policy", "")
        ctype = r.headers.get("content-type", "")

        if r.status_code != 200:
            bad.append((cid, f"HTTP {r.status_code}"))
        elif not ctype.startswith("image/"):
            bad.append((cid, f"content-type {ctype!r}"))
        elif corp and corp.strip().lower() in ("same-site", "same-origin"):
            bad.append((cid, f"CORP {corp!r} — would be blocked in a browser"))

    if bad:
        print(f"  VERIFY FAILED on {len(bad)} of {len(items)}:")
        for cid, why in bad[:10]:
            print(f"    id={cid}: {why}")
        return False

    print(f"  verified {len(items)} URLs: 200, image content-type, no CORP lock")
    return True


# --- write ------------------------------------------------------------------

def save_backup(rows):
    """Old values, written BEFORE any database write. Never overwritten."""
    if os.path.exists(BACKUP):
        print(f"  {BACKUP} already exists — keeping it (it holds the ORIGINAL "
              "values; overwriting would destroy the ability to roll back)")
        return
    with open(BACKUP, "w", encoding="utf-8") as fh:
        json.dump(
            [{"id": r["id"], "crew_name": r["crew_name"],
              "photo_url": r["photo_url"]} for r in rows],
            fh, indent=2,
        )
    print(f"  wrote {BACKUP} ({len(rows)} rows)")


def patch_rows(base, headers, urls):
    """One PATCH per crew, each pinned to a single id."""
    changed = 0
    for cid, url in urls.items():
        r = http("PATCH", f"{base}/rest/v1/crews",
            headers={**headers, "Prefer": "return=representation"},
            params={"id": f"eq.{cid}"},
            json={"photo_url": url},
            timeout=60,
        )
        if r.status_code not in (200, 204):
            print(f"  PATCH FAILED id={cid}: {r.status_code} {r.text[:200]}")
            continue
        changed += len(r.json()) if r.text.strip() else 1
    return changed


def rollback(base, headers):
    if not os.path.exists(BACKUP):
        print(f"No {BACKUP} — nothing to roll back to.")
        sys.exit(1)
    with open(BACKUP, encoding="utf-8") as fh:
        rows = json.load(fh)

    print(f"Restoring {len(rows)} original photo_url values...")
    restored = 0
    for row in rows:
        r = http("PATCH", f"{base}/rest/v1/crews",
            headers={**headers, "Prefer": "return=representation"},
            params={"id": f"eq.{row['id']}"},
            json={"photo_url": row["photo_url"]},
            timeout=60,
        )
        if r.status_code in (200, 204):
            restored += 1
        else:
            print(f"  failed id={row['id']}: {r.status_code}")
    print(f"Restored {restored} rows.")
    print("NOTE: the uploaded files are left in Storage. Delete the "
          f"'{BUCKET}' bucket by hand if you want them gone.")


# --- main -------------------------------------------------------------------

def main():
    commit = "--commit" in sys.argv
    do_rollback = "--rollback" in sys.argv
    do_prepare = "--prepare" in sys.argv or commit
    force = "--force" in sys.argv

    base, headers, sheaders = config(need_secret=commit or do_rollback)

    if do_rollback:
        rollback(base, headers)
        return

    print("Reading crews whose photo_url still points at Google...")
    rows = fetch_targets(base, headers)
    print(f"  found {len(rows)} rows (the other crews are not in this query)")

    if len(rows) != EXPECTED_ROWS and not force:
        print(f"\nExpected {EXPECTED_ROWS} rows, found {len(rows)}.")
        print("Stopping. If this is genuinely right, re-run with --force.")
        sys.exit(1)

    if do_prepare:
        print("\nDownloading originals and converting to WebP...")
        if not prepare(rows) and not force:
            print("\nSome images failed. Stopping before any write.")
            sys.exit(1)

    if not commit:
        print("\nDRY RUN — nothing was written.")
        print(f"  would upload {len(rows)} files to bucket '{BUCKET}'")
        print(f"  would rewrite photo_url on {len(rows)} rows, e.g.")
        for row in rows[:3]:
            print(f"    id={row['id']:<5} {row['crew_name']}")
            print(f"      from {row['photo_url'][:72]}...")
            print(f"      to   {public_url(base, row['id'])}")
        print("\nRun with --commit to do it.")
        return

    print("\nEnsuring the storage bucket exists...")
    ensure_bucket(base, sheaders)

    print("\nUploading...")
    urls = upload_all(base, sheaders, rows)
    if urls is None:
        print("\nUploads failed. NOTHING was written to the database — the "
              "crews still point at their old URLs.")
        sys.exit(1)

    print("\nVerifying the new URLs before trusting them...")
    if not verify_urls(urls):
        print("\nVerification failed. NOTHING was written to the database.")
        sys.exit(1)

    print("\nBacking up the old values...")
    save_backup(rows)

    print("\nUpdating photo_url...")
    changed = patch_rows(base, headers, urls)
    print(f"\nDone. {changed} rows updated.")
    print("Now confirm in a REAL BROWSER — a 200 from the command line is not "
          "evidence, as this whole exercise established.")


if __name__ == "__main__":
    main()
