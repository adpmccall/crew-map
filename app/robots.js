// robots.txt, served at https://usfiremaps.com/robots.txt.
//
// robots.txt tells search engines (and other crawlers) what they may visit.
// Next.js turns this file into the plain-text file automatically.
//
// EVERYTHING IS ALLOWED, on purpose (owner decision, SEO round 1, 2026-11).
// That includes AI search crawlers (GPTBot, OAI-SearchBot, ClaudeBot,
// Claude-SearchBot, PerplexityBot, Google-Extended): the site is a free public
// resource and the goal is for people to find it, wherever they search. Don't
// add Disallow rules for them without asking the owner.
//
// There's no /api/ route in this app, so there's nothing to hide. If one is
// ever added, add `disallow: "/api/"` below.
//
// The sitemap line points crawlers at app/sitemap.js's list of pages.

export default function robots() {
  return {
    rules: { userAgent: "*", allow: "/" },
    sitemap: "https://usfiremaps.com/sitemap.xml",
  };
}
