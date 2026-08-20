// The root layout wraps every page. In the Next.js App Router, this file must
// define the <html> and <body> tags for the whole app.
import "./globals.css";

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
      <body>{children}</body>
    </html>
  );
}
