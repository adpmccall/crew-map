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
