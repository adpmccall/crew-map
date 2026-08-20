// The root layout wraps every page. In the Next.js App Router, this file must
// define the <html> and <body> tags for the whole app.
import "./globals.css";

// Vercel Web Analytics — page views and referrers, nothing more.
//
// WHY IT'S HERE: nationwide coverage now depends on people finding the
// submission form and using it (see TODO_NOW). Without any measurement, "no
// submissions arrived" is ambiguous between "nobody saw it" and "people saw it
// and didn't bother" — and those call for opposite responses. This is the
// instrument for the strategy, not vanity metrics.
//
// It adds no fourth service: it's Vercel's own, on the same free tier that
// hosts the site. It sets no cookies and does no cross-site tracking, so it
// needs no consent banner — which matters on a site with no login that we'd
// rather keep frictionless.
import { Analytics } from "@vercel/analytics/react";

export const metadata = {
  // The site's own address. Next.js uses this to turn the relative URLs in
  // page metadata into absolute ones — which is what link previews and search
  // engines need. Without it, Next falls back to guessing from the deployment,
  // so a preview shared from the site could point at the .vercel.app host
  // instead of the real domain.
  metadataBase: new URL("https://usfiremaps.com"),
  title: "Crew Map",
  description:
    "Interactive map of US wildland fire crews — Forest Service, BLM, NPS, " +
    "tribal, state, county and local agencies",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        {children}
        {/* Last in <body> so it never delays the map or the form rendering. */}
        <Analytics />
      </body>
    </html>
  );
}
