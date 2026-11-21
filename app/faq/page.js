// The Fire Job FAQ, at "/faq".
//
// Ported from the prototype in handoff/faq.html. The content lives in
// lib/faq.js; this file lays it out.
//
// SERVER-RENDERED ON PURPOSE. The prototype built the page in the browser with
// JavaScript. Here every question and answer is in the HTML Next.js sends, so
// search engines and link previews see the full text without running any
// scripts. The expand/collapse is the browser's built-in <details> element,
// which also needs no JavaScript. The only client-side piece is
// FaqHashOpener, which opens the question named in a #q12-style link.

import Link from "next/link";
import { Bricolage_Grotesque, Figtree } from "next/font/google";
import styles from "./faq.module.css";
import { FAQ_SECTIONS } from "../../lib/faq";
import FaqHashOpener from "../../components/FaqHashOpener";

// The prototype's own fonts. next/font downloads them at build time and serves
// them from our domain; see components/PayCalculator.js for more.
const headFont = Bricolage_Grotesque({ subsets: ["latin"], variable: "--font-head" });
const bodyFont = Figtree({ subsets: ["latin"], variable: "--font-body" });

const title = "Fire Job FAQ · Crew Map";
const description =
  "Plain answers about wildland fire jobs in the US: what the work is like, " +
  "what it pays, who qualifies, and how hiring works.";

export const metadata = {
  title,
  description,
  alternates: { canonical: "/faq" },
  openGraph: { title, description, url: "/faq", siteName: "Crew Map", type: "website" },
  twitter: { card: "summary", title, description },
};

// Number the questions q1, q2, ... in page order, the same way the prototype
// did, so its #q links keep working.
let n = 0;
const SECTIONS = FAQ_SECTIONS.map((sec) => ({
  ...sec,
  q: sec.q.map((q) => ({ ...q, id: "q" + ++n })),
}));

// FAQPage structured data (JSON-LD), a machine-readable copy of the questions
// and answers. Google no longer shows FAQ rich results, so this won't change
// how the page looks in search, but it's harmless and other tools may read it.
const jsonLd = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: SECTIONS.flatMap((sec) =>
    sec.q.map((q) => ({
      "@type": "Question",
      name: q.t,
      acceptedAnswer: { "@type": "Answer", text: q.a.join("\n\n") },
    })),
  ),
};

// Internal paths ("/map") get Next.js's <Link>, which opens in the same tab
// without a full page reload. Outside sites open in a new tab, as in the prototype.
function SmartLink({ href, children }) {
  if (href.startsWith("/")) return <Link href={href}>{children}</Link>;
  return (
    <a href={href} target="_blank" rel="noopener">
      {children}
    </a>
  );
}

export default function FaqPage() {
  return (
    <div className={`${styles.page} ${headFont.variable} ${bodyFont.variable}`}>
      <script
        type="application/ld+json"
        // JSON.stringify output is safe to inline once "<" is escaped, which
        // stops any text from closing the <script> tag early.
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }}
      />
      <FaqHashOpener />

      <main className={styles.main}>
        <h1>Getting a wildland fire job</h1>
        <p className={styles.lede}>
          Plain answers to the questions people ask before they apply: what the work is, what it pays, who
          qualifies, and how hiring works. Written for the United States.
        </p>
        <p className={styles.stamp}>
          Last reviewed November 2026. Hiring rules and pay tables change every year, so check each job posting.
        </p>

        {/* Section chips. Plain <a href="#..."> so the browser jumps within the page. */}
        <nav className={styles.chips} aria-label="Sections">
          {SECTIONS.map((sec) => (
            <a key={sec.id} href={"#" + sec.id}>
              {sec.title}
            </a>
          ))}
        </nav>

        {SECTIONS.map((sec) => (
          <section key={sec.id} id={sec.id} className={styles.section}>
            <h2>{sec.title}</h2>
            {sec.q.map((q) => (
              <details key={q.id} id={q.id} className={styles.q}>
                {/* The question is a real <h3> inside the clickable summary,
                    so the page has a proper heading outline. */}
                <summary>
                  <h3>{q.t}</h3>
                </summary>
                <div className={styles.body}>
                  <span className={styles.tag}>{q.tag === "o" ? "Official" : "Common advice"}</span>
                  {q.a.map((p, i) => (
                    <p key={i}>{p}</p>
                  ))}
                  {q.go && (
                    <p className={styles.go}>
                      <SmartLink href={q.go[1]}>{q.go[0]} →</SmartLink>
                    </p>
                  )}
                  {q.s.length > 0 && (
                    <p className={styles.src}>
                      Sources:{" "}
                      {q.s.map(([label, url], i) => (
                        <span key={url + i}>
                          {i > 0 && " · "}
                          <SmartLink href={url}>{label}</SmartLink>
                        </span>
                      ))}
                    </p>
                  )}
                </div>
              </details>
            ))}
          </section>
        ))}

        <footer className={styles.footer}>
          <p>
            Answers marked <b>Official</b> come from agency pages linked under them. Answers marked{" "}
            <b>Common advice</b> reflect what many applicants and crew members report, and may not match every
            unit. Nothing here is a hiring promise. See something out of date? Use the correction form on the{" "}
            <Link href="/map">map</Link>.
          </p>
        </footer>
      </main>
    </div>
  );
}
