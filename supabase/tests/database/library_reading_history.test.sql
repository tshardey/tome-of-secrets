-- pgTAP: library private reading history (Plan 8, D2, D5, D7). Proves that
-- the SQL match keys mirror the library app's match-keys.ts and isbn.ts, that
-- the matcher follows D5 (a clear match only when it is certain, candidates
-- otherwise, never a status for two same-titled books), that the upload is
-- idempotent and goes through the StoryGraph who-wins rule (a cleared or app
-- row is never touched), that history is private to its member, and that a
-- deleted book frees its rows.
begin;

create extension if not exists pgtap with schema extensions;

select plan(134);

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

---------------------------------------------------------------------------
-- The new-book hook (D4), Link and Not this book.
---------------------------------------------------------------------------
-- A history row put straight in and left unmatched, as if it had been
-- uploaded before its book was on the shelf. Keys as the upload computes them.
create function pg_temp.hist(u uuid, p_title text, p_authors text[], p_isbn text, p_status text, p_last date)
returns uuid language sql as
$$ insert into library.reading_history (household_id, user_id, sg_key, title, authors, isbn13, sg_status, last_read,
                                        title_key, base_title_key, author_keys)
   values (pg_temp.hh(), u, 'test:' || p_title, p_title, p_authors, p_isbn, p_status, p_last,
           library.match_title_key(p_title), library.match_base_title_key(p_title),
           array(select library.match_author_key(a) from unnest(p_authors) a))
   returning id $$;

-- The id of u's history row with this title.
create function pg_temp.hid(u uuid, p_title text) returns uuid language sql security definer as
$$ select h.id from library.reading_history h where h.user_id = u and h.title = p_title $$;

-- A book in C's household, for the cross-household Link.
insert into library.books (id, household_id, title, authors)
values (pg_temp.book(30), pg_temp.hh2(), 'Lantern Keep', '{Wilhelmina Strand}');

select has_trigger('library', 'books', 'books_match_reading_history', 'books carry the reading-history trigger');
select ok(not has_function_privilege('authenticated', 'library.match_history_for_book()', 'execute')
          and not has_function_privilege('anon', 'library.match_history_for_book()', 'execute'),
          'no client can execute match_history_for_book');
select ok(has_function_privilege('authenticated', 'library.link_reading_history(uuid, uuid)', 'execute')
          and has_function_privilege('authenticated', 'library.dismiss_reading_match(uuid, uuid)', 'execute')
          and not has_function_privilege('anon', 'library.link_reading_history(uuid, uuid)', 'execute')
          and not has_function_privilege('anon', 'library.dismiss_reading_match(uuid, uuid)', 'execute'),
          'authenticated, not anon, can execute Link and Not this book');

-- History for books not on the shelf yet.
set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
select is(pg_temp.up(pg_temp.hh(), jsonb_build_array(
    pg_temp.r('Cinder Almanac', '{Odile Farthing}', '9780000000033', 'read', '2026-06-01'),
    pg_temp.r('Hollow Bell', '{Tamsin Greaves}', '9780000000040', 'dnf', '2026-06-02'),
    pg_temp.r('Ivory Cartouche', '{Remy Falk}', '9780000000064', 'read', null),
    pg_temp.r('Wren Lattice', '{Corin Pell}', null, 'read', '2026-06-05'))),
  '4/0/0/0/4', 'A uploads four books not on the shelf yet: all unmatched');

set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';
select is(pg_temp.up(pg_temp.hh(), jsonb_build_array(
    pg_temp.r('Wren Lattice', '{Corin Pell}', null, 'dnf', '2026-06-06'))),
  '1/0/0/0/1', 'B uploads one book not on the shelf yet');

-- B adds a book with the ISBN of A's row.
insert into library.books (id, household_id, title, authors, isbn13)
values (pg_temp.book(20), pg_temp.hh(), 'Cinder Almanac', '{Odile Farthing}', '{9780000000033}');
select is(pg_temp.hs(pg_temp.ua(), 'Cinder Almanac'), 'matched:20',
          'B adding a book with the ISBN of A''s history row matches the row');
select is(pg_temp.st(20, pg_temp.ua()) || ',' || pg_temp.st(20, pg_temp.ub()), 'read/storygraph/2026-06-01/null,none',
          'and marks A read from A''s own history, and B nothing');

-- A book that gains the ISBN by update.
insert into library.books (id, household_id, title, authors)
values (pg_temp.book(21), pg_temp.hh(), 'Hollow Bell', '{}');
select is(pg_temp.hs(pg_temp.ua(), 'Hollow Bell') || ' ' || pg_temp.cands(pg_temp.ua(), 'Hollow Bell'),
          'possible: 21:title_author_differs:pending', 'a same-titled book with no author is only possible');
