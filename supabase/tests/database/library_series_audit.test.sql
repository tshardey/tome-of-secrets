-- pgTAP: series audit, part 1 (Plan 12 D2-D4, D7's loose key). Proves the
-- loose series key; that an audit request queues only a carded, tagger-filled
-- book with a series that isn't audited yet (a failed audit may be retried);
-- that an old claim_tag_job meeting an audit job answers 'audit' and changes
-- nothing (Review Focus 5); that claim_audit_job re-checks, reserves and
-- returns the evidence with handSet neighbours; that a series change clears
-- the marker and retires pending flags; and the flags table's RLS, grants and
-- constraints. Series claims keep same_author (now with handSet). Part 2
-- (D7-D9): the audit finish (flags, the spelling guard, mid-job changes, the
-- true-cost settle), the release, Apply / Keep / Edit and their refusals,
-- and undo of a series dismissal.
begin;

create extension if not exists pgtap with schema extensions;

select plan(104);

insert into auth.users (id, email, aud, role)
values
  ('11111111-1111-1111-1111-111111111111', 'a@library.test', 'authenticated', 'authenticated'),
  ('22222222-2222-2222-2222-222222222222', 'b@library.test', 'authenticated', 'authenticated'),
  ('33333333-3333-3333-3333-333333333333', 'c@library.test', 'authenticated', 'authenticated');

create temporary table test_vals (k text primary key, v text) on commit drop;
grant all on test_vals to authenticated, anon;

---------------------------------------------------------------------------
-- Helpers (as library_series_retry.test.sql).
---------------------------------------------------------------------------

create function pg_temp.val(p text) returns text language sql as
$$ select v from test_vals where k = p $$;

create function pg_temp.save(p_k text, p_v text) returns void language sql as
$$ insert into test_vals (k, v) values (p_k, p_v) on conflict (k) do update set v = excluded.v $$;

create function pg_temp.hh() returns uuid language sql as $$ select pg_temp.val('hh')::uuid $$;
create function pg_temp.hh2() returns uuid language sql as $$ select pg_temp.val('hh2')::uuid $$;

-- Book n; books 81 and up are in C's household H2, the rest in H.
create function pg_temp.book(n int) returns uuid language sql as
$$ select ('fafafafa-0000-0000-0000-' || lpad(n::text, 12, '0'))::uuid $$;

create function pg_temp.hh_of(n int) returns uuid language sql as
$$ select case when n >= 80 then pg_temp.hh2() else pg_temp.hh() end $$;

create function pg_temp.job_of(n int) returns uuid language sql security definer as
$$ select j.id from library.tag_jobs j
    where j.book_id = pg_temp.book(n) and j.status in ('queued', 'processing') $$;

create function pg_temp.req(n int[], reason text) returns text language sql as
$$ select array_agg(r.outcome order by r.book_id)::text
     from library.request_tagging(pg_temp.hh_of(n[1]), array(select pg_temp.book(x) from unnest(n) x), reason,
                                  null) r $$;

-- A finished job of a kind for book n; created_at is clock_timestamp, so the
-- last one added is the book's newest job.
create function pg_temp.job(n int, p_kind text, p_status text) returns void language sql as
$$ insert into library.tag_jobs (household_id, book_id, kind, reason, status, error_code)
   values (pg_temp.hh_of(n), pg_temp.book(n), p_kind,
           case p_kind when 'series' then 'series' when 'audit' then 'audit' else 'manual' end,
           p_status, case when p_status = 'failed' then 'tag_unreadable' end) $$;

create function pg_temp.m() returns date language sql as
$$ select date_trunc('month', now() at time zone 'utc')::date $$;

-- The household's tagging spend this month as spent:calls.
create function pg_temp.usage(p_hh uuid) returns text language sql security definer as
$$ select coalesce((select u.spent_micro || ':' || u.calls from library.ai_usage u
                     where u.household_id = p_hh and u.feature = 'tagging' and u.month = pg_temp.m()), '0:0') $$;

create function pg_temp.spent(p_hh uuid) returns bigint language sql security definer as
$$ select coalesce((select u.spent_micro from library.ai_usage u
                     where u.household_id = p_hh and u.feature = 'tagging' and u.month = pg_temp.m()), 0) $$;

-- A job as status:attempts:reserved_micro:cost_micro:claim_token-set.
create function pg_temp.jstate(p_job uuid) returns text language sql security definer as
$$ select j.status || ':' || j.attempts || ':' || j.reserved_micro || ':' || j.cost_micro || ':'
          || (j.claim_token is not null)
     from library.tag_jobs j where j.id = p_job $$;

-- One column of a job, as text.
create function pg_temp.jcol(p_job uuid, p_col text) returns text language sql security definer as
$$ select to_jsonb(j) ->> p_col from library.tag_jobs j where j.id = p_job $$;

-- claim_audit_job on book n's active job, keeping the job id and the row.
create function pg_temp.acl(n int) returns text language plpgsql as
$$ declare r record; v_job uuid := pg_temp.job_of(n);
   begin
     perform pg_temp.save('job' || n, v_job::text);
     select * into r from library.claim_audit_job(v_job);
     perform pg_temp.save('row' || n, to_jsonb(r)::text);
     return r.outcome;
   end $$;

create function pg_temp.jid(n int) returns uuid language sql as $$ select pg_temp.val('job' || n)::uuid $$;
create function pg_temp.crow(n int) returns jsonb language sql as $$ select pg_temp.val('row' || n)::jsonb $$;

create function pg_temp.audited(n int) returns boolean language sql security definer as
$$ select c.series_audited_at is not null from library.book_cards c where c.book_id = pg_temp.book(n) $$;

-- Book n's flags as status(decided?) in creation order.
create function pg_temp.flags(n int) returns text language sql security definer as
$$ select string_agg(f.status || '(' || (f.decided_at is not null) || ')', ',' order by f.created_at, f.id)
     from library.series_audit_flags f where f.book_id = pg_temp.book(n) $$;

create function pg_temp.flag(n int, p_status text default 'pending') returns void language sql as
$$ insert into library.series_audit_flags (household_id, book_id, kind, current_name, current_volume,
                                           proposed_name, proposed_volume, why, status)
   select b.household_id, b.id, 'wrong_series', b.series_name, b.series_volume, 'Wrenfold Tales', 1,
          'A synthetic why.', p_status
     from library.books b where b.id = pg_temp.book(n) $$;

create function pg_temp.as_a() returns void language sql as
$$ select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true) $$;
create function pg_temp.as_b() returns void language sql as
$$ select set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true) $$;
create function pg_temp.as_c() returns void language sql as
$$ select set_config('request.jwt.claims', '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}', true) $$;

