"use client";

// The popup for a Hotshot Crew Hikes line: one crew's signature PT/
// conditioning hike, with the distance and elevation gain computed from the
// submitted .gpx track (see lib/gpx.js).
//
// Deliberately NOT a leaderboard and carries no per-person times -- see the
// Hotshot Crew Hikes proposal in crew-map-handoff.md for why: the owner was
// explicit that any competitive element should come from the crews/community
// themselves, not a built ranking mechanic.

import { crewDisplayName } from "../lib/formatting";

export default function HikePopup({ hike, crew }) {
  // Same fallback idea as crews with no crew_name: don't invent a title, just
  // say what we actually know. A hike with no submitted name is labelled with
  // the crew's own display name rather than left blank.
  const { name: crewName } = crew ? crewDisplayName(crew) : { name: "This crew" };
  const title = hike.hike_name?.trim() || `${crewName} PT Hike`;

  return (
    <div className="hike-popup">
      <h3 className="hike-popup-title">{title}</h3>
      {hike.hike_name && (
        <p className="hike-popup-crew">{crewName}</p>
      )}

      <dl className="hike-popup-list">
        <dt>Distance</dt>
        <dd>{hike.distance_miles} mi</dd>

        {hike.elevation_gain_ft != null && (
          <>
            <dt>Elevation gain</dt>
            <dd>{Math.round(hike.elevation_gain_ft).toLocaleString()} ft</dd>
          </>
        )}

        {hike.notes && (
          <>
            <dt>Notes</dt>
            <dd>{hike.notes}</dd>
          </>
        )}
      </dl>

      {hike.gpx_url && (
        <a
          className="hike-popup-download"
          href={hike.gpx_url}
          target="_blank"
          rel="noopener noreferrer"
        >
          Download the original .gpx
        </a>
      )}

      <p className="hike-popup-note">
        Distance and elevation gain are computed from the submitted track, not
        self-reported.
      </p>
    </div>
  );
}
