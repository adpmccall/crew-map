"use client";

// Renders one crew's details inside the map click-popup. Kept in its own file
// so the layout is easy to read and adjust, separate from the map logic.

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

// How many nearby jobs to list in the popup before we just show a "+N more"
// summary — keeps a crew near a busy hiring town from producing a giant popup.
const MAX_JOBS_SHOWN = 5;

// `nearbyJobs` is an array of { job, distanceMi }, already sorted closest-first
// by the map. It's empty (default) for crews with no open postings within range.
export default function CrewPopup({ crew, nearbyJobs = [] }) {
  // This dataset has no dedicated "crew name" field. Each crew is identified by
  // its ranger district (e.g. "BUTTE RD") within a forest, so we use the
  // district as the crew name — falling back to the forest when it's blank.
  const crewName = crew.district && crew.district.trim() ? crew.district : crew.forest;

  // Trim-safe versions of the optional fields.
  const resource = crew.resource && crew.resource.trim() ? crew.resource : "Not listed";
  const website = crew.website ? crew.website.trim() : "";

  return (
    <div className="crew-popup">
      <h3 className="crew-popup-title">{crewName}</h3>

      <dl className="crew-popup-list">
        <dt>Forest</dt>
        <dd>{crew.forest}</dd>

        <dt>Location</dt>
        <dd>
          {crew.town}, {crew.state}
        </dd>

        <dt>Crew type</dt>
        <dd>{resource}</dd>

        <dt>Region</dt>
        <dd>{crew.region}</dd>

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
