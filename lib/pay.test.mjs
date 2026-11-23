// Tests for lib/pay.js. Run with:  npm test
//
// Uses Node's built-in test runner (node:test), so there is nothing to
// install. The expected values were checked against OPM's 2026 tables. When
// the tables change in January, update these numbers along with
// lib/payData.js.
//
// Money is compared rounded to the cent, because adding up decimals on a
// computer leaves tiny leftovers (57466.399999... instead of 57466.40).

import { test } from "node:test";
import assert from "node:assert/strict";
import { estimate } from "./pay.js";

const cents = (n) => Math.round(n * 100) / 100;

// The page's default inputs, at a given locality, grade and step.
const season = (pct, grade, step) => ({
  pct, grade, step, weeks: 26, ot: 700, haz: 60, irp: 28,
});

const RUS = 17.06;
const DENVER = 30.52;

test("Rest of U.S. grade 4 step 1, default season, totals $57,466.40", () => {
  assert.equal(cents(estimate(season(RUS, 4, 1)).total), 57466.4);
});

test("Denver grade 4 step 1 basic rate is $25.87", () => {
  assert.equal(estimate(season(DENVER, 4, 1)).b, 25.87);
});

test("Denver grade 9 step 1 basic rate is $38.91", () => {
  assert.equal(estimate(season(DENVER, 9, 1)).b, 38.91);
});

// Overtime is a flat 1.5 x basic with no cap (FLSA non-exempt, owner decision
// 2026-11-23). These two used to expect OPM's capped FLSA-exempt figures
// ($62.64 and $57.66); they now check that higher grades are NOT capped.
test("Denver grade 9 step 4 overtime rate is $64.20 (1.5 x $42.80, no cap)", () => {
  assert.equal(estimate(season(DENVER, 9, 4)).otRate, 64.2);
});

test("Rest of U.S. grade 12 step 8 overtime rate is $86.49 (1.5 x $57.66, no cap)", () => {
  assert.equal(estimate(season(RUS, 12, 8)).otRate, 86.49);
});
