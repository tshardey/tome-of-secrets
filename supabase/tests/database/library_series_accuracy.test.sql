-- pgTAP: series accuracy (Plan 11 D2-D5). Proves that an existing series is
-- filled in only when one of the book's authors already has a book in it (the
-- same author written two ways, or one author of several, counts), that any
-- other book becomes a per-book "existing" suggestion for that series, that an
-- approved alias follows the same rule, that dismissing an existing-series
-- suggestion dismisses those books only, and that approve fills only books
-- still pending, blank and not hand-set.
begin;

create extension if not exists pgtap with schema extensions;

select plan(59);

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
update library.books set authors = '{A. Reed}' where id in (pg_temp.book(5), pg_temp.book(9), pg_temp.book(14),
                                                           pg_temp.book(15));
update library.books set authors = '{M. Holt}', series_name = 'Saltglass Archive', series_volume = 1
 where id = pg_temp.book(6);
update library.books set authors = '{M. Holt}' where id in (pg_temp.book(8), pg_temp.book(12));
update library.books set authors = '{Petra Wynnecombe}' where id = pg_temp.book(13);
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
-- RLS and grants.
---------------------------------------------------------------------------
-- H: new rows Saltglass Archives (7, 17), Wrenfold Tale (10); existing rows
-- Lantern Vale Cycle (5, 14, 15), Thornmere Cycle (21), Saltglass Archive
-- (9, 13), Wrenfold Tales (11).
select pg_temp.as_a();
select is((select string_agg(s.kind || ':' || s.status, ',' order by s.kind, s.name_key)
             from library.series_suggestions s),
          'existing:pending,existing:pending,existing:pending,existing:pending,new:approved,new:approved',
          'A sees H''s rows and their kind');
select pg_temp.as_b();
select is((select string_agg(sb.status, ',' order by sb.status) || ':' || count(*) filter (where sb.decided_at is not null)
             from library.series_suggestion_books sb),
          'approved,approved,approved,approved,dismissed,dismissed,pending,pending,pending,pending:6',
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

select * from finish();
rollback;
