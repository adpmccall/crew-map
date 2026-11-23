// The map, now at "/map".
//
// It used to live at "/". A landing page took that slot so people arriving cold
// get told what this is first — but the map itself is unchanged, and anyone who
// wants it directly can bookmark /map and never see the landing page again.
//
// BELOW THE MAP (SEO round 1, 2026-11): a short text section with the page's
// H1, an intro, and the states that have crews. The map loads in the browser,
// so before this the HTML that search engines read was just "Loading map…".
// The map itself is untouched and still fills the screen; this sits under it.

import dynamic from "next/dynamic";
import styles from "./mapAbout.module.css";
import { getCrewStates } from "../../lib/crewStates";

// Leaflet uses the browser's `window` object, which does not exist while
// Next.js renders pages on the server. `ssr: false` tells Next.js to load the
// map ONLY in the browser, which avoids "window is not defined" errors.
//
// The loading placeholder is screen-height, the same as the map, so the text
// section below doesn't jump up the page and then get pushed back down.
const CrewMap = dynamic(() => import("../../components/CrewMap"), {
  ssr: false,
  loading: () => <p className={styles.loading}>Loading map…</p>,
});

// Rebuild this page at most once a day (86,400 seconds). Everyone gets the
// saved copy in between, so the state list costs one small query a day, not
// one per visit. See lib/crewStates.js.
export const revalidate = 86400;

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

export default async function MapPage() {
  // null if the query failed; the section then just leaves the list out.
  const states = await getCrewStates();

  return (
    <>
      <CrewMap />

      <section className={styles.about} aria-labelledby="map-about-title">
        <div className={styles.inner}>
          <h1 id="map-about-title">Wildland fire crew map</h1>
          <p>
            Every US wildland fire crew we know about, on one map: hotshot, engine, helitack, smokejumper and
            other crews from federal, state, tribal and local agencies. Use the filters to narrow the map by
            state, region, crew type, housing or agency, and click a pin to see that crew&apos;s details. Turn
            on the hiring layer to see open federal fire jobs by town.
          </p>

          {states && states.length > 0 && (
            <>
              <h2>States and territories with crews on the map</h2>
              <ul className={styles.states}>
                {states.map((s) => (
                  <li key={s.name}>
                    {s.name} <span className={styles.count}>({s.count})</span>
                  </li>
                ))}
              </ul>
              <p className={styles.note}>
                Crew counts per state, updated daily. Coverage is thinnest outside the western regions, and
                we&apos;re filling it in.
              </p>
            </>
          )}
        </div>
      </section>
    </>
  );
}
