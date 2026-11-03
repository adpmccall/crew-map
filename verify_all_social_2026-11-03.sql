-- verify_all_social_2026-11-03.sql — one query to check all 30 rows touched
-- by run_all_social_2026-11-03.sql (21 existing rows updated + 9 new rows
-- inserted). Run this any time after running that file.

select id, crew_name, town, state, region, instagram_url, facebook_url, source
from crews
where id in (341, 17, 242, 390, 402, 60, 155, 861, 545, 478, 542, 728, 512, 467, 503, 543, 547, 638, 729, 313, 248)
   or crew_name in (
     'McCall Smokejumpers', 'Missoula Smokejumpers', 'North Cascades Smokejumpers',
     'Boise Helitack', 'Las Vegas Helitack', 'Montrose Helitack', 'Flatiron Helitack',
     'Northern Colorado Helitack', 'Burns Helitack'
   )
order by id;

-- expect: 30 rows total. Every row should have a non-null `region` (filled
-- in automatically by the existing crews_set_region trigger) and at least
-- one of instagram_url/facebook_url set.

-- Quick count-only version, if you just want a number rather than the full
-- table:
-- select count(*) from crews
-- where id in (341, 17, 242, 390, 402, 60, 155, 861, 545, 478, 542, 728, 512, 467, 503, 543, 547, 638, 729, 313, 248)
--    or crew_name in (
--      'McCall Smokejumpers', 'Missoula Smokejumpers', 'North Cascades Smokejumpers',
--      'Boise Helitack', 'Las Vegas Helitack', 'Montrose Helitack', 'Flatiron Helitack',
--      'Northern Colorado Helitack', 'Burns Helitack'
--    );
-- -- expect: 30
