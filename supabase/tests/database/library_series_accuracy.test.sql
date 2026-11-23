-- pgTAP: series accuracy (Plan 11 D2-D5). Proves that an existing series is
-- filled in only when one of the book's authors already has a book in it (the
-- same author written two ways, or one author of several, counts), that any
-- other book becomes a per-book "existing" suggestion for that series, that an
-- approved alias follows the same rule, that dismissing an existing-series
-- suggestion dismisses those books only, and that approve fills only books
-- still pending, blank and not hand-set. Part 2 (D6, D9-D11): the claim's
-- same-author books and ISBNs; an unsure full job queues one series check
-- that can't loop; series jobs record their true cost under a 10x guard;
-- ai_budget holds the larger reserve; the one-time re-check clears only
-- the markers D11 selects; and the all-blank re-check clears every blank,
-- unheld book's marker.
begin;

create extension if not exists pgtap with schema extensions;

select plan(111);

insert into auth.users (id, email, aud, role)
values
  ('11111111-1111-1111-1111-111111111111', 'a@library.test', 'authenticated', 'authenticated'),
  ('22222222-2222-2222-2222-222222222222', 'b@library.test', 'authenticated', 'authenticated'),
  ('33333333-3333-3333-3333-333333333333', 'c@library.test', 'authenticated', 'authenticated');

create temporary table test_vals (k text primary key, v text) on commit drop;
grant all on test_vals to authenticated, anon;

---------------------------------------------------------------------------
-- Helpers (as library_series_suggestions.test.sql).
---------------------------------------------------------------------------

create function pg_temp.val(p text) returns text language sql as
$$ select v from test_vals where k = p $$;

create function pg_temp.save(p_k text, p_v text) returns void language sql as
$$ insert into test_vals (k, v) values (p_k, p_v) on conflict (k) do update set v = excluded.v $$;

create function pg_temp.hh() returns uuid language sql as $$ select pg_temp.val('hh')::uuid $$;
create function pg_temp.hh2() returns uuid language sql as $$ select pg_temp.val('hh2')::uuid $$;

-- Book n; books 81 and up are in C's household H2, the rest in H.
create function pg_temp.book(n int) returns uuid language sql as
$$ select ('eeeeeeee-0000-0000-0000-' || lpad(n::text, 12, '0'))::uuid $$;

create function pg_temp.hh_of(n int) returns uuid language sql as
$$ select case when n >= 80 then pg_temp.hh2() else pg_temp.hh() end $$;

create function pg_temp.job_of(n int) returns uuid language sql security definer as
$$ select j.id from library.tag_jobs j
    where j.book_id = pg_temp.book(n) and j.status in ('queued', 'processing') $$;

-- The book's series as name:volume, '-' for null.
create function pg_temp.ser(n int) returns text language sql security definer as
$$ select coalesce(b.series_name, '-') || ':' || coalesce(b.series_volume::text, '-')
     from library.books b where b.id = pg_temp.book(n) $$;

create function pg_temp.ssid(p_kind text, p_key text) returns uuid language sql security definer as
$$ select s.id from library.series_suggestions s
    where s.household_id = pg_temp.hh() and s.kind = p_kind and s.name_key = p_key $$;

-- How many rows of a kind H has for a key.
create function pg_temp.nrows(p_kind text, p_key text) returns int language sql security definer as
$$ select count(*)::int from library.series_suggestions s
    where s.household_id = pg_temp.hh() and s.kind = p_kind and s.name_key = p_key $$;

-- A suggestion as status|name|approved_as|n:volume:why:book status,... (books by number).
create function pg_temp.sugg(p_kind text, p_key text) returns text language sql security definer as
$$ select s.status || '|' || s.name || '|' || coalesce(s.approved_as, '-') || '|'
          || coalesce((select string_agg(right(sb.book_id::text, 12)::int || ':' || coalesce(sb.volume::text, '-')
                                         || ':' || coalesce(sb.why, '-') || ':' || sb.status, ',' order by sb.book_id)
                         from library.series_suggestion_books sb where sb.suggestion_id = s.id), '')
     from library.series_suggestions s
    where s.household_id = pg_temp.hh() and s.kind = p_kind and s.name_key = p_key $$;

-- Whether every decided book on a suggestion has decided_at, and no pending one does.
create function pg_temp.decided_ok(p_sid uuid) returns boolean language sql security definer as
$$ select coalesce(bool_and((sb.status = 'pending') = (sb.decided_at is null)), true)
     from library.series_suggestion_books sb where sb.suggestion_id = p_sid $$;

create function pg_temp.s(p_name text, p_volume numeric, p_why text default 'A synthetic why.') returns jsonb
language sql as
$$ select jsonb_build_object('name', p_name, 'volume', p_volume, 'why', p_why) $$;

create function pg_temp.fres(p_series jsonb) returns jsonb language sql as
$$ select jsonb_build_object('tos', '[]'::jsonb, 'library', '[]'::jsonb, 'suggestions', '[]'::jsonb,
                             'summary', 'A courier crosses a dry sea.', 'coverDescription', 'A blue field.',
                             'coverSeen', false, 'series', p_series) $$;

-- A full job for book n as the current user: queue (manual), claim, finish.
create function pg_temp.tag(n int, p_series jsonb) returns text language plpgsql as
$$ declare r record;
   begin
     perform library.request_tagging(pg_temp.hh_of(n), array[pg_temp.book(n)], 'manual', null);
     select * into r from library.claim_tag_job(pg_temp.job_of(n));
     return library.finish_tag_job(pg_temp.job_of(n), r.claim_token, pg_temp.fres(p_series), '{}'::jsonb, 1000,
                                   'claude-sonnet-5-5');
   end $$;

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
insert into library.books (id, household_id, title, authors, synopsis)
select pg_temp.book(n), pg_temp.hh_of(n), 'Invented Title ' || n, '{Ines Dravenholt}', 'A made-up synopsis ' || n
  from (select generate_series(1, 30) union all select 81) g(n);
update library.tag_jobs set status = 'done';

-- Authors and the series already on the shelf.
update library.books set authors = '{T. J. Holt}', series_name = 'Lantern Vale Cycle', series_volume = 1
 where id = pg_temp.book(1);
