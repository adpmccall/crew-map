-- jobs_filters_schema.sql — columns for the pay grade / salary / appointment filters.
--
-- WHY THIS EXISTS
--   The `jobs` table already stored `pay_grade`, `salary_min` and `salary_max`,
--   but not in a form you can filter on:
--     * pay_grade is a DISPLAY STRING ("GW 5-7"), so a range query can't use it;
--     * salary has no RATE INTERVAL, so the column mixes $23.20/hour rows with
--       $146,671/year rows — measured 54 hourly vs 46 annual across the live
--       corpus. Filtering or sorting that today gives wrong answers, not merely
--       incomplete ones;
--     * appointment type (permanent vs temporary) wasn't captured at all, even
--       though it's the single most discriminating field for a firefighter —
--       54% of current postings are temporary.
--
-- SAFE TO RE-RUN. Every statement is IF NOT EXISTS / idempotent, same shape as
-- atlas_schema.sql and agency_schema.sql.
--
-- HOW TO RUN
--   Supabase dashboard -> SQL Editor -> paste -> Run.
--
-- NO BACKFILL SCRIPT NEEDED. refresh_jobs.py runs daily on GitHub Actions and
-- upserts every row, so these columns populate on the next scheduled run once
-- the parsing change ships. Existing rows keep working meanwhile — every column
-- here is nullable.


-- === SALARY =================================================================
-- The posted figures stay exactly as posted: salary_min / salary_max plus the
-- interval they were quoted in. A seasonal posting keeps displaying "$23.20/hr"
-- because that is what it actually says.
--
-- The *_annual columns exist ONLY so sorting and range-filtering compare like
-- with like. They are never displayed.
--
-- Conversion (federal standard): PA x1 · PH x2087 · BW x26.0875 · PD x260.875
-- · PM x12. Intervals that cannot be annualized honestly (WC without
-- compensation, PW piece work, ST stipend, FB fee basis, SY school year) get
-- NULL here — those postings still display and still match every other filter,
-- they simply drop out of a salary RANGE query rather than being coerced into a
-- misleading number.
alter table jobs add column if not exists salary_interval   text;
alter table jobs add column if not exists salary_min_annual numeric;
alter table jobs add column if not exists salary_max_annual numeric;


-- === APPOINTMENT TYPE =======================================================
-- USAJOBS returns PositionOfferingType as a numeric code; the accompanying
-- Name is EMPTY on ~96% of postings, so the code is the only reliable signal.
-- Codes verified against the official list at
-- https://data.usajobs.gov/api/codelist/positionofferingtypes :
--     15317 Permanent · 15318 Temporary · 15319 Term · 15320 Detail
--     15321 Temporary promotion · 15322 Seasonal · 15327 Multiple
--     15522 Intermittent  (15 values in total)
--
-- Both the raw code and a resolved label are stored. The label is what the
-- filter uses; keeping the code means a value USAJOBS adds later is
-- diagnosable rather than silently collapsing into "Other".
--
-- Deliberately NO check constraint: unlike `crews.agency`, this vocabulary
-- belongs to USAJOBS, not to us, and they can extend it without warning.
alter table jobs add column if not exists appointment_code text;
alter table jobs add column if not exists appointment_type text;


-- CAREER-SEASONAL — a three-state flag, and the honesty matters here.
--
-- "Permanent career seasonal" is a real and important distinction for wildland
-- firefighters: it is a permanent appointment that works 6-11 months a year,
-- not year-round. USAJOBS codes it 15317 Permanent, identical to a true
-- year-round permanent job, and exposes the difference only in free text.
--
-- Measured across the live corpus: of 44 postings coded Permanent, just 3 say
-- "career seasonal" outright, 3 more mention seasonality some other way, and
-- 38 SAY NOTHING AT ALL. So this can be detected but never ruled out.
--
-- Hence three states, and note the missing one:
--     true  -> the posting explicitly says career seasonal
--     null  -> the posting doesn't say (the common case — NOT a denial)
--     false -> never written. Absence of the phrase is not evidence of
--              year-round work, and writing false would be a claim we cannot
--              support for 38 of 44 rows.
--
-- Consequence for the UI: do not build a "Permanent (year-round)" facet from
-- this. Surface it where stated; stay quiet where it isn't.
alter table jobs add column if not exists career_seasonal boolean;


-- === PAY GRADE ==============================================================
-- pay_grade (e.g. "GW 5-7") stays as the display string. These three add the
-- parts a range filter needs.
--
-- pay_plan is NOT assumed to be GW. The live corpus is GW 92 / GS 7 / NJ 1, and
-- GW itself officially covers "GS employees grades 1-15 paid wildland
-- firefighter special base rate per 5 USC 5332a on/after 3/23/25" — so the
-- grade range is 1-15 by definition, even though only 3-13 appear today. The UI
-- derives its range from the loaded data rather than hardcoding either bound.
alter table jobs add column if not exists pay_plan   text;
alter table jobs add column if not exists grade_low  integer;
alter table jobs add column if not exists grade_high integer;


-- === INDEXES ================================================================
-- The app reads the whole table once and filters in the browser, so these are
-- for ad-hoc SQL and future server-side filtering, not for the current UI.
create index if not exists jobs_appointment_type_idx on jobs (appointment_type);
create index if not exists jobs_pay_plan_idx         on jobs (pay_plan);
create index if not exists jobs_grade_low_idx        on jobs (grade_low);


-- Grants unchanged: these are just more columns on `jobs`, which already grants
-- select to anon/authenticated and all to service_role. Repeated so re-running
-- this file leaves a correct, self-contained state.
grant select on jobs to anon, authenticated;
grant all on jobs to service_role;


-- CHECK IT WORKED (all NULL until refresh_jobs.py next runs):
--   select appointment_type, count(*) from jobs group by 1 order by 2 desc;
--   select pay_plan, min(grade_low), max(grade_high) from jobs group by 1;
--   select salary_interval, count(*) from jobs group by 1;
