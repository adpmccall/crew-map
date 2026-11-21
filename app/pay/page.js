// The Fire Season Pay Calculator, at "/pay".
//
// A server component that only sets the page's metadata (title, description,
// link-preview tags) and renders the calculator. The calculator itself is a
// client component because it reacts to the sliders; see
// components/PayCalculator.js.

import PayCalculator from "../../components/PayCalculator";

const title = "Fire Season Pay Calculator · Crew Map";
const description =
  "Estimate a federal wildland firefighter's season pay from the 2026 GW " +
  "tables: grade, step, locality, overtime, hazard pay, and incident " +
  "assignment days.";

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
  return <PayCalculator />;
}
