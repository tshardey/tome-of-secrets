-- pgTAP: library photo intake (library.intake_items, library.intake_usage,
-- the library-intake storage bucket and the intake RPCs).
-- Proves household isolation, that claim_token is never readable by a
-- client, the per-item attempt limit and per-household daily cap, the
-- lease, idempotent confirm, and the purge lists.
begin;

create extension if not exists pgtap with schema extensions;

select plan(67);

insert into auth.users (id, email, aud, role)
values
  ('11111111-1111-1111-1111-111111111111', 'a@library.test', 'authenticated', 'authenticated'),
  ('22222222-2222-2222-2222-222222222222', 'b@library.test', 'authenticated', 'authenticated');

-- Scratch space to carry values across role switches.
create temporary table test_vals (k text primary key, v text) on commit drop;
grant all on test_vals to authenticated, anon;

-- Helpers (security invoker, so they run as whichever role is current).
create function pg_temp.hh() returns uuid language sql as
$$ select v::uuid from test_vals where k = 'hh' $$;

create function pg_temp.item(n int) returns uuid language sql as
$$ select ('cccccccc-0000-0000-0000-' || lpad(n::text, 12, '0'))::uuid $$;

create function pg_temp.path(n int, f text) returns text language sql as
$$ select pg_temp.hh()::text || '/' || pg_temp.item(n)::text || '/' || f $$;

create function pg_temp.hash(seed text) returns text language sql as
$$ select encode(sha256(convert_to(seed, 'UTF8')), 'hex') $$;

-- Inserts item n with a cover (and optionally a title page) as the current user.
create function pg_temp.add(n int, seed text, with_title boolean default false)
returns void language sql as
$$ insert into library.intake_items
     (id, household_id, batch_id, cover_path, title_page_path, source_hash)
   values (pg_temp.item(n), pg_temp.hh(), 'bbbbbbbb-0000-0000-0000-000000000001',
           pg_temp.path(n, 'cover.jpg'),
           case when with_title then pg_temp.path(n, 'title.jpg') end,
           pg_temp.hash(seed)) $$;

create function pg_temp.claim(n int) returns jsonb language sql as
$$ select to_jsonb(c) from library.claim_intake_item(pg_temp.item(n)) c $$;

create function pg_temp.tok(p_key text) returns uuid language sql as
$$ select (v::jsonb ->> 'claim_token')::uuid from test_vals where k = p_key $$;

create function pg_temp.st(n int) returns text language sql as
$$ select status || ':' || attempts || ':' || coalesce(error_code, '')
     from library.intake_items where id = pg_temp.item(n) $$;

create function pg_temp.today() returns date language sql as
$$ select (now() at time zone 'utc')::date $$;

create function pg_temp.calls() returns int language sql as
$$ select coalesce(sum(vision_calls), 0)::int from library.intake_usage
    where household_id = pg_temp.hh() and day = pg_temp.today() $$;

-- Ages item n's lease by 8 minutes. Call as postgres.
create function pg_temp.age_lease(n int) returns void language sql as
$$ update library.intake_items set claimed_at = claimed_at - interval '8 minutes'
    where id = pg_temp.item(n) $$;

---------------------------------------------------------------------------
-- Schema: the bucket.
---------------------------------------------------------------------------
select is(
  (select public::text || ':' || file_size_limit::text || ':' || allowed_mime_types::text
     from storage.buckets where id = 'library-intake'),
  'false:2097152:{image/jpeg}',
  'bucket library-intake is private, 2 MiB, image/jpeg only'
);

---------------------------------------------------------------------------
-- B gets a household and a book (used for the cross-household confirm).
---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';

insert into test_vals (k, v)
select 'bhh', library.create_household('B Home', 'B')::text;

insert into library.books (id, household_id, title)
values ('dddddddd-0000-0000-0000-000000000001',
        (select v::uuid from test_vals where k = 'bhh'), 'B Book');

---------------------------------------------------------------------------
-- Insert (A).
---------------------------------------------------------------------------
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

insert into test_vals (k, v)
select 'hh', library.create_household('Home', 'Tierra')::text;

select lives_ok(
  $$ select pg_temp.add(1, 'photo-1', true) $$,
  'A: inserts an item with valid cover and title page paths'
);

