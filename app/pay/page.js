// The Fire Season Pay Calculator, at "/pay".
//
// A server component that only sets the page's metadata (title, description,
// link-preview tags) and renders the calculator. The calculator itself is a
// client component because it reacts to the sliders; see
// components/PayCalculator.js.

import PayCalculator from "../../components/PayCalculator";

// The tab/search title says "Wildland Firefighter Pay Calculator 2026" (the
// words people search for), while the page's own H1 stays "Fire Season Pay
// Calculator" (SEO round 1, owner-approved text).
const title = "Wildland Firefighter Pay Calculator 2026 · Crew Map";
const description =
  "Free wildland firefighter pay calculator. Estimate a season's pay from the " +
  "2026 GW table: grade, step, locality, overtime, hazard pay and incident days.";

// WebApplication structured data (JSON-LD): a machine-readable note telling
// search engines this page is a free tool. "FinanceApplication" is schema.org's
// category for money calculators; price 0 means free.
const jsonLd = {
  "@context": "https://schema.org",
  "@type": "WebApplication",
  name: "Fire Season Pay Calculator",
  description,
  url: "https://usfiremaps.com/pay",
  applicationCategory: "FinanceApplication",
  operatingSystem: "Any",
  offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
};

export const metadata = {
  title,
  description,
  // Relative paths become absolute via `metadataBase` in app/layout.js.
  alternates: { canonical: "/pay" },
  // Open Graph and Twitter tags control how a shared link looks in Facebook,
  // Reddit, iMessage, X and so on. No image yet, so the "summary" card type.
  openGraph: { title, description, url: "/pay", siteName: "Crew Map", type: "website" },
  twitter: { card: "summary", title, description },
};

export default function PayPage() {
  return (
    <>
      <script
        type="application/ld+json"
        // Escaping "<" stops any text from closing the <script> tag early
        // (same as app/faq/page.js).
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }}
      />
      <PayCalculator />
    </>
  );
}
