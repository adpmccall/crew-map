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

// NOTE ON WHAT USED TO LIVE HERE: crews once carried an amber ring meaning "a
// posting exists within 50 miles", later graded by distance. Both versions are
// gone. The ring drew a job-to-crew connection on the map, and USAJOBS only
// gives a duty-station TOWN — never a worksite — so that connection was always
// a stronger claim than the data could support. Postings are their own markers
// now. The radius below survives only for the passive "open postings near here"
// list inside a crew popup, where the number shown is a real computed distance
// from a crew's coordinate to a town's centre.

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
