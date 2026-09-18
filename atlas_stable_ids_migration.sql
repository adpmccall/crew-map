-- atlas_stable_ids_migration.sql — stop Atlas crew ids from changing on every
-- `atlas_import.py --commit` re-run, and make a deleted-but-referenced Atlas
-- crew a loud error instead of a silent orphan.
--
-- THE BUG THIS FIXES
--   atlas_import.py currently does, on every --commit:
--       delete from crews where source = 'handcrew_atlas';   -- ALL of them
--       insert ...                                            -- ALL of them back
--   Postgres hands out a brand-new `id` to every inserted row. So EVERY
--   Atlas-sourced crew (currently 389) gets a new id on every single re-run,
--   whether or not the source KMZ actually changed anything. Any
--   crew_submissions row whose crew_id points at one of those crews (a
--   correction report) is orphaned the moment someone re-runs the import —
--   not just the crews a correction happens to target today.
--
-- THE FIX (two parts, this file is part 1 and 3 of 3 — see the STEP markers)
--   1. Give every Atlas row a KEY that's stable across re-runs of the *same*
--      source placemark: md5(name|lat rounded to 4dp|lon rounded to 4dp).
--      atlas_import.py is rewritten (separate file) to UPSERT by this key
--      instead of delete-all/insert-all — a placemark that hasn't changed
--      keeps its row's `id` forever.
--   2. crew_submissions.crew_id gets a real foreign key to crews(id) with
--      ON DELETE RESTRICT: if a crew that still has an open submission or
--      correction against it would be removed (by a rollback, or because an
--      Atlas placemark disappeared from a later KMZ export), the DELETE is
--      REFUSED with a clear error instead of silently succeeding and leaving
--      crew_id pointing at nothing. Chosen over ON DELETE SET NULL / CASCADE
--      on purpose: a blocked delete is something a human can act on; a
--      correction silently pointing at a dead id is a problem nobody notices
--      until much later — which is the whole reason this file exists.
--
-- CONSEQUENCE WORTH KNOWING BEFORE YOU RUN ANYTHING BELOW: once RESTRICT is
-- in place, a single bulk `delete from crews where source = 'handcrew_atlas'`
-- (what --rollback currently runs) becomes all-or-nothing — ONE blocked row
-- anywhere in the batch rolls back the WHOLE statement, deleting zero rows.
-- The rewritten atlas_import.py deletes Atlas rows one at a time for exactly
-- this reason (so one blocked crew doesn't block the other 388). This SQL
-- file does not change do_rollback()'s behavior — that's in the .py rewrite.
--
-- SAFE TO RE-RUN. `add column if not exists` / `create ... if not exists`
-- throughout, so running this twice does nothing the second time.
--
-- HOW TO RUN — in the Supabase SQL Editor, in order, with a pause between:
--   1. Run the "STEP 1" block below now.
--   2. Then run  backfill_atlas_key.py --commit  locally (see that file) —
--      it populates atlas_key on the 389 existing Atlas rows. Read its dry
--      run output first; it will tell you here if it finds a collision.
--   3. Only once the backfill is done and clean, run the "STEP 3" block below.
--   (There is no STEP 2 here — step 2 is the Python backfill, run outside
--   the SQL editor, which is why this file jumps from 1 to 3.)


-- ============================================================================
-- STEP 1 — add the (empty, for now) column. Run this FIRST, before the
-- backfill script, since the backfill needs somewhere to write.
-- ============================================================================

alter table crews add column if not exists atlas_key text;

comment on column crews.atlas_key is
  'Stable identity for a Wildland Fire Handcrew Atlas placemark: '
  'md5(name|lat rounded 4dp|lon rounded 4dp). Only set for '
  'source=''handcrew_atlas'' rows. Lets atlas_import.py upsert instead of '
  'delete-all/insert-all, so a re-run that changes nothing keeps every id. '
  'See atlas_stable_ids_migration.sql.';


-- ============================================================================
-- STEP 3 — run ONLY after backfill_atlas_key.py --commit has finished and
-- its output showed zero collisions. This enforces the key's uniqueness and
-- adds the RESTRICT foreign key.
-- ============================================================================

-- Sanity check first (belt and braces — the backfill script checks this too,
-- but this is the check that actually matters right before the index is
-- built). If this returns any rows, STOP — do not run the CREATE UNIQUE INDEX
-- below until you've worked out why two placemarks hashed the same.
--   select atlas_key, count(*), array_agg(id) as ids
--     from crews
--    where source = 'handcrew_atlas'
--    group by atlas_key
--   having count(*) > 1;

create unique index if not exists crews_atlas_key_uidx
  on crews (atlas_key)
  where source = 'handcrew_atlas';

-- Every future Atlas-sourced insert must carry a key (upserts depend on it).
-- Curated (usfs_official) and user-submitted rows are untouched — the check
-- only fires for source='handcrew_atlas'.
alter table crews drop constraint if exists crews_atlas_key_required;
alter table crews add constraint crews_atlas_key_required
  check (source <> 'handcrew_atlas' or atlas_key is not null);

-- --- the RESTRICT foreign key -----------------------------------------------
-- Self-discovering: drops whatever FK (if any) currently sits on
-- crew_submissions.crew_id, under whatever name it has, then adds this one.
-- Handles both cases without you needing to know the existing constraint
-- name in advance: no FK today (crew_id has been an unenforced reference),
-- or an existing FK with different ON DELETE behavior.
do $$
declare
  con record;
begin
  for con in
    select conname
      from pg_constraint
     where conrelid = 'crew_submissions'::regclass
       and contype = 'f'
       and conkey = (
             select array_agg(attnum) from pg_attribute
              where attrelid = 'crew_submissions'::regclass
                and attname = 'crew_id'
           )
  loop
    execute format('alter table crew_submissions drop constraint %I', con.conname);
    raise notice 'dropped existing FK: %', con.conname;
  end loop;
end $$;

alter table crew_submissions
  add constraint crew_submissions_crew_id_fkey
  foreign key (crew_id) references crews(id)
  on delete restrict;

-- If this ADD CONSTRAINT fails, it means at least one existing
-- crew_submissions row ALREADY points at a crews.id that no longer exists —
-- i.e. the bug already bit before this fix landed. Postgres's own error
-- names the violating row, but this finds all of them at once:
--   select cs.id, cs.crew_id, cs.submission_kind, cs.notes
--     from crew_submissions cs
--    where cs.crew_id is not null
--      and not exists (select 1 from crews c where c.id = cs.crew_id);
-- Each one needs a human decision (re-point it at the crew's new id if you
-- can tell which one it should be, or resolve/reject the report) before the
-- constraint can be added — there's no automatic fix for "we don't know
-- which crew this correction meant anymore."
