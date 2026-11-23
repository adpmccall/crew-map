// The math behind the Fire Season Pay Calculator (/pay).
//
// This is a copy of estimate() from the prototype (handoff/pay-estimator.html,
// between ESTIMATE-START and ESTIMATE-END), with `var` changed to `const` and
// the numbers moved to lib/payData.js. lib/pay.test.mjs checks known values,
// so run `npm test` after any change here.
//
// ONE DELIBERATE CHANGE from the prototype (owner decision, 2026-11-23):
// overtime is a flat 1.5 x the basic rate, with NO limit. The prototype
// copied OPM's table, which caps overtime at 1.5 x grade 10 step 1, but that
// cap only applies to FLSA-exempt employees. Wildland firefighters are
// FLSA non-exempt, so the calculator assumes that and the page says so.
// The overtime rate is figured from the basic rate only; hazard pay is not
// included in it.
//
// No React in this file on purpose, so the tests can run it with plain Node.

import { RATES, RUS_PCT, IRP_ANNUAL_CAP } from "./payData.js";

// Round to cents. The tiny 1e-7 nudge stops values like 56.175 (which a
// computer actually stores as 56.17499999...) from rounding down.
export function r2(x) {
  return Math.round(x * 100 + 1e-7) / 100;
}

// ESTIMATE-START
// Locality rate = RUS rate scaled by (1 + locality) / (1 + RUS locality), rounded to cents.
// Overtime = 1.5 x basic rate, uncapped (FLSA non-exempt; see the note above).
// IRP rate ceiling = grade 10 step 10 in the locality.
//
// Input `i`: { pct, grade, step, weeks, ot, haz, irp }
//   pct   locality percent (e.g. 30.52)    weeks  season length in weeks
//   grade 3-12, step 1-10                  ot     overtime hours for the season
//   haz   % of all hours with hazard pay   irp    incident assignment days
export function estimate(i) {
  const f = (1 + i.pct / 100) / (1 + RUS_PCT / 100);
  const b = r2(RATES[i.grade][i.step - 1] * f);
  const irpCeil = r2(RATES[10][9] * f);
  const baseHours = i.weeks * 40;
  const base = baseHours * b;
  const otRate = r2(b * 1.5);
  const ot = i.ot * otRate;
  const firelineHours = (baseHours + i.ot) * (i.haz / 100);
  const hazard = firelineHours * b * 0.25;
  const irpDaily = 4.5 * Math.min(b, irpCeil);
  const irpRaw = i.irp * irpDaily;
  const irp = Math.min(irpRaw, IRP_ANNUAL_CAP);
  const total = base + ot + hazard + irp;
  return {
    b, baseHours, base, otRate, ot, firelineHours,
    hazard, irpDaily, irp, irpCapped: irpRaw > IRP_ANNUAL_CAP, total,
  };
}
// ESTIMATE-END
