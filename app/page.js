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
  // Kept in step with the on-page copy: the "free, no account" line was
  // dropped from the hero, so it goes from here too. This string isn't visible
  // on the page but it is what search results and link previews show.
  description:
    "A map of wildland fire crews in the US: where they are, who they work for, " +
    "and what's hiring near them.",
  // Pin the canonical URL to the bare domain. www.usfiremaps.com serves the
  // same site via a redirect, so without this a search engine could index both
  // and split them. `metadataBase` in layout.js makes this relative path
  // absolute.
  alternates: { canonical: "/" },
};

export default function HomePage() {
  return <Landing />;
}
