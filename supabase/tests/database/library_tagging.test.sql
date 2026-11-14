-- pgTAP: library tagging queue, book cards, per-feature AI budgets, tag
-- suggestions and Ask call records (Plan 7 D5-D7, D10). Proves that books
-- queue themselves, that a run skips what it should and never opens a second
-- job for a book, that a call is billed only through a reservation taken
-- before it and refunded to the month it came from, that the first-month and
-- project-wide budgets hold, that the tagger never re-adds a tag removed by
-- hand or removes a hand-added cover tag, that a cover changed mid-job is
-- retagged, and that non-members and anon see and change nothing.
begin;

create extension if not exists pgtap with schema extensions;

select plan(171);

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
create function pg_temp.run() returns uuid language sql as
$$ select 'aaaaaaaa-0000-0000-0000-000000000007'::uuid $$;

-- Book n; books 41 and 42 are in C's household H2, the rest in H.
create function pg_temp.book(n int) returns uuid language sql as
$$ select ('dddddddd-0000-0000-0000-' || lpad(n::text, 12, '0'))::uuid $$;

create function pg_temp.hh_of(n int) returns uuid language sql as
$$ select case when n >= 40 then pg_temp.hh2() else pg_temp.hh() end $$;

create function pg_temp.m() returns date language sql as
$$ select date_trunc('month', now() at time zone 'utc')::date $$;

create function pg_temp.lm() returns date language sql as
$$ select (pg_temp.m() - interval '1 month')::date $$;

-- The book's active job.
create function pg_temp.job_of(n int) returns uuid language sql security definer as
$$ select j.id from library.tag_jobs j
    where j.book_id = pg_temp.book(n) and j.status in ('queued', 'processing') $$;

-- Every job of the book, oldest first, as kind:reason:status.
create function pg_temp.jobs(n int) returns text language sql security definer as
$$ select coalesce(string_agg(j.kind || ':' || j.reason || ':' || j.status, ',' order by j.created_at), '')
     from library.tag_jobs j where j.book_id = pg_temp.book(n) $$;

create function pg_temp.jst(p uuid) returns text language sql security definer as
$$ select j.status || ':' || j.attempts || ':' || coalesce(j.error_code, '')
     from library.tag_jobs j where j.id = p $$;

create function pg_temp.jcost(p uuid) returns int language sql security definer as
$$ select j.cost_micro from library.tag_jobs j where j.id = p $$;

create function pg_temp.ltags(n int) returns text language sql security definer as
$$ select coalesce(string_agg(t.tag_id || ':' || t.added_by, ',' order by t.tag_id), '')
     from library.book_library_tags t where t.book_id = pg_temp.book(n) $$;

create function pg_temp.ttags(n int) returns text language sql security definer as
$$ select coalesce(string_agg(t.tag_id || ':' || t.added_by, ',' order by t.tag_id), '')
     from library.book_tags t where t.book_id = pg_temp.book(n) $$;

create function pg_temp.spent(p_hh uuid, p_feature text, p_month date) returns bigint
language sql security definer as
$$ select coalesce((select u.spent_micro from library.ai_usage u
                     where u.household_id = p_hh and u.feature = p_feature and u.month = p_month), 0) $$;

create function pg_temp.tspent(p_feature text, p_month date) returns bigint language sql security definer as
$$ select coalesce((select t.spent_micro from library.ai_usage_total t
                     where t.feature = p_feature and t.month = p_month), 0) $$;

create function pg_temp.calls(p_hh uuid, p_feature text, p_month date) returns int
language sql security definer as
$$ select coalesce((select u.calls from library.ai_usage u
                     where u.household_id = p_hh and u.feature = p_feature and u.month = p_month), 0) $$;

-- As the current user: claims book n's active job, keeps the job id and the
-- token, returns outcome:attempts.
create function pg_temp.claim(n int) returns text language plpgsql as
$$ declare r record; v_job uuid := coalesce(pg_temp.job_of(n), pg_temp.val('job' || n)::uuid);
   begin
     perform pg_temp.save('job' || n, v_job::text);
     select * into r from library.claim_tag_job(v_job);
     if r.claim_token is not null then
       perform pg_temp.save('tok' || n, r.claim_token::text);
     end if;
     return r.outcome || ':' || r.attempts;
   end $$;

create function pg_temp.jid(n int) returns uuid language sql as $$ select pg_temp.val('job' || n)::uuid $$;
create function pg_temp.tok(n int) returns uuid language sql as $$ select pg_temp.val('tok' || n)::uuid $$;

create function pg_temp.res(tos text[], lib text[], seen boolean, sugg jsonb default '[]') returns jsonb
language sql as
$$ select jsonb_build_object('tos', to_jsonb(tos), 'library', to_jsonb(lib),
                             'summary', 'A courier crosses a dry sea.', 'coverDescription', 'A blue field.',
                             'coverSeen', seen, 'suggestions', sugg) $$;

create function pg_temp.finish(n int, res jsonb, cost int default 1000, usage jsonb default '{}') returns text
language sql as
$$ select library.finish_tag_job(pg_temp.jid(n), pg_temp.tok(n), res, usage, cost, 'claude-sonnet-5-5') $$;

create function pg_temp.release(n int, err text, retry timestamptz, cost int) returns text language sql as
$$ select library.release_tag_job(pg_temp.jid(n), pg_temp.tok(n), err, retry, '{}'::jsonb, cost) $$;

create function pg_temp.req(p_hh uuid, n int[], reason text) returns text language sql as
$$ select array_agg(r.outcome order by r.book_id)::text
     from library.request_tagging(p_hh, array(select pg_temp.book(x) from unnest(n) x), reason, pg_temp.run()) r $$;

create function pg_temp.sugg(p_id text, p_why text) returns jsonb language sql as
$$ select jsonb_build_array(jsonb_build_object('id', p_id, 'label', initcap(replace(p_id, '-', ' ')),
                                               'category', 'setting', 'why', p_why)) $$;

