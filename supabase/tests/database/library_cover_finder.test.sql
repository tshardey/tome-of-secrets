-- pgTAP: library cover finder (marks, the search queue, the monthly budget).
-- Proves that every write goes through a membership-checked RPC, that
-- claim_token never reaches a client, that a search is billed only through a
-- reservation taken before the call and refunded to the month it was taken
-- from, that the household and the project-wide ceilings both hold, that a
-- result can only be one of the search's candidates, that apply never writes
-- over a changed cover, and that non-members and anon see and change nothing.
begin;

create extension if not exists pgtap with schema extensions;

select plan(168);

insert into auth.users (id, email, aud, role)
values
  ('11111111-1111-1111-1111-111111111111', 'a@library.test', 'authenticated', 'authenticated'),
  ('22222222-2222-2222-2222-222222222222', 'b@library.test', 'authenticated', 'authenticated'),
  ('33333333-3333-3333-3333-333333333333', 'c@library.test', 'authenticated', 'authenticated');

-- Scratch space to carry values across role switches.
create temporary table test_vals (k text primary key, v text) on commit drop;
grant all on test_vals to authenticated, anon;

---------------------------------------------------------------------------
-- Helpers. Invoker helpers run as whichever role is current; the definer
-- ones read rows (usage, status) whatever the current role can see.
---------------------------------------------------------------------------

create function pg_temp.val(p text) returns text language sql as
$$ select v from test_vals where k = p $$;

create function pg_temp.hh() returns uuid language sql as
$$ select pg_temp.val('hh')::uuid $$;

create function pg_temp.hh2() returns uuid language sql as
$$ select pg_temp.val('hh2')::uuid $$;

create function pg_temp.batch() returns uuid language sql as
$$ select 'bbbbbbbb-0000-0000-0000-000000000005'::uuid $$;

-- Book n; book 19 is in C's household H2, every other one in H.
create function pg_temp.book(n int) returns uuid language sql as
$$ select ('eeeeeeee-0000-0000-0000-' || lpad(n::text, 12, '0'))::uuid $$;

create function pg_temp.hh_of(n int) returns uuid language sql as
$$ select case when n = 19 then pg_temp.hh2() else pg_temp.hh() end $$;

-- The cover a book starts with (made-up ids).
create function pg_temp.cover(n int) returns text language sql as
$$ select 'https://covers.openlibrary.org/b/id/9' || lpad(n::text, 6, '0') || '-L.jpg' $$;

-- Candidate i of book n (made-up ids).
create function pg_temp.url(n int, i int) returns text language sql as
$$ select 'https://covers.openlibrary.org/b/id/1' || lpad(n::text, 3, '0') || lpad(i::text, 3, '0') || '-L.jpg' $$;

create function pg_temp.cand(n int, i int) returns jsonb language sql as
$$ select jsonb_build_object('url', pg_temp.url(n, i), 'source', 'openlibrary', 'width', 400,
                             'height', 600, 'language', 'eng', 'editionTitle', 'Invented Title ' || n) $$;

create function pg_temp.cands(n int, k int) returns jsonb language sql as
$$ select coalesce(jsonb_agg(pg_temp.cand(n, i) order by i), '[]'::jsonb) from generate_series(1, k) i $$;

create function pg_temp.m() returns date language sql as
$$ select date_trunc('month', now() at time zone 'utc')::date $$;

create function pg_temp.lm() returns date language sql as
$$ select (pg_temp.m() - interval '1 month')::date $$;

-- The book's active search.
create function pg_temp.search_of(n int) returns uuid language sql security definer as
$$ select s.id from library.cover_searches s
    where s.book_id = pg_temp.book(n)
      and s.status in ('queued', 'gathered', 'processing', 'ready', 'nothing_found', 'failed') $$;

create function pg_temp.st(p uuid) returns text language sql security definer as
$$ select s.status || ':' || s.attempts || ':' || coalesce(s.error_code, '')
     from library.cover_searches s where s.id = p $$;

create function pg_temp.spent(p_hh uuid, p_month date) returns bigint language sql security definer as
$$ select coalesce((select u.spent_micro from library.cover_usage u
                     where u.household_id = p_hh and u.month = p_month), 0) $$;

create function pg_temp.tspent(p_month date) returns bigint language sql security definer as
$$ select coalesce((select t.spent_micro from library.cover_usage_total t where t.month = p_month), 0) $$;

-- 'spent:screens' of a household month, 0:0 when there is no row.
create function pg_temp.usage(p_hh uuid, p_month date) returns text language sql security definer as
$$ select coalesce((select u.spent_micro || ':' || u.screens from library.cover_usage u
                     where u.household_id = p_hh and u.month = p_month), '0:0') $$;

create function pg_temp.total(p_month date) returns text language sql security definer as
$$ select coalesce((select t.spent_micro || ':' || t.screens from library.cover_usage_total t
                     where t.month = p_month), '0:0') $$;

create function pg_temp.save(p_k text, p_v text) returns void language sql as
$$ insert into test_vals (k, v) values (p_k, p_v) on conflict (k) do update set v = excluded.v $$;

-- As the current user: a manual request for book n, then k candidates.
create function pg_temp.prep(n int, k int default 2) returns uuid language plpgsql as
$$ begin
     perform library.request_cover_searches(pg_temp.hh_of(n), array[pg_temp.book(n)], pg_temp.batch(), true);
     perform library.record_cover_candidates(pg_temp.search_of(n), pg_temp.cands(n, k));
     return pg_temp.search_of(n);
   end $$;

