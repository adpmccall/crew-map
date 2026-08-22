// The 404 page.
//
// Without this file Next.js serves its own built-in 404: black-on-white
// "404 | This page could not be found", no styling of ours, and — the part that
// actually matters — no link anywhere. Someone who mistypes a URL or follows a
// stale link hits a dead end and has to edit the address bar to get back, which
// on a phone is enough to make them give up.
//
// A plain server component: no data, no JavaScript needed to render it.

import Link from "next/link";

export const metadata = {
  title: "Page not found · Crew Map",
};

export default function NotFound() {
  return (
    <div className="message-page">
      <div className="message-card">
        <h1>That page isn&apos;t here</h1>
        <p>
          The link may be old, or the address may have a typo in it. The map is
          still where it always is.
        </p>
        <p className="message-actions">
          <Link className="message-cta" href="/map">
            Open the map →
          </Link>
          <Link className="message-link" href="/">
            Start from the beginning
          </Link>
        </p>
      </div>
    </div>
  );
}