update library.books set authors = '{Tj Holt}' where id = pg_temp.book(2);
update library.books set authors = '{Emile Varro}', series_name = 'Ember Loom', series_volume = 1
 where id = pg_temp.book(3);
update library.books set authors = '{Petra Wynnecombe,Émile Varro}' where id = pg_temp.book(4);
update library.books set authors = '{A. Reed}' where id in (pg_temp.book(5), pg_temp.book(9), pg_temp.book(14), pg_temp.book(23), pg_temp.book(24),
                                                           pg_temp.book(15));
update library.books set authors = '{M. Holt}', series_name = 'Saltglass Archive', series_volume = 1
 where id = pg_temp.book(6);
update library.books set authors = '{M. Holt}' where id in (pg_temp.book(8), pg_temp.book(12));
update library.books set authors = '{Petra Wynnecombe}' where id in (pg_temp.book(13), pg_temp.book(25));
update library.books set authors = '{—}', series_name = 'Thornmere Cycle' where id = pg_temp.book(20);
update library.books set authors = '{—}' where id = pg_temp.book(21);
-- Another household's book by A. Reed in Lantern Vale Cycle: never evidence for H.
update library.books set authors = '{A. Reed}', series_name = 'Lantern Vale Cycle' where id = pg_temp.book(81);

---------------------------------------------------------------------------
-- Keys (D2): the same vectors as library-tagger/series.ts AUTHOR_KEY_VECTORS.
---------------------------------------------------------------------------
select is(library._author_key('Tj Holt'), 'tjholt', '_author_key: Tj Holt');
select is(library._author_key('T. J. Holt'), 'tjholt', '_author_key: T. J. Holt');
select is(library._author_key('TJ Holt'), 'tjholt', '_author_key: TJ Holt');
select is(library._author_key(' t.j.  holt '), 'tjholt', '_author_key: spaced t.j. holt');
select is(library._author_key('Émile Varro'), 'emilevarro', '_author_key: Émile Varro');
select is(library._author_key('Emile Varro'), 'emilevarro', '_author_key: Emile Varro');
select is(library._author_key('Ines Dravenholt-Ashe'), 'inesdravenholtashe', '_author_key: Ines Dravenholt-Ashe');
select is(library._author_key('—'), '', '_author_key: a dash is empty');
select is(library._author_key(''), '', '_author_key: empty is empty');
select is(library._author_key(null), '', '_author_key: null is empty');

select is(library._authors_match_series(pg_temp.hh(), pg_temp.book(2), 'lantern vale cycle'), true,
          '_authors_match_series: Tj Holt matches a series held by T. J. Holt');
select is(library._authors_match_series(pg_temp.hh(), pg_temp.book(5), 'lantern vale cycle'), false,
          '_authors_match_series: A. Reed doesn''t, and another household''s A. Reed book doesn''t count');
select is(library._authors_match_series(pg_temp.hh(), pg_temp.book(1), 'lantern vale cycle'), false,
          '_authors_match_series: the book itself is not evidence');
select is(library._authors_match_series(pg_temp.hh(), pg_temp.book(21), 'thornmere cycle'), false,
          '_authors_match_series: an empty author key never matches');

set local role authenticated;
select pg_temp.as_a();
select throws_ok($$ select library._author_key('Tj Holt') $$, '42501', null,
                 'A: executing _author_key is denied');
select throws_ok($$ select library._authors_match_series(pg_temp.hh(), pg_temp.book(2), 'lantern vale cycle') $$,
                 '42501', null, 'A: executing _authors_match_series is denied');
select throws_ok($$ select library._suggest_existing(pg_temp.hh(), pg_temp.book(2), 'Ember Loom', 1, 'w') $$,
                 '42501', null, 'A: executing _suggest_existing is denied');
select throws_ok($$ select library._fill_existing(pg_temp.hh(), pg_temp.book(2), 'Ember Loom', 1) $$,
                 '42501', null, 'A: executing _fill_existing is denied');

---------------------------------------------------------------------------
-- Author match fills (Review Focus 1).
---------------------------------------------------------------------------
select is(pg_temp.tag(2, pg_temp.s('lantern vale cycle', 2)) || '|' || pg_temp.ser(2), 'done|Lantern Vale Cycle:2.00',
          'Tj Holt''s book is filled with T. J. Holt''s Lantern Vale Cycle, under the household spelling');
select is(pg_temp.nrows('existing', 'lantern vale cycle') + pg_temp.nrows('new', 'lantern vale cycle'), 0,
          'an author match makes no suggestion row');
select is(pg_temp.tag(4, pg_temp.s('Ember Loom', 2)) || '|' || pg_temp.ser(4), 'done|Ember Loom:2.00',
          'a co-written book by Petra Wynnecombe and Émile Varro fills a series held by Emile Varro');

---------------------------------------------------------------------------
-- Cross-author: a suggestion for the existing series.
---------------------------------------------------------------------------
select is(pg_temp.tag(5, pg_temp.s('Lantern Vale Cycle', 3, 'w5')) || '|' || pg_temp.ser(5), 'done|-:-',
          'A. Reed''s book returning Lantern Vale Cycle stays blank');
select is(pg_temp.sugg('existing', 'lantern vale cycle'), 'pending|Lantern Vale Cycle|-|5:3.00:w5:pending',
          'one existing row named Lantern Vale Cycle holds the book as pending, with volume and why');
select is(pg_temp.nrows('new', 'lantern vale cycle'), 0, 'no new row is created');
select is(pg_temp.tag(21, pg_temp.s('Thornmere Cycle', 1, 'w21')) || '|' || pg_temp.ser(21) || '|'
          || pg_temp.sugg('existing', 'thornmere cycle'),
          'done|-:-|pending|Thornmere Cycle|-|21:1.00:w21:pending',
          'two books with empty author keys don''t match: a suggestion');

---------------------------------------------------------------------------
-- Approve and dismiss, new: filled books are marked approved; an alias.
---------------------------------------------------------------------------
select pg_temp.tag(7, pg_temp.s('Saltglass Archives', 1, 'w7'));
select pg_temp.tag(17, pg_temp.s('Saltglass Archives', 2, 'w17'));
reset role;
update library.books set user_edited_fields = '{seriesVolume}' where id = pg_temp.book(17);
set local role authenticated;
select pg_temp.as_b();
select is(library.approve_series_suggestion(pg_temp.ssid('new', 'saltglass archives'), 'saltglass archive', '{}'::jsonb),
          1, 'B approves Saltglass Archives as saltglass archive: one book filled, the hand-set one skipped');