select is(
  (select uploaded_by::text || ':' || status || ':' || attempts
     from library.intake_items where id = pg_temp.item(1)),
  '11111111-1111-1111-1111-111111111111:pending:0',
  'A: uploaded_by defaults to the caller, status pending, attempts 0'
);

select throws_ok(
  $$ insert into library.intake_items (id, household_id, batch_id, cover_path, source_hash, status)
     values (pg_temp.item(90), pg_temp.hh(), 'bbbbbbbb-0000-0000-0000-000000000001',
             pg_temp.path(90, 'cover.jpg'), pg_temp.hash('x90'), 'ready') $$,
  '42501', null,
  'A: setting status on insert is denied (column grant)'
);

select throws_ok(
  $$ insert into library.intake_items (id, household_id, batch_id, cover_path, source_hash, attempts)
     values (pg_temp.item(91), pg_temp.hh(), 'bbbbbbbb-0000-0000-0000-000000000001',
             pg_temp.path(91, 'cover.jpg'), pg_temp.hash('x91'), 2) $$,
  '42501', null,
  'A: setting attempts on insert is denied (column grant)'
);

select throws_ok(
  $$ insert into library.intake_items (id, household_id, batch_id, cover_path, source_hash)
     values (pg_temp.item(92), pg_temp.hh(), 'bbbbbbbb-0000-0000-0000-000000000001',
             pg_temp.hh()::text || '/' || pg_temp.item(93)::text || '/cover.jpg',
             pg_temp.hash('x92')) $$,
  '23514', null,
  'A: a cover path outside <household>/<id>/ violates the check'
);

select pg_temp.add(2, 'photo-dup', true);

select throws_ok(
  $$ select pg_temp.add(3, 'photo-dup') $$,
  '23505', null,
  'A: a second open item with the same source_hash is rejected'
);

select is(
  library.discard_intake_item(pg_temp.item(2), 'discarded'),
  true,
  'A: discarding a pending item returns true'
);

select lives_ok(
  $$ select pg_temp.add(3, 'photo-dup') $$,
  'A: after the first is discarded, the same hash inserts'
);

select is(
  library.discard_intake_item(pg_temp.item(2), 'discarded'),
  true,
  'A: discarding an already discarded item returns true'
);

---------------------------------------------------------------------------
-- Claim token hidden from members.
---------------------------------------------------------------------------
select throws_ok(
  $$ select claim_token from library.intake_items $$,
  '42501', null,
  'A (member): selecting claim_token is denied'
);

select is(
  (select count(id)::int from (
     select id, household_id, uploaded_by, batch_id, owner_user_id, cover_path,
            title_page_path, source_hash, status, attempts, claimed_at, retry_at,
            extraction, vision_usage, lookup, error_code, discard_reason,
            result_book_id, result_copy_id, created_at, updated_at
       from library.intake_items) s),
  3,
  'A (member): selecting every other column works'
);

---------------------------------------------------------------------------
-- Storage (A).
---------------------------------------------------------------------------
select lives_ok(
  $$ insert into storage.objects (bucket_id, name, owner)
     values ('library-intake', pg_temp.path(1, 'cover.jpg'),
             '11111111-1111-1111-1111-111111111111') $$,
  'A: uploads <household>/<id>/cover.jpg'
);

select is(
  library.can_access_intake_object('not-a-uuid/x/cover.jpg'),
  false,
  'A: a non-UUID first segment gives false, not an error'
);

do $$
declare n int;
begin
  update storage.objects set name = name || '.x' where bucket_id = 'library-intake';
  get diagnostics n = row_count;
  insert into test_vals (k, v) values ('obj_update_rows', n::text);
end
$$;

select is(
  (select v from test_vals where k = 'obj_update_rows'),
  '0',
  'A: updating an intake object changes 0 rows (no update policy)'
);

---------------------------------------------------------------------------
-- Isolation (B).
---------------------------------------------------------------------------
set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';

select is_empty(
  'select id from library.intake_items',
  'B (non-member): sees none of A''s items'
);

select throws_ok(
  $$ select pg_temp.add(4, 'photo-b') $$,
  '42501', null,
  'B (non-member): inserting into A''s household violates RLS'
);

