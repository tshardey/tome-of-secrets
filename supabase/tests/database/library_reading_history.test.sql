-- pgTAP: library private reading history (Plan 8, D2, D5, D7). Proves that
-- the SQL match keys mirror the library app's match-keys.ts and isbn.ts, that
-- the matcher follows D5 (a clear match only when it is certain, candidates
-- otherwise, never a status for two same-titled books), that the upload is
-- idempotent and goes through the StoryGraph who-wins rule (a cleared or app
-- row is never touched), that history is private to its member, and that a
-- deleted book frees its rows.
begin;

create extension if not exists pgtap with schema extensions;

select plan(83);

insert into auth.users (id, email, aud, role)
values
  ('11111111-1111-1111-1111-111111111111', 'a@library.test', 'authenticated', 'authenticated'),
  ('22222222-2222-2222-2222-222222222222', 'b@library.test', 'authenticated', 'authenticated'),
  ('33333333-3333-3333-3333-333333333333', 'c@library.test', 'authenticated', 'authenticated');

create temporary table test_vals (k text primary key, v text) on commit drop;
grant all on test_vals to authenticated, anon;

---------------------------------------------------------------------------
-- Helpers (definer ones read whatever the table owner can see).
---------------------------------------------------------------------------
create function pg_temp.val(p text) returns text language sql as
$$ select v from test_vals where k = p $$;

create function pg_temp.hh() returns uuid language sql as $$ select pg_temp.val('hh')::uuid $$;
create function pg_temp.hh2() returns uuid language sql as $$ select pg_temp.val('hh2')::uuid $$;

create function pg_temp.book(n int) returns uuid language sql as
$$ select ('eeeeeeee-0000-0000-0000-' || lpad(n::text, 12, '0'))::uuid $$;

-- The book number of a pg_temp.book uuid, '' for null.
create function pg_temp.num(p uuid) returns text language sql as
$$ select coalesce(ltrim(right(p::text, 12), '0'), '') $$;

create function pg_temp.ua() returns uuid language sql as $$ select '11111111-1111-1111-1111-111111111111'::uuid $$;
create function pg_temp.ub() returns uuid language sql as $$ select '22222222-2222-2222-2222-222222222222'::uuid $$;

-- status/source/date/set_by-is-user for book n and user u.
create function pg_temp.st(n int, u uuid) returns text language sql security definer as
$$ select coalesce((select s.status || '/' || s.source || '/' || coalesce(s.finished_on::text, '') || '/'
                           || coalesce((s.set_by = u)::text, 'null')
                      from library.read_statuses s where s.book_id = pg_temp.book(n) and s.user_id = u), 'none') $$;

-- match_state:book of u's history row with this title.
create function pg_temp.hs(u uuid, p_title text) returns text language sql security definer as
$$ select coalesce((select h.match_state || ':' || pg_temp.num(h.book_id)
                      from library.reading_history h where h.user_id = u and h.title = p_title), 'none') $$;

-- book:reason:state of the candidates of u's history row with this title.
create function pg_temp.cands(u uuid, p_title text) returns text language sql security definer as
$$ select coalesce((select string_agg(pg_temp.num(c.book_id) || ':' || c.reason || ':' || c.state, ',' order by c.book_id)
                      from library.reading_history_candidates c
                      join library.reading_history h on h.id = c.history_id
                     where h.user_id = u and h.title = p_title), '') $$;

create function pg_temp.hcount(u uuid) returns int language sql security definer as
$$ select count(*)::int from library.reading_history h where h.user_id = u $$;

-- One upload row.
create function pg_temp.r(p_title text, p_authors text[], p_isbn text, p_status text, p_last text) returns jsonb
language sql as
$$ select jsonb_build_object('title', p_title, 'authors', to_jsonb(p_authors), 'isbnUid', p_isbn,
                             'status', p_status, 'lastRead', p_last) $$;

-- upload_reading_history counts as rows/matched/applied/possible/unmatched.
create function pg_temp.up(p_hh uuid, p_rows jsonb) returns text language sql as
$$ select u.rows || '/' || u.matched || '/' || u.applied || '/' || u.possible || '/' || u.unmatched
     from library.upload_reading_history(p_hh, p_rows) u $$;

---------------------------------------------------------------------------
-- Households: A and B in H, C alone in H2.
---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
insert into test_vals (k, v) select 'hh', library.create_household('Home', 'Member A')::text;
insert into test_vals (k, v) select 'code', h.invite_code from library.households h where h.id = pg_temp.hh();