-- As the current user: claims book n's search, keeps the token, returns outcome:attempts.
create function pg_temp.claim(n int) returns text language plpgsql as
$$ declare r record;
   begin
     select * into r from library.claim_cover_search(pg_temp.search_of(n));
     if r.claim_token is not null then
       perform pg_temp.save('tok' || n, r.claim_token::text);
     end if;
     return r.outcome || ':' || r.attempts;
   end $$;

create function pg_temp.tok(n int) returns uuid language sql as
$$ select pg_temp.val('tok' || n)::uuid $$;

create function pg_temp.finish(n int, urls text[], cost int, usage jsonb default '{}') returns text
language sql as
$$ select library.finish_cover_search(pg_temp.search_of(n), pg_temp.tok(n), urls,
                                      '{"verdicts":[]}'::jsonb, usage, cost) $$;

create function pg_temp.release(n int, err text, retry timestamptz, cost int) returns text
language sql as
$$ select library.release_cover_search(pg_temp.search_of(n), pg_temp.tok(n), err, retry, '{}'::jsonb, cost) $$;

create function pg_temp.req(n int[], manual boolean) returns text language sql as
$$ select array_agg(r.outcome order by r.book_id)::text
     from library.request_cover_searches(pg_temp.hh(),
            array(select pg_temp.book(x) from unnest(n) x), pg_temp.batch(), manual) r $$;

---------------------------------------------------------------------------
-- Households: A and B in H, C alone in H2. 24 books.
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
insert into library.books (id, household_id, title, authors, cover_url, user_edited_fields)
select pg_temp.book(n), pg_temp.hh_of(n), 'Invented Title ' || n, '{Invented Author}', pg_temp.cover(n),
       case when n = 21 then '{coverUrl,title}'::text[] else '{}'::text[] end
  from generate_series(1, 24) n;

---------------------------------------------------------------------------
-- Schema (as postgres).
---------------------------------------------------------------------------
select has_table('library', 'cover_marks', 'cover_marks exists');
select has_table('library', 'cover_searches', 'cover_searches exists');
select has_table('library', 'cover_usage', 'cover_usage exists');
select has_table('library', 'cover_usage_total', 'cover_usage_total exists');

select ok((select relrowsecurity from pg_class where oid = 'library.cover_marks'::regclass),
          'cover_marks: RLS is enabled');
select ok((select relrowsecurity from pg_class where oid = 'library.cover_searches'::regclass),
          'cover_searches: RLS is enabled');
select ok((select relrowsecurity from pg_class where oid = 'library.cover_usage'::regclass),
          'cover_usage: RLS is enabled');
select ok((select relrowsecurity from pg_class where oid = 'library.cover_usage_total'::regclass),
          'cover_usage_total: RLS is enabled');

select is(library.cover_budget_micro(), 5000000::bigint, 'cover_budget_micro is 5000000');
select is(library.cover_global_budget_micro(), 5000000::bigint, 'cover_global_budget_micro is 5000000');
select is(library.cover_reserve_micro(), 4300, 'cover_reserve_micro is 4300');

select ok(exists (select 1 from pg_indexes where schemaname = 'library' and tablename = 'cover_searches'
                     and indexname = 'cover_searches_active_uq' and indexdef ilike 'create unique index%'),
          'index cover_searches_active_uq exists and is unique');
select ok(exists (select 1 from pg_indexes where schemaname = 'library'
                     and indexname = 'cover_searches_household_status_idx'),
          'index cover_searches_household_status_idx exists');
select ok(exists (select 1 from pg_indexes where schemaname = 'library'
                     and indexname = 'cover_searches_book_household_idx'),
          'index cover_searches_book_household_idx exists');
select ok(exists (select 1 from pg_indexes where schemaname = 'library'
                     and indexname = 'cover_searches_requested_by_idx'),
          'index cover_searches_requested_by_idx exists');
select ok(exists (select 1 from pg_indexes where schemaname = 'library'
                     and indexname = 'cover_searches_applied_by_idx'),
          'index cover_searches_applied_by_idx exists');
select ok(exists (select 1 from pg_indexes where schemaname = 'library'
                     and indexname = 'cover_marks_household_id_idx'),
          'index cover_marks_household_id_idx exists');
select ok(exists (select 1 from pg_indexes where schemaname = 'library'
                     and indexname = 'cover_marks_book_household_idx'),
          'index cover_marks_book_household_idx exists');
select ok(exists (select 1 from pg_indexes where schemaname = 'library'
                     and indexname = 'cover_marks_marked_by_idx'),
          'index cover_marks_marked_by_idx exists');

---------------------------------------------------------------------------
-- Schema as A: no claim_token, no total, no direct writes.
---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

select throws_ok($$ select * from library.cover_usage_total $$, '42501', null,
                 'A: selecting cover_usage_total is denied');
select throws_ok($$ select claim_token from library.cover_searches $$, '42501', null,
                 'A: selecting claim_token is denied');
select lives_ok(
  $$ select id, household_id, book_id, requested_by, batch_id, reasons, note, cover_at_request, status,
            attempts, claimed_at, retry_at, candidates, results, screening, usage, reserved_micro,
            reserved_month, cost_micro, error_code, seen_at, applied_by, applied_url, created_at, updated_at
       from library.cover_searches $$,
  'A: every other cover_searches column is selectable');

select throws_ok($$ insert into library.cover_marks (book_id, household_id) values (pg_temp.book(1), pg_temp.hh()) $$,
                 '42501', null, 'A: direct insert into cover_marks is denied');
