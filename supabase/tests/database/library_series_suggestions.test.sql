-- pgTAP: series suggestions (Plan 10 D2-D9). Proves that a series the
-- household already has is filled in under the household's spelling, that a
-- new name waits as a suggestion and reaches a book only on approval, that a
-- series set or cleared by hand is never overwritten, that approving under an
-- existing name folds the suggestion into it, that the series backfill takes
-- only books that qualify and bills the smaller series reservation, and that
-- non-members and anon see and change nothing.
begin;

create extension if not exists pgtap with schema extensions;

select plan(78);

insert into auth.users (id, email, aud, role)
values
  ('11111111-1111-1111-1111-111111111111', 'a@library.test', 'authenticated', 'authenticated'),
  ('22222222-2222-2222-2222-222222222222', 'b@library.test', 'authenticated', 'authenticated'),
  ('33333333-3333-3333-3333-333333333333', 'c@library.test', 'authenticated', 'authenticated');

create temporary table test_vals (k text primary key, v text) on commit drop;
grant all on test_vals to authenticated, anon;

---------------------------------------------------------------------------
-- Helpers. Invoker helpers run as the current role; the definer ones read
-- rows whatever the current role can see.
---------------------------------------------------------------------------

create function pg_temp.val(p text) returns text language sql as
$$ select v from test_vals where k = p $$;

create function pg_temp.save(p_k text, p_v text) returns void language sql as
$$ insert into test_vals (k, v) values (p_k, p_v) on conflict (k) do update set v = excluded.v $$;

create function pg_temp.hh() returns uuid language sql as $$ select pg_temp.val('hh')::uuid $$;
create function pg_temp.hh2() returns uuid language sql as $$ select pg_temp.val('hh2')::uuid $$;

-- Book n; books 81 and up are in C's household H2, the rest in H.
create function pg_temp.book(n int) returns uuid language sql as
$$ select ('dddddddd-0000-0000-0000-' || lpad(n::text, 12, '0'))::uuid $$;

create function pg_temp.hh_of(n int) returns uuid language sql as
$$ select case when n >= 80 then pg_temp.hh2() else pg_temp.hh() end $$;

create function pg_temp.m() returns date language sql as
$$ select date_trunc('month', now() at time zone 'utc')::date $$;

create function pg_temp.job_of(n int) returns uuid language sql security definer as
$$ select j.id from library.tag_jobs j
    where j.book_id = pg_temp.book(n) and j.status in ('queued', 'processing') $$;

create function pg_temp.jst(p uuid) returns text language sql security definer as
$$ select j.status || ':' || j.attempts || ':' || coalesce(j.error_code, '') || ':' || j.cost_micro
     from library.tag_jobs j where j.id = p $$;

-- The book's series as name:volume, '-' for null.
create function pg_temp.ser(n int) returns text language sql security definer as
$$ select coalesce(b.series_name, '-') || ':' || coalesce(b.series_volume::text, '-')
     from library.books b where b.id = pg_temp.book(n) $$;

create function pg_temp.marks(n int) returns text language sql security definer as
$$ select b.user_edited_fields::text from library.books b where b.id = pg_temp.book(n) $$;

-- checked | unchecked | nocard.
create function pg_temp.checked(n int) returns text language sql security definer as
$$ select coalesce((select case when c.series_checked_at is null then 'unchecked' else 'checked' end
                      from library.book_cards c where c.book_id = pg_temp.book(n)), 'nocard') $$;

create function pg_temp.spent() returns bigint language sql security definer as
$$ select coalesce((select u.spent_micro from library.ai_usage u
                     where u.household_id = pg_temp.hh() and u.feature = 'tagging' and u.month = pg_temp.m()), 0) $$;

create function pg_temp.ssid(p_key text) returns uuid language sql security definer as
$$ select s.id from library.series_suggestions s where s.household_id = pg_temp.hh() and s.name_key = p_key $$;

