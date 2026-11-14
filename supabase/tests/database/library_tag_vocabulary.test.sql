-- pgTAP: library tag vocabulary, library tag rows, the added-by marker and
-- hand-removal records. Proves the 176 shared tags, that clients can't
-- write added_by, that ToS's exact write shapes (the book_tags upsert and the
-- delete) keep working under the column grant, that a removal is recorded
-- however it happens (but not by a book delete or the tagger replacing its own
-- tags), that adding a tag back by hand clears the record, and that anon and
-- non-members see and change nothing.
begin;

create extension if not exists pgtap with schema extensions;

select plan(64);

insert into auth.users (id, email, aud, role)
values
  ('11111111-1111-1111-1111-111111111111', 'a@library.test', 'authenticated', 'authenticated'),
  ('22222222-2222-2222-2222-222222222222', 'b@library.test', 'authenticated', 'authenticated'),
  ('33333333-3333-3333-3333-333333333333', 'c@library.test', 'authenticated', 'authenticated');

create temporary table test_vals (k text primary key, v text) on commit drop;
grant all on test_vals to authenticated, anon;

create function pg_temp.val(p text) returns text language sql as
$$ select v from test_vals where k = p $$;

create function pg_temp.hh() returns uuid language sql as
$$ select pg_temp.val('hh')::uuid $$;

create function pg_temp.hh2() returns uuid language sql as
$$ select pg_temp.val('hh2')::uuid $$;

-- Book n; book 9 is in C's household H2, every other one in H.
create function pg_temp.book(n int) returns uuid language sql as
$$ select ('eeeeeeee-0000-0000-0000-' || lpad(n::text, 12, '0'))::uuid $$;

---------------------------------------------------------------------------
-- Households: A and B in H, C alone in H2. Books 1-6 in H, 9 in H2.
---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
insert into test_vals (k, v) select 'hh', library.create_household('Home', 'Member A')::text;
insert into test_vals (k, v) select 'code', h.invite_code from library.households h where h.id = pg_temp.hh();

set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';
insert into test_vals (k, v) select 'joined', library.join_household(pg_temp.val('code'), 'Member B')::text;

set local request.jwt.claims = '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}';
insert into test_vals (k, v) select 'hh2', library.create_household('Other Home', 'Member C')::text;

reset role;
insert into library.books (id, household_id, title, authors)
select pg_temp.book(n), case when n = 9 then pg_temp.hh2() else pg_temp.hh() end,
       'Invented Title ' || n, '{Invented Author}'
  from unnest(array[1, 2, 3, 4, 5, 6, 9]) n;

---------------------------------------------------------------------------
-- The starting vocabulary
---------------------------------------------------------------------------
select is((select count(*)::int from library.library_tags where household_id is null), 176,
          '176 shared tags');
select is((select count(*)::int from library.library_tags
            where household_id is null and added_version = 1 and active), 176,
          'all at version 1 and active');
select is((select count(*)::int from library.library_tags
            where id !~ '^[a-z0-9]+(-[a-z0-9]+)*$' or char_length(id) > 40), 0,
          'every id passes the format');
select is((select array_agg(distinct category order by category) from library.library_tags),
          array['audience', 'cover-colour', 'cover-motif', 'creature', 'era', 'fact', 'mood', 'plot',
                'protagonist', 'setting', 'subgenre', 'theme', 'trope'],
          'the 13 categories');
select is((select label from library.library_tags where id = 'found-family'), 'Found family', 'sentence-case label');
select is((select label from library.library_tags where id = 'cover-red'), 'Red', 'cover prefix dropped');
select is((select label from library.library_tags where id = 'trans-nonbinary-mc'),
          'Trans or nonbinary main character', 'special label');
select is((select category from library.library_tags where id = 'audience-ya'), 'audience', 'audience split');
select is((select category from library.library_tags where id = 'thriller'), 'subgenre', 'subgenre split');