set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';
insert into test_vals (k, v) select 'joined', library.join_household(pg_temp.val('code'), 'Member B')::text;

set local request.jwt.claims = '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}';
insert into test_vals (k, v) select 'hh2', library.create_household('Other Home', 'Member C')::text;

-- Books are inserted by A, as the app does, so the key functions must be
-- executable by authenticated wherever books use them.
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
insert into library.books (id, household_id, title, authors, isbn13, isbn10)
values
  (pg_temp.book(1),  pg_temp.hh(), 'The Salt Road',          '{Petra Wynnecombe}',   '{9780000000002}', '{}'),
  (pg_temp.book(2),  pg_temp.hh(), 'Glass Orchard: A Novel', '{Orrin Vashti}',       '{}', '{}'),
  (pg_temp.book(3),  pg_temp.hh(), 'Ember Folio',            '{Lysander Quell}',     '{}', '{}'),
  (pg_temp.book(4),  pg_temp.hh(), 'Ember Folio',            '{Lysander Quell}',     '{}', '{}'),
  (pg_temp.book(5),  pg_temp.hh(), 'Glass Orchard Ledger',   '{Maren Holloway}',     '{}', '{}'),
  (pg_temp.book(6),  pg_temp.hh(), 'Harbor of Thorns',       '{Ines Calloway}',      '{9780000000019}', '{}'),
  (pg_temp.book(7),  pg_temp.hh(), 'Moth Cartography',       '{Delphine Arkwright}', '{}', '{}'),
  (pg_temp.book(8),  pg_temp.hh(), 'Tidewater Psalm',        '{Corwin Ashgrove}',    '{}', '{}'),
  (pg_temp.book(9),  pg_temp.hh(), 'Lantern',                '{Wilhelmina Strand}',  '{}', '{}'),
  (pg_temp.book(10), pg_temp.hh(), '???',                    '{}',                   '{}', '{}'),
  (pg_temp.book(11), pg_temp.hh(), 'Saltmarsh Hymn',         '{Petra Wynnecombe}',   '{}', '{}'),
  (pg_temp.book(12), pg_temp.hh(), 'Velvet Quarry',          '{Petra Wynnecombe}',   '{}', '{0000000027}');
select pass('a member inserts books while the key functions back their indexes');

-- A marks book 11 Unread (cleared) and book 12 Did not finish in the app.
select library.set_read_status(pg_temp.hh(), array[pg_temp.book(11)], 'unread', null, false);
select library.set_read_status(pg_temp.hh(), array[pg_temp.book(12)], 'dnf', null, false);

reset role;
set local request.jwt.claims = '{}';

---------------------------------------------------------------------------
-- Schema and grants (as postgres).
---------------------------------------------------------------------------
select has_table('library', 'reading_history', 'reading_history exists');
select has_table('library', 'reading_history_candidates', 'reading_history_candidates exists');
select ok((select relrowsecurity from pg_class where oid = 'library.reading_history'::regclass)
          and (select relrowsecurity from pg_class where oid = 'library.reading_history_candidates'::regclass),
          'RLS is enabled on both history tables');
select columns_are('library', 'reading_history',
  array['id', 'household_id', 'user_id', 'sg_key', 'title', 'authors', 'isbn13', 'sg_status', 'last_read',
        'title_key', 'base_title_key', 'author_keys', 'book_id', 'match_state', 'created_at', 'updated_at'],
  'reading_history stores only the D2 columns: no review, rating or other export field');
select columns_are('library', 'reading_history_candidates',
  array['history_id', 'book_id', 'household_id', 'reason', 'state', 'created_at'],
  'reading_history_candidates has the D2 columns');
select ok(has_table_privilege('authenticated', 'library.reading_history', 'select')
          and not has_table_privilege('authenticated', 'library.reading_history', 'insert')
          and not has_table_privilege('authenticated', 'library.reading_history', 'update')
          and not has_table_privilege('authenticated', 'library.reading_history', 'delete')
          and has_table_privilege('authenticated', 'library.reading_history_candidates', 'select')
          and not has_table_privilege('authenticated', 'library.reading_history_candidates', 'insert')
          and not has_table_privilege('authenticated', 'library.reading_history_candidates', 'update')
          and not has_table_privilege('authenticated', 'library.reading_history_candidates', 'delete'),
          'authenticated may only select the history tables');
select ok(not has_table_privilege('anon', 'library.reading_history', 'select')
          and not has_table_privilege('anon', 'library.reading_history_candidates', 'select'),
          'anon has no access to the history tables');
