-- pgTAP: library read status per household member (Plan 8, D2-D3). Proves
-- that the app writes only for the caller, that Unread is stored as
-- 'cleared', that a ToS completion and a StoryGraph row each follow their own
-- who-wins rule (a StoryGraph row never touches an app, ToS or cleared row; a
-- ToS completion replaces cleared or dnf only when it is newer), that the
-- rules hold for malformed input, that members see each other's statuses and
-- outsiders see none, and that statuses go with their book or member.
begin;

create extension if not exists pgtap with schema extensions;

select plan(70);

insert into auth.users (id, email, aud, role)
values
  ('11111111-1111-1111-1111-111111111111', 'a@library.test', 'authenticated', 'authenticated'),
  ('22222222-2222-2222-2222-222222222222', 'b@library.test', 'authenticated', 'authenticated'),
  ('33333333-3333-3333-3333-333333333333', 'c@library.test', 'authenticated', 'authenticated');

create temporary table test_vals (k text primary key, v text) on commit drop;
grant all on test_vals to authenticated, anon;

---------------------------------------------------------------------------
-- Helpers (definer ones read and write whatever the current role can see).
---------------------------------------------------------------------------
create function pg_temp.val(p text) returns text language sql as
$$ select v from test_vals where k = p $$;

create function pg_temp.hh() returns uuid language sql as $$ select pg_temp.val('hh')::uuid $$;
create function pg_temp.hh2() returns uuid language sql as $$ select pg_temp.val('hh2')::uuid $$;

create function pg_temp.book(n int) returns uuid language sql as
$$ select ('dddddddd-0000-0000-0000-' || lpad(n::text, 12, '0'))::uuid $$;

create function pg_temp.ua() returns uuid language sql as $$ select '11111111-1111-1111-1111-111111111111'::uuid $$;
create function pg_temp.ub() returns uuid language sql as $$ select '22222222-2222-2222-2222-222222222222'::uuid $$;

-- status/source/date/set_by-is-user for book n and user u.
create function pg_temp.st(n int, u uuid) returns text language sql security definer as
$$ select coalesce((select s.status || '/' || s.source || '/' || coalesce(s.finished_on::text, '') || '/'
                           || coalesce((s.set_by = u)::text, 'null')
                      from library.read_statuses s where s.book_id = pg_temp.book(n) and s.user_id = u), 'none') $$;

create function pg_temp.marked(n int, u uuid) returns timestamptz language sql security definer as
$$ select s.marked_at from library.read_statuses s where s.book_id = pg_temp.book(n) and s.user_id = u $$;

create function pg_temp.cnt(u uuid) returns int language sql security definer as
$$ select count(*)::int from library.read_statuses s where s.user_id = u $$;

-- Replaces the row for (book n, user u) outright.
create function pg_temp.put(n int, u uuid, p_status text, p_date date, p_source text, p_marked timestamptz)
returns void language sql security definer as
$$ insert into library.read_statuses (book_id, household_id, user_id, status, finished_on, source, marked_at)
   values (pg_temp.book(n), pg_temp.hh(), u, p_status, p_date, p_source, p_marked)
   on conflict (book_id, user_id) do update
     set status = excluded.status, finished_on = excluded.finished_on,
         source = excluded.source, marked_at = excluded.marked_at, set_by = null $$;

-- Outcomes of set_read_status, in book order, comma separated.
create function pg_temp.setr(p_hh uuid, ids int[], p_status text, p_date date, p_keep boolean) returns text
language sql as
$$ select string_agg(r.outcome, ',' order by r.book_id)
     from library.set_read_status(p_hh, array(select pg_temp.book(x) from unnest(ids) x), p_status, p_date, p_keep) r $$;

create function pg_temp.tos(p_hh uuid, p_items jsonb) returns text language sql as
$$ select string_agg(r.outcome, ',')
     from library.record_tos_reads(p_hh, p_items) r $$;

