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
import { haversineMiles, HIRING_RADIUS_MI } from "../lib/proximity";
import Filters from "./Filters";
import CrewPopup from "./CrewPopup";
import Legend from "./Legend";

// Every crew in the dataset is in the Western/Plains US, so center there.
const US_CENTER = [42, -113];
const US_ZOOM = 5;

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
];

// The "no filters applied" starting point. State/Region/Crew type are
// multi-select, so they start as empty arrays (no boxes checked = no narrowing).
// Housing stays single-select, so it starts as "" ("Any"). hiringNearby is the
// "currently hiring" toggle and starts off (false = don't narrow by jobs).
const EMPTY_FILTERS = {
  state: [],
  region: [],
  crewType: [],
  housing: "",
  hiringNearby: false,
};

// Amber ring drawn behind a pin that has an open job within 50 mi. It's its own
// non-interactive layer, so it works IDENTICALLY in both "region" and "type"
// modes without changing the pin itself, and never steals clicks from the pin.
const HIRING_RING_OPTIONS = {
  color: "#f59e0b", // amber — reads as "opportunity", distinct from region colors
  weight: 3,
  opacity: 0.9,
  fill: false,
  interactive: false,
};

// Builds the little HTML label shown inside a crew-type DivIcon marker (used in
// "symbol by crew type" mode). Mirrors how the Legend draws the same symbol.
function crewTypeIconHtml(t) {
  if (t.dot) return '<span class="type-dot"></span>';
  const main = t.text
    ? `<span class="type-text">${t.text}</span>`
    : `<span class="type-emoji">${t.emoji}</span>`;
  const badge = t.badge ? `<span class="type-badge">${t.badge}</span>` : "";
  return `<span class="type-marker-inner">${main}${badge}</span>`;
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
    // Fetch all crews that have coordinates. 440 rows is well under Supabase's
    // default 1000-row limit, so a single request returns them all.
    async function loadCrews() {
      const { data, error } = await supabase
        .from("crews")
        .select(
          "id, region, forest, district, town, state, resource, housing, notes, website, latitude, longitude"
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
    // public-read pattern as crews — never the secret key). We only need the
    // fields for matching (lat/lng) and for the popup/label.
    async function loadJobs() {
      const { data, error } = await supabase
        .from("jobs")
        .select(
          "id, title, agency, town, state, latitude, longitude, apply_url, close_date, last_refreshed"
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
  const nearbyJobsByCrew = useMemo(() => {
    const byCrew = {};
    if (!jobs.length) return byCrew;
    for (const crew of crews) {
      const near = [];
      for (const job of jobs) {
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
  }, [crews, jobs]);

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
  const stateOptions = useMemo(
    () => states.map((s) => ({ value: s, label: s })),
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

      // "Currently hiring" toggle: when on, keep only crews that have at least
      // one open job within 50 mi. Crews with no nearby job drop out.
      if (filters.hiringNearby && !nearbyJobsByCrew[crew.id]) {
        return false;
      }

      return true;
    });
  }, [crews, filters, nearbyJobsByCrew]);

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
          <Filters
            stateOptions={stateOptions}
            regionOptions={regionOptions}
            crewTypeOptions={crewTypeOptions}
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
          />
          <Legend mode={mode} showHiring={jobs.length > 0} />
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
          // Open jobs within 50 mi of this crew (undefined if none). Drives both
          // the amber ring and the list shown in the popup.
          const nearbyJobs = nearbyJobsByCrew[crew.id];
          const position = [crew.latitude, crew.longitude];

          // The hiring ring: a separate, non-interactive CircleMarker drawn
          // FIRST so the real pin sits on top of it. Because it's the same in
          // both modes, the indicator looks consistent whether pins are region
          // circles or crew-type symbols.
          const ring = nearbyJobs ? (
            <CircleMarker
              key={`ring-${crew.id}`}
              center={position}
              radius={12}
              interactive={false}
              pathOptions={HIRING_RING_OPTIONS}
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