select ok(has_function_privilege('authenticated', 'library.upload_reading_history(uuid, jsonb)', 'execute')
          and not has_function_privilege('anon', 'library.upload_reading_history(uuid, jsonb)', 'execute'),
          'authenticated, not anon, can execute upload_reading_history');
select ok(not has_function_privilege('authenticated', 'library._match_history_row(uuid)', 'execute')
          and not has_function_privilege('anon', 'library._match_history_row(uuid)', 'execute'),
          'nobody but the owner can execute _match_history_row');

---------------------------------------------------------------------------
-- Keys (D5).
---------------------------------------------------------------------------
select is(library.match_title_key('The Salt Road (Edition Deluxe)'), 'salt road',
          'title key drops an edition parenthetical and a leading article');
select is(library.match_title_key('Glass Orchard (Lantern Cycle, #2)'), 'glass orchard',
          'title key drops a StoryGraph series parenthetical with #');
select is(library.match_base_title_key('Glass Orchard: A Novel'), 'glass orchard',
          'base title key is the text before the first colon');
select is(library.match_author_key('P. J. Wynnecombe'), 'pj wynnecombe', 'author key joins initials');
select is(library.match_norm('Café & Crème'), 'cafe and creme', 'norm strips accents and spells out &');
select is(library.match_isbn13('0-00-000000-0'), '9780000000002', 'a valid ISBN-10 becomes its 978 ISBN-13');
select is(library.match_isbn13('978-0-00-000001-9'), '9780000000019', 'a valid ISBN-13 is kept, hyphens stripped');
select is(library.match_isbn13('9780000000010'), null, 'an ISBN-13 with a bad checksum is null');
select is(library.match_isbn13('0-00-000000-1'), null, 'an ISBN-10 with a bad checksum is null');
select is(library.match_isbn13('B0ABCDEFGH'), null, 'an ASIN-shaped id is null');
select is(library.match_isbn13('  '), null, 'a blank id is null');
select is((select library.book_isbn13s(b) from library.books b where b.id = pg_temp.book(12)),
          array['9780000000026'], 'book_isbn13s converts the book''s ISBN-10s');

-- Parity with src/lib/libib/match-keys.test.ts (every pair without '#'),
-- outputs as the TypeScript functions give them.
create temporary table parity (fn text, input text, expected text) on commit drop;
insert into parity values
  ('title', 'The Glass Orchard (Deluxe Limited Edition)', 'glass orchard'),
  ('title', 'glass orchard', 'glass orchard'),
  ('title', 'Moon''s Tide', 'moons tide'),
  ('title', 'Moon’s Tide', 'moons tide'),
  ('title', 'Salt & Ember', 'salt and ember'),
  ('title', 'Salt and Ember', 'salt and ember'),
  ('title', 'Poète', 'poete'),
  ('title', 'Poete', 'poete'),
  ('title', 'The Glass Orchard (Original)', 'glass orchard original'),
  ('title', 'The Glass Orchard', 'glass orchard'),
  ('title', 'Стеклянный сад', 'стеклянныи сад'),
  ('title', 'СТЕКЛЯННЫЙ САД', 'стеклянныи сад'),
  ('title', 'Соляная дорога', 'соляная дорога'),
  ('title', '硝子の果樹園', '硝子の果樹園'),
  ('title', '塩の道', '塩の道'),
  ('title', '!!!', ''),
  ('base', 'Ember Road: Book 2', 'ember road'),
  ('base', 'Ember Road: Book 3', 'ember road'),
  ('base', 'Ember Road - Book 2', 'ember road'),
  ('base', 'Ember Road', 'ember road'),
  ('base', ': Book 2', ''),
  ('author', 'J. K. Vale', 'jk vale'),
  ('author', 'J K Vale', 'jk vale'),
  ('author', 'JK Vale', 'jk vale'),
  ('author', '波多野 蓮', '波多野 蓮'),
  ('author', 'A B', 'ab'),
  ('author', 'a b', 'ab'),
  ('author', 'C D', 'cd'),
  ('author', '!!!', '');

select is((select string_agg(input || ' -> ' || library.match_title_key(input), '; ') from parity
            where fn = 'title' and library.match_title_key(input) is distinct from expected),
          null, 'match_title_key matches titleKey on every parity pair');
select is((select string_agg(input || ' -> ' || library.match_base_title_key(input), '; ') from parity
            where fn = 'base' and library.match_base_title_key(input) is distinct from expected),
          null, 'match_base_title_key matches baseTitleKey on every parity pair');