create function pg_temp.sid(p_tag text) returns uuid language sql security definer as
$$ select s.id from library.tag_suggestions s where s.household_id = pg_temp.hh() and s.tag_id = p_tag $$;

---------------------------------------------------------------------------
-- Households: A and B in H, C alone in H2. Books 1-30 in H, 41-42 in H2.
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
insert into library.books (id, household_id, title, authors, synopsis, cover_url)
select pg_temp.book(n), pg_temp.hh_of(n), 'Invented Title ' || n, '{Invented Author}',
       case when n = 21 then repeat('s', 2500) else 'A made-up synopsis ' || n end,
       'https://covers.openlibrary.org/b/id/8' || lpad(n::text, 6, '0') || '-L.jpg'
  from (select generate_series(1, 30) union all select 41 union all select 42) g(n);

---------------------------------------------------------------------------
-- Schema and constants (as postgres).
---------------------------------------------------------------------------
select has_table('library', 'book_cards', 'book_cards exists');
select has_table('library', 'tag_jobs', 'tag_jobs exists');
select has_table('library', 'ai_usage', 'ai_usage exists');
select has_table('library', 'ai_usage_total', 'ai_usage_total exists');
select has_table('library', 'tag_suggestions', 'tag_suggestions exists');
select has_table('library', 'tag_suggestion_books', 'tag_suggestion_books exists');
select has_table('library', 'ask_calls', 'ask_calls exists');

select ok((select bool_and(relrowsecurity) from pg_class
            where oid in ('library.book_cards'::regclass, 'library.tag_jobs'::regclass,
                          'library.ai_usage'::regclass, 'library.ai_usage_total'::regclass,
                          'library.tag_suggestions'::regclass, 'library.tag_suggestion_books'::regclass,
                          'library.ask_calls'::regclass)),
          'RLS is enabled on every new table');

select is(library.tag_reserve_micro(), 69000, 'tag_reserve_micro is 69000 (tagger.ts TAG_RESERVE_MICRO)');
select is(library.ask_max_reserve_micro(), 600000, 'ask_max_reserve_micro is 600000');
select is(library.ai_global_budget_micro('tagging'), 5000000::bigint, 'global tagging budget is 5000000');
select is(library.ai_global_budget_micro('ask'), 2000000::bigint, 'global ask budget is 2000000');

select ok(exists (select 1 from pg_indexes where schemaname = 'library' and tablename = 'tag_jobs'
                     and indexname = 'tag_jobs_active_uq' and indexdef ilike 'create unique index%'),
          'index tag_jobs_active_uq exists and is unique');

---------------------------------------------------------------------------
-- Book triggers (as postgres).
---------------------------------------------------------------------------
select is(pg_temp.jobs(1), 'full:new_book:queued', 'inserting a book queues one full new_book job');

update library.books set synopsis = 'A changed synopsis' where id = pg_temp.book(1);
select is(pg_temp.jobs(1), 'full:new_book:queued', 'a synopsis change while queued keeps the one job');

update library.tag_jobs set kind = 'new_tags', reason = 'new_tags' where book_id = pg_temp.book(2);
update library.books set cover_url = 'https://covers.openlibrary.org/b/id/7000002-L.jpg' where id = pg_temp.book(2);
select is(pg_temp.jobs(2), 'full:new_tags:queued', 'a cover change upgrades a queued new_tags job to full');

update library.tag_jobs set status = 'done' where book_id = pg_temp.book(3);
update library.books set title = 'Invented Title Renamed' where id = pg_temp.book(3);
select is(pg_temp.jobs(3), 'full:new_book:done', 'a title-only change queues nothing');

update library.books set synopsis = 'Another synopsis' where id = pg_temp.book(3);
select is(pg_temp.jobs(3), 'full:new_book:done,full:changed:queued',
          'a synopsis change with no active job queues a full changed job');

---------------------------------------------------------------------------
-- request_tagging. Book 4 has a card, 5 is unhauled, 6's newest job failed,
-- 7 has an active job; 8-30 are done with no card.
---------------------------------------------------------------------------
update library.tag_jobs set status = 'done'
 where book_id in (select pg_temp.book(n) from generate_series(4, 30) n) and book_id <> pg_temp.book(7);
update library.tag_jobs set status = 'failed', error_code = 'tag_refused' where book_id = pg_temp.book(6);
insert into library.book_cards (book_id, household_id, summary, model, vocab_version)
values (pg_temp.book(4), pg_temp.hh(), 'A card summary.', 'claude-sonnet-5-5', 1);
insert into library.copies (book_id, origin, unhauled_at) values (pg_temp.book(5), 'manual', now());

set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

select is(pg_temp.req(pg_temp.hh(), array[4, 5, 6, 7, 8, 9], 'run'),
          '{skipped,skipped,skipped,already_open,queued,queued}',
          'A run: card, unhauled and failed are skipped, an active job is already_open, others queue');

select is((select j.run_id::text || ':' || j.reason || ':' || j.kind || ':' || j.requested_by::text
             from library.tag_jobs j where j.id = pg_temp.job_of(8)),
          pg_temp.run()::text || ':run:full:11111111-1111-1111-1111-111111111111',
          'a run job carries the run id, reason run, kind full and the requester');

set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';
select is(pg_temp.req(pg_temp.hh(), array[8, 9], 'run'), '{already_open,already_open}',
          'B: the same run gives already_open (one active job per book)');
select is((select count(*)::int from library.tag_jobs j
            where j.book_id in (pg_temp.book(8), pg_temp.book(9)) and j.status = 'queued'), 2,
          'still one queued job each for books 8 and 9');

set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
select throws_ok($$ select * from library.request_tagging(pg_temp.hh(),
                      array(select gen_random_uuid() from generate_series(1, 1001)), 'run', pg_temp.run()) $$,
                 '22023', null, 'A: 1001 ids raise 22023');
select throws_ok($$ select * from library.request_tagging(pg_temp.hh(), array[pg_temp.book(10)], 'bogus', null) $$,
                 '22023', null, 'A: an unknown reason raises 22023');