select is(pg_temp.ser(7) || '|' || pg_temp.sugg('new', 'saltglass archives'),
          'Saltglass Archive:1.00|approved|Saltglass Archives|Saltglass Archive|7:1.00:w7:approved,17:2.00:w17:pending',
          'folded into the household spelling; the filled book is approved, the skipped one stays pending');
select is(pg_temp.decided_ok(pg_temp.ssid('new', 'saltglass archives')), true,
          'the approved book has decided_at, the pending one doesn''t');

---------------------------------------------------------------------------
-- The alias follows the author rule.
---------------------------------------------------------------------------
select pg_temp.as_a();
select is(pg_temp.tag(8, pg_temp.s('Saltglass Archives', 2)) || '|' || pg_temp.ser(8), 'done|Saltglass Archive:2.00',
          'M. Holt''s book returning the alias fills Saltglass Archive');
select is(pg_temp.tag(9, pg_temp.s('Saltglass Archives', 3, 'w9')) || '|' || pg_temp.ser(9) || '|'
          || pg_temp.sugg('existing', 'saltglass archive'),
          'done|-:-|pending|Saltglass Archive|-|9:3.00:w9:pending',
          'A. Reed''s book returning the alias is pending on the existing Saltglass Archive row');

-- An alias whose target no book carries any more.
select pg_temp.tag(10, pg_temp.s('Wrenfold Tale', 1, 'w10'));
select is(library.approve_series_suggestion(pg_temp.ssid('new', 'wrenfold tale'), 'Wrenfold Tales', '{}'::jsonb), 1,
          'Wrenfold Tale approved as Wrenfold Tales fills one book');
reset role;
update library.books set series_name = null, series_volume = null, user_edited_fields = '{seriesName}'
 where id = pg_temp.book(10);
set local role authenticated;
select pg_temp.as_a();
select is(pg_temp.tag(11, pg_temp.s('Wrenfold Tale', 2, 'w11')) || '|' || pg_temp.ser(11) || '|'
          || pg_temp.sugg('existing', 'wrenfold tales'),
          'done|-:-|pending|Wrenfold Tales|-|11:2.00:w11:pending',
          'an alias whose target no book carries: an existing row named by approved_as, the book pending');

---------------------------------------------------------------------------
-- Per-book dismissal.
---------------------------------------------------------------------------
select is(library.dismiss_series_suggestion(pg_temp.ssid('existing', 'saltglass archive')), 'dismissed',
          'A dismisses the existing Saltglass Archive row');
select is(pg_temp.sugg('existing', 'saltglass archive'), 'pending|Saltglass Archive|-|9:3.00:w9:dismissed',
          'its pending book is dismissed, the row stays pending');
select is(pg_temp.decided_ok(pg_temp.ssid('existing', 'saltglass archive')), true, 'the dismissed book has decided_at');
select is(library.dismiss_series_suggestion(pg_temp.ssid('existing', 'saltglass archive')), 'not_pending',
          'dismissing again with no pending books: not_pending');
select is(pg_temp.tag(9, pg_temp.s('Saltglass Archive', 4, 'w9b')) || '|' || pg_temp.ser(9) || '|'
          || pg_temp.sugg('existing', 'saltglass archive'),
          'done|-:-|pending|Saltglass Archive|-|9:3.00:w9:dismissed',
          'a retag of the dismissed book returning the series changes nothing');
select is(pg_temp.tag(12, pg_temp.s('Saltglass Archive', 5)) || '|' || pg_temp.ser(12), 'done|Saltglass Archive:5.00',
          'a new book by M. Holt still fills directly');
select is(pg_temp.tag(13, pg_temp.s('Saltglass Archive', 6, 'w13')) || '|' || pg_temp.ser(13) || '|'
          || pg_temp.nrows('existing', 'saltglass archive') || '|' || pg_temp.sugg('existing', 'saltglass archive'),
          'done|-:-|1|pending|Saltglass Archive|-|9:3.00:w9:dismissed,13:6.00:w13:pending',
          'a new book by Petra Wynnecombe gets a fresh pending row on the same suggestion');

---------------------------------------------------------------------------
-- Approve, existing (Review Focus 4): book 5 dismissed earlier, 14 pending,
-- 15 pending but hand-set meanwhile.
---------------------------------------------------------------------------
select is(library.dismiss_series_suggestion(pg_temp.ssid('existing', 'lantern vale cycle')), 'dismissed',
          'A dismisses Lantern Vale Cycle for book 5');
select pg_temp.tag(14, pg_temp.s('Lantern Vale Cycle', 4, 'w14'));
select pg_temp.tag(15, pg_temp.s('Lantern Vale Cycle', 5, 'w15'));
reset role;
update library.books set user_edited_fields = '{seriesName}' where id = pg_temp.book(15);
set local role authenticated;
select pg_temp.as_b();
select is(library.approve_series_suggestion(pg_temp.ssid('existing', 'lantern vale cycle'), 'Lantern Vale Cycle',
                                            '{}'::jsonb), 1,
          'B approves the existing row: one book filled');
select is(pg_temp.ser(5) || '|' || pg_temp.ser(14) || '|' || pg_temp.ser(15),
          '-:-|Lantern Vale Cycle:4.00|-:-',
          'only the pending, blank, unmarked book is filled');
select is(pg_temp.sugg('existing', 'lantern vale cycle'),
          'pending|Lantern Vale Cycle|-|5:3.00:w5:dismissed,14:4.00:w14:approved,15:5.00:w15:approved',
          'filled and hand-set books are approved, the dismissed one stays dismissed, the row stays pending');
select is((select count(*)::int from library.series_suggestion_books sb
            where sb.suggestion_id = pg_temp.ssid('existing', 'lantern vale cycle') and sb.status = 'pending'), 0,
          'the existing row has no pending books left');
select is(library.approve_series_suggestion(pg_temp.ssid('existing', 'lantern vale cycle'), 'Lantern Vale Cycle',
                                            '{}'::jsonb), 0,
          'a second approve fills nothing');
