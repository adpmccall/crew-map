"use client";

// The standalone Hotshot Crew Hikes map, at "/hikes".
//
// WHY ITS OWN MAP, NOT A LAYER ON THE CREW MAP: decided 2026-09-27, after
// seeing a preview of the first test hike — the owner didn't want to crowd
// up the main map, which stays lean and crew-finding-first. This page
// carries the ~134 hotshot crew pins for CONTEXT (the hikes belong to real
// crews, so seeing them helps), but it is otherwise a separate, smaller tool.
// See crew-map-handoff.md section 7 for the full history.
//
// WHY EVERY HOTSHOT CREW SHOWS, NOT JUST ONES WITH A HIKE: same reasoning as
// `housing` showing "Unknown" instead of hiding blank rows elsewhere on this
// project — an honest "what's still missing" view is more useful than only
// showing coverage that exists. The pin color is what tells the real story:
//   - green  = at least one hike with real distance/elevation numbers
//              (computed from a submitted .gpx, or stated by the crew/a
//              contact — CrewPopup's hike section says which)
//   - blue   = we know this crew has a hike, we just don't have numbers yet
//              (the crowdsourcing target — click in and help fill it in)
//   - grey   = no hike on file at all yet
//
// NO FILTER PANEL. At this scale (~14 hikes at launch) a full copy of
// Filters.js would be overkill — CLAUDE.md's own "ship the simplest version
// first" rule. Add one later if the hike count grows enough to need it.

import { useEffect, useMemo, useRef, useState } from "react";
import {
  MapContainer,
  TileLayer,
  LayersControl,
  CircleMarker,
  Polyline,
  Popup,
  ZoomControl,
} from "react-leaflet";
import "leaflet/dist/leaflet.css";
import Link from "next/link";
import { supabase } from "../lib/supabaseClient";
import CrewPopup from "./CrewPopup";
import HikePopup from "./HikePopup";

// Pin colors = how complete a crew's hike data is. Changed 2026-11 (owner
// call): the line between green and blue used to be "has distance/elevation
// numbers"; it's now "has a .gpx track," because a track is what actually
// draws a line on this map. A crew that published its numbers but has no
// track (Lolo, Winema) is blue: known, and what's missing is the .gpx.
// Green was a dark forest green (#166534) until 2026-11, which vanished
// against tree canopy on the satellite layer. A brighter green plus the white
// outline below (see PIN_OUTLINE) reads on satellite AND street map.
const HAS_TRACK_COLOR = "#22c55e"; // green — at least one .gpx track on file
const NEEDS_GPX_COLOR = "#2563eb"; // blue — hike known, no .gpx track yet
const NO_HIKE_COLOR = "#9ca3af"; // grey — nothing on file yet

// Pin sizes. Grey pins are the majority and have nothing to show, so they're
// drawn much smaller, leaving the green/blue pins easy to spot and click.
const PIN_RADIUS = 7;
const NO_HIKE_PIN_RADIUS = 3;

// A white ring around the green and blue pins. On satellite imagery almost
// any solid color can blend into terrain somewhere; a white edge separates
// the pin from whatever is behind it (the same trick most map apps use).
// Grey pins skip it so they stay quiet in the background.
const PIN_OUTLINE = "#ffffff";

// Deliberately its own color, NOT the same as HAS_TRACK_COLOR above. The
// line used to reuse that green so pin and track matched, but a dark green
// line is hard to see against both the street map and (especially) satellite
// imagery -- see 2026-11 owner feedback. A bright orange-red reads clearly
// against pavement, forest canopy, and bare terrain alike, same logic as
// AllTrails/most trail-overlay apps use. Pin colors (data-completeness
// legend) are untouched by this.
const TRACK_LINE_COLOR = "#ff4500";

const US_CENTER = [39.5, -98.5];
const US_ZOOM = 4;
const POPUP_PAN_PADDING = [5, 72];

// How long the "focus on this crew" animation takes, in seconds. flyTo/
// flyToBounds ease pan+zoom together for a smooth, deliberate zoom-in,
// rather than the instant snap setView/fitBounds give by default -- see
// 2026-11 owner feedback asking for a slower zoom on pin click.
const FLY_DURATION = 1.5;

