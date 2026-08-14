"use client";

// The interactive map. This component:
//   1) fetches all crews (that have coordinates) from Supabase,
//   2) lets the user narrow them with four filters, and
//   3) draws one dot per *visible* crew on a free OpenStreetMap-tiled map.
//
// It's a client component ("use client") and is loaded with ssr:false from
// app/page.js, because Leaflet only works in the browser.

import { useEffect, useMemo, useState, Fragment } from "react";
import {
  MapContainer,
  TileLayer,
  CircleMarker,
  Marker,
  Popup,
  ZoomControl,
} from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css"; // Leaflet's own styles — required to render.
import { supabase } from "../lib/supabaseClient";
import { colorForRegion, REGIONS } from "../lib/regions";
import { crewTypeFor, CREW_TYPE_SYMBOLS, OTHER_TYPE } from "../lib/crewTypes";
import { haversineMiles, HIRING_RADIUS_MI, hiringBandFor } from "../lib/proximity";
import { agencyLabel, agencyOrder } from "../lib/agencies";
import { jobMatchesFilters, gradeOptionsFrom } from "../lib/jobFilters";
import Filters from "./Filters";
import CrewPopup from "./CrewPopup";
import Legend from "./Legend";

// Open on the whole continental US, not just the West. This project's scope is
// nationwide, and we already hold crews in R8/R9/R10 (Eastern/Southern/Alaska)
// that a Western-centered view left off-screen on first load. Our pins are still
// mostly Western, so the East will look sparse — that's the real state of the
// data, and it's tracked as "Finish nationwide coverage" in TODO_NOW.md.
// Known limitation: Alaska sits outside this view; you have to pan to it.
const US_CENTER = [39.5, -98.5];
const US_ZOOM = 4;

// A small curated list of crew types for the dropdown. The raw `resource` field
// is messy (inconsistent casing/spacing, several types per crew), so instead of
// listing every distinct raw string we offer these canonical options and match
// them LOOSELY — case-insensitive "contains" — against the resource text.
const CREW_TYPES = [
  "Engine",
  "Hotshot Crew",
  "Helitack",
  "Rappel",
  "Smokejumper",
  "Fuels",
  "Prevention",
  "WFM",
  "IA Crew/Squad",
  "Type 2/2IA Handcrew",
  "Water Tender",
  "Dozer",
  // Two labels the Handcrew Atlas merge writes into `resource`. Without them in
  // this list those crews load and draw on the map but can't be filtered for.
  "Suppression Module",
  "Fire Effects",
];

// The "no filters applied" starting point. State/Region/Crew type are
// multi-select, so they start as empty arrays (no boxes checked = no narrowing).
// Housing stays single-select, so it starts as "" ("Any"). hiringNearby is the
// "currently hiring" toggle and starts off (false = don't narrow by jobs).
const EMPTY_FILTERS = {
  state: [],
  region: [],
  crewType: [],
  agency: [],
  housing: "",
  hiringNearby: false,
  // Hiring-layer filters. These narrow POSTINGS, not crews — a crew whose last
  // matching posting is filtered away simply loses its ring (see lib/jobFilters).
  payGrade: [],
  appointment: [],
  salary: "",
};

// The hiring ring is its own non-interactive layer, so it works IDENTICALLY in
// both "region" and "type" modes without changing the pin itself, and never
// steals clicks from the pin. Its APPEARANCE now depends on how far the nearest
// posting actually is — see HIRING_BANDS in lib/proximity.js for why.

// Builds the little HTML label shown inside a crew-type DivIcon marker (used in
// "symbol by crew type" mode). Mirrors how the Legend draws the same symbol.
function crewTypeIconHtml(t) {
  if (t.dot) return '<span class="type-dot"></span>';
  // Hotshot uses a small text chip; every other type is an SVG line glyph
  // (the same string the Legend renders, so pins and legend always match).
  // The chip's background is the type's own color, set inline.
  const main = t.text
    ? `<span class="type-text" style="background:${t.color}">${t.text}</span>`
    : t.svg;
  return `<span class="type-marker-inner">${main}</span>`;
}