select throws_ok($$ update library.cover_marks set note = 'x' $$,
                 '42501', null, 'A: direct update of cover_marks is denied');
select throws_ok($$ delete from library.cover_marks $$,
                 '42501', null, 'A: direct delete from cover_marks is denied');
select throws_ok($$ insert into library.cover_searches (household_id, book_id, batch_id)
                    values (pg_temp.hh(), pg_temp.book(1), pg_temp.batch()) $$,
                 '42501', null, 'A: direct insert into cover_searches is denied');
select throws_ok($$ update library.cover_searches set status = 'ready' $$,
                 '42501', null, 'A: direct update of cover_searches is denied');
select throws_ok($$ delete from library.cover_searches $$,
                 '42501', null, 'A: direct delete from cover_searches is denied');
select throws_ok($$ insert into library.cover_usage (household_id, month) values (pg_temp.hh(), pg_temp.m()) $$,
                 '42501', null, 'A: direct insert into cover_usage is denied');
select throws_ok($$ update library.cover_usage set spent_micro = 0 $$,
                 '42501', null, 'A: direct update of cover_usage is denied');
select throws_ok($$ delete from library.cover_usage $$,
                 '42501', null, 'A: direct delete from cover_usage is denied');
select throws_ok($$ insert into library.cover_usage_total (month) values (pg_temp.m()) $$,
                 '42501', null, 'A: direct insert into cover_usage_total is denied');
select throws_ok($$ update library.cover_usage_total set spent_micro = 0 $$,
                 '42501', null, 'A: direct update of cover_usage_total is denied');
select throws_ok($$ delete from library.cover_usage_total $$,
                 '42501', null, 'A: direct delete from cover_usage_total is denied');

---------------------------------------------------------------------------
-- Marks: shared by the two members, last write wins.
---------------------------------------------------------------------------
select lives_ok($$ select library.mark_for_cover(pg_temp.book(1), '{wrong_language}', 'x') $$,
                'A: marks book 1');

set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';
select lives_ok($$ select library.mark_for_cover(pg_temp.book(1), '{placeholder}', null) $$,
                'B: marks book 1 again');

select is((select count(*)::int from library.cover_marks where book_id = pg_temp.book(1)), 1,
          'B: selects the one mark on book 1');

select is((select reasons::text || ':' || marked_by::text || ':' || coalesce(note, 'null')
             from library.cover_marks where book_id = pg_temp.book(1)),
          '{placeholder}:22222222-2222-2222-2222-222222222222:null',
          'one row: B''s reasons and note, marked_by B');

select library.mark_for_cover(pg_temp.book(1), '{placeholder,low_quality,placeholder}', '   ');
select is((select reasons::text || ':' || coalesce(note, 'null')
             from library.cover_marks where book_id = pg_temp.book(1)),
          '{low_quality,placeholder}:null',
          'B: reasons are deduplicated and a blank note becomes null');

select throws_ok($$ select library.mark_for_cover(pg_temp.book(1), '{bogus}', null) $$,
                 '23514', null, 'B: an unknown reason violates the check');
select throws_ok($$ select library.mark_for_cover(pg_temp.book(1), '{placeholder}', repeat('n', 501)) $$,
                 '23514', null, 'B: a 501-character note violates the check');

select is(library.unmark_for_cover(pg_temp.book(1)), true, 'B: unmark_for_cover returns true');
select is(library.unmark_for_cover(pg_temp.book(1)), false, 'B: unmark_for_cover again returns false');

---------------------------------------------------------------------------
-- Requests.
---------------------------------------------------------------------------
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
select library.mark_for_cover(pg_temp.book(2), '{low_quality}', 'Spine shown');

select is(pg_temp.req(array[1, 2], false), '{queued,queued}', 'A: books 1 and 2 are queued');

select is((select count(*)::int from library.cover_searches s join library.books b on b.id = s.book_id
            where s.book_id in (pg_temp.book(1), pg_temp.book(2))
              and s.cover_at_request = b.cover_url
              and s.requested_by = '11111111-1111-1111-1111-111111111111'
              and s.batch_id = pg_temp.batch()),
          2, 'A: both searches snapshot the book''s cover_url, requested_by and batch');

select is((select string_agg(s.reasons::text || ':' || coalesce(s.note, 'null'), '|' order by s.book_id)
             from library.cover_searches s where s.book_id in (pg_temp.book(1), pg_temp.book(2))),
          '{}:null|{low_quality}:Spine shown',
          'A: the searches snapshot the mark''s reasons and note, or {} and null');

set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';
select is(pg_temp.req(array[2, 3], false), '{already_open,queued}',
          'B: book 2 is already open, book 3 is queued');

set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
select throws_ok(
  $$ select * from library.request_cover_searches(pg_temp.hh(),
       array(select gen_random_uuid() from generate_series(1, 1001)), pg_temp.batch(), false) $$,
  '22023', null, 'A: 1001 ids are refused');

select is(pg_temp.req(array[19], false), '{not_found}', 'A: a book of another household is not_found');

-- Outcomes come back in id order (the lock order), deduplicated, whatever the input order.
select is((select array_agg(r.book_id::text || ':' || r.outcome)
             from library.request_cover_searches(pg_temp.hh(),
                    array[pg_temp.book(19), pg_temp.book(2), pg_temp.book(1), pg_temp.book(19)],
                    pg_temp.batch(), false) r),
          array[pg_temp.book(1)::text || ':already_open', pg_temp.book(2)::text || ':already_open',
                pg_temp.book(19)::text || ':not_found'],
          'A: requests are processed once each, in id order');