-- A suggestion as status|name|approved_as|n:volume:why,... (books by number).
create function pg_temp.sugg(p_key text) returns text language sql security definer as
$$ select s.status || '|' || s.name || '|' || coalesce(s.approved_as, '-') || '|'
          || coalesce((select string_agg(right(sb.book_id::text, 12)::int || ':' || coalesce(sb.volume::text, '-')
                                         || ':' || coalesce(sb.why, '-'), ',' order by sb.book_id)
                         from library.series_suggestion_books sb where sb.suggestion_id = s.id), '')
     from library.series_suggestions s where s.household_id = pg_temp.hh() and s.name_key = p_key $$;

create function pg_temp.nsugg() returns int language sql security definer as
$$ select count(*)::int from library.series_suggestions s where s.household_id = pg_temp.hh() $$;

create function pg_temp.s(p_name text, p_volume numeric, p_why text default 'A synthetic why.') returns jsonb
language sql as
$$ select jsonb_build_object('name', p_name, 'volume', p_volume, 'why', p_why) $$;

-- A full result; p_series null leaves the series key out, 'null'::jsonb sends it as null.
create function pg_temp.fres(p_series jsonb) returns jsonb language sql as
$$ select jsonb_build_object('tos', '[]'::jsonb, 'library', '[]'::jsonb, 'suggestions', '[]'::jsonb,
                             'summary', 'A courier crosses a dry sea.', 'coverDescription', 'A blue field.',
                             'coverSeen', false)
          || case when p_series is null then '{}'::jsonb else jsonb_build_object('series', p_series) end $$;

-- A series-job result, as the tagger sends it.
create function pg_temp.sres(p_series jsonb) returns jsonb language sql as
$$ select jsonb_build_object('tos', '[]'::jsonb, 'library', '[]'::jsonb, 'suggestions', '[]'::jsonb,
                             'summary', null, 'coverDescription', null, 'coverSeen', false, 'series', p_series) $$;

-- As the current user: claims book n's active job, keeps the job id, the
-- token and the claim row, returns outcome:attempts.
create function pg_temp.claim(n int) returns text language plpgsql as
$$ declare r record; v_job uuid := coalesce(pg_temp.job_of(n), pg_temp.val('job' || n)::uuid);
   begin
     perform pg_temp.save('job' || n, v_job::text);
     select * into r from library.claim_tag_job(v_job);
     perform pg_temp.save('row' || n, to_jsonb(r)::text);
     if r.claim_token is not null then
       perform pg_temp.save('tok' || n, r.claim_token::text);
     end if;
     return r.outcome || ':' || r.attempts;
   end $$;

create function pg_temp.jid(n int) returns uuid language sql as $$ select pg_temp.val('job' || n)::uuid $$;
create function pg_temp.tok(n int) returns uuid language sql as $$ select pg_temp.val('tok' || n)::uuid $$;
create function pg_temp.crow(n int) returns jsonb language sql as $$ select pg_temp.val('row' || n)::jsonb $$;

create function pg_temp.finish(n int, res jsonb, cost int default 1000) returns text language sql as
$$ select library.finish_tag_job(pg_temp.jid(n), pg_temp.tok(n), res, '{}'::jsonb, cost, 'claude-sonnet-5-5') $$;

create function pg_temp.req(p_hh uuid, n int[], reason text) returns text language sql as
$$ select array_agg(r.outcome order by r.book_id)::text
     from library.request_tagging(p_hh, array(select pg_temp.book(x) from unnest(n) x), reason,
                                  'aaaaaaaa-0000-0000-0000-000000000010'::uuid) r $$;

-- A full job for book n as the current user: queue (manual), claim, finish.
create function pg_temp.tag(n int, p_series jsonb) returns text language plpgsql as
$$ begin
     perform pg_temp.req(pg_temp.hh_of(n), array[n], 'manual');
     perform pg_temp.claim(n);
     return pg_temp.finish(n, pg_temp.fres(p_series));
   end $$;

