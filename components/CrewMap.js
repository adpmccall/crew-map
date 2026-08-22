"use client";

// The interactive map. This component:
//   1) fetches all crews (that have coordinates) from Supabase,
//   2) lets the user narrow them with four filters, and
//   3) draws one dot per *visible* crew on a free OpenStreetMap-tiled map.
//
// It's a client component ("use client") and is loaded with ssr:false from
// app/page.js, because Leaflet only works in the browser.

import { useCallback, useEffect, useMemo, useState, Fragment } from "react";
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
import { agencyLabel, agencyOrder } from "../lib/agencies";
import { jobMatchesFilters, gradeOptionsFrom } from "../lib/jobFilters";
import Filters from "./Filters";
import CrewPopup from "./CrewPopup";
import PostingPopup from "./PostingPopup";
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
// Housing stays single-select, so it starts as "" ("Any").
const EMPTY_FILTERS = {
  state: [],
  region: [],
  crewType: [],
  agency: [],
  housing: "",
  // Hiring-layer filters. These narrow which POSTING PINS appear on the map.
  // They no longer touch which crews render — see lib/jobFilters.
  payGrade: [],
  appointment: [],
  salary: "",
};

// The posting pin: an amber teardrop marking a town with open USAJOBS postings.
//
// WHY A TEARDROP AND NOT A DOT. Crew pins in region mode are radius-6 filled
// circles, and R2 Rocky Mountain is #ff7f0e — close enough to this amber that a
// standalone amber DOT would read as an R2 crew. The silhouette is what keeps
// them apart: a pin sits ON the map, a crew dot sits IN it, and the two are
// never confused even at the same hue or at low zoom.
//
// When a town has more than one posting the count goes inside the head. That's
// the only content the pin ever carries — no glyph — which keeps it legible
// when the whole country is on screen.
const POSTING_PIN_AMBER = "#f59e0b";

function postingPinHtml(count) {
  // A standard 24x30 map-pin path: circular head, tapering to a point at the
  // bottom. The white stroke lifts it off dark forest tiles and water.
  const svg = `
    <svg width="24" height="30" viewBox="0 0 24 30" aria-hidden="true">
      <path d="M12 29C12 29 22.5 16.5 22.5 10.5A10.5 10.5 0 1 0 1.5 10.5C1.5 16.5 12 29 12 29Z"
            fill="${POSTING_PIN_AMBER}" stroke="#ffffff" stroke-width="2"
            stroke-linejoin="round"/>
    </svg>`;
  const badge = count > 1 ? `<span class="posting-pin-count">${count}</span>` : "";
  return `<span class="posting-pin">${svg}${badge}</span>`;
}

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

// Leaflet pans the map so an open popup fits on screen — but it measures against
// the raw viewport and knows nothing about our own floating UI. On mobile the
// "Filters" button and the "Showing N of N" chip sit across the top, so a tall
// popup gets panned flush to the top edge and its FIRST LINE — the crew name —
// ends up underneath them. Telling Leaflet to keep 72px of clearance at the top
// makes it stop short, so the title always lands below our chrome.
// [left, top]; the left value is Leaflet's default.
const POPUP_PAN_PADDING = [5, 72];