select throws_ok(
  $$ select * from library.claim_intake_item(pg_temp.item(1)) $$,
  '42501', null,
  'B (non-member): claim_intake_item on A''s item is denied'
);

select throws_ok(
  $$ select * from library.confirm_intake_item(pg_temp.item(1), null, '{"title":"X"}', '{}') $$,
  '42501', null,
  'B (non-member): confirm_intake_item on A''s item is denied'
);

select throws_ok(
  $$ select library.discard_intake_item(pg_temp.item(1), 'discarded') $$,
  '42501', null,
  'B (non-member): discard_intake_item on A''s item is denied'
);

select is_empty(
  $$ select name from storage.objects where bucket_id = 'library-intake' $$,
  'B (non-member): sees no objects under A''s prefix'
);

select throws_ok(
  $$ insert into storage.objects (bucket_id, name, owner)
     values ('library-intake', pg_temp.path(1, 'other.jpg'),
             '22222222-2222-2222-2222-222222222222') $$,
  '42501', null,
  'B (non-member): uploading under A''s prefix is denied'
);

reset role;

select is(
  (select count(*)::int from library.intake_usage where household_id = pg_temp.hh()),
  0,
  'after B''s failed claim, A''s intake_usage is unchanged'
);

---------------------------------------------------------------------------
-- Claim, lease and attempt limit (A, item 1).
---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

select throws_ok(
  $$ select * from library.claim_intake_item('eeeeeeee-0000-0000-0000-000000000001') $$,
  '42501', null,
  'A: claiming a missing item raises 42501'
);

insert into test_vals (k, v) values ('c1a', pg_temp.claim(1)::text);

select is(
  (select (v::jsonb ->> 'outcome') || ':' || (v::jsonb ->> 'attempts') || ':' ||
          ((v::jsonb ->> 'claim_token') is not null) || ':' ||
          (v::jsonb ->> 'cover_path') || ':' || (v::jsonb ->> 'title_page_path')
     from test_vals where k = 'c1a'),
  'claimed:1:true:' || pg_temp.path(1, 'cover.jpg') || ':' || pg_temp.path(1, 'title.jpg'),
  'A: first claim returns claimed, attempts 1, a token and both paths'
);

select is(pg_temp.calls(), 1, 'A: the first claim counts one vision call');

insert into test_vals (k, v) values ('c1b', pg_temp.claim(1)::text);

select is(
  (select (v::jsonb ->> 'outcome') from test_vals where k = 'c1b')
    || ':' || pg_temp.st(1) || ':' || pg_temp.calls(),
  'busy:processing:1::1',
  'A: claiming within the lease returns busy with counters unchanged'
);

reset role;
select pg_temp.age_lease(1);
set local role authenticated;

select is(
  (select (c ->> 'outcome') || ':' || (c ->> 'attempts') from pg_temp.claim(1) c),
  'claimed:2',
  'A: after the lease expires, the claim succeeds with attempts 2'
);

reset role;
select pg_temp.age_lease(1);
set local role authenticated;

select is(
  (select (c ->> 'outcome') || ':' || (c ->> 'attempts') || ':' || pg_temp.calls()
     from pg_temp.claim(1) c),
  'claimed:3:3',
  'A: a third stale claim succeeds with attempts 3 and 3 vision calls'
);

reset role;
select pg_temp.age_lease(1);
set local role authenticated;

select is(
  (select (c ->> 'outcome') from pg_temp.claim(1) c) || ':' || pg_temp.st(1) || ':' || pg_temp.calls(),
  'failed:failed:3:attempts_exhausted:3',
  'A: a fourth stale claim fails with attempts_exhausted and bills nothing'
);

reset role;

select throws_ok(
  $$ update library.intake_items set attempts = 4 where id = pg_temp.item(1) $$,
  '23514', null,
  'postgres: attempts = 4 violates the check constraint'
);

---------------------------------------------------------------------------
-- Daily cap (item 5).
---------------------------------------------------------------------------
update library.intake_usage set vision_calls = 500
 where household_id = pg_temp.hh() and day = pg_temp.today();

set local role authenticated;
select pg_temp.add(5, 'photo-5');

