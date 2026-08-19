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

export default function MapPage() {
  return <CrewMap />;
}