select is(pg_temp.req(pg_temp.hh(), array[41], 'run'), '{not_found}', 'A: C''s book is not_found');
select is(pg_temp.req(pg_temp.hh(), array[6], 'manual'), '{queued}', 'A: manual queues the failed book');
select is(pg_temp.jobs(6), 'full:new_book:failed,full:manual:queued', 'book 6: a full manual job after the failed one');

set local request.jwt.claims = '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}';
select throws_ok($$ select * from library.request_tagging(pg_temp.hh(), array[pg_temp.book(10)], 'run', null) $$,
                 '42501', null, 'C: request_tagging on H is denied');

---------------------------------------------------------------------------
-- Claims and the lease.
---------------------------------------------------------------------------
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
select is(pg_temp.claim(8), 'claimed:1', 'A: claims book 8');
select is(pg_temp.spent(pg_temp.hh(), 'tagging', pg_temp.m()) || ':' || pg_temp.tspent('tagging', pg_temp.m())
          || ':' || pg_temp.calls(pg_temp.hh(), 'tagging', pg_temp.m()),
          '69000:69000:1', 'the claim reserves tag_reserve_micro() on the household and total rows');
select is(pg_temp.claim(8), 'busy:1', 'A: a second claim is busy');
select pg_temp.save('tok8a', pg_temp.tok(8)::text);

reset role;
update library.tag_jobs set claimed_at = now() - interval '8 minutes' where id = pg_temp.jid(8);
set local role authenticated;
set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';
select is(pg_temp.claim(8), 'claimed:2', 'B: a lease 8 minutes old is reclaimable');

set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
select is(library.finish_tag_job(pg_temp.jid(8), pg_temp.val('tok8a')::uuid, pg_temp.res('{fantasy}', '{}', false),
                                 '{}'::jsonb, 0, 'claude-sonnet-5-5'),
          'stale', 'A: the old token finishes stale');
select is(pg_temp.ttags(8), '', 'the stale finish wrote no tags');

---------------------------------------------------------------------------
-- Budgets: the first month and the ceilings.
---------------------------------------------------------------------------
reset role;
delete from library.ai_usage;
delete from library.ai_usage_total;

select is(library.ai_budget_micro(pg_temp.hh(), 'tagging', pg_temp.m()), 5000000::bigint,
          'no tagging usage yet: this month''s tagging budget is 5000000');
insert into library.ai_usage (household_id, feature, month, spent_micro, calls)
values (pg_temp.hh(), 'tagging', pg_temp.lm(), 2000000, 30);
select is(library.ai_budget_micro(pg_temp.hh(), 'tagging', pg_temp.m()), 2000000::bigint,
          'with a usage row last month, this month''s tagging budget is 2000000');
select is(library.ai_budget_micro(pg_temp.hh2(), 'ask', pg_temp.m()), 2000000::bigint,
          'the Ask budget is always 2000000');

insert into library.ai_usage (household_id, feature, month, spent_micro, calls)
values (pg_temp.hh(), 'tagging', pg_temp.m(), 2000000 - 69000 + 1, 1);

set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
select is(pg_temp.claim(9) || '|' || pg_temp.spent(pg_temp.hh(), 'tagging', pg_temp.m()) || '|'
          || pg_temp.tspent('tagging', pg_temp.m()) || '|' || pg_temp.jst(pg_temp.jid(9)),
          'budget:0|1931001|0|queued:0:', 'at budget - reserve + 1 the claim gives budget and nothing changes');

select is((select b.month || ':' || b.spent_micro || ':' || b.budget_micro || ':' || b.reserve_micro || ':'
                  || b.global_spent_micro || ':' || b.global_budget_micro
             from library.ai_budget(pg_temp.hh(), 'tagging') b),
          pg_temp.m() || ':1931001:2000000:69000:0:5000000', 'ai_budget reads the tagging month');
select is((select b.reserve_micro || ':' || b.budget_micro from library.ai_budget(pg_temp.hh(), 'ask') b),
          '0:2000000', 'ai_budget for Ask has no per-call reserve');

reset role;
update library.ai_usage set spent_micro = 0 where household_id = pg_temp.hh() and month = pg_temp.m();
set local role authenticated;
select is(pg_temp.claim(9), 'claimed:1', 'last month''s full row doesn''t block this month');

reset role;
update library.ai_usage_total set spent_micro = 5000000 - 69000 + 1 where feature = 'tagging' and month = pg_temp.m();
set local role authenticated;
set local request.jwt.claims = '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}';
select is(pg_temp.claim(41) || '|' || pg_temp.spent(pg_temp.hh2(), 'tagging', pg_temp.m()),
          'budget:0|0', 'C: the project-wide row blocks H2 as well');

reset role;
delete from library.ai_usage;
delete from library.ai_usage_total;

---------------------------------------------------------------------------
-- Finish. Book 10 has removals for ToS romance and library found-family;
-- old-tag is an inactive household tag.
---------------------------------------------------------------------------
insert into library.tag_removals (book_id, household_id, kind, tag_id)
values (pg_temp.book(10), pg_temp.hh(), 'tos', 'romance'),
       (pg_temp.book(10), pg_temp.hh(), 'library', 'found-family');
insert into library.library_tags (household_id, id, label, category, active, added_version)
values (pg_temp.hh(), 'old-tag', 'Old tag', 'theme', false, 1);

set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
select pg_temp.req(pg_temp.hh(), array[10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20], 'manual');

select is(pg_temp.claim(10), 'claimed:1', 'A: claims book 10');
select is(pg_temp.finish(10, pg_temp.res('{fantasy,romance,audio,Bad-Id}', '{found-family,quest,old-tag,cover-blue}', true),
                         90000, '{"computedCostMicro": 90000}'),
          'done', 'finish: done');
