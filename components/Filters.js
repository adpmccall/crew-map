"use client";

// The filter controls that float over the map. This is a "presentational"
// component: it holds NO state of its own. The parent (CrewMap) owns the current
// filter values and passes them in, plus handlers to update them.
//
// State / Region / Crew type are multi-select checkbox lists (check several at
// once — e.g. R1 and R2). Housing stays a single-select dropdown.

// A reusable multi-select dropdown for one facet. `options` is an array of
// { value, label }; `selected` is an array of the checked values.
//
// We use the native HTML <details>/<summary> element: <summary> is the closed
// "dropdown button" (showing the facet name and how many are checked), and the
// checkbox list appears below it when the user clicks to open it. This gives us
// a real dropdown with no extra library and no open/close state to manage.
function CheckboxGroup({ title, options, selected, onToggle }) {
  return (
    <details className="checkbox-dropdown">
      <summary>
        <span>
          {title}
          {selected.length > 0 ? ` (${selected.length})` : ""}
        </span>
      </summary>
      <div className="checkbox-list">
        {options.map((opt) => (
          <label key={opt.value} className="checkbox-row">
            <input
              type="checkbox"
              checked={selected.includes(opt.value)}
              onChange={() => onToggle(opt.value)}
            />
            <span>{opt.label}</span>
          </label>
        ))}
      </div>
    </details>
  );
}

export default function Filters({
  stateOptions, // [{ value, label }] for the State list
  regionOptions, // [{ value, label }] for the Region list
  crewTypeOptions, // [{ value, label }] for the Crew type list
  values, // current selections: { state:[], region:[], crewType:[], housing:"" }
  onToggle, // (key, value) => void  — toggle one checkbox in a multi-select facet
  onChange, // (key, value) => void  — set the single-select Housing filter
  onClear, // () => void  — reset all filters
  shownCount, // how many crews are currently visible
  totalCount, // how many crews there are in total
  mode, // how pins are symbolized: "region" | "type"
  onModeChange, // (mode) => void  — switch symbolization mode
}) {
  return (
    <div className="filter-panel">
      <div className="filter-count">
        Showing <strong>{shownCount}</strong> of {totalCount} crews
      </div>

      {/* Display mode: color pins by region, or draw a symbol per crew type.
          This changes how pins LOOK; it does not filter them. */}
      <label>
        Symbolize by
        <select value={mode} onChange={(e) => onModeChange(e.target.value)}>
          <option value="region">Region (color)</option>
          <option value="type">Crew type (symbol)</option>
        </select>
      </label>

      <CheckboxGroup
        title="State"
        options={stateOptions}
        selected={values.state}
        onToggle={(v) => onToggle("state", v)}
      />

      <CheckboxGroup
        title="Region"
        options={regionOptions}
        selected={values.region}
        onToggle={(v) => onToggle("region", v)}
      />

      <CheckboxGroup
        title="Crew type"
        options={crewTypeOptions}
        selected={values.crewType}
        onToggle={(v) => onToggle("crewType", v)}
      />

      <label>
        Housing
        <select
          value={values.housing}
          onChange={(e) => onChange("housing", e.target.value)}
        >
          {/* "Any" leaves housing unfiltered (blank/"unknown" crews still show).
              Picking Yes or No narrows to exactly that value. */}
          <option value="">Any</option>
          <option value="YES">Has housing</option>
          <option value="NO">No housing</option>
        </select>
      </label>

      <button type="button" className="filter-clear" onClick={onClear}>
        Clear filters
      </button>
    </div>
  );
}