set local request.jwt.claims = '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}';
select throws_ok($$ select pg_temp.req(array[1], false) $$, '42501', null,
                 'C: requesting in H is denied');

---------------------------------------------------------------------------
-- Gather.
---------------------------------------------------------------------------
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
select is(library.record_cover_candidates(pg_temp.search_of(1), pg_temp.cands(1, 2)), 'gathered',
          'A: two valid candidates gather book 1');
select is(library.record_cover_candidates(pg_temp.search_of(1), pg_temp.cands(1, 2)), 'skipped',
          'A: a second record is skipped');

select throws_ok(
  $$ select library.record_cover_candidates(pg_temp.search_of(3),
       jsonb_build_array(pg_temp.cand(3, 1) || '{"url":"http://covers.openlibrary.org/b/id/1003001-L.jpg"}')) $$,
  '22023', null, 'A: an http:// candidate URL is refused');
select throws_ok(
  $$ select library.record_cover_candidates(pg_temp.search_of(3),
       jsonb_build_array(pg_temp.cand(3, 1) || '{"url":"https://evil.example/b/id/1003001-L.jpg"}')) $$,
  '22023', null, 'A: a candidate URL on another host is refused');
select throws_ok(
  $$ select library.record_cover_candidates(pg_temp.search_of(3), pg_temp.cands(3, 7)) $$,
  '22023', null, 'A: 7 candidates are refused');
select throws_ok(
  $$ select library.record_cover_candidates(pg_temp.search_of(3),
       jsonb_build_array(pg_temp.cand(3, 1) || jsonb_build_object('editionTitle', repeat('t', 201)))) $$,
  '22023', null, 'A: an editionTitle of 201 characters is refused');

select is(pg_temp.req(array[6], false), '{queued}', 'A: book 6 is queued');
select is(library.record_cover_candidates(pg_temp.search_of(6),
            jsonb_build_array(pg_temp.cand(6, 1) || jsonb_build_object('editionTitle', repeat('t', 200)))),
          'gathered', 'A: an editionTitle of exactly 200 characters is accepted');

select is(library.record_cover_candidates(pg_temp.search_of(3), '[]'::jsonb), 'nothing_found',
          'A: no candidates give nothing_found');
select is((select s.status || ':' || s.cost_micro from library.cover_searches s where s.id = pg_temp.search_of(3))
            || '|' || pg_temp.usage(pg_temp.hh(), pg_temp.m()) || '|' || pg_temp.total(pg_temp.m()),
          'nothing_found:0|0:0|0:0',
          'A: nothing_found costs nothing and leaves usage unchanged');

---------------------------------------------------------------------------
-- Claim and the budget.
---------------------------------------------------------------------------
select is(pg_temp.claim(1), 'claimed:1', 'A: claims book 1');
select is(pg_temp.usage(pg_temp.hh(), pg_temp.m()) || '|' || pg_temp.total(pg_temp.m()), '4300:1|4300:1',
          'A: the claim reserves 4300 and one screen on the household and the total rows');
select is((select reserved_month::text || ':' || reserved_micro from library.cover_searches
            where id = pg_temp.search_of(1)),
          pg_temp.m()::text || ':4300', 'A: the search records the reservation and this UTC month');
select is(pg_temp.claim(1), 'busy:1', 'A: a second claim is busy');
select is(pg_temp.claim(2), 'not_gathered:0', 'A: claiming a queued search is not_gathered');

---------------------------------------------------------------------------
-- Closed mid-batch, reopened by the other member.
---------------------------------------------------------------------------
select pg_temp.save('tokA1', pg_temp.tok(1)::text);

reset role;
update library.cover_searches set claimed_at = claimed_at - interval '8 minutes' where id = pg_temp.search_of(1);

set local role authenticated;
set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';
select is(pg_temp.claim(1) || '|' || pg_temp.usage(pg_temp.hh(), pg_temp.m()), 'claimed:2|8600:2',
          'B: reclaims the expired lease (attempt 2), reserving again');

set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
select is(library.finish_cover_search(pg_temp.search_of(1), pg_temp.val('tokA1')::uuid,
            array[pg_temp.url(1, 1)], '{}'::jsonb, '{}'::jsonb, 900),
          'stale', 'A: finishing with the old token is stale');
select is(pg_temp.st(pg_temp.search_of(1)) || '|' || pg_temp.usage(pg_temp.hh(), pg_temp.m()),
          'processing:2:|8600:2', 'A: the stale finish changes nothing');

---------------------------------------------------------------------------
-- Finish.
---------------------------------------------------------------------------
set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';
select is(pg_temp.finish(1, array[pg_temp.url(1, 1)], 900), 'ready', 'B: finishes book 1 as ready');
select is((select results from library.cover_searches where id = pg_temp.search_of(1)),
          jsonb_build_array(pg_temp.cand(1, 1)), 'B: results hold the chosen candidate''s object');
select is((select cost_micro from library.cover_searches where id = pg_temp.search_of(1)), 900,
          'B: cost_micro is 900');
select is(pg_temp.usage(pg_temp.hh(), pg_temp.m()) || '|' || pg_temp.total(pg_temp.m()), '5200:2|5200:2',
          'B: the unused 3400 is refunded on both rows (4300 + 900)');

set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
select is(pg_temp.claim(6), 'claimed:1', 'A: claims book 6');
select throws_ok($$ select pg_temp.finish(6, array['https://covers.openlibrary.org/b/id/1999999-L.jpg'], 0) $$,
                 '22023', null, 'A: a result URL that is not a candidate is refused');