update library.books set isbn13 = '{9780000000040}' where id = pg_temp.book(21);
select is(pg_temp.hs(pg_temp.ua(), 'Hollow Bell') || ' ' || pg_temp.cands(pg_temp.ua(), 'Hollow Bell'),
          'matched:21 ', 'adding the row''s ISBN to the book by update matches it');
select is(pg_temp.st(21, pg_temp.ua()), 'dnf/storygraph/2026-06-02/null', 'and applies A''s dnf');

-- An uncertain new book.
insert into library.books (id, household_id, title, authors)
values (pg_temp.book(22), pg_temp.hh(), 'Ivory Cartouche', '{Remi Falke}');
select is(pg_temp.hs(pg_temp.ua(), 'Ivory Cartouche') || ' ' || pg_temp.cands(pg_temp.ua(), 'Ivory Cartouche'),
          'possible: 22:title_author_differs:pending', 'an uncertain new book adds a candidate');
select is(pg_temp.st(22, pg_temp.ua()), 'none', 'and writes no status');

-- Both members' history on one insert.
insert into library.books (id, household_id, title, authors)
values (pg_temp.book(25), pg_temp.hh(), 'Wren Lattice', '{Corin Pell}');
select is(pg_temp.hs(pg_temp.ua(), 'Wren Lattice') || ',' || pg_temp.hs(pg_temp.ub(), 'Wren Lattice'),
          'matched:25,matched:25', 'one insert checks A''s and B''s history');
select is(pg_temp.st(25, pg_temp.ua()) || ',' || pg_temp.st(25, pg_temp.ub()),
          'read/storygraph/2026-06-05/null,dnf/storygraph/2026-06-06/null', 'and marks each member from their own row');

-- A title edit re-runs the matcher; a synopsis edit doesn't.
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
insert into library.books (id, household_id, title, authors)
values (pg_temp.book(23), pg_temp.hh(), 'Brass Meridian', '{Quentin Hale}');
reset role;
set local request.jwt.claims = '{}';
insert into test_vals (k, v)
select 'brass', pg_temp.hist(pg_temp.ua(), 'Brass Meridian', '{Quentin Hale}', null, 'read', '2026-06-03')::text;
set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
update library.books set synopsis = 'A synthetic synopsis.' where id = pg_temp.book(23);
select is(pg_temp.hs(pg_temp.ua(), 'Brass Meridian'), 'unmatched:', 'a synopsis-only edit does not run the matcher');
update library.books set title = title, authors = authors where id = pg_temp.book(23);
select is(pg_temp.hs(pg_temp.ua(), 'Brass Meridian'), 'unmatched:',
          'an update that leaves title, authors and ISBNs as they were does not run it');
update library.books set title = 'Brass Meridian: A Novel' where id = pg_temp.book(23);
select is(pg_temp.hs(pg_temp.ua(), 'Brass Meridian'), 'matched:23', 'a title-only edit runs it');
select is(pg_temp.st(23, pg_temp.ua()), 'read/storygraph/2026-06-03/null', 'and applies the read');

-- A new book whose title is a prefix of the row's, then retitled away.
reset role;
set local request.jwt.claims = '{}';
insert into test_vals (k, v)
select 'saffron', pg_temp.hist(pg_temp.ua(), 'Saffron Weir Chronicle', '{Nell Ardent}', null, 'read', null)::text;
set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
insert into library.books (id, household_id, title, authors)
values (pg_temp.book(28), pg_temp.hh(), 'Saffron Weir', '{Nell Ardent}');
select is(pg_temp.hs(pg_temp.ua(), 'Saffron Weir Chronicle') || ' ' || pg_temp.cands(pg_temp.ua(), 'Saffron Weir Chronicle'),
          'possible: 28:title_prefix:pending', 'a new book whose title is a prefix of the row''s is a title_prefix candidate');
update library.books set title = 'Marrow Tide' where id = pg_temp.book(28);
select is(pg_temp.hs(pg_temp.ua(), 'Saffron Weir Chronicle') || ' ' || pg_temp.cands(pg_temp.ua(), 'Saffron Weir Chronicle'),
          'unmatched: ', 'retitling the candidate book away re-runs the row and drops the candidate');

