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
    // "?hiring=1" switches the Hiring layer on as the map opens. The layer is
    // off by default so a cold visitor sees crews first, but someone who
    // clicked THIS card asked for postings — they should get them without
    // having to find the toggle.
    href: "/map?hiring=1",
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

      {/* ABOUT — the destination for the map panel's "About this map" link,
          which until now pointed at this page's hero and explained nothing.
          WHY THIS EXISTS. The site uses agency names, Forest Service region
          structure and live federal job postings, and said nowhere that it
          isn't a government product. For an audience of federal employees that
          is the one misunderstanding worth heading off directly. The rest is
          the honest version of what the data can and can't tell you — the gaps
          are easier to trust when they're stated than when they're found. */}
      <section className="landing-about" id="about">
        <h2>About this map</h2>

        <p>
          This is a personal project, not an official one. It isn&apos;t
          affiliated with the US Forest Service, the Department of the Interior,
          or any federal agency, and nothing on it is an official record.
        </p>

        <h3>Where the data comes from</h3>
        <ul>
          <li>Public Forest Service crew listings.</li>
          <li>A community-maintained handcrew atlas, used with permission.</li>
          <li>Open federal job postings from USAJOBS, refreshed daily.</li>
        </ul>

        <h3>What it gets wrong</h3>
        <ul>
          <li>
            Pins sit in the middle of town, not at the actual station. That can
            be a few miles out.
          </li>
          <li>
            Plenty of crews have no name recorded. Where that happens the map
            shows the base it works from and says so, rather than inventing one.
          </li>
          <li>
            Housing is unknown for a couple of hundred crews. Blank means we
            don&apos;t know, not &ldquo;no&rdquo;.
          </li>
          <li>
            Coverage is thinnest outside the western regions. That&apos;s a gap
            in what we could source, not a decision about what counts.
          </li>
          <li>
            Job postings show the duty station USAJOBS lists, which isn&apos;t
            always where the work happens, and they aren&apos;t tied to any
            particular crew.
          </li>
        </ul>

        {/* Gated by the same flag as every other door into the submission flow
            — otherwise turning submissions off would leave this paragraph
            pointing at a link that no longer exists. */}
        {submissionsOn && (
          <>
            <h3>Something wrong?</h3>
            <p>
              Open the crew on the map and use the link in its details. Someone
              reads every one of these by hand.
            </p>
          </>
        )}
      </section>
    </div>
  );
}
