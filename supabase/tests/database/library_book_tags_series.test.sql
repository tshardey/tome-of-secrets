-- pgTAP: shared tags (library.book_tags) and book series columns.
-- Proves the shape, member-only writes, the tag id checks, the composite
-- household foreign key, cascade on book delete, the series checks, that
-- non-members see and change nothing, and that tags can't be updated.
begin;

create extension if not exists pgtap with schema extensions;

select plan(35);

insert into auth.users (id, email, aud, role)
values
  ('11111111-1111-1111-1111-111111111111', 'a@library.test', 'authenticated', 'authenticated'),
  ('22222222-2222-2222-2222-222222222222', 'b@library.test', 'authenticated', 'authenticated');

create temporary table test_vals (k text primary key, v text) on commit drop;
grant all on test_vals to authenticated, anon;

create function pg_temp.h1() returns uuid language sql as
$$ select v::uuid from test_vals where k = 'h1' $$;
create function pg_temp.h2() returns uuid language sql as
$$ select v::uuid from test_vals where k = 'h2' $$;

-- Rows changed by a statement, run as the current role.
create function pg_temp.changed(p_sql text) returns int language plpgsql as
$$ declare n int; begin execute p_sql; get diagnostics n = row_count; return n; end $$;

---------------------------------------------------------------------------
-- Schema.
---------------------------------------------------------------------------
select has_table('library', 'book_tags', 'library.book_tags exists');
select has_column('library', 'books', 'series_name', 'books.series_name exists');
select has_column('library', 'books', 'series_volume', 'books.series_volume exists');
select col_is_pk('library', 'book_tags', array['book_id', 'tag_id'], 'book_tags: primary key is (book_id, tag_id)');
select ok(
  exists (select 1 from pg_constraint
           where conname = 'books_id_household_key' and conrelid = 'library.books'::regclass
             and contype = 'u'),
  'books: unique (id, household_id) exists'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'library.book_tags'::regclass),
  'book_tags: RLS is enabled'
);

---------------------------------------------------------------------------
-- Setup: A in H1 and H2, B in neither (B owns a household of their own).
---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';
select library.create_household('B Home', 'B');

set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
insert into test_vals (k, v) select 'h1', library.create_household('Home One', 'A')::text;
insert into test_vals (k, v) select 'h2', library.create_household('Home Two', 'A')::text;

insert into library.books (id, household_id, title) values
  ('aaaaaaaa-0000-0000-0000-000000000001', pg_temp.h1(), 'The Salt Road'),
  ('aaaaaaaa-0000-0000-0000-000000000002', pg_temp.h1(), 'Glass Orchard'),
  ('aaaaaaaa-0000-0000-0000-000000000003', pg_temp.h1(), 'Cascade Book');

---------------------------------------------------------------------------
-- Member writes.
---------------------------------------------------------------------------
select lives_ok(
  $$ insert into library.book_tags (book_id, household_id, tag_id)
     values ('aaaaaaaa-0000-0000-0000-000000000001', pg_temp.h1(), 'fantasy') $$,
  'A: inserts a tag on an H1 book'
);

select throws_ok(
  $$ insert into library.book_tags (book_id, household_id, tag_id)
     values ('aaaaaaaa-0000-0000-0000-000000000001', pg_temp.h1(), 'fantasy') $$,
  '23505', null,
  'A: the same tag twice violates the primary key'
);

select is(
  pg_temp.changed(format($$ insert into library.book_tags (book_id, household_id, tag_id)
     values ('aaaaaaaa-0000-0000-0000-000000000001', %L, 'fantasy') on conflict do nothing $$, pg_temp.h1())),
  0,
  'A: upsert on conflict do nothing changes 0 rows'
);

select is(
  pg_temp.changed($$ delete from library.book_tags
      where book_id = 'aaaaaaaa-0000-0000-0000-000000000001' and tag_id = 'fantasy' $$),
  1,
  'A: deletes the tag (1 row)'
);

---------------------------------------------------------------------------
-- Checks.
---------------------------------------------------------------------------
select throws_ok(
  format($$ insert into library.book_tags (book_id, household_id, tag_id)
            values ('aaaaaaaa-0000-0000-0000-000000000001', %L, %L) $$, pg_temp.h1(), t.id),
  '23514', null,
  t.label
)
from (values
  ('Fantasy', 'A: an uppercase tag id violates the format check'),
  ('', 'A: an empty tag id violates the format check'),
  ('-x', 'A: a leading hyphen violates the format check'),
  ('a--b', 'A: a double hyphen violates the format check'),
  (repeat('a', 41), 'A: a 41-character tag id violates the check'),
  ('audio', 'A: audio violates book_tags_not_type_derived')
) as t(id, label);