-- A cleared book (Review Focus 1).
insert into library.books (id, household_id, title, authors)
values (pg_temp.book(24), pg_temp.hh(), 'Pale Orrery', '{Sabine Lark}');
select library.set_read_status(pg_temp.hh(), array[pg_temp.book(24)], 'unread', null, false);
reset role;
set local request.jwt.claims = '{}';
insert into test_vals (k, v)
select 'pale', pg_temp.hist(pg_temp.ua(), 'Pale Orrery', '{Sabine Lark}', '9780000000057', 'read', '2026-06-04')::text;
set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
update library.books set isbn13 = '{9780000000057}' where id = pg_temp.book(24);
select is(pg_temp.hs(pg_temp.ua(), 'Pale Orrery'), 'matched:24', 'a cleared book gaining the row''s ISBN links the row');
select is(pg_temp.st(24, pg_temp.ua()), 'cleared/app//true', 'and the status stays cleared (Review Focus 1)');

---------------------------------------------------------------------------
-- A matching failure never blocks a book write (Review Focus 3). The key
-- functions back indexes on books, so a failing one would fail the insert
-- before the hook runs; the failure is injected into the matcher instead.
---------------------------------------------------------------------------
reset role;
set local request.jwt.claims = '{}';
insert into test_vals (k, v)
select 'matcher_def', pg_get_functiondef('library._match_history_row(uuid)'::regprocedure);
create temporary sequence match_calls;
create or replace function library._match_history_row(p_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform nextval('pg_temp.match_calls');
  raise exception 'test_matcher_failure';
end;
$$;
insert into test_vals (k, v)
select 'gilt', pg_temp.hist(pg_temp.ua(), 'Gilt Sextant', '{Ada Morrow}', null, 'read', '2026-06-07')::text;

set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
select lives_ok($$ insert into library.books (id, household_id, title, authors)
                   values (pg_temp.book(26), pg_temp.hh(), 'Gilt Sextant', '{Ada Morrow}') $$,
                'a failing matcher never blocks a book insert (Review Focus 3)');
reset role;
set local request.jwt.claims = '{}';
select ok((select is_called from pg_temp.match_calls), 'the failing matcher was reached, and its error was caught');
select is((select count(*)::int from library.books where id = pg_temp.book(26)), 1, 'the book is saved');
select is(pg_temp.hs(pg_temp.ua(), 'Gilt Sextant') || ' ' || pg_temp.st(26, pg_temp.ua()), 'unmatched: none',
          'and the failed matching left nothing behind');
select matches(pg_get_functiondef('library.match_history_for_book()'::regprocedure),
               'exception\s+when\s+others\s+then\s+raise\s+warning\s+''read_history_match_failed %'',\s*sqlstate',
               'the hook turns a matching error into a warning, not an error');

do $$ begin execute pg_temp.val('matcher_def'); end $$;
set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
update library.books set title = 'Gilt Sextant: A Novel' where id = pg_temp.book(26);
select is(pg_temp.hs(pg_temp.ua(), 'Gilt Sextant'), 'matched:26', 'with the matcher restored, the next edit links the row');

---------------------------------------------------------------------------
-- Bulk (Review Focus 3): 2,000 history rows, a 300-book import, 30 matches.
---------------------------------------------------------------------------
reset role;
set local request.jwt.claims = '{}';
insert into library.reading_history (household_id, user_id, sg_key, title, authors, sg_status,
                                     title_key, base_title_key, author_keys)
select pg_temp.hh(), pg_temp.ua(), 'bulk:' || g, 'Quillon Register ' || g, '{Hesper Vantablue}', 'read',
       library.match_title_key('Quillon Register ' || g), library.match_base_title_key('Quillon Register ' || g),
       '{hesper vantablue}'
  from generate_series(1, 2000) g;

set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
select lives_ok($$ insert into library.books (household_id, title, authors)
                   select pg_temp.hh(),
                          case when g <= 30 then 'Quillon Register ' || g else 'Nonesuch Folio ' || g end,
                          '{Hesper Vantablue}'
                     from generate_series(1, 300) g $$,
                'a 300-book import into a household with 2,000 history rows succeeds');
reset role;
set local request.jwt.claims = '{}';
select is((select count(*)::int from library.books
            where household_id = pg_temp.hh() and (title like 'Quillon Register %' or title like 'Nonesuch Folio %')),
          300, 'all 300 books are inserted');
select is((select count(*)::int from library.reading_history h join library.books b on b.id = h.book_id
            where h.user_id = pg_temp.ua() and h.title like 'Quillon Register %'
              and h.match_state = 'matched' and b.title = h.title),
          30, 'exactly the 30 matching rows are matched, each to its own book');
select is((select count(*)::int from library.reading_history h
            where h.user_id = pg_temp.ua() and h.title like 'Quillon Register %' and h.match_state <> 'unmatched'),
          30, 'and the other 1,970 stay unmatched');
select is((select count(*)::int from library.read_statuses s join library.books b on b.id = s.book_id
            where s.user_id = pg_temp.ua() and b.title like 'Quillon Register %'
              and s.status = 'read' and s.source = 'storygraph'),
          30, 'and A has 30 new statuses');

---------------------------------------------------------------------------
-- Link and Not this book, as A.
---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
insert into library.books (id, household_id, title, authors)
values (pg_temp.book(27), pg_temp.hh(), 'Ember Folio', '{Lysander Quell}');
select is(pg_temp.cands(pg_temp.ua(), 'Ember Folio'), '4:several_books:pending,27:several_books:pending',
          'a second same-titled book added offers both as several_books (Review Focus 2)');
select is(pg_temp.st(4, pg_temp.ua()) || ',' || pg_temp.st(27, pg_temp.ua()), 'none,none', 'and marks neither');

select is(library.link_reading_history(pg_temp.hid(pg_temp.ua(), 'Ember Folio'), pg_temp.book(27)), 'linked',
          'Link on one Ember Folio candidate is linked');
select is(pg_temp.hs(pg_temp.ua(), 'Ember Folio') || ' ' || pg_temp.cands(pg_temp.ua(), 'Ember Folio'), 'matched:27 ',
          'the row is matched to it and the other candidate is gone');
select is(pg_temp.st(27, pg_temp.ua()) || ',' || pg_temp.st(4, pg_temp.ua()), 'read/storygraph/2026-02-02/null,none',
          'and the status is applied to the linked book only');

select is(library.link_reading_history(pg_temp.hid(pg_temp.ub(), 'Moth Cartography'), pg_temp.book(7)), 'not_found',
          'Link on B''s row as A is not_found');
select is(library.link_reading_history(pg_temp.hid(pg_temp.ua(), 'Lantern Keep'), pg_temp.book(30)), 'not_found',
          'Link to a book in another household is not_found');
select is(pg_temp.hs(pg_temp.ua(), 'Lantern Keep'), 'unmatched:', 'and changes nothing');
select throws_ok($$ select library.link_reading_history(null, pg_temp.book(4)) $$, '22023', null,
                 'Link without a history row is 22023');

select is(library.dismiss_reading_match(pg_temp.hid(pg_temp.ua(), 'Ivory Cartouche'), pg_temp.book(22)), 'dismissed',
          'Not this book is dismissed');
select is(pg_temp.hs(pg_temp.ua(), 'Ivory Cartouche') || ' ' || pg_temp.cands(pg_temp.ua(), 'Ivory Cartouche'),
          'dismissed: 22:title_author_differs:dismissed', 'with nothing else pending the row is dismissed');
update library.books set isbn13 = '{9780000000064}', authors = '{Remy Falk}' where id = pg_temp.book(22);
select is(pg_temp.hs(pg_temp.ua(), 'Ivory Cartouche') || ' ' || pg_temp.cands(pg_temp.ua(), 'Ivory Cartouche')
            || ' ' || pg_temp.st(22, pg_temp.ua()),
          'dismissed: 22:title_author_differs:dismissed none',
          'a dismissed pair is never proposed or clear-matched again, even after the book gains the row''s ISBN');

select is(library.dismiss_reading_match(pg_temp.hid(pg_temp.ua(), 'Glass Orchard'), pg_temp.book(5)), 'dismissed',
          'Not this book on one of two candidates is dismissed');
select is(pg_temp.hs(pg_temp.ua(), 'Glass Orchard') || ' ' || pg_temp.cands(pg_temp.ua(), 'Glass Orchard'),
          'possible: 2:title_author_differs:pending,5:title_prefix:dismissed', 'and leaves the row possible');
select is(library.dismiss_reading_match(pg_temp.hid(pg_temp.ub(), 'Wren Lattice'), pg_temp.book(25)), 'not_found',
          'Not this book on B''s row as A is not_found');
select is(library.dismiss_reading_match(pg_temp.hid(pg_temp.ua(), 'Lantern Keep'), pg_temp.book(9)), 'not_found',
          'Not this book for a book that is not a candidate is not_found');

set local request.jwt.claims = '{}';
select throws_ok($$ select library.link_reading_history(gen_random_uuid(), pg_temp.book(4)) $$, '42501', null,
                 'Link signed out is 42501');
select throws_ok($$ select library.dismiss_reading_match(gen_random_uuid(), pg_temp.book(4)) $$, '42501', null,
                 'Not this book signed out is 42501');

select * from finish();
rollback;