create function pg_temp.item(n int, p_completed text, p_finished text) returns jsonb language sql as
$$ select jsonb_build_object('bookId', pg_temp.book(n), 'completedAt', p_completed, 'finishedOn', p_finished) $$;

-- The StoryGraph rule, called as the table owner.
create function pg_temp.hist(n int, u uuid, p_status text, p_last date) returns text language sql security definer as
$$ select library._apply_history(pg_temp.hh(), u, pg_temp.book(n), p_status, p_last)::text $$;

---------------------------------------------------------------------------
-- Households: A and B in H, C alone in H2. Books 1-13 in H, 41 in H2.
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
set local request.jwt.claims = '{}';
insert into library.books (id, household_id, title, authors)
select pg_temp.book(n), case when n >= 40 then pg_temp.hh2() else pg_temp.hh() end,
       'Invented Title ' || n, '{Invented Author}'
  from (select generate_series(1, 13) union all select 41) g(n);

---------------------------------------------------------------------------
-- Schema and grants (as postgres).
---------------------------------------------------------------------------
select has_table('library', 'read_statuses', 'read_statuses exists');
select ok((select relrowsecurity from pg_class where oid = 'library.read_statuses'::regclass),
          'RLS is enabled on read_statuses');
select ok(has_table_privilege('authenticated', 'library.read_statuses', 'select')
          and not has_table_privilege('authenticated', 'library.read_statuses', 'insert')
          and not has_table_privilege('authenticated', 'library.read_statuses', 'update')
          and not has_table_privilege('authenticated', 'library.read_statuses', 'delete'),
          'authenticated may only select read_statuses');
select ok(not has_table_privilege('anon', 'library.read_statuses', 'select'), 'anon has no access to read_statuses');
select ok(has_function_privilege('authenticated', 'library.set_read_status(uuid, uuid[], text, date, boolean)', 'execute')
          and has_function_privilege('authenticated', 'library.record_tos_reads(uuid, jsonb)', 'execute'),
          'authenticated can execute the two write RPCs');
select ok(not has_function_privilege('anon', 'library.set_read_status(uuid, uuid[], text, date, boolean)', 'execute')
          and not has_function_privilege('anon', 'library.record_tos_reads(uuid, jsonb)', 'execute'),
          'anon cannot execute the write RPCs');
select ok(not has_function_privilege('authenticated', 'library._apply_history(uuid, uuid, uuid, text, date)', 'execute')
          and not has_function_privilege('anon', 'library._apply_history(uuid, uuid, uuid, text, date)', 'execute'),
          'nobody but the owner can execute _apply_history');

---------------------------------------------------------------------------
-- App: set_read_status, as A.
---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

select is(pg_temp.setr(pg_temp.hh(), '{1}', 'read', '2026-03-02', false), 'changed',
          'A marks book 1 read: changed');
select is(pg_temp.st(1, pg_temp.ua()), 'read/app/2026-03-02/true', 'the row is read, app, dated, set_by A');
select is(pg_temp.setr(pg_temp.hh(), '{1}', 'read', '2026-03-02', false), 'unchanged',
          'the same values again: unchanged');

select is(pg_temp.setr(pg_temp.hh(), '{1}', 'unread', null, false), 'changed', 'Unread on a read book: changed');
select is(pg_temp.st(1, pg_temp.ua()), 'cleared/app//true', 'Unread stores cleared with a null date');
select is(pg_temp.setr(pg_temp.hh(), '{1}', 'unread', '2026-05-05', false), 'unchanged',
          'Unread again: unchanged, and a date is ignored');

select is(pg_temp.setr(pg_temp.hh(), '{2}', 'dnf', null, false), 'changed', 'DNF on book 2: changed');
select is(pg_temp.st(2, pg_temp.ua()), 'dnf/app//true', 'DNF with no date: dnf, date null');

-- Keep mode: book 1 dated and read, book 3 with no row.
select pg_temp.setr(pg_temp.hh(), '{1}', 'read', '2026-03-02', false);
select is(pg_temp.setr(pg_temp.hh(), '{1,3}', 'read', '2026-06-06', true), 'unchanged,changed',
          'keep mode: the dated book is unchanged, the other changes');