select is(pg_temp.finish(6, '{}', 0), 'nothing_found', 'A: an empty result list is nothing_found');
select is(pg_temp.st(pg_temp.search_of(6)) || '|' || pg_temp.usage(pg_temp.hh(), pg_temp.m()),
          'nothing_found:1:|5200:3', 'A: the cost-0 finish refunds the whole reservation');

select pg_temp.prep(7);
select is(pg_temp.claim(7), 'claimed:1', 'A: claims book 7');
select is(pg_temp.finish(7, array[pg_temp.url(7, 2)], 99999, '{"computedCostMicro":99999}'), 'ready',
          'A: finishes book 7 with a cost above the reservation');
select is((select cost_micro || ':' || (usage ->> 'computedCostMicro') from library.cover_searches
            where id = pg_temp.search_of(7)),
          '4300:99999', 'A: cost is clamped to 4300; usage keeps the computed 99999');
select is(pg_temp.usage(pg_temp.hh(), pg_temp.m()), '9500:4', 'A: no refund for a clamped cost');

---------------------------------------------------------------------------
-- Refund month: refunds go to the month the reservation came from.
---------------------------------------------------------------------------
select pg_temp.prep(8);
select is(pg_temp.claim(8), 'claimed:1', 'A: claims book 8');

reset role;
update library.cover_searches
   set claimed_at = claimed_at - interval '1 month', reserved_month = pg_temp.lm()
 where id = pg_temp.search_of(8);
update library.cover_usage set spent_micro = spent_micro - 4300, screens = screens - 1
 where household_id = pg_temp.hh() and month = pg_temp.m();
update library.cover_usage_total set spent_micro = spent_micro - 4300, screens = screens - 1
 where month = pg_temp.m();
insert into library.cover_usage (household_id, month, spent_micro, screens) values (pg_temp.hh(), pg_temp.lm(), 4300, 1);
insert into library.cover_usage_total (month, spent_micro, screens) values (pg_temp.lm(), 4300, 1);

set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
select is(pg_temp.finish(8, array[pg_temp.url(8, 1)], 900), 'ready', 'A: finishes last month''s claim');
select is(pg_temp.usage(pg_temp.hh(), pg_temp.lm()) || '|' || pg_temp.total(pg_temp.lm()), '900:1|900:1',
          'A: the refund goes to last month''s household and total rows');
select is(pg_temp.usage(pg_temp.hh(), pg_temp.m()) || '|' || pg_temp.total(pg_temp.m()), '9500:4|9500:4',
          'A: this month''s rows are untouched');

select pg_temp.prep(24);
select is(pg_temp.claim(24), 'claimed:1', 'A: claims book 24');

reset role;
update library.cover_searches
   set claimed_at = claimed_at - interval '1 month', reserved_month = pg_temp.lm()
 where id = pg_temp.search_of(24);
update library.cover_usage set spent_micro = spent_micro - 4300, screens = screens - 1
 where household_id = pg_temp.hh() and month = pg_temp.m();
update library.cover_usage_total set spent_micro = spent_micro - 4300, screens = screens - 1
 where month = pg_temp.m();
update library.cover_usage set spent_micro = 1000 where household_id = pg_temp.hh() and month = pg_temp.lm();
update library.cover_usage_total set spent_micro = 1000 where month = pg_temp.lm();

set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
select is(pg_temp.finish(24, '{}', 0) || '|' || pg_temp.usage(pg_temp.hh(), pg_temp.lm())
            || '|' || pg_temp.total(pg_temp.lm()),
          'nothing_found|0:1|0:1', 'A: a refund larger than spent_micro leaves 0, not negative');

---------------------------------------------------------------------------
-- Release.
---------------------------------------------------------------------------
select pg_temp.prep(10);
select pg_temp.save('pre10', pg_temp.usage(pg_temp.hh(), pg_temp.m()) || '|' || pg_temp.total(pg_temp.m()));
select is(pg_temp.claim(10), 'claimed:1', 'A: claims book 10');
select is(pg_temp.release(10, 'billing', null, 500), 'gathered', 'A: billing releases to gathered');
select is(pg_temp.st(pg_temp.search_of(10)) || '|' || pg_temp.usage(pg_temp.hh(), pg_temp.m())
            || '|' || pg_temp.total(pg_temp.m()),
          'gathered:0:|' || pg_temp.val('pre10'),
          'A: billing gives the attempt, the screen and the whole reservation back');

select pg_temp.prep(11);
select pg_temp.save('pre11', pg_temp.usage(pg_temp.hh(), pg_temp.m()) || '|' || pg_temp.total(pg_temp.m()));
select is(pg_temp.claim(11), 'claimed:1', 'A: claims book 11');
select is(pg_temp.release(11, 'misconfigured', null, 0), 'gathered', 'A: misconfigured releases to gathered');
select is(pg_temp.st(pg_temp.search_of(11)) || '|' || pg_temp.usage(pg_temp.hh(), pg_temp.m())
            || '|' || pg_temp.total(pg_temp.m()),
          'gathered:0:|' || pg_temp.val('pre11'),
          'A: misconfigured gives the attempt, the screen and the whole reservation back');

select pg_temp.prep(12);
select is(pg_temp.claim(12), 'claimed:1', 'A: claims book 12');
select is(pg_temp.release(12, null, now() + interval '5 minutes', 0), 'gathered',
          'A: a transient error at attempt 1 releases to gathered');
select is(pg_temp.claim(12), 'retry_later:1', 'A: an immediate claim is retry_later');