select is(pg_temp.ttags(10), 'fantasy:tagger', 'finish: ToS tag added as tagger; the removal, audio and a bad id skipped');
select is(pg_temp.ltags(10), 'cover-blue:tagger,quest:tagger',
          'finish: library tags added as tagger; the removal and an inactive id skipped');
select is((select c.summary || '|' || c.cover_description || '|' || c.model || '|' || c.vocab_version || '|'
                  || c.cover_url_seen
             from library.book_cards c where c.book_id = pg_temp.book(10)),
          'A courier crosses a dry sea.|A blue field.|claude-sonnet-5-5|1|https://covers.openlibrary.org/b/id/8000010-L.jpg',
          'finish: the card is written');
select is((select j.cost_micro || ':' || (j.usage ->> 'computedCostMicro') || ':' || j.status
             from library.tag_jobs j where j.id = pg_temp.jid(10)),
          '69000:90000:done', 'a cost above the reservation is clamped; computedCostMicro is kept');
select is(pg_temp.spent(pg_temp.hh(), 'tagging', pg_temp.m()) || ':' || pg_temp.tspent('tagging', pg_temp.m()),
          '69000:69000', 'the clamped cost is what stays spent');
select is(pg_temp.claim(10), 'done:1', 'a done job claims done (never re-billed)');

-- Refunds go to reserved_month.
select is(pg_temp.claim(11), 'claimed:1', 'A: claims book 11');
reset role;
update library.tag_jobs set reserved_month = pg_temp.lm() where id = pg_temp.jid(11);
update library.ai_usage set spent_micro = spent_micro - 69000 where feature = 'tagging' and month = pg_temp.m();
update library.ai_usage_total set spent_micro = spent_micro - 69000 where feature = 'tagging' and month = pg_temp.m();
insert into library.ai_usage (household_id, feature, month, spent_micro, calls)
values (pg_temp.hh(), 'tagging', pg_temp.lm(), 69000, 1);
insert into library.ai_usage_total (feature, month, spent_micro, calls) values ('tagging', pg_temp.lm(), 69000, 1);
set local role authenticated;
select is(pg_temp.finish(11, pg_temp.res('{}', '{}', false), 1000), 'done', 'finish book 11');
select is(pg_temp.spent(pg_temp.hh(), 'tagging', pg_temp.lm()) || ':' || pg_temp.tspent('tagging', pg_temp.lm())
          || ':' || pg_temp.spent(pg_temp.hh(), 'tagging', pg_temp.m()),
          '1000:1000:69000', 'the refund goes to the reserved month, not this month');

---------------------------------------------------------------------------
-- Cover replacement (Review Focus 3).
---------------------------------------------------------------------------
reset role;
insert into library.book_library_tags (book_id, household_id, tag_id, added_by)
values (pg_temp.book(12), pg_temp.hh(), 'cover-red', 'tagger'),
       (pg_temp.book(12), pg_temp.hh(), 'cover-moon-stars', 'person'),
       (pg_temp.book(13), pg_temp.hh(), 'cover-red', 'tagger'),
       (pg_temp.book(13), pg_temp.hh(), 'cover-moon-stars', 'person');
insert into library.book_cards (book_id, household_id, summary, cover_description, model, vocab_version, cover_url_seen)
values (pg_temp.book(13), pg_temp.hh(), 'An older summary.', 'Old cover.', 'claude-sonnet-5-5', 1,
        'https://covers.openlibrary.org/b/id/1-L.jpg');

set local role authenticated;
select is(pg_temp.claim(12), 'claimed:1', 'A: claims book 12');
select is(pg_temp.finish(12, pg_temp.res('{}', '{cover-blue}', true)), 'done', 'finish book 12 with a seen cover');
select is(pg_temp.ltags(12), 'cover-blue:tagger,cover-moon-stars:person',
          'the tagger''s old cover tag is replaced; the hand-added one stays');
select is((select count(*)::int from library.tag_removals r where r.book_id = pg_temp.book(12)), 0,
          'replacing its own cover tag records no removal');

delete from library.book_library_tags where book_id = pg_temp.book(12) and tag_id = 'cover-blue';
select is((select count(*)::int from library.tag_removals r
            where r.book_id = pg_temp.book(12) and r.tag_id = 'cover-blue'), 1,
          'a hand removal later in the same transaction is still recorded');

select is(pg_temp.claim(13), 'claimed:1', 'A: claims book 13');
select is(pg_temp.finish(13, pg_temp.res('{}', '{cover-blue}', false)), 'done', 'finish book 13 without a seen cover');
select is(pg_temp.ltags(13), 'cover-moon-stars:person,cover-red:tagger', 'coverSeen false: cover tags unchanged');
select is((select c.cover_description || '|' || c.cover_url_seen || '|' || c.summary
             from library.book_cards c where c.book_id = pg_temp.book(13)),
          'Old cover.|https://covers.openlibrary.org/b/id/1-L.jpg|A courier crosses a dry sea.',
          'coverSeen false: the previous cover description is kept');

---------------------------------------------------------------------------
-- Cover changed mid-job.
---------------------------------------------------------------------------
select is(pg_temp.claim(14), 'claimed:1', 'A: claims book 14');
reset role;
update library.books set cover_url = 'https://covers.openlibrary.org/b/id/7000014-L.jpg' where id = pg_temp.book(14);
select is(pg_temp.jobs(14), 'full:new_book:done,full:manual:processing', 'a cover change leaves the processing job alone');
set local role authenticated;
select is(pg_temp.finish(14, pg_temp.res('{}', '{cover-blue}', true)), 'done', 'finish after the cover changed: done');
select is(pg_temp.jobs(14), 'full:new_book:done,full:manual:done,full:changed:queued',
          'and one new queued full job follows');