export default function CrewMap() {
  const [crews, setCrews] = useState([]);
  const [status, setStatus] = useState("loading"); // "loading" | "ready" | "error"
  // Set when the first load is taking long enough that silence starts to look
  // like breakage. Only changes the wording, never the behaviour.
  const [slowLoad, setSlowLoad] = useState(false);
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  // How pins are drawn: "region" = colored circles, "type" = crew-type symbols.
  const [mode, setMode] = useState("region");
  // Open USAJOBS postings (the "currently hiring" layer). Loaded separately from
  // crews and deliberately NON-blocking: if the jobs read fails, the crew map
  // still works — the hiring toggle just shows an empty state.
  const [jobs, setJobs] = useState([]);
  // Is the Hiring LAYER enabled? OFF by default, deliberately.
  //
  // It used to default on, and the posting pins are drawn ABOVE the crew pins
  // and are larger (see zIndexOffset below) — so the loudest thing on a cold
  // first load was job postings, on a map whose whole purpose is finding crews.
  // Crews first is the correct first impression; the toggle sits in the panel
  // for anyone who wants postings, and the landing page's hiring card links to
  // "?hiring=1" so arriving from THERE still lands on the layer switched on.
  const [hiringLayerOn, setHiringLayerOn] = useState(() => {
    // `window` doesn't exist while Next.js renders on the server. This whole
    // component is loaded with ssr:false so it always does here, but the guard
    // keeps the initializer honest and costs nothing.
    if (typeof window === "undefined") return false;
    return new URLSearchParams(window.location.search).get("hiring") === "1";
  });
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

  // Pulled out of the effect and wrapped in useCallback so the "Try again"
  // button can re-run exactly the same load without reloading the page.
  const loadCrews = useCallback(async () => {
    // Fetch all crews that have coordinates. 829 rows is still under Supabase's
    // default 1000-row limit, so a single request returns them all. (If the
    // table grows past 1000 this will silently truncate — page it then.)
    setStatus("loading");
    setSlowLoad(false);
    {
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
        // The raw message is for us, not for the visitor. A failed request here
        // produces strings like "TypeError: Failed to fetch" or a PostgREST code
        // — accurate, and meaningless to a firefighter looking for their crew.
        // It goes to the console; the screen gets plain words and a way to retry.
        console.error("Couldn't load crews:", error.message);
        setStatus("error");
        return;
      }
      setCrews(data ?? []);
      setStatus("ready");
    }
  }, []);

  useEffect(() => {
    loadCrews();
  }, [loadCrews]);

  // A dead Supabase host doesn't fail fast — DNS has to time out first, which
  // measured at roughly 40 seconds. For all that time the screen said only
  // "Loading crews…", which is indistinguishable from a hang. After 8 seconds
  // say so, so the wait reads as slow rather than broken.
  useEffect(() => {
    if (status !== "loading") return;
    const t = setTimeout(() => setSlowLoad(true), 8000);
    return () => clearTimeout(t);
  }, [status]);

  useEffect(() => {
    // Load open job postings from the public `jobs` table (same anon key, same
    // public-read pattern as crews — never the secret key).
    async function loadJobs() {
      const { data, error } = await supabase
        .from("jobs")
        // SELECT * on purpose. Supabase returns only the columns you name, and
        // an explicit list here bit us three times: it hid crew_name from the
        // popup, then every hiring filter control, then the pay grade — each
        // time silently, because a missing column is just `undefined` and the
        // build stays green. `jobs` is ~100 rows of small scalars, so the extra
        // payload is negligible next to a failure mode that costs an hour.
        // A new column added by refresh_jobs.py now just works.
        .select("*")
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
  // The postings that pass the Hiring-layer filters. The posting pins and the
  // crew popups' "near here" lists are both built from THIS list, so filtering
  // a posting out removes it from the map everywhere at once.
  const matchingJobs = useMemo(
    () => jobs.filter((job) => jobMatchesFilters(job, filters)),
    [jobs, filters]
  );

  // Options for the grade dropdown, derived from the postings themselves so the
  // list can't go stale as USAJOBS adds grades (GW officially spans 1-15).
  const gradeOptions = useMemo(() => gradeOptionsFrom(jobs), [jobs]);

  // Group the matching postings by their exact coordinate — which in practice
  // means BY TOWN, because both USAJOBS and our geocoder resolve a duty station
  // to a single town-centre point. Every posting in a town therefore lands on a
  // byte-identical lat/lng: in the current data 48 of 98 postings share a point
  // with at least one other, and Boise alone holds 6.
  //
  // So one pin per town, carrying a count, is the most precise honest marker
  // available. Nudging them apart to make each individually clickable would
  // fabricate a precision USAJOBS never gave us — the same overreach the old
  // crew rings made, in a new form.
  const postingTowns = useMemo(() => {
    const byPoint = new Map();
    for (const job of matchingJobs) {
      if (job.latitude == null || job.longitude == null) continue;
      const key = `${job.latitude},${job.longitude}`;
      if (!byPoint.has(key)) {
        byPoint.set(key, {
          key,
          position: [job.latitude, job.longitude],
          town: job.town,
          state: job.state,
          postings: [],
        });
      }
      byPoint.get(key).postings.push(job);
    }
    return [...byPoint.values()];
  }, [matchingJobs]);

  // One Leaflet icon per distinct count. Towns overwhelmingly hold 1-6
  // postings, so this is a handful of icons reused across every pin rather than
  // one built per marker.
  const postingIcons = useMemo(() => {
    const cache = new Map();
    return (count) => {
      if (!cache.has(count)) {
        cache.set(
          count,
          L.divIcon({
            className: "posting-marker", // drops Leaflet's default white box
            html: postingPinHtml(count),
            iconSize: [24, 30],
            iconAnchor: [12, 30], // the pin's POINT sits on the coordinate
            popupAnchor: [0, -28], // popup opens above the head
          })
        );
      }
      return cache.get(count);
    };
  }, []);

  // Which hiring filters have anything to work with. A control that can't match
  // anything is worse than no control — an empty "Pay grade" dropdown opens onto
  // nothing and reads as broken, and ticking "Permanent" when no posting carries
  // an appointment type would silently clear every posting pin.
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
      {status === "loading" && (
        <div className="map-status">
          {slowLoad ? "Still loading crews…" : "Loading crews…"}
          {slowLoad && (
            <span className="map-status-note">
              This is taking longer than usual. A slow connection will do it.
            </span>
          )}
        </div>
      )}
      {status === "error" && (
        <div className="map-status map-status--error">
          <strong>The map couldn&apos;t load.</strong>
          <span className="map-status-note">
            This is usually a connection problem rather than anything wrong with
            the site.
          </span>
          <button
            type="button"
            className="map-status-retry"
            onClick={loadCrews}
          >
            Try again
          </button>
        </div>
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

          {/* ZERO RESULTS. Without this the only feedback is the count reading
              "Showing 0 of 829" — and because the Hiring layer is separate and
              stays on, the map underneath is still covered in amber posting
              pins. A count of nought over a map full of markers reads as a
              broken filter, so say what happened and offer the way out.
              Only mention the amber pins when some are actually on screen,
              otherwise the explanation is more confusing than the thing it
              explains. */}
          {visibleCrews.length === 0 && !mobilePanelOpen && (
            <div className="map-empty" role="status">
              <strong>No crews match these filters.</strong>
              {hiringLayerOn && postingTowns.length > 0 && (
                <span className="map-empty-note">
                  The amber pins still showing are open job postings, not crews.
                </span>
              )}
              <button
                type="button"
                className="map-empty-clear"
                onClick={clearFilters}
              >
                Clear filters
              </button>
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
          // Open postings within 50 mi, for the passive list in this crew's
          // popup (undefined if none, or if the Hiring layer is off). Nothing
          // about the crew's own appearance depends on this any more.
          const nearbyJobs = hiringLayerOn
            ? nearbyJobsByCrew[crew.id]
            : undefined;
          const position = [crew.latitude, crew.longitude];

          if (mode === "type") {
            // Pass the active crew-type filter so a filtered pin shows the
            // symbol for the type the user filtered to (see crewTypeFor).
            const t = crewTypeFor(crew.resource, filters.crewType);
            return (
              <Fragment key={crew.id}>
                <Marker position={position} icon={typeIcons[t.key]}>
                  <Popup autoPanPaddingTopLeft={POPUP_PAN_PADDING}>
                    <CrewPopup crew={crew} nearbyJobs={nearbyJobs} />
                  </Popup>
                </Marker>
              </Fragment>
            );
          }

          const color = colorForRegion(crew.region);
          return (
            <Fragment key={crew.id}>
              <CircleMarker
                center={position}
                radius={6}
                pathOptions={{
                  color: color,
                  fillColor: color,
                  fillOpacity: 0.85,
                }}
              >
                <Popup autoPanPaddingTopLeft={POPUP_PAN_PADDING}>
                  <CrewPopup crew={crew} nearbyJobs={nearbyJobs} />
                </Popup>
              </CircleMarker>
            </Fragment>
          );
        })}

        {/* POSTING PINS — one per town with open postings, drawn last so they
            sit above the crew layer. These are their own objects on the map,
            not a property of any crew: a pin says "there are real openings in
            this town", which is exactly what USAJOBS told us and no more.
            The hiring-layer switch turns them off; the pay grade / salary /
            appointment filters decide which postings count toward each pin. */}
        {hiringLayerOn &&
          postingTowns.map((t) => (
            <Marker
              key={`posting-${t.key}`}
              position={t.position}
              icon={postingIcons(t.postings.length)}
              zIndexOffset={1000}
            >
              {/* maxHeight makes Leaflet scroll the popup internally instead of
                  letting it run off the screen. A town with 6 postings (Boise
                  today) is already taller than a laptop viewport, and the
                  precision note at the bottom was falling below the fold. */}
              <Popup maxHeight={320} autoPanPaddingTopLeft={POPUP_PAN_PADDING}>
                <PostingPopup
                  town={t.town}
                  state={t.state}
                  postings={t.postings}
                />
              </Popup>
            </Marker>
          ))}
      </MapContainer>
    </div>
  );
}
