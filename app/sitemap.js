// The sitemap, served at https://usfiremaps.com/sitemap.xml.
//
// A sitemap is a plain list of the site's pages for search engines. Next.js
// turns this file into the XML automatically. Submit the URL once in Google
// Search Console (and Bing Webmaster Tools) so they find every page.
//
// Only the main public pages. Not /submit-hike, which you reach from a hike
// on the map, and not individual crews (they're pins, not pages).
// Add a line here when a new top-level page goes live.

const SITE = "https://usfiremaps.com";

const PATHS = ["/", "/map", "/hikes", "/submit", "/faq", "/pay"];

export default function sitemap() {
  return PATHS.map((path) => ({ url: SITE + path }));
}
