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

import { useEffect, useMemo, useState } from "react";
import {
  MapContainer,
  TileLayer,
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

const HAS_STATS_COLOR = "#166534"; // same green as the submitted-track line
const KNOWN_NO_STATS_COLOR = "#2563eb"; // blue — "help us fill this in"
const NO_HIKE_COLOR = "#9ca3af"; // grey — nothing on file yet

const US_CENTER = [39.5, -98.5];
const US_ZOOM = 4;
const POPUP_PAN_PADDING = [5, 72];

export default function HikesMap() {
  const [crews, setCrews] = useState([]);
  const [hikes, setHikes] = useState([]);
  const [status, setStatus] = useState("loading"); // loading | ready | error

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
    if (crewHikes.some((h) => h.distance_miles != null)) return HAS_STATS_COLOR;
    if (crewHikes.length > 0) return KNOWN_NO_STATS_COLOR;
    return NO_HIKE_COLOR;
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
            <span className="hikes-legend-dot" style={{ background: HAS_STATS_COLOR }} />
            Has real numbers
          </span>
          <span>
            <span className="hikes-legend-dot" style={{ background: KNOWN_NO_STATS_COLOR }} />
            Known, needs numbers
          </span>
          <span>
            <span className="hikes-legend-dot" style={{ background: NO_HIKE_COLOR }} />
            No hike on file
          </span>
        </div>
      )}

      <MapContainer center={US_CENTER} zoom={US_ZOOM} className="map-canvas" zoomControl={false}>
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        />
        <ZoomControl position="bottomright" />

        {crews.map((crew) => {
          const crewHikes = hikesByCrew.get(crew.id) || [];
          return (
            <CircleMarker
              key={crew.id}
              center={[crew.latitude, crew.longitude]}
              radius={6}
              pathOptions={{
                color: colorFor(crewHikes),
                fillColor: colorFor(crewHikes),
                fillOpacity: 0.85,
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
            pathOptions={{ color: HAS_STATS_COLOR, weight: 4, opacity: 0.85 }}
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
