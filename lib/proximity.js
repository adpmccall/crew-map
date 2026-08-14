// Shared proximity helper for the "currently hiring" feature.
//
// Both crews and jobs have latitude/longitude, so we can decide "is there an
// open job near this crew?" entirely in the browser — no extra service, no
// server round-trip. The math is the "haversine" formula: the great-circle
// distance between two lat/lng points on the Earth's surface.

// How close an open job must be to a crew for the crew to count as "hiring
// nearby". Chosen from the data dry-run (see ARCHITECTURE.md): 50 miles lights
// up a useful number of crews while staying within a real commute-shed.
export const HIRING_RADIUS_MI = 50;

// --- how the ring is drawn, by how far the nearest posting actually is --------
//
// WHY THIS EXISTS: a single amber ring used to mean "there's a posting within 50
// miles" and nothing more, so a crew with an opening in its own town looked
// EXACTLY like one whose nearest opening was a 49-mile drive. Measured on the
// Redding cluster, 26 of 50 rings were for postings over 30 miles away — and
// Lassen IHC (0.0 mi) was indistinguishable from Scott-Salmon RD (49.4 mi).
// That's misleading, not just imprecise.
//
// So the ring now carries the distance in its appearance. Bands were chosen from
// the real spread in that cluster (9 crews <=15 mi, 15 at 15-30, 26 over 30).
//
// The encoding is WEIGHT + OPACITY + DASH, deliberately NOT hue:
//   - amber stays amber, so "hiring" still reads as one idea and the ring can't
//     be confused with the region colors used by the pins underneath;
//   - weight and dash survive on a busy basemap where an opacity difference
//     alone would be too subtle to notice (forest green, snow, water);
//   - it stays legible for colorblind users, since nothing depends on hue.
//
// Ordered nearest-first. `maxMi` is the INCLUSIVE upper bound of each band.
export const HIRING_BANDS = [
  {
    key: "close",
    maxMi: 15,
    label: "within 15 mi",
    pathOptions: { color: "#f59e0b", weight: 4, opacity: 0.95, fill: false, interactive: false },
  },
  {
    key: "near",
    maxMi: 30,
    label: "15–30 mi",
    pathOptions: { color: "#f59e0b", weight: 2.5, opacity: 0.7, fill: false, interactive: false },
  },
  {
    key: "far",
    maxMi: HIRING_RADIUS_MI,
    label: "30–50 mi",
    // Dashed as well as fainter. On its own a low opacity can vanish against
    // dark forest tiles; the dash reads as "distant / provisional" regardless.
    pathOptions: {
      color: "#f59e0b",
      weight: 2,
      opacity: 0.55,
      dashArray: "3 3",
      fill: false,
      interactive: false,
    },
  },
];

// The band a given nearest-posting distance falls into. Anything beyond the last
// band's maxMi still returns the last band rather than null — a crew only gets a
// ring at all when it already passed the HIRING_RADIUS_MI test, so this is a
// floating-point safety net, not a real case.
export function hiringBandFor(distanceMi) {
  return (
    HIRING_BANDS.find((b) => distanceMi <= b.maxMi) ||
    HIRING_BANDS[HIRING_BANDS.length - 1]
  );
}

// Distance in MILES between two points given as decimal degrees.
export function haversineMiles(lat1, lng1, lat2, lng2) {
  const R = 3958.8; // Earth's mean radius in miles
  const toRad = (deg) => (deg * Math.PI) / 180;

  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}
