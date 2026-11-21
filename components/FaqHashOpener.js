"use client";

// Opens the FAQ question named in the URL, e.g. /faq#q12.
//
// Each question is a <details id="q12"> element, which starts closed. The
// browser scrolls to #q12 by itself, but it won't OPEN it, so this does. It
// runs once when the page loads, and again whenever the hash changes (someone
// pastes a new #q link, or uses back/forward). Section links like #pay point
// at a <section>, not a <details>, so they're left alone.
//
// It renders nothing. It's a separate client component so the FAQ page itself
// can stay server-rendered, with every answer in the HTML.

import { useEffect } from "react";

export default function FaqHashOpener() {
  useEffect(() => {
    function openFromHash() {
      const id = window.location.hash.slice(1);
      if (!id) return;
      const el = document.getElementById(id);
      if (el && el.tagName === "DETAILS") {
        el.open = true;
        el.scrollIntoView();
      }
    }
    openFromHash();
    window.addEventListener("hashchange", openFromHash);
    return () => window.removeEventListener("hashchange", openFromHash);
  }, []);

  return null;
}
