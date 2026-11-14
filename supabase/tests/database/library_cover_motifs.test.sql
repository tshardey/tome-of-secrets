-- pgTAP: the 32 cover-motif tags added to the shared vocabulary (Plan 7
-- follow-up). Proves the ids, labels and category, that the 15 original
-- cover motifs are unchanged, that add_library_tag still refuses a shared id,
-- that a full job's claim carries the new tags, and that re-running the
-- migration's insert is a no-op that leaves a household's own row with a
-- colliding id alone.
begin;

create extension if not exists pgtap with schema extensions;

select plan(9);

insert into auth.users (id, email, aud, role)
values ('11111111-1111-1111-1111-111111111111', 'a@library.test', 'authenticated', 'authenticated');

create temporary table test_vals (k text primary key, v text) on commit drop;
grant all on test_vals to authenticated, anon;

create function pg_temp.val(p text) returns text language sql as
$$ select v from test_vals where k = p $$;
create function pg_temp.hh() returns uuid language sql as
$$ select pg_temp.val('hh')::uuid $$;
create function pg_temp.book() returns uuid language sql as
$$ select 'eeeeeeee-0000-0000-0000-000000000001'::uuid $$;

create temporary table expected (id text primary key, label text);
insert into expected values
  ('cover-celestial', 'Celestial'), ('cover-creature', 'Creature'), ('cover-architectural', 'Architectural'),
  ('cover-collage', 'Collage'), ('cover-instrument', 'Instrument'), ('cover-minimalist', 'Minimalist'),
  ('cover-sculpture', 'Sculpture'), ('cover-sky', 'Sky'), ('cover-historical', 'Historical'),
  ('cover-photo-realistic', 'Photo realistic'), ('cover-abstract', 'Abstract'), ('cover-sword', 'Sword'),
  ('cover-dragon', 'Dragon'), ('cover-crown', 'Crown'), ('cover-castle', 'Castle'), ('cover-ship', 'Ship'),
  ('cover-city-skyline', 'City skyline'), ('cover-tree', 'Tree'), ('cover-eye', 'Eye'), ('cover-hand', 'Hand'),
  ('cover-mask', 'Mask'), ('cover-bird', 'Bird'), ('cover-wolf', 'Wolf'), ('cover-cat', 'Cat'),
  ('cover-fire', 'Fire'), ('cover-water-waves', 'Water waves'), ('cover-map', 'Map'), ('cover-stairs', 'Stairs'),
  ('cover-flowers', 'Flowers'), ('cover-silhouette', 'Silhouette'), ('cover-typography-only', 'Typography only'),
  ('cover-couple', 'Couple');

create temporary table original (id text primary key, label text);
insert into original values
  ('cover-animal', 'Animal'), ('cover-plants', 'Plants'), ('cover-illustrated', 'Illustrated'),
  ('cover-figure', 'Figure'), ('cover-landscape', 'Landscape'), ('cover-moon-stars', 'Moon stars'),
  ('cover-skull', 'Skull'), ('cover-heart', 'Heart'), ('cover-weapon', 'Weapon'),
  ('cover-key-door', 'Key door'), ('cover-book', 'Book'), ('cover-mushrooms', 'Mushrooms'),
  ('cover-antlers-horns', 'Antlers horns'), ('cover-fog-mist', 'Fog mist'), ('cover-geometric', 'Geometric');

grant select on expected, original to authenticated;

set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
insert into test_vals (k, v) select 'hh', library.create_household('Home', 'Member A')::text;

reset role;
set local request.jwt.claims = '{}';
insert into library.books (id, household_id, title, authors, cover_url)
values (pg_temp.book(), pg_temp.hh(), 'Invented Title', '{Invented Author}',
        'https://covers.openlibrary.org/b/id/8000001-L.jpg');

select is((select count(*)::int from expected e
             join library.library_tags t on t.id = e.id and t.household_id is null
            where t.category = 'cover-motif' and t.label = e.label and t.added_version = 1 and t.active),
          32, 'all 32 new ids exist shared, cover-motif, with the exact labels, version 1 and active');
select is((select count(*)::int from original o
             join library.library_tags t on t.id = o.id and t.household_id is null
            where t.category = 'cover-motif' and t.label = o.label and t.added_version = 1 and t.active),
          15, 'the 15 original cover motifs are unchanged');
select is((select count(*)::int from library.library_tags where household_id is null and category = 'cover-motif'),
          49, 'there are 49 shared cover motifs (47 plus the 2 in library-cover-motifs-2)');

set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
select throws_ok($$ select library.add_library_tag(pg_temp.hh(), 'cover-sword', 'Sword', 'cover-motif') $$,
                 '23505', null, 'add_library_tag refuses a new id that is already shared');
select is(library.add_library_tag(pg_temp.hh(), 'cover-lighthouse', 'Lighthouse', 'cover-motif'), 2,
          'a household can still add a cover motif that is not shared');

-- A household that owns a tag with a later-shared id (inserted directly, as the
-- id was free when the household added it) keeps it through the migration's insert.
reset role;
set local request.jwt.claims = '{}';
insert into library.library_tags (household_id, id, label, category, added_version)
values (pg_temp.hh(), 'cover-wolf', 'Wolf (mine)', 'cover-motif', 2);

insert into library.library_tags (household_id, id, label, category, added_version)
select null, e.id, e.label, 'cover-motif', 1 from expected e
on conflict (household_id, id) do nothing;

select is((select label from library.library_tags where household_id = pg_temp.hh() and id = 'cover-wolf'),
          'Wolf (mine)', 'a household row with a colliding id survives the insert');
select is((select count(*)::int from library.library_tags where id = 'cover-wolf'),
          2, 'the shared and household rows coexist, the shared one not duplicated');

-- A full job's claim vocabulary carries the new tags.
set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
select library.request_tagging(pg_temp.hh(), array[pg_temp.book()], 'manual',
                               'aaaaaaaa-0000-0000-0000-000000000009'::uuid);
select ok(exists (
            select 1
              from library.claim_tag_job((select j.id from library.tag_jobs j where j.book_id = pg_temp.book())) c,
                   jsonb_array_elements(c.vocab) v
             where c.kind = 'full' and v ->> 'id' = 'cover-sword' and v ->> 'category' = 'cover-motif'),
          'a full job''s claim vocabulary includes cover-sword');
select is(library.tag_reserve_micro(), 71000, 'tag_reserve_micro is 71000 (tagger.ts TAG_RESERVE_MICRO)');

select * from finish();
rollback;