// Display helper: turn an UPPERCASE name like "NEW MEXICO" into title case
// ("New Mexico") for labels. This only changes what's SHOWN — filtering still
// uses the original uppercase value, which is how `state` is stored in the data.
function titleCase(s) {
  return s.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function CrewMap() {
  const [crews, setCrews] = useState([]);
  const [status, setStatus] = useState("loading"); // "loading" | "ready" | "error"
  const [errorMsg, setErrorMsg] = useState("");
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  // How pins are drawn: "region" = colored circles, "type" = crew-type symbols.
  const [mode, setMode] = useState("region");
  // Open USAJOBS postings (the "currently hiring" layer). Loaded separately from
  // crews and deliberately NON-blocking: if the jobs read fails, the crew map
  // still works — the hiring toggle just shows an empty state.
  const [jobs, setJobs] = useState([]);
  // Is the Hiring LAYER enabled? On by default so rings show on load exactly as
  // before. Turning it off hides the rings, the popup jobs, and disables the
  // "hiring nearby" sub-filter — a clean layer on/off, separate from that filter.
  const [hiringLayerOn, setHiringLayerOn] = useState(true);
  // MOBILE ONLY: is the filter drawer open? Starts closed so the map is the
  // dominant thing on a phone. On desktop this is ignored — CSS keeps the panel
  // always visible there — so desktop behavior is unchanged.
  const [mobilePanelOpen, setMobilePanelOpen] = useState(false);

  // Build one Leaflet DivIcon per crew type ONCE and reuse it for every marker
  // of that type (making 440 icons individually would be wasteful). L.divIcon
  // only works in the browser, which is fine — this whole component is client-
  // only (loaded with ssr:false).
  const typeIcons = useMemo(() => {
    const icons = {};
    [...CREW_TYPE_SYMBOLS, OTHER_TYPE].forEach((t) => {
      icons[t.key] = L.divIcon({
        className: "type-marker", // replaces Leaflet's default white-box icon style
        html: crewTypeIconHtml(t),
        iconSize: [26, 26],
        iconAnchor: [13, 13], // center the icon on the crew's coordinate
        popupAnchor: [0, -12], // open the popup just above the icon
      });
    });
    return icons;
  }, []);

  useEffect(() => {
    // Fetch all crews that have coordinates. 829 rows is still under Supabase's
    // default 1000-row limit, so a single request returns them all. (If the
    // table grows past 1000 this will silently truncate — page it then.)
    async function loadCrews() {
      const { data, error } = await supabase
        .from("crews")
        .select(
          // crew_name and photo_url come from the Handcrew Atlas merge, and
          // agency from the agency backfill. They have to be listed here or the
          // UI would never see them — Supabase returns only the columns we ask
          // for, which is exactly how the popup lost crew_name once already.
          "id, region, forest, district, town, state, resource, housing, notes, website, latitude, longitude, crew_name, photo_url, agency"
        )
        .not("latitude", "is", null)
        .not("longitude", "is", null);

      if (error) {
        setErrorMsg(error.message);
        setStatus("error");
        return;
      }
      setCrews(data ?? []);
      setStatus("ready");
    }

    loadCrews();
  }, []);

  useEffect(() => {
    // Load open job postings from the public `jobs` table (same anon key, same
    // public-read pattern as crews — never the secret key).
    async function loadJobs() {
      const { data, error } = await supabase
        .from("jobs")
        .select(
          // Supabase returns ONLY the columns named here. The hiring filters
          // read pay_plan / grade_* / salary_* / appointment_type, so leaving
          // them off this list makes every one of those controls silently
          // vanish — the same trap that once hid crew_name from the popup.
          "id, title, agency, town, state, latitude, longitude, apply_url, close_date, last_refreshed, " +
            "pay_grade, pay_plan, grade_low, grade_high, salary_min, salary_max, salary_interval, " +
            "salary_min_annual, salary_max_annual, appointment_type, career_seasonal"
        )
        .not("latitude", "is", null)
        .not("longitude", "is", null);

      if (error) {
        // Non-fatal: log it and leave `jobs` empty so the map still works.
        console.warn("Couldn't load jobs:", error.message);
        return;
      }
      setJobs(data ?? []);
    }

    loadJobs();
  }, []);

  // Build the State and Region dropdown options FROM the data, so they always
  // match what's actually in the database. (useMemo just avoids recomputing
  // these on every render — they only change when `crews` changes.)
  const states = useMemo(
    () => [...new Set(crews.map((c) => c.state).filter(Boolean))].sort(),
    [crews]
  );
  const regions = useMemo(
    () => [...new Set(crews.map((c) => c.region).filter(Boolean))].sort(),
    [crews]
  );

  // Proximity match, done once in the browser: for each crew, the open jobs
  // within 50 miles, sorted closest-first. We store it as { [crewId]: [...] }
  // and only include crews that actually have a nearby job, so a simple lookup
  // tells us both "is this crew hiring?" and "which jobs to show in its popup".
  // 440 crews × ~32 jobs is a tiny amount of math; useMemo just avoids redoing
  // it on every render (only when crews or jobs change).
  // The postings that pass the Hiring-layer filters. Everything downstream —
  // rings, popup lists, the "hiring nearby" toggle — is built from THIS list
  // rather than from every job, which is what makes a filtered-out posting take
  // its ring with it.
  const matchingJobs = useMemo(
    () => jobs.filter((job) => jobMatchesFilters(job, filters)),
    [jobs, filters]
  );

  // Options for the grade dropdown, derived from the postings themselves so the
  // list can't go stale as USAJOBS adds grades (GW officially spans 1-15).
  const gradeOptions = useMemo(() => gradeOptionsFrom(jobs), [jobs]);

  // Which hiring filters have anything to work with. A control that can't match
  // anything is worse than no control — an empty "Pay grade" dropdown opens onto
  // nothing and reads as broken, and ticking "Permanent" when no posting carries
  // an appointment type would silently clear every ring.
  //
  // This isn't only a first-run concern: these columns are populated by
  // refresh_jobs.py, so any posting USAJOBS returns without them lands here too.
  // Each control appears once at least one posting can answer it.
  const jobFieldsAvailable = useMemo(
    () => ({
      appointment: jobs.some((j) => j.appointment_type),
      grade: gradeOptions.length > 0,
      salary: jobs.some(
        (j) => j.salary_max_annual != null || j.salary_min_annual != null
      ),
    }),
    [jobs, gradeOptions]
  );

  const nearbyJobsByCrew = useMemo(() => {
    const byCrew = {};
    if (!matchingJobs.length) return byCrew;
    for (const crew of crews) {
      const near = [];
      for (const job of matchingJobs) {
        const distanceMi = haversineMiles(
          crew.latitude,
          crew.longitude,
          job.latitude,
          job.longitude
        );
        if (distanceMi <= HIRING_RADIUS_MI) near.push({ job, distanceMi });
      }
      if (near.length) {
        near.sort((a, b) => a.distanceMi - b.distanceMi);
        byCrew[crew.id] = near;
      }
    }
    return byCrew;
  }, [crews, matchingJobs]);

  // The most recent `last_refreshed` across all jobs, formatted for display, so
  // users can see how fresh the "currently hiring" data is. Empty when no jobs.
  const jobsUpdatedLabel = useMemo(() => {
    let latest = 0;
    for (const job of jobs) {
      const t = Date.parse(job.last_refreshed);
      if (!Number.isNaN(t) && t > latest) latest = t;
    }
    if (!latest) return "";
    return new Date(latest).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  }, [jobs]);

  // Build the checkbox option lists as { value, label } pairs. The value is what
  // we filter on; the label is what the user sees. State/crew-type labels are
  // just the value; regions get a short label (e.g. "R1 · Northern") from the
  // shared REGIONS config, and appear in R1..R6 order.
  // value stays UPPERCASE (that's what we filter on, matching crew.state);
  // only the label is prettified for display.
  const stateOptions = useMemo(
    () => states.map((s) => ({ value: s, label: titleCase(s) })),
    [states]
  );
  const regionOptions = useMemo(
    () =>
      REGIONS.filter((r) => regions.includes(r.region)).map((r) => ({
        value: r.region,
        label: r.label,
      })),
    [regions]
  );
  const crewTypeOptions = useMemo(
    () => CREW_TYPES.map((c) => ({ value: c, label: c })),
    []
  );

  // Agency options, built from the data and ordered by lib/agencies.js rather
  // than alphabetically. Same gating idea as the region legend: only offer an
  // agency that at least one loaded crew actually has, so the list can't
  // advertise a category with nothing behind it. A row with no agency value
  // counts as "unknown" — the column is NOT NULL, but this keeps the UI honest
  // if that ever changes.
  const agencyOptions = useMemo(() => {
    const present = new Set(crews.map((c) => c.agency || "unknown"));
    return [...present]
      .sort((a, b) => agencyOrder(a) - agencyOrder(b))
      .map((value) => ({ value, label: agencyLabel(value) }));
  }, [crews]);

  // Apply all four filters. A crew is shown only if it passes EVERY active
  // filter. This runs in the browser over the already-loaded crews, so changing
  // a filter updates the pins instantly — no page reload, no new network call.
  const visibleCrews = useMemo(() => {
    return crews.filter((crew) => {
      // State / Region are multi-select. An empty array means "don't narrow on
      // this". Otherwise the crew must match ONE of the checked values (OR
      // within the facet). Different facets still combine with AND.
      if (filters.state.length && !filters.state.includes(crew.state)) {
        return false;
      }
      if (filters.region.length && !filters.region.includes(crew.region)) {
        return false;
      }

      // Agency is multi-select and matches exactly (unlike crew type, which is a
      // messy "contains" — agency is a single controlled value per crew). A crew
      // with no agency counts as "unknown", so checking "Unknown" finds them.
      if (
        filters.agency.length &&
        !filters.agency.includes(crew.agency || "unknown")
      ) {
        return false;
      }

      // Housing: single-select. Only narrows when YES or NO is picked. Blank
      // housing ("unknown") never equals YES/NO, so those crews drop out only
      // when the user explicitly asks for a housing value.
      if (
        filters.housing &&
        (crew.housing || "").toUpperCase() !== filters.housing
      ) {
        return false;
      }

      // Crew type is multi-select. The crew matches if its (messy) resource text
      // contains ANY of the checked types (case-insensitive). Crews with no
      // resource value drop out when any type is checked.
      if (filters.crewType.length) {
        const resource = (crew.resource || "").toLowerCase();
        const matchesAny = filters.crewType.some((ct) =>
          resource.includes(ct.toLowerCase())
        );
        if (!matchesAny) return false;
      }

      // "Hiring nearby" sub-filter: when the Hiring layer is on AND this filter
      // is checked, keep only crews with at least one open job within 50 mi.
      // If the layer is off, this never narrows (the overlay isn't active).
      if (hiringLayerOn && filters.hiringNearby && !nearbyJobsByCrew[crew.id]) {
        return false;
      }

      return true;
    });
  }, [crews, filters, nearbyJobsByCrew, hiringLayerOn]);

  // Toggle one value in a multi-select facet (state / region / crewType):
  // add it if it's not checked, remove it if it is.
  function toggleFilter(key, value) {
    setFilters((prev) => {
      const current = prev[key];
      const next = current.includes(value)
        ? current.filter((v) => v !== value)
        : [...current, value];
      return { ...prev, [key]: next };
    });
  }

  // Set a single-select filter (housing).
  function handleFilterChange(key, value) {
    setFilters((prev) => ({ ...prev, [key]: value }));
  }

  function clearFilters() {
    setFilters(EMPTY_FILTERS);
  }

  return (
    <div className="map-wrapper">
      {/* While loading or on error, show a small message box. Once ready, the
          filter panel (which also shows the crew count) takes its place. */}
      {status === "loading" && <div className="map-status">Loading crews…</div>}
      {status === "error" && (
        <div className="map-status">Couldn&apos;t load crews: {errorMsg}</div>
      )}
      {status === "ready" && (
        <>
          {/* MOBILE ONLY (hidden on desktop via CSS): a compact bar with a
              "Filters" button + the live crew count, shown when the drawer is
              closed. Keeps the map dominant while the count (filter feedback)
              stays visible. */}
          {!mobilePanelOpen && (
            <div className="mobile-controls">
              <button
                type="button"
                className="mobile-filters-btn"
                onClick={() => setMobilePanelOpen(true)}
                aria-expanded={false}
              >
                ☰ Filters
              </button>
              <span className="mobile-count">
                Showing {visibleCrews.length} of {crews.length}
              </span>
            </div>
          )}

          {/* Tap-to-close backdrop behind the open drawer (mobile only). */}
          {mobilePanelOpen && (
            <div
              className="mobile-scrim"
              onClick={() => setMobilePanelOpen(false)}
            />
          )}

          <Filters
            stateOptions={stateOptions}
            regionOptions={regionOptions}
            crewTypeOptions={crewTypeOptions}
            agencyOptions={agencyOptions}
            gradeOptions={gradeOptions}
            jobFieldsAvailable={jobFieldsAvailable}
            matchingJobCount={matchingJobs.length}
            totalJobCount={jobs.length}
            values={filters}
            onToggle={toggleFilter}
            onChange={handleFilterChange}
            onClear={clearFilters}
            shownCount={visibleCrews.length}
            totalCount={crews.length}
            mode={mode}
            onModeChange={setMode}
            hasJobs={jobs.length > 0}
            jobsUpdatedLabel={jobsUpdatedLabel}
            hiringLayerOn={hiringLayerOn}
            onHiringLayerChange={setHiringLayerOn}
            isOpen={mobilePanelOpen}
            onClose={() => setMobilePanelOpen(false)}
          />
          {/* `regions` is derived from the loaded crews, so the legend only
              lists regions that actually have pins. */}
          <Legend
            mode={mode}
            showHiring={hiringLayerOn && jobs.length > 0}
            presentRegions={regions}
          />
        </>
      )}

      {/* zoomControl={false} turns OFF Leaflet's default +/- control (which
          sits at top-left and would overlap the filter panel). We add our own
          below, positioned at the bottom-right instead. */}
      <MapContainer
        center={US_CENTER}
        zoom={US_ZOOM}
        className="map-canvas"
        zoomControl={false}
      >
        {/* Free OpenStreetMap tiles — no API key needed. The attribution link
            is required by OpenStreetMap's tile usage policy. */}
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        />

        {/* The +/- zoom control, moved out of the way to the bottom-right. */}
        <ZoomControl position="bottomright" />

        {/* One marker per VISIBLE crew. The popup (click for details) is the
            same in both modes; only the marker's appearance differs:
              - "region" mode: a CircleMarker colored by region (lib/regions.js).
                We use CircleMarker rather than the default teardrop icon because
                Leaflet's marker images often fail to load through bundlers like
                Next.js; circles always render and are easy to recolor.
              - "type" mode: a Marker with a DivIcon (emoji / text label) chosen
                by the crew's type (lib/crewTypes.js). DivIcons are HTML, so they
                also sidestep the missing-image problem. */}
        {visibleCrews.map((crew) => {
          // Open jobs within 50 mi of this crew (undefined if none, or if the
          // Hiring layer is turned off). Drives both the amber ring and the list
          // shown in the popup — so toggling the layer off removes both at once.
          const nearbyJobs = hiringLayerOn
            ? nearbyJobsByCrew[crew.id]
            : undefined;
          const position = [crew.latitude, crew.longitude];

          // The hiring ring: a separate, non-interactive CircleMarker drawn
          // FIRST so the real pin sits on top of it. Because it's the same in
          // both modes, the indicator looks consistent whether pins are region
          // circles or crew-type symbols.
          // nearbyJobs is sorted closest-first, so [0] is the nearest posting —
          // that distance decides how prominently the ring is drawn.
          const ring = nearbyJobs ? (
            <CircleMarker
              key={`ring-${crew.id}`}
              center={position}
              radius={12}
              interactive={false}
              pathOptions={hiringBandFor(nearbyJobs[0].distanceMi).pathOptions}
            />
          ) : null;

          if (mode === "type") {
            // Pass the active crew-type filter so a filtered pin shows the
            // symbol for the type the user filtered to (see crewTypeFor).
            const t = crewTypeFor(crew.resource, filters.crewType);
            return (
              <Fragment key={crew.id}>
                {ring}
                <Marker position={position} icon={typeIcons[t.key]}>
                  <Popup>
                    <CrewPopup crew={crew} nearbyJobs={nearbyJobs} />
                  </Popup>
                </Marker>
              </Fragment>
            );
          }

          const color = colorForRegion(crew.region);
          return (
            <Fragment key={crew.id}>
              {ring}
              <CircleMarker
                center={position}
                radius={6}
                pathOptions={{
                  color: color,
                  fillColor: color,
                  fillOpacity: 0.85,
                }}
              >
                <Popup>
                  <CrewPopup crew={crew} nearbyJobs={nearbyJobs} />
                </Popup>
              </CircleMarker>
            </Fragment>
          );
        })}
      </MapContainer>
    </div>
  );
}