select is(
  (select (c ->> 'outcome') from pg_temp.claim(5) c) || ':' || pg_temp.st(5) || ':' || pg_temp.calls(),
  'daily_cap:pending:0::500',
  'A: at 500 calls today the claim returns daily_cap and leaves the item pending'
);

reset role;
update library.intake_usage set vision_calls = 3
 where household_id = pg_temp.hh() and day = pg_temp.today();
insert into library.intake_usage (household_id, day, vision_calls)
values (pg_temp.hh(), pg_temp.today() - 1, 500);
set local role authenticated;

insert into test_vals (k, v) values ('c5', pg_temp.claim(5)::text);

select is(
  (select (v::jsonb ->> 'outcome') from test_vals where k = 'c5') || ':' || pg_temp.calls(),
  'claimed:4',
  'A: yesterday''s row at 500 doesn''t block today'
);

---------------------------------------------------------------------------
-- Finish and release.
---------------------------------------------------------------------------
select is(
  library.finish_intake_item(pg_temp.item(5), 'eeeeeeee-0000-0000-0000-000000000002',
                             '{"title":"Invented"}', '{"input_tokens":1}')::text
    || ':' || pg_temp.st(5),
  'false:processing:1:',
  'A: finish with a wrong token returns false and leaves processing'
);

select is(
  library.finish_intake_item(pg_temp.item(5), pg_temp.tok('c5'),
                             '{"title":"Invented"}', '{"input_tokens":1}')::text
    || ':' || pg_temp.st(5),
  'true:ready:1:',
  'A: finish with the right token sets ready'
);

select is(
  (select extraction ->> 'title' from library.intake_items where id = pg_temp.item(5)),
  'Invented',
  'A: finish stores the extraction'
);

select is(
  (select (c ->> 'outcome') from pg_temp.claim(5) c) || ':' || pg_temp.calls(),
  'done:4',
  'A: claiming a ready item returns done and bills nothing'
);

select is(
  library.release_intake_item(pg_temp.item(5), pg_temp.tok('c5'), 'vision_refused', null, null),
  'ready',
  'A: release on an item that is not processing returns its status unchanged'
);

-- Item 6: transient error, then retry_later.
select pg_temp.add(6, 'photo-6');
insert into test_vals (k, v) values ('c6', pg_temp.claim(6)::text);

select is(
  library.release_intake_item(pg_temp.item(6), pg_temp.tok('c6'), null,
                              now() + interval '5 minutes', '{"input_tokens":2}')
    || ':' || pg_temp.st(6),
  'pending:pending:1:',
  'A: release with a future retry_at returns the item to pending'
);

select is(
  (select (c ->> 'outcome') || ':' || ((c ->> 'retry_at') is not null) from pg_temp.claim(6) c),
  'retry_later:true',
  'A: an immediate claim of a backed-off item returns retry_later with retry_at'
);

-- Item 7: transient error on the last attempt.
select pg_temp.add(7, 'photo-7');
reset role;
update library.intake_items set attempts = 2 where id = pg_temp.item(7);
set local role authenticated;
insert into test_vals (k, v) values ('c7', pg_temp.claim(7)::text);

select is(
  library.release_intake_item(pg_temp.item(7), pg_temp.tok('c7'), null,
                              now() + interval '5 minutes', null)
    || ':' || pg_temp.st(7),
  'failed:failed:3:vision_unavailable',
  'A: release with retry_at at 3 attempts fails with vision_unavailable'
);

-- Item 8: misconfigured deployment refunds the claim.
select pg_temp.add(8, 'photo-8');
insert into test_vals (k, v) values ('calls_before_8', pg_temp.calls()::text);
insert into test_vals (k, v) values ('c8', pg_temp.claim(8)::text);

select is(
  library.release_intake_item(pg_temp.item(8), pg_temp.tok('c8'), null, null, null)
    || ':' || pg_temp.st(8) || ':'
    || (pg_temp.calls() = (select v::int from test_vals where k = 'calls_before_8')),
  'pending:pending:0::true',
  'A: release with no error and no retry refunds the attempt and the daily call'
);

select is(
  (select retry_at from library.intake_items where id = pg_temp.item(8)),
  null,
  'A: the refunded item has no retry_at'
);