---------------------------------------------------------------------------
-- Households: A and B in H, C alone in H2. Books 1-30 in H, 81 in H2.
---------------------------------------------------------------------------
set local role authenticated;
select pg_temp.as_a();
insert into test_vals (k, v) select 'hh', library.create_household('Home', 'Member A')::text;
insert into test_vals (k, v) select 'code', h.invite_code from library.households h where h.id = pg_temp.hh();
select pg_temp.as_b();
insert into test_vals (k, v) select 'joined', library.join_household(pg_temp.val('code'), 'Member B')::text;
select pg_temp.as_c();
insert into test_vals (k, v) select 'hh2', library.create_household('Other Home', 'Member C')::text;

reset role;
set local request.jwt.claims = '{}';
insert into library.books (id, household_id, title, authors, synopsis, series_name, series_volume)
select pg_temp.book(n), pg_temp.hh_of(n), 'Invented Title ' || n, '{Ines Dravenholt}', 'A made-up synopsis ' || n,
       'Thornmere Cycle', n
  from (select generate_series(1, 30) union all select 81) g(n);
update library.tag_jobs set status = 'done';

-- Cards for every book but 5, unchecked for a series.
insert into library.book_cards (book_id, household_id, summary, cover_description, model, vocab_version)
select b.id, b.household_id, 'A card summary.', 'A grey cover.', 'claude-sonnet-5-5', 1
  from library.books b
 where b.id in (select pg_temp.book(n) from (select generate_series(1, 30) union all select 81) g(n))
   and b.id <> pg_temp.book(5);

--  1  eligible (audit claim; neighbours 2, 3 and 9 by Corin Vasselby)
--  2  no series                     3  seriesName hand-set
--  4  seriesVolume hand-set         5  no card
--  6  already audited               7  newest job a failed full job
--  8  newest job a failed audit job (the retry)
--  9  tagger-filled neighbour of 1
-- 10-12 queued, then hand-set / lost its series / audited before the claim
-- 13  no series: a series job (not_audit; series claim)
-- 14  queued for C's claim
-- 20-23 marker and trigger
-- 81  H2: budget
update library.books set authors = '{Corin Vasselby}' where id in (pg_temp.book(1), pg_temp.book(2),
                                                                   pg_temp.book(3), pg_temp.book(9));
update library.books set series_name = null, series_volume = null where id in (pg_temp.book(2), pg_temp.book(13));
update library.books set user_edited_fields = '{seriesName}' where id = pg_temp.book(3);
update library.books set user_edited_fields = '{seriesVolume}' where id = pg_temp.book(4);
update library.book_cards set series_audited_at = now() where book_id = pg_temp.book(6);
select pg_temp.job(7, 'audit', 'failed');
select pg_temp.job(7, 'full', 'failed');
select pg_temp.job(8, 'full', 'failed');
select pg_temp.job(8, 'audit', 'failed');

---------------------------------------------------------------------------
-- The loose key (D7).
---------------------------------------------------------------------------
select is(array[library._series_loose_key('The Thornmere Cycle'), library._series_loose_key('thornmere cycle'),
                library._series_loose_key('Thornmere-Cycle'), library._series_loose_key('THORNMERE CYCLE.'),
                library._series_loose_key('Émber Loom'), library._series_loose_key('Theodric Tales'),
                library._series_loose_key(null)],
          array['thornmerecycle', 'thornmerecycle', 'thornmerecycle', 'thornmerecycle', 'emberloom',
                'theodrictales', ''],
          'loose key: case, punctuation, a leading "the" and accents fold; "Theodric" keeps its "the"');
select isnt(library._series_loose_key('Saltglass Archives'), library._series_loose_key('Saltglass Archive'),
            'loose key: a plural is another series');
select ok(not has_function_privilege('authenticated', 'library._series_loose_key(text)', 'execute')
          and not has_function_privilege('anon', 'library._series_loose_key(text)', 'execute'),
          'loose key: not executable by clients');
select ok(not has_function_privilege('authenticated', 'library._series_audit_reset()', 'execute'),
          'the trigger function has no client grant');

---------------------------------------------------------------------------
-- Eligibility (D4).
---------------------------------------------------------------------------
set local role authenticated;
select pg_temp.as_a();

select is(pg_temp.req(array[1], 'audit'), '{queued}', 'audit: a carded, tagger-filled book with a series queues');
select is((select j.kind || ':' || j.reason || ':' || j.status from library.tag_jobs j where j.id = pg_temp.job_of(1)),
          'audit:audit:queued', 'the request is a queued audit job');
select is(pg_temp.req(array[2, 3, 4, 5, 6, 7], 'audit'), '{skipped,skipped,skipped,skipped,skipped,skipped}',
          'audit: no series, seriesName or seriesVolume hand-set, no card, audited, newest failed full: skipped');
select is(pg_temp.req(array[8], 'audit'), '{queued}', 'audit: a book whose newest job is a failed audit queues (retry)');
select is(pg_temp.req(array[1], 'audit'), '{already_open}', 'audit: an open job reads already_open');
select is(pg_temp.req(array[9, 10, 11, 12, 14], 'audit'), '{queued,queued,queued,queued,queued}',
          'audit: more eligible books queue');
select is(pg_temp.req(array[13], 'series'), '{queued}', 'series: the blank book queues a series job');
select throws_ok($$select pg_temp.req(array[20], 'bogus')$$, '22023', 'invalid_reason',
                 'an unknown reason is still invalid_reason');

