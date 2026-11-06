"use client";

// The public "add a crew's PT hike" form, at /submit-hike?crew=<id>.
//
// WHY THIS ONLY WORKS FROM A CREW LINK: identifying one crew out of 800+
// needs the map, and the map already has the link (a new "Add this crew's PT
// hike" line in CrewPopup, right next to the existing "Something wrong with
// this one?" correction link). There is no crew picker here on purpose --
// same reasoning as the correction form in SubmitForm.js.
//
// NOTHING HERE GOES LIVE ON ITS OWN. A submission lands in `hike_submissions`
// as 'pending' and only reaches the map when a human approves it. See
// hike_submissions_schema.sql for the full security reasoning -- it mirrors
// crew_submissions -> crews exactly, with one addition: uploading the .gpx
// file itself to a public Storage bucket happens before the database insert.

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { supabase } from "../lib/supabaseClient";
import { crewDisplayName } from "../lib/formatting";
import { computeHikeStats, MAX_GPX_FILE_BYTES } from "../lib/gpx";

// Same anti-spam trio as SubmitForm.js -- see that file for the reasoning.
const HONEYPOT_FIELD = "company_website";
const MIN_SECONDS_ON_FORM = 4;
const RESUBMIT_COOLDOWN_MS = 30_000;

// A random-enough filename so two submitters' uploads never collide, without
// needing a real user-account system to key off of. crypto.randomUUID() is
// standard in every current browser; the fallback only matters for a very
// old browser and never needs to be cryptographically strong here -- it just
// needs to not collide with another upload landing in the same second.
function randomFileId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export default function SubmitHikeForm() {
  const [crewId, setCrewId] = useState(null);
  const [targetCrew, setTargetCrew] = useState(null);
  const [crewLoad, setCrewLoad] = useState("idle"); // idle|loading|ready|missing

  // Which map sent us here -- set via `&from=hikes` on the CrewPopup link
  // (only HikesMap.js's popups add it; see CrewPopup.js). Defaults to the
  // main map so an old/bookmarked /submit-hike link without the param keeps
  // its original behavior.
  const [backHref, setBackHref] = useState("/map");
  const [backLabel, setBackLabel] = useState("the map");

  const [hikeName, setHikeName] = useState("");
  const [notes, setNotes] = useState("");
  const [submitterEmail, setSubmitterEmail] = useState("");
  const [honeypot, setHoneypot] = useState("");

  // The chosen file and what lib/gpx.js made of it. `fileState` mirrors the
  // geocode preview pattern in SubmitForm.js -- show what we understood
  // BEFORE the submitter sends anything, so a bad file is caught here rather
  // than after upload.
  const [file, setFile] = useState(null);
  const [fileState, setFileState] = useState("idle"); // idle|reading|ready|error
  const [fileError, setFileError] = useState("");
  const [stats, setStats] = useState(null);

  const [status, setStatus] = useState("editing"); // editing|sending|sent|error
  const [errorMsg, setErrorMsg] = useState("");
  const [fieldErrors, setFieldErrors] = useState({});
  const openedAt = useRef(Date.now());
  const lastSentAt = useRef(0);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("from") === "hikes") {
      setBackHref("/hikes");
      setBackLabel("the hikes map");
    }

    const raw = params.get("crew");
    if (!raw || !/^\d+$/.test(raw)) {
      setCrewLoad("missing");
      return;
    }
    setCrewId(Number(raw));
    setCrewLoad("loading");
    let cancelled = false;

    (async () => {
      // Public read, same anon key the map uses -- `crews` is public-read by
      // design.
      const { data, error } = await supabase
        .from("crews")
        .select("id, crew_name, district, forest, town, state, resource")
        .eq("id", Number(raw))
        .maybeSingle();
      if (cancelled) return;
      if (error || !data) {
        setCrewLoad("missing");
        return;
      }
      setTargetCrew(data);
      setCrewLoad("ready");
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  async function handleFileChange(event) {
    const chosen = event.target.files?.[0];
    setFile(null);
    setStats(null);
    setFileError("");
    if (!chosen) {
      setFileState("idle");
      return;
    }
    if (!chosen.name.toLowerCase().endsWith(".gpx")) {
      setFileState("error");
      setFileError("That needs to be a .gpx file (most GPS watches and hiking apps can export one).");
      return;
    }
    if (chosen.size > MAX_GPX_FILE_BYTES) {
      setFileState("error");
      setFileError("That file is bigger than expected for a single hike (3 MB max) -- is it the right file?");
      return;
    }

    setFileState("reading");
    try {
      const text = await chosen.text();
      const computed = computeHikeStats(text);
      setFile(chosen);
      setStats(computed);
      setFileState("ready");
    } catch (err) {
      setFileState("error");
      setFileError(err.message || "Couldn't read that file.");
    }
  }

  function validate() {
    const e = {};
    if (!file || !stats) e.file = "Choose a .gpx file first.";
    if (hikeName.length > 120) e.hikeName = "Keep this under 120 characters.";
    if (notes.length > 500) e.notes = "Keep this under 500 characters.";
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(submitterEmail.trim()))
      e.submitterEmail = "We need an email that works.";
    return e;
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setErrorMsg("");

    if (honeypot) {
      setStatus("sent");
      return;
    }
    if ((Date.now() - openedAt.current) / 1000 < MIN_SECONDS_ON_FORM) {
      setErrorMsg("That was quick. Have another look and try again.");
      return;
    }
    if (Date.now() - lastSentAt.current < RESUBMIT_COOLDOWN_MS) {
      setErrorMsg("You just sent one, give it a second.");
      return;
    }

    const errs = validate();
    setFieldErrors(errs);
    if (Object.keys(errs).length) return;

    setStatus("sending");

    // Upload the file to Storage FIRST -- the database row needs its public
    // URL. The path is namespaced by crew id just to keep the bucket
    // browsable by eye in the dashboard; it has no bearing on permissions
    // (the insert policy allows any path in this bucket).
    const path = `${crewId}/${randomFileId()}.gpx`;
    const { error: uploadError } = await supabase.storage
      .from("crew-hikes")
      .upload(path, file, { contentType: "application/gpx+xml" });

    if (uploadError) {
      setStatus("error");
      console.error("GPX upload failed:", uploadError.message);
      setErrorMsg("That didn't upload. Try again in a minute.");
      return;
    }

    const { data: urlData } = supabase.storage.from("crew-hikes").getPublicUrl(path);

    const { error } = await supabase.from("hike_submissions").insert({
      crew_id: crewId,
      hike_name: hikeName.trim() || null,
      notes: notes.trim() || null,
      distance_miles: stats.distanceMiles,
      elevation_gain_ft: stats.elevationGainFeet,
      gpx_url: urlData.publicUrl,
      path: stats.path,
      start_lat: stats.startLat,
      start_lon: stats.startLon,
      end_lat: stats.endLat,
      end_lon: stats.endLon,
      submitter_email: submitterEmail.trim(),
    });

    if (error) {
      setStatus("error");
      // NOTE: the uploaded file above is now orphaned in Storage if this
      // insert fails (a rate limit is the realistic case) -- there's no
      // anon-key way to delete it back out, since the upload policy only
      // grants INSERT. Accepted, same tradeoff crew_submissions makes
      // elsewhere: bounded, harmless clutter beats adding a second write
      // path just to clean up a rare failure.
      console.error("Hike submission failed:", error.message);
      setErrorMsg(
        error.message?.includes("Too many") || error.message?.includes("submitted several")
          ? error.message
          : "That didn't send. Try again in a minute."
      );
      return;
    }

    lastSentAt.current = Date.now();
    setStatus("sent");
  }

  if (status === "sent") {
    return (
      <div className="submit-page">
        <div className="submit-done">
          <h1>Got it, thanks.</h1>
          <p>
            Someone checks these by hand before they show up on the map --
            mostly just a glance at the route to make sure it looks right. If
            we need to ask you anything we&apos;ll email you.
          </p>
          <p className="submit-actions">
            <Link href={backHref}>← Back to {backLabel}</Link>
          </p>
        </div>
      </div>
    );
  }

  if (crewLoad === "missing") {
    return (
      <div className="submit-page">
        <div className="submit-done">
          <h1>Find the crew first</h1>
          <p>
            This form needs to know which crew the hike belongs to. Open the
            map, click that crew&apos;s pin, and use the &quot;Add this
            crew&apos;s PT hike&quot; link in its popup.
          </p>
          <p className="submit-actions">
            <Link href={backHref}>← Go to {backLabel}</Link>
          </p>
        </div>
      </div>
    );
  }

  const crewTitle = targetCrew ? crewDisplayName(targetCrew) : null;
  const where = targetCrew
    ? [targetCrew.town, targetCrew.state].filter(Boolean).join(", ")
    : "";

  return (
    <div className="submit-page">
      <form className="submit-form" onSubmit={handleSubmit} noValidate>
        <p className="submit-back">
          <Link href={backHref}>← Back to {backLabel}</Link>
        </p>

        <h1>Add a crew&apos;s PT hike</h1>

        <noscript>
          <p className="submit-noscript">
            This form needs JavaScript switched on to send.
          </p>
        </noscript>

        {crewLoad === "loading" && (
          <p className="submit-intro">Looking up that crew…</p>
        )}

        {crewLoad === "ready" && targetCrew && (
          <>
            <p className="submit-intro">
              Got a .gpx recording of this crew&apos;s signature conditioning
              hike? Upload it here -- distance and elevation gain are worked
              out from the file itself, so you don&apos;t need to know either
              number ahead of time.
            </p>

            <div className="submit-target">
              <strong>{crewTitle.name}</strong>
              {!crewTitle.known && (
                <span className="submit-target-note">
                  Crew name not on file -- this is the base
                </span>
              )}
              {where && (
                <dl>
                  <dt>Location</dt>
                  <dd>{where}</dd>
                </dl>
              )}
            </div>

            <label>
              <span className="label-line">
                The .gpx file <span className="req">required</span>
              </span>
              <input type="file" accept=".gpx" onChange={handleFileChange} />
              <span className="submit-hint">
                Start recording at the trailhead, not from home or the
                drive in -- the track is shown publicly on the map, so it
                shouldn&apos;t lead back to anyone&apos;s house.
              </span>
              {fileState === "reading" && (
                <span className="submit-geo submit-geo--looking">Reading the file…</span>
              )}
              {fileState === "error" && <span className="err">{fileError}</span>}
              {fileState === "ready" && stats && (
                <div className="submit-geo submit-geo--found">
                  Looks good: <strong>{stats.distanceMiles} mi</strong>
                  {stats.elevationGainFeet != null && (
                    <>, <strong>{stats.elevationGainFeet.toLocaleString()} ft</strong> of gain</>
                  )}
                  <span className="submit-geo-note">
                    {stats.pointCount.toLocaleString()} recorded points. These
                    numbers are what will show on the map -- check them
                    against your watch/app before sending if you want to be
                    sure.
                  </span>
                </div>
              )}
              {fieldErrors.file && <span className="err">{fieldErrors.file}</span>}
            </label>

            <label>
              <span className="label-line">
                Hike name <span className="opt">optional</span>
              </span>
              <input
                type="text"
                value={hikeName}
                maxLength={120}
                onChange={(e) => setHikeName(e.target.value)}
                placeholder="e.g. Mount Sentinel"
              />
              <span className="submit-hint">
                Leave this blank and the map will just label it with the
                crew&apos;s own name.
              </span>
              {fieldErrors.hikeName && <span className="err">{fieldErrors.hikeName}</span>}
            </label>

            <label>
              <span className="label-line">
                Anything worth knowing <span className="opt">optional</span>
              </span>
              <textarea
                rows={3}
                value={notes}
                maxLength={500}
                onChange={(e) => setNotes(e.target.value)}
                placeholder='e.g. "full gear, ~50 minutes" -- whatever the crew itself says about it'
              />
              {fieldErrors.notes && <span className="err">{fieldErrors.notes}</span>}
            </label>

            <label>
              <span className="label-line">
                Your email <span className="req">required</span>
              </span>
              <input
                type="email"
                value={submitterEmail}
                maxLength={200}
                onChange={(e) => setSubmitterEmail(e.target.value)}
                placeholder="you@example.com"
              />
              <span className="submit-hint">
                So we can ask you about this if we need to. It isn&apos;t
                shown anywhere.
              </span>
              {fieldErrors.submitterEmail && (
                <span className="err">{fieldErrors.submitterEmail}</span>
              )}
            </label>

            <div className="submit-hp" aria-hidden="true">
              <label>
                Company website
                <input
                  type="text"
                  name={HONEYPOT_FIELD}
                  value={honeypot}
                  tabIndex={-1}
                  autoComplete="off"
                  onChange={(e) => setHoneypot(e.target.value)}
                />
              </label>
            </div>

            {errorMsg && <div className="submit-error">{errorMsg}</div>}

            <button type="submit" disabled={status === "sending"}>
              {status === "sending" ? "Sending…" : "Send this in"}
            </button>

            <p className="submit-fineprint">
              Everything gets looked at before it goes on the map.
            </p>
          </>
        )}
      </form>
    </div>
  );
}
