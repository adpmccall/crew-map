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
// STRUCTURE: the cards below come from one array. Adding another is a single
// object with no layout work — the grid reflows on its own. That's deliberate;
// more will land here.

import Link from "next/link";

// Each card is { href, eyebrow, title, body, cta, requiresSubmissions? }.
// `eyebrow` is the small label above the title — it's what makes a card
// skimmable when there are six of these instead of three.
//
// `requiresSubmissions` ties a card to NEXT_PUBLIC_SUBMISSIONS_ENABLED, the
// same switch that controls the map panel's link. ONE flag governs every door
// into the submission flow — two independent ways in would drift, and one of
// them would eventually be pointing at a feature the other had turned off.
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
      "There are gaps — plenty of crews aren't on here yet. If you know one " +
      "that's missing, add it. Someone reads every submission before it goes " +
      "on the map.",
    cta: "Add a crew",
    requiresSubmissions: true,
  },
];

export default function Landing() {
  // Same switch the map panel uses. Not "true" means every route into the
  // submission flow is closed at once, which is the point of having one flag.
  const submissionsOn = process.env.NEXT_PUBLIC_SUBMISSIONS_ENABLED === "true";
  const sections = SECTIONS.filter((s) => !s.requiresSubmissions || submissionsOn);

  return (
    <div className="landing">
      <header className="landing-hero">
        <h1>Crew Map</h1>
        <p className="landing-lede">
          A map of wildland fire crews in the US — where they are, who they work
          for, and what's hiring near them.
        </p>
        <Link className="landing-cta" href="/map">
          Open the map →
        </Link>
      </header>

      <main className="landing-grid">
        {sections.map((s) => (
          <Link key={s.eyebrow} className="landing-card" href={s.href}>
            <span className="landing-eyebrow">{s.eyebrow}</span>
            <h2>{s.title}</h2>
            <p>{s.body}</p>
            <span className="landing-card-cta">{s.cta} →</span>
          </Link>
        ))}
      </main>

    </div>
  );
}
