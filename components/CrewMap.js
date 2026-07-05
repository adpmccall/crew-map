"use client";

// The interactive map. This component:
//   1) fetches all crews (that have coordinates) from Supabase, and
//   2) draws one dot per crew on a free OpenStreetMap-tiled Leaflet map.
//
// It's a client component ("use client") and is loaded with ssr:false from
// app/page.js, because Leaflet only works in the browser.

import { useEffect, useState } from "react";
import { MapContainer, TileLayer, CircleMarker, Popup } from "react-leaflet";
import "leaflet/dist/leaflet.css"; // Leaflet's own styles — required to render.
import { supabase } from "../lib/supabaseClient";

// Every crew in the dataset is in the Western/Plains US, so center there.
const US_CENTER = [42, -113];
const US_ZOOM = 5;

export default function CrewMap() {
  const [crews, setCrews] = useState([]);
  const [status, setStatus] = useState("loading"); // "loading" | "ready" | "error"
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    // Fetch all crews that have coordinates. 440 rows is well under Supabase's
    // default 1000-row limit, so a single request returns them all.
    async function loadCrews() {
      const { data, error } = await supabase
        .from("crews")
        .select(
          "region, forest, district, town, state, resource, housing, notes, website, latitude, longitude"
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

  return (
    <div className="map-wrapper">
      {/* Small box over the map telling the user what's happening. */}
      <div className="map-status">
        {status === "loading" && "Loading crews…"}
        {status === "error" && `Couldn't load crews: ${errorMsg}`}
        {status === "ready" && `${crews.length} crews`}
      </div>

      <MapContainer center={US_CENTER} zoom={US_ZOOM} className="map-canvas">
        {/* Free OpenStreetMap tiles — no API key needed. The attribution link
            is required by OpenStreetMap's tile usage policy. */}
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        />

        {/* One dot per crew. We use CircleMarker (a drawn circle) instead of the
            default teardrop icon because Leaflet's marker IMAGES often fail to
            load through bundlers like Next.js; circles always render and are
            lighter for hundreds of points. */}
        {crews.map((crew, i) => (
          <CircleMarker
            key={i}
            center={[crew.latitude, crew.longitude]}
            radius={6}
            pathOptions={{
              color: "#b91c1c",
              fillColor: "#ef4444",
              fillOpacity: 0.8,
            }}
          >
            {/* A minimal popup for now — just enough to confirm the data is
                flowing. The full detail popup comes later in Phase 1. */}
            <Popup>
              <strong>{crew.forest}</strong>
              <br />
              {crew.town}, {crew.state}
            </Popup>
          </CircleMarker>
        ))}
      </MapContainer>
    </div>
  );
}
