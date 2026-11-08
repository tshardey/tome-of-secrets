-- pgTAP: library.libib_import_rows, the libib import ledger.
-- Proves the ledger is household-scoped, has no delete path, validates its
-- values, and outlives the books and copies it describes.
begin;

create extension if not exists pgtap with schema extensions;

select plan(12);

insert into auth.users (id, email, aud, role)
values
  ('11111111-1111-1111-1111-111111111111', 'a@library.test', 'authenticated', 'authenticated'),
  ('22222222-2222-2222-2222-222222222222', 'b@library.test', 'authenticated', 'authenticated');

-- Scratch space to carry values across role switches.
create temporary table test_vals (k text primary key, v text) on commit drop;
grant all on test_vals to authenticated, anon;

---------------------------------------------------------------------------
-- User A (member) upserts ledger rows.
---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

insert into test_vals (k, v)
select 'hh', library.create_household('Home', 'Tierra')::text;

select lives_ok(
  $$ insert into library.libib_import_rows (household_id, libib_id, copies_seen)
     values ((select v::uuid from test_vals where k = 'hh'), 'lb1', 2)
     on conflict (household_id, libib_id)
     do update set copies_seen = excluded.copies_seen $$,
  'A: can upsert a ledger row in own household'
);

select lives_ok(
  $$ insert into library.libib_import_rows (household_id, libib_id, copies_seen)
     values ((select v::uuid from test_vals where k = 'hh'), 'lb1', 3)
     on conflict (household_id, libib_id)
     do update set copies_seen = excluded.copies_seen $$,
  'A: a second upsert of the same libib_id succeeds'
);

select is(
  (select count(*)::int || ':' || max(copies_seen)::int
     from library.libib_import_rows
    where household_id = (select v::uuid from test_vals where k = 'hh')
      and libib_id = 'lb1'),
  '1:3',
  'A: the upsert left one row with copies_seen = 3'
);

---------------------------------------------------------------------------
-- User B (not a member) is locked out.
---------------------------------------------------------------------------
set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';

select is_empty(
  'select * from library.libib_import_rows',
  'B (non-member): sees no ledger rows'
);

select throws_ok(
  $$ insert into library.libib_import_rows (household_id, libib_id, copies_seen)
     values ((select v::uuid from test_vals where k = 'hh'), 'lb2', 1) $$,
  '42501',
  null,
  'B (non-member): inserting into A''s ledger violates RLS'
);

do $$
declare n int;
begin
  update library.libib_import_rows set copies_seen = 9
   where libib_id = 'lb1';
  get diagnostics n = row_count;
  insert into test_vals (k, v) values ('b_update_rows', n::text);
end
$$;

select is(
  (select v from test_vals where k = 'b_update_rows'),
  '0',
  'B (non-member): updating A''s ledger row affects 0 rows'
);

---------------------------------------------------------------------------
-- B creates their own household; the key is per household.
---------------------------------------------------------------------------
insert into test_vals (k, v)
select 'bhh', library.create_household('B Home', 'B')::text;

select lives_ok(
  $$ insert into library.libib_import_rows (household_id, libib_id, copies_seen)
     values ((select v::uuid from test_vals where k = 'bhh'), 'lb1', 1) $$,
  'B: the same libib_id can be recorded in a different household'
);

---------------------------------------------------------------------------
-- A: no delete, and values are validated.
---------------------------------------------------------------------------
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

select throws_ok(
  $$ delete from library.libib_import_rows $$,
  '42501',
  null,
  'A: deleting from the ledger is denied'
);

select throws_ok(
  $$ insert into library.libib_import_rows (household_id, libib_id, copies_seen)
     values ((select v::uuid from test_vals where k = 'hh'), 'lb3', 0) $$,
  '23514',
  null,
  'A: copies_seen = 0 violates the check constraint'
);

select throws_ok(
  $$ insert into library.libib_import_rows (household_id, libib_id, copies_seen)
     values ((select v::uuid from test_vals where k = 'hh'), '', 1) $$,
  '23514',
  null,
  'A: an empty libib_id violates the check constraint'
);

---------------------------------------------------------------------------
-- The ledger outlives the book and copy it describes.
---------------------------------------------------------------------------
insert into library.books (id, household_id, title)
values ('aaaaaaaa-0000-0000-0000-000000000001',
        (select v::uuid from test_vals where k = 'hh'), 'Ledger Book');

insert into library.copies (book_id, origin, libib_id)
values ('aaaaaaaa-0000-0000-0000-000000000001', 'libib', 'lb1');

delete from library.books where id = 'aaaaaaaa-0000-0000-0000-000000000001';

select is(
  (select count(*)::int from library.libib_import_rows
    where household_id = (select v::uuid from test_vals where k = 'hh')
      and libib_id = 'lb1'),
  1,
  'A: the ledger row survives deleting the book and its copy'
);

---------------------------------------------------------------------------
-- anon has no access.
---------------------------------------------------------------------------
reset role;
set local role anon;
set local request.jwt.claims = '{"role":"anon"}';

select throws_ok(
  'select * from library.libib_import_rows',
  '42501',
  null,
  'anon: selecting the ledger is denied'
);

reset role;

select * from finish();
rollback;
