// The option lists the public submission form offers.
//
// These deliberately mirror the vocabularies the map already filters on, so an
// approved submission is filterable the moment it lands. A free-text state or a
// novel crew-type spelling would produce a crew that exists but can't be found
// by any facet — worse than not having it.

// Agencies, minus "unknown": a person submitting a crew knows who they work
// for, and offering "Unknown" would just invite the laziest answer. Values must
// match the `crews.agency` check constraint in agency_schema.sql.
export const SUBMIT_AGENCIES = [
  { value: "usfs", label: "US Forest Service" },
  { value: "blm", label: "Bureau of Land Management (BLM)" },
  { value: "nps", label: "National Park Service" },
  { value: "fws", label: "US Fish and Wildlife Service" },
  { value: "bia", label: "Bureau of Indian Affairs (BIA)" },
  { value: "tribal", label: "Tribal government / nation" },
  { value: "state", label: "State agency" },
  { value: "county", label: "County" },
  { value: "local", label: "City / local fire district" },
  { value: "other", label: "Other / non-profit" },
];

// The same curated crew types the map's filter offers. Stored comma-joined into
// `resource`, exactly like the existing data, so the "contains" matching the
// crew-type filter already does keeps working unchanged.
export const SUBMIT_CREW_TYPES = [
  "Engine",
  "Hotshot Crew",
  "Helitack",
  "Rappel",
  "Smokejumper",
  "Fuels",
  "Prevention",
  "WFM",
  "IA Crew/Squad",
  "Type 2/2IA Handcrew",
  "Suppression Module",
  "Fire Effects",
  "Water Tender",
  "Dozer",
];

// States as UPPERCASE full names — the exact form `crews.state` uses, so the
// State filter picks a new crew up without any normalizing step. A dropdown
// rather than a text field for the same reason: "CA", "Calif." and "california"
// would all miss.
export const US_STATES = [
  "ALABAMA", "ALASKA", "ARIZONA", "ARKANSAS", "CALIFORNIA", "COLORADO",
  "CONNECTICUT", "DELAWARE", "DISTRICT OF COLUMBIA", "FLORIDA", "GEORGIA",
  "HAWAII", "IDAHO", "ILLINOIS", "INDIANA", "IOWA", "KANSAS", "KENTUCKY",
  "LOUISIANA", "MAINE", "MARYLAND", "MASSACHUSETTS", "MICHIGAN", "MINNESOTA",
  "MISSISSIPPI", "MISSOURI", "MONTANA", "NEBRASKA", "NEVADA", "NEW HAMPSHIRE",
  "NEW JERSEY", "NEW MEXICO", "NEW YORK", "NORTH CAROLINA", "NORTH DAKOTA",
  "OHIO", "OKLAHOMA", "OREGON", "PENNSYLVANIA", "PUERTO RICO", "RHODE ISLAND",
  "SOUTH CAROLINA", "SOUTH DAKOTA", "TENNESSEE", "TEXAS", "UTAH", "VERMONT",
  "VIRGINIA", "WASHINGTON", "WEST VIRGINIA", "WISCONSIN", "WYOMING",
];

// Title-case for display ("MONTANA" -> "Montana"); the stored value stays
// uppercase.
export function titleCaseState(s) {
  return s.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}
