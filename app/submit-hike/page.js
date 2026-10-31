// The "/submit-hike" route -- a public form for adding a crew's PT hike.
// Only reachable meaningfully as /submit-hike?crew=<id>, via the link in that
// crew's map popup. See components/SubmitHikeForm.js for why there's no crew
// picker on this page.

import SubmitHikeForm from "../../components/SubmitHikeForm";

export const metadata = {
  title: "Add a crew's PT hike · Crew Map",
  description:
    "Submit a hotshot crew's signature conditioning hike as a .gpx file. Reviewed before it appears on the map.",
};

export default function SubmitHikePage() {
  return <SubmitHikeForm />;
}
