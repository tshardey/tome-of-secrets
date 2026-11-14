-- pgTAP: the two cover-motif tags added by 20261114130000_library-cover-motifs-2
-- (cover-jewelry, cover-food-drink). Proves the ids, labels and category, that
-- cover-crown is unchanged, that add_library_tag refuses the new shared ids,
-- that a full job's claim carries them, that re-running the insert is a no-op
-- that leaves a household's own colliding row alone, and that the reservation
-- is unchanged.
begin;

create extension if not exists pgtap with schema extensions;

select plan(8);

insert into auth.users (id, email, aud, role)
values ('11111111-1111-1111-1111-111111111111', 'a@library.test', 'authenticated', 'authenticated');

create temporary table test_vals (k text primary key, v text) on commit drop;
grant all on test_vals to authenticated, anon;

create function pg_temp.val(p text) returns text language sql as
$$ select v from test_vals where k = p $$;
create function pg_temp.hh() returns uuid language sql as
$$ select pg_temp.val('hh')::uuid $$;
create function pg_temp.book() returns uuid language sql as
$$ select 'eeeeeeee-0000-0000-0000-000000000002'::uuid $$;

create temporary table expected (id text primary key, label text);
insert into expected values ('cover-jewelry', 'Jewelry'), ('cover-food-drink', 'Food drink');
grant select on expected to authenticated;

set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
insert into test_vals (k, v) select 'hh', library.create_household('Home', 'Member A')::text;

reset role;
set local request.jwt.claims = '{}';
insert into library.books (id, household_id, title, authors, cover_url)
values (pg_temp.book(), pg_temp.hh(), 'Invented Title', '{Invented Author}',
        'https://covers.openlibrary.org/b/id/8000002-L.jpg');

select is((select count(*)::int from expected e
             join library.library_tags t on t.id = e.id and t.household_id is null
            where t.category = 'cover-motif' and t.label = e.label and t.added_version = 1 and t.active),
          2, 'both new ids exist shared, cover-motif, with the exact labels, version 1 and active');
select is((select label || ':' || category || ':' || added_version || ':' || active
             from library.library_tags where household_id is null and id = 'cover-crown'),
          'Crown:cover-motif:1:true', 'cover-crown is unchanged');

set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
select throws_ok($$ select library.add_library_tag(pg_temp.hh(), 'cover-jewelry', 'Jewelry', 'cover-motif') $$,
                 '23505', null, 'add_library_tag refuses cover-jewelry, now shared');
select throws_ok($$ select library.add_library_tag(pg_temp.hh(), 'cover-food-drink', 'Food drink', 'cover-motif') $$,
                 '23505', null, 'add_library_tag refuses cover-food-drink, now shared');

-- A household row with a later-shared id survives a re-run of the insert.
reset role;
set local request.jwt.claims = '{}';
insert into library.library_tags (household_id, id, label, category, added_version)
values (pg_temp.hh(), 'cover-food-drink', 'Food drink (mine)', 'cover-motif', 2);

insert into library.library_tags (household_id, id, label, category, added_version)
select null, e.id, e.label, 'cover-motif', 1 from expected e
on conflict (household_id, id) do nothing;

select is((select string_agg(coalesce(household_id::text, 'shared') || '=' || label, ',' order by household_id nulls first)
             from library.library_tags where id = 'cover-food-drink'),
          'shared=Food drink,' || pg_temp.hh() || '=Food drink (mine)',
          'the re-run adds nothing; the shared and household rows coexist unchanged');
select is((select count(*)::int from library.library_tags where id = 'cover-jewelry'),
          1, 'cover-jewelry is not duplicated by the re-run');

-- A full job's claim vocabulary carries both new tags.
set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
select library.request_tagging(pg_temp.hh(), array[pg_temp.book()], 'manual',
                               'aaaaaaaa-0000-0000-0000-000000000010'::uuid);
select is((select count(distinct v ->> 'id')::int
             from library.claim_tag_job((select j.id from library.tag_jobs j where j.book_id = pg_temp.book())) c,
                  jsonb_array_elements(c.vocab) v
            where c.kind = 'full' and v ->> 'id' in ('cover-jewelry', 'cover-food-drink')
              and v ->> 'category' = 'cover-motif'),
          2, 'a full job''s claim vocabulary includes cover-jewelry and cover-food-drink');
select is(library.tag_reserve_micro(), 71000, 'tag_reserve_micro is still 71000 (tagger.ts TAG_RESERVE_MICRO)');

select * from finish();
rollback;
