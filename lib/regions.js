// The 6 Forest Service regions in this dataset, each with a distinct pin color
// and a short label for the legend. ONE place defines colors + labels so the
// map pins and the legend can never disagree.
//
// The `region` value here must match the `region` field in the data EXACTLY
// (that's how we look up a pin's color). Verified against crews_with_coords.json.

// NOTE ON COVERAGE: R1–R6 are the six regions our curated 440 crews cover — this
// started as a Western-US dataset. R8/R9/R10 exist here only because the
// Handcrew Atlas merge brought in a handful of Eastern/Southern/Alaska crews.
// They are NOT real coverage of those regions. See the "National coverage"
// item in TODO_LATER.md before treating this map as nationwide.
//
// There is no Region 7 — the Forest Service retired it decades ago, so the
// numbering genuinely jumps from 6 to 8. That gap is correct, not a typo.
//
// The three added colors were picked by measuring perceptual distance (CIELAB
// deltaE) against BOTH this palette and the crew-type palette in lib/crewTypes.js,
// so nothing clashes when you switch symbolize modes. Each sits at least 30
// deltaE from every other color in both systems (~20 is where a clash starts).
export const REGIONS = [
  { region: "NORTHERN REGION, REGION 1", color: "#1f77b4", label: "R1 · Northern" },
  { region: "ROCKY MOUNTAIN REGION, REGION 2", color: "#ff7f0e", label: "R2 · Rocky Mountain" },
  { region: "SOUTHWESTERN REGION, REGION 3", color: "#2ca02c", label: "R3 · Southwestern" },
  { region: "INTERMOUNTAIN REGION, REGION 4", color: "#9467bd", label: "R4 · Intermountain" },
  { region: "PACIFIC SOUTHWEST REGION, REGION 5", color: "#d62728", label: "R5 · Pacific Southwest" },
  { region: "PACIFIC NORTHWEST REGION, REGION 6", color: "#17becf", label: "R6 · Pacific Northwest" },
  // --- added for the Atlas Eastern/Southern/Alaska crews ---
  { region: "SOUTHERN REGION, REGION 8", color: "#8c564b", label: "R8 · Southern" },
  { region: "EASTERN REGION, REGION 9", color: "#831843", label: "R9 · Eastern" },
  { region: "ALASKA REGION, REGION 10", color: "#bcbd22", label: "R10 · Alaska" },
];

// Grey, used only if a crew's region isn't one of the six above (shouldn't
// happen with the current data, but it keeps a stray value from breaking).
const FALLBACK_COLOR = "#888888";

// Build a lookup once so we don't scan the array for every one of the 440 pins.
const COLOR_BY_REGION = Object.fromEntries(REGIONS.map((r) => [r.region, r.color]));

export function colorForRegion(region) {
  return COLOR_BY_REGION[region] || FALLBACK_COLOR;
}