select pg_temp.prep(13);
reset role;
update library.cover_searches set attempts = 2 where id = pg_temp.search_of(13);
set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
select is(pg_temp.claim(13), 'claimed:3', 'A: claims book 13 for the third time');
select is(pg_temp.release(13, null, now() + interval '5 minutes', 0) || '|' || pg_temp.st(pg_temp.search_of(13)),
          'failed|failed:3:screen_unavailable', 'A: a transient error at attempt 3 fails as screen_unavailable');

select pg_temp.prep(14);
select pg_temp.save('pre14', pg_temp.spent(pg_temp.hh(), pg_temp.m())::text);
select is(pg_temp.claim(14), 'claimed:1', 'A: claims book 14');
select is(pg_temp.release(14, 'screen_rejected', null, 0) || '|' || pg_temp.st(pg_temp.search_of(14))
            || '|' || pg_temp.spent(pg_temp.hh(), pg_temp.m()),
          'failed|failed:1:screen_rejected|' || pg_temp.val('pre14'),
          'A: screen_rejected with cost 0 fails and refunds the reservation');

select pg_temp.prep(15);
select is(pg_temp.claim(15), 'claimed:1', 'A: claims book 15');
select throws_ok($$ select pg_temp.release(15, 'nonsense', null, 0) $$, '22023', null,
                 'A: an unknown release error is refused');
select throws_ok($$ select pg_temp.release(15, null, null, 0) $$, '22023', null,
                 'A: a release with neither an error nor a retry time is refused');

---------------------------------------------------------------------------
-- The attempt limit.
---------------------------------------------------------------------------
select pg_temp.prep(16);
reset role;
update library.cover_searches set attempts = 3 where id = pg_temp.search_of(16);
set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
select pg_temp.save('pre16', pg_temp.spent(pg_temp.hh(), pg_temp.m())::text);
select is(pg_temp.claim(16) || '|' || pg_temp.st(pg_temp.search_of(16)) || '|' || pg_temp.spent(pg_temp.hh(), pg_temp.m()),
          'failed:3|failed:3:attempts_exhausted|' || pg_temp.val('pre16'),
          'A: a due search at 3 attempts fails as attempts_exhausted, without a charge');

---------------------------------------------------------------------------
-- Eligibility.
---------------------------------------------------------------------------
select pg_temp.prep(4, 0);
select is(pg_temp.st(pg_temp.search_of(4)), 'nothing_found:0:', 'A: book 4 ends nothing_found');
select is(pg_temp.req(array[4], false), '{nothing_found}', 'A: a non-manual request skips book 4');
select is(pg_temp.req(array[4], true), '{queued}', 'A: a manual request queues book 4');
select is((select string_agg(status, ',' order by created_at, status) from library.cover_searches
            where book_id = pg_temp.book(4)),
          'dismissed,queued', 'A: the old nothing_found row is dismissed');

reset role;
select throws_ok(
  $$ insert into library.cover_searches (household_id, book_id, batch_id, status)
     values (pg_temp.hh(), pg_temp.book(4), pg_temp.batch(), 'nothing_found') $$,
  '23505', null, 'a second active row for book 4 violates cover_searches_active_uq (D2)');

set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
select library.mark_for_cover(pg_temp.book(5), '{wrong_book}', 'Old note');
select pg_temp.prep(5);
select is(pg_temp.claim(5), 'claimed:1', 'A: claims book 5');
select is(pg_temp.release(5, 'screen_refused', null, 0), 'failed', 'A: book 5 fails');

select library.mark_for_cover(pg_temp.book(5), '{wrong_book}', 'Old note');
select is(pg_temp.req(array[5], false), '{nothing_found}', 'A: the same note keeps book 5 ineligible');

select library.mark_for_cover(pg_temp.book(5), '{wrong_book,low_quality}', 'Old note');
select is(pg_temp.req(array[5], false), '{nothing_found}', 'A: changing only the reasons does not');

select library.mark_for_cover(pg_temp.book(5), '{wrong_book}', 'New note');
select is(pg_temp.req(array[5], false), '{queued}', 'A: a new note makes book 5 eligible again');

---------------------------------------------------------------------------
-- Apply and the two reviewers.
---------------------------------------------------------------------------
select library.mark_for_cover(pg_temp.book(21), '{low_quality}', null);
select pg_temp.prep(21, 3);
select is(pg_temp.claim(21), 'claimed:1', 'A: claims book 21');
select is(pg_temp.finish(21, array[pg_temp.url(21, 1), pg_temp.url(21, 2)], 500), 'ready',
          'A: book 21 is ready with two results');
select pg_temp.save('s21', pg_temp.search_of(21)::text);

select is(library.apply_cover(pg_temp.val('s21')::uuid, pg_temp.url(21, 3), pg_temp.cover(21)), 'invalid_choice',
          'A: a candidate that is not a result is an invalid_choice');
select is(library.apply_cover(pg_temp.val('s21')::uuid, pg_temp.url(21, 1),
                              'https://covers.openlibrary.org/b/id/1234567-L.jpg'),
          'cover_changed', 'A: a stale expected cover is cover_changed');
select is((select cover_url from library.books where id = pg_temp.book(21)), pg_temp.cover(21),
          'A: cover_changed leaves the book unchanged');

select is(library.apply_cover(pg_temp.val('s21')::uuid, pg_temp.url(21, 1), pg_temp.cover(21)), 'applied',
          'A: applies result 1');
select is((select cover_url || ':' || cardinality(array_positions(user_edited_fields, 'coverUrl'))
             from library.books where id = pg_temp.book(21)),
          pg_temp.url(21, 1) || ':1', 'A: cover_url is result 1 and coverUrl is edited once');
