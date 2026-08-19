"use client";

// The landing page.
//
// A NOTE ON THE HISTORY, because it contradicts older comments in this repo:
// for most of this project "the map IS the landing page" was a hard rule — no
// splash, no homepage, straight to the pins. That was the right call while the
// map was the only thing here. It isn't any more: there's a hiring layer and a
// public submission form, and someone arriving cold at a screen of 829 dots has
// no way to know either exists. So "/" explains the place, and "/map" is one
// click away (and bookmarkable, so regulars never see this page twice).
//
// STRUCTURE: the three cards below come from one array. Adding a fourth is a
// single object with no layout work — the grid reflows on its own. That's
// deliberate; more will land here.

import Link from "next/link";

// Each card is { href, external?, eyebrow, title, body, cta }.
// `eyebrow` is the small label above the title — it's what makes a card
// skimmable when there are six of these instead of three.
const SECTIONS = [
  {
    href: "/map",
    eyebrow: "The map",
    title: "Find crews",
    body:
      "Every crew we know about, on one map. Filter by state, agency, crew type " +
      "or Forest Service region. Click a pin and you get the crew's details, its " +
      "website where there is one, and any open jobs nearby.",
    cta: "Open the map",
  },
  {
    href: "/map",
    eyebrow: "Hiring",
    title: "See what's open",
    body:
      "Open federal fire jobs pulled from USAJOBS, refreshed every day. They show " +
      "as their own markers on the map, one per town, and you can narrow them by " +
      "pay grade, salary, or whether the job is permanent or temporary.",
    cta: "See open jobs",
  },
  {
    href: "/submit",
    eyebrow: "Add to it",
    title: "Submit a crew",
    body:
      "The list this started from is mostly western, so there are gaps — whole " +
      "regions of it. If you know a crew that isn't here, add it. Someone reads " +
      "every submission before it goes on the map.",
    cta: "Add a crew",
  },
];

export default function Landing() {
  return (
    <div className="landing">
      <header className="landing-hero">
        <h1>Crew Map</h1>
        <p className="landing-lede">
          A map of wildland fire crews in the US — where they are, who they work
          for, and what's hiring near them.
        </p>
        <p className="landing-sub">
          Free, no account, nothing to sign up for.
        </p>
        <Link className="landing-cta" href="/map">
          Open the map →
        </Link>
      </header>

      <main className="landing-grid">
        {SECTIONS.map((s) => (
          <Link key={s.eyebrow} className="landing-card" href={s.href}>
            <span className="landing-eyebrow">{s.eyebrow}</span>
            <h2>{s.title}</h2>
            <p>{s.body}</p>
            <span className="landing-card-cta">{s.cta} →</span>
          </Link>
        ))}
      </main>

      {/* Honest about what's here and what isn't. The coverage gap is the whole
          reason the submission form exists, so it belongs on the front page
          rather than buried — someone who notices their region is thin is
          exactly the person who can fix it. */}
      <footer className="landing-foot">
        <h3>Where the data comes from</h3>
        <p>
          Crew locations started from a US Forest Service list and grew from
          there, including crews outside the Forest Service — BLM, Park Service,
          tribal, state, county and local. Coverage is still strongest in the
          West and thinner elsewhere; that's a gap in what we have, not a limit
          on what belongs here.
        </p>
        <p>
          Job postings come from USAJOBS and are refreshed daily. A posting's
          location is the duty-station town it lists, not a specific base.
        </p>
        <p className="landing-foot-links">
          <Link href="/map">Map</Link>
          <Link href="/submit">Add a crew</Link>
          <a
            href="https://github.com/adpmccall/crew-map"
            target="_blank"
            rel="noopener noreferrer"
          >
            Source
          </a>
        </p>
      </footer>
    </div>
  );
}