select is(pg_temp.st(1, pg_temp.ua()), 'read/app/2026-03-02/true', 'keep mode: book 1 keeps its date');
select is(pg_temp.st(3, pg_temp.ua()), 'read/app/2026-06-06/true', 'keep mode: book 3 gets the given date');

select is(pg_temp.setr(pg_temp.hh(), '{4,4}', 'read', null, false), 'changed', 'duplicate ids are answered once');
select is(pg_temp.setr(pg_temp.hh(), '{41}', 'read', null, false), 'not_found', 'a book of another household is not_found');
select is(pg_temp.st(41, pg_temp.ua()), 'none', 'nothing is written for that book');
select is(pg_temp.setr(pg_temp.hh(), '{1,41}', 'dnf', null, true), 'changed,not_found',
          'a mix of found and not_found lands the found');

select throws_ok(
  $$ select * from library.set_read_status(pg_temp.hh(), array(select gen_random_uuid() from generate_series(1, 1001)), 'read', null, false) $$,
  '22023', null, '1,001 ids is 22023');
select throws_ok(
  $$ select * from library.set_read_status(pg_temp.hh(), array[pg_temp.book(1)], 'cleared', null, false) $$,
  '22023', null, 'status cleared is 22023');
select throws_ok(
  $$ select * from library.set_read_status(pg_temp.hh(), null, 'read', null, false) $$,
  '22023', null, 'null ids is 22023');

-- No marking for another member.
select is(pg_temp.cnt(pg_temp.ub()), 0, 'A''s calls never wrote a row for B');
select throws_ok($$ insert into library.read_statuses (book_id, household_id, user_id, status, source)
                    values (pg_temp.book(5), pg_temp.hh(), pg_temp.ua(), 'read', 'app') $$,
                 '42501', null, 'a direct insert fails');
select throws_ok($$ update library.read_statuses set status = 'dnf' $$, '42501', null, 'a direct update fails');
select throws_ok($$ delete from library.read_statuses $$, '42501', null, 'a direct delete fails');

-- Outsiders and non-members.
set local request.jwt.claims = '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}';
select throws_ok(
  $$ select * from library.set_read_status(pg_temp.hh(), array[pg_temp.book(1)], 'read', null, false) $$,
  '42501', null, 'C on H: set_read_status is 42501');
select throws_ok(
  $$ select * from library.record_tos_reads(pg_temp.hh(), '[]'::jsonb) $$,
  '42501', null, 'C on H: record_tos_reads is 42501');
select is(pg_temp.cnt(pg_temp.ua()), 4, 'C touched nothing (A still has 4 rows)');

---------------------------------------------------------------------------
-- ToS: record_tos_reads, as A. Rows are staged as postgres with put().
---------------------------------------------------------------------------
reset role;
set local request.jwt.claims = '{}';
delete from library.read_statuses;
select pg_temp.put(5, pg_temp.ua(), 'read', null, 'app', now() - interval '10 days');
select pg_temp.put(6, pg_temp.ua(), 'read', '2026-01-01', 'storygraph', now() - interval '10 days');
select pg_temp.put(7, pg_temp.ua(), 'cleared', null, 'app', now() - interval '3 days');
select pg_temp.put(8, pg_temp.ua(), 'cleared', null, 'app', now() - interval '3 days');
select pg_temp.put(9, pg_temp.ua(), 'dnf', null, 'app', now() - interval '3 days');
select pg_temp.put(10, pg_temp.ua(), 'dnf', null, 'storygraph', now() - interval '3 days');
select pg_temp.put(11, pg_temp.ua(), 'cleared', null, 'app', now());
select pg_temp.put(12, pg_temp.ua(), 'cleared', null, 'app', now() - interval '3 days');

set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

select is(pg_temp.tos(pg_temp.hh(), jsonb_build_array(pg_temp.item(4, '2026-02-03T10:00:00Z', '2026-02-03'))),
          'added', 'no row: added');