select throws_ok(
  $$ insert into library.book_tags (book_id, household_id, tag_id)
     values ('aaaaaaaa-0000-0000-0000-000000000001', pg_temp.h2(), 'cozy') $$,
  '23503', null,
  'A: an H1 book with household_id H2 violates the composite foreign key'
);

---------------------------------------------------------------------------
-- Cascade.
---------------------------------------------------------------------------
insert into library.book_tags (book_id, household_id, tag_id)
values ('aaaaaaaa-0000-0000-0000-000000000003', pg_temp.h1(), 'cozy');
delete from library.books where id = 'aaaaaaaa-0000-0000-0000-000000000003';

select is(
  (select count(*)::int from library.book_tags
    where book_id = 'aaaaaaaa-0000-0000-0000-000000000003'),
  0,
  'A: deleting the book deletes its tags'
);

---------------------------------------------------------------------------
-- Series.
---------------------------------------------------------------------------
select throws_ok(
  $$ update library.books set series_name = ' Saga' where id = 'aaaaaaaa-0000-0000-0000-000000000001' $$,
  '23514', null, 'A: a series name with a leading space violates the check'
);
select throws_ok(
  $$ update library.books set series_name = '' where id = 'aaaaaaaa-0000-0000-0000-000000000001' $$,
  '23514', null, 'A: an empty series name violates the check'
);
select throws_ok(
  $$ update library.books set series_name = repeat('x', 201) where id = 'aaaaaaaa-0000-0000-0000-000000000001' $$,
  '23514', null, 'A: a 201-character series name violates the check'
);
select throws_ok(
  $$ update library.books set series_volume = -1 where id = 'aaaaaaaa-0000-0000-0000-000000000001' $$,
  '23514', null, 'A: a volume of -1 violates the check'
);
select throws_ok(
  $$ update library.books set series_volume = 10000 where id = 'aaaaaaaa-0000-0000-0000-000000000001' $$,
  '22003', null, 'A: a volume of 10000 is rejected (numeric(6,2) overflows before the check)'
);

select lives_ok(
  $$ update library.books set series_name = repeat('x', 200) where id = 'aaaaaaaa-0000-0000-0000-000000000001' $$,
  'A: a 200-character series name is accepted'
);
select lives_ok(
  $$ update library.books set series_volume = 0 where id = 'aaaaaaaa-0000-0000-0000-000000000001' $$,
  'A: volume 0 is accepted'
);
select lives_ok(
  $$ update library.books set series_volume = 9999.99 where id = 'aaaaaaaa-0000-0000-0000-000000000001' $$,
  'A: volume 9999.99 is accepted'
);

update library.books set series_name = 'First', series_volume = 2.5
 where id = 'aaaaaaaa-0000-0000-0000-000000000001';

select is(
  (select series_volume::text from library.books where id = 'aaaaaaaa-0000-0000-0000-000000000001'),
  '2.50',
  'A: volume 2.5 is stored as 2.50'
);

select is(
  pg_temp.changed($$ update library.books set series_name = 'Second'
      where id = 'aaaaaaaa-0000-0000-0000-000000000001' and series_name is null $$),
  0,
  'A: the fill update on an already named book changes 0 rows'
);

select is(
  (select series_name from library.books where id = 'aaaaaaaa-0000-0000-0000-000000000001'),
  'First',
  'A: the series name stays First'
);

-- A tag for the non-member checks.
insert into library.book_tags (book_id, household_id, tag_id)
values ('aaaaaaaa-0000-0000-0000-000000000002', pg_temp.h1(), 'cozy');

---------------------------------------------------------------------------
-- No update grant.
---------------------------------------------------------------------------
select throws_ok(
  $$ update library.book_tags set tag_id = 'cozy' where book_id = 'aaaaaaaa-0000-0000-0000-000000000002' $$,
  '42501', null,
  'A: updating a tag is denied (no update grant)'
);

---------------------------------------------------------------------------
-- Non-members (B).
---------------------------------------------------------------------------
set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';

select is_empty(
  $$ select * from library.book_tags $$,
  'B (non-member): sees none of A''s tags'
);

select throws_ok(
  $$ insert into library.book_tags (book_id, household_id, tag_id)
     values ('aaaaaaaa-0000-0000-0000-000000000002', pg_temp.h1(), 'mystery') $$,
  '42501', null,
  'B (non-member): inserting a tag on A''s book is denied'
);

select is(
  pg_temp.changed($$ delete from library.book_tags $$),
  0,
  'B (non-member): deleting A''s tag changes 0 rows'
);

select is(
  pg_temp.changed($$ update library.books set series_name = 'Hacked'
      where id = 'aaaaaaaa-0000-0000-0000-000000000002' $$),
  0,
  'B (non-member): the series update on A''s book changes 0 rows'
);

set local role anon;
select throws_ok(
  $$ select * from library.book_tags $$,
  '42501', null,
  'anon: select on book_tags is denied'
);

select * from finish();
rollback;
