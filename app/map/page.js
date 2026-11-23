// The map, now at "/map".
//
// It used to live at "/". A landing page took that slot so people arriving cold
// get told what this is first — but the map itself is unchanged, and anyone who
// wants it directly can bookmark /map and never see the landing page again.

import dynamic from "next/dynamic";

// Leaflet uses the browser's `window` object, which does not exist while
// Next.js renders pages on the server. `ssr: false` tells Next.js to load the
// map ONLY in the browser, which avoids "window is not defined" errors.
const CrewMap = dynamic(() => import("../../components/CrewMap"), {
  ssr: false,
  loading: () => <p style={{ padding: 16 }}>Loading map…</p>,
});

// /map had no metadata of its own, so it was showing the site-wide default
// title and description from app/layout.js. (SEO round 1, owner-approved text.)
const title = "Wildland Fire Crew Map: Find US Crews and Open Jobs · Crew Map";
const description =
  "Find US wildland fire crews on a map: hotshot, engine, helitack and more, " +
  "with agency, location and contact details, plus open federal fire jobs.";

export const metadata = {
  title,
  description,
  // Without this, /map?hiring=1 and /map could be indexed as two pages.
  alternates: { canonical: "/map" },
  openGraph: { title, description, url: "/map", siteName: "Crew Map", type: "website" },
  twitter: { card: "summary", title, description },
};

export default function MapPage() {
  return <CrewMap />;
}
