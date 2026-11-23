"use client";

// The Fire Season Pay Calculator (/pay).
//
// Ported from the prototype in handoff/pay-estimator.html. The layout, wording
// and colors are the prototype's; this file only turns its "find element by id
// and set its text" script into React state.
//
// WHERE THINGS LIVE:
//   lib/payData.js  the rates and locality percentages (update every January)
//   lib/pay.js      estimate(), the math (tested by lib/pay.test.mjs)
//   this file       the inputs and the result panel
//
// It's a client component ("use client") because the sliders and dropdowns
// recalculate as you move them, which needs the browser. The page around it
// (app/pay/page.js) stays a server component so the title and description
// are in the HTML for search engines and link previews.

import { useState } from "react";
import Link from "next/link";
import { Inter, Space_Grotesk } from "next/font/google";
import styles from "./PayCalculator.module.css";
import { RATES, RUS_PCT, LOCALITIES, LAST_REVIEWED } from "../lib/payData";
import { estimate } from "../lib/pay";

// next/font downloads these at BUILD time and serves them from our own domain,
// so visitors' browsers never contact Google. `variable` exposes each font as a
// CSS variable that PayCalculator.module.css picks up.
const headFont = Space_Grotesk({
  subsets: ["latin"],
  weight: ["500", "700"],
  variable: "--font-head",
});
const bodyFont = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-body",
});

const GRADES = Object.keys(RATES).map(Number); // [3, 4, ... 12]
const STEPS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
const OT_PRESETS = [
  { v: 300, label: "Light: 300" },
  { v: 500, label: "Moderate: 500" },
  { v: 700, label: "Heavy: 700" },
];

// Money formats, same as the prototype: whole dollars for totals, cents for rates.
function usd(n) {
  return "$" + Math.round(n).toLocaleString("en-US");
}
function usd2(n) {
  return "$" + n.toFixed(2);
}

