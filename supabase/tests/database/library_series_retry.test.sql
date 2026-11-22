-- pgTAP: series retry (2026-11-22). Proves that a series request queues a
-- book whose newest job is a failed series job, that a newest failed full or
-- new_tags job still skips it, that only the newest job counts, that the
-- other series rules (checked, a series set, seriesName or seriesVolume
-- hand-set) still skip a failed-series book, that run and new_tags requests
-- still skip a failed-series book while the same book without the failure
-- queues, and that manual still takes a failed book.
begin;

create extension if not exists pgtap with schema extensions;

select plan(11);

insert into auth.users (id, email, aud, role)
values ('11111111-1111-1111-1111-111111111111', 'a@library.test', 'authenticated', 'authenticated');

create temporary table test_vals (k text primary key, v text) on commit drop;
grant all on test_vals to authenticated, anon;

create function pg_temp.val(p text) returns text language sql as
$$ select v from test_vals where k = p $$;

create function pg_temp.hh() returns uuid language sql as $$ select pg_temp.val('hh')::uuid $$;

create function pg_temp.book(n int) returns uuid language sql as
$$ select ('ffffffff-0000-0000-0000-' || lpad(n::text, 12, '0'))::uuid $$;

create function pg_temp.job_of(n int) returns uuid language sql security definer as
$$ select j.id from library.tag_jobs j
    where j.book_id = pg_temp.book(n) and j.status in ('queued', 'processing') $$;

create function pg_temp.req(n int[], reason text) returns text language sql as
$$ select array_agg(r.outcome order by r.book_id)::text
     from library.request_tagging(pg_temp.hh(), array(select pg_temp.book(x) from unnest(n) x), reason,
                                  'aaaaaaaa-0000-0000-0000-000000000020'::uuid) r $$;

-- A finished job of a kind for book n; created_at is clock_timestamp, so the
-- last one added is the book's newest job.
create function pg_temp.job(n int, p_kind text, p_status text) returns void language sql as
$$ insert into library.tag_jobs (household_id, book_id, kind, reason, status, error_code)
   values (pg_temp.hh(), pg_temp.book(n), p_kind,
           case p_kind when 'series' then 'series' when 'new_tags' then 'new_tags' else 'manual' end,
           p_status, case when p_status = 'failed' then 'tag_unreadable' end) $$;

create function pg_temp.as_a() returns void language sql as
$$ select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true) $$;

---------------------------------------------------------------------------
-- Household H (A). Books 1-13. Every book's first job is done.
---------------------------------------------------------------------------
set local role authenticated;
select pg_temp.as_a();
insert into test_vals (k, v) select 'hh', library.create_household('Home', 'Member A')::text;

reset role;
set local request.jwt.claims = '{}';
insert into library.books (id, household_id, title, authors, synopsis)
select pg_temp.book(n), pg_temp.hh(), 'Invented Title ' || n, '{Ines Dravenholt}', 'A made-up synopsis ' || n
  from generate_series(1, 13) n;
update library.tag_jobs set status = 'done';

-- A household tag one version above the vocabulary, so a card at version 1
-- is due a new_tags check.
insert into library.library_tags (household_id, id, label, category, added_version)
values (pg_temp.hh(), 'cover-retry-lantern', 'Lantern (mine)', 'cover-motif', library._vocab_version(pg_temp.hh()) + 1);

-- Cards for every book but 9 and 10 (the run books), unchecked.
insert into library.book_cards (book_id, household_id, summary, cover_description, model, vocab_version)
select pg_temp.book(n), pg_temp.hh(), 'A card summary ' || n || '.', 'A grey cover.', 'claude-sonnet-5-5', 1
  from generate_series(1, 13) n where n not in (9, 10);

--  1  newest job a failed series job
--  2  newest job a failed full job
--  3  a failed series job, then a newer failed full job
--  4  a failed full job, then a newer failed series job
--  5  failed series, card already checked
--  6  failed series, a series set
--  7  failed series, seriesVolume hand-set
--  8  failed series (new_tags)        11  no failure (new_tags control)
--  9  failed series, no card (run)    10  no failure, no card (run control)
-- 12  newest job a failed new_tags job
-- 13  failed series, seriesName hand-set
select pg_temp.job(1, 'series', 'failed');
select pg_temp.job(2, 'full', 'failed');
select pg_temp.job(3, 'series', 'failed');
select pg_temp.job(3, 'full', 'failed');
select pg_temp.job(4, 'full', 'failed');
select pg_temp.job(4, 'series', 'failed');
select pg_temp.job(n, 'series', 'failed') from generate_series(5, 9) n;
update library.book_cards set series_checked_at = now() where book_id = pg_temp.book(5);
update library.books set series_name = 'Ember Loom' where id = pg_temp.book(6);
update library.books set user_edited_fields = '{seriesVolume}' where id = pg_temp.book(7);
select pg_temp.job(12, 'new_tags', 'failed');
select pg_temp.job(13, 'series', 'failed');
update library.books set user_edited_fields = '{seriesName}' where id = pg_temp.book(13);

set local role authenticated;
select pg_temp.as_a();

---------------------------------------------------------------------------
-- run and new_tags first, so the series request below finds no open jobs.
---------------------------------------------------------------------------
select is(pg_temp.req(array[9, 10], 'run'), '{skipped,queued}',
          'run: a failed-series book is skipped; the same book without the failure queues');
select is(pg_temp.req(array[8, 11], 'new_tags'), '{skipped,queued}',
          'new_tags: a failed-series book is skipped; the same book without the failure queues');

---------------------------------------------------------------------------
-- series.
---------------------------------------------------------------------------
select is(pg_temp.req(array[1], 'series'), '{queued}',
          'series: a book whose newest job is a failed series job queues');
select is((select j.kind || ':' || j.reason || ':' || j.status || ':' || j.run_id
             from library.tag_jobs j where j.id = pg_temp.job_of(1)),
          'series:series:queued:aaaaaaaa-0000-0000-0000-000000000020',
          'the retry is a queued series job with the run id');
select is(pg_temp.req(array[2], 'series'), '{skipped}',
          'series: a book whose newest job is a failed full job is skipped');
select is(pg_temp.req(array[12], 'series'), '{skipped}',
          'series: a book whose newest job is a failed new_tags job is skipped');
select is(pg_temp.req(array[3, 4], 'series'), '{skipped,queued}',
          'series: only the newest job counts (failed full after series skips; failed series after full queues)');
select is(pg_temp.req(array[5, 6, 7, 13], 'series'), '{skipped,skipped,skipped,skipped}',
          'series: a failed-series book that is checked, has a series or is hand-set is still skipped');
select is(pg_temp.req(array[1], 'series'), '{already_open}',
          'series: the retried book now has an open job');
select is(pg_temp.req(array[8], 'series'), '{queued}',
          'series: the new_tags-skipped failed-series book queues for series');
select is(pg_temp.req(array[2], 'manual'), '{queued}',
          'manual: a failed-full book still queues');

select * from finish();
rollback;
