-- pgTAP: library schema RLS and household RPCs.
-- Every ToS player can sign in, so these tests prove that household data is
-- visible only to members and that anon has no access at all.
begin;

create extension if not exists pgtap with schema extensions;

select plan(20);

-- Fixed test users (inserted as the superuser running the test).
insert into auth.users (id, email, aud, role)
values
  ('11111111-1111-1111-1111-111111111111', 'a@library.test', 'authenticated', 'authenticated'),
  ('22222222-2222-2222-2222-222222222222', 'b@library.test', 'authenticated', 'authenticated');

-- Scratch space to carry values across role switches.
create temporary table test_vals (k text primary key, v text) on commit drop;
grant all on test_vals to authenticated, anon;

---------------------------------------------------------------------------
-- User A creates a household, a book and a copy.
---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

insert into test_vals (k, v)
select 'hh', library.create_household('Home', 'Tierra')::text;

select isnt(
  (select v from test_vals where k = 'hh'),
  null,
  'A: create_household returns a uuid'
);

select is(
  (select count(*)::int from library.household_members
    where household_id = (select v::uuid from test_vals where k = 'hh')
      and user_id = '11111111-1111-1111-1111-111111111111'),
  1,
  'A: creator appears in household_members'
);

select lives_ok(
  $$ insert into library.books (id, household_id, title, authors)
     values ('aaaaaaaa-0000-0000-0000-000000000001',
             (select v::uuid from test_vals where k = 'hh'),
             'Original Title', array['Some Author']) $$,
  'A: can insert a book in own household'
);

select lives_ok(
  $$ insert into library.copies (id, book_id, origin)
     values ('cccccccc-0000-0000-0000-000000000001',
             'aaaaaaaa-0000-0000-0000-000000000001', 'manual') $$,
  'A: can insert a copy of own book'
);

-- Capture the invite code as the superuser (B cannot read it yet).
reset role;
insert into test_vals (k, v)
select 'code', invite_code from library.households
 where id = (select v::uuid from test_vals where k = 'hh');

---------------------------------------------------------------------------
-- User B (not a member) is locked out.
---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';

select is_empty(
  'select * from library.books',
  'B (non-member): sees no books'
);

select is_empty(
  'select * from library.households',
  'B (non-member): sees no households'
);

select throws_ok(
  $$ insert into library.books (household_id, title)
     values ((select v::uuid from test_vals where k = 'hh'), 'Intruder') $$,
  '42501',
  null,
  'B (non-member): inserting a book into A''s household violates RLS'
);

do $$
declare n int;
begin
  update library.books set title = 'Hacked'
   where id = 'aaaaaaaa-0000-0000-0000-000000000001';
  get diagnostics n = row_count;
  insert into test_vals (k, v) values ('b_update_rows', n::text);
end
$$;

select is(
  (select v from test_vals where k = 'b_update_rows'),
  '0',
  'B (non-member): updating A''s book affects 0 rows'
);

select throws_ok(
  $$ insert into library.household_members (household_id, user_id, display_name)
     values ((select v::uuid from test_vals where k = 'hh'),
             '22222222-2222-2222-2222-222222222222', 'Sneaky') $$,
  '42501',
  null,
  'B: cannot insert into household_members directly'
);

select throws_ok(
  $$ select library.join_household('nope', 'B') $$,
  'invalid_invite_code',
  'B: join_household with a bad code raises invalid_invite_code'
);

---------------------------------------------------------------------------
-- B creates their own household and book (used for cross-household moves).
---------------------------------------------------------------------------
insert into test_vals (k, v)
select 'bhh', library.create_household('B Home', 'B')::text;

insert into library.books (id, household_id, title)
values ('bbbbbbbb-0000-0000-0000-000000000001',
        (select v::uuid from test_vals where k = 'bhh'), 'B Book');

select throws_ok(
  $$ insert into library.copies (book_id, origin)
     values ('aaaaaaaa-0000-0000-0000-000000000001', 'manual') $$,
  '42501',
  null,
  'B (non-member): inserting a copy of A''s book violates RLS'
);

---------------------------------------------------------------------------
-- B joins with A's invite code.
---------------------------------------------------------------------------
select lives_ok(
  $$ select library.join_household((select v from test_vals where k = 'code'), 'Partner') $$,
  'B: join_household with A''s invite code succeeds'
);

select is(
  (select count(*)::int from library.books
    where household_id = (select v::uuid from test_vals where k = 'hh')),
  1,
  'B (member): now sees 1 book in A''s household'
);

select is(
  (select count(*)::int from library.copies
    where book_id = 'aaaaaaaa-0000-0000-0000-000000000001'),
  1,
  'B (member): now sees 1 copy of A''s book'
);

select lives_ok(
  $$ select library.join_household((select v from test_vals where k = 'code'), 'Partner') $$,
  'B: joining again with the same code does not error'
);

select is(
  (select count(*)::int from library.household_members
    where user_id = '22222222-2222-2222-2222-222222222222'
      and household_id = (select v::uuid from test_vals where k = 'hh')),
  1,
  'B: still exactly one membership row in A''s household after re-joining'
);

---------------------------------------------------------------------------
-- A (member of Home only) cannot move rows into B's household.
---------------------------------------------------------------------------
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

select throws_ok(
  $$ update library.books
        set household_id = (select v::uuid from test_vals where k = 'bhh')
      where id = 'aaaaaaaa-0000-0000-0000-000000000001' $$,
  '42501',
  null,
  'A: moving a book into a household A is not in violates RLS'
);

select throws_ok(
  $$ update library.copies
        set book_id = 'bbbbbbbb-0000-0000-0000-000000000001'
      where id = 'cccccccc-0000-0000-0000-000000000001' $$,
  '42501',
  null,
  'A: re-parenting a copy onto another household''s book violates RLS'
);

---------------------------------------------------------------------------
-- anon has no access.
---------------------------------------------------------------------------
reset role;
set local role anon;
set local request.jwt.claims = '{"role":"anon"}';

select throws_ok(
  'select * from library.books',
  '42501',
  null,
  'anon: selecting library.books is denied'
);

select throws_ok(
  $$ select library.create_household('Anon Home', 'Anon') $$,
  '42501',
  null,
  'anon: cannot execute create_household'
);

reset role;

select * from finish();
rollback;