---------------------------------------------------------------------------
-- Suggestions.
---------------------------------------------------------------------------
select pg_temp.claim(15);
select pg_temp.finish(15, pg_temp.res('{}', '{}', false, pg_temp.sugg('salt-flats', 'Set on salt flats.')));
select pg_temp.claim(16);
select pg_temp.finish(16, pg_temp.res('{}', '{}', false, pg_temp.sugg('salt-flats', 'A salt desert.')));
select is((select count(*)::int || ':' || min(s.status) from library.tag_suggestions s where s.tag_id = 'salt-flats')
          || ':' || (select count(*) from library.tag_suggestion_books sb where sb.suggestion_id = pg_temp.sid('salt-flats')),
          '1:pending:2', 'a suggestion from two books is one row with two books');

select pg_temp.claim(17);
select pg_temp.finish(17, pg_temp.res('{}', '{}', false, pg_temp.sugg('glass-towers', 'Tall glass towers.')));
select is(library.dismiss_tag_suggestion(pg_temp.sid('glass-towers')), 'dismissed', 'A dismisses glass-towers');
select is(library.dismiss_tag_suggestion(pg_temp.sid('glass-towers')), 'not_pending', 'dismissing again: not_pending');

select pg_temp.claim(18);
select is(pg_temp.finish(18, pg_temp.res('{}', '{}', false,
            pg_temp.sugg('glass-towers', 'Glass towers again.')
            || jsonb_build_array(jsonb_build_object('id', 'quest', 'label', 'Quest', 'category', 'trope', 'why', 'A quest.'),
                                 jsonb_build_object('id', 'Bad Id', 'label', 'Bad', 'category', 'setting', 'why', 'x'),
                                 jsonb_build_object('id', 'odd-one', 'label', 'Odd', 'category', 'nope', 'why', 'x')))),
          'done', 'finish book 18 with four suggestions');
select is((select s.status || ':' || (select count(*) from library.tag_suggestion_books sb where sb.suggestion_id = s.id)
             from library.tag_suggestions s where s.id = pg_temp.sid('glass-towers')),
          'dismissed:1', 'a dismissed suggestion gains nothing when suggested again');
select is(pg_temp.ltags(18), 'quest:tagger', 'a suggestion already in the vocabulary is applied as a tag');
select is((select count(*)::int from library.tag_suggestions s where s.household_id = pg_temp.hh()), 2,
          'a malformed id or category is dropped');

reset role;
insert into library.tag_removals (book_id, household_id, kind, tag_id)
values (pg_temp.book(16), pg_temp.hh(), 'library', 'salt-flats');
set local role authenticated;
set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';
select is(library.approve_tag_suggestion(pg_temp.sid('salt-flats'), 'Salt flats', 'setting'), 1,
          'B approves salt-flats: one book tagged');
select is(library.vocab_version(pg_temp.hh()), 2, 'approval adds the tag at version + 1');
select is(pg_temp.ltags(15) || '|' || pg_temp.ltags(16), 'salt-flats:tagger|',
          'applied as tagger to book 15; skipped on book 16 with its recorded removal');
select is((select s.status || ':' || s.decided_by || ':' || s.label
             from library.tag_suggestions s where s.id = pg_temp.sid('salt-flats')),
          'approved:22222222-2222-2222-2222-222222222222:Salt flats', 'the suggestion is approved by B');
select is(library.approve_tag_suggestion(pg_temp.sid('salt-flats'), 'Salt flats', 'setting'), 0,
          'approving again tags nothing');
select throws_ok($$ select library.approve_tag_suggestion(pg_temp.sid('glass-towers'), 'Glass', 'nope') $$,
                 '22023', null, 'an invalid category raises 22023');

---------------------------------------------------------------------------
-- New tags.
---------------------------------------------------------------------------
reset role;
update library.book_cards set vocab_version = 2 where book_id = pg_temp.book(13);
set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
select is(pg_temp.req(pg_temp.hh(), array[10, 13, 14, 22, 4], 'new_tags'),
          '{queued,queued,skipped,already_open,skipped}',
          'new_tags: carded books below the version queue; current, uncarded and active ones don''t');
select is((select j.kind || ':' || j.reason from library.tag_jobs j where j.id = pg_temp.job_of(10)),
          'new_tags:new_tags', 'the new-tags job has kind and reason new_tags');

select pg_temp.save('job10', pg_temp.job_of(10)::text);
select is((select r.outcome || '|' || r.kind || '|' || r.vocab::text || '|' || r.vocab_version || '|'
                  || (r.card ->> 'summary') || '|' || r.removed::text
             from library.claim_tag_job(pg_temp.job_of(10)) r),
          'claimed|new_tags|[{"id": "salt-flats", "category": "setting"}]|2|A courier crosses a dry sea.|'
          || '{"tos": ["romance"], "library": ["found-family"]}',
          'claiming a new-tags job returns only the new tag, the card and the removals');
reset role;
select pg_temp.save('tok10', (select j.claim_token::text from library.tag_jobs j where j.id = pg_temp.jid(10)));
set local role authenticated;
select is(pg_temp.finish(10, pg_temp.res('{}', '{salt-flats,hopeful}', false)), 'done', 'finish the new-tags job');
select is(pg_temp.ltags(10) || '|' || (select c.vocab_version || ':' || c.summary from library.book_cards c
                                        where c.book_id = pg_temp.book(10)),
          'cover-blue:tagger,quest:tagger,salt-flats:tagger|2:A courier crosses a dry sea.',
          'a new-tags job adds only new tags and moves the card''s version');


---------------------------------------------------------------------------
-- Release.
---------------------------------------------------------------------------
select is(pg_temp.claim(19), 'claimed:1', 'A: claims book 19');
select is(pg_temp.release(19, null, now() + interval '1 minute', 0), 'queued', 'a retry release requeues');
select is(pg_temp.claim(19), 'retry_later:1', 'before retry_at the claim is retry_later');
reset role;
update library.tag_jobs set retry_at = now() - interval '1 second' where id = pg_temp.jid(19);
select pg_temp.save('before19', pg_temp.spent(pg_temp.hh(), 'tagging', pg_temp.m()) || ':'
                                || pg_temp.calls(pg_temp.hh(), 'tagging', pg_temp.m()));
