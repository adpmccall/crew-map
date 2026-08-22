"use client";

// Renders one crew's details inside the map click-popup. Kept in its own file
// so the layout is easy to read and adjust, separate from the map logic.

import { useEffect, useState } from "react";
import {
  withProtocol,
  isHttpUrl,
  crewDisplayName,
} from "../lib/formatting";
import { agencyLabel } from "../lib/agencies";
import PostingList from "./PostingList";

// Housing is stored as "YES" / "NO" / "" (blank). Blank means we simply don't
// know, so we show "Unknown" rather than implying "No".
function housingLabel(housing) {
  const h = (housing || "").toUpperCase();
  if (h === "YES") return "Yes";
  if (h === "NO") return "No";
  return "Unknown";
}

// One optional crew photo. These are hosted on Google My Maps, which means they
// are outside our control and may stop resolving at any time — so if the image
// fails to load we hide it completely rather than leave a broken-image icon
// sitting in the popup.
function CrewPhoto({ url, alt }) {
  const [failed, setFailed] = useState(false);

  // React may reuse this component for a different crew. Clearing the flag when
  // the URL changes stops one crew's broken photo from hiding the next crew's
  // working one.
  useEffect(() => setFailed(false), [url]);

  if (!url || failed) return null;

  return (
    <img
      className="crew-popup-photo"
      src={url}
      alt={alt}
      loading="lazy"
      // Don't hand our URL to the image host — a privacy win, and some hosts
      // block hotlinked images based on the referrer.
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
    />
  );
}

// One label/value pair in the detail list. Renders NOTHING when the value is
// blank. The Handcrew Atlas crews have no region, district, town or housing —
// the Atlas simply doesn't carry them — and an empty row next to a label reads
// as "broken" rather than "not known".
function Row({ label, value }) {
  if (!value || !String(value).trim()) return null;
  return (
    <>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </>
  );
}

// How many nearby jobs to list in the popup before we just show a "+N more"
// summary — keeps a crew near a busy hiring town from producing a giant popup.
const MAX_JOBS_SHOWN = 5;

// `nearbyJobs` is an array of { job, distanceMi }, already sorted closest-first
// by the map. It's empty (default) for crews with no open postings within range.
export default function CrewPopup({ crew, nearbyJobs = [] }) {
  // A real name when we have one — every Atlas row, plus the 124 curated rows
  // the Atlas matched. Otherwise the crew's base, clearly labelled as such.
  // Shared with the correction form via lib/formatting so a report and the pin
  // it came from always show the same title.
  const { name: crewName, known: nameIsKnown } = crewDisplayName(crew);

  // Trim-safe versions of the optional fields.
  const resource = crew.resource && crew.resource.trim() ? crew.resource : "Not listed";
  const website = crew.website ? crew.website.trim() : "";

  // Atlas rows may carry one photo. Ignore anything that isn't an http(s) URL.
  const photoUrl =
    crew.photo_url && isHttpUrl(crew.photo_url.trim()) ? crew.photo_url.trim() : "";

  // "TOWN, STATE" — but join only the parts we actually have. Atlas crews
  // typically have a state (reverse-geocoded) and no town, which used to render
  // as a stray leading comma: ", MONTANA".
  const location = [crew.town, crew.state]
    .map((v) => (v || "").trim())
    .filter(Boolean)
    .join(", ");

  return (
    <div className="crew-popup">
      <h3 className="crew-popup-title">{crewName}</h3>

      {/* Says the quiet part out loud rather than dressing the district up as a
          name. Muted and small — the gap should look deliberate, not broken. */}
      {!nameIsKnown && (
        <p className="crew-popup-noname">
          Crew name not on file — showing the base
        </p>
      )}

      {/* Renders nothing when there's no photo, or when the photo fails. */}
      <CrewPhoto url={photoUrl} alt={`${crewName} crew photo`} />

      <dl className="crew-popup-list">
        {/* Forest / Location / Region are skipped entirely when blank. Crew
            type and Housing always show, because "Not listed" and "Unknown"
            are genuinely useful answers rather than empty ones. */}

        {/* Agency leads: it's the single most identifying fact after the name,
            and it frames the rest. Forest and Region below only mean anything
            for Forest Service crews — a county or tribal crew has neither, so
            opening with "Forest" buried the one field that always applies.
            Matches the filter panel, where Agency also sits above Region. */}
        <Row label="Agency" value={agencyLabel(crew.agency)} />
        <Row label="Forest" value={crew.forest} />
        <Row label="Location" value={location} />
        <Row label="Crew type" value={resource} />
        <Row label="Region" value={crew.region} />

        <dt>Housing</dt>
        <dd>{housingLabel(crew.housing)}</dd>

        {/* Only show the website row when there's actually a website. */}
        {website && (
          <>
            <dt>Website</dt>
            <dd>
              <a
                href={withProtocol(website)}
                target="_blank"
                rel="noopener noreferrer"
              >
                {website}
              </a>
            </dd>
          </>
        )}
      </dl>

      {/* The way to tell us this crew is wrong. Gated by the SAME flag as every
          other door into the submission flow (the landing card, the map panel
          link) — one switch, so a review pause closes all of them together
          rather than leaving this one quietly open.
          It carries ?crew=<id>, which is what puts the form into correction
          mode and tells the reviewer which pin was clicked. */}
      {process.env.NEXT_PUBLIC_SUBMISSIONS_ENABLED === "true" && (
        <a className="crew-popup-report" href={`/submit?crew=${crew.id}`}>
          Something wrong with this one?
        </a>
      )}

      {/* Open postings near this crew.
          The wording is deliberate. This does NOT say the crew is hiring or
          that these are its jobs — USAJOBS gives us a duty-station TOWN, never
          a worksite, so any claim tying a posting to a specific crew would be
          more than the data supports. What IS supportable is the distance from
          this crew's coordinate to that town, which is what we show.
          Postings are their own markers on the map now; this list is the
          passive "what's around here" view for when you're already looking at
          a crew. Up to 5, closest first. */}
      {nearbyJobs.length > 0 && (
        <div className="crew-popup-jobs">
          <h4 className="crew-popup-jobs-title">Open postings near here</h4>
          <PostingList postings={nearbyJobs} max={MAX_JOBS_SHOWN} />
        </div>
      )}

    </div>
  );
}
