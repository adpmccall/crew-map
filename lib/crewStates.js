// The states that have crews, with a crew count for each, for the text
// section under the map on /map (see app/map/page.js).
//
// WHY THIS EXISTS: the map loads its crews in the visitor's browser, so the
// HTML the server sends for /map had no crew information in it at all.
// Search engines read that HTML. This gives them a plain list of states.
//
// HOW OFTEN IT RUNS: NOT on every visit. app/map/page.js sets
// `revalidate = 86400`, so Next.js builds the page once, serves that saved
// copy to everyone, and rebuilds it in the background at most once a day.
// That's one small query a day, and the map loads exactly as fast as before.
//
// It only reads the `state` column, with the same public read-only key the
// map uses.

import { supabase } from "./supabaseClient";
import { titleCase } from "./formatting";

// Supabase returns at most 1,000 rows per request, so read in pages of 1,000
// until a short page says we've reached the end. (Today one page is enough;
// this keeps the list right as the table grows past that.)
const PAGE = 1000;

// Returns [{ name: "California", count: 102 }, ...] sorted by name,
// or null if the query fails (the page then shows the intro without the list,
// rather than failing to build).
export async function getCrewStates() {
  const counts = new Map(); // "CALIFORNIA" -> { name, count }
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from("crews")
      .select("state")
      .range(from, from + PAGE - 1);
    if (error) {
      console.error("getCrewStates: could not load states", error.message);
      return null;
    }
    for (const row of data) {
      const raw = (row.state || "").trim();
      if (!raw) continue; // a crew with no state isn't a state
      // Group by the uppercased name so "COLORADO" and "Colorado" count as one.
      const key = raw.toUpperCase();
      const entry = counts.get(key) || { name: titleCase(key), count: 0 };
      entry.count += 1;
      counts.set(key, entry);
    }
    if (data.length < PAGE) break;
  }
  return [...counts.values()].sort((a, b) => a.name.localeCompare(b.name));
}