create function pg_temp.as_a() returns void language sql as
$$ select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true) $$;
create function pg_temp.as_b() returns void language sql as
$$ select set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true) $$;
create function pg_temp.as_c() returns void language sql as
$$ select set_config('request.jwt.claims', '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}', true) $$;

---------------------------------------------------------------------------
-- Households: A and B in H, C alone in H2. Books 1-60 in H, 81-82 in H2.
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
insert into library.books (id, household_id, title, authors, synopsis, cover_url)
select pg_temp.book(n), pg_temp.hh_of(n), 'Invented Title ' || n, '{Ines Dravenholt}',
       'A made-up synopsis ' || n, 'https://covers.openlibrary.org/b/id/8' || lpad(n::text, 6, '0') || '-L.jpg'
  from (select generate_series(1, 60) union all select 81 union all select 82) g(n);
-- Every new_book job is out of the way; each test queues its own.
update library.tag_jobs set status = 'done';

---------------------------------------------------------------------------
-- Schema and constants (as postgres).
---------------------------------------------------------------------------
select has_table('library', 'series_suggestions', 'series_suggestions exists');
select has_table('library', 'series_suggestion_books', 'series_suggestion_books exists');
select has_column('library', 'book_cards', 'series_checked_at', 'book_cards.series_checked_at exists');
select ok((select bool_and(relrowsecurity) from pg_class
            where oid in ('library.series_suggestions'::regclass, 'library.series_suggestion_books'::regclass)),
          'RLS is enabled on both new tables');
select is(library.series_reserve_micro(), 150000, 'series_reserve_micro is 150000 (tagger.ts SERIES_RESERVE_MICRO)');
select is(library.tag_reserve_micro(), 94000, 'tag_reserve_micro is 94000 (tagger.ts TAG_RESERVE_MICRO)');

---------------------------------------------------------------------------
-- Full jobs: no series key, an existing series, the spelling, the volume.
---------------------------------------------------------------------------
update library.books set series_name = 'Thornmere Cycle', series_volume = 1 where id = pg_temp.book(2);
update library.books set user_edited_fields = '{title}' where id = pg_temp.book(3);

set local role authenticated;
select pg_temp.as_a();

select is(pg_temp.tag(1, null) || '|' || pg_temp.ser(1) || '|' || pg_temp.checked(1), 'done|-:-|unchecked',
          'a full job without a series key leaves the series and series_checked_at alone');

select is(pg_temp.tag(3, '{"name": "  thornmere CYCLE ", "volume": 2, "why": "w"}'::jsonb), 'done',
          'finish book 3 with a differently cased existing series');
select is(pg_temp.ser(3) || '|' || pg_temp.marks(3) || '|' || pg_temp.checked(3),
          'Thornmere Cycle:2.00|{title}|checked',
          'an existing series is applied under the household''s spelling, unmarked, and the book is checked');
select is(pg_temp.nsugg(), 0, 'an existing series makes no suggestion');
select is(pg_temp.job_of(3)::text, null::text, 'a series write queues no tag job');

reset role;
update library.books set series_name = 'Thornmere Cycle' where id in (pg_temp.book(4), pg_temp.book(5));
update library.books set series_name = 'Thornmere cycle' where id = pg_temp.book(6);
select is(library._series_spelling(pg_temp.hh(), 'thornmere cycle'), 'Thornmere Cycle',
          '_series_spelling picks the most-used spelling');
set local role authenticated;
select pg_temp.as_a();

select pg_temp.tag(7, pg_temp.s('Thornmere Cycle', null));
select pg_temp.tag(8, pg_temp.s('Thornmere Cycle', 12000));
select is(pg_temp.ser(7) || '|' || pg_temp.ser(8), 'Thornmere Cycle:-|Thornmere Cycle:-',
          'a null volume, and one of 12000, give a null number with the series still applied');

