"use client";

// Renders one crew's details inside the map click-popup. Kept in its own file
// so the layout is easy to read and adjust, separate from the map logic.

import { useEffect, useState } from "react";

// Housing is stored as "YES" / "NO" / "" (blank). Blank means we simply don't
// know, so we show "Unknown" rather than implying "No".
function housingLabel(housing) {
  const h = (housing || "").toUpperCase();
  if (h === "YES") return "Yes";
  if (h === "NO") return "No";
  return "Unknown";
}

// Some website values are missing the "http://" part. Without a protocol the
// browser treats the link as relative (it would point back at our own site), so
// add https:// when there isn't one already.
function withProtocol(url) {
  if (/^https?:\/\//i.test(url)) return url;
  return `https://${url}`;
}

// Show a friendly distance: under a mile reads as "<1 mi" rather than "0 mi".
function formatDistance(miles) {
  return miles < 1 ? "<1 mi" : `${Math.round(miles)} mi`;
}

// Only ever load an image over http(s). `photo_url` comes from third-party
// (Atlas) data, so this keeps a stray value from becoming a surprise `src`.
function isHttpUrl(url) {
  return /^https?:\/\//i.test(url);
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
  // The Handcrew Atlas merge gave us a real `crew_name` for many crews (every
  // row the Atlas contributed, plus the 138 of ours it matched), so prefer it.
  // Crews the Atlas never matched still have no name, so we fall back to the
  // original behavior: the ranger district (e.g. "BUTTE RD"), then the forest.
  const crewName =
    (crew.crew_name && crew.crew_name.trim()) ||
    (crew.district && crew.district.trim()) ||
    (crew.forest && crew.forest.trim()) ||
    "Unnamed crew";

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

      {/* Renders nothing when there's no photo, or when the photo fails. */}
      <CrewPhoto url={photoUrl} alt={`${crewName} crew photo`} />

      <dl className="crew-popup-list">
        {/* Forest / Location / Region are skipped entirely when blank. Crew
            type and Housing always show, because "Not listed" and "Unknown"
            are genuinely useful answers rather than empty ones. */}
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

      {/* "Currently hiring" section — only appears when at least one open
          USAJOBS posting is within 50 miles of this crew. We label it plainly
          (these are nearby postings, not necessarily THIS crew's jobs) and link
          straight to USAJOBS to apply. Up to 5 are shown, closest first. */}
      {nearbyJobs.length > 0 && (
        <div className="crew-popup-jobs">
          <h4 className="crew-popup-jobs-title">
            Open USAJOBS postings within 50 mi
          </h4>
          <ul className="crew-popup-jobs-list">
            {nearbyJobs.slice(0, MAX_JOBS_SHOWN).map(({ job, distanceMi }) => (
              <li key={job.id} className="crew-popup-job">
                <div className="job-title">{job.title}</div>
                <div className="job-meta">
                  {job.town}, {job.state} · {formatDistance(distanceMi)}
                </div>
                {job.apply_url && (
                  <a
                    href={withProtocol(job.apply_url)}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Apply on USAJOBS →
                  </a>
                )}
              </li>
            ))}
          </ul>
          {nearbyJobs.length > MAX_JOBS_SHOWN && (
            <div className="job-more">
              +{nearbyJobs.length - MAX_JOBS_SHOWN} more nearby
            </div>
          )}
        </div>
      )}
    </div>
  );
}
