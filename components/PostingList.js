"use client";

// One USAJOBS posting, rendered the same way everywhere it appears.
//
// It shows up in two places now:
//   1. the popup on a posting pin — every opening in that town;
//   2. the "Open postings near here" list inside a crew popup.
// Keeping the markup in one component means those two can't drift apart.
//
// `distanceMi` is optional and only passed by the crew popup, where the
// distance from THAT crew to the posting's town is a real, computed number.
// The town popup omits it — you're already looking at where the job is.

import { withProtocol, formatDistance, formatPay } from "../lib/formatting";

function Posting({ job, distanceMi }) {
  const pay = formatPay(job);

  // Location line: the town, plus the distance when we were given one. A
  // posting pin's own popup already names the town in its heading, so it
  // passes no distance and this collapses to just the town.
  const where = [
    [job.town, job.state].filter(Boolean).join(", "),
    distanceMi != null ? formatDistance(distanceMi) : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <li className="crew-popup-job">
      <div className="job-title">{job.title}</div>
      {where && <div className="job-meta">{where}</div>}

      {/* Appointment type and grade — the two things a firefighter checks
          first. Each part is dropped when absent, so a posting missing one
          never leaves a stray separator. */}
      {(job.appointment_type || job.pay_grade) && (
        <div className="job-meta">
          {[job.appointment_type, job.pay_grade].filter(Boolean).join(" · ")}
        </div>
      )}

      {pay && <div className="job-meta">{pay}</div>}

      {/* Career seasonal: a PERMANENT appointment that works 6-11 months a
          year, not year-round. USAJOBS codes it identically to a true
          year-round permanent job and only says so in free text, so we can
          spot it but never rule it out — it shows on the few postings that
          state it and stays silent otherwise. A note, never a filter. */}
      {job.career_seasonal && (
        <div className="job-note">
          Career seasonal — permanent, but not year-round
        </div>
      )}

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
  );
}

// `postings` is an array of either raw job rows, or { job, distanceMi } pairs.
// Accepting both lets the crew popup pass its distance-annotated list straight
// through without reshaping it.
export default function PostingList({ postings, max }) {
  const items = postings.map((p) => (p && p.job ? p : { job: p }));
  const shown = max ? items.slice(0, max) : items;
  const hidden = items.length - shown.length;

  return (
    <>
      <ul className="crew-popup-jobs-list">
        {shown.map(({ job, distanceMi }) => (
          <Posting key={job.id} job={job} distanceMi={distanceMi} />
        ))}
      </ul>
      {hidden > 0 && <div className="job-more">+{hidden} more</div>}
    </>
  );
}