select is(pg_temp.st(4, pg_temp.ua()), 'read/tos/2026-02-03/null', 'added as read, tos, with no set_by');
select is(pg_temp.marked(4, pg_temp.ua()), '2026-02-03T10:00:00Z'::timestamptz, 'marked_at is completedAt');

select is(pg_temp.tos(pg_temp.hh(), jsonb_build_array(pg_temp.item(5, '2026-02-04T10:00:00Z', '2026-02-04'))),
          'dated', 'a read row with no date: dated');
select is(pg_temp.st(5, pg_temp.ua()), 'read/app/2026-02-04/null', 'the date is filled and the source stays app');
select is(pg_temp.tos(pg_temp.hh(), jsonb_build_array(pg_temp.item(6, '2026-02-05T10:00:00Z', '2026-02-05'))),
          'unchanged', 'a read row with a date: unchanged');
select is(pg_temp.st(6, pg_temp.ua()), 'read/storygraph/2026-01-01/null', 'and the date is kept');

-- cleared marked 3 days ago: a completion a day before it does nothing; one an hour after replaces it.
select is(pg_temp.tos(pg_temp.hh(), jsonb_build_array(pg_temp.item(7, to_char((now() - interval '4 days') at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'), null))),
          'unchanged', 'cleared at T, completion at T minus a day: unchanged');
select is(pg_temp.st(7, pg_temp.ua()), 'cleared/app//null', 'and it stays cleared');
select is(pg_temp.tos(pg_temp.hh(), jsonb_build_array(pg_temp.item(8, to_char((now() - interval '3 days' + interval '1 hour') at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'), '2026-11-12'))),
          'replaced', 'cleared at T, completion at T plus an hour: replaced');
select is(pg_temp.st(8, pg_temp.ua()), 'read/tos/2026-11-12/null', 'it becomes read, tos');

-- dnf: newest wins.
select is(pg_temp.tos(pg_temp.hh(), jsonb_build_array(pg_temp.item(9, to_char((now() - interval '4 days') at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'), null))),
          'unchanged', 'a dnf newer than the completion: unchanged');
select is(pg_temp.tos(pg_temp.hh(), jsonb_build_array(pg_temp.item(10, to_char((now() - interval '2 days') at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'), null))),
          'replaced', 'a dnf older than the completion: replaced');

-- A future completedAt is clamped to now, so it replaces nothing marked now.
select is(pg_temp.tos(pg_temp.hh(), jsonb_build_array(pg_temp.item(11, to_char((now() + interval '1 day') at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'), null))),
          'unchanged', 'a future completedAt is clamped and replaces nothing marked now');

-- A null completedAt never replaces cleared.
select is(pg_temp.tos(pg_temp.hh(), jsonb_build_array(pg_temp.item(12, null, '2026-11-01'))),
          'unchanged', 'a null completedAt never replaces cleared');
select is(pg_temp.st(12, pg_temp.ua()), 'cleared/app//null', 'and it stays cleared');

-- Malformed and foreign items: not_found, the rest land.
select is(pg_temp.tos(pg_temp.hh(), jsonb_build_array(
            pg_temp.item(41, '2026-02-03T10:00:00Z', '2026-02-03'),
            jsonb_build_object('bookId', 'not-a-uuid', 'completedAt', '2026-02-03T10:00:00Z'),
            pg_temp.item(13, '2026-02-03T10:00:00Z', 'not-a-date'),
            pg_temp.item(13, '2026-02-03T10:00:00Z', '2026-02-03'))),
          'not_found,not_found,not_found,added',
          'book 41, a non-uuid id and an unparsable date are not_found; the valid item lands');
select is(pg_temp.st(13, pg_temp.ua()), 'read/tos/2026-02-03/null', 'the valid item landed');

select throws_ok(
  $$ select * from library.record_tos_reads(pg_temp.hh(),
       (select jsonb_agg(pg_temp.item(1, null, null)) from generate_series(1, 501))) $$,
  '22023', null, '501 items is 22023');
select throws_ok($$ select * from library.record_tos_reads(pg_temp.hh(), '{"a":1}'::jsonb) $$,
                 '22023', null, 'a non-array payload is 22023');

---------------------------------------------------------------------------
-- StoryGraph: _apply_history, as postgres.
---------------------------------------------------------------------------
reset role;
set local request.jwt.claims = '{}';
delete from library.read_statuses;
select pg_temp.put(2, pg_temp.ua(), 'dnf', null, 'storygraph', now() - interval '1 day');
select pg_temp.put(3, pg_temp.ua(), 'read', '2026-04-01', 'storygraph', now() - interval '1 day');
select pg_temp.put(4, pg_temp.ua(), 'cleared', null, 'app', now() - interval '1 day');
select pg_temp.put(5, pg_temp.ua(), 'dnf', null, 'tos', now() - interval '1 day');
select pg_temp.put(6, pg_temp.ua(), 'read', null, 'app', now() - interval '1 day');

select is(pg_temp.hist(1, pg_temp.ua(), 'read', '2026-07-07'), 'true', 'no row: written');
select is(pg_temp.st(1, pg_temp.ua()), 'read/storygraph/2026-07-07/null', 'inserted as storygraph with its date');
select is(pg_temp.hist(2, pg_temp.ua(), 'read', '2026-08-08'), 'true', 'a storygraph dnf and read: upgraded');
select is(pg_temp.st(2, pg_temp.ua()), 'read/storygraph/2026-08-08/null', 'now read with the date');
select is(pg_temp.hist(3, pg_temp.ua(), 'dnf', '2026-09-09'), 'true', 'a storygraph read and dnf: the date still follows');
select is(pg_temp.st(3, pg_temp.ua()), 'read/storygraph/2026-09-09/null', 'but it stays read');
select is(pg_temp.hist(3, pg_temp.ua(), 'dnf', null), 'false', 'a storygraph read and dnf with no date: unchanged');
select is(pg_temp.hist(4, pg_temp.ua(), 'read', '2026-07-07'), 'false', 'an app cleared row and read: unchanged');
select is(pg_temp.st(4, pg_temp.ua()), 'cleared/app//null', 'and it stays cleared');
select is(pg_temp.hist(5, pg_temp.ua(), 'read', '2026-07-07'), 'false', 'a tos row: unchanged');
select is(pg_temp.hist(6, pg_temp.ua(), 'read', '2026-07-07'), 'false', 'an app row: unchanged');
select is(pg_temp.st(5, pg_temp.ua()) || pg_temp.st(6, pg_temp.ua()), 'dnf/tos//nullread/app//null',
          'and neither row changed');

---------------------------------------------------------------------------
-- Visibility and cascades.
---------------------------------------------------------------------------
select pg_temp.put(9, pg_temp.ub(), 'read', '2026-02-02', 'app', now());
select pg_temp.put(2, pg_temp.ub(), 'dnf', null, 'app', now());

set local role authenticated;
set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';
select is((select count(*)::int from library.read_statuses where user_id = pg_temp.ua()), 6,
          'B sees A''s rows');

set local request.jwt.claims = '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}';
select is((select count(*)::int from library.read_statuses), 0, 'C sees none');

set local role anon;
set local request.jwt.claims = '{"role":"anon"}';
select throws_ok($$ select * from library.read_statuses $$, '42501', null, 'anon cannot select');

reset role;
set local request.jwt.claims = '{}';
delete from library.books where id = pg_temp.book(2);
select is((select count(*)::int from library.read_statuses where book_id = pg_temp.book(2)), 0,
          'deleting a book removes its statuses');
delete from library.household_members where household_id = pg_temp.hh() and user_id = pg_temp.ub();
select is(pg_temp.cnt(pg_temp.ub()), 0, 'removing B from the household removes B''s rows');
select is(pg_temp.cnt(pg_temp.ua()) > 0, true, 'and A keeps theirs');

select * from finish();
rollback;
