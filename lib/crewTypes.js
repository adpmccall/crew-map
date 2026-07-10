// Crew-type symbols for "symbol by crew type" mode.
//
// A crew's `resource` field can list SEVERAL types (with messy casing), so we
// pick ONE symbol per crew: scan this list IN ORDER and use the first type whose
// name appears in the resource text (case-insensitive). Order = priority, so the
// most specialized / notable type wins when a crew has several.
//
// This file is pure data + logic (NO Leaflet import), so both the map (which
// builds Leaflet DivIcons from it) and the legend (which renders it as React)
// can share it without any server/browser issues.

export const CREW_TYPE_SYMBOLS = [
  { key: "hotshot", label: "Hotshot (IHC)", match: "hotshot", text: "IHC" },
  { key: "smokejumper", label: "Smokejumper", match: "smokejumper", emoji: "✈️" },
  { key: "rappel", label: "Rappel", match: "rappel", emoji: "🚁", badge: "R" },
  { key: "helitack", label: "Helitack", match: "helitack", emoji: "🚁" },
  { key: "engine", label: "Engine", match: "engine", emoji: "🚒" },
];

// Anything matching none of the above (including crews with no resource listed)
// gets a neutral grey dot.
export const OTHER_TYPE = { key: "other", label: "Other / not listed", dot: true };

// Return the symbol config for a crew, based on its (messy) resource text.
export function crewTypeFor(resource) {
  const text = (resource || "").toLowerCase();
  for (const t of CREW_TYPE_SYMBOLS) {
    if (text.includes(t.match)) return t;
  }
  return OTHER_TYPE;
}