select pg_temp.tag(22, pg_temp.s('Standalone', 1));
select is(pg_temp.ser(22) || '|' || pg_temp.nsugg() || '|' || pg_temp.checked(22), '-:-|0|checked',
          'a placeholder name is ignored, but the book is checked');

---------------------------------------------------------------------------
-- Hand-set series (Review Focus 1, 2).
---------------------------------------------------------------------------
reset role;
update library.books set user_edited_fields = '{seriesName}' where id = pg_temp.book(9);
update library.books set user_edited_fields = '{seriesVolume}' where id = pg_temp.book(10);
set local role authenticated;
select pg_temp.as_a();

select pg_temp.tag(9, pg_temp.s('Thornmere Cycle', 3));
select pg_temp.tag(10, pg_temp.s('Thornmere Cycle', 3));
select is(pg_temp.ser(9) || '|' || pg_temp.ser(10), '-:-|-:-',
          'a blank book marked seriesName, or only seriesVolume, stays blank');

select pg_temp.req(pg_temp.hh(), array[11], 'manual');
select pg_temp.claim(11);
update library.books set series_name = 'Ember Loom', user_edited_fields = user_edited_fields || '{seriesName}'::text[]
 where id = pg_temp.book(11);
select is(pg_temp.finish(11, pg_temp.fres(pg_temp.s('Thornmere Cycle', 4))) || '|' || pg_temp.ser(11),
          'done|Ember Loom:-', 'a series set by hand during the job is kept at finish');

select pg_temp.tag(12, pg_temp.s('Thornmere Cycle', 5));
update library.books set series_name = null, series_volume = null,
                         user_edited_fields = user_edited_fields || '{seriesName,seriesVolume}'::text[]
 where id = pg_temp.book(12);
select pg_temp.tag(12, pg_temp.s('Thornmere Cycle', 5));
select is(pg_temp.ser(12), '-:-', 'a series the tagger filled, then cleared by hand, is not refilled by a retag');

---------------------------------------------------------------------------
-- New names, dismissed names.
---------------------------------------------------------------------------
select pg_temp.tag(13, pg_temp.s('Saltglass Archive', 1, 'w13'));
select pg_temp.tag(14, pg_temp.s('Saltglass Archive', 2, 'w14'));
select is(pg_temp.sugg('saltglass archive'), 'pending|Saltglass Archive|-|13:1.00:w13,14:2.00:w14',
          'a new name from two books is one pending suggestion with both books, volumes and whys');
select is(pg_temp.ser(13) || '|' || pg_temp.ser(14), '-:-|-:-', 'a new name doesn''t reach the books');

select pg_temp.tag(15, pg_temp.s('SALTGLASS ARCHIVE', 3, 'w15'));
select is(pg_temp.nsugg() || '|' || pg_temp.sugg('saltglass archive'),
          '1|pending|Saltglass Archive|-|13:1.00:w13,14:2.00:w14,15:3.00:w15',
          'the same name in another case joins the same suggestion');

select pg_temp.tag(13, pg_temp.s('Saltglass Archive', 1.5, 'w13b'));
select is(pg_temp.sugg('saltglass archive'),
          'pending|Saltglass Archive|-|13:1.50:w13b,14:2.00:w14,15:3.00:w15',
          'a later check of the same book updates its volume and why');

select pg_temp.tag(16, pg_temp.s('Wrenfold Tales', 1, 'w16'));
select is(library.dismiss_series_suggestion(pg_temp.ssid('wrenfold tales')), 'dismissed', 'A dismisses Wrenfold Tales');
select pg_temp.tag(17, pg_temp.s('Wrenfold Tales', 2, 'w17'));
select is(pg_temp.sugg('wrenfold tales') || '|' || pg_temp.ser(17), 'dismissed|Wrenfold Tales|-|16:1.00:w16|-:-',
          'a dismissed name gains no book and the book stays blank');