select is((select count(*)::int from library.cover_marks where book_id = pg_temp.book(21)), 0,
          'A: the mark is gone');
select is((select status || ':' || applied_by || ':' || applied_url from library.cover_searches
            where id = pg_temp.val('s21')::uuid),
          'applied:11111111-1111-1111-1111-111111111111:' || pg_temp.url(21, 1),
          'A: the search is applied by A');

set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';
select is(library.apply_cover(pg_temp.val('s21')::uuid, pg_temp.url(21, 2), pg_temp.url(21, 1)), 'not_ready',
          'B: applying the same search again is not_ready');
select is((select cover_url from library.books where id = pg_temp.book(21)), pg_temp.url(21, 1),
          'B: the cover is still result 1');

---------------------------------------------------------------------------
-- A cover hand-edited while results were pending.
---------------------------------------------------------------------------
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
select pg_temp.prep(22);
select is(pg_temp.claim(22), 'claimed:1', 'A: claims book 22');
select is(pg_temp.finish(22, array[pg_temp.url(22, 1)], 500), 'ready', 'A: book 22 is ready');
update library.books set cover_url = 'https://covers.openlibrary.org/b/id/2222222-L.jpg' where id = pg_temp.book(22);
select is(library.apply_cover(pg_temp.search_of(22), pg_temp.url(22, 1), pg_temp.cover(22)), 'cover_changed',
          'A: a cover edited by hand after the search is cover_changed');

---------------------------------------------------------------------------
-- Dismiss and seen.
---------------------------------------------------------------------------
select library.mark_for_cover(pg_temp.book(23), '{placeholder}', null);
select pg_temp.prep(23);
select is(pg_temp.claim(23), 'claimed:1', 'A: claims book 23');
select is(pg_temp.finish(23, array[pg_temp.url(23, 1)], 500), 'ready', 'A: book 23 is ready');
select pg_temp.save('s23', pg_temp.search_of(23)::text);
select is(library.dismiss_cover_search(pg_temp.val('s23')::uuid), 'dismissed', 'A: keeping the cover dismisses');
select is((select count(*)::int from library.cover_marks where book_id = pg_temp.book(23)), 0,
          'A: dismissing deletes the mark');
select is(library.dismiss_cover_search(pg_temp.val('s21')::uuid), 'not_ready',
          'A: dismissing an applied search is not_ready');

select is(library.mark_cover_results_seen(array[pg_temp.search_of(3)]), 1, 'A: marks a nothing_found row seen');
select is(library.mark_cover_results_seen(array[pg_temp.search_of(3)]), 0, 'A: a second call marks nothing');

---------------------------------------------------------------------------
-- Cascade.
---------------------------------------------------------------------------
delete from library.books where id = pg_temp.book(2);
reset role;
select is((select count(*)::int from library.cover_marks where book_id = pg_temp.book(2))
          + (select count(*)::int from library.cover_searches where book_id = pg_temp.book(2)),
          0, 'deleting book 2 deletes its mark and searches');

---------------------------------------------------------------------------
-- Budget reached mid-batch.
---------------------------------------------------------------------------
update library.cover_usage set spent_micro = 5000000 - 4299 where household_id = pg_temp.hh() and month = pg_temp.m();
update library.cover_usage_total set spent_micro = 0 where month = pg_temp.m();

set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
select pg_temp.prep(17);
select is(pg_temp.claim(17), 'budget:0', 'A: a claim that would pass the household budget gets budget');
select is(pg_temp.st(pg_temp.search_of(17)) || '|' || pg_temp.spent(pg_temp.hh(), pg_temp.m()),
          'gathered:0:|4995701', 'A: the search stays gathered, attempts and spent_micro unchanged');

reset role;
update library.cover_usage set spent_micro = 5000000 - 4300 where household_id = pg_temp.hh() and month = pg_temp.m();
set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
select is(pg_temp.claim(17) || '|' || pg_temp.spent(pg_temp.hh(), pg_temp.m()), 'claimed:1|5000000',
          'A: a claim that reaches the budget exactly succeeds');

reset role;
update library.cover_usage set spent_micro = 5000000 where household_id = pg_temp.hh() and month = pg_temp.lm();
update library.cover_usage set spent_micro = 0 where household_id = pg_temp.hh() and month = pg_temp.m();
set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
select pg_temp.prep(18);
select is(pg_temp.claim(18), 'claimed:1', 'A: last month''s full row does not block this month');

select is((select b.month || ':' || b.spent_micro || ':' || b.budget_micro || ':' || b.reserve_micro || ':'
                  || b.global_spent_micro || ':' || b.global_budget_micro
             from library.cover_budget(pg_temp.hh()) b),
          pg_temp.m() || ':' || pg_temp.spent(pg_temp.hh(), pg_temp.m()) || ':5000000:4300:'
            || pg_temp.tspent(pg_temp.m()) || ':5000000',
          'A: cover_budget returns this month''s numbers and the project-wide spend');

set local request.jwt.claims = '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}';
select throws_ok($$ select * from library.cover_budget(pg_temp.hh()) $$, '42501', null,
                 'C: cover_budget of H is denied');

---------------------------------------------------------------------------
-- Project-wide ceiling (R-A).
---------------------------------------------------------------------------
select pg_temp.prep(19);

reset role;
update library.cover_usage set spent_micro = 0 where household_id = pg_temp.hh() and month = pg_temp.m();
update library.cover_usage_total set spent_micro = 5000000 - 4299 where month = pg_temp.m();