-- Item 9: permanent error, then a user retry.
select pg_temp.add(9, 'photo-9');
insert into test_vals (k, v) values ('c9', pg_temp.claim(9)::text);

select is(
  library.release_intake_item(pg_temp.item(9), pg_temp.tok('c9'), 'vision_refused', null,
                              '{"input_tokens":3}')
    || ':' || pg_temp.st(9),
  'failed:failed:1:vision_refused',
  'A: release with vision_refused fails the item'
);

select is(
  (select vision_usage ->> 'input_tokens' from library.intake_items where id = pg_temp.item(9)),
  '3',
  'A: release stores the usage'
);

select is(
  library.retry_intake_item(pg_temp.item(9))::text || ':' || pg_temp.st(9),
  'true:pending:1:',
  'A: retry_intake_item re-queues a failed item and clears error_code'
);

select is(
  library.retry_intake_item(pg_temp.item(1)),
  false,
  'A: retry_intake_item on an item with 3 attempts returns false'
);

---------------------------------------------------------------------------
-- Confirm.
---------------------------------------------------------------------------
insert into test_vals (k, v)
select 'conf5', to_jsonb(r)::text
  from library.confirm_intake_item(
         pg_temp.item(5), null,
         '{"title":"Invented Title","authors":["Invented Author"],"isbn13":[],"page_count":123}',
         '{"owner_user_id":"11111111-1111-1111-1111-111111111111","edition_note":"Invented edition","location":"Shelf"}') r;

insert into test_vals (k, v)
select 'book5', v::jsonb ->> 'book_id' from test_vals where k = 'conf5';
insert into test_vals (k, v)
select 'copy5', v::jsonb ->> 'copy_id' from test_vals where k = 'conf5';

select is(
  (select b.title || ':' || array_to_string(b.authors, ',') || ':' || b.page_count
     from library.books b where b.id = (select v::uuid from test_vals where k = 'book5')
      and b.household_id = pg_temp.hh()),
  'Invented Title:Invented Author:123',
  'A: confirm with a new book creates the book in the item''s household'
);

select is(
  (select c.origin || ':' || (c.photo_path = pg_temp.path(5, 'cover.jpg')) || ':'
          || (c.intake_item_id = pg_temp.item(5)) || ':' || c.owner_user_id || ':'
          || c.edition_note || ':' || c.location
     from library.copies c where c.id = (select v::uuid from test_vals where k = 'copy5')),
  'photo:true:true:11111111-1111-1111-1111-111111111111:Invented edition:Shelf',
  'A: the copy has origin photo, the cover as photo_path and intake_item_id'
);

select is(
  (select status || ':' || (result_book_id::text = (select v from test_vals where k = 'book5'))
          || ':' || (result_copy_id::text = (select v from test_vals where k = 'copy5'))
     from library.intake_items where id = pg_temp.item(5)),
  'confirmed:true:true',
  'A: the item is confirmed with its result ids'
);

insert into test_vals (k, v)
select 'counts_before', (select count(*) from library.books where household_id = pg_temp.hh())
                        || ':' || (select count(*) from library.copies);

select is(
  (select to_jsonb(r)::text from library.confirm_intake_item(
     pg_temp.item(5), null,
     '{"title":"Invented Title","authors":["Invented Author"]}',
     '{"owner_user_id":"11111111-1111-1111-1111-111111111111"}') r)
    || ':' || (select count(*) from library.books where household_id = pg_temp.hh())
    || ':' || (select count(*) from library.copies),
  (select v from test_vals where k = 'conf5') || ':' || (select v from test_vals where k = 'counts_before'),
  'A: a second identical confirm returns the same ids and writes nothing'
);

-- Item 1 is failed (attempts exhausted); confirm it into the existing book.
select lives_ok(
  $$ select * from library.confirm_intake_item(
       pg_temp.item(1), (select v::uuid from test_vals where k = 'book5'), null,
       '{"owner_user_id":null}') $$,
  'A: a failed item can be confirmed into an existing book'
);

select is(
  (select count(*)::int from library.copies
    where book_id = (select v::uuid from test_vals where k = 'book5')),
  2,
  'A: confirming into an existing book adds a copy'
);

