-- pgTAP: library copy flags (unhauled_at, deluxe, signed), the on_shelf
-- computed field and the unhauled outcome of the cover batch RPC.
-- Proves the defaults, that a book is off the shelf only when it has copies
-- and all are unhauled, that non-members and anon change and see nothing, and
-- that a batch skips an unhauled book unless the request is manual.
begin;

create extension if not exists pgtap with schema extensions;

select plan(29);

insert into auth.users (id, email, aud, role)
values
  ('11111111-1111-1111-1111-111111111111', 'a@library.test', 'authenticated', 'authenticated'),
  ('22222222-2222-2222-2222-222222222222', 'b@library.test', 'authenticated', 'authenticated');

-- Scratch space to carry values across role switches.
create temporary table test_vals (k text primary key, v text) on commit drop;
grant all on test_vals to authenticated, anon;

create function pg_temp.val(p text) returns text language sql as
$$ select v from test_vals where k = p $$;

create function pg_temp.hh() returns uuid language sql as
$$ select pg_temp.val('hh')::uuid $$;

-- Book n (made-up ids).
create function pg_temp.book(n int) returns uuid language sql as
$$ select ('eeeeeeee-0000-0000-0000-' || lpad(n::text, 12, '0'))::uuid $$;

-- Copy i of book n (made-up ids).
create function pg_temp.copy(n int, i int) returns uuid language sql as
$$ select ('cccccccc-0000-0000-' || lpad(n::text, 4, '0') || '-' || lpad(i::text, 12, '0'))::uuid $$;

create function pg_temp.batch() returns uuid language sql as
$$ select 'bbbbbbbb-0000-0000-0000-000000000006'::uuid $$;

-- As the current user.
create function pg_temp.shelf(n int) returns boolean language sql as
$$ select library.on_shelf(b) from library.books b where b.id = pg_temp.book(n) $$;

create function pg_temp.outcome(n int, manual boolean) returns text language sql as
$$ select r.outcome from library.request_cover_searches(pg_temp.hh(), array[pg_temp.book(n)],
                                                        pg_temp.batch(), manual) r $$;

---------------------------------------------------------------------------
-- Household H has A only; B is a stranger.
---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
insert into test_vals (k, v) select 'hh', library.create_household('Home', 'Member A')::text;

reset role;
-- 1 no copies, 2 one on-shelf copy, 3 one unhauled + one on-shelf,
-- 4 only copy unhauled, 5 two copies both unhauled.
insert into library.books (id, household_id, title, authors)
select pg_temp.book(n), pg_temp.hh(), 'Invented Title ' || n, '{Invented Author}'
  from generate_series(1, 5) n;

insert into library.copies (id, book_id, origin, unhauled_at)
values (pg_temp.copy(2, 1), pg_temp.book(2), 'manual', null),
       (pg_temp.copy(3, 1), pg_temp.book(3), 'manual', now()),
       (pg_temp.copy(3, 2), pg_temp.book(3), 'manual', null),
       (pg_temp.copy(4, 1), pg_temp.book(4), 'manual', now()),
       (pg_temp.copy(5, 1), pg_temp.book(5), 'manual', now()),
       (pg_temp.copy(5, 2), pg_temp.book(5), 'manual', now());

---------------------------------------------------------------------------
-- Schema
---------------------------------------------------------------------------
select has_column('library', 'copies', 'unhauled_at', 'copies.unhauled_at exists');
select has_column('library', 'copies', 'deluxe', 'copies.deluxe exists');
select has_column('library', 'copies', 'signed', 'copies.signed exists');
select col_is_null('library', 'copies', 'unhauled_at', 'unhauled_at is nullable');
select col_not_null('library', 'copies', 'deluxe', 'deluxe is not null');
select col_not_null('library', 'copies', 'signed', 'signed is not null');
select col_default_is('library', 'copies', 'deluxe', 'false', 'deluxe defaults to false');
select col_default_is('library', 'copies', 'signed', 'false', 'signed defaults to false');
select has_function('library', 'on_shelf', array['library.books'], 'library.on_shelf(books) exists');