select is(library.dismiss_series_suggestion(pg_temp.ssid('wrenfold tales')), 'not_pending',
          'dismissing again: not_pending');

---------------------------------------------------------------------------
-- Approve (as B).
---------------------------------------------------------------------------
select pg_temp.tag(18, pg_temp.s('Saltglass Archive', 7, 'w18'));
update library.books set user_edited_fields = user_edited_fields || '{seriesVolume}'::text[] where id = pg_temp.book(15);

select pg_temp.as_b();
select is(library.approve_series_suggestion(pg_temp.ssid('saltglass archive'), ' Saltglass Archive ',
                                            jsonb_build_object(pg_temp.book(13)::text, 4, pg_temp.book(14)::text, null)),
          3, 'B approves Saltglass Archive: three books filled, the hand-set one skipped');
select is(pg_temp.ser(13) || '|' || pg_temp.ser(14) || '|' || pg_temp.ser(15) || '|' || pg_temp.ser(18),
          'Saltglass Archive:4.00|Saltglass Archive:-|-:-|Saltglass Archive:7.00',
          'given volumes win (null clears), the proposed one fills the rest, the hand-set book is untouched');
select is(pg_temp.marks(13) || '|' || pg_temp.marks(14), '{}|{}', 'approval doesn''t mark the books as hand-edited');
select is((select pg_temp.sugg('saltglass archive') like 'approved|Saltglass Archive|Saltglass Archive|%'
                  and s.decided_by = '22222222-2222-2222-2222-222222222222' and s.decided_at is not null
             from library.series_suggestions s where s.id = pg_temp.ssid('saltglass archive')),
          true, 'the suggestion is approved as the name, decided by B');
select is(library.approve_series_suggestion(pg_temp.ssid('saltglass archive'), 'Saltglass Archive', '{}'::jsonb), 0,
          'a second approve fills nothing');
select is(pg_temp.job_of(13)::text, null::text, 'an approval queues no tag job');

---------------------------------------------------------------------------
-- Fold (Review Focus 4).
---------------------------------------------------------------------------
select pg_temp.as_a();
select pg_temp.tag(19, pg_temp.s('Thornmere Saga', 1, 'w19'));
select is(pg_temp.sugg('thornmere saga'), 'pending|Thornmere Saga|-|19:1.00:w19', 'Thornmere Saga is a new name');
select is(library.approve_series_suggestion(pg_temp.ssid('thornmere saga'), 'thornmere cycle', '{}'::jsonb), 1,
          'approving it as thornmere cycle fills one book');
select is(pg_temp.ser(19) || '|' || pg_temp.sugg('thornmere saga'),
          'Thornmere Cycle:1.00|approved|Thornmere Saga|Thornmere Cycle|19:1.00:w19',
          'the book gets the existing spelling, and approved_as is that spelling');
select pg_temp.save('n_before_20', pg_temp.nsugg()::text);
select pg_temp.tag(20, pg_temp.s('Thornmere Saga', 2, 'w20'));
select is(pg_temp.ser(20) || '|' || pg_temp.nsugg() || '|' || pg_temp.sugg('thornmere saga'),
          'Thornmere Cycle:2.00|' || pg_temp.val('n_before_20') || '|approved|Thornmere Saga|Thornmere Cycle|19:1.00:w19',
          'a later Thornmere Saga is filled as Thornmere Cycle with no new suggestion');

---------------------------------------------------------------------------
-- Approve validation.
---------------------------------------------------------------------------
select pg_temp.tag(21, pg_temp.s('Lantern Vale', 1, 'w21'));
select throws_ok($$ select library.approve_series_suggestion(pg_temp.ssid('lantern vale'), '   ', '{}'::jsonb) $$,
                 '22023', null, 'a blank name raises 22023');
select throws_ok($$ select library.approve_series_suggestion(pg_temp.ssid('lantern vale'), repeat('x', 201), '{}'::jsonb) $$,
                 '22023', null, 'a 201-character name raises 22023');