select pg_temp.as_c();
select throws_ok($$select * from library.request_tagging(pg_temp.hh(), array[pg_temp.book(20)], 'audit', null)$$,
                 '42501', 'not_authorized', 'C cannot request an audit in H');

---------------------------------------------------------------------------
-- Old claim (Review Focus 5).
---------------------------------------------------------------------------
select pg_temp.as_a();
select pg_temp.save('usage0', pg_temp.usage(pg_temp.hh()));
select is((select to_jsonb(r) from library.claim_tag_job(pg_temp.job_of(1)) r),
          jsonb_build_object('outcome', 'audit', 'claim_token', null, 'attempts', null, 'kind', null,
                             'book', null, 'card', null, 'vocab', null, 'vocab_version', null,
                             'removed', null, 'tos_tags', null, 'series_names', null, 'same_author', null),
          'claim_tag_job on an audit job: outcome audit and nothing else');
select is(pg_temp.jstate(pg_temp.job_of(1)), 'queued:0:0:0:false',
          'the audit job is still queued, no attempt, nothing reserved');
select is(pg_temp.usage(pg_temp.hh()), pg_temp.val('usage0'), 'ai_usage is unchanged');

---------------------------------------------------------------------------
-- Audit claim (D4).
---------------------------------------------------------------------------
select pg_temp.save('spent0', pg_temp.spent(pg_temp.hh())::text);
select is(pg_temp.acl(1), 'claimed', 'claim_audit_job claims an audit job');
select is((pg_temp.crow(1) -> 'book' ->> 'seriesName') || '|' || (pg_temp.crow(1) -> 'book' ->> 'title') || '|'
          || jsonb_typeof(pg_temp.crow(1) -> 'book' -> 'isbns') || '|' || (pg_temp.crow(1) -> 'card' ->> 'summary') || '|'
          || jsonb_typeof(pg_temp.crow(1) -> 'series_names') || '|' || (pg_temp.crow(1) ->> 'attempts')
          || '|' || (pg_temp.crow(1) ->> 'claim_token' is not null),
          'Thornmere Cycle|Invented Title 1|array|A card summary.|array|1|true',
          'the claim carries the book, card, series names, attempts and a token');
select is((select string_agg((e ->> 'title') || ':' || (e ->> 'handSet'), ',' order by e ->> 'title')
             from jsonb_array_elements(pg_temp.crow(1) -> 'same_author') e),
          'Invented Title 2:false,Invented Title 3:true,Invented Title 9:false',
          'same_author marks the hand-set neighbour handSet and the tagger-filled ones not');
select is(pg_temp.jcol(pg_temp.jid(1), 'status') || '|' || pg_temp.jcol(pg_temp.jid(1), 'audit_seen'),
          'processing|{"name": "Thornmere Cycle", "volume": 1.00}',
          'the job is processing with the series at claim in audit_seen');
select is(pg_temp.jcol(pg_temp.jid(1), 'reserved_micro') || '|'
          || (pg_temp.spent(pg_temp.hh()) - pg_temp.val('spent0')::bigint),
          library.series_reserve_micro() || '|' || library.series_reserve_micro(),
          'the claim reserves series_reserve_micro()');

-- 10-12 change before their claim.
reset role;
update library.books set user_edited_fields = '{seriesName}' where id = pg_temp.book(10);
update library.books set series_name = null, series_volume = null where id = pg_temp.book(11);
update library.book_cards set series_audited_at = now() where book_id = pg_temp.book(12);
set local role authenticated;
select pg_temp.as_a();
select pg_temp.save('spent1', pg_temp.spent(pg_temp.hh())::text);
select is(pg_temp.acl(10) || ',' || pg_temp.acl(11) || ',' || pg_temp.acl(12), 'done,done,done',
          'a book that became hand-set, lost its series or was audited: done');
select is(pg_temp.jstate(pg_temp.jid(10)) || ',' || pg_temp.jstate(pg_temp.jid(11)) || ','
          || pg_temp.jstate(pg_temp.jid(12)) || '|' || (pg_temp.spent(pg_temp.hh()) - pg_temp.val('spent1')::bigint),
          'done:0:0:0:false,done:0:0:0:false,done:0:0:0:false|0',
          'those jobs are done at cost 0 with no reservation');

select is(pg_temp.acl(13), 'not_audit', 'claim_audit_job on a series job: not_audit');
select is(pg_temp.jstate(pg_temp.jid(13)), 'queued:0:0:0:false', 'and the series job is unchanged');

select pg_temp.as_c();
select throws_ok($$select * from library.claim_audit_job(pg_temp.job_of(14))$$, '42501', 'not_authorized',
                 'C cannot claim H''s audit job');

-- Budget: H2 is one reserve short.
reset role;
insert into library.ai_usage (household_id, feature, month, spent_micro, calls)
values (pg_temp.hh2(), 'tagging', pg_temp.m(), 7000000 - library.series_reserve_micro() + 1, 1)
on conflict (household_id, feature, month) do update set spent_micro = excluded.spent_micro;
set local role authenticated;
select pg_temp.as_c();
select is(pg_temp.req(array[81], 'audit'), '{queued}', 'C queues an audit in H2');
select is(pg_temp.acl(81) || '|' || pg_temp.jstate(pg_temp.jid(81)), 'budget|queued:0:0:0:false',
          'with the budget short: budget, and the job is unchanged');

---------------------------------------------------------------------------
-- Series paths unchanged.
---------------------------------------------------------------------------
select pg_temp.as_a();
select is((select r.outcome || '|' || r.kind || '|' || jsonb_typeof(r.same_author) || '|'
                  || (select bool_and(e ? 'handSet' and e ? 'seriesName') from jsonb_array_elements(r.same_author) e)
             from library.claim_tag_job(pg_temp.jid(13)) r),
          'claimed|series|array|true', 'a series claim still returns same_author, now with handSet');

---------------------------------------------------------------------------
-- Marker and trigger (D2).
---------------------------------------------------------------------------
reset role;
update library.book_cards set series_audited_at = now()
 where book_id in (pg_temp.book(20), pg_temp.book(21), pg_temp.book(22), pg_temp.book(23));
