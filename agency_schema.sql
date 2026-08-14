-- agency_schema.sql — add an `agency` column to `crews`.
--
-- WHY THIS EXISTS
--   The `source` column records WHERE A ROW CAME FROM (usfs_official /
--   handcrew_atlas / user_submitted). It does NOT say which agency employs the
--   crew. Since the Handcrew Atlas merge, `crews` holds Forest Service, BLM,
--   NPS, BIA, tribal, FWS, state, county, local and NGO crews all mixed
--   together, with no way to filter by that. This column fixes that.
--
-- SAFE TO RE-RUN. Every statement is IF NOT EXISTS / idempotent, exactly like
-- atlas_schema.sql. Running it twice changes nothing the second time.
--
-- HOW TO RUN
--   Supabase dashboard -> SQL Editor -> paste -> Run.
--
-- WHAT IT DOES
--   1. Adds `agency` (text), defaulting to 'unknown'.
--   2. Backfills every existing row to 'unknown' so the column is never NULL.
--   3. Makes it NOT NULL and constrains it to a fixed vocabulary.
--   4. Indexes it (the filter groups by it; rollback selects by it).
--
--   It deliberately does NOT try to classify anything. Classification is the
--   job of agency_backfill_commit.py, which you run afterwards and can re-run
--   or roll back independently. Schema and data stay separate concerns.


-- 1. The column. 'unknown' is a real, meaningful value here, not a placeholder:
--    some crews genuinely have no agency evidence in the data, and the UI shows
--    an "Unknown" filter option rather than hiding that fact.
alter table public.crews
  add column if not exists agency text not null default 'unknown';


-- 2. Backfill. The default above already covers rows added from now on; this
--    catches any row that predates the column.
update public.crews
  set agency = 'unknown'
  where agency is null;


-- 3. The allowed vocabulary. Dropped and recreated so re-running picks up any
--    edit to the list.
--
--    A NOTE ON 'fws': it is listed here from the start as a first-class value,
--    not bolted on later, even though only 2 rows currently qualify. Phase 3
--    community submissions are expected to add more Fish and Wildlife Service
--    crews, and a schema change is a worse thing to need later than an unused
--    enum value is now.
--
--    'fws' covers US Fish and Wildlife Service under BOTH of its common
--    spellings — FWS and USFWS are the same agency and must never become two
--    categories. The classifier normalizes both to 'fws'.
--
--    'bia' and 'tribal' are deliberately separate. Tribal governments (the
--    Navajo Nation, the Klamath Tribes, Bay Mills Indian Community) are not the
--    Bureau of Indian Affairs; BIA is a federal bureau that administers and
--    funds fire programs on tribal land. Collapsing them would be factually
--    wrong.
alter table public.crews
  drop constraint if exists crews_agency_check;

alter table public.crews
  add constraint crews_agency_check check (agency in (
    'usfs',      -- US Forest Service
    'blm',       -- Bureau of Land Management
    'nps',       -- National Park Service
    'bia',       -- Bureau of Indian Affairs (the federal bureau)
    'tribal',    -- tribal governments, nations, bands, rancherias, consortia
    'fws',       -- US Fish and Wildlife Service (FWS and USFWS are ONE agency)
    'state',     -- state forestry / DNR / state parks / CAL FIRE / state corps
    'county',    -- county fire departments and county fire districts
    'local',     -- city fire departments, local fire protection districts
    'other',     -- non-profits and NGOs (e.g. The Nature Conservancy)
    'unknown'    -- no agency evidence in the data; shown honestly in the UI
  ));


-- 4. Index — the agency filter groups by this, and --rollback selects by it.
create index if not exists crews_agency_idx on public.crews (agency);


-- Grants are unchanged: `agency` is just another column on `crews`, which
-- already grants select to anon/authenticated and all to service_role. Listed
-- here only so re-running this file leaves a correct, self-contained state.
grant select on public.crews to anon, authenticated;
grant all on public.crews to service_role;


-- CHECK IT WORKED
--   select agency, count(*) from public.crews group by agency order by 2 desc;
-- Before running the backfill script this should read: unknown | 829
