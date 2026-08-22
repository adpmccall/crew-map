"use client";

// The error boundary for the whole app.
//
// WHAT THIS REPLACES. Without an error.js, an unhandled exception anywhere in a
// client component leaves Next.js to render its own fallback, which in
// PRODUCTION is the single line:
//
//     Application error: a client-side exception has occurred
//     (see the browser console for more information)
//
// That is a developer's message shown to a stranger. It tells a firefighter
// nothing they can act on, and "see the browser console" reads as though the
// site expects them to debug it.
//
// WHAT IT DOES INSTEAD. Says something went wrong in plain words, and gives two
// ways out: `reset()` re-renders the failed part of the tree without a full page
// reload (usually enough for a transient failure), and a link to the map.
//
// The real error still reaches the console and Vercel's logs — this changes
// only what the visitor sees.

import Link from "next/link";
import { useEffect } from "react";

export default function Error({ error, reset }) {
  useEffect(() => {
    // Keep the detail available to us without putting it on screen.
    console.error("Unhandled error:", error);
  }, [error]);

  return (
    <div className="message-page">
      <div className="message-card">
        <h1>Something went wrong</h1>
        <p>
          That&apos;s on us, not on you. Trying again usually sorts it — most of
          these are a connection hiccup rather than a real fault.
        </p>
        <p className="message-actions">
          <button className="message-cta" type="button" onClick={() => reset()}>
            Try again
          </button>
          <Link className="message-link" href="/map">
            Go to the map
          </Link>
        </p>
      </div>
    </div>
  );
}