select pg_temp.flag(20);
select pg_temp.flag(21);
select pg_temp.flag(22);
select pg_temp.flag(23, 'applied');

update library.books set series_name = 'Saltglass Archive' where id = pg_temp.book(20);
select is(pg_temp.audited(20)::text || '|' || pg_temp.flags(20), 'false|stale(true)',
          'a name change clears the marker and retires the pending flag');
update library.books set series_volume = 7.5 where id = pg_temp.book(21);
select is(pg_temp.audited(21)::text || '|' || pg_temp.flags(21), 'false|stale(true)',
          'a number-only change clears the marker and retires the pending flag');
update library.books set title = 'Invented Title 22b', series_name = 'Thornmere Cycle', series_volume = 22
 where id = pg_temp.book(22);
select is(pg_temp.audited(22)::text || '|' || pg_temp.flags(22), 'true|pending(false)',
          'an update that leaves the series unchanged clears nothing');
update library.books set series_name = null, series_volume = null where id = pg_temp.book(23);
select is(pg_temp.audited(23)::text || '|' || pg_temp.flags(23), 'false|applied(false)',
          'a decided flag is left alone');

---------------------------------------------------------------------------
-- The flags table (D3).
---------------------------------------------------------------------------
select pg_temp.flag(24);
set local role authenticated;
select pg_temp.as_a();
select is((select count(*)::int from library.series_audit_flags), 5, 'A selects H''s flags');
select pg_temp.as_b();
select is((select count(*)::int from library.series_audit_flags), 5, 'B selects H''s flags');
select pg_temp.as_c();
select is((select count(*)::int from library.series_audit_flags), 0, 'C sees none');
select pg_temp.as_a();
select throws_ok($$select pg_temp.flag(25)$$, '42501', null, 'A cannot insert a flag');
select throws_ok($$update library.series_audit_flags set status = 'kept'$$, '42501', null, 'A cannot update a flag');
select throws_ok($$delete from library.series_audit_flags$$, '42501', null, 'A cannot delete a flag');

reset role;
select throws_ok($$select pg_temp.flag(24)$$, '23505', null, 'a second pending flag for one book: 23505');
select throws_ok($$insert into library.series_audit_flags (household_id, book_id, kind, current_name,
                                                          proposed_name, proposed_volume)
                   values (pg_temp.hh(), pg_temp.book(25), 'wrong_number', 'Thornmere Cycle', 'Ember Loom', 3)$$,
                 '23514', null, 'a wrong_number flag with a proposed name: 23514');
select ok((select c.relrowsecurity from pg_class c where c.oid = 'library.series_audit_flags'::regclass)
          and not has_table_privilege('anon', 'library.series_audit_flags', 'select'),
          'RLS is on and anon has no select');

---------------------------------------------------------------------------
---------------------------------------------------------------------------
-- Part 2 (Plan 12 D7-D9): the audit finish, the release, the decisions and
-- undo. Books 31-79 in H; every finish claims with claim_audit_job first.
---------------------------------------------------------------------------

-- A carded book n with a series (every queued new_book job set done).
create function pg_temp.mk(n int, p_name text, p_vol numeric, p_authors text[] default '{Ines Dravenholt}')
returns void language plpgsql as
$$ begin
     insert into library.books (id, household_id, title, authors, synopsis, series_name, series_volume)
     values (pg_temp.book(n), pg_temp.hh_of(n), 'Invented Title ' || n, p_authors, 'A made-up synopsis ' || n,
             p_name, p_vol);
     update library.tag_jobs set status = 'done' where book_id = pg_temp.book(n);
     insert into library.book_cards (book_id, household_id, summary, cover_description, model, vocab_version)
     values (pg_temp.book(n), pg_temp.hh_of(n), 'A card summary.', 'A grey cover.', 'claude-sonnet-5-5', 1);
   end $$;

-- Requests an audit for book n and claims it; the claim outcome.
create function pg_temp.aud(n int) returns text language plpgsql as
$$ begin perform pg_temp.req(array[n], 'audit'); return pg_temp.acl(n); end $$;

create function pg_temp.tok(n int) returns uuid language sql as
$$ select (pg_temp.crow(n) ->> 'claim_token')::uuid $$;

-- An audit job's finish payload (D5).
create function pg_temp.ares(p_verdict text, p_name text, p_volume numeric, p_why text default 'A synthetic why.')
returns jsonb language sql as
$$ select jsonb_build_object('tos', '[]'::jsonb, 'library', '[]'::jsonb, 'summary', null, 'coverDescription', null,
                             'coverSeen', false, 'suggestions', '[]'::jsonb,
                             'audit', jsonb_build_object('verdict', p_verdict, 'name', p_name, 'volume', p_volume,
                                                         'why', p_why)) $$;

create function pg_temp.afin(n int, res jsonb, cost int default 1000) returns text language sql as
$$ select library.finish_tag_job(pg_temp.jid(n), pg_temp.tok(n), res, '{}'::jsonb, cost, 'claude-sonnet-5-5') $$;

create function pg_temp.arel(n int, err text, cost int) returns text language sql as
$$ select library.release_tag_job(pg_temp.jid(n), pg_temp.tok(n), err, null, '{}'::jsonb, cost) $$;

-- Request, claim and finish in one: claim:finish.
create function pg_temp.au(n int, p_verdict text, p_name text, p_volume numeric,
                           p_why text default 'A synthetic why.') returns text language plpgsql as
$$ declare v text := pg_temp.aud(n);
   begin return v || ':' || pg_temp.afin(n, pg_temp.ares(p_verdict, p_name, p_volume, p_why)); end $$;

-- Book n's newest flag as kind|current|volume|proposed|volume|why|status.
create function pg_temp.fl(n int) returns text language sql security definer as
$$ select f.kind || '|' || f.current_name || '|' || coalesce(f.current_volume::text, '-') || '|'
          || coalesce(f.proposed_name, '-') || '|' || coalesce(f.proposed_volume::text, '-') || '|'
          || coalesce(f.why, '-') || '|' || f.status
     from library.series_audit_flags f where f.book_id = pg_temp.book(n)
    order by f.created_at desc, f.id limit 1 $$;

