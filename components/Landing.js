"use client";

// The landing page.
//
// A NOTE ON THE HISTORY, because it contradicts older comments in this repo:
// for most of this project "the map IS the landing page" was a hard rule — no
// splash, no homepage, straight to the pins. That was the right call while the
// map was the only thing here. It isn't any more: there's a hiring layer and a
// public submission form, and someone arriving cold at a screen of dots has
// no way to know either exists. So "/" explains the place, and "/map" is one
// click away (and bookmarkable, so regulars never see this page twice).
//
// LAYOUT (2026-11 redesign): picked by the owner from three mockups, the
// "numbers-forward" one, with the headline from the minimal mockup. It leads
// with live counts from the database, then each section as a row tied to its
// own number, then a short "know the gaps" box, then the full About section.
// Styles live in Landing.module.css.
//
// STRUCTURE: the rows below come from one array. Adding another is a single
// object with no layout work.

import Link from "next/link";
import styles from "./Landing.module.css";
import useSiteStats, { fmt } from "../lib/useSiteStats";

// Each section is { key, href, eyebrow, title, body, cta, requiresSubmissions? }.
//
// `requiresSubmissions` ties a row to NEXT_PUBLIC_SUBMISSIONS_ENABLED, the
// same switch that controls the map panel's link. ONE flag governs every door
// into the submission flow — two independent ways in would drift, and one of
// them would eventually be pointing at a feature the other had turned off.
const SECTIONS = [
  {
    key: "map",
    href: "/map",
    eyebrow: "The map",
    title: "Find crews",
    body:
      "Every crew we know about, on one map. Filter by state, agency, crew type " +
      "or Forest Service region. Click a pin for the crew's details, its website " +
      "where there is one, and any open jobs nearby.",
    cta: "Open the map",
  },
  {
    // "?hiring=1" switches the Hiring layer on as the map opens. The layer is
    // off by default so a cold visitor sees crews first, but someone who
    // clicked THIS row asked for postings.
    key: "hiring",
    href: "/map?hiring=1",
    eyebrow: "Hiring",
    title: "See what's open",
    body:
      "Open federal fire jobs from USAJOBS, refreshed every day. One marker per " +
      "town, and you can narrow them by pay grade, salary, or permanent vs. " +
      "temporary.",
    cta: "See open jobs",
  },
  {
    key: "submit",
    href: "/submit",
    eyebrow: "Add to it",
    title: "Submit a crew",
    body:
      "Plenty of crews aren't on here yet. If you know one that's missing, add " +
      "it. Someone reads every submission before it goes on the map.",
    cta: "Add a crew",
    requiresSubmissions: true,
  },
  {
    key: "hikes",
    href: "/hikes",
    eyebrow: "Hotshot crews",
    title: "Crew PT hikes",
    body:
      "Every hotshot crew has a signature conditioning hike. See the ones we " +
      "know about: distance, elevation gain, and where we don't have real " +
      "numbers yet, help fill them in.",
    cta: "See the hikes",
  },
];

// Which live number sits next to which row. Rows with no number (Submit)
// show a "+" instead.
function statFor(key, stats) {
  if (key === "map") return { n: stats.crews, label: "crews mapped" };
  if (key === "hiring") return { n: stats.jobs, label: "open postings" };
  if (key === "hikes") return { n: stats.hikes, label: "hikes on file" };
  return null;
}

export default function Landing() {
  // Same switch the map panel uses. Not "true" means every route into the
  // submission flow is closed at once, which is the point of having one flag.
  const submissionsOn = process.env.NEXT_PUBLIC_SUBMISSIONS_ENABLED === "true";
  const sections = SECTIONS.filter((s) => !s.requiresSubmissions || submissionsOn);
  const stats = useSiteStats();

  return (
    <div className={styles.page}>
      <nav className={styles.nav}>
        <span className={styles.brand}>
          <span className={styles.brandDot} aria-hidden="true" />
          Crew Map
        </span>
        <div className={styles.navLinks}>
          <Link href="/map">Map</Link>
          <Link href="/map?hiring=1">Jobs</Link>
          <Link href="/hikes">Hikes</Link>
          <a href="#about">About</a>
        </div>
      </nav>

      <header className={styles.hero}>
        <div>
          <h1 className={styles.title}>Wildland fire crews, mapped.</h1>
          <p className={styles.lede}>
            A map of wildland fire crews in the US: where they are, who they work
            for, and what&apos;s hiring near them.
          </p>
          <Link className={styles.cta} href="/map">
            Open the map →
          </Link>
        </div>

        {/* Live from the database (lib/useSiteStats.js). Shows "…" until
            loaded, never a fake zero. */}
        <dl className={styles.stats}>
          <div className={styles.stat}>
            <dt>Crews</dt>
            <dd>{fmt(stats.crews)}</dd>
          </div>
          <div className={styles.stat}>
            <dt>States</dt>
            <dd>{fmt(stats.states)}</dd>
          </div>
          <div className={styles.stat}>
            <dt>Agencies</dt>
            <dd>{fmt(stats.agencies)}</dd>
          </div>
          <div className={styles.stat}>
            <dt>Open jobs</dt>
            <dd>{fmt(stats.jobs)}</dd>
          </div>
        </dl>
      </header>

      <main className={styles.main}>
        <ul className={styles.rows}>
          {sections.map((s) => {
            const stat = statFor(s.key, stats);
            return (
              <li key={s.key}>
                <Link href={s.href} className={styles.row}>
                  <div className={styles.rowStat}>
                    {stat ? (
                      <>
                        <span className={styles.rowNum}>{fmt(stat.n)}</span>
                        <span className={styles.rowNumLabel}>{stat.label}</span>
                      </>
                    ) : (
                      <span className={styles.rowNum}>+</span>
                    )}
                  </div>
                  <div>
                    <span className={styles.eyebrow}>{s.eyebrow}</span>
                    <h2 className={styles.rowTitle}>{s.title}</h2>
                    <p className={styles.rowBody}>{s.body}</p>
                  </div>
                  <span className={styles.rowCta}>{s.cta} →</span>
                </Link>
              </li>
            );
          })}
        </ul>

        {/* A short version of "What it gets wrong" from the About section
            below, promoted so people see the gaps before they hit them. */}
        <section className={styles.gaps}>
          <h2 className={styles.gapsTitle}>Know the gaps</h2>
          <ul className={styles.gapsList}>
            <li>
              <strong>Pins sit mid-town,</strong> not at the station. That can be
              a few miles out.
            </li>
            <li>
              <strong>Unnamed crews</strong> show the base they work from, and say
              so.
            </li>
            <li>
              <strong>Blank housing</strong> means unknown, not &ldquo;no.&rdquo;
            </li>
            <li>
              <strong>Coverage is thinnest</strong> outside the western regions.
              We&apos;re filling it in.
            </li>
          </ul>
        </section>
      </main>

      {/* ABOUT — the destination for the map panel's "About this map" link
          (/#about) and this page's own nav. Kept word for word through the
          2026-11 redesign; styled by .landing-about in globals.css.
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
            {/* Deliberately NOT a new contact route — no address, no second
                channel — everything keeps flowing through the one reviewed
                pipeline. */}
            <p>
              Have a general question or suggestion instead of a specific
              correction? Use the same form, and we&apos;ll get back to you
              ASAP.
            </p>
          </>
        )}
      </section>
    </div>
  );
}
