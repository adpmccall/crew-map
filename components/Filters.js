"use client";

// The control panel that floats over the map. This is a "presentational"
// component: it holds NO state of its own. The parent (CrewMap) owns the current
// values and passes them in, plus handlers to update them.
//
// STRUCTURE — layers, not tabs. The map stays the landing page; the panel is
// organized into stacked, collapsible LAYERS, each with its own controls and its
// own honest data-source label:
//   • Crews  — the always-on base layer (symbolize mode + the four filters).
//   • Hiring — a toggleable overlay of posting pins, with filters for which
//     postings count (appointment / pay grade / salary).
// Adding a third layer later (e.g. Housing) is just another <LayerSection> block.

// The Hiring layer's filter vocabulary lives in lib/jobFilters.js alongside the
// matching logic, so the options shown here and the rules that apply them can
// never drift apart.
import { APPOINTMENT_FILTERS, SALARY_THRESHOLDS } from "../lib/jobFilters";

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

// One collapsible layer section. Reusable so every layer looks the same and a
// new layer is a clean addition, not a rewrite.
//   title       — the layer name shown in the header.
//   defaultOpen — expanded on load? (constant per layer; kept uncontrolled after
//                 mount so the user's own expand/collapse isn't reset on every
//                 filter change).
//   sourceLabel — the honest data-source / freshness line (React node or string).
//   toggle      — OPTIONAL { checked, onChange, disabled }. When given, the header
//                 shows an on/off switch (a toggleable overlay layer). When
//                 omitted, the layer is the always-on base layer and shows a
//                 "base" tag instead.
//   children    — the layer's controls.
function LayerSection({ title, defaultOpen, sourceLabel, toggle, children }) {
  return (
    <details className="layer" open={defaultOpen}>
      <summary className="layer-summary">
        <span className="layer-title">{title}</span>
        {toggle ? (
          // Clicking the switch must toggle the LAYER, not expand/collapse the
          // section — so we stop the click from reaching <summary>.
          <span className="layer-switch" onClick={(e) => e.stopPropagation()}>
            <input
              type="checkbox"
              checked={toggle.checked}
              disabled={toggle.disabled}
              onChange={(e) => toggle.onChange(e.target.checked)}
              aria-label={`Show ${title} layer`}
              title={`Show/hide the ${title} layer`}
            />
          </span>
        ) : (
          <span className="layer-base-tag">base</span>
        )}
      </summary>
      <div className="layer-body">
        {sourceLabel && <div className="layer-source">{sourceLabel}</div>}
        {children}
      </div>
    </details>
  );
}