create function pg_temp.fid(n int) returns uuid language sql security definer as
$$ select f.id from library.series_audit_flags f where f.book_id = pg_temp.book(n)
    order by f.created_at desc, f.id limit 1 $$;

-- The newest flag's status:decided_by:decided_at-set.
create function pg_temp.fdec(n int) returns text language sql security definer as
$$ select f.status || ':' || coalesce(f.decided_by::text, '-') || ':' || (f.decided_at is not null)
     from library.series_audit_flags f where f.id = pg_temp.fid(n) $$;

-- Book n as series|volume|user_edited_fields.
create function pg_temp.bk(n int) returns text language sql security definer as
$$ select coalesce(b.series_name, '-') || '|' || coalesce(b.series_volume::text, '-') || '|' || b.user_edited_fields::text
     from library.books b where b.id = pg_temp.book(n) $$;

-- One column of book n's newest flag, as text. (A function, not a subquery:
-- an uncorrelated subquery may run before the finish in the same select.)
create function pg_temp.fcol(n int, p_col text) returns text language sql security definer as
$$ select to_jsonb(f) ->> p_col from library.series_audit_flags f where f.id = pg_temp.fid(n) $$;

create function pg_temp.nflags(n int) returns int language sql security definer as
$$ select count(*)::int from library.series_audit_flags f where f.book_id = pg_temp.book(n) $$;

select pg_temp.mk(n, 'Thornmere Cycle', n) from generate_series(31, 36) n;
select pg_temp.mk(37, 'Thornmere Cycle', 2);
select pg_temp.mk(38, 'Thornmere Cycle', null);
select pg_temp.mk(n, 'Thornmere Cycle', n) from generate_series(39, 40) n;
select pg_temp.mk(n, 'Thornmere Cycle', 2) from generate_series(41, 44) n;
select pg_temp.mk(45, '???', 1);
select pg_temp.mk(n, 'Thornmere Cycle', n) from generate_series(46, 53) n;
select pg_temp.mk(54, 'Ember Loom', 2, '{M. Holt}');
select pg_temp.mk(55, 'Thornmere Cycle', 55, '{A. Reed}');
select pg_temp.mk(n, 'Thornmere Cycle', n) from generate_series(56, 58) n;
select pg_temp.mk(n, null, null) from generate_series(60, 62) n;

set local role authenticated;
select pg_temp.as_a();

---------------------------------------------------------------------------
-- The finish: no flag (D7 step 4, decisions 5 and 7).
---------------------------------------------------------------------------
select is(pg_temp.au(31, 'agree', null, null) || '|' || pg_temp.audited(31) || '|' || pg_temp.nflags(31),
          'claimed:done|true|0', 'agree: the marker is set and no flag is written');
select is(pg_temp.au(32, 'unsure', null, null) || '|' || pg_temp.audited(32) || '|' || pg_temp.nflags(32),
          'claimed:done|true|0', 'unsure: the marker is set and no flag is written');
select is(pg_temp.au(33, 'wrong_number', null, null) || '|' || pg_temp.audited(33) || '|' || pg_temp.nflags(33),
          'claimed:done|true|0', 'wrong_number with no number: the marker is set and no flag is written');
select is(pg_temp.au(34, 'wrong_number', null, 34) || '|' || pg_temp.audited(34) || '|' || pg_temp.nflags(34),
          'claimed:done|true|0', 'wrong_number with the current number: the marker is set and no flag is written');

---------------------------------------------------------------------------
-- The finish: flags.
---------------------------------------------------------------------------
select is(pg_temp.au(35, 'wrong_series', 'Saltglass Archive', 2) || '|' || pg_temp.audited(35) || '|'
          || pg_temp.fl(35) || '|' || (pg_temp.fcol(35, 'job_id') = pg_temp.jid(35)::text),
          'claimed:done|true|wrong_series|Thornmere Cycle|35.00|Saltglass Archive|2.00|A synthetic why.|pending|true',
          'wrong_series: one pending flag with the current series, the proposal, the why and the job');
select is(pg_temp.au(36, 'wrong_series', null, 3) || '|' || pg_temp.fl(36),
          'claimed:done|wrong_series|Thornmere Cycle|36.00|-|-|A synthetic why.|pending',
          'wrong_series with no name: a standalone (no name, no number)');
select is(pg_temp.au(37, 'wrong_number', 'Ember Loom', 3) || '|' || pg_temp.fl(37),
          'claimed:done|wrong_number|Thornmere Cycle|2.00|-|3.00|A synthetic why.|pending',
          'wrong_number 3 on a #2 book: a wrong_number flag proposing 3, with no name');
select is(pg_temp.au(38, 'wrong_number', null, 2) || '|' || pg_temp.fl(38),
          'claimed:done|wrong_number|Thornmere Cycle|-|-|2.00|A synthetic why.|pending',
          'wrong_number on a book with no number: the missing-number flag');
select is(pg_temp.au(39, 'wrong_series', 'Wrenfold Tales', 1, repeat('w', 300)) || '|'
          || char_length(pg_temp.fcol(39, 'why')),
          'claimed:done|200', 'a 300-character why is stored as 200 characters');
select is(pg_temp.au(40, 'wrong_series', ' Standalone ', 4) || '|' || pg_temp.fl(40),
          'claimed:done|wrong_series|Thornmere Cycle|40.00|-|-|A synthetic why.|pending',
          'the placeholder name standalone reads as a standalone');

---------------------------------------------------------------------------
-- The spelling guard (Review Focus 3, decision 6).
---------------------------------------------------------------------------
select is(pg_temp.au(41, 'wrong_series', 'the thornmere cycle', 2) || '|' || pg_temp.audited(41) || '|'
          || pg_temp.nflags(41),
          'claimed:done|true|0', 'a re-spelling with the same number: no flag');
