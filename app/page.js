"use client";

// This is the landing page (the "/" route). The map IS the landing page:
// visiting the site shows it immediately — no homepage, no splash, no login.

import dynamic from "next/dynamic";

// Leaflet uses the browser's `window` object, which does not exist while
// Next.js renders pages on the server. `ssr: false` tells Next.js to load the
// map ONLY in the browser, which avoids "window is not defined" errors.
const CrewMap = dynamic(() => import("../components/CrewMap"), {
  ssr: false,
  loading: () => <p style={{ padding: 16 }}>Loading map…</p>,
});

export default function HomePage() {
  return <CrewMap />;
}
