// The Hotshot Crew Hikes map, now at "/hikes" — its own page, separate from
// the main crew map at "/map". See components/HikesMap.js for why.

import dynamic from "next/dynamic";

// Same reason as app/map/page.js: Leaflet needs the browser's `window`,
// which doesn't exist while Next.js renders on the server.
const HikesMap = dynamic(() => import("../../components/HikesMap"), {
  ssr: false,
  loading: () => <p style={{ padding: 16 }}>Loading hikes…</p>,
});

export const metadata = {
  title: "Hotshot Crew Hikes · Crew Map",
  description:
    "Hotshot crews' signature PT/conditioning hikes — distance, elevation gain, and location, where we have them.",
};

export default function HikesPage() {
  return <HikesMap />;
}