select throws_ok($$ select library.approve_series_suggestion(pg_temp.ssid('lantern vale'), 'Lantern Vale',
                                                             jsonb_build_object(pg_temp.book(21)::text, -1)) $$,
                 '22023', null, 'a volume of -1 raises 22023');
select throws_ok($$ select library.approve_series_suggestion(pg_temp.ssid('lantern vale'), 'Lantern Vale', '[]'::jsonb) $$,
                 '22023', null, 'a p_volumes array raises 22023');
select throws_ok($$ select library.approve_series_suggestion(pg_temp.ssid('lantern vale'), 'Lantern Vale',
                                                             jsonb_build_object(pg_temp.book(21)::text, 'two')) $$,
                 '22023', null, 'a volume that isn''t a number raises 22023');
select is(pg_temp.sugg('lantern vale') || '|' || pg_temp.ser(21), 'pending|Lantern Vale|-|21:1.00:w21|-:-',
          'the refused approvals changed nothing');

select pg_temp.as_c();
select throws_ok($$ select library.approve_series_suggestion(pg_temp.ssid('lantern vale'), 'Lantern Vale', '{}'::jsonb) $$,
                 '42501', null, 'C: approving H''s suggestion is denied');
select throws_ok($$ select library.dismiss_series_suggestion(pg_temp.ssid('lantern vale')) $$,
                 '42501', null, 'C: dismissing H''s suggestion is denied');
select throws_ok($$ select library.approve_series_suggestion(gen_random_uuid(), 'Lantern Vale', '{}'::jsonb) $$,
                 '42501', null, 'C: a missing suggestion raises the same 42501');

---------------------------------------------------------------------------
-- The backfill: request_tagging with reason series. Books 31-39 have cards.
-- 32 has none; 33 has a series; 34 is hand-set; 35 is checked; 36's newest
-- job failed; 37 has an open job.
---------------------------------------------------------------------------
reset role;
insert into library.book_cards (book_id, household_id, summary, cover_description, model, vocab_version)
select pg_temp.book(n), pg_temp.hh(), 'A card summary ' || n || '.', 'A grey cover.', 'claude-sonnet-5-5', 1
  from generate_series(31, 43) n where n <> 32;
update library.books set series_name = 'Ember Loom' where id = pg_temp.book(33);
update library.books set user_edited_fields = '{seriesName}' where id = pg_temp.book(34);
update library.book_cards set series_checked_at = now() where book_id = pg_temp.book(35);
update library.tag_jobs set status = 'failed', error_code = 'tag_refused' where book_id = pg_temp.book(36);
insert into library.tag_jobs (household_id, book_id, kind, reason) values (pg_temp.hh(), pg_temp.book(37), 'full', 'manual');

set local role authenticated;
select pg_temp.as_a();
select is(pg_temp.req(pg_temp.hh(), array[31, 32, 33, 34, 35, 36, 37], 'series'),
          '{queued,skipped,skipped,skipped,skipped,skipped,already_open}',
          'series: only the carded, blank, unmarked, unchecked book queues');
select is((select j.kind || ':' || j.reason || ':' || j.run_id from library.tag_jobs j where j.id = pg_temp.job_of(31)),
          'series:series:aaaaaaaa-0000-0000-0000-000000000010', 'the job has kind and reason series and the run id');
select pg_temp.as_b();
select is(pg_temp.req(pg_temp.hh(), array[31], 'series'), '{already_open}', 'B: the same book gives already_open');
select is(pg_temp.req(pg_temp.hh(), array[12], 'series'), '{skipped}',
          'a series cleared by hand is never taken by the backfill');
select pg_temp.as_a();

---------------------------------------------------------------------------
-- Series claims.
---------------------------------------------------------------------------
select pg_temp.save('spent31', pg_temp.spent()::text);
select is(pg_temp.claim(31), 'claimed:1', 'A: claims book 31''s series job');
select is(pg_temp.spent() - pg_temp.val('spent31')::bigint, library.series_reserve_micro()::bigint,
          'a series claim reserves series_reserve_micro()');