select is(pg_temp.au(42, 'wrong_series', 'the thornmere cycle', 4) || '|' || pg_temp.fl(42),
          'claimed:done|wrong_number|Thornmere Cycle|2.00|-|4.00|A synthetic why.|pending',
          'a re-spelling with another number: a wrong_number flag proposing 4');
select is(pg_temp.au(43, 'wrong_series', 'the thornmere cycle', null) || '|' || pg_temp.nflags(43),
          'claimed:done|0', 'a re-spelling with no number: no flag');
select is(pg_temp.au(44, 'wrong_series', 'Thornmere Cycles', 2) || '|' || pg_temp.fl(44),
          'claimed:done|wrong_series|Thornmere Cycle|2.00|Thornmere Cycles|2.00|A synthetic why.|pending',
          'a different name (a plural): a wrong_series flag');
select is(pg_temp.au(45, 'wrong_series', '!!!', 1) || '|' || pg_temp.fl(45),
          'claimed:done|wrong_series|???|1.00|!!!|1.00|A synthetic why.|pending',
          'two names with empty loose keys are not the same spelling');

---------------------------------------------------------------------------
-- Mid-job changes (Review Focus 2).
---------------------------------------------------------------------------
select is(pg_temp.aud(46), 'claimed', 'book 46 is claimed');
reset role;
update library.books set series_name = 'Ember Loom', series_volume = 9 where id = pg_temp.book(46);
set local role authenticated;
select pg_temp.as_a();
select is(pg_temp.afin(46, pg_temp.ares('wrong_series', 'Saltglass Archive', 1), 2000) || '|' || pg_temp.nflags(46)
          || '|' || pg_temp.audited(46) || '|' || pg_temp.jcol(pg_temp.jid(46), 'status') || '|'
          || pg_temp.jcol(pg_temp.jid(46), 'cost_micro'),
          'done|0|false|done|2000', 'a series edited mid-job: no flag, no marker, the job done and charged');

select is(pg_temp.aud(47), 'claimed', 'book 47 is claimed');
reset role;
update library.books set user_edited_fields = '{seriesName}' where id = pg_temp.book(47);
set local role authenticated;
select pg_temp.as_a();
select is(pg_temp.afin(47, pg_temp.ares('wrong_series', 'Saltglass Archive', 1)) || '|' || pg_temp.nflags(47)
          || '|' || pg_temp.audited(47),
          'done|0|true', 'hand-set mid-job with the series unchanged: no flag, the marker set');

---------------------------------------------------------------------------
-- Invalid results (D7 step 1).
---------------------------------------------------------------------------
select is(pg_temp.aud(48), 'claimed', 'book 48 is claimed');
select throws_ok($$select pg_temp.afin(48, pg_temp.ares('maybe', null, null))$$, '22023', 'invalid_result',
                 'a verdict of maybe: invalid_result');
select throws_ok($$select pg_temp.afin(48, jsonb_set(pg_temp.ares('wrong_series', null, 2), '{audit,name}', '5'))$$,
                 '22023', 'invalid_result', 'a numeric name: invalid_result');
select throws_ok($$select pg_temp.afin(48, pg_temp.ares('agree', null, null) - 'audit')$$, '22023', 'invalid_result',
                 'no audit key: invalid_result');

---------------------------------------------------------------------------
-- Settle at the true cost (D7 step 6, D10).
---------------------------------------------------------------------------
select pg_temp.save('spent49', pg_temp.spent(pg_temp.hh())::text);
select pg_temp.aud(49);
select is(pg_temp.afin(49, pg_temp.ares('agree', null, null), library.series_reserve_micro() + 5000) || '|'
          || pg_temp.jcol(pg_temp.jid(49), 'cost_micro') || '|'
          || (pg_temp.spent(pg_temp.hh()) - pg_temp.val('spent49')::bigint),
          'done|' || (library.series_reserve_micro() + 5000) || '|' || (library.series_reserve_micro() + 5000),
          'an audit settles at its true cost above the reserve');
select pg_temp.aud(50);
select is(pg_temp.afin(50, pg_temp.ares('agree', null, null), 20 * library.series_reserve_micro()) || '|'
          || pg_temp.jcol(pg_temp.jid(50), 'cost_micro'),
          'done|' || (10 * library.series_reserve_micro()), 'an audit is capped at 10x its reserve');
select pg_temp.aud(51);
select is(pg_temp.arel(51, 'tag_unreadable', library.series_reserve_micro() + 5000) || '|'
          || pg_temp.jcol(pg_temp.jid(51), 'cost_micro') || '|' || pg_temp.audited(51),
          'failed|' || (library.series_reserve_micro() + 5000) || '|false',
          'a tag_unreadable release charges the true cost and sets no marker');
select pg_temp.aud(52);
select is(pg_temp.arel(52, 'tag_rejected', library.series_reserve_micro() + 5000) || '|'
          || pg_temp.jcol(pg_temp.jid(52), 'cost_micro'),
          'failed|' || library.series_reserve_micro(), 'a tag_rejected release is clamped to the reserve');

---------------------------------------------------------------------------
-- Apply (D8).
---------------------------------------------------------------------------
reset role;
update library.books set user_edited_fields = '{title,seriesName}' where id = pg_temp.book(35);
set local role authenticated;
select pg_temp.as_a();
select is(library.apply_series_audit(pg_temp.fid(35)) || '|' || pg_temp.bk(35) || '|' || pg_temp.fdec(35),
          'applied|Saltglass Archive|2.00|{title,seriesName,seriesVolume}|applied:11111111-1111-1111-1111-111111111111:true',
          'apply wrong_series: the proposal, hand-set without duplicates, the flag applied by A');
select is(pg_temp.au(53, 'wrong_series', 'saltglass archive', 5), 'claimed:done', 'book 53 is flagged');
select is(library.apply_series_audit(pg_temp.fid(53)) || '|' || pg_temp.bk(53),
          'applied|Saltglass Archive|5.00|{seriesName,seriesVolume}', 'apply uses the household''s spelling');