select is((select string_agg(input || ' -> ' || library.match_author_key(input), '; ') from parity
            where fn = 'author' and library.match_author_key(input) is distinct from expected),
          null, 'match_author_key matches authorKey on every parity pair');

---------------------------------------------------------------------------
-- First upload, as A (D5).
---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

select is(pg_temp.up(pg_temp.hh(), jsonb_build_array(
    pg_temp.r('The Salt Road', '{Petra Wynnecombe}', '0-00-000000-0', 'read', '2026-01-05'),
    pg_temp.r('Quiet Meridian', '{Bram Oakhurst}', '9780000000019', 'read', null),
    pg_temp.r('Moth Cartography', '{Delphine Arkwright,Fennick Thorne}', null, 'dnf', '2026-02-01'),
    pg_temp.r('Ember Folio', '{Lysander Quell}', null, 'read', '2026-02-02'),
    pg_temp.r('Tidewater Psalm', '{Korwin Ashgrove}', null, 'read', null),
    pg_temp.r('Glass Orchard', '{Maren Holloway}', null, 'read', null),
    pg_temp.r('Lantern Keep', '{Wilhelmina Strand}', null, 'read', null),
    pg_temp.r('Unwritten Atlas', '{Nobody Known}', 'UID-AB12', 'read', null),
    pg_temp.r('!!!', '{}', null, 'read', null),
    pg_temp.r('Saltmarsh Hymn', '{Petra Wynnecombe}', null, 'read', '2026-01-09'),
    pg_temp.r('Velvet Quarry', '{Petra Wynnecombe}', null, 'read', '2026-01-10'))),
  '11/4/2/4/3', 'first upload: 11 rows, 4 matched, 2 newly marked, 4 possible, 3 unmatched');

select is(pg_temp.hs(pg_temp.ua(), 'The Salt Road'), 'matched:1', 'an ISBN row matches its book');
select is(pg_temp.st(1, pg_temp.ua()), 'read/storygraph/2026-01-05/null', 'A''s read is applied with its date');

select is(pg_temp.hs(pg_temp.ua(), 'Quiet Meridian'), 'possible:', 'an ISBN row with another title and author is possible');
select is(pg_temp.cands(pg_temp.ua(), 'Quiet Meridian'), '6:isbn_title_differs:pending', 'its candidate is isbn_title_differs');
select is(pg_temp.st(6, pg_temp.ua()), 'none', 'and no status is written');

select is(pg_temp.hs(pg_temp.ua(), 'Moth Cartography'), 'matched:7', 'title + first author matches');
select is(pg_temp.st(7, pg_temp.ua()), 'dnf/storygraph/2026-02-01/null', 'and its dnf is applied');

select is(pg_temp.hs(pg_temp.ua(), 'Ember Folio'), 'possible:', 'a row matching two same-titled books is possible');
select is(pg_temp.cands(pg_temp.ua(), 'Ember Folio'), '3:several_books:pending,4:several_books:pending',
          'with two several_books candidates');
select is(pg_temp.st(3, pg_temp.ua()) || ',' || pg_temp.st(4, pg_temp.ua()), 'none,none',
          'and no status on either book');

select is(pg_temp.cands(pg_temp.ua(), 'Tidewater Psalm'), '8:title_author_differs:pending',
          'the same title by a differently spelled author is title_author_differs');
select is(pg_temp.cands(pg_temp.ua(), 'Glass Orchard'), '2:title_author_differs:pending,5:title_prefix:pending',
          'a two-token title prefix with the same author is title_prefix');
select is(pg_temp.hs(pg_temp.ua(), 'Lantern Keep') || ' ' || pg_temp.cands(pg_temp.ua(), 'Lantern Keep'), 'unmatched: ',
          'a one-token prefix gives nothing');
select is(pg_temp.hs(pg_temp.ua(), 'Unwritten Atlas'), 'unmatched:', 'no match is unmatched');
select is(pg_temp.hs(pg_temp.ua(), '!!!') || ' ' || pg_temp.cands(pg_temp.ua(), '!!!'), 'unmatched: ',
          'an empty title key matches nothing, not even an empty-keyed book');

select is(pg_temp.hs(pg_temp.ua(), 'Saltmarsh Hymn'), 'matched:11', 'a row on a book A cleared matches');
select is(pg_temp.st(11, pg_temp.ua()), 'cleared/app//true', 'but the cleared status stays (Review Focus 1)');
select is(pg_temp.st(12, pg_temp.ua()), 'dnf/app//true', 'an app dnf stays');