export default function PayCalculator() {
  // Defaults match the prototype: Rest of U.S., grade 4 step 1, 26 weeks,
  // 700 overtime hours, 60% hazard, 28 assignment days.
  const [locIdx, setLocIdx] = useState(0);
  const [grade, setGrade] = useState(4);
  const [step, setStep] = useState(1);
  const [weeks, setWeeks] = useState(26);
  const [ot, setOt] = useState(700);
  const [haz, setHaz] = useState(60);
  const [irp, setIrp] = useState(28);

  const [locName, pct] = LOCALITIES[locIdx];
  const inputs = { pct, grade, step, weeks, ot, haz, irp };
  const r = estimate(inputs);
  // The same season in the Rest of U.S. area, for the "adds X% locality" note.
  const rus = estimate({ ...inputs, pct: RUS_PCT });

  const months = weeks / 4.345;
  const diff = r.total - rus.total;

  // The four slices of the bar and rows of the table.
  const parts = [
    { name: "Base pay", v: r.base, c: "var(--c-base)", how: r.baseHours + " hrs at " + usd2(r.b) },
    {
      name: "Overtime",
      v: r.ot,
      c: "var(--c-ot)",
      how: ot.toLocaleString("en-US") + " hrs at " + usd2(r.otRate),
    },
    {
      name: "Hazard pay",
      v: r.hazard,
      c: "var(--c-haz)",
      how: Math.round(r.firelineHours).toLocaleString("en-US") + " hazard pay hrs at 25% of " + usd2(r.b),
    },
    {
      name: "Incident premium",
      v: r.irp,
      c: "var(--c-irp)",
      how: irp + " days at " + usd2(r.irpDaily) + (r.irpCapped ? ", limited by annual cap" : ""),
    },
  ];

  return (
    <div className={`${styles.page} ${headFont.variable} ${bodyFont.variable}`}>
      <div className={styles.wrap}>
        <header>
          <p className={styles.back}>
            <Link href="/">← Back to home</Link>
          </p>
          <h1>Fire Season Pay Calculator</h1>
          <p className={styles.lede}>
            Estimate what a federal wildland firefighter season could pay in gross dollars, based on grade,
            locality, overtime hours, time receiving hazard pay, and incident assignments. Example values are
            loaded so you can see how it works; change anything.
          </p>
        </header>

        <div className={styles.grid}>
          <section className={styles.panel} aria-label="Inputs">
            <h2>Your season</h2>
            <div className={styles.field}>
              <label htmlFor="loc">Locality pay area</label>
              <select id="loc" value={locIdx} onChange={(e) => setLocIdx(+e.target.value)}>
                {LOCALITIES.map(([name, p], idx) => (
                  <option key={name} value={idx}>
                    {(idx === 0 ? "Rest of U.S. (default)" : name) + " (" + p.toFixed(2) + "%)"}
                  </option>
                ))}
              </select>
              <p className={styles.hint}>
                Pick the area that covers the duty station in the job posting. Locality pay is added on top of
                the base rate and ranges from 17% to 46% depending on the area.
              </p>
            </div>
            <div className={styles.row}>
              <div className={styles.field}>
                <label htmlFor="grade">Grade</label>
                <select id="grade" value={grade} onChange={(e) => setGrade(+e.target.value)}>
                  {GRADES.map((g) => (
                    <option key={g} value={g}>Grade {g}</option>
                  ))}
                </select>
              </div>
              <div className={styles.field}>
                <label htmlFor="step">Step</label>
                <select id="step" value={step} onChange={(e) => setStep(+e.target.value)}>
                  {STEPS.map((s) => (
                    <option key={s} value={s}>Step {s}</option>
                  ))}
                </select>
              </div>
            </div>
            <p className={styles.hint}>
              Older articles and some postings say GS. Since 2025 wildland firefighters are paid from the GW table,
              and this calculator uses it. <span>Basic rate {usd2(r.b)}/hr. Overtime {usd2(r.otRate)}/hr.</span>
            </p>

            <div className={styles.field}>
              <div className={styles.lblrow}>
                <label htmlFor="weeks">Season length</label>
                <span className={styles.val}>{weeks} weeks</span>
              </div>
              <input type="range" id="weeks" min="8" max="52" step="1" value={weeks}
                onChange={(e) => setWeeks(+e.target.value)} />
              <p className={styles.hint}>
                Weeks at 40 base hours. Seasonal appointments often run about six months, and some positions work
                year round.
              </p>
            </div>

            <div className={styles.field}>
              <div className={styles.lblrow}>
                <label htmlFor="ot">Overtime hours</label>
                <span className={styles.val}>{ot.toLocaleString("en-US")} hrs</span>
              </div>
              <input type="range" id="ot" min="0" max="1400" step="25" value={ot}
                onChange={(e) => setOt(+e.target.value)} />
              <div className={styles.presets} role="group" aria-label="Overtime presets">
                {OT_PRESETS.map((p) => (
                  <button key={p.v} className={styles.pre} type="button" aria-pressed={ot === p.v}
                    onClick={() => setOt(p.v)}>
                    {p.label}
                  </button>
                ))}
              </div>
              <p className={styles.hint}>
                Reported season totals vary widely by crew and fire year. Ask the crew you are applying to what
                their recent seasons looked like.
              </p>
            </div>

            <div className={styles.field}>
              <div className={styles.lblrow}>
                <label htmlFor="haz">Percentage of time receiving hazard pay</label>
                <span className={styles.val}>{haz}%</span>
              </div>
              <input type="range" id="haz" min="0" max="100" step="5" value={haz}
                onChange={(e) => setHaz(+e.target.value)} />
              <p className={styles.hint}>
                Share of all hours that qualify for hazard pay, such as time on a wildfire fireline or prescribed
                fire during ignition and holding.
              </p>
            </div>

            <div className={styles.field}>
              <div className={styles.lblrow}>
                <label htmlFor="irp">Incident assignment days</label>
                <span className={styles.val}>{irp} days</span>
              </div>
              <input type="range" id="irp" min="0" max="90" step="1" value={irp}
                onChange={(e) => setIrp(+e.target.value)} />
              <p className={styles.hint}>
                Days away overnight on a qualifying incident assignment. Two 14-day assignments is 28.
              </p>
            </div>
          </section>

          <section className={styles.panel} aria-label="Estimate" aria-live="polite">
            <div className={styles.total}>
              <span className={styles.lbl}>Estimated gross pay</span>
              <span className={styles.big}>{usd(r.total)}</span>
              <span className={styles.sub}>
                About {usd(r.total / months)} per month, {usd2(r.total / (r.baseHours + ot))} per hour worked.
              </span>
            </div>
            <div className={styles.loc}>
              {pct === RUS_PCT
                ? "Rest of U.S. locality (" + pct.toFixed(2) + "%). Most other areas pay more, so check your duty station's area."
                : locName + " adds " + pct.toFixed(2) + "% locality pay. That is about " + usd(diff) +
                  " more per season than the same job in the Rest of U.S. area (" + RUS_PCT.toFixed(2) + "%)."}
            </div>
            <div className={styles.bar} role="img" aria-label="Share of pay by source">
              {parts.map((p) => (
                <span key={p.name}
                  style={{ width: (r.total > 0 ? (p.v / r.total) * 100 : 0) + "%", background: p.c }} />
              ))}
            </div>
            <div className={styles.tablewrap}>
              <table>
                <tbody>
                  {parts.map((p) => (
                    <tr key={p.name}>
                      <th scope="row">
                        <span className={styles.sw} style={{ background: p.c }} />
                        {p.name}
                        <div className={styles.how}>{p.how}</div>
                      </th>
                      <td className={styles.num}>{usd(p.v)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>

        {/* Internal links (same site, same tab). */}
        <p className={styles.next}>
          Want to see who is hiring near you? <Link href="/map?hiring=1">Open jobs on the map</Link>. Questions
          about how the job works? <Link href="/faq">Read the FAQ</Link>.
        </p>

        <section className={styles.notes} aria-label="Assumptions and sources">
          <h2>What this includes and leaves out</h2>
          <ul>
            <li>
              Uses the 2026 wildland firefighter (GW) special base rates, grades 3 to 12, with the locality
              percentage for the area you pick. Rates for areas other than Rest of U.S. are calculated from
              OPM&apos;s Rest of U.S. table and can differ from OPM&apos;s published table by a few cents.
            </li>
            <li>
              Locality is set by the duty station. Remote or detailed work can differ, and OPM&apos;s rules
              define which counties fall in each area (5 CFR 591.205).
            </li>
            <li>
              Overtime is 1.5 times the basic hourly rate. This assumes the position is FLSA non-exempt, which the
              job posting lists. Other pay rules can apply to some positions, so confirm with your unit&apos;s
              payroll.
            </li>
            <li>
              Hazard pay is 25 percent of the basic hourly rate for qualifying hours. Prescribed fire ignition and
              holding became eligible under a rule OPM finalized in August 2026, with preparation work excluded.
            </li>
            <li>
              Incident Response Premium Pay is 4.5 times the basic hourly rate per qualifying day, with no partial
              days, and is limited by a per-day rate ceiling (the grade 10 step 10 rate, GW table) and an annual
              cap. The $9,000 annual cap shown is the 2025 figure in the Interior guide, so confirm the current
              year. Scaling the rate ceiling by locality is an assumption.
            </li>
            <li>
              Left out: taxes, night and Sunday differentials, standby, retention pay, and benefits. Seasonal
              appointment hour limits, if any, are set in each job posting.
            </li>
            <li>
              Sources:{" "}
              <a href="https://www.opm.gov/policy-data-oversight/pay-leave/salaries-wages/salary-tables/26Tables/html/RUS%20%28GW%29_h.aspx"
                target="_blank" rel="noopener">OPM 2026 RUS (GW) hourly table</a>,{" "}
              <a href="https://www.opm.gov/policy-data-oversight/pay-leave/salaries-wages/2026/wildland-firefighter/"
                target="_blank" rel="noopener">OPM 2026 wildland firefighter tables</a> (locality tables), a{" "}
              <a href="https://fedpayscale.org/gs/locality/" target="_blank" rel="noopener">locality percentage list</a>{" "}
              checked against OPM for Rest of U.S., Denver, and the 17.06 to 46.34 percent range,{" "}
              <a href="https://www.bia.gov/sites/default/files/media_document/attachment-irp_doi_guide_final_draft_june_2025_section508.pdf"
                target="_blank" rel="noopener">Interior Incident Response Premium Pay guide</a>.
            </li>
          </ul>
          <p className={styles.foot}>
            Last reviewed {LAST_REVIEWED}. This is an estimate, not an offer or an official pay statement. Confirm
            against the job posting and with the hiring agency.
          </p>
        </section>
      </div>
    </div>
  );
}