set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
select is(library.vocab_version(pg_temp.hh()), 1, 'vocab_version starts at 1');
select is((select count(*)::int from library.library_tags), 176, 'A sees the 176');

set local request.jwt.claims = '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}';
select is((select count(*)::int from library.library_tags), 176, 'C sees the 176');
select throws_ok($$ select library.vocab_version(pg_temp.hh()) $$, '42501', null, 'C cannot read H''s version');

---------------------------------------------------------------------------
-- add_library_tag
---------------------------------------------------------------------------
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
select is(library.add_library_tag(pg_temp.hh(), 'cozy-mystery', 'Cozy mystery', 'subgenre'), 2,
          'adding a tag returns version 2');
select is(library.vocab_version(pg_temp.hh()), 2, 'the household is at version 2');
select is((select count(*)::int from library.library_tags), 177, 'A sees the addition');
select throws_ok($$ select library.add_library_tag(pg_temp.hh(), 'cozy-mystery', 'Again', 'subgenre') $$,
                 '23505', null, 'a repeated household id is refused');
select throws_ok($$ select library.add_library_tag(pg_temp.hh(), 'vampires', 'Vampires', 'creature') $$,
                 '23505', null, 'a starting id is refused');
select throws_ok($$ select library.add_library_tag(pg_temp.hh(), 'Bad Id', 'Label', 'trope') $$,
                 '22023', null, 'a bad id is refused');
select throws_ok($$ select library.add_library_tag(pg_temp.hh(), 'new-tag', 'Label', 'nonsense') $$,
                 '22023', null, 'a bad category is refused');
select throws_ok($$ select library.add_library_tag(pg_temp.hh(), 'new-tag', '   ', 'trope') $$,
                 '22023', null, 'a blank label is refused');

set local request.jwt.claims = '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}';
select is((select count(*)::int from library.library_tags), 176, 'A''s tag is invisible to C');
select throws_ok($$ select library.add_library_tag(pg_temp.hh(), 'sneaky', 'Sneaky', 'trope') $$,
                 '42501', null, 'C cannot add to H');

set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
select lives_ok($$ select library.add_library_tag(pg_temp.hh(), 'bulk-' || i, 'Bulk', 'trope')
                     from generate_series(1, 399) i $$, 'A fills the household to 400 tags');
select throws_ok($$ select library.add_library_tag(pg_temp.hh(), 'one-too-many', 'Too many', 'trope') $$,
                 '22023', null, 'the 401st household tag is refused');

---------------------------------------------------------------------------
-- Library tag rows and the added-by marker
---------------------------------------------------------------------------
select lives_ok($$ insert into library.book_library_tags (book_id, household_id, tag_id)
                   values (pg_temp.book(1), pg_temp.hh(), 'vampires') $$, 'A tags a book');
select is((select added_by from library.book_library_tags where book_id = pg_temp.book(1) and tag_id = 'vampires'),
          'person', 'added_by defaults to person');
select lives_ok($$ insert into library.book_library_tags (book_id, household_id, tag_id)
                   values (pg_temp.book(1), pg_temp.hh(), 'cozy-mystery') $$, 'a household tag applies');
select throws_ok($$ insert into library.book_library_tags (book_id, household_id, tag_id, added_by)
                    values (pg_temp.book(1), pg_temp.hh(), 'ghosts', 'tagger') $$,
                 '42501', null, 'a client cannot write added_by');
select throws_ok($$ insert into library.book_tags (book_id, household_id, tag_id, added_by)
                    values (pg_temp.book(1), pg_temp.hh(), 'cozy', 'tagger') $$,
                 '42501', null, 'a client cannot write book_tags.added_by');
select throws_ok($$ insert into library.book_library_tags (book_id, household_id, tag_id)
                    values (pg_temp.book(1), pg_temp.hh(), 'no-such-tag') $$,
                 '42501', null, 'an unknown tag fails the policy');