select is(library.apply_series_audit(pg_temp.fid(36)) || '|' || pg_temp.bk(36) || '|' || pg_temp.fdec(36),
          'applied|-|-|{seriesName,seriesVolume}|applied:11111111-1111-1111-1111-111111111111:true',
          'apply a standalone: series and number cleared');
select is(library.apply_series_audit(pg_temp.fid(37)) || '|' || pg_temp.bk(37),
          'applied|Thornmere Cycle|3.00|{seriesName,seriesVolume}', 'apply wrong_number: only the number changes');
select is(pg_temp.au(55, 'wrong_series', 'Ember Loom', 1) || '|' || library.apply_series_audit(pg_temp.fid(55))
          || '|' || pg_temp.bk(55),
          'claimed:done|applied|Ember Loom|1.00|{seriesName,seriesVolume}',
          'apply a series held only by another author: applied');

---------------------------------------------------------------------------
-- Keep and Edit (D8).
---------------------------------------------------------------------------
select is(library.keep_series_audit(pg_temp.fid(38)) || '|' || pg_temp.bk(38) || '|' || pg_temp.fdec(38),
          'kept|Thornmere Cycle|-|{seriesName,seriesVolume}|kept:11111111-1111-1111-1111-111111111111:true',
          'keep: the series unchanged, hand-set, the flag kept');
select is(library.edit_series_audit(pg_temp.fid(39), ' Wrenfold Tales ', 1.5) || '|' || pg_temp.bk(39) || '|'
          || pg_temp.fdec(39),
          'edited|Wrenfold Tales|1.50|{seriesName,seriesVolume}|edited:11111111-1111-1111-1111-111111111111:true',
          'edit: the series as typed, the flag edited');
select is(library.edit_series_audit(pg_temp.fid(40), 'wrenfold tales', 2) || '|' || pg_temp.bk(40),
          'edited|Wrenfold Tales|2.00|{seriesName,seriesVolume}', 'edit uses the household''s spelling');
select is(library.edit_series_audit(pg_temp.fid(42), '   ', 3) || '|' || pg_temp.bk(42),
          'edited|-|-|{seriesName,seriesVolume}', 'edit with a blank name clears the series and the number');
select throws_ok($$select library.edit_series_audit(pg_temp.fid(44), repeat('n', 201), 1)$$, '22023', 'invalid_name',
                 'edit with a 201-character name: invalid_name');
select throws_ok($$select library.edit_series_audit(pg_temp.fid(44), 'Wrenfold Tales', 10000)$$, '22023',
                 'invalid_volume', 'edit with volume 10000: invalid_volume');

---------------------------------------------------------------------------
-- Refusals (D8, Review Focus 2).
---------------------------------------------------------------------------
select is(library.apply_series_audit(pg_temp.fid(35)) || ',' || library.keep_series_audit(pg_temp.fid(35)) || ','
          || library.edit_series_audit(pg_temp.fid(35), 'Wrenfold Tales', 1) || '|' || pg_temp.bk(35),
          'not_pending,not_pending,not_pending|Saltglass Archive|2.00|{title,seriesName,seriesVolume}',
          'every decision on a decided flag: not_pending, the book unchanged');

select is(pg_temp.au(56, 'wrong_series', 'Lantern Vale Cycle', 1) || ',' || pg_temp.au(57, 'wrong_number', null, 1)
          || ',' || pg_temp.au(58, 'wrong_series', 'Lantern Vale Cycle', 1),
          'claimed:done,claimed:done,claimed:done', 'books 56-58 are flagged');
reset role;
alter table library.books disable trigger books_series_audit_reset;
update library.books set series_volume = 7 where id in (pg_temp.book(45), pg_temp.book(56), pg_temp.book(57));
alter table library.books enable trigger books_series_audit_reset;
set local role authenticated;
select pg_temp.as_a();
select is(library.apply_series_audit(pg_temp.fid(45)) || '|' || pg_temp.fdec(45) || '|' || pg_temp.bk(45),
          'stale|stale:-:true|???|7.00|{}', 'apply on a flag whose series changed: stale, the book unchanged');
select is(library.keep_series_audit(pg_temp.fid(56)) || '|' || pg_temp.fdec(56) || '|' || pg_temp.bk(56),
          'stale|stale:-:true|Thornmere Cycle|7.00|{}', 'keep on a flag whose series changed: stale');
select is(library.edit_series_audit(pg_temp.fid(57), 'Wrenfold Tales', 1) || '|' || pg_temp.fdec(57) || '|'
          || pg_temp.bk(57),
          'stale|stale:-:true|Thornmere Cycle|7.00|{}', 'edit on a flag whose series changed: stale');

reset role;
update library.books set series_volume = 8 where id = pg_temp.book(58);
set local role authenticated;
select pg_temp.as_a();
select is(pg_temp.fdec(58) || '|' || library.apply_series_audit(pg_temp.fid(58)) || '|' || pg_temp.bk(58),
          'stale:-:true|not_pending|Thornmere Cycle|8.00|{}', 'a flag the trigger made stale: not_pending');

select pg_temp.as_c();
select throws_ok($$select library.apply_series_audit(pg_temp.fid(44))$$, '42501', 'not_authorized',
                 'C cannot apply H''s flag');
select throws_ok($$select library.keep_series_audit(pg_temp.fid(44))$$, '42501', 'not_authorized',
                 'C cannot keep H''s flag');
select throws_ok($$select library.edit_series_audit(pg_temp.fid(44), 'Wrenfold Tales', 1)$$, '42501',
                 'not_authorized', 'C cannot edit H''s flag');
select pg_temp.as_a();
select throws_ok($$select library.apply_series_audit('fafafafa-9999-0000-0000-000000000000')$$, '42501',
                 'not_authorized', 'an unknown flag: not_authorized');
select is(pg_temp.fl(44), 'wrong_series|Thornmere Cycle|2.00|Thornmere Cycles|2.00|A synthetic why.|pending',
          'the refused calls left flag 44 pending');

---------------------------------------------------------------------------
-- No loop (Review Focus 4).
---------------------------------------------------------------------------
select is(pg_temp.req(array[35, 37], 'audit'), '{skipped,skipped}', 'an applied book is never audited again');