select is(pg_temp.job_of(14)::text, null::text, 'an approval queues no tag job');

select pg_temp.as_c();
select throws_ok($$ select library.approve_series_suggestion(pg_temp.ssid('existing', 'wrenfold tales'), 'x', '{}'::jsonb) $$,
                 '42501', null, 'C: approving H''s existing row is denied');
select throws_ok($$ select library.dismiss_series_suggestion(pg_temp.ssid('existing', 'wrenfold tales')) $$,
                 '42501', null, 'C: dismissing H''s existing row is denied');

---------------------------------------------------------------------------
-- A per-book dismissal wins over a later author match, on both paths; a
-- direct fill closes the book's pending row.
---------------------------------------------------------------------------
select pg_temp.as_a();
select is(pg_temp.tag(5, pg_temp.s('Lantern Vale Cycle', 3, 'w5c')) || '|' || pg_temp.ser(5) || '|'
          || pg_temp.sugg('existing', 'lantern vale cycle'),
          'done|-:-|pending|Lantern Vale Cycle|-|5:3.00:w5:dismissed,14:4.00:w14:approved,15:5.00:w15:approved',
          'book 5, dismissed, now author-matches A. Reed''s book 14 but stays blank and dismissed');

-- A. Reed's book 23 is put in Saltglass Archive by hand; Petra's book 25 too.
reset role;
update library.books set series_name = 'Saltglass Archive' where id in (pg_temp.book(23), pg_temp.book(25));
set local role authenticated;
select pg_temp.as_a();
select is(pg_temp.tag(9, pg_temp.s('Saltglass Archive', 7, 'w9c')) || '|' || pg_temp.ser(9),
          'done|-:-', 'book 9, dismissed, stays blank when it author-matches through step 3');
select is(pg_temp.tag(9, pg_temp.s('Saltglass Archives', 7, 'w9d')) || '|' || pg_temp.ser(9) || '|'
          || pg_temp.sugg('existing', 'saltglass archive'),
          'done|-:-|pending|Saltglass Archive|-|9:3.00:w9:dismissed,13:6.00:w13:pending',
          'and through the approved alias');
select is(pg_temp.tag(24, pg_temp.s('Saltglass Archives', 8)) || '|' || pg_temp.ser(24), 'done|Saltglass Archive:8.00',
          'another A. Reed book still fills directly');
select is(pg_temp.tag(13, pg_temp.s('Saltglass Archive', 6)) || '|' || pg_temp.ser(13) || '|'
          || pg_temp.sugg('existing', 'saltglass archive') || '|'
          || pg_temp.decided_ok(pg_temp.ssid('existing', 'saltglass archive')),
          'done|Saltglass Archive:6.00|pending|Saltglass Archive|-|9:3.00:w9:dismissed,13:6.00:w13:approved|true',
          'Petra''s pending book 13, now author-matching book 25, fills and its row is approved with decided_at');

---------------------------------------------------------------------------
-- RLS and grants.
---------------------------------------------------------------------------
-- H: new rows Saltglass Archives (7, 17), Wrenfold Tale (10); existing rows
-- Lantern Vale Cycle (5, 14, 15), Thornmere Cycle (21), Saltglass Archive
-- (9, 13; 13 approved by its direct fill), Wrenfold Tales (11).
select pg_temp.as_a();
select is((select string_agg(s.kind || ':' || s.status, ',' order by s.kind, s.name_key)
             from library.series_suggestions s),
          'existing:pending,existing:pending,existing:pending,existing:pending,new:approved,new:approved',
          'A sees H''s rows and their kind');
select pg_temp.as_b();
select is((select string_agg(sb.status, ',' order by sb.status) || ':' || count(*) filter (where sb.decided_at is not null)
             from library.series_suggestion_books sb),
          'approved,approved,approved,approved,approved,dismissed,dismissed,pending,pending,pending:7',
          'B sees the books'' status and decided_at');
select pg_temp.as_c();
select is((select count(*)::int from library.series_suggestions) || ':'
          || (select count(*)::int from library.series_suggestion_books), '0:0', 'C sees no H rows');

select pg_temp.as_a();
select throws_ok($$ update library.series_suggestions set kind = 'existing' $$, '42501', null,
                 'A: direct update of kind is denied');
select throws_ok($$ update library.series_suggestion_books set status = 'approved' $$, '42501', null,
                 'A: direct update of a book status is denied');
select throws_ok($$ insert into library.series_suggestions (household_id, kind, name_key, name)
                    values (pg_temp.hh(), 'existing', 'ember loom', 'Ember Loom') $$, '42501', null,
                 'A: direct insert of an existing row is denied');

---------------------------------------------------------------------------
-- Unique (household, kind, name_key) and the schema (as postgres).
---------------------------------------------------------------------------
reset role;
select lives_ok($$ insert into library.series_suggestions (household_id, kind, name_key, name)
                   values (pg_temp.hh(), 'existing', 'saltglass archives', 'Saltglass Archives') $$,
                'an existing and a new row may share a name_key');
select throws_ok($$ insert into library.series_suggestions (household_id, kind, name_key, name)
                    values (pg_temp.hh(), 'existing', 'lantern vale cycle', 'Lantern Vale Cycle') $$, '23505', null,
                 'two existing rows may not');
select throws_ok($$ insert into library.series_suggestions (household_id, kind, name_key, name)
                    values (pg_temp.hh(), 'other', 'ember loom', 'Ember Loom') $$, '23514', null,
                 'kind is new or existing');
select throws_ok($$ update library.series_suggestion_books set status = 'maybe'
                     where book_id = pg_temp.book(14) $$, '23514', null,
                 'a book status is pending, approved or dismissed');
select throws_ok($$ update library.series_suggestions set status = 'dismissed'
                     where id = pg_temp.ssid('existing', 'wrenfold tales') $$, '23514', null,
                 'an existing row''s own status stays pending');
