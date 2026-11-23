-- pgTAP: series audit, part 1 (Plan 12 D2-D4, D7's loose key). Proves the
-- loose series key; that an audit request queues only a carded, tagger-filled
-- book with a series that isn't audited yet (a failed audit may be retried);
-- that an old claim_tag_job meeting an audit job answers 'audit' and changes
-- nothing (Review Focus 5); that claim_audit_job re-checks, reserves and
-- returns the evidence with handSet neighbours; that a series change clears
-- the marker and retires pending flags; and the flags table's RLS, grants and
-- constraints. Series claims keep same_author (now with handSet).
begin;

create extension if not exists pgtap with schema extensions;

select plan(42);

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

select * from finish();
rollback;
