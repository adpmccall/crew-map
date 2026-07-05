// The root layout wraps every page. In the Next.js App Router, this file must
// define the <html> and <body> tags for the whole app.
import "./globals.css";

export const metadata = {
  title: "Crew Map",
  description: "Interactive map of US Forest Service fire crews",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
