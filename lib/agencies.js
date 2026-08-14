// The agencies a crew can belong to, and how they're labelled in the UI.
//
// ONE place defines the list so the filter can never disagree with itself, the
// same way lib/regions.js owns the region list.
//
// KEEP IN SYNC WITH TWO OTHER FILES:
//   - agency_schema.sql        the check constraint on crews.agency
//   - agency_backfill_dryrun.py  AGENCY_LABELS (the classifier's vocabulary)
// A value that exists here but not in the constraint can never appear in the
// data; one that exists in the data but not here would show up unlabelled.
//
// WHERE THE VALUES COME FROM: the 440 curated crews are 'usfs' by provenance
// (they ARE the Forest Service dataset). The 389 Handcrew Atlas crews were
// classified from their website domain and description text, because the Atlas
// has no agency field. That makes this column INFERRED rather than authoritative
// — see agency_backfill_dryrun.py for the reasoning and the known-unknowns.

// Order is deliberate and NOT alphabetical: federal land-management agencies
// first (roughly by how many crews they field), then tribal, then state and
// local government, then everything else. "Unknown" is last because it's a gap,
// not a category anyone browses for.
export const AGENCIES = [
  { value: "usfs", label: "Forest Service (USFS)" },
  { value: "blm", label: "BLM" },
  { value: "nps", label: "Park Service (NPS)" },
  { value: "fws", label: "Fish & Wildlife (FWS)" },
  { value: "bia", label: "BIA" },
  { value: "tribal", label: "Tribal" },
  { value: "state", label: "State" },
  { value: "county", label: "County" },
  { value: "local", label: "City / local" },
  { value: "other", label: "Other / NGO" },
  // Shown on purpose rather than hidden. 17 crews have no agency evidence in
  // the data at all, and pretending otherwise would make the filter look more
  // complete than the data actually is.
  { value: "unknown", label: "Unknown" },
];

const LABEL_BY_VALUE = Object.fromEntries(AGENCIES.map((a) => [a.value, a.label]));

// Sort position for each value, so options can be ordered by the list above
// instead of alphabetically. Anything unrecognized sorts to the end.
const ORDER = Object.fromEntries(AGENCIES.map((a, i) => [a.value, i]));

export function agencyLabel(value) {
  // An unexpected value still renders as itself rather than vanishing — better
  // a slightly ugly label than a filter row that silently disappears.
  return LABEL_BY_VALUE[value] || value || "Unknown";
}

export function agencyOrder(value) {
  return ORDER[value] ?? AGENCIES.length;
}