select is((select count(*)::int from library.reading_history), 11, 'A sees their 11 history rows');
select is((select count(*)::int from library.reading_history_candidates), 6, 'and their 6 candidates');
select is((select count(*)::int from library.reading_history where sg_key = 'isbn:9780000000002'
             or sg_key = 'uid:uid-ab12' or sg_key = 't:ember folio|lysander quell'), 3,
          'sg_key is isbn:, uid: (lowercased) or t:title|authors');

---------------------------------------------------------------------------
-- Upload rules (D3, D7).
---------------------------------------------------------------------------
select is(pg_temp.up(pg_temp.hh(), jsonb_build_array(
    pg_temp.r('The Salt Road', '{Petra Wynnecombe}', '0-00-000000-0', 'read', '2026-01-05'),
    pg_temp.r('Moth Cartography', '{Delphine Arkwright,Fennick Thorne}', null, 'dnf', '2026-02-01'),
    pg_temp.r('Unwritten Atlas', '{Nobody Known}', 'UID-AB12', 'read', null))),
  '3/2/0/0/1', 're-uploading 3 rows writes nothing new');
select is(pg_temp.hcount(pg_temp.ua()), 11, 'and creates no new history rows');

select is(pg_temp.up(pg_temp.hh(), jsonb_build_array(
    pg_temp.r('Moth Cartography', '{Delphine Arkwright,Fennick Thorne}', null, 'read', '2026-03-03'))),
  '1/1/1/0/0', 'a newer read for a dnf book is applied');
select is(pg_temp.st(7, pg_temp.ua()), 'read/storygraph/2026-03-03/null', 'dnf -> read upgrades with the new date');

select is(pg_temp.up(pg_temp.hh(), jsonb_build_array(
    pg_temp.r('Moth Cartography', '{Delphine Arkwright,Fennick Thorne}', null, 'dnf', '2026-03-10'))),
  '1/1/0/0/0', 'a dnf for a read book applies nothing');
select is(pg_temp.st(7, pg_temp.ua()), 'read/storygraph/2026-03-03/null', 'read -> dnf never downgrades');

select is(pg_temp.up(pg_temp.hh(), jsonb_build_array(
    pg_temp.r('The Salt Road', '{Petra Wynnecombe}', '0000000000', 'read', '2026-04-04'))),
  '1/1/1/0/0', 'a newer lastRead is applied');
select is(pg_temp.st(1, pg_temp.ua()), 'read/storygraph/2026-04-04/null', 'and updates the date');

select is(pg_temp.up(pg_temp.hh(), jsonb_build_array(
    pg_temp.r('Saltmarsh Hymn', '{Petra Wynnecombe}', null, 'read', '2026-04-05'))),
  '1/1/0/0/0', 're-uploading a read row for a cleared book applies nothing');
select is(pg_temp.st(11, pg_temp.ua()), 'cleared/app//true', 'the cleared row stays cleared (Review Focus 1)');

select is(pg_temp.up(pg_temp.hh(), jsonb_build_array(
    pg_temp.r('Lantern Keep', '{Wilhelmina Strand}', null, 'read', null),
    pg_temp.r('Lantern Keep', '{Wilhelmina Strand}', null, 'read', null))),
  '2/0/0/0/2', 'the same row twice in one batch is answered twice');
select is(pg_temp.hcount(pg_temp.ua()), 11, 'rows absent from later uploads remain, and duplicates add none');

select throws_ok($$ select pg_temp.up(pg_temp.hh(), jsonb_build_array(
    pg_temp.r('Some Title', '{}', null, 'to-read', null))) $$,
  '22023', null, 'a to-read status is 22023');
select throws_ok($$ select pg_temp.up(pg_temp.hh(),
    (select jsonb_agg(pg_temp.r('Row ' || g, '{}', null, 'read', null)) from generate_series(1, 501) g)) $$,
  '22023', null, '501 rows is 22023');
select throws_ok($$ select pg_temp.up(pg_temp.hh(), '[]'::jsonb) $$, '22023', null, 'an empty batch is 22023');
select throws_ok($$ select pg_temp.up(pg_temp.hh(), jsonb_build_array(
    pg_temp.r('  ', '{}', null, 'read', null))) $$,
  '22023', null, 'a blank title is 22023');
select throws_ok($$ select pg_temp.up(pg_temp.hh(), jsonb_build_array(
    pg_temp.r('Some Title', '{}', null, 'read', '2026-02-30'))) $$,
  '22023', null, 'a lastRead that is not a calendar date is 22023');