set local role authenticated;
select is(pg_temp.claim(19), 'claimed:2', 'after retry_at the claim succeeds');
select is(pg_temp.release(19, 'billing', null, 5000) || '|' || pg_temp.jst(pg_temp.jid(19)) || '|'
          || pg_temp.spent(pg_temp.hh(), 'tagging', pg_temp.m()) || ':' || pg_temp.calls(pg_temp.hh(), 'tagging', pg_temp.m()),
          'queued|queued:1:|' || pg_temp.val('before19'),
          'billing refunds the attempt and the whole reservation');
select is(pg_temp.claim(19), 'claimed:2', 'claim book 19 again');
select throws_ok($$ select pg_temp.release(19, 'bogus', null, 0) $$, '22023', null, 'an unknown error code raises 22023');
select is(pg_temp.release(19, 'tag_unreadable', null, 3000) || '|' || pg_temp.jst(pg_temp.jid(19)) || '|'
          || pg_temp.jcost(pg_temp.jid(19)),
          'failed|failed:2:tag_unreadable|3000', 'tag_unreadable fails the job at its actual cost');

reset role;
update library.tag_jobs set attempts = 2 where id = pg_temp.job_of(20);
set local role authenticated;
select is(pg_temp.claim(20), 'claimed:3', 'claim book 20 on its third attempt');
select is(pg_temp.release(20, null, now() + interval '1 minute', 0) || '|' || pg_temp.jst(pg_temp.jid(20)),
          'failed|failed:3:tag_unavailable', 'a retry on the third attempt fails tag_unavailable');
select is(pg_temp.req(pg_temp.hh(), array[19, 20], 'run'), '{skipped,skipped}',
          'failed books stay out of runs');

-- Review fixes: a blank summary, and the ToS list unavailable.
select pg_temp.req(pg_temp.hh(), array[23, 24], 'manual');
select is(pg_temp.claim(23), 'claimed:1', 'A: claims book 23');
select throws_ok($$ select pg_temp.finish(23, pg_temp.res('{fantasy}', '{}', false) || '{"summary": "   "}'::jsonb) $$,
                 '22023', null, 'a full job with a blank summary raises 22023 (released as tag_unreadable instead)');
select is(pg_temp.ttags(23) || '|' || (select count(*) from library.book_cards c where c.book_id = pg_temp.book(23))
          || '|' || pg_temp.jst(pg_temp.jid(23)),
          '|0|processing:1:', 'the refused finish wrote nothing');

reset role;
select pg_temp.save('before24', pg_temp.spent(pg_temp.hh(), 'tagging', pg_temp.m()) || ':'
                                || pg_temp.calls(pg_temp.hh(), 'tagging', pg_temp.m()));
set local role authenticated;
select is(pg_temp.claim(24), 'claimed:1', 'A: claims book 24');
select throws_ok($$ select pg_temp.release(24, 'tos_tags_unavailable', null, 0) $$, '22023', null,
                 'tos_tags_unavailable needs a retry_at');
select is(pg_temp.release(24, 'tos_tags_unavailable', now() + interval '1 minute', 5000) || '|'
          || pg_temp.jst(pg_temp.jid(24)) || '|'
          || pg_temp.spent(pg_temp.hh(), 'tagging', pg_temp.m()) || ':' || pg_temp.calls(pg_temp.hh(), 'tagging', pg_temp.m()),
          'queued|queued:0:|' || pg_temp.val('before24'),
          'the ToS list unavailable: queued, the attempt, call and reservation given back');
select is(pg_temp.claim(24), 'retry_later:0', 'and it waits for its retry_at');

---------------------------------------------------------------------------
-- Ask.
---------------------------------------------------------------------------
select throws_ok($$ select * from library.begin_ask(pg_temp.hh(), 600001, 10) $$, '22023', null,
                 'begin_ask over ask_max_reserve_micro() raises 22023');

reset role;
insert into library.ai_usage (household_id, feature, month, spent_micro, calls)
values (pg_temp.hh(), 'ask', pg_temp.m(), 2000000 - 1000 + 1, 3);
set local role authenticated;
select is((select r.outcome || ':' || coalesce(r.call_id::text, 'null') from library.begin_ask(pg_temp.hh(), 1000, 10) r),
          'budget:null', 'begin_ask at the cap answers budget');
reset role;
update library.ai_usage set spent_micro = 0 where household_id = pg_temp.hh() and feature = 'ask';
set local role authenticated;

select pg_temp.save('ask1', (select r.call_id::text from library.begin_ask(pg_temp.hh(), 50000, 3) r));
select is(pg_temp.spent(pg_temp.hh(), 'ask', pg_temp.m()) || ':' || pg_temp.tspent('ask', pg_temp.m()),
          '50000:50000', 'begin_ask reserves on both rows');
select is(library.finish_ask(pg_temp.val('ask1')::uuid, 80000, '{"computedCostMicro": 80000}'::jsonb, 2), 'done',
          'finish_ask: done');
select is(pg_temp.spent(pg_temp.hh(), 'ask', pg_temp.m()) || ':' || pg_temp.tspent('ask', pg_temp.m()),
          '50000:50000', 'an Ask cost above its reservation is clamped');
select is(library.finish_ask(pg_temp.val('ask1')::uuid, 0, null, 0), 'stale', 'finishing twice is stale');

select pg_temp.save('ask2', (select r.call_id::text from library.begin_ask(pg_temp.hh(), 40000, 3) r));
select is(library.release_ask(pg_temp.val('ask2')::uuid, 0, null) || '|'
          || pg_temp.spent(pg_temp.hh(), 'ask', pg_temp.m()) || ':' || pg_temp.calls(pg_temp.hh(), 'ask', pg_temp.m()),
          'released|50000:4', 'release_ask at 0 refunds the reservation and the call');

