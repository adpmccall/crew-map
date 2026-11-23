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
import { LOCALITIES } from "../lib/payData";
import { FAQ_SECTIONS } from "../lib/faq";

// The counts printed on the Pay and FAQ cards ("58 pay areas", "33 plain
// answers"), taken from the real data so they can't go stale. They're counted
// HERE, on the server, and passed down: Landing is a client component, and
// importing lib/faq.js there would ship the whole FAQ text to every visitor's
// browser just to count it.
const PAY_AREAS = LOCALITIES.length;
const FAQ_COUNT = FAQ_SECTIONS.reduce((sum, sec) => sum + sec.q.length, 0);

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

// WebSite structured data (JSON-LD): tells search engines the site's name, so
// results can show "Crew Map" instead of the bare domain.
const jsonLd = {
  "@context": "https://schema.org",
  "@type": "WebSite",
  name: "Crew Map",
  url: "https://usfiremaps.com",
};

export default function HomePage() {
  return (
    <>
      <script
        type="application/ld+json"
        // Escaping "<" stops any text from closing the <script> tag early.
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }}
      />
      <Landing payAreas={PAY_AREAS} faqCount={FAQ_COUNT} />
    </>
  );
}
