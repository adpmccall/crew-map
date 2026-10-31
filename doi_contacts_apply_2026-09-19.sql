-- DOI fire contacts (Part A) — BLM/NPS/FWS/BIA crews
-- All 27 rows from doi_contact_matches_2026-09-19.csv (9 definite + 13 researched-confident + 5 weak, owner-approved).
-- Same pattern as the hotshot-crew contact backfill: dry run first, then apply, then verify.

-- =========================================================
-- 0) AGENCY CORRECTION — Snake River IHC (id 248), separate from the 27 contact rows below
-- =========================================================
-- Not a new crew: this is the Pocatello, ID hotshot crew the DOI directory lists Kenneth Bochniak
-- under (already the stored contact_name for id 248, from the original fs.usda.gov backfill).
-- Currently tagged agency='usfs' (likely just because it's hosted on Caribou-Targhee NF), but the
-- DOI directory tags this contact BLM, and the owner worked this crew and confirms it's BLM.
-- Optional — review before running, independent of the batch below.
select id, crew_name, agency, town, state, forest, contact_name from crews where id = 248; -- confirm current state first
update crews set agency = 'blm' where id = 248; -- Snake River IHC, Pocatello — usfs -> blm per DOI directory + firsthand knowledge

-- =========================================================
-- 1) DRY RUN — review before touching anything
-- =========================================================
select
  c.id,
  c.crew_name,
  c.agency,
  c.contact_name as current_contact_name,
  v.contact_name as new_contact_name,
  v.contact_role as new_contact_role
from crews c
join (values
  (480, 'Owen Johnson', 'Unaweep WFM Supt.', '970-683-7707', null::text, 'per DOI firejobs.gov directory, Sept 2026'),
  (599, 'Roger Hooper', 'Folsom Lake Hand Crew', '530-559-0115', null, 'per DOI firejobs.gov directory, Sept 2026'),
  (449, 'Jeff Lissick', 'Veteran Crew Superintendent', '218-556-1492', null, 'per DOI firejobs.gov directory, Sept 2026'),
  (560, 'JP Blair', 'Veteran Hand Crew', '702-515-5218', null, 'per DOI firejobs.gov directory, Sept 2026'),
  (475, 'Tamara Randall', 'FMO', '605-407-8120', 'tamara.randall@bia.gov', 'per DOI firejobs.gov directory, Sept 2026'),
  (785, 'Great Smoky Wildland Fire Module Unit', null, '865-214-1005', null, 'per DOI firejobs.gov directory, Sept 2026 (unit line, not an individual)'),
  (734, 'Brian Gold', 'WFM Captain', '360-912-3245', 'brian_gold@nps.gov', 'per DOI firejobs.gov directory, Sept 2026'),
  (737, 'Shawn Rambo', 'Veterans Suppression Superintendent', '509-953-4586', 'srambo@blm.gov', 'per DOI firejobs.gov directory, Sept 2026'),
  (484, 'Russ Spargo', 'Devil''s Canyon Vet Crew', '307-347-5188', null, 'per DOI firejobs.gov directory, Sept 2026'),
  (812, 'Kristi Bulock', 'FMO', '907-260-2845', null, 'per DOI firejobs.gov directory, Sept 2026'),
  (533, 'Ty Gilstrap', 'AFMO', '928-348-4416', null, 'per DOI firejobs.gov directory, Sept 2026'),
  (512, 'Ruben Pedraza', 'Supervisory/Lead WLFF', null, 'ruben_pedraza@nps.gov', 'per DOI firejobs.gov directory, Sept 2026'),
  (507, 'Nate Williamson', 'Fire Ecologist', '970-227-7708', 'nate_williamson@nps.gov', 'per DOI firejobs.gov directory, Sept 2026'),
  (479, 'Kevin Riggs', 'Wildland Fire Module Leader', '970-612-6094', null, 'per DOI firejobs.gov directory, Sept 2026'),
  (851, 'Seth Alberts', 'Smokejumpers', '208-387-5426', null, 'per DOI firejobs.gov directory, Sept 2026'),
  (852, 'Brandon Williams', 'Helicopter Crew Supervisor', '208-735-6507', null, 'per DOI firejobs.gov directory, Sept 2026'),
  (467, 'Lee Dueker', 'Module Lead', '605-673-8364', null, 'per DOI firejobs.gov directory, Sept 2026'),
  (506, 'Dan Swanson', 'Fire Ecologist', '605-745-1172', null, 'per DOI firejobs.gov directory, Sept 2026'),
  (780, 'Kathryn Sebes', 'AFMO', '512-755-2972', null, 'per DOI firejobs.gov directory, Sept 2026'),
  (582, 'Kayla Ronsani', 'Fire Ecologist', '435-772-7233', 'kayla_ronsani@nps.gov', 'per DOI firejobs.gov directory, Sept 2026'),
  (849, 'Gene Nawrot', 'Zone AFMO', '757-986-3480', 'gene_nawrot@fws.gov', 'per DOI firejobs.gov directory, Sept 2026'),
  (735, 'Geoff Hibbs', 'Asst. Module Lead', '360-854-7351', 'geoff_hibbs@nps.gov', 'per DOI firejobs.gov directory, Sept 2026'),
  (853, 'Bruce Jackson / John Janak', null, '509-546-8067 / 509-546-8066', null, 'per DOI firejobs.gov directory, Sept 2026 (WEAK: no title on source page; two names given for the exact duty-station match)'),
  (588, 'Brent Webb / Matt Desimone', null, null, null, 'per DOI firejobs.gov directory, Sept 2026 (WEAK: no title given; emails were obscured on the source page)'),
  (751, 'Beau Lee / Chris Schott (Acting)', 'Veterans Crew Superintendent / Crew 10 Superintendent (Acting)', '541-761-9416 / 541-238-4805', 'blee@blm.gov / cschott@blm.gov', 'per DOI firejobs.gov directory, Sept 2026 (WEAK/DUAL CANDIDATE: DB crew name combines both titles seen on source - verify whether this is one crew or two merged into one record)'),
  (595, 'Mike Klimek', 'AMFO', '530-595-6161', null, 'per DOI firejobs.gov directory, Sept 2026 (WEAK: park-level role, not WFM-specific - best available fallback)'),
  (593, 'Jennifer Anderson', 'Fire Management Officer', '707-845-4316', 'jennifer_anderson@nps.gov', 'per DOI firejobs.gov directory, Sept 2026 (WEAK: park-level FMO, not WFM-specific - best available fallback)')
) as v(id, contact_name, contact_role, contact_phone, contact_email, contact_source)
on c.id = v.id
order by c.id;