select is((pg_temp.crow(31) ->> 'kind') || '|' || (pg_temp.crow(31) -> 'card' ->> 'summary') || '|'
          || (pg_temp.crow(31) -> 'series_names')::text,
          'series|A card summary 31.|["Thornmere Cycle", "Saltglass Archive", "Ember Loom"]',
          'the claim returns kind series, the card and the household series names in D4 order');

select pg_temp.req(pg_temp.hh(), array[38], 'series');
reset role;
update library.books set series_name = 'Ember Loom' where id = pg_temp.book(38);
set local role authenticated;
select pg_temp.save('spent38', pg_temp.spent()::text);
select is(pg_temp.claim(38) || '|' || pg_temp.jst(pg_temp.jid(38)) || '|'
          || (pg_temp.spent() - pg_temp.val('spent38')::bigint),
          'done:0|done:0::0|0', 'a book given a series after queueing: the claim answers done, cost 0, nothing reserved');

---------------------------------------------------------------------------
-- Series finishes.
---------------------------------------------------------------------------
select is(pg_temp.finish(31, pg_temp.sres(null), 90000), 'done', 'finish book 31 with series null');
select is(pg_temp.checked(31) || '|' || pg_temp.ser(31) || '|'
          || (select c.summary || ':' || c.cover_description from library.book_cards c where c.book_id = pg_temp.book(31))
          || '|' || (select count(*) from library.book_tags t where t.book_id = pg_temp.book(31))
          || '|' || (select count(*) from library.book_library_tags t where t.book_id = pg_temp.book(31)),
          'checked|-:-|A card summary 31.:A grey cover.|0|0',
          'a series finish marks the card checked and changes no tags or card text');
select is(pg_temp.jst(pg_temp.jid(31)), 'done:1::90000',
          'a series job''s cost is its true cost (Plan 11 D10)');

select pg_temp.req(pg_temp.hh(), array[39], 'series');
select pg_temp.claim(39);
select is(pg_temp.finish(39, pg_temp.sres(pg_temp.s('Lantern Vale', 2, 'w39'))) || '|' || pg_temp.ser(39) || '|'
          || pg_temp.sugg('lantern vale'),
          'done|-:-|pending|Lantern Vale|-|21:1.00:w21,39:2.00:w39',
          'a series job with a new name adds the book to the suggestion');
select is(pg_temp.req(pg_temp.hh(), array[31, 39], 'series'), '{skipped,skipped}',
          'a checked book is skipped by the next series request');

---------------------------------------------------------------------------
-- Full and new_tags claims.
---------------------------------------------------------------------------
select pg_temp.req(pg_temp.hh(), array[41], 'manual');
select pg_temp.save('spent41', pg_temp.spent()::text);
select is(pg_temp.claim(41), 'claimed:1', 'A: claims book 41''s full job');
select is(pg_temp.spent() - pg_temp.val('spent41')::bigint, library.tag_reserve_micro()::bigint,
          'a full claim reserves tag_reserve_micro()');
reset role;
select is(pg_temp.crow(41) -> 'series_names', library._household_series_names(pg_temp.hh()),
          'a full claim returns the household series names');
insert into library.tag_jobs (household_id, book_id, kind, reason) values (pg_temp.hh(), pg_temp.book(42), 'new_tags', 'new_tags');
set local role authenticated;
select is(pg_temp.claim(42) || '|' || (pg_temp.crow(42) ->> 'kind') || '|' || (pg_temp.crow(42) -> 'series_names')::text,
          'claimed:1|new_tags|[]', 'a new_tags claim returns no series names');

reset role;
insert into library.books (household_id, title, authors, series_name)
select pg_temp.hh2(), 'Invented Title C' || n, '{Petra Wynnecombe}', 'Lantern Vale Part ' || n
  from generate_series(1, 301) n;
