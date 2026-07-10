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

export default function CrewPopup({ crew }) {
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
    </div>
  );
}