select is((select string_agg(r.book_id::text || ':' || coalesce(r.summary, '-') || ':'
                             || coalesce(char_length(r.trimmed_description)::text, '-') || ':' || r.library_tags::text,
                             ',' order by r.book_id)
             from library.ask_context(pg_temp.hh(), array[pg_temp.book(21), pg_temp.book(41), pg_temp.book(10)]) r),
          pg_temp.book(10) || ':A courier crosses a dry sea.:-:{cover-blue,quest,salt-flats},'
          || pg_temp.book(21) || ':-:600:{}',
          'ask_context drops C''s book and trims the description only without a card');
select throws_ok($$ select * from library.ask_context(pg_temp.hh(),
                      array(select gen_random_uuid() from generate_series(1, 2001))) $$,
                 '22023', null, 'ask_context with 2001 ids raises 22023');
select throws_ok($$ select * from library.ask_descriptions(pg_temp.hh(),
                      array(select pg_temp.book(n) from generate_series(1, 6) n)) $$,
                 '22023', null, 'ask_descriptions with 6 ids raises 22023');
select is((select string_agg(char_length(r.description)::text, ',' order by r.book_id)
             from library.ask_descriptions(pg_temp.hh(), array[pg_temp.book(21), pg_temp.book(41)]) r),
          '2000', 'ask_descriptions: 2000 characters, the household''s books only');

---------------------------------------------------------------------------
-- Grants as A.
---------------------------------------------------------------------------
select throws_ok($$ select claim_token from library.tag_jobs $$, '42501', null, 'A: selecting claim_token is denied');
select lives_ok(
  $$ select id, household_id, book_id, run_id, kind, reason, status, attempts, claimed_at, retry_at, source_hash,
            cover_at_claim, vocab_version, reserved_micro, reserved_month, cost_micro, usage, error_code,
            requested_by, created_at, updated_at
       from library.tag_jobs $$,
  'A: every other tag_jobs column is selectable');
select lives_ok($$ select * from library.book_cards, library.ai_usage, library.tag_suggestions,
                               library.tag_suggestion_books limit 1 $$,
                'A: book_cards, ai_usage, tag_suggestions and tag_suggestion_books are selectable');
select throws_ok($$ select * from library.ai_usage_total $$, '42501', null, 'A: selecting ai_usage_total is denied');
select throws_ok($$ select * from library.ask_calls $$, '42501', null, 'A: selecting ask_calls is denied');

select throws_ok($$ insert into library.book_cards (book_id, household_id, summary, model, vocab_version)
                    values (pg_temp.book(1), pg_temp.hh(), 'x', 'm', 1) $$, '42501', null,
                 'A: direct insert into book_cards is denied');
select throws_ok($$ update library.book_cards set summary = 'x' $$, '42501', null, 'A: direct update of book_cards is denied');
select throws_ok($$ delete from library.book_cards $$, '42501', null, 'A: direct delete from book_cards is denied');
select throws_ok($$ insert into library.tag_jobs (household_id, book_id, reason) values (pg_temp.hh(), pg_temp.book(1), 'run') $$,
                 '42501', null, 'A: direct insert into tag_jobs is denied');
select throws_ok($$ update library.tag_jobs set status = 'done' $$, '42501', null, 'A: direct update of tag_jobs is denied');
select throws_ok($$ delete from library.tag_jobs $$, '42501', null, 'A: direct delete from tag_jobs is denied');
select throws_ok($$ insert into library.ai_usage (household_id, feature, month) values (pg_temp.hh(), 'ask', pg_temp.lm()) $$,
                 '42501', null, 'A: direct insert into ai_usage is denied');
select throws_ok($$ update library.ai_usage set spent_micro = 0 $$, '42501', null, 'A: direct update of ai_usage is denied');
select throws_ok($$ delete from library.ai_usage $$, '42501', null, 'A: direct delete from ai_usage is denied');
select throws_ok($$ insert into library.ai_usage_total (feature, month) values ('ask', pg_temp.lm()) $$,
                 '42501', null, 'A: direct insert into ai_usage_total is denied');
select throws_ok($$ update library.ai_usage_total set spent_micro = 0 $$, '42501', null,
                 'A: direct update of ai_usage_total is denied');
select throws_ok($$ delete from library.ai_usage_total $$, '42501', null, 'A: direct delete from ai_usage_total is denied');
select throws_ok($$ insert into library.tag_suggestions (household_id, tag_id, label, category)
                    values (pg_temp.hh(), 'x-y', 'X', 'theme') $$, '42501', null,
                 'A: direct insert into tag_suggestions is denied');
select throws_ok($$ update library.tag_suggestions set status = 'pending' $$, '42501', null,
                 'A: direct update of tag_suggestions is denied');
select throws_ok($$ delete from library.tag_suggestions $$, '42501', null, 'A: direct delete from tag_suggestions is denied');
select throws_ok($$ insert into library.tag_suggestion_books (suggestion_id, book_id, household_id, why)
                    values (pg_temp.sid('salt-flats'), pg_temp.book(1), pg_temp.hh(), 'x') $$, '42501', null,
                 'A: direct insert into tag_suggestion_books is denied');
select throws_ok($$ update library.tag_suggestion_books set why = 'x' $$, '42501', null,
                 'A: direct update of tag_suggestion_books is denied');
select throws_ok($$ delete from library.tag_suggestion_books $$, '42501', null,
                 'A: direct delete from tag_suggestion_books is denied');
select throws_ok($$ insert into library.ask_calls (household_id, status) values (pg_temp.hh(), 'reserved') $$,
                 '42501', null, 'A: direct insert into ask_calls is denied');
select throws_ok($$ update library.ask_calls set status = 'done' $$, '42501', null, 'A: direct update of ask_calls is denied');
select throws_ok($$ delete from library.ask_calls $$, '42501', null, 'A: direct delete from ask_calls is denied');

select throws_ok($$ select library._ai_reserve(pg_temp.hh(), 'ask', 1) $$, '42501', null,
                 'A: executing _ai_reserve is denied');
select throws_ok($$ select library._ai_settle(pg_temp.hh(), 'ask', pg_temp.m(), 1, 0, true) $$, '42501', null,
                 'A: executing _ai_settle is denied');
