// The Forest Service regions, each with a distinct pin color and a short label
// for the legend. ONE place defines colors + labels so the map pins and the
// legend can never disagree.
//
// The `region` value here must match the `region` field in the data EXACTLY
// (that's how we look up a pin's color). Verified against crews_with_coords.json.

// NOTE ON COVERAGE: this project covers US fire crews NATIONWIDE — every region.
// The data is still catching up to that: our original curated crews covered
// R1–R6, and the Handcrew Atlas merge added our first Eastern/Southern/Alaska
// crews (R8/R9/R10). Those are an early, incomplete start on those regions, so
// keep all nine here — sourcing the rest is tracked as "Finish nationwide
// coverage" in TODO_NOW.md. Legend.js only shows regions that actually have
// crews, so a thin region stays honest without being written out of the map.
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
  // --- added with the Atlas's first Eastern/Southern/Alaska crews ---
  { region: "SOUTHERN REGION, REGION 8", color: "#8c564b", label: "R8 · Southern" },
  { region: "EASTERN REGION, REGION 9", color: "#831843", label: "R9 · Eastern" },
  { region: "ALASKA REGION, REGION 10", color: "#bcbd22", label: "R10 · Alaska" },
];

// Grey, used only if a crew's region isn't one of the ones above — including the
// many Atlas crews whose region is NULL because we can't know it honestly.
const FALLBACK_COLOR = "#888888";

// Build a lookup once so we don't scan the array for every pin.
const COLOR_BY_REGION = Object.fromEntries(REGIONS.map((r) => [r.region, r.color]));

export function colorForRegion(region) {
  return COLOR_BY_REGION[region] || FALLBACK_COLOR;
}