select is(jsonb_array_length(library._household_series_names(pg_temp.hh2())), 300,
          '_household_series_names caps at 300 names');

---------------------------------------------------------------------------
-- A series job is upgraded to full by a synopsis change.
---------------------------------------------------------------------------
set local role authenticated;
select pg_temp.as_a();
select pg_temp.req(pg_temp.hh(), array[43], 'series');
update library.books set synopsis = 'A rewritten synopsis 43' where id = pg_temp.book(43);
select is((select j.kind || ':' || j.reason || ':' || j.status from library.tag_jobs j where j.id = pg_temp.job_of(43)),
          'full:series:queued', 'a synopsis change upgrades a queued series job to full');

---------------------------------------------------------------------------
-- Grants and RLS.
---------------------------------------------------------------------------
-- H has four suggestions (Saltglass Archive, Wrenfold Tales, Thornmere Saga,
-- Lantern Vale) behind eight book rows.
select is((select count(*)::int from library.series_suggestions) || ':'
          || (select count(*)::int from library.series_suggestion_books), '4:8',
          'A sees H''s suggestions and suggestion books');
select pg_temp.as_b();
select is((select count(*)::int from library.series_suggestions) || ':'
          || (select count(*)::int from library.series_suggestion_books), '4:8',
          'B sees H''s suggestions and suggestion books');

select pg_temp.as_a();
select throws_ok($$ insert into library.series_suggestions (household_id, name_key, name)
                    values (pg_temp.hh(), 'ember loom', 'Ember Loom') $$, '42501', null,
                 'A: direct insert into series_suggestions is denied');
select throws_ok($$ update library.series_suggestions set status = 'pending' $$, '42501', null,
                 'A: direct update of series_suggestions is denied');
select throws_ok($$ delete from library.series_suggestions $$, '42501', null,
                 'A: direct delete from series_suggestions is denied');
select throws_ok($$ insert into library.series_suggestion_books (suggestion_id, book_id, household_id)
                    values (pg_temp.ssid('lantern vale'), pg_temp.book(1), pg_temp.hh()) $$, '42501', null,
                 'A: direct insert into series_suggestion_books is denied');
select throws_ok($$ update library.series_suggestion_books set why = 'x' $$, '42501', null,
                 'A: direct update of series_suggestion_books is denied');
select throws_ok($$ delete from library.series_suggestion_books $$, '42501', null,
                 'A: direct delete from series_suggestion_books is denied');

select throws_ok($$ select library._apply_series(pg_temp.hh(), pg_temp.book(1), pg_temp.s('Ember Loom', 1)) $$,
                 '42501', null, 'A: executing _apply_series is denied');
select throws_ok($$ select library._series_spelling(pg_temp.hh(), 'ember loom') $$, '42501', null,
                 'A: executing _series_spelling is denied');
select throws_ok($$ select library._household_series_names(pg_temp.hh()) $$, '42501', null,
                 'A: executing _household_series_names is denied');

select pg_temp.as_c();
select is((select count(*)::int from library.series_suggestions) || ':'
          || (select count(*)::int from library.series_suggestion_books), '0:0',
          'C sees no suggestions or suggestion books');

reset role;
set local role anon;
set local request.jwt.claims = '{"role":"anon"}';
select throws_ok($$ select * from library.series_suggestions $$, '42501', null,
                 'anon: selecting series_suggestions is denied');
select throws_ok($$ select * from library.series_suggestion_books $$, '42501', null,
                 'anon: selecting series_suggestion_books is denied');
select throws_ok($$ select library.approve_series_suggestion(gen_random_uuid(), 'x', '{}'::jsonb) $$, '42501', null,
                 'anon: executing approve_series_suggestion is denied');
select throws_ok($$ select library.series_reserve_micro() $$, '42501', null,
                 'anon: executing series_reserve_micro is denied');

select * from finish();
rollback;