select throws_ok($$ select library._vocab_version(pg_temp.hh()) $$, '42501', null,
                 'A: executing _vocab_version is denied');

---------------------------------------------------------------------------
-- Signed out.
---------------------------------------------------------------------------
reset role;
set local role anon;
set local request.jwt.claims = '{"role":"anon"}';

select throws_ok($$ select * from library.book_cards $$, '42501', null, 'anon: selecting book_cards is denied');
select throws_ok($$ select id from library.tag_jobs $$, '42501', null, 'anon: selecting tag_jobs is denied');
select throws_ok($$ select * from library.ai_usage $$, '42501', null, 'anon: selecting ai_usage is denied');
select throws_ok($$ select * from library.ai_usage_total $$, '42501', null, 'anon: selecting ai_usage_total is denied');
select throws_ok($$ select * from library.tag_suggestions $$, '42501', null, 'anon: selecting tag_suggestions is denied');
select throws_ok($$ select * from library.tag_suggestion_books $$, '42501', null,
                 'anon: selecting tag_suggestion_books is denied');
select throws_ok($$ select * from library.ask_calls $$, '42501', null, 'anon: selecting ask_calls is denied');
select throws_ok($$ select * from library.request_tagging(pg_temp.hh(), array[pg_temp.book(1)], 'run', null) $$,
                 '42501', null, 'anon: executing request_tagging is denied');
select throws_ok($$ select * from library.claim_tag_job(pg_temp.jid(19)) $$, '42501', null,
                 'anon: executing claim_tag_job is denied');
select throws_ok($$ select * from library.ai_budget(pg_temp.hh(), 'tagging') $$, '42501', null,
                 'anon: executing ai_budget is denied');
select throws_ok($$ select * from library.begin_ask(pg_temp.hh(), 1000, 1) $$, '42501', null,
                 'anon: executing begin_ask is denied');
select throws_ok($$ select * from library.ask_context(pg_temp.hh(), array[pg_temp.book(1)]) $$, '42501', null,
                 'anon: executing ask_context is denied');

---------------------------------------------------------------------------
-- Non-members.
---------------------------------------------------------------------------
reset role;
select pg_temp.save('snap', (select string_agg(u.household_id || ':' || u.feature || ':' || u.month || ':'
                                               || u.spent_micro || ':' || u.calls, '|'
                                               order by u.household_id, u.feature, u.month)
                               from library.ai_usage u)
                            || '|' || (select count(*) from library.tag_jobs)
                            || '|' || (select count(*) from library.tag_suggestions where status = 'pending'));
select pg_temp.save('pending', pg_temp.job_of(7)::text);

set local role authenticated;
set local request.jwt.claims = '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}';

select is((select count(*)::int from library.book_cards where household_id = pg_temp.hh()), 0, 'C: sees no cards of H');
select is((select count(*)::int from library.tag_jobs where household_id = pg_temp.hh()), 0, 'C: sees no jobs of H');
select is((select count(*)::int from library.ai_usage where household_id = pg_temp.hh()), 0, 'C: sees no usage of H');
select is((select count(*)::int from library.tag_suggestions where household_id = pg_temp.hh()), 0,
          'C: sees no suggestions of H');
select is((select count(*)::int from library.tag_suggestion_books where household_id = pg_temp.hh()), 0,
          'C: sees no suggestion books of H');

select throws_ok($$ select * from library.claim_tag_job(pg_temp.val('pending')::uuid) $$, '42501', null,
                 'C: claim_tag_job on H''s job is denied');
select throws_ok($$ select library.finish_tag_job(pg_temp.jid(19), pg_temp.tok(19), '{}'::jsonb, '{}'::jsonb, 0, 'm') $$,
                 '42501', null, 'C: finish_tag_job on H''s job is denied');
select throws_ok($$ select library.release_tag_job(pg_temp.jid(19), pg_temp.tok(19), 'billing', null, null, 0) $$,
                 '42501', null, 'C: release_tag_job on H''s job is denied');
select throws_ok($$ select library.approve_tag_suggestion(pg_temp.sid('glass-towers'), 'Glass', 'setting') $$,
                 '42501', null, 'C: approve_tag_suggestion on H''s suggestion is denied');
select throws_ok($$ select library.dismiss_tag_suggestion(pg_temp.sid('salt-flats')) $$,
                 '42501', null, 'C: dismiss_tag_suggestion on H''s suggestion is denied');
select throws_ok($$ select * from library.ai_budget(pg_temp.hh(), 'tagging') $$, '42501', null,
                 'C: ai_budget of H is denied');
select throws_ok($$ select * from library.begin_ask(pg_temp.hh(), 1000, 1) $$, '42501', null,
                 'C: begin_ask on H is denied');
select throws_ok($$ select library.finish_ask(pg_temp.val('ask1')::uuid, 0, null, 0) $$, '42501', null,
                 'C: finish_ask on H''s call is denied');
select throws_ok($$ select * from library.ask_context(pg_temp.hh(), array[pg_temp.book(1)]) $$, '42501', null,
                 'C: ask_context on H is denied');
select throws_ok($$ select * from library.ask_descriptions(pg_temp.hh(), array[pg_temp.book(1)]) $$, '42501', null,
                 'C: ask_descriptions on H is denied');
select throws_ok($$ select * from library.claim_tag_job(gen_random_uuid()) $$, '42501', null,
                 'C: a missing job id raises the same 42501');

reset role;
select is((select string_agg(u.household_id || ':' || u.feature || ':' || u.month || ':'
                             || u.spent_micro || ':' || u.calls, '|'
                                               order by u.household_id, u.feature, u.month)
             from library.ai_usage u)
          || '|' || (select count(*) from library.tag_jobs)
          || '|' || (select count(*) from library.tag_suggestions where status = 'pending'),
          pg_temp.val('snap'), 'C changed no usage, job or suggestion');

select * from finish();
rollback;