reset role;
update library.library_tags set active = false where household_id is null and id = 'bargains';
set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
select throws_ok($$ insert into library.book_library_tags (book_id, household_id, tag_id)
                    values (pg_temp.book(1), pg_temp.hh(), 'bargains') $$,
                 '42501', null, 'an inactive tag fails the policy');
reset role;
update library.library_tags set active = true where household_id is null and id = 'bargains';

set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
select throws_ok($$ insert into library.book_library_tags (book_id, household_id, tag_id)
                    values (pg_temp.book(9), pg_temp.hh2(), 'ghosts') $$,
                 '42501', null, 'A cannot tag a book in another household');

---------------------------------------------------------------------------
-- ToS's write shapes (D13)
---------------------------------------------------------------------------
select lives_ok($$ insert into library.book_tags (book_id, household_id, tag_id)
                   values (pg_temp.book(2), pg_temp.hh(), 'cozy'), (pg_temp.book(2), pg_temp.hh(), 'dark')
                   on conflict (book_id, tag_id) do nothing $$, 'ToS upsert works under the column grant');
select lives_ok($$ insert into library.book_tags (book_id, household_id, tag_id)
                   values (pg_temp.book(2), pg_temp.hh(), 'cozy'), (pg_temp.book(2), pg_temp.hh(), 'dark')
                   on conflict (book_id, tag_id) do nothing $$, 'ToS upsert works again');
select is((select count(*)::int from library.book_tags where book_id = pg_temp.book(2)), 2, 'two ToS tags');
select is((select added_by from library.book_tags where book_id = pg_temp.book(2) and tag_id = 'cozy'),
          'person', 'ToS rows are person-added');
select is((select count(*)::int from library.tag_removals), 0, 'no removals yet');

select lives_ok($$ delete from library.book_tags
                    where book_id = pg_temp.book(2) and tag_id in ('cozy', 'dark') $$, 'ToS removeTags works');
select is((select count(*)::int from library.tag_removals
            where book_id = pg_temp.book(2) and kind = 'tos' and removed_by = '11111111-1111-1111-1111-111111111111'),
          2, 'two tos records, removed_by A');

select lives_ok($$ delete from library.book_library_tags
                    where book_id = pg_temp.book(1) and tag_id = 'vampires' $$, 'A removes a library tag');
select is((select count(*)::int from library.tag_removals
            where book_id = pg_temp.book(1) and kind = 'library' and tag_id = 'vampires'),
          1, 'a library record');

select lives_ok($$ insert into library.book_tags (book_id, household_id, tag_id)
                   values (pg_temp.book(2), pg_temp.hh(), 'cozy') on conflict (book_id, tag_id) do nothing $$,
                'A adds cozy back by hand');
select is((select array_agg(tag_id order by tag_id) from library.tag_removals
            where book_id = pg_temp.book(2) and kind = 'tos'),
          array['dark'], 'adding it back cleared its record');

---------------------------------------------------------------------------
-- Book deletion leaves nothing behind
---------------------------------------------------------------------------
insert into library.book_library_tags (book_id, household_id, tag_id)
values (pg_temp.book(3), pg_temp.hh(), 'ghosts');
insert into library.book_tags (book_id, household_id, tag_id)
values (pg_temp.book(3), pg_temp.hh(), 'cozy');
select lives_ok($$ delete from library.books where id = pg_temp.book(3) $$, 'deleting a tagged book raises nothing');
select is((select count(*)::int from library.tag_removals where book_id = pg_temp.book(3)), 0,
          'a deleted book leaves no records');
select is((select count(*)::int from library.book_library_tags where book_id = pg_temp.book(3))
        + (select count(*)::int from library.book_tags where book_id = pg_temp.book(3)), 0,
          'and no tag rows');