select throws_ok($$ select pg_temp.up(pg_temp.hh(), jsonb_build_array(
    jsonb_build_object('title', 'Some Title', 'authors', '[1]'::jsonb, 'status', 'read'))) $$,
  '22023', null, 'a non-string author is 22023');
select is(pg_temp.hcount(pg_temp.ua()), 11, 'a rejected batch writes nothing');

---------------------------------------------------------------------------
-- Dismissed pairs are skipped (D5).
---------------------------------------------------------------------------
reset role;
set local request.jwt.claims = '{}';
update library.reading_history_candidates c set state = 'dismissed'
  from library.reading_history h
 where h.id = c.history_id and h.user_id = pg_temp.ua() and h.title = 'Tidewater Psalm';

set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
select is(pg_temp.up(pg_temp.hh(), jsonb_build_array(pg_temp.r('Tidewater Psalm', '{Korwin Ashgrove}', null, 'read', null))),
  '1/0/0/0/1', 'a row whose only candidate was dismissed counts as unmatched');
select is(pg_temp.hs(pg_temp.ua(), 'Tidewater Psalm') || ' ' || pg_temp.cands(pg_temp.ua(), 'Tidewater Psalm'),
          'dismissed: 8:title_author_differs:dismissed', 'it is dismissed and the pair is not offered again');

---------------------------------------------------------------------------
-- Outsiders and privacy.
---------------------------------------------------------------------------
set local request.jwt.claims = '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}';
select throws_ok($$ select pg_temp.up(pg_temp.hh(), jsonb_build_array(pg_temp.r('Ember Folio', '{}', null, 'read', null))) $$,
  '42501', null, 'C uploading into H is 42501');
select is((select count(*)::int from library.reading_history), 0, 'C sees no history rows');
select is((select count(*)::int from library.reading_history_candidates), 0, 'C sees no candidates');

set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';
select is((select count(*)::int from library.reading_history), 0, 'B cannot select A''s history');
select is((select count(*)::int from library.reading_history_candidates), 0, 'B cannot select A''s candidates');
select is(pg_temp.up(pg_temp.hh(), jsonb_build_array(
    pg_temp.r('Moth Cartography', '{Delphine Arkwright}', null, 'read', '2026-05-05'),
    pg_temp.r('Velvet Quarry', '{Petra Wynnecombe}', null, 'read', '2026-05-06'))),
  '2/2/2/0/0', 'B''s upload matches and marks for B');
select is(pg_temp.st(7, pg_temp.ub()) || ',' || pg_temp.st(12, pg_temp.ub()),
          'read/storygraph/2026-05-05/null,read/storygraph/2026-05-06/null', 'B''s statuses are written');
select is(pg_temp.st(7, pg_temp.ua()) || ',' || pg_temp.st(12, pg_temp.ua()),
          'read/storygraph/2026-03-03/null,dnf/app//true', 'A''s statuses are untouched by B''s upload');
select is((select count(*)::int from library.reading_history), 2, 'B sees only their own 2 rows');
select is(pg_temp.hcount(pg_temp.ua()), 11, 'A''s history is untouched by B''s upload');

---------------------------------------------------------------------------
-- A deleted book frees its rows.
---------------------------------------------------------------------------
reset role;
set local request.jwt.claims = '{}';
delete from library.books where id = pg_temp.book(1);
select is(pg_temp.hs(pg_temp.ua(), 'The Salt Road'), 'unmatched:', 'deleting a matched book makes its row unmatched');
delete from library.books where id = pg_temp.book(3);
select is(pg_temp.cands(pg_temp.ua(), 'Ember Folio'), '4:several_books:pending', 'and removes the deleted book''s candidates');

---------------------------------------------------------------------------
-- The matcher, called directly as the owner, leaves a matched row alone.
---------------------------------------------------------------------------
select is(library._match_history_row((select h.id from library.reading_history h
                                        where h.user_id = pg_temp.ua() and h.title = 'Moth Cartography')),
          'matched', 'a matched row is never re-matched');
select is(library._match_history_row((select h.id from library.reading_history h
                                        where h.user_id = pg_temp.ua() and h.title = 'Glass Orchard')),
          'possible', 're-running the matcher on a possible row gives the same state');
select is(pg_temp.cands(pg_temp.ua(), 'Glass Orchard'), '2:title_author_differs:pending,5:title_prefix:pending',
          'and the same candidates');

select * from finish();
rollback;
