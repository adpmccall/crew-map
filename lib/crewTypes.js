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

// ---- Vector glyphs (replaces the old multicolor emoji markers) ----
//
// Each symbolized crew type gets one clean, hand-drawn SVG line glyph instead of
// an emoji. Why line icons (stroke, no fill):
//   - every glyph has the SAME visual weight automatically (one stroke width),
//   - they stay legible when small, so dense clusters (CA, PNW) don't turn to mush.
// Each type also gets its OWN color, so in a dense cluster you can tell types
// apart by color AND shape, not shape alone (silhouettes blur when small).
// The exact same SVG STRING is used by the map's DivIcon and by the Legend, so
// the pins and the legend can never drift apart.

// Per-type colors. Chosen to be clearly DISTINCT from the 6 region colors
// (lib/regions.js — blue/orange/green/purple/red/teal) so crew-type mode never
// visually reads like region mode. This is a deliberately different family:
// graphite + indigo + fuchsia + goldenrod + deep-pink (no bright region hue).
// The two look-alike silhouettes (Helitack vs Rappel) get the most contrasting
// colors on purpose, since their shapes are the hardest to tell apart.
const CREW_COLORS = {
  hotshot: "#111827", // graphite / near-black (the IHC chip)
  engine: "#4f46e5", // indigo
  helitack: "#c026d3", // fuchsia
  rappel: "#a16207", // goldenrod (max contrast vs Helitack's fuchsia)
  smokejumper: "#db2777", // deep pink
};

// Wrap inner SVG shapes in a consistent 20px line-icon frame, stroked in the
// type's color. 20px is a touch bigger than the emoji-replacement 16px (more
// visible) but still small enough to keep dense clusters (CA/PNW) readable.
function lineGlyph(inner, color) {
  return (
    `<svg class="type-svg" viewBox="0 0 24 24" width="20" height="20" ` +
    `fill="none" stroke="${color}" stroke-width="2" ` +
    `stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">` +
    inner +
    `</svg>`
  );
}

// A helicopter body + rotor, shared by Helitack and Rappel (Rappel adds a rope).
const HELI_BODY =
  '<path d="M2 7.5H14"/>' + // main rotor
  '<path d="M8 7.5V9.5"/>' + // mast
  '<ellipse cx="8" cy="12" rx="5" ry="2.5"/>' + // cabin
  '<path d="M13 12H20"/>' + // tail boom
  '<path d="M20 10V14"/>' + // tail rotor
  '<path d="M5 15H11"/>'; // landing skid

// Rappel's distinguishing mark: a thin vertical line dropping straight down
// from the helicopter — the crew deploys on a rope. It reads as "helicopter with
// a line" at small size: clearly related to Helitack but distinguishable. The
// line overrides the glyph's stroke-width so it looks thin next to the body.
const RAPPEL_ROPE = '<path d="M8 15V21" stroke-width="1.1"/>';

export const CREW_TYPE_SYMBOLS = [
  // Hotshot keeps the "IHC" text chip — it reads clearly and is well recognized.
  { key: "hotshot", label: "Hotshot (IHC)", match: "hotshot", text: "IHC", color: CREW_COLORS.hotshot },
  // Smokejumper: a parachute with a jumper below.
  {
    key: "smokejumper",
    label: "Smokejumper",
    match: "smokejumper",
    color: CREW_COLORS.smokejumper,
    svg: lineGlyph(
      '<path d="M4 11a8 8 0 0 1 16 0"/>' + // canopy dome
        '<path d="M4 11 12 16"/>' + // suspension line (left)
        '<path d="M20 11 12 16"/>' + // suspension line (right)
        '<path d="M12 11V16"/>' + // suspension line (center)
        '<circle cx="12" cy="17.5" r="1.2"/>', // jumper
      CREW_COLORS.smokejumper
    ),
  },
  // Rappel: the helicopter glyph plus a thin roped figure — a rappeller.
  {
    key: "rappel",
    label: "Rappel",
    match: "rappel",
    color: CREW_COLORS.rappel,
    svg: lineGlyph(HELI_BODY + RAPPEL_ROPE, CREW_COLORS.rappel),
  },
  // Helitack: the plain helicopter glyph.
  {
    key: "helitack",
    label: "Helitack",
    match: "helitack",
    color: CREW_COLORS.helitack,
    svg: lineGlyph(HELI_BODY, CREW_COLORS.helitack),
  },
  // Engine: a side-view fire engine (box body + cab + two wheels).
  {
    key: "engine",
    label: "Engine",
    match: "engine",
    color: CREW_COLORS.engine,
    svg: lineGlyph(
      '<path d="M2.5 8h9v6h-9z"/>' + // box body
        '<path d="M11.5 9h4l3 3v2h-7z"/>' + // cab with slanted front
        '<circle cx="6" cy="16" r="1.5"/>' + // rear wheel
        '<circle cx="15" cy="16" r="1.5"/>', // front wheel
      CREW_COLORS.engine
    ),
  },
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
