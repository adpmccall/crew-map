# MERGE_PLAN.md — Merging the Handcrew Atlas into Crew Map

How we plan to fold the **Wildland Fire Handcrew Atlas** (a third-party Google
My Maps export, `Wildland Fire Handcrew Atlas.kmz`, 527 placemarks) into our
curated crew dataset (`crews_with_coords.json`, 440 records). This is the *plan*;
see `ARCHITECTURE.md` for the product and `CLAUDE.md` for how we work.

## Status (2026-07-24)

- **Permission: secured.** The Atlas creator has granted permission to use the
  data. (The KMZ and any extracted copies stay **gitignored** — we don't
  republish someone else's source file wholesale.)
- **Not yet imported.** Nothing has been merged or written to Supabase. We are
  reviewing two dry-run CSVs (below) before designing the actual import.
- This whole exercise confirmed the headline: **this is overwhelmingly an
  addition, not a reconciliation.** Genuine field disagreement is a rounding
  error; the Atlas's value is new crews + a crew-name field we don't have.

## The two sources are NOT field-comparable

This is the single most important finding, and it reshapes the merge.

| Ours (`crews_with_coords.json`) | Atlas (`.kmz` placemark) |
|---|---|
| 12 structured fields: region, forest, district, town, state, location, resource, housing, notes, website, latitude, longitude | `name` (crew name) + `description` (free text: forest + a note + a URL, mashed together) + `coordinates` + photos (`gx_media_links`) |
| **No crew name** | **No** region/district/town/state/resource/housing fields at all |

Consequence — per field, what can even happen in a merge:

- **region, district, town, state, location, resource, housing, notes** — the
  Atlas has nothing here, so these are **always "ours-only" (union)**. They can
  never conflict.
- **forest, website** — both sources have these (the Atlas's are buried in the
  free-text `description` and must be parsed out), so these are the only fields
  where a real value-vs-value comparison is possible.
- **latitude/longitude** — both have coordinates; comparable (but never
  byte-identical — see the coordinate rule).
- **crew name** — **Atlas-only**; a field we don't currently carry. Pure
  addition, never a conflict. Importing it means **adding a `name` column**.

## Adopted merge rules (per-field)

Replaces the earlier "mine wins on conflict" rule — dropped, because neither
source is assumed more accurate (both came from trusted individuals).

1. **Only one source has a value** → use that value.
2. **Both have a value and they MATCH** → store the single value once (no
   duplication, no double-tagging). Agreement is treated as one clean value.
3. **Both have a value and they DIFFER** → the only real conflict. **Never
   overwrite, never silently pick a winner.** Flag the conflict to a CSV for
   manual review (chosen over storing both tagged, to keep records clean).
4. **Coordinates** never match to the byte; treat as "agree" within a small
   tolerance and only flag offsets beyond it (see Open Decisions — tolerance TBD;
   dry-run shows 32 of 138 matched pairs are >2 mi apart).
5. **Every crew record carries a `source` provenance tag**, regardless of case:
   `usfs_official` (our data) / `handcrew_atlas` (the Atlas) / `user_submitted`
   (future community contributions — see `TODO_LATER.md` Phase 3). Provenance is
   the backbone of future moderation.

Viewing/search stays login-free; provenance is metadata, not a gate.

## Matching strategy — proximity + forest confirm

The datasets share no join key (they don't even share a crew-name field), so we
match on geography, confirmed by forest name:

- **Proximity:** nearest of our crews within **5 miles** (haversine).
- **Forest confirm:** only call it the same crew if the parsed Atlas forest and
  our `forest` agree (token overlap ≥ 0.6 after dropping role words like
  `SMOD`/`WFM`/`HC` and `NF`/`NP`).
- **Precision over recall, on purpose.** Requiring forest agreement *under*-merges
  — it lets some true matches fall into the "new" pile rather than risk a wrong
  merge. That's the safe direction given rule #3 (never destroy a value): a
  missed merge is a reviewable duplicate; a bad merge could clobber data.

## Dry-run results

**Match outcome (527 Atlas placemarks vs. 440 of our crews):**

| Outcome | Count |
|---|---|
| Confirmed matches (same crew in both sources) | 138 |
| New — far from any crew (>5 mi) | 288 |
| New — near a crew but forest differs | 101 |
| **Total new crews the Atlas would add** | **389** |

**Field cases on the 138 confirmed matches:**

| Field | Result |
|---|---|
| forest | 138 agree (matching required it) → store once |
| website | 64 agree · 18 Atlas fills a blank of ours · 29 ours-only · **26 genuine conflict → CSV** |
| coordinates | median offset 0.69 mi, max 4.5 mi; 32 pairs >2 mi apart |
| crew name | 138 records gain a name (new field) |
| region/district/town/state/location/resource/housing/notes | untouched (union — Atlas has none) |

## Caveats to keep honest

- **The 138 is a floor, 389 a ceiling.** Forest-confirm under-merges, so true
  overlap is between 138 and ~239 (proximity-only count). The 389 "new" therefore
  *over*-counts — the 101 "near-but-differs" bucket mixes genuinely-new non-USFS
  crews with missed duplicates. **That's what the second CSV is for.**
- **Even the 26 website "conflicts" are soft** — most are the same forest site
  under different URL spellings (`asnf` vs `apache-sitgreaves`). Truly-different
  destinations are a handful. The CSV lets a human resolve them in seconds.

## Review deliverables (gitignored, in the repo root)

Both are derived from the Atlas; kept out of git until the import is designed.

1. **`merge_review_website_conflicts.csv`** (26 rows) — confirmed-match pairs
   whose website genuinely differs. Columns: `crew_name, field, usfs_official,
   handcrew_atlas, dist_mi`. Resolve each by picking the right URL.
2. **`merge_review_near_but_differs.csv`** (101 rows) — the near-but-forest-differs
   bucket, sorted closest-first, for the new-vs-dupe judgment. Columns include an
   `affiliation_hint` ("non-USFS?" when the Atlas forest names a NP/BLM/BIA/State/
   Tribe/etc.). Read it as: **`non-USFS?` rows ≈ genuinely new; rows with a blank
   `atlas_forest` sitting ~0 mi on top of a USFS crew ≈ missed duplicates** (the
   parser just couldn't read a forest to confirm). 30 of 101 carry the non-USFS
   hint.

## Open decisions before we design the import

- [ ] Review both CSVs (new-vs-dupe on the 101; correct URL on the 26).
- [ ] Coordinate tolerance for "agree vs flag" (rule #4) — pick a mileage.
- [ ] Confirm adding a **`name`** column (and how it shows in the popup).
- [ ] Recall-recovery: decide whether to re-attempt matching the "near-but-differs"
      rows that look like missed dupes (e.g. blank-forest + <0.5 mi + matching
      USDA URL) rather than importing them as new.
- [ ] Where `source` lives (per-record column vs. per-field provenance) and how
      the schema/import script (`import_to_supabase.py`) and `crews` table change.

## What has NOT been done

No merge, no schema change, no Supabase write, no new crew records. This document
plus the two review CSVs are the entire output so far.
