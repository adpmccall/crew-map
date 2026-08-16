// The "/submit" route — a public form for proposing a crew.
//
// The map is still the landing page; this is a separate page you only reach by
// following the link on it. Nothing here changes what "/" does.
//
// Unlike the map, this page has no Leaflet in it, so it needs no ssr:false
// dance — the form is a normal client component.

import SubmitForm from "../../components/SubmitForm";

export const metadata = {
  title: "Add a crew · Crew Map",
  description:
    "Submit a wildland fire crew that's missing from the map. Reviewed before it appears.",
};

export default function SubmitPage() {
  return <SubmitForm />;
}
