"use client";

// The public "add a crew" form.
//
// WHY THIS EXISTS: the map's biggest gap is coverage — the curated data is
// R1-R6 and the Atlas added only a handful of Eastern/Southern/Alaska crews.
// The people who actually work on the missing crews are better placed to fill
// that in than any dataset we could go hunting for.
//
// NOTHING HERE GOES LIVE. A submission lands in `crew_submissions` as
// 'pending' and only reaches the map when a human approves it. See
// crew_submissions_schema.sql for the full security reasoning.

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { supabase } from "../lib/supabaseClient";
import {
  SUBMIT_AGENCIES,
  SUBMIT_CREW_TYPES,
  US_STATES,
  titleCaseState,
} from "../lib/submissionOptions";

// A bot that fills every field it finds will fill this one; a person never sees
// it. Cheap, and it costs a real submitter nothing.
const HONEYPOT_FIELD = "company_website";

// Bots submit instantly. Nobody fills this form in under four seconds.
const MIN_SECONDS_ON_FORM = 4;

// Stops an impatient double-click from creating two identical rows. Trivially
// bypassed on purpose — the real limits are the database's (see the rate-limit
// trigger); this is just courtesy.
const RESUBMIT_COOLDOWN_MS = 30_000;

const EMPTY = {
  crew_name: "",
  agency: "",
  state: "",
  town: "",
  resource: [],
  website: "",
  notes: "",
  submitter_email: "",
};