set local role authenticated;
set local request.jwt.claims = '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}';
select is(pg_temp.claim(19), 'budget:0', 'C: a claim in H2 that would pass the project ceiling gets budget');
select is(pg_temp.usage(pg_temp.hh2(), pg_temp.m()) || '|' || pg_temp.tspent(pg_temp.m()), '0:0|4995701',
          'C: H2''s row and the total are unchanged');

set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
select pg_temp.prep(20);
select is(pg_temp.claim(20), 'budget:0', 'A: a claim in H, well under its own budget, gets budget too');

reset role;
update library.cover_usage_total set spent_micro = 5000000 - 4300 where month = pg_temp.m();
set local role authenticated;
set local request.jwt.claims = '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}';
select is(pg_temp.claim(19) || '|' || pg_temp.tspent(pg_temp.m()), 'claimed:1|5000000',
          'C: at 5000000 - 4300 the claim succeeds and the total reaches exactly 5000000');

---------------------------------------------------------------------------
-- Signed out.
---------------------------------------------------------------------------
reset role;
set local role anon;
set local request.jwt.claims = '{"role":"anon"}';

select throws_ok($$ select * from library.cover_marks $$, '42501', null, 'anon: selecting cover_marks is denied');
select throws_ok($$ select id from library.cover_searches $$, '42501', null, 'anon: selecting cover_searches is denied');
select throws_ok($$ select * from library.cover_usage $$, '42501', null, 'anon: selecting cover_usage is denied');
select throws_ok($$ select * from library.cover_usage_total $$, '42501', null,
                 'anon: selecting cover_usage_total is denied');
select throws_ok($$ select * from library.request_cover_searches(pg_temp.hh(), array[pg_temp.book(1)],
                                                                 pg_temp.batch(), true) $$,
                 '42501', null, 'anon: executing request_cover_searches is denied');
select throws_ok($$ select * from library.claim_cover_search(pg_temp.search_of(17)) $$,
                 '42501', null, 'anon: executing claim_cover_search is denied');
select throws_ok($$ select library.apply_cover(pg_temp.search_of(1), pg_temp.url(1, 1), pg_temp.cover(1)) $$,
                 '42501', null, 'anon: executing apply_cover is denied');

---------------------------------------------------------------------------
-- Non-members.
---------------------------------------------------------------------------
reset role;
select pg_temp.save('usage_snap', (select string_agg(household_id || ':' || month || ':' || spent_micro || ':' || screens,
                                                     '|' order by household_id, month)
                                     from library.cover_usage));

set local role authenticated;
set local request.jwt.claims = '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}';

select is((select count(*)::int from library.cover_marks where household_id = pg_temp.hh()), 0,
          'C: sees no marks of H');
select is((select count(*)::int from library.cover_searches where household_id = pg_temp.hh()), 0,
          'C: sees no searches of H');
select is((select count(*)::int from library.cover_usage where household_id = pg_temp.hh()), 0,
          'C: sees no usage of H');
select throws_ok($$ select * from library.cover_usage_total $$, '42501', null,
                 'C: selecting cover_usage_total is denied');

select throws_ok($$ select library.mark_for_cover(pg_temp.book(1), '{placeholder}', null) $$,
                 '42501', null, 'C: mark_for_cover on H''s book is denied');
select throws_ok($$ select library.unmark_for_cover(pg_temp.book(5)) $$,
                 '42501', null, 'C: unmark_for_cover on H''s book is denied');
select throws_ok($$ select library.record_cover_candidates(pg_temp.search_of(5), pg_temp.cands(5, 1)) $$,
                 '42501', null, 'C: record_cover_candidates on H''s search is denied');
select throws_ok($$ select * from library.claim_cover_search(pg_temp.search_of(20)) $$,
                 '42501', null, 'C: claim_cover_search on H''s search is denied');
select throws_ok($$ select library.finish_cover_search(pg_temp.search_of(17), pg_temp.tok(17), '{}',
                                                       '{}'::jsonb, '{}'::jsonb, 0) $$,
                 '42501', null, 'C: finish_cover_search on H''s search is denied');
select throws_ok($$ select library.release_cover_search(pg_temp.search_of(17), pg_temp.tok(17), 'billing', null,
                                                        '{}'::jsonb, 0) $$,
                 '42501', null, 'C: release_cover_search on H''s search is denied');
select throws_ok($$ select library.apply_cover(pg_temp.search_of(1), pg_temp.url(1, 1), pg_temp.cover(1)) $$,
                 '42501', null, 'C: apply_cover on H''s search is denied');
select throws_ok($$ select library.dismiss_cover_search(pg_temp.search_of(1)) $$,
                 '42501', null, 'C: dismiss_cover_search on H''s search is denied');
select is(library.mark_cover_results_seen(array[pg_temp.search_of(6)]), 0,
          'C: mark_cover_results_seen skips H''s rows silently');
select throws_ok($$ select * from library.claim_cover_search(gen_random_uuid()) $$,
                 '42501', null, 'C: a missing search id raises the same 42501');

reset role;
select is((select string_agg(household_id || ':' || month || ':' || spent_micro || ':' || screens,
                             '|' order by household_id, month)
             from library.cover_usage)
          || '|' || (select (seen_at is null)::text from library.cover_searches where id = pg_temp.search_of(6))
          || '|' || (select status from library.cover_searches where id = pg_temp.search_of(17)),
          pg_temp.val('usage_snap') || '|true|processing',
          'C changed no usage, seen_at or search');

select * from finish();
rollback;