select is((select string_agg(c.column_default, ',' order by c.column_name)
             from information_schema.columns c
            where (c.table_name, c.column_name) in (('series_suggestions', 'kind'), ('series_suggestion_books', 'status'))
              and c.table_schema = 'library'),
          '''new''::text,''pending''::text', 'Plan 10 rows migrate as kind new with every book pending');

---------------------------------------------------------------------------
-- Part 2 (D6, D9-D11): same-author evidence and ISBNs in the claim, the
-- series status and its one unsure follow-up, true series cost, the budget
-- read and the re-check. Books 31-79 in H, 82-86 in H2 (as postgres).
---------------------------------------------------------------------------
create function pg_temp.m() returns date language sql as
$$ select date_trunc('month', now() at time zone 'utc')::date $$;

create function pg_temp.spent(p_hh uuid) returns bigint language sql security definer as
$$ select coalesce((select u.spent_micro from library.ai_usage u
                     where u.household_id = p_hh and u.feature = 'tagging' and u.month = pg_temp.m()), 0) $$;

-- As the current user: claims book n's active job (or the one kept), keeps the
-- job id, token and claim row, returns outcome:attempts.
create function pg_temp.cl(n int) returns text language plpgsql as
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

create function pg_temp.fin(n int, res jsonb, cost int default 1000) returns text language sql as
$$ select library.finish_tag_job(pg_temp.jid(n), pg_temp.tok(n), res, '{}'::jsonb, cost, 'claude-sonnet-5-5') $$;

create function pg_temp.rel(n int, err text, retry timestamptz, cost int) returns text language sql as
$$ select library.release_tag_job(pg_temp.jid(n), pg_temp.tok(n), err, retry, '{}'::jsonb, cost) $$;

-- A full result: p_series null leaves the series key out ('null'::jsonb sends
-- null); p_status null leaves seriesStatus out (an older tagger).
create function pg_temp.fr(p_series jsonb, p_status text) returns jsonb language sql as
$$ select jsonb_build_object('tos', '[]'::jsonb, 'library', '[]'::jsonb, 'suggestions', '[]'::jsonb,
                             'summary', 'A courier crosses a dry sea.', 'coverDescription', null, 'coverSeen', false)
          || case when p_series is null then '{}'::jsonb else jsonb_build_object('series', p_series) end
          || case when p_status is null then '{}'::jsonb else jsonb_build_object('seriesStatus', p_status) end $$;

-- A series-job result.
create function pg_temp.sr(p_series jsonb, p_status text) returns jsonb language sql as
$$ select jsonb_build_object('tos', '[]'::jsonb, 'library', '[]'::jsonb, 'suggestions', '[]'::jsonb,
                             'summary', null, 'coverDescription', null, 'coverSeen', false, 'series', p_series)
          || case when p_status is null then '{}'::jsonb else jsonb_build_object('seriesStatus', p_status) end $$;

-- A full job for book n as the current user: queue (manual), claim, finish.
create function pg_temp.ftag(n int, res jsonb, cost int default 1000) returns text language plpgsql as
$$ begin
     perform library.request_tagging(pg_temp.hh_of(n), array[pg_temp.book(n)], 'manual', null);
     perform pg_temp.cl(n);
     return pg_temp.fin(n, res, cost);
   end $$;

-- Queues a job for book n directly (as the definer).
create function pg_temp.qjob(n int, p_kind text, p_reason text) returns void language sql security definer as
$$ insert into library.tag_jobs (household_id, book_id, kind, reason)
   values (pg_temp.hh_of(n), pg_temp.book(n), p_kind, p_reason) $$;

create function pg_temp.card(n int, p_checked boolean default false) returns void language sql security definer as
$$ insert into library.book_cards (book_id, household_id, summary, model, vocab_version, series_checked_at)
   values (pg_temp.book(n), pg_temp.hh_of(n), 'A card summary ' || n || '.', 'claude-sonnet-5-5', 1,
           case when p_checked then now() end)
   on conflict (book_id) do update set series_checked_at = excluded.series_checked_at $$;

-- Book n's jobs other than new_book, oldest first, as kind:reason:status:run ('-' for no run).
create function pg_temp.jobs(n int) returns text language sql security definer as
$$ select string_agg(j.kind || ':' || j.reason || ':' || j.status || ':' || case when j.run_id is null then '-' else 'run' end,
                     ',' order by j.created_at)
     from library.tag_jobs j where j.book_id = pg_temp.book(n) and j.reason <> 'new_book' $$;

create function pg_temp.chk(n int) returns text language sql security definer as
$$ select coalesce((select case when c.series_checked_at is null then 'unchecked' else 'checked' end
                      from library.book_cards c where c.book_id = pg_temp.book(n)), 'nocard') $$;

-- The kept job's status:cost_micro.
create function pg_temp.jcost(n int) returns text language sql security definer as
$$ select j.status || ':' || j.cost_micro from library.tag_jobs j where j.id = pg_temp.jid(n) $$;

create function pg_temp.titles(p jsonb) returns text language sql as
$$ select string_agg(e ->> 'title', ',' order by o) from jsonb_array_elements(p) with ordinality x(e, o) $$;

insert into library.books (id, household_id, title, authors, synopsis)
select pg_temp.book(n), pg_temp.hh_of(n), 'Invented Title ' || n, '{}', 'A made-up synopsis ' || n
  from (select generate_series(31, 79) union all select generate_series(82, 86)) g(n);

-- Same author (D6): book 31 and sixteen others by Ines Dravenholt-Ashe,
-- written two ways, 32 newest to 47 oldest. H2's book 82 by her is newer still.
update library.books
   set authors = '{Ines Dravenholt-Ashe}',
       isbn13 = '{n/a,978-0-00-000001-1,9780000000022,9780000000034}',
       isbn10 = '{12345,000000001x,0-00-000002-1,0000000039}'
 where id = pg_temp.book(31);
update library.books b
   set authors = case when right(b.id::text, 12)::int % 2 = 0 then '{Ines Dravenholt-Ashe}'::text[]
                      else '{INES DRAVENHOLT ASHE}'::text[] end,
       created_at = now() - make_interval(mins => right(b.id::text, 12)::int - 31)
 where b.id in (select pg_temp.book(n) from generate_series(32, 47) n);
update library.books set authors = '{Ines Dravenholt-Ashe}', series_name = 'Wrenfold Tales',
                         created_at = now() + interval '1 hour'
 where id = pg_temp.book(82);
update library.books set authors = '{Émile Varro}' where id = pg_temp.book(74);
update library.tag_jobs set status = 'done' where status in ('queued', 'processing');

select is(pg_temp.titles(library._same_author_books(pg_temp.hh(), pg_temp.book(31))),
          (select string_agg('Invented Title ' || n, ',' order by n) from generate_series(32, 46) n),
          '_same_author_books: the 15 newest other books by the author (either spelling), not itself, not H2''s');
select is(library._same_author_books(pg_temp.hh(), pg_temp.book(31)) -> 0,
          '{"title": "Invented Title 32", "seriesName": null, "seriesVolume": null, "handSet": false}'::jsonb,
          '_same_author_books: a book without a series has null seriesName and seriesVolume (handSet false)');
select is(library._same_author_books(pg_temp.hh(), pg_temp.book(74)),
          '[{"title": "Invented Title 3", "seriesName": "Ember Loom", "seriesVolume": 1, "handSet": false},
            {"title": "Invented Title 4", "seriesName": "Ember Loom", "seriesVolume": 2, "handSet": false}]'::jsonb,
          '_same_author_books: Émile Varro matches Emile Varro and a co-written book, with their series');
select is(library._same_author_books(pg_temp.hh(), pg_temp.book(48))::text || '|'
          || library._same_author_books(pg_temp.hh(), pg_temp.book(21))::text, '[]|[]',
          '_same_author_books: [] for an author-less book and for an empty author key');

set local role authenticated;
select pg_temp.as_a();
select library.request_tagging(pg_temp.hh(), array[pg_temp.book(31)], 'manual', null);
select is(pg_temp.cl(31), 'claimed:1', 'A claims book 31''s full job');
reset role;
select is(pg_temp.crow(31) -> 'same_author', library._same_author_books(pg_temp.hh(), pg_temp.book(31)),
          'a full claim returns same_author');
select is(pg_temp.crow(31) -> 'book' -> 'isbns', '["9780000000011", "9780000000022", "000000001X", "0000000021"]'::jsonb,
          'the claim''s book.isbns: up to 2 ISBN-13s then up to 2 ISBN-10s, digits and X only');
set local role authenticated;
select pg_temp.as_a();
select pg_temp.fin(31, pg_temp.fr(null, null));
select pg_temp.qjob(31, 'series', 'series');
select is(pg_temp.cl(31) || '|' || (pg_temp.crow(31) ->> 'kind') || '|'
          || jsonb_array_length(pg_temp.crow(31) -> 'same_author'), 'claimed:1|series|15',
          'a series claim returns same_author');
select pg_temp.fin(31, pg_temp.sr('null'::jsonb, 'none'));
select pg_temp.qjob(31, 'new_tags', 'new_tags');
select is(pg_temp.cl(31) || '|' || (pg_temp.crow(31) ->> 'kind') || '|' || (pg_temp.crow(31) -> 'same_author')::text,
          'claimed:1|new_tags|[]', 'a new_tags claim returns same_author []');

---------------------------------------------------------------------------
-- Status on a full job (D9).
---------------------------------------------------------------------------
select is(pg_temp.ftag(50, pg_temp.fr(pg_temp.s('Lantern Vale', 1, 'w50'), 'unsure')) || '|' || pg_temp.ser(50) || '|'
          || pg_temp.chk(50) || '|' || pg_temp.nrows('new', 'lantern vale'),
          'done|-:-|unchecked|0', 'a full job answering unsure applies nothing and leaves the card unchecked');
select is(pg_temp.jobs(50), 'full:manual:done:-,series:unsure:queued:-',
          'and queues one series job with reason unsure and no run, after the full job is done');
select is(pg_temp.ftag(51, pg_temp.fr(pg_temp.s('Lantern Vale', 2, 'w51'), 'found')) || '|' || pg_temp.chk(51) || '|'
          || pg_temp.jobs(51) || '|' || pg_temp.sugg('new', 'lantern vale'),
          'done|checked|full:manual:done:-|pending|Lantern Vale|-|51:2.00:w51:pending',
          'found: applied as Plan 10, checked, no follow-up');
select is(pg_temp.ftag(52, pg_temp.fr('null'::jsonb, 'none')) || '|' || pg_temp.ser(52) || '|' || pg_temp.chk(52) || '|'
          || pg_temp.jobs(52),
          'done|-:-|checked|full:manual:done:-', 'none: nothing applied, checked, no follow-up');
select is(pg_temp.ftag(53, pg_temp.fr(pg_temp.s('Lantern Vale', 3, 'w53'), null)) || '|' || pg_temp.chk(53) || '|'
          || pg_temp.jobs(53) || '|' || pg_temp.sugg('new', 'lantern vale'),
          'done|checked|full:manual:done:-|pending|Lantern Vale|-|51:2.00:w51:pending,53:3.00:w53:pending',
          'no seriesStatus (an older tagger): as Plan 10');
select library.request_tagging(pg_temp.hh(), array[pg_temp.book(49)], 'manual', null);
select pg_temp.cl(49);
select throws_ok($$ select pg_temp.fin(49, pg_temp.fr('null'::jsonb, 'maybe')) $$, '22023', null,
                 'a seriesStatus other than found, none or unsure is invalid_result');

---------------------------------------------------------------------------
-- No follow-up when the book has a series, is hand-set, is checked, or its
-- synopsis changed mid-job.
---------------------------------------------------------------------------
reset role;
update library.books set series_name = 'Ember Loom' where id = pg_temp.book(54);
update library.books set user_edited_fields = '{seriesName}' where id = pg_temp.book(55);
select pg_temp.card(56, true);
set local role authenticated;
select pg_temp.as_a();
select is(pg_temp.ftag(54, pg_temp.fr('null'::jsonb, 'unsure')) || '|' || pg_temp.jobs(54), 'done|full:manual:done:-',
          'unsure on a book with a series: no follow-up');
select is(pg_temp.ftag(55, pg_temp.fr('null'::jsonb, 'unsure')) || '|' || pg_temp.jobs(55), 'done|full:manual:done:-',
          'unsure on a hand-set book: no follow-up');
select is(pg_temp.ftag(56, pg_temp.fr('null'::jsonb, 'unsure')) || '|' || pg_temp.jobs(56) || '|' || pg_temp.chk(56),
          'done|full:manual:done:-|checked', 'unsure on a checked book: no follow-up');
select library.request_tagging(pg_temp.hh(), array[pg_temp.book(57)], 'manual', null);
select pg_temp.cl(57);
reset role;
update library.books set synopsis = 'A rewritten synopsis 57' where id = pg_temp.book(57);
set local role authenticated;
select pg_temp.as_a();
select is(pg_temp.fin(57, pg_temp.fr('null'::jsonb, 'unsure')) || '|' || pg_temp.jobs(57),
          'done|full:manual:done:-,full:changed:queued:-',
          'unsure with the synopsis changed mid-job: the requeued full job wins, no series job');

---------------------------------------------------------------------------
-- No loop (Review Focus 5).
---------------------------------------------------------------------------
select is(pg_temp.cl(50) || '|' || (pg_temp.crow(50) ->> 'kind'), 'claimed:1|series', 'A claims book 50''s follow-up');
select is(pg_temp.fin(50, pg_temp.sr('null'::jsonb, 'unsure')) || '|' || pg_temp.chk(50) || '|' || pg_temp.jobs(50),
          'done|checked|full:manual:done:-,series:unsure:done:-',
          'the follow-up finishing unsure is done and checked, and queues nothing');
select is(pg_temp.ftag(50, pg_temp.fr('null'::jsonb, 'unsure')) || '|' || pg_temp.jobs(50),
          'done|full:manual:done:-,series:unsure:done:-,full:manual:done:-',
          'a manual retag finishing unsure again queues no second series job');
select pg_temp.ftag(59, pg_temp.fr('null'::jsonb, 'unsure'));
reset role;
update library.book_cards set series_checked_at = now() where book_id = pg_temp.book(59);
select pg_temp.save('spent59', pg_temp.spent(pg_temp.hh())::text);
set local role authenticated;
select pg_temp.as_a();
select is(pg_temp.cl(59) || '|' || pg_temp.jcost(59) || '|' || (pg_temp.spent(pg_temp.hh()) - pg_temp.val('spent59')::bigint),
          'done:0|done:0|0', 'a queued follow-up for a book checked meanwhile is claimed done at cost 0');

---------------------------------------------------------------------------
-- True cost for series jobs, the 10x guard (D10).
---------------------------------------------------------------------------
reset role;
select pg_temp.card(n) from unnest(array[60, 61, 63, 64]) n;
select pg_temp.qjob(n, 'series', 'series') from unnest(array[60, 61, 63, 64]) n;
set local role authenticated;
select pg_temp.as_a();

select pg_temp.save('spent60', pg_temp.spent(pg_temp.hh())::text);
select pg_temp.cl(60);
select is(pg_temp.fin(60, pg_temp.sr('null'::jsonb, 'none'), library.series_reserve_micro() + 5000) || '|'
          || pg_temp.jcost(60) || '|' || (pg_temp.spent(pg_temp.hh()) - pg_temp.val('spent60')::bigint),
          'done|done:' || library.series_reserve_micro() + 5000 || '|' || library.series_reserve_micro() + 5000,
          'a series finish above its reserve charges the true cost');

select pg_temp.save('spent61', pg_temp.spent(pg_temp.hh())::text);
select pg_temp.cl(61);
select is(pg_temp.fin(61, pg_temp.sr('null'::jsonb, 'none'), 20 * library.series_reserve_micro()) || '|'
          || pg_temp.jcost(61) || '|' || (pg_temp.spent(pg_temp.hh()) - pg_temp.val('spent61')::bigint),
          'done|done:' || 10 * library.series_reserve_micro() || '|' || 10 * library.series_reserve_micro(),
          'a series cost of 20x the reserve charges 10x');

select pg_temp.save('spent62', pg_temp.spent(pg_temp.hh())::text);
select is(pg_temp.ftag(62, pg_temp.fr('null'::jsonb, 'none'), library.tag_reserve_micro() + 5000) || '|'
          || pg_temp.jcost(62) || '|' || (pg_temp.spent(pg_temp.hh()) - pg_temp.val('spent62')::bigint),
          'done|done:' || library.tag_reserve_micro() || '|' || library.tag_reserve_micro(),
          'a full finish above its reserve is still clamped');

select pg_temp.save('spent63', pg_temp.spent(pg_temp.hh())::text);
select pg_temp.cl(63);
select is(pg_temp.rel(63, 'tag_refused', null, library.series_reserve_micro() + 7000) || '|'
          || pg_temp.jcost(63) || '|' || (pg_temp.spent(pg_temp.hh()) - pg_temp.val('spent63')::bigint),
          'failed|failed:' || library.series_reserve_micro() + 7000 || '|' || library.series_reserve_micro() + 7000,
          'a series release with tag_refused above the reserve charges the true cost');

select pg_temp.save('spent64', pg_temp.spent(pg_temp.hh())::text);
select pg_temp.cl(64);
select is(pg_temp.rel(64, null, now() + interval '1 hour', 3 * library.series_reserve_micro()) || '|'
          || pg_temp.jcost(64) || '|' || (pg_temp.spent(pg_temp.hh()) - pg_temp.val('spent64')::bigint),
          'queued|queued:' || library.series_reserve_micro() || '|' || library.series_reserve_micro(),
          'a billed-unknown series retry keeps at most the job''s own reserve');

---------------------------------------------------------------------------
-- Over the cap: H2's tagging budget is 7,000,000.
---------------------------------------------------------------------------
reset role;
insert into library.ai_usage (household_id, feature, month, spent_micro, calls)
values (pg_temp.hh2(), 'tagging', (pg_temp.m() - interval '1 month')::date, 1000, 1);
select pg_temp.card(83);
select pg_temp.card(84);
select pg_temp.qjob(83, 'series', 'series');
set local role authenticated;
select pg_temp.as_c();
select pg_temp.cl(83);
reset role;
update library.ai_usage set spent_micro = 7000000 - 1000
 where household_id = pg_temp.hh2() and feature = 'tagging' and month = pg_temp.m();
select pg_temp.qjob(84, 'series', 'series');
set local role authenticated;
select pg_temp.as_c();
select is(pg_temp.fin(83, pg_temp.sr('null'::jsonb, 'none'), library.series_reserve_micro() + 4000) || '|'
          || pg_temp.spent(pg_temp.hh2()),
          'done|7003000', 'a series finish overrunning by 4,000 leaves spent above the budget');
select is(pg_temp.cl(84), 'budget:0', 'and the next claim answers budget');

---------------------------------------------------------------------------
-- The budget read (D10).
---------------------------------------------------------------------------
select pg_temp.as_a();
select is((select b.reserve_micro from library.ai_budget(pg_temp.hh(), 'tagging') b),
          greatest(library.tag_reserve_micro(), library.series_reserve_micro()),
          'ai_budget tagging reserve_micro is the larger of the two reserves');
select is((select b.reserve_micro from library.ai_budget(pg_temp.hh(), 'ask') b), 0, 'ai_budget ask reserve_micro is 0');

---------------------------------------------------------------------------
-- The re-check (D11). Only cards marked here count; every other marker is
-- cleared first.
---------------------------------------------------------------------------
reset role;
update library.book_cards set series_checked_at = null;
update library.books set authors = '{Tj Holt}', synopsis = rpad('A long made-up synopsis.', 150, ' z')
 where id = pg_temp.book(65);
update library.books set synopsis = rpad('A short synopsis.', 99, ' z') where id = pg_temp.book(66);
update library.books set synopsis = rpad('A short synopsis.', 100, ' z') where id = pg_temp.book(67);
update library.books set series_name = 'Ember Loom' where id = pg_temp.book(68);
update library.books set user_edited_fields = '{seriesVolume}' where id = pg_temp.book(69);
update library.books set authors = '{Ines Dravenholt-Ashe}', synopsis = rpad('A long made-up synopsis.', 150, ' z')
 where id = pg_temp.book(75);
update library.tag_jobs set status = 'done'
 where status in ('queued', 'processing') and book_id in (select pg_temp.book(n) from generate_series(65, 75) n);
select pg_temp.card(n, true) from unnest(array[65, 66, 67, 68, 69, 70, 71, 72, 73, 75]) n;
insert into library.series_suggestions (household_id, kind, name_key, name)
values (pg_temp.hh(), 'new', 'wrenfold saga', 'Wrenfold Saga');
insert into library.series_suggestion_books (suggestion_id, book_id, household_id, volume, why, status, decided_at)
values (pg_temp.ssid('new', 'wrenfold saga'), pg_temp.book(70), pg_temp.hh(), 1, 'w70', 'pending', null),
       (pg_temp.ssid('existing', 'thornmere cycle'), pg_temp.book(71), pg_temp.hh(), 1, 'w71', 'pending', null),
       (pg_temp.ssid('existing', 'lantern vale cycle'), pg_temp.book(72), pg_temp.hh(), 1, 'w72', 'dismissed', now()),
       (pg_temp.ssid('new', 'saltglass archives'), pg_temp.book(73), pg_temp.hh(), 1, 'w73', 'pending', null);

select is(library._series_recheck_reset(), 4, '_series_recheck_reset returns the number of markers cleared');
select is((select string_agg(n || ':' || pg_temp.chk(n), ',' order by n)
             from unnest(array[65, 66, 67, 68, 69, 70, 71, 72, 73, 75]) n),
          '65:unchecked,66:unchecked,67:checked,68:checked,69:checked,70:checked,71:checked,72:unchecked,73:unchecked,75:checked',
          're-check: a same-author book in a series (Tj Holt / T. J. Holt) and a 99-character synopsis clear; '
          || '100 characters, a series, hand-set and a pending book on a listed suggestion keep; a dismissed book '
          || 'or a pending one on an approved name clears; a same-author series only in H2 keeps');
select is(library._series_recheck_reset(), 0, 'a second re-check clears nothing');
select is((select count(*)::int from library.tag_jobs j
            where j.status = 'queued' and j.book_id in (select pg_temp.book(n) from generate_series(65, 75) n)), 0,
          'the re-check queues nothing');

set local role authenticated;
select pg_temp.as_a();
select throws_ok($$ select library._series_recheck_reset() $$, '42501', null, 'A: executing _series_recheck_reset is denied');
select throws_ok($$ select library._same_author_books(pg_temp.hh(), pg_temp.book(31)) $$, '42501', null,
                 'A: executing _same_author_books is denied');
select throws_ok($$ select library._ai_settle_actual(pg_temp.hh(), 'tagging', pg_temp.m(), 0, 0) $$, '42501', null,
                 'A: executing _ai_settle_actual is denied');

---------------------------------------------------------------------------
-- The re-check of every blank book (2026-11-20). The D11 cards, all marked
-- again: only a series, a hand-set field or an open suggestion keeps one.
---------------------------------------------------------------------------
reset role;
update library.book_cards set series_checked_at = null;
select pg_temp.card(n, true) from unnest(array[65, 66, 67, 68, 69, 70, 71, 72, 73, 75]) n;

select is(library._series_recheck_all_blank(), 6, '_series_recheck_all_blank returns the number of markers cleared');
select is((select string_agg(n || ':' || pg_temp.chk(n), ',' order by n)
             from unnest(array[65, 66, 67, 68, 69, 70, 71, 72, 73, 75]) n),
          '65:unchecked,66:unchecked,67:unchecked,68:checked,69:checked,70:checked,71:checked,72:unchecked,73:unchecked,75:unchecked',
          'all-blank re-check: every blank book clears, whatever its synopsis or authors; a series, hand-set and '
          || 'a pending book on a listed suggestion keep; a dismissed book or a pending one on an approved name clears');
select is(library._series_recheck_all_blank(), 0, 'a second all-blank re-check clears nothing');
select is((select count(*)::int from library.tag_jobs j
            where j.status = 'queued' and j.book_id in (select pg_temp.book(n) from generate_series(65, 75) n)), 0,
          'the all-blank re-check queues nothing');

set local role authenticated;
select pg_temp.as_a();
select throws_ok($$ select library._series_recheck_all_blank() $$, '42501', null,
                 'A: executing _series_recheck_all_blank is denied');

---------------------------------------------------------------------------
-- Constants: the Deno values (tagger.ts), kept in step by Tasks 5 and 6.
---------------------------------------------------------------------------
reset role;
select is(library.tag_reserve_micro(), 94000, 'tag_reserve_micro is 94000 (tagger.ts TAG_RESERVE_MICRO)');
select is(library.series_reserve_micro(), 150000, 'series_reserve_micro is 150000 (tagger.ts SERIES_RESERVE_MICRO)');

select * from finish();
rollback;