export default function SubmitForm() {
  const [form, setForm] = useState(EMPTY);
  const [honeypot, setHoneypot] = useState("");
  const [status, setStatus] = useState("editing"); // editing | sending | sent | error
  const [errorMsg, setErrorMsg] = useState("");
  const [fieldErrors, setFieldErrors] = useState({});
  // What the geocoder made of the town/state, shown back so a submitter can
  // catch a wrong match before sending.
  const [geo, setGeo] = useState({ state: "idle", lat: null, lng: null, label: "" });
  const openedAt = useRef(Date.now());
  const lastSentAt = useRef(0);

  function set(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
    setFieldErrors((e) => ({ ...e, [field]: undefined }));
  }

  function toggleType(t) {
    setForm((f) => ({
      ...f,
      resource: f.resource.includes(t)
        ? f.resource.filter((x) => x !== t)
        : [...f.resource, t],
    }));
  }

  // Geocode town + state once both are set. Same free Nominatim service the
  // project's own geocode.py uses, so a submitted crew lands at the same
  // town-centre precision as every other pin — no better, no worse.
  //
  // A failure is NOT fatal: the submission is still accepted with null
  // coordinates and flagged for the reviewer, because losing a real crew over a
  // geocoder hiccup would be the worse outcome.
  useEffect(() => {
    const town = form.town.trim();
    const state = form.state;
    if (town.length < 2 || !state) {
      setGeo({ state: "idle", lat: null, lng: null, label: "" });
      return;
    }
    let cancelled = false;
    setGeo((g) => ({ ...g, state: "looking" }));

    // Debounced so typing a town doesn't fire a request per keystroke —
    // Nominatim asks for at most ~1 request/second.
    const timer = setTimeout(async () => {
      try {
        const q = encodeURIComponent(`${town}, ${titleCaseState(state)}, USA`);
        const res = await fetch(
          `https://nominatim.openstreetmap.org/search?q=${q}&format=json&limit=1&countrycodes=us`
        );
        const hits = await res.json();
        if (cancelled) return;
        if (hits && hits.length) {
          setGeo({
            state: "found",
            lat: Number(Number(hits[0].lat).toFixed(5)),
            lng: Number(Number(hits[0].lon).toFixed(5)),
            label: hits[0].display_name || "",
          });
        } else {
          setGeo({ state: "missing", lat: null, lng: null, label: "" });
        }
      } catch {
        if (!cancelled) setGeo({ state: "missing", lat: null, lng: null, label: "" });
      }
    }, 700);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [form.town, form.state]);

  function validate() {
    const e = {};
    if (form.crew_name.trim().length < 2) e.crew_name = "Please give the crew's name.";
    if (form.crew_name.trim().length > 120) e.crew_name = "That's longer than 120 characters.";
    if (!form.agency) e.agency = "Please pick an agency.";
    if (!form.state) e.state = "Please pick a state.";
    if (form.town.trim().length < 2) e.town = "Please give the town or nearest town.";
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(form.submitter_email.trim()))
      e.submitter_email = "Please give an email we can reach you at.";
    if (form.website && form.website.trim().length > 300) e.website = "That URL is too long.";
    if (form.notes.length > 1000) e.notes = "Please keep notes under 1000 characters.";
    return e;
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setErrorMsg("");

    // --- quiet anti-spam checks, in order of cheapness ---
    // A filled honeypot is almost certainly a bot. Show the normal success
    // screen rather than an error: telling a bot it was caught just teaches it.
    if (honeypot) {
      setStatus("sent");
      return;
    }
    if ((Date.now() - openedAt.current) / 1000 < MIN_SECONDS_ON_FORM) {
      setErrorMsg("That was quick — take another look and try again.");
      return;
    }
    if (Date.now() - lastSentAt.current < RESUBMIT_COOLDOWN_MS) {
      setErrorMsg("You just sent one. Give it a moment before sending another.");
      return;
    }

    const errs = validate();
    setFieldErrors(errs);
    if (Object.keys(errs).length) return;

    setStatus("sending");

    // NOTE: no .select() after .insert(). The anon key has INSERT but
    // deliberately NOT SELECT on this table (it holds email addresses), so
    // asking for the row back would fail the read even though the write
    // succeeded.
    const { error } = await supabase.from("crew_submissions").insert({
      crew_name: form.crew_name.trim(),
      agency: form.agency,
      state: form.state,
      town: form.town.trim(),
      latitude: geo.lat,
      longitude: geo.lng,
      // Comma-joined to match how `crews.resource` already stores several types.
      resource: form.resource.length ? form.resource.join(", ") : null,
      website: form.website.trim() || null,
      notes: form.notes.trim() || null,
      submitter_email: form.submitter_email.trim(),
    });

    if (error) {
      setStatus("error");
      // The rate-limit trigger raises a human-readable message; surface it as
      // written rather than burying it under something generic.
      setErrorMsg(
        error.message?.includes("Too many") || error.message?.includes("submitted several")
          ? error.message
          : "Something went wrong sending that. Please try again in a moment."
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
          <h1>Thanks — that's been sent.</h1>
          <p>
            Your crew is in the review queue. Someone checks these by hand, so it
            won't appear on the map straight away. If anything needs clarifying
            we'll email you at the address you gave.
          </p>
          <p className="submit-actions">
            <Link href="/">← Back to the map</Link>
            <button
              type="button"
              className="submit-another"
              onClick={() => {
                setForm(EMPTY);
                setGeo({ state: "idle", lat: null, lng: null, label: "" });
                setStatus("editing");
                openedAt.current = Date.now();
              }}
            >
              Add another crew
            </button>
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="submit-page">
      <form className="submit-form" onSubmit={handleSubmit} noValidate>
        <p className="submit-back">
          <Link href="/">← Back to the map</Link>
        </p>

        <h1>Add a crew</h1>
        <p className="submit-intro">
          Missing a crew? Add it here. The map started from a Forest Service
          dataset that mostly covers the West, so there are real gaps — the
          people who work these crews know them better than any list we could
          find. Every submission is reviewed by a person before it appears.
        </p>

        <label>
          <span className="label-line">Crew name <span className="req">required</span></span>
          <input
            type="text"
            value={form.crew_name}
            maxLength={120}
            onChange={(e) => set("crew_name", e.target.value)}
            placeholder="e.g. Chena Hotshots"
          />
          {fieldErrors.crew_name && <span className="err">{fieldErrors.crew_name}</span>}
        </label>

        <label>
          <span className="label-line">Agency <span className="req">required</span></span>
          <select value={form.agency} onChange={(e) => set("agency", e.target.value)}>
            <option value="">Choose…</option>
            {SUBMIT_AGENCIES.map((a) => (
              <option key={a.value} value={a.value}>
                {a.label}
              </option>
            ))}
          </select>
          {fieldErrors.agency && <span className="err">{fieldErrors.agency}</span>}
        </label>

        <div className="submit-row">
          <label>
            <span className="label-line">Town <span className="req">required</span></span>
            <input
              type="text"
              value={form.town}
              maxLength={80}
              onChange={(e) => set("town", e.target.value)}
              placeholder="e.g. Fairbanks"
            />
            {fieldErrors.town && <span className="err">{fieldErrors.town}</span>}
          </label>

          <label>
            <span className="label-line">State <span className="req">required</span></span>
            <select value={form.state} onChange={(e) => set("state", e.target.value)}>
              <option value="">Choose…</option>
              {US_STATES.map((s) => (
                <option key={s} value={s}>
                  {titleCaseState(s)}
                </option>
              ))}
            </select>
            {fieldErrors.state && <span className="err">{fieldErrors.state}</span>}
          </label>
        </div>

        {/* Show what the geocoder matched. Pins sit at the town centre, not at a
            specific base — saying so here sets the same expectation the map
            itself makes about job postings. */}
        <div className={`submit-geo submit-geo--${geo.state}`}>
          {geo.state === "looking" && "Looking up that town…"}
          {geo.state === "found" && (
            <>
              Found: <strong>{geo.label.split(",").slice(0, 3).join(", ")}</strong>
              <span className="submit-geo-note">
                The pin sits at the town centre, not the exact base.
              </span>
            </>
          )}
          {geo.state === "missing" && (
            <>
              Couldn't place that town automatically — that's fine, send it
              anyway and we'll sort the location out during review.
            </>
          )}
        </div>

        <fieldset className="submit-types">
          <legend>Crew type <span className="opt">optional — pick any that fit</span></legend>
          <div className="submit-type-grid">
            {SUBMIT_CREW_TYPES.map((t) => (
              <label key={t} className="submit-type">
                <input
                  type="checkbox"
                  checked={form.resource.includes(t)}
                  onChange={() => toggleType(t)}
                />
                <span>{t}</span>
              </label>
            ))}
          </div>
        </fieldset>

        <label>
          <span className="label-line">Website <span className="opt">optional</span></span>
          <input
            type="url"
            value={form.website}
            maxLength={300}
            onChange={(e) => set("website", e.target.value)}
            placeholder="https://…"
          />
          {fieldErrors.website && <span className="err">{fieldErrors.website}</span>}
        </label>

        <label>
          <span className="label-line">Anything else <span className="opt">optional</span></span>
          <textarea
            rows={3}
            value={form.notes}
            maxLength={1000}
            onChange={(e) => set("notes", e.target.value)}
            placeholder="Housing, hiring contact, anything that would help someone considering this crew."
          />
          {fieldErrors.notes && <span className="err">{fieldErrors.notes}</span>}
        </label>

        <label>
          <span className="label-line">Your email <span className="req">required</span></span>
          <input
            type="email"
            value={form.submitter_email}
            maxLength={200}
            onChange={(e) => set("submitter_email", e.target.value)}
            placeholder="you@example.com"
          />
          <span className="submit-hint">
            Only used to follow up on this submission if something needs
            checking. It is never shown on the map or shared.
          </span>
          {fieldErrors.submitter_email && (
            <span className="err">{fieldErrors.submitter_email}</span>
          )}
        </label>

        {/* Honeypot. Hidden from people (CSS, not `type=hidden`, which bots
            skip), and never focusable or announced to a screen reader. */}
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

        <button type="submit" className="submit-button" disabled={status === "sending"}>
          {status === "sending" ? "Sending…" : "Submit crew for review"}
        </button>

        <p className="submit-fineprint">
          Submissions are reviewed by hand before anything appears on the map.
          Please only add crews you have direct knowledge of.
        </p>
      </form>
    </div>
  );
}
