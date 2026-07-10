// Crew-type symbols for "symbol by crew type" mode.
//
// A crew's `resource` field can list SEVERAL types (with messy casing), so we
// pick ONE symbol per crew. Which one depends on whether a crew-type filter is
// active:
//   - No filter active: scan this list IN ORDER and use the first type whose
//     name appears in the resource text. Order = priority, so the most
//     specialized / notable type wins when a crew has several.
//   - Filter active: show the symbol for a type the user actually FILTERED FOR.
//     So if a location is both Helitack and IHC and the user filters to
//     Helitack, that pin shows the Helitack symbol — not the priority winner.
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
//
// `activeCrewTypes` is the list of crew-type filter values the user has checked
// (canonical strings like "Helitack", "Hotshot Crew"). When it's non-empty we
// only consider symbols the user actually filtered for, so each visible pin
// shows the type that MATCHES their filter rather than a fixed priority winner.
export function crewTypeFor(resource, activeCrewTypes = []) {
  const text = (resource || "").toLowerCase();

  if (activeCrewTypes.length) {
    const active = activeCrewTypes.map((c) => c.toLowerCase());
    // Among the types this crew has AND the user filtered for, we still walk
    // CREW_TYPE_SYMBOLS in priority order to break ties when several match
    // (e.g. the user checked both Helitack and Hotshot and this crew has both).
    for (const t of CREW_TYPE_SYMBOLS) {
      const filteredForThisType = active.some((f) => f.includes(t.match));
      if (filteredForThisType && text.includes(t.match)) return t;
    }
    // The crew passed the filter on a type we have no dedicated symbol for
    // (e.g. Fuels, Prevention) — show the neutral dot.
    return OTHER_TYPE;
  }

  // No crew-type filter active: fall back to fixed priority order.
  for (const t of CREW_TYPE_SYMBOLS) {
    if (text.includes(t.match)) return t;
  }
  return OTHER_TYPE;
}
