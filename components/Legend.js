"use client";

// A small legend, floating at the bottom-left of the map. It shows whatever the
// current symbolization mode is:
//   - "region": a colored dot per region (matches the CircleMarker pin colors)
//   - "type":   a symbol per crew type (matches the DivIcon markers)
// It reads the same config the pins use, so the legend always matches the map.

import { REGIONS } from "../lib/regions";
import { CREW_TYPE_SYMBOLS, OTHER_TYPE } from "../lib/crewTypes";

// Render one crew-type symbol the same way the map markers draw it, so the
// legend and the pins look identical.
function TypeSymbol({ t }) {
  if (t.dot) return <span className="type-dot" />;
  return (
    <span className="type-marker-inner">
      {t.text ? (
        <span className="type-text">{t.text}</span>
      ) : (
        <span className="type-emoji">{t.emoji}</span>
      )}
      {t.badge && <span className="type-badge">{t.badge}</span>}
    </span>
  );
}

export default function Legend({ mode }) {
  if (mode === "type") {
    return (
      <div className="legend">
        <div className="legend-title">Crew type</div>
        {[...CREW_TYPE_SYMBOLS, OTHER_TYPE].map((t) => (
          <div key={t.key} className="legend-row">
            <span className="legend-symbol">
              <TypeSymbol t={t} />
            </span>
            <span>{t.label}</span>
          </div>
        ))}
      </div>
    );
  }

  // Default: region mode.
  return (
    <div className="legend">
      <div className="legend-title">Region</div>
      {REGIONS.map((r) => (
        <div key={r.region} className="legend-row">
          <span className="legend-swatch" style={{ backgroundColor: r.color }} />
          <span>{r.label}</span>
        </div>
      ))}
    </div>
  );
}