export default function Filters({
  stateOptions, // [{ value, label }] for the State list
  regionOptions, // [{ value, label }] for the Region list
  crewTypeOptions, // [{ value, label }] for the Crew type list
  agencyOptions, // [{ value, label }] for the Agency list
  gradeOptions, // [{ value, label }] for the Pay grade list (from the postings)
  jobFieldsAvailable, // { appointment, grade, salary } — which hiring filters have data
  matchingJobCount, // postings passing the hiring-layer filters
  totalJobCount, // postings loaded in total
  values, // current selections: { state:[], region:[], crewType:[], agency:[], housing:"", payGrade:[], appointment:[], salary:"" }
  onToggle, // (key, value) => void  — toggle one checkbox in a multi-select facet
  onChange, // (key, value) => void  — set a single-select filter (housing / salary)
  onClear, // () => void  — reset all filters
  shownCount, // how many crews are currently visible
  totalCount, // how many crews there are in total
  mode, // how pins are symbolized: "region" | "type"
  onModeChange, // (mode) => void  — switch symbolization mode
  hasJobs, // boolean — did any open USAJOBS postings load?
  jobsUpdatedLabel, // e.g. "Jul 17, 2026" — when the jobs data was last refreshed
  hiringLayerOn, // boolean — is the Hiring layer enabled (posting pins shown)?
  onHiringLayerChange, // (on) => void  — turn the whole Hiring layer on/off
  isOpen, // MOBILE ONLY: is the drawer open? (desktop ignores this — always shown)
  onClose, // MOBILE ONLY: () => void — close the drawer
}) {
  return (
    <div className={`filter-panel${isOpen ? " is-open" : ""}`}>
      {/* MOBILE ONLY (hidden on desktop): drawer header with a close button. */}
      <div className="panel-mobile-header">
        <span>Filters</span>
        <button
          type="button"
          className="panel-close"
          onClick={onClose}
          aria-label="Close filters"
        >
          ✕
        </button>
      </div>

      <div className="filter-count">
        Showing <strong>{shownCount}</strong> of {totalCount} crews
      </div>

      {/* LAYER: Crews — the always-on base layer. */}
      <LayerSection
        title="Crews"
        defaultOpen={true}
        sourceLabel={`${totalCount} crews`}
      >
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

        {/* Agency sits ABOVE the region filter on purpose: region only applies
            to Forest Service crews, so picking an agency first is the natural
            order. Crews whose agency couldn't be determined appear under
            "Unknown" rather than being quietly left out of the list. */}
        <CheckboxGroup
          title="Agency"
          options={agencyOptions}
          selected={values.agency}
          onToggle={(v) => onToggle("agency", v)}
        />

        <CheckboxGroup
          // "Forest Service region" not just "Region": R1-R10 is a USFS concept,
          // and now that the map carries BLM/NPS/state/county/tribal crews too,
          // a bare "Region" would imply every crew has one. They don't.
          title="Forest Service region"
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
      </LayerSection>

      {/* LAYER: Hiring — a toggleable overlay. Collapsed by default to keep the
          panel compact; ENABLED by default so rings show on load as before. */}
      <LayerSection
        title="Hiring"
        defaultOpen={false}
        toggle={{
          checked: hiringLayerOn,
          onChange: onHiringLayerChange,
          disabled: !hasJobs,
        }}
        sourceLabel={
          hasJobs ? (
            `Open USAJOBS postings · updated ${jobsUpdatedLabel}`
          ) : (
            <span className="layer-source-muted">
              No open USAJOBS postings right now
            </span>
          )
        }
      >

        {/* These three narrow the POSTINGS, not the crews. A crew whose last
            matching posting is filtered away loses its ring — same idea as any
            other filter here: it narrows what you see. */}
        {/* Each control only appears when at least one posting can answer it —
            see jobFieldsAvailable in CrewMap. An empty dropdown reads as broken,
            and a filter that can only ever match nothing is worse than absent. */}
        {jobFieldsAvailable?.appointment && (
          <CheckboxGroup
            title="Appointment"
            options={APPOINTMENT_FILTERS}
            selected={values.appointment}
            onToggle={(v) => onToggle("appointment", v)}
          />
        )}

        {jobFieldsAvailable?.grade && (
          <CheckboxGroup
            title="Pay grade"
            options={gradeOptions}
            selected={values.payGrade}
            onToggle={(v) => onToggle("payGrade", v)}
          />
        )}

        {jobFieldsAvailable?.salary && (
          <label>
            Salary at least
            <select
              value={values.salary}
              onChange={(e) => onChange("salary", e.target.value)}
            >
              {/* Compared against the posting's annualized top-of-range, so
                  hourly and yearly postings are judged on one axis. The posted
                  figure and its interval are kept untouched in the data; the
                  popup just doesn't surface pay yet. */}
              <option value="">Any</option>
              {SALARY_THRESHOLDS.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>
        )}

        {/* Honest count whenever these filters are actually narrowing something,
            so it's obvious the posting pins thinned out because of a filter
            and not because the postings disappeared. */}
        {hasJobs && matchingJobCount !== totalJobCount && (
          <div className="layer-source">
            {matchingJobCount} of {totalJobCount} postings match
          </div>
        )}

      </LayerSection>

      <button type="button" className="filter-clear" onClick={onClear}>
        Clear filters
      </button>

      {/* The public submission entry point, behind an env flag.
          NEXT_PUBLIC_SUBMISSIONS_ENABLED must be the string "true" for this to
          appear. It exists so the feature can be reviewed on a deploy before
          anyone can find it, and so it can be switched off from Vercel in
          seconds if submissions ever turn into a problem — no code change, no
          redeploy of the map itself. The /submit route stays reachable by URL
          either way; this only controls discoverability. */}
      {process.env.NEXT_PUBLIC_SUBMISSIONS_ENABLED === "true" && (
        <a className="filter-submit-link" href="/submit">
          + Add a missing crew
        </a>
      )}

      {/* Way back to the landing page. Ungated — unlike the submission form,
          the landing page always exists, and without this the only route back
          is editing the URL. */}
      <a className="filter-about-link" href="/">
        About this map
      </a>
    </div>
  );
}
