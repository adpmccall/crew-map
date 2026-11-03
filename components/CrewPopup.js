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

// One line of a crew's PT hike, for the optional `hikes` section below.
// Three honest states, not two: a hike with real numbers (from a submitted
// .gpx track, OR stated by the crew/a contact — the `source` field says
// which), a hike we know exists but have no numbers for yet, and — the
// normal case on the main crew map — no hikes prop passed at all, which
// renders nothing. See HikesMap.js, the only place that passes `hikes` in.
function HikeLine({ hike }) {
  const hasStats = hike.distance_miles != null;
  const sourceLabel =
    hike.source === "crew_published"
      ? "stated by the crew"
      : hike.source === "contact_reported"
      ? "reported, not from a track"
      : "computed from a submitted track";

  return (
    <div className="crew-popup-hike">
      <dt>{hike.hike_name || "PT hike"}</dt>
      <dd>
        {hasStats ? (
          <>
            {hike.distance_miles} mi
            {hike.elevation_gain_ft != null &&
              `, ${Math.round(hike.elevation_gain_ft).toLocaleString()} ft gain`}
            <span className="crew-popup-hike-source"> ({sourceLabel})</span>
            {hike.source_url && (
              <>
                {" "}
                —{" "}
                <a href={hike.source_url} target="_blank" rel="noopener noreferrer">
                  verify
                </a>
              </>
            )}
          </>
        ) : (
          <span className="crew-popup-hike-missing">
            Location known, no distance/elevation yet — know this hike?
          </span>
        )}
        {hike.notes && <div className="crew-popup-hike-notes">{hike.notes}</div>}
      </dd>
    </div>
  );
}

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

// A tel: href wants digits, not the human formatting. "360-854-2643" dials
// fine in most browsers as-is, but stripping to digits (keeping a leading +
// for anything international) is what the spec actually asks for and avoids
// relying on the dialler to be forgiving. The DISPLAYED text keeps its dashes.
function telHref(phone) {
  const raw = (phone || "").trim();
  const plus = raw.startsWith("+") ? "+" : "";
  return `tel:${plus}${raw.replace(/[^0-9]/g, "")}`;
}

// How many nearby jobs to list in the popup before we just show a "+N more"
// summary — keeps a crew near a busy hiring town from producing a giant popup.
const MAX_JOBS_SHOWN = 5;

// `nearbyJobs` is an array of { job, distanceMi }, already sorted closest-first
// by the map. It's empty (default) for crews with no open postings within range.
// `hikes` is only ever passed by HikesMap.js (the standalone Hikes map) — the
// main crew map never passes it, so this section renders nothing there and
// CrewPopup's existing behavior is completely unchanged for every other use.
//
// `compact` is also only ever passed by HikesMap.js. On a page whose whole
// point is the hike info, repeating every crew-map detail field (agency,
// forest, crew type, region, housing, leadership contact, website) is just
// noise once you already know which crew you clicked — and on a crew with
// several hikes (Lolo IHC has 5) it was a real contributor to the popup
// overflow bug fixed 2026-11-03 (see .leaflet-popup-content in globals.css
// for the actual height fix, which applies regardless of this prop). Name
// and location stay — nothing on this map labels which state a pin is in,
// so dropping location would make an identical-colored pin unidentifiable.
export default function CrewPopup({ crew, nearbyJobs = [], hikes = [], compact = false }) {
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
        {!compact && <Row label="Agency" value={agencyLabel(crew.agency)} />}
        {!compact && <Row label="Forest" value={crew.forest} />}
        <Row label="Location" value={location} />
        {!compact && <Row label="Crew type" value={resource} />}
        {!compact && <Row label="Region" value={crew.region} />}

        {!compact && (
          <>
            <dt>Housing</dt>
            <dd>{housingLabel(crew.housing)}</dd>
          </>
        )}

        {/* Crew leadership, on the 108 hotshot crews we have it for. Gated on
            contact_name: every other crew has NULL here, and a bare "Contact:"
            with nothing after it reads as broken — the same reason Row bails
            on a blank value.

            Deliberately inside the existing <dl> rather than its own section:
            a sibling <div> would carry its own margin and leave a visible gap
            on the ~700 crews with no contact. dt/dd pairs simply aren't
            emitted, so there is structurally nothing to space out.

            Phone and email are checked separately from the name — a crew can
            have a superintendent listed with only one of the two. */}
        {!compact && crew.contact_name && (
          <>
            <dt>Contact</dt>
            <dd>
              {[crew.contact_name, crew.contact_role]
                .map((v) => (v || "").trim())
                .filter(Boolean)
                .join(", ")}
              {/* Credits the source the same way the About section does for
                  the crew listings, the atlas and USAJOBS. A named person's
                  phone number invites more trust than the rest of the card,
                  so it should say where it came from and how old it is.
                  Static rather than read from contact_source: that column is
                  internal provenance and isn't fetched. If the directory is
                  re-scraped, update this string too. */}
              <span className="crew-popup-source">
                per FS IHC directory, Sept 2026
              </span>
            </dd>

            {crew.contact_phone && crew.contact_phone.trim() && (
              <>
                <dt>Phone</dt>
                <dd>
                  <a href={telHref(crew.contact_phone)}>
                    {crew.contact_phone.trim()}
                  </a>
                </dd>
              </>
            )}

            {crew.contact_email && crew.contact_email.trim() && (
              <>
                <dt>Email</dt>
                <dd>
                  <a href={`mailto:${crew.contact_email.trim()}`}>
                    {crew.contact_email.trim()}
                  </a>
                </dd>
              </>
            )}
          </>
        )}

        {/* Only show the website row when there's actually a website. */}
        {!compact && website && (
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

      {/* PT hike(s), only on the standalone Hikes map (see the `hikes` prop
          note above CrewPopup's signature). A crew can have more than one
          (Lolo IHC has 5) so this is always a list, never a single item. */}
      {hikes.length > 0 && (
        <div className="crew-popup-hikes">
          <h4 className="crew-popup-hikes-title">
            {hikes.length > 1 ? "PT hikes" : "PT hike"}
          </h4>
          <dl className="crew-popup-hikes-list">
            {hikes.map((h) => (
              <HikeLine key={h.id} hike={h} />
            ))}
          </dl>
        </div>
      )}

      {/* The way to tell us this crew is wrong. Gated by the SAME flag as every
          other door into the submission flow (the landing card, the map panel
          link) — one switch, so a review pause closes all of them together
          rather than leaving this one quietly open.
          It carries ?crew=<id>, which is what puts the form into correction
          mode and tells the reviewer which pin was clicked. */}
      {process.env.NEXT_PUBLIC_SUBMISSIONS_ENABLED === "true" && (
        <>
          <a className="crew-popup-report" href={`/submit?crew=${crew.id}`}>
            Something wrong with this one?
          </a>
          {/* Hotshot Crew Hikes: same gate, same review-queue pattern as the
              correction link above — see hike_submissions_schema.sql. */}
          <a className="crew-popup-report" href={`/submit-hike?crew=${crew.id}`}>
            Add this crew&apos;s PT hike
          </a>
        </>
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