---------------------------------------------------------------------------
-- The tagger replacing its own tags
---------------------------------------------------------------------------
reset role;
insert into library.book_library_tags (book_id, household_id, tag_id, added_by)
values (pg_temp.book(4), pg_temp.hh(), 'cover-red', 'tagger');
select is((select added_by from library.book_library_tags where book_id = pg_temp.book(4)), 'tagger',
          'a privileged writer can set tagger');
select is((select count(*)::int from library.tag_removals where book_id = pg_temp.book(4)), 0,
          'a tagger insert clears nothing and records nothing');

set local library.tagger_replacing = 'on';
delete from library.book_library_tags where book_id = pg_temp.book(4);
select is((select count(*)::int from library.tag_removals where book_id = pg_temp.book(4)), 0,
          'a delete while the tagger is replacing records nothing');

set local library.tagger_replacing = 'off';
set local request.jwt.claims = '';
insert into library.book_library_tags (book_id, household_id, tag_id, added_by)
values (pg_temp.book(4), pg_temp.hh(), 'cover-red', 'tagger');
delete from library.book_library_tags where book_id = pg_temp.book(4);
select is((select count(*)::int from library.tag_removals
            where book_id = pg_temp.book(4) and kind = 'library' and tag_id = 'cover-red' and removed_by is null),
          1, 'with the setting off, the delete is recorded (removed_by null)');

---------------------------------------------------------------------------
-- No other client writes
---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
select throws_ok($$ insert into library.library_tags (household_id, id, label, category, added_version)
                    values (pg_temp.hh(), 'direct-add', 'Direct', 'trope', 3) $$,
                 '42501', null, 'no direct vocabulary write');
select throws_ok($$ insert into library.tag_removals (book_id, household_id, kind, tag_id)
                    values (pg_temp.book(5), pg_temp.hh(), 'tos', 'cozy') $$,
                 '42501', null, 'no direct removal write');
select throws_ok($$ select library.record_tag_removal() $$, '42501', null, 'the trigger function is not callable');

---------------------------------------------------------------------------
-- Non-members and signed-out callers
---------------------------------------------------------------------------
reset role;
insert into library.book_library_tags (book_id, household_id, tag_id)
values (pg_temp.book(5), pg_temp.hh(), 'quest');
insert into library.book_tags (book_id, household_id, tag_id)
values (pg_temp.book(5), pg_temp.hh(), 'dark');

set local role authenticated;
set local request.jwt.claims = '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}';
select is((select count(*)::int from library.book_library_tags), 0, 'C sees none of H''s library tag rows');
select is((select count(*)::int from library.book_tags), 0, 'C sees none of H''s ToS tag rows');
select is((select count(*)::int from library.tag_removals), 0, 'C sees none of H''s removals');
select throws_ok($$ insert into library.book_library_tags (book_id, household_id, tag_id)
                    values (pg_temp.book(6), pg_temp.hh(), 'quest') $$,
                 '42501', null, 'C cannot tag in H');
select throws_ok($$ insert into library.book_tags (book_id, household_id, tag_id)
                    values (pg_temp.book(6), pg_temp.hh(), 'dark') $$,
                 '42501', null, 'C cannot add ToS tags in H');
delete from library.book_library_tags where book_id = pg_temp.book(5);
delete from library.book_tags where book_id = pg_temp.book(5);
reset role;
select is((select count(*)::int from library.book_library_tags where book_id = pg_temp.book(5))
        + (select count(*)::int from library.book_tags where book_id = pg_temp.book(5)), 2,
          'C''s deletes removed nothing');

set local role anon;
select throws_ok($$ select * from library.library_tags $$, '42501', null, 'anon cannot read the vocabulary');
select throws_ok($$ select * from library.book_library_tags $$, '42501', null, 'anon cannot read library tag rows');
select throws_ok($$ select * from library.tag_removals $$, '42501', null, 'anon cannot read removals');
select throws_ok($$ select * from library.book_tags $$, '42501', null, 'anon cannot read ToS tag rows');

select * from finish();
rollback;