export default function HikesMap() {
  const [crews, setCrews] = useState([]);
  const [hikes, setHikes] = useState([]);
  const [status, setStatus] = useState("loading"); // loading | ready | error

  // react-leaflet v4 forwards this ref straight to the real Leaflet Map
  // instance, so mapRef.current.fitBounds(...) works directly -- no
  // useMap()/child-component indirection needed since we're calling it from
  // an event handler, not during render.
  const mapRef = useRef(null);

  useEffect(() => {
    async function load() {
      setStatus("loading");

      // Same "Hotshot Crew" match the main map's crew-type filter uses —
      // see lib/crewTypes.js / CLAUDE.md's note on `resource` being messy,
      // multi-value, and matched by "contains," not equality.
      //
      // Known gap, not a new bug: 4 real hotshot crews (Snake River,
      // Bitterroot, Idaho Panhandle, Redmond — see crew-map-handoff.md
      // section 7) have a `resource` value that doesn't contain the string
      // "Hotshot Crew" at all, so they're invisible to this exact query too,
      // the same as they are to the main map's own filter. Fixing that is
      // its own open item; this page isn't a new place that bug lives.
      const [crewsRes, hikesRes] = await Promise.all([
        supabase
          .from("crews")
          .select(
            "id, region, forest, district, town, state, resource, housing, notes, website, latitude, longitude, crew_name, photo_url, agency, contact_name, contact_role, contact_phone, contact_email"
          )
          .ilike("resource", "%Hotshot Crew%")
          .not("latitude", "is", null)
          .not("longitude", "is", null),
        supabase.from("hikes").select("*"),
      ]);

      if (crewsRes.error || hikesRes.error) {
        console.error(
          "Couldn't load the hikes map:",
          crewsRes.error?.message || hikesRes.error?.message
        );
        setStatus("error");
        return;
      }

      setCrews(crewsRes.data ?? []);
      setHikes(hikesRes.data ?? []);
      setStatus("ready");
    }

    load();
  }, []);

  // Group hikes by crew_id once, rather than filtering the whole `hikes`
  // array for every crew on every render — same idea as crewById in
  // CrewMap.js, just keyed the other direction.
  const hikesByCrew = useMemo(() => {
    const m = new Map();
    for (const h of hikes) {
      if (!m.has(h.crew_id)) m.set(h.crew_id, []);
      m.get(h.crew_id).push(h);
    }
    return m;
  }, [hikes]);

  // Only rows with a real submitted track get drawn as a line — everything
  // else (crew_published / contact_reported, with or without stats) has no
  // path to draw and shows up only through the crew pin's color + popup.
  const hikesWithTrack = useMemo(() => hikes.filter((h) => h.path), [hikes]);

  function colorFor(crewHikes) {
    if (crewHikes.some((h) => h.path)) return HAS_TRACK_COLOR;
    if (crewHikes.length > 0) return NEEDS_GPX_COLOR;
    return NO_HIKE_COLOR;
  }

  // Draw order = stacking order. Leaflet paints shapes in the order they're
  // added, and later ones sit ON TOP. So sort grey first, then blue, then
  // green: where pins overlap, the ones with hikes are on top and get the
  // click. (Hike lines are drawn after all pins, so they stay on top too.)
  const DRAW_RANK = { [NO_HIKE_COLOR]: 0, [NEEDS_GPX_COLOR]: 1, [HAS_TRACK_COLOR]: 2 };
  const crewsInDrawOrder = useMemo(
    () =>
      [...crews].sort(
        (a, b) =>
          DRAW_RANK[colorFor(hikesByCrew.get(a.id) || [])] -
          DRAW_RANK[colorFor(hikesByCrew.get(b.id) || [])]
      ),
    // Re-sort only when the data changes. (colorFor and DRAW_RANK just read
    // constants plus hikesByCrew, so these two cover everything.)
    [crews, hikesByCrew]
  );

  // Clicking a crew's pin used to just pop the marker's own popup open at
  // whatever zoom the map already happened to be at -- on a crew with a real
  // track, that routinely left the hike's own line (which can run well over
  // a mile from the pin) off-screen entirely. Now it frames the pin AND
  // every one of that crew's drawn tracks together. A crew with no track on
  // file (blue/grey) has nothing to fit but the pin, so it just centers on
  // it at a reasonable street-level zoom instead. Uses flyTo/flyToBounds
  // (not setView/fitBounds) so the zoom eases in smoothly over FLY_DURATION
  // seconds instead of snapping instantly.
  function focusCrew(crew, crewHikes) {
    const map = mapRef.current;
    if (!map) return;

    const points = [[crew.latitude, crew.longitude]];
    for (const h of crewHikes) {
      if (h.path) points.push(...h.path);
    }

    if (points.length > 1) {
      map.flyToBounds(points, {
        padding: [50, 50],
        maxZoom: 15,
        duration: FLY_DURATION,
      });
    } else {
      map.flyTo([crew.latitude, crew.longitude], 13, {
        duration: FLY_DURATION,
      });
    }
  }

  // Clicking a hike's line (not the crew pin) means "show me THIS hike," so
  // it frames only that one track -- no crew pin, no other tracks -- with
  // tighter padding and a higher zoom ceiling than focusCrew, so the line
  // fills the screen. Same flyToBounds + FLY_DURATION, so it eases in just
  // like the pin click does. 2026-11 owner request.
  function focusHike(hike) {
    const map = mapRef.current;
    if (!map || !hike.path?.length) return;

    if (hike.path.length > 1) {
      map.flyToBounds(hike.path, {
        padding: [30, 30],
        maxZoom: 17, // vs 15 for a crew pin: a short track can zoom in further
        duration: FLY_DURATION,
      });
    } else {
      // A one-point "track" has no extent to fit, so just center on it.
      map.flyTo(hike.path[0], 16, { duration: FLY_DURATION });
    }
  }

  return (
    <div className="map-wrapper">
      <div className="hikes-topbar">
        <Link href="/" className="hikes-back-link">
          ← Crew Map
        </Link>
        <h1 className="hikes-title">Hotshot Crew Hikes</h1>
      </div>

      {status === "loading" && (
        <div className="map-status">Loading hikes…</div>
      )}
      {status === "error" && (
        <div className="map-status map-status--error">
          <strong>The hikes map couldn&apos;t load.</strong>
          <span className="map-status-note">
            This is usually a connection problem rather than anything wrong
            with the site.
          </span>
        </div>
      )}

      {status === "ready" && (
        <div className="hikes-legend">
          <span>
            <span className="hikes-legend-dot" style={{ background: HAS_TRACK_COLOR }} />
            Has .gpx track
          </span>
          <span>
            <span className="hikes-legend-dot" style={{ background: NEEDS_GPX_COLOR }} />
            Known, needs .gpx data
          </span>
          <span>
            <span className="hikes-legend-dot" style={{ background: NO_HIKE_COLOR }} />
            No hike on file
          </span>
        </div>
      )}

      <MapContainer
        ref={mapRef}
        center={US_CENTER}
        zoom={US_ZOOM}
        className="map-canvas"
        zoomControl={false}
      >
        {/* Satellite is the default base layer (owner asked for this
            2026-11, to make hike tracks easier to see against real terrain),
            with Street Map available as a toggle via the layers control
            Leaflet renders automatically, top-right by default. */}
        <LayersControl position="topright">
          <LayersControl.BaseLayer checked name="Satellite">
            <TileLayer
              url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
              attribution="Tiles &copy; Esri &mdash; Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community"
              maxZoom={19}
            />
          </LayersControl.BaseLayer>
          <LayersControl.BaseLayer name="Street Map">
            <TileLayer
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            />
          </LayersControl.BaseLayer>
        </LayersControl>
        <ZoomControl position="bottomright" />

        {crewsInDrawOrder.map((crew) => {
          const crewHikes = hikesByCrew.get(crew.id) || [];
          const color = colorFor(crewHikes);
          return (
            <CircleMarker
              key={crew.id}
              center={[crew.latitude, crew.longitude]}
              radius={color === NO_HIKE_COLOR ? NO_HIKE_PIN_RADIUS : PIN_RADIUS}
              pathOptions={
                color === NO_HIKE_COLOR
                  ? { color, fillColor: color, fillOpacity: 0.85, weight: 1 }
                  : // `color` is the outline in Leaflet, `fillColor` the inside.
                    { color: PIN_OUTLINE, weight: 2, fillColor: color, fillOpacity: 1 }
              }
              eventHandlers={{
                click: () => focusCrew(crew, crewHikes),
              }}
            >
              <Popup autoPanPaddingTopLeft={POPUP_PAN_PADDING}>
                <CrewPopup crew={crew} hikes={crewHikes} compact />
              </Popup>
            </CircleMarker>
          );
        })}

        {hikesWithTrack.map((hike) => (
          <Polyline
            key={`hike-${hike.id}`}
            positions={hike.path}
            pathOptions={{ color: TRACK_LINE_COLOR, weight: 5, opacity: 0.9 }}
            eventHandlers={{
              click: () => focusHike(hike),
            }}
          >
            <Popup autoPanPaddingTopLeft={POPUP_PAN_PADDING}>
              <HikePopup
                hike={hike}
                crew={crews.find((c) => c.id === hike.crew_id)}
              />
            </Popup>
          </Polyline>
        ))}
      </MapContainer>
    </div>
  );
}
