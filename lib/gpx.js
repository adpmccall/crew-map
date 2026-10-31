// GPX parsing + stats for the Hotshot Crew Hikes feature.
//
// A .gpx file is XML that GPS devices/apps export a recorded track in. The
// points making up the track live in <trkpt lat="..." lon="..."><ele>meters
// </ele></trkpt> tags. This file turns that raw XML into the three things the
// feature needs: distance, elevation gain, and a simplified path to draw.
//
// Runs entirely in the browser (DOMParser is a browser API, not available in
// Node) — no new library, no server round-trip. That matches CLAUDE.md's
// "keep it at $0, keep the service list small" rule: this feature needs zero
// new dependencies and zero new services.

import { haversineMiles } from "./proximity";

const METERS_TO_FEET = 3.28084;

// A .gpx file this big is already far more detail than this feature needs —
// a multi-hour hike at 1-second GPS logging is still only a few hundred KB of
// XML. Past this, something is probably wrong (a multi-day recording, or not
// a hike file at all), so the form rejects it before doing any parsing work.
// Keep in sync with the file_size_limit set on the 'crew-hikes' Storage
// bucket in hike_submissions_schema.sql.
export const MAX_GPX_FILE_BYTES = 3 * 1024 * 1024; // 3 MB

// Pull every trackpoint out of a GPX file's raw text, in file order. Returns
// [{ lat, lon, ele }] — ele is null when a point has no <ele> tag (allowed by
// the GPX spec; some devices/apps omit it).
export function parseGpxTrackpoints(gpxText) {
  const doc = new DOMParser().parseFromString(gpxText, "text/xml");

  // A file that fails to parse comes back as a document containing a
  // <parsererror> element rather than throwing — check for it explicitly, or
  // a bad file silently produces zero trackpoints instead of a clear error.
  if (doc.querySelector("parsererror")) {
    throw new Error("That doesn't look like a valid .gpx file.");
  }

  const points = [...doc.getElementsByTagName("trkpt")].map((pt) => {
    const lat = parseFloat(pt.getAttribute("lat"));
    const lon = parseFloat(pt.getAttribute("lon"));
    const eleNode = pt.getElementsByTagName("ele")[0];
    const ele = eleNode ? parseFloat(eleNode.textContent) : null;
    return { lat, lon, ele };
  });

  // Drop anything without usable coordinates rather than letting NaN flow
  // into the distance/elevation math below.
  return points.filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lon));
}

// Total distance along the track, in miles: the sum of the straight-line
// (haversine) distance between each consecutive pair of points. Consecutive
// GPS points are close enough together that this tracks the true trail
// distance closely — the same approach every consumer fitness app uses.
export function trackDistanceMiles(points) {
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    total += haversineMiles(
      points[i - 1].lat,
      points[i - 1].lon,
      points[i].lat,
      points[i].lon
    );
  }
  return total;
}

// Elevation gain, SMOOTHED. This is the one piece of real math in this
// feature — flagged as a known gotcha before the feature was even scoped
// (see crew-map-handoff.md, Hotshot Crew Hikes proposal).
//
// THE PROBLEM: a phone's GPS/barometric altitude reading jitters up and down
// by a few feet between consecutive points, even while walking dead flat.
// Naively summing every uphill step between raw points adds up all that
// jitter as if it were real climbing, and can overstate a hike's true
// elevation gain by 2-3x on a long track.
//
// THE FIX: smooth the elevation values with a simple moving average first,
// THEN sum the uphill steps in the SMOOTHED series. This isn't a fancy
// technique — it's the standard one — but it's the difference between a
// number worth showing and one that's quietly wrong.
const SMOOTHING_WINDOW = 11; // points on each side blended together

function smoothElevations(points) {
  const raw = points.map((p) => p.ele);
  const half = Math.floor(SMOOTHING_WINDOW / 2);
  return raw.map((_, i) => {
    const start = Math.max(0, i - half);
    const end = Math.min(raw.length, i + half + 1);
    const windowVals = raw.slice(start, end).filter((v) => v != null);
    if (!windowVals.length) return null;
    return windowVals.reduce((a, b) => a + b, 0) / windowVals.length;
  });
}

// Returns feet gained, or null when the file carries no elevation data at all
// (allowed by the spec — some devices don't log it). Null, not zero: those
// are different facts and the UI should say so rather than claim flat gain.
export function elevationGainFeet(points) {
  if (points.length < 2 || points.every((p) => p.ele == null)) return null;
  const smoothed = smoothElevations(points);
  let gainMeters = 0;
  for (let i = 1; i < smoothed.length; i++) {
    if (smoothed[i] == null || smoothed[i - 1] == null) continue;
    const delta = smoothed[i] - smoothed[i - 1];
    if (delta > 0) gainMeters += delta;
  }
  return Math.round(gainMeters * METERS_TO_FEET);
}

// A simplified [[lat, lon], ...] path for map rendering. A full recorded
// track can be thousands of points — far more detail than a line on a
// nationwide map needs, and more than should sit in a database row. Keeping
// roughly every Nth point (always including the first and last so the drawn
// line still starts/ends in the right place) gets this down to something
// small while still looking like the real trail at any zoom this map uses.
//
// This is simple decimation, not a "real" line-simplification algorithm
// (e.g. Douglas-Peucker). CLAUDE.md's own rule is "prefer clear, conventional
// code over clever code" for this project — decimation is a few lines
// anyone can read, and it's plenty for a single day-hike track.
const MAX_PATH_POINTS = 150;

export function simplifyPath(points) {
  if (points.length <= MAX_PATH_POINTS) {
    return points.map((p) => [p.lat, p.lon]);
  }
  const step = (points.length - 1) / (MAX_PATH_POINTS - 1);
  const out = [];
  for (let i = 0; i < MAX_PATH_POINTS; i++) {
    const idx = Math.round(i * step);
    out.push([points[idx].lat, points[idx].lon]);
  }
  return out;
}

// Runs the whole pipeline on a raw .gpx file's text content and returns
// everything the submission form and the database row need. Throws a
// human-readable Error on anything that isn't a usable hike track — the form
// catches this and shows it inline rather than sending a broken submission.
export function computeHikeStats(gpxText) {
  const points = parseGpxTrackpoints(gpxText);
  if (points.length < 2) {
    throw new Error(
      "Couldn't find a recorded track in that file — is it a .gpx from a hike?"
    );
  }
  const first = points[0];
  const last = points[points.length - 1];
  return {
    pointCount: points.length,
    distanceMiles: Math.round(trackDistanceMiles(points) * 100) / 100,
    elevationGainFeet: elevationGainFeet(points),
    path: simplifyPath(points),
    startLat: first.lat,
    startLon: first.lon,
    endLat: last.lat,
    endLon: last.lon,
  };
}
