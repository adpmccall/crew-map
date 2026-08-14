// Filtering for the Hiring layer — pay grade, salary and appointment type.
//
// HOW THIS FITS THE MAP
//   The crew facets filter CREWS. These three filter POSTINGS — which decide
//   which posting pins appear on the map, and what a crew popup's "near here"
//   list contains. They never change which crews are drawn: a posting pin is
//   its own object now, not a property of a nearby crew.
//
// ONE PLACE owns this vocabulary, the way lib/agencies.js owns agencies, so the
// dropdown and the matching logic can never disagree.
//
// WHERE THE VALUES COME FROM: refresh_jobs.py, which reads them from USAJOBS
// and (for appointment type) resolves a numeric code against the official
// published code list. See jobs_filters_schema.sql for the column definitions.

// --- appointment type ---------------------------------------------------------
// The user-facing choice is deliberately just Permanent vs Temporary — that's
// the distinction that actually matters when you're deciding whether to take a
// fire job.
//
// USAJOBS is messier than that, so each option lists the raw values it accepts:
//   - "Temporary promotion" is a temporary assignment, so it belongs under
//     Temporary rather than becoming a third option nobody asked for.
//   - "Multiple" means the posting spans several appointment types. It honestly
//     belongs to neither, so it matches neither and drops out once you pick one
//     — the same way a crew with blank housing drops out once you pick Yes/No.
//     It's 1 posting in 100 today.
export const APPOINTMENT_FILTERS = [
  { value: "permanent", label: "Permanent", matches: ["Permanent"] },
  {
    value: "temporary",
    label: "Temporary",
    matches: ["Temporary", "Temporary promotion"],
  },
];

// --- salary -------------------------------------------------------------------
// A single "at least" threshold rather than checkboxes: nobody wants to tick
// eleven salary bands, and "pays at least X" is how people actually think.
//
// Compared against salary_max_annual — the TOP of the posting's range — so a
// posting that *can* reach the threshold qualifies. A GW 5-7 advertised at
// $48k-$81k counts as an $80k job, because it is one for the right candidate.
//
// The comparison uses the ANNUALIZED figure so hourly and yearly postings sort
// on one axis. The posted figure and its interval are stored untouched next to
// it, and that is what the popups display — a seasonal posting reads "$23.20/hr"
// on screen. The annualized number is never shown.
export const SALARY_THRESHOLDS = [
  { value: "40000", label: "$40,000+" },
  { value: "60000", label: "$60,000+" },
  { value: "80000", label: "$80,000+" },
  { value: "100000", label: "$100,000+" },
];

// --- pay grade ----------------------------------------------------------------
// Built FROM the loaded postings, never hardcoded. The corpus is GW 92 / GS 7 /
// NJ 1, and GW itself officially covers grades 1-15 even though only 2-13 appear
// today — so any fixed list would eventually be wrong. A posting spans a RANGE
// (grade_low..grade_high), so "GW 5-7" matches a search for 5, 6 or 7.
export function gradeOptionsFrom(jobs) {
  const present = new Set();
  for (const j of jobs) {
    const lo = j.grade_low;
    const hi = j.grade_high ?? j.grade_low;
    if (lo == null) continue;
    for (let g = lo; g <= hi; g++) present.add(g);
  }
  return [...present]
    .sort((a, b) => a - b)
    .map((g) => ({ value: String(g), label: `Grade ${g}` }));
}

// Pay plans actually present, so the label can say "GW" rather than implying
// every posting is one. Used for the layer's source line, not as a filter.
export function payPlansFrom(jobs) {
  return [...new Set(jobs.map((j) => j.pay_plan).filter(Boolean))].sort();
}

// --- the matcher --------------------------------------------------------------
// True when a posting passes EVERY active filter. An empty/blank filter doesn't
// narrow, matching how the crew facets already behave.
export function jobMatchesFilters(job, f) {
  // Appointment type: multi-select, OR within the facet.
  if (f.appointment?.length) {
    const ok = f.appointment.some((v) =>
      APPOINTMENT_FILTERS.find((a) => a.value === v)?.matches.includes(
        job.appointment_type
      )
    );
    if (!ok) return false;
  }

  // Pay grade: multi-select. The posting's grade RANGE must cover a checked
  // grade. A posting with no grade recorded drops out once a grade is picked.
  if (f.payGrade?.length) {
    const lo = job.grade_low;
    if (lo == null) return false;
    const hi = job.grade_high ?? lo;
    const ok = f.payGrade.some((g) => {
      const n = Number(g);
      return n >= lo && n <= hi;
    });
    if (!ok) return false;
  }

  // Salary: single "at least" threshold. A posting whose interval has no honest
  // annual equivalent (piece work, stipend, without compensation) has a NULL
  // annual figure and drops out here rather than being guessed at.
  if (f.salary) {
    const top = job.salary_max_annual ?? job.salary_min_annual;
    if (top == null || top < Number(f.salary)) return false;
  }

  return true;
}
