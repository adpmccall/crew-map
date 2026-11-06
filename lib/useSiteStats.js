"use client";

// Live numbers for the homepage, read straight from Supabase with the
// same public (anon) key the map uses. Nothing is hardcoded: a written crew
// count goes stale the day a submission is approved (see CLAUDE.md).
//
// Returns null for every number until it loads, so the page can show a quiet
// placeholder instead of a misleading "0".

import { useEffect, useState } from "react";
import { supabase } from "./supabaseClient";

export default function useSiteStats() {
  const [stats, setStats] = useState({
    crews: null,
    states: null,
    agencies: null,
    jobs: null,
    hikes: null,
  });

  useEffect(() => {
    async function load() {
      // `head: true` + `count: "exact"` asks Postgres for just the row count,
      // without downloading the rows themselves.
      const [crewRows, jobs, hikes] = await Promise.all([
        // States and agencies need the actual values to count DISTINCT ones,
        // so this one fetches two small columns for every crew (under 1,000
        // rows, which is Supabase's default page size).
        supabase.from("crews").select("state, agency"),
        supabase.from("jobs").select("*", { count: "exact", head: true }),
        supabase.from("hikes").select("*", { count: "exact", head: true }),
      ]);

      const rows = crewRows.data || [];
      const distinct = (key) =>
        new Set(rows.map((r) => (r[key] || "").trim()).filter(Boolean)).size;

      setStats({
        crews: crewRows.error ? null : rows.length,
        states: crewRows.error ? null : distinct("state"),
        // "unknown" is an honest label, not a real agency, so it isn't counted.
        agencies: crewRows.error
          ? null
          : new Set(
              rows
                .map((r) => (r.agency || "").trim())
                .filter((a) => a && a !== "unknown")
            ).size,
        jobs: jobs.error ? null : jobs.count,
        hikes: hikes.error ? null : hikes.count,
      });
    }

    load();
  }, []);

  return stats;
}

// The number once loaded, "…" before, so the page never shows a fake 0.
export function fmt(n) {
  return n == null ? "…" : n.toLocaleString("en-US");
}