-- Expect 27 rows back, one per id above, each with a real crew_name.
-- If any id is missing or crew_name looks wrong, stop and check before running the update below.

-- =========================================================
-- 2) APPLY — only after the dry run above looks right
-- =========================================================
update crews c
set
  contact_name = v.contact_name,
  contact_role = v.contact_role,
  contact_phone = v.contact_phone,
  contact_email = v.contact_email,
  contact_source = v.contact_source,
  contact_updated_at = now()
from (values
  (480, 'Owen Johnson', 'Unaweep WFM Supt.', '970-683-7707', null::text, 'per DOI firejobs.gov directory, Sept 2026'),
  (599, 'Roger Hooper', 'Folsom Lake Hand Crew', '530-559-0115', null, 'per DOI firejobs.gov directory, Sept 2026'),
  (449, 'Jeff Lissick', 'Veteran Crew Superintendent', '218-556-1492', null, 'per DOI firejobs.gov directory, Sept 2026'),
  (560, 'JP Blair', 'Veteran Hand Crew', '702-515-5218', null, 'per DOI firejobs.gov directory, Sept 2026'),
  (475, 'Tamara Randall', 'FMO', '605-407-8120', 'tamara.randall@bia.gov', 'per DOI firejobs.gov directory, Sept 2026'),
  (785, 'Great Smoky Wildland Fire Module Unit', null, '865-214-1005', null, 'per DOI firejobs.gov directory, Sept 2026 (unit line, not an individual)'),
  (734, 'Brian Gold', 'WFM Captain', '360-912-3245', 'brian_gold@nps.gov', 'per DOI firejobs.gov directory, Sept 2026'),
  (737, 'Shawn Rambo', 'Veterans Suppression Superintendent', '509-953-4586', 'srambo@blm.gov', 'per DOI firejobs.gov directory, Sept 2026'),
  (484, 'Russ Spargo', 'Devil''s Canyon Vet Crew', '307-347-5188', null, 'per DOI firejobs.gov directory, Sept 2026'),
  (812, 'Kristi Bulock', 'FMO', '907-260-2845', null, 'per DOI firejobs.gov directory, Sept 2026'),
  (533, 'Ty Gilstrap', 'AFMO', '928-348-4416', null, 'per DOI firejobs.gov directory, Sept 2026'),
  (512, 'Ruben Pedraza', 'Supervisory/Lead WLFF', null, 'ruben_pedraza@nps.gov', 'per DOI firejobs.gov directory, Sept 2026'),
  (507, 'Nate Williamson', 'Fire Ecologist', '970-227-7708', 'nate_williamson@nps.gov', 'per DOI firejobs.gov directory, Sept 2026'),
  (479, 'Kevin Riggs', 'Wildland Fire Module Leader', '970-612-6094', null, 'per DOI firejobs.gov directory, Sept 2026'),
  (851, 'Seth Alberts', 'Smokejumpers', '208-387-5426', null, 'per DOI firejobs.gov directory, Sept 2026'),
  (852, 'Brandon Williams', 'Helicopter Crew Supervisor', '208-735-6507', null, 'per DOI firejobs.gov directory, Sept 2026'),
  (467, 'Lee Dueker', 'Module Lead', '605-673-8364', null, 'per DOI firejobs.gov directory, Sept 2026'),
  (506, 'Dan Swanson', 'Fire Ecologist', '605-745-1172', null, 'per DOI firejobs.gov directory, Sept 2026'),
  (780, 'Kathryn Sebes', 'AFMO', '512-755-2972', null, 'per DOI firejobs.gov directory, Sept 2026'),
  (582, 'Kayla Ronsani', 'Fire Ecologist', '435-772-7233', 'kayla_ronsani@nps.gov', 'per DOI firejobs.gov directory, Sept 2026'),
  (849, 'Gene Nawrot', 'Zone AFMO', '757-986-3480', 'gene_nawrot@fws.gov', 'per DOI firejobs.gov directory, Sept 2026'),
  (735, 'Geoff Hibbs', 'Asst. Module Lead', '360-854-7351', 'geoff_hibbs@nps.gov', 'per DOI firejobs.gov directory, Sept 2026'),
  (853, 'Bruce Jackson / John Janak', null, '509-546-8067 / 509-546-8066', null, 'per DOI firejobs.gov directory, Sept 2026 (WEAK: no title on source page; two names given for the exact duty-station match)'),
  (588, 'Brent Webb / Matt Desimone', null, null, null, 'per DOI firejobs.gov directory, Sept 2026 (WEAK: no title given; emails were obscured on the source page)'),
  (751, 'Beau Lee / Chris Schott (Acting)', 'Veterans Crew Superintendent / Crew 10 Superintendent (Acting)', '541-761-9416 / 541-238-4805', 'blee@blm.gov / cschott@blm.gov', 'per DOI firejobs.gov directory, Sept 2026 (WEAK/DUAL CANDIDATE: DB crew name combines both titles seen on source - verify whether this is one crew or two merged into one record)'),
  (595, 'Mike Klimek', 'AMFO', '530-595-6161', null, 'per DOI firejobs.gov directory, Sept 2026 (WEAK: park-level role, not WFM-specific - best available fallback)'),
  (593, 'Jennifer Anderson', 'Fire Management Officer', '707-845-4316', 'jennifer_anderson@nps.gov', 'per DOI firejobs.gov directory, Sept 2026 (WEAK: park-level FMO, not WFM-specific - best available fallback)')
) as v(id, contact_name, contact_role, contact_phone, contact_email, contact_source)
where c.id = v.id;

-- =========================================================
-- 3) VERIFY
-- =========================================================
-- Should return 27:
select count(*) from crews where contact_source like 'per DOI firejobs.gov directory%';

-- Spot-check a few, including the two multi-candidate ones:
select id, crew_name, contact_name, contact_role, contact_phone, contact_email, contact_source
from crews
where id in (480, 785, 484, 853, 751)
order by id;
