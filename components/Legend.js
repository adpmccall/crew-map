"use client";

// A small legend, floating at the bottom-left of the map. It shows whatever the
// current symbolization mode is:
//   - "region": a colored dot per region (matches the CircleMarker pin colors)
//   - "type":   a symbol per crew type (matches the DivIcon markers)
// It reads the same config the pins use, so the legend always matches the map.

import { useState } from "react";
import { REGIONS } from "../lib/regions";
import { CREW_TYPE_SYMBOLS, OTHER_TYPE } from "../lib/crewTypes";

// Render one crew-type symbol the same way the map markers draw it, so the
// legend and the pins look identical.
function TypeSymbol({ t }) {
  if (t.dot) return <span className="type-dot" />;
  return (
    <span className="type-marker-inner">
      {t.text ? (
        <span className="type-text" style={{ background: t.color }}>
          {t.text}
        </span>
      ) : (
        // t.svg is a trusted, hard-coded SVG string from lib/crewTypes.js (no
        // user input), rendered here so the legend glyph is byte-for-byte the
        // same markup the map draws.
        <span
          className="type-svg-wrap"
          dangerouslySetInnerHTML={{ __html: t.svg }}
        />
      )}
    </span>
  );
}

// The amber ring drawn around pins that have an open job nearby. Shown in the
// legend (in BOTH modes) so the indicator on the map is explained. Only rendered
// when there are jobs to match against.
function HiringLegendRow({ show }) {
  if (!show) return null;
  return (
    <div className="legend-row legend-hiring-row">
      <span className="legend-symbol">
        <span className="hiring-ring-swatch" />
      </span>
      <span>Hiring within 50 mi</span>
    </div>
  );
}

export default function Legend({ mode, showHiring }) {
  // Collapse state is for MOBILE only (starts collapsed there). On desktop, CSS
  // keeps the body always visible and hides the caret, so this has no visible
  // effect — desktop behavior is unchanged.
  const [open, setOpen] = useState(false);

  const title = mode === "type" ? "Crew type" : "Region";

  // The rows differ by mode; the surrounding structure (title + body) is shared
  // so the collapse behavior works the same in both modes.
  const rows =
    mode === "type"
      ? [...CREW_TYPE_SYMBOLS, OTHER_TYPE].map((t) => (
          <div key={t.key} className="legend-row">
            <span className="legend-symbol">
              <TypeSymbol t={t} />
            </span>
            <span>{t.label}</span>
          </div>
        ))
      : REGIONS.map((r) => (
          <div key={r.region} className="legend-row">
            <span
              className="legend-swatch"
              style={{ backgroundColor: r.color }}
            />
            <span>{r.label}</span>
          </div>
        ));

  return (
    <div className={`legend${open ? " legend--open" : ""}`}>
      {/* Tapping the title expands/collapses on mobile; the caret only shows
          there. On desktop the title looks and behaves as before. */}
      <button
        type="button"
        className="legend-title"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
        <span>{title}</span>
        <span className="legend-toggle-caret" aria-hidden="true">
          {open ? "▾" : "▸"}
        </span>
      </button>

      <div className="legend-body">
        {rows}
        <HiringLegendRow show={showHiring} />
      </div>
    </div>
  );
}
