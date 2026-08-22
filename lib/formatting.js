// Small display helpers shared by the popups.
//
// These used to live inside CrewPopup. They moved here when job postings became
// their own markers on the map, because the SAME posting now renders in two
// places — the town popup you get from a posting pin, and the "near here" list
// inside a crew popup — and both must format it identically.

// Some website values are missing the "http://" part. Without a protocol the
// browser treats the link as relative (it would point back at our own site), so
// add https:// when there isn't one already.
export function withProtocol(url) {
  if (/^https?:\/\//i.test(url)) return url;
  return `https://${url}`;
}

// Only ever load an image over http(s). `photo_url` comes from third-party
// (Atlas) data, so this keeps a stray value from becoming a surprise `src`.
export function isHttpUrl(url) {
  return /^https?:\/\//i.test(url);
}

// Show a friendly distance: under a mile reads as "<1 mi" rather than "0 mi".
export function formatDistance(miles) {
  return miles < 1 ? "<1 mi" : `${Math.round(miles)} mi`;
}

// Pay, shown EXACTLY as USAJOBS advertised it. The filters compare an annualized
// figure so hourly and yearly postings sit on one axis, but that number is never
// displayed — an hourly posting reads "$25.37/hr", because that is what it
// actually pays. Showing the normalized $52,947 would look wrong to anyone who
// then opened the posting.
const RATE_SUFFIX = {
  PH: "/hr",
  PA: "/yr",
  BW: "/pay period",
  PD: "/day",
  PM: "/month",
};

export function formatPay(job) {
  const { salary_min: min, salary_max: max, salary_interval: interval } = job;
  if (min == null && max == null) return "";

  // Hourly rates need cents ($23.20); annual salaries don't ($67,617).
  const cents = interval === "PH";
  const money = (n) =>
    "$" +
    Number(n).toLocaleString("en-US", {
      minimumFractionDigits: cents ? 2 : 0,
      maximumFractionDigits: cents ? 2 : 0,
    });

  // A single-grade posting often quotes one figure twice; don't print a range
  // of a number to itself.
  const range =
    min != null && max != null && Number(min) !== Number(max)
      ? `${money(min)} – ${money(max)}`
      : money(min ?? max);

  // An unrecognized interval falls back to no suffix rather than guessing.
  return range + (RATE_SUFFIX[interval] || "");
}

// --- crew display names -----------------------------------------------------
// 316 of 829 crews have no `crew_name`: we know WHERE the crew is based, not
// what it's called. Both the map popup and the correction form have to name
// those crews, and they must agree — a report headed "Clear Creek Ranger
// District" needs to match the pin the reporter clicked.
//
// Printing the raw value gives "CLEAR CREEK RD", which reads as a street
// address. Expanding the abbreviations and title-casing makes it read as the
// PLACE it actually is. Nothing is invented: callers pair this with an explicit
// "crew name not on file" note rather than passing it off as a real name.
export function tidyPlaceName(raw) {
  const s = (raw || "").trim();
  if (!s) return "";
  return (
    s
      .toLowerCase()
      // Title-case each word, including after / and - so "LOCHSA/POWELL" works.
      .replace(/(^|[\s/\-])([a-z])/g, (_, sep, ch) => sep + ch.toUpperCase())
      // The source data abbreviates these; spelled out they read as places
      // rather than as road names.
      .replace(/\bRds\b/g, "Ranger Districts")
      .replace(/\bRd\b/g, "Ranger District")
      .replace(/\bNf\b/g, "National Forest")
      .replace(/\bNp\b/g, "National Park")
  );
}

// The name to show for a crew, and whether it's a real one.
// `known: false` means we fell back to the base's name and the caller should
// say so rather than let it stand as the crew's title.
export function crewDisplayName(crew) {
  const real = (crew?.crew_name || "").trim();
  if (real) return { name: real, known: true };
  const place =
    tidyPlaceName(crew?.district) || tidyPlaceName(crew?.forest) || "";
  return { name: place || "this crew", known: false };
}
