// The landing page ("/").
//
// The map moved to "/map" when this arrived. See components/Landing.js for why
// the older "the map IS the landing page" rule was retired: there are three
// things here now, and a cold visitor looking at 829 dots can't discover the
// other two.
//
// Plain server component — no Leaflet, so none of the ssr:false handling the
// map needs.

import Landing from "../components/Landing";

export const metadata = {
  title: "Crew Map — US wildland fire crews",
  description:
    "A map of wildland fire crews in the US: where they are, who they work for, " +
    "and what's hiring near them. Free, no account needed.",
};

export default function HomePage() {
  return <Landing />;
}