---------------------------------------------------------------------------
-- Undo a dismissal (D9).
---------------------------------------------------------------------------
reset role;
insert into library.series_suggestions (id, household_id, kind, name_key, name, status, decided_by, decided_at)
values ('5a5a5a5a-0000-0000-0000-000000000001', pg_temp.hh(), 'new', 'lantern vale cycle', 'Lantern Vale Cycle',
        'dismissed', '11111111-1111-1111-1111-111111111111', now()),
       ('5a5a5a5a-0000-0000-0000-000000000002', pg_temp.hh(), 'existing', 'ember loom', 'Ember Loom',
        'pending', null, null);
insert into library.series_suggestion_books (suggestion_id, book_id, household_id, volume, why, status, decided_at)
values ('5a5a5a5a-0000-0000-0000-000000000001', pg_temp.book(60), pg_temp.hh(), 1, 'A synthetic why.', 'pending', null),
       ('5a5a5a5a-0000-0000-0000-000000000002', pg_temp.book(61), pg_temp.hh(), 3, 'A synthetic why.', 'dismissed', now()),
       ('5a5a5a5a-0000-0000-0000-000000000002', pg_temp.book(62), pg_temp.hh(), 4, 'A synthetic why.', 'dismissed', now());
create function pg_temp.sg(p uuid) returns text language sql security definer as
$$ select s.status || ':' || coalesce(s.decided_by::text, '-') || ':' || (s.decided_at is not null)
     from library.series_suggestions s where s.id = p $$;
create function pg_temp.sgb(p uuid, n int) returns text language sql security definer as
$$ select sb.status || ':' || (sb.decided_at is not null)
     from library.series_suggestion_books sb where sb.suggestion_id = p and sb.book_id = pg_temp.book(n) $$;
create function pg_temp.njobs() returns int language sql security definer as
$$ select count(*)::int from library.tag_jobs $$;
select pg_temp.save('njobs0', pg_temp.njobs()::text);
select pg_temp.save('usage1', pg_temp.usage(pg_temp.hh()));

set local role authenticated;
select pg_temp.as_b();
select is(library.undo_series_dismissal('5a5a5a5a-0000-0000-0000-000000000001') || '|'
          || pg_temp.sg('5a5a5a5a-0000-0000-0000-000000000001') || '|'
          || pg_temp.sgb('5a5a5a5a-0000-0000-0000-000000000001', 60),
          'restored|pending:-:false|pending:false', 'undo a dismissed new row: pending again, with its books');
select is(library.undo_series_dismissal('5a5a5a5a-0000-0000-0000-000000000001'), 'not_dismissed',
          'undo again: not_dismissed');
select throws_ok($$select library.undo_series_dismissal('5a5a5a5a-0000-0000-0000-000000000002')$$, '22023',
                 'invalid_kind', 'undo_series_dismissal on an existing row: invalid_kind');
select is(library.undo_series_book_dismissal('5a5a5a5a-0000-0000-0000-000000000002', pg_temp.book(61)) || '|'
          || pg_temp.sgb('5a5a5a5a-0000-0000-0000-000000000002', 61),
          'restored|pending:false', 'undo a dismissed book on an existing row: pending again');
reset role;
update library.books set user_edited_fields = '{seriesName}' where id = pg_temp.book(62);
set local role authenticated;
select pg_temp.as_b();
select is(library.undo_series_book_dismissal('5a5a5a5a-0000-0000-0000-000000000002', pg_temp.book(62)) || '|'
          || pg_temp.sgb('5a5a5a5a-0000-0000-0000-000000000002', 62),
          'not_eligible|dismissed:true', 'a dismissed book now hand-set: not_eligible, still dismissed');
select is(library.undo_series_book_dismissal('5a5a5a5a-0000-0000-0000-000000000002', pg_temp.book(61)),
          'not_dismissed', 'undo a book that isn''t dismissed: not_dismissed');
select throws_ok($$select library.undo_series_book_dismissal('5a5a5a5a-0000-0000-0000-000000000001',
                                                            pg_temp.book(60))$$,
                 '22023', 'invalid_kind', 'undo_series_book_dismissal on a new row: invalid_kind');
select pg_temp.as_c();
select throws_ok($$select library.undo_series_dismissal('5a5a5a5a-0000-0000-0000-000000000001')$$, '42501',
                 'not_authorized', 'C cannot undo H''s dismissal');
select throws_ok($$select library.undo_series_book_dismissal('5a5a5a5a-0000-0000-0000-000000000002',
                                                            pg_temp.book(62))$$,
                 '42501', 'not_authorized', 'C cannot undo H''s book dismissal');
select is(pg_temp.njobs() || '|' || pg_temp.usage(pg_temp.hh()), pg_temp.val('njobs0') || '|' || pg_temp.val('usage1'),
          'undo queues no job and spends nothing');

---------------------------------------------------------------------------
-- Grants (part 2).
---------------------------------------------------------------------------
reset role;
select ok(has_function_privilege('authenticated', 'library.apply_series_audit(uuid)', 'execute')
          and has_function_privilege('authenticated', 'library.keep_series_audit(uuid)', 'execute')
          and has_function_privilege('authenticated', 'library.edit_series_audit(uuid, text, numeric)', 'execute')
          and has_function_privilege('authenticated', 'library.undo_series_dismissal(uuid)', 'execute')
          and has_function_privilege('authenticated', 'library.undo_series_book_dismissal(uuid, uuid)', 'execute')
          and not has_function_privilege('anon', 'library.apply_series_audit(uuid)', 'execute')
          and not has_function_privilege('anon', 'library.keep_series_audit(uuid)', 'execute')
          and not has_function_privilege('anon', 'library.edit_series_audit(uuid, text, numeric)', 'execute')
          and not has_function_privilege('anon', 'library.undo_series_dismissal(uuid)', 'execute')
          and not has_function_privilege('anon', 'library.undo_series_book_dismissal(uuid, uuid)', 'execute'),
          'the decision and undo RPCs are granted to authenticated only');

select * from finish();
rollback;