select throws_ok(
  $$ select * from library.confirm_intake_item(
       pg_temp.item(7), 'dddddddd-0000-0000-0000-000000000001', null, '{}') $$,
  '42501', null,
  'A: confirming into another household''s book is denied'
);

select throws_ok(
  $$ select * from library.confirm_intake_item(pg_temp.item(7), null, '{"title":"   "}', '{}') $$,
  '22023', null,
  'A: a blank title is rejected'
);

select throws_ok(
  $$ select * from library.confirm_intake_item(pg_temp.item(9), null, '{"title":"Invented"}', '{}') $$,
  'P0001', 'not_confirmable',
  'A: a pending item is not confirmable'
);

select throws_ok(
  $$ insert into library.copies (book_id, origin, intake_item_id)
     values ((select v::uuid from test_vals where k = 'book5'), 'photo', pg_temp.item(5)) $$,
  '23505', null,
  'A: a second copy with the same intake_item_id is rejected'
);

---------------------------------------------------------------------------
-- Purge.
---------------------------------------------------------------------------
reset role;
insert into storage.objects (bucket_id, name, owner, created_at)
values
  ('library-intake', pg_temp.path(50, 'cover.jpg'), '11111111-1111-1111-1111-111111111111',
   now() - interval '25 hours'),
  ('library-intake', pg_temp.path(51, 'cover.jpg'), '11111111-1111-1111-1111-111111111111',
   now() - interval '1 hour');
set local role authenticated;

select is(
  (select count(*)::int from library.intake_purgeable(pg_temp.hh())
    where path in (pg_temp.path(2, 'cover.jpg'), pg_temp.path(2, 'title.jpg'))),
  2,
  'A: a discarded item lists both paths'
);

select is(
  (select bool_or(path = pg_temp.path(1, 'title.jpg')) || ':' || bool_or(path = pg_temp.path(1, 'cover.jpg'))
     from library.intake_purgeable(pg_temp.hh())),
  'true:false',
  'A: a confirmed item lists its title page but not its kept cover'
);

select is(
  (select bool_or(path = pg_temp.path(50, 'cover.jpg')) || ':' || bool_or(path = pg_temp.path(51, 'cover.jpg'))
     from library.intake_purgeable(pg_temp.hh())),
  'true:false',
  'A: an orphan object older than 24 hours is listed; a 1-hour-old one is not'
);

delete from library.copies
 where id = (select result_copy_id from library.intake_items where id = pg_temp.item(1));

select is(
  (select bool_or(path = pg_temp.path(1, 'cover.jpg')) from library.intake_purgeable(pg_temp.hh())),
  true,
  'A: after its copy is deleted, the confirmed item lists its cover too'
);

select is(
  library.mark_intake_purged(pg_temp.hh(), array(select path from library.intake_purgeable(pg_temp.hh()))),
  4,
  'A: mark_intake_purged nulls the four item paths'
);

-- The Storage API removes the orphan object; simulate that as postgres.
reset role;
set local storage.allow_delete_query = 'true';
delete from storage.objects where name = pg_temp.path(50, 'cover.jpg');
set local role authenticated;

select is_empty(
  $$ select path from library.intake_purgeable(pg_temp.hh()) $$,
  'A: after marking and removing, nothing is purgeable'
);

set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';

select throws_ok(
  $$ select * from library.intake_purgeable(pg_temp.hh()) $$,
  '42501', null,
  'B (non-member): intake_purgeable for A''s household is denied'
);

select throws_ok(
  $$ select library.mark_intake_purged(pg_temp.hh(), array['x']) $$,
  '42501', null,
  'B (non-member): mark_intake_purged for A''s household is denied'
);

---------------------------------------------------------------------------
-- anon has no access.
---------------------------------------------------------------------------
reset role;
set local role anon;
set local request.jwt.claims = '{"role":"anon"}';

select throws_ok(
  'select id from library.intake_items',
  '42501', null,
  'anon: selecting intake_items is denied'
);

select throws_ok(
  $$ select * from library.claim_intake_item('cccccccc-0000-0000-0000-000000000001') $$,
  '42501', null,
  'anon: executing claim_intake_item is denied'
);

reset role;

select * from finish();
rollback;