---------------------------------------------------------------------------
-- on_shelf, as A
---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

select is(pg_temp.shelf(1), true, 'on_shelf: a book with no copies is on the shelf');
select is(pg_temp.shelf(2), true, 'on_shelf: one on-shelf copy is on the shelf');
select is(pg_temp.shelf(3), true, 'on_shelf: one unhauled and one on-shelf copy is on the shelf');
select is(pg_temp.shelf(4), false, 'on_shelf: a book whose only copy is unhauled is off the shelf');
select is(pg_temp.shelf(5), false, 'on_shelf: a book with both copies unhauled is off the shelf');

update library.copies set unhauled_at = null where id = pg_temp.copy(5, 2);
select is(pg_temp.shelf(5), true, 'on_shelf: clearing one unhauled copy puts the book back');
update library.copies set unhauled_at = now() where id = pg_temp.copy(5, 2);

-- Attribute notation resolves through search_path; PostgREST sets the schema's.
set local search_path = library, extensions, public;
select is((select b.on_shelf from library.books b where b.id = pg_temp.book(4)), false,
          'PostgREST shape: b.on_shelf is false for the only-copy-unhauled book');
reset search_path;

---------------------------------------------------------------------------
-- Defaults on the existing insert path
---------------------------------------------------------------------------
reset role;
insert into library.copies (id, book_id, owner_user_id, edition_note, libib_id, origin)
values (pg_temp.copy(1, 1), pg_temp.book(1), null, null, null, 'libib');
select is((select c.unhauled_at is null and c.deluxe = false and c.signed = false
             from library.copies c where c.id = pg_temp.copy(1, 1)),
          true, 'a copy inserted with the importer column list takes the defaults');
delete from library.copies where id = pg_temp.copy(1, 1);

---------------------------------------------------------------------------
-- RLS
---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

with u as (update library.copies set unhauled_at = now() where id = pg_temp.copy(2, 1) returning 1)
select is((select count(*) from u), 1::bigint, 'A: updating unhauled_at on an H copy changes 1 row');
with u as (update library.copies set deluxe = true where id = pg_temp.copy(2, 1) returning 1)
select is((select count(*) from u), 1::bigint, 'A: updating deluxe on an H copy changes 1 row');
update library.copies set unhauled_at = null, deluxe = false where id = pg_temp.copy(2, 1);

set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';

with u as (update library.copies set unhauled_at = now() where id = pg_temp.copy(2, 1) returning 1)
select is((select count(*) from u), 0::bigint, 'B: updating unhauled_at on an H copy changes 0 rows');
with u as (update library.copies set deluxe = true where id = pg_temp.copy(2, 1) returning 1)
select is((select count(*) from u), 0::bigint, 'B: updating deluxe on an H copy changes 0 rows');
select is((select count(*) from (select library.on_shelf(b) from library.books b
                                   where b.household_id = pg_temp.hh()) x),
          0::bigint, 'B: on_shelf over H books returns no rows');

reset role;
select is((select c.unhauled_at is null and c.deluxe = false
             from library.copies c where c.id = pg_temp.copy(2, 1)),
          true, 'B changed nothing on the H copy');

set local role anon;
select throws_ok($$ select library.on_shelf(b) from library.books b $$, '42501', null,
                 'anon: on_shelf is denied');

---------------------------------------------------------------------------
-- Cover batches, as A
---------------------------------------------------------------------------
reset role;
set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

select is(pg_temp.outcome(4, false), 'unhauled', 'batch: an unhauled book answers unhauled');
select is((select count(*) from library.cover_searches s where s.book_id = pg_temp.book(4)),
          0::bigint, 'batch: the unhauled book got no search row');
select is(pg_temp.outcome(4, true), 'queued', 'manual: an unhauled book is queued');
select is(pg_temp.outcome(3, false), 'queued', 'batch: one unhauled and one on-shelf copy is queued');
select is(pg_temp.outcome(1, false), 'queued', 'batch: a zero-copy book is queued');

select * from finish();
rollback;
