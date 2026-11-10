-- pgTAP: library scan intake (barcode scans as intake items), edition labels,
-- copy notes and the one-time move of Claude-written edition notes.
-- Proves that a scan is created ready through create_scan_item only, can
-- never be claimed or billed, confirms into an origin 'scan' copy, that the
-- new p_copy contract of confirm_intake_item keeps Plan 3's payloads working,
-- that move_claude_edition_notes moves exactly what Plan 3 wrote, and that
-- non-members still see and change nothing.
begin;

create extension if not exists pgtap with schema extensions;

select plan(63);

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

create function pg_temp.batch() returns uuid language sql as
$$ select 'bbbbbbbb-0000-0000-0000-000000000001'::uuid $$;

create function pg_temp.path(n int, f text) returns text language sql as
$$ select pg_temp.hh()::text || '/' || pg_temp.item(n)::text || '/' || f $$;

create function pg_temp.hash(seed text) returns text language sql as
$$ select encode(sha256(convert_to(seed, 'UTF8')), 'hex') $$;

-- Creates scan item n in A's household, owned by A, as the current user.
create function pg_temp.scan(n int, isbn text, edition text default null,
                             extra boolean default false)
returns text language sql as
$$ select library.create_scan_item(pg_temp.item(n), pg_temp.hh(), pg_temp.batch(),
                                   '11111111-1111-1111-1111-111111111111', isbn, edition, extra) $$;

-- Inserts photo item n with a cover as the current user.
create function pg_temp.add(n int, seed text) returns void language sql as
$$ insert into library.intake_items (id, household_id, batch_id, cover_path, source_hash)
   values (pg_temp.item(n), pg_temp.hh(), pg_temp.batch(), pg_temp.path(n, 'cover.jpg'),
           pg_temp.hash(seed)) $$;

create function pg_temp.st(n int) returns text language sql as
$$ select status || ':' || attempts || ':' || coalesce(error_code, '')
     from library.intake_items where id = pg_temp.item(n) $$;

create function pg_temp.calls() returns int language sql as
$$ select coalesce(sum(vision_calls), 0)::int from library.intake_usage
    where household_id = pg_temp.hh() and day = (now() at time zone 'utc')::date $$;

-- Confirms item n as a new book and returns {book_id, copy_id}.
create function pg_temp.confirm(n int, p_copy jsonb) returns jsonb language sql as
$$ select to_jsonb(r) from library.confirm_intake_item(
     pg_temp.item(n), null, '{"title":"Invented Title","authors":["Invented Author"]}', p_copy) r $$;

-- origin:photo_path-or-null:edition_note:copy_note:linked for a copy id.
create function pg_temp.copy_row(p_copy uuid) returns text language sql as
$$ select c.origin || ':' || coalesce(c.photo_path, 'null') || ':' ||
          coalesce(c.edition_note, 'null') || ':' || coalesce(c.copy_note, 'null') || ':' ||
          coalesce(c.intake_item_id::text, 'null')
     from library.copies c where c.id = p_copy $$;

-- edition_note|copy_note for a seeded cleanup copy.
create function pg_temp.notes(p_copy uuid) returns text language sql as
$$ select coalesce(edition_note, 'null') || '|' || coalesce(copy_note, 'null')
     from library.copies where id = p_copy $$;

create function pg_temp.seed_copy(n int) returns uuid language sql as
$$ select ('dddddddd-0000-0000-0000-' || lpad(n::text, 12, '0'))::uuid $$;

---------------------------------------------------------------------------
-- Schema.
---------------------------------------------------------------------------
select ok(library.isbn13_is_valid('9780000000002'), 'isbn13_is_valid: a 978 ISBN with a valid checksum');
select ok(library.isbn13_is_valid('9791000000008'), 'isbn13_is_valid: a 979 ISBN with a valid checksum');
select ok(library.isbn13_is_valid('9790000000001'), 'isbn13_is_valid: 9790 (ISMN range) is accepted (D13)');
select ok(not library.isbn13_is_valid('9780000000003'), 'isbn13_is_valid: a bad checksum is rejected');
select ok(not library.isbn13_is_valid('978000000000'), 'isbn13_is_valid: 12 digits are rejected');
select ok(not library.isbn13_is_valid('9770000000000'), 'isbn13_is_valid: a 977 prefix is rejected');

select has_column('library', 'intake_items', 'source', 'intake_items.source exists');
select has_column('library', 'intake_items', 'scanned_isbn', 'intake_items.scanned_isbn exists');
select has_column('library', 'intake_items', 'edition_label', 'intake_items.edition_label exists');
select has_column('library', 'intake_items', 'extra_copy', 'intake_items.extra_copy exists');
select has_column('library', 'copies', 'copy_note', 'copies.copy_note exists');

---------------------------------------------------------------------------
-- B gets a household (so B is a real user who isn't in A's).
---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';

insert into test_vals (k, v)
select 'bhh', library.create_household('B Home', 'B')::text;

---------------------------------------------------------------------------
-- Create (A).
---------------------------------------------------------------------------
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

insert into test_vals (k, v)
select 'hh', library.create_household('Home', 'Tierra')::text;

select is(
  pg_temp.scan(1, '9780000000002', ' Invented Box ', false),
  'created',
  'A: create_scan_item returns created'
);

select is(
  (select status || ':' || source || ':' || coalesce(source_hash, 'null') || ':'
          || coalesce(cover_path, 'null') || ':' || edition_label || ':' || uploaded_by || ':'
          || scanned_isbn || ':' || extra_copy || ':' || batch_id || ':' || owner_user_id
     from library.intake_items where id = pg_temp.item(1)),
  'ready:scan:null:null:Invented Box:11111111-1111-1111-1111-111111111111:9780000000002:false:'
    || 'bbbbbbbb-0000-0000-0000-000000000001:11111111-1111-1111-1111-111111111111',
  'A: the scan is ready, source scan, no hash or cover, trimmed edition, uploaded by A'
);

select is(
  pg_temp.scan(1, '9780000000002', ' Invented Box ', false)
    || ':' || (select count(*) from library.intake_items),
  'exists:1',
  'A: the same call again returns exists and adds no item'
);

select throws_ok(
  $$ select pg_temp.scan(2, '9780000000003') $$,
  '23514', null,
  'A: an ISBN with a bad checksum violates the check'
);

select throws_ok(
  $$ select library.create_scan_item(pg_temp.item(2), pg_temp.hh(), pg_temp.batch(),
                                     '22222222-2222-2222-2222-222222222222',
                                     '9780000000002', null, false) $$,
  '22023', null,
  'A: an owner who isn''t a member of the household is rejected'
);

select pg_temp.scan(3, '9780000000019', '   ', false);

select is(
  (select coalesce(edition_label, 'null') from library.intake_items where id = pg_temp.item(3)),
  'null',
  'A: a blank edition is stored as null'
);

select throws_ok(
  $$ select pg_temp.scan(2, '9780000000002', repeat('x', 121)) $$,
  '23514', null,
  'A: a 121-character edition violates the check'
);

select pg_temp.add(20, 'photo-20');

select throws_ok(
  $$ select pg_temp.scan(20, '9780000000002') $$,
  '42501', null,
  'A: reusing a photo item''s id is denied'
);

select pg_temp.scan(4, '9780000000026', 'Invented Slipcase', true);

select is(
  (select extra_copy from library.intake_items where id = pg_temp.item(4)),
  true,
  'A: extra_copy is stored'
);

---------------------------------------------------------------------------
-- Never claimable, never billed.
---------------------------------------------------------------------------
select is(
  (select outcome from library.claim_intake_item(pg_temp.item(1)))
    || ':' || pg_temp.st(1) || ':' || pg_temp.calls(),
  'done:ready:0::0',
  'A: claiming a scan returns done, bills nothing, and leaves it ready with 0 attempts'
);

set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';

select throws_ok(
  $$ select * from library.claim_intake_item(pg_temp.item(1)) $$,
  '42501', null,
  'B (non-member): claiming A''s scan is denied'
);

select throws_ok(
  $$ select * from library.claim_intake_item('eeeeeeee-0000-0000-0000-000000000001') $$,
  '42501', null,
  'B (non-member): claiming a random id is denied the same way'
);

reset role;

select throws_ok(
  $$ update library.intake_items set status = 'pending' where id = pg_temp.item(1) $$,
  '23514', null,
  'postgres: a scan can''t be made pending'
);

select throws_ok(
  $$ update library.intake_items set cover_path = pg_temp.path(1, 'cover.jpg')
      where id = pg_temp.item(1) $$,
  '23514', null,
  'postgres: a scan can''t get a cover_path'
);

select throws_ok(
  $$ update library.intake_items set source_hash = pg_temp.hash('scan-1')
      where id = pg_temp.item(1) $$,
  '23514', null,
  'postgres: a scan can''t get a source_hash'
);

set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

select is(
  library.retry_intake_item(pg_temp.item(1)),
  false,
  'A: retry_intake_item on a scan returns false'
);

select throws_ok(
  $$ insert into library.intake_items (id, household_id, batch_id, source, scanned_isbn)
     values (pg_temp.item(90), pg_temp.hh(), pg_temp.batch(), 'scan', '9780000000002') $$,
  '42501', null,
  'A: setting source on insert is denied (column grant)'
);

select throws_ok(
  $$ insert into library.intake_items (id, household_id, batch_id, cover_path, source_hash, status)
     values (pg_temp.item(91), pg_temp.hh(), pg_temp.batch(), pg_temp.path(91, 'cover.jpg'),
             pg_temp.hash('x91'), 'ready') $$,
  '42501', null,
  'A: setting status on insert is denied (column grant)'
);

select throws_ok(
  $$ insert into library.intake_items (id, household_id, batch_id, cover_path)
     values (pg_temp.item(92), pg_temp.hh(), pg_temp.batch(), pg_temp.path(92, 'cover.jpg')) $$,
  '23514', null,
  'A: a photo insert without source_hash violates the shape check'
);

---------------------------------------------------------------------------
-- A photo with a scanned ISBN (photo taken for a not-found scan).
---------------------------------------------------------------------------
select lives_ok(
  $$ insert into library.intake_items
       (id, household_id, batch_id, cover_path, source_hash, scanned_isbn, edition_label)
     values (pg_temp.item(21), pg_temp.hh(), pg_temp.batch(), pg_temp.path(21, 'cover.jpg'),
             pg_temp.hash('photo-21'), '9780000000033', 'Invented Box') $$,
  'A: inserts a photo item with scanned_isbn and edition_label'
);

do $$
declare n int;
begin
  update library.intake_items set edition_label = 'Invented foil' where id = pg_temp.item(21);
  get diagnostics n = row_count;
  insert into test_vals (k, v) values ('a_label_rows', n::text);
end
$$;

select is(
  (select v from test_vals where k = 'a_label_rows'),
  '1',
  'A (member): updating edition_label changes one row'
);

---------------------------------------------------------------------------
-- Discard a scan replaced by a photo.
---------------------------------------------------------------------------
select is(
  library.discard_intake_item(pg_temp.item(3), 'replaced_by_photo'),
  true,
  'A: discard_intake_item(scan, replaced_by_photo) returns true'
);

select is(
  (select status || ':' || discard_reason from library.intake_items where id = pg_temp.item(3)),
  'discarded:replaced_by_photo',
  'A: the replaced_by_photo reason is stored'
);

---------------------------------------------------------------------------
-- Confirm.
---------------------------------------------------------------------------
insert into test_vals (k, v)
select 'conf1', pg_temp.confirm(1, '{"edition_note":"Invented Box","copy_note":"Sprayed edges"}')::text;

select is(
  pg_temp.copy_row((select (v::jsonb ->> 'copy_id')::uuid from test_vals where k = 'conf1')),
  'scan:null:Invented Box:Sprayed edges:' || pg_temp.item(1),
  'A: a confirmed scan makes an origin scan copy with no photo, the edition and the note'
);

select is(
  pg_temp.confirm(1, '{"edition_note":"Other","copy_note":"Other"}')::text,
  (select v from test_vals where k = 'conf1'),
  'A: confirming the scan again returns the same ids'
);

select is(
  pg_temp.copy_row((pg_temp.confirm(4, '{}') ->> 'copy_id')::uuid),
  'scan:null:Invented Slipcase:null:' || pg_temp.item(4),
  'A: a scan confirmed with {} takes the item''s edition_label'
);

select pg_temp.scan(5, '9780000000033', 'Invented Slipcase', false);

select is(
  pg_temp.copy_row((pg_temp.confirm(5, '{"edition_note":null}') ->> 'copy_id')::uuid),
  'scan:null:null:null:' || pg_temp.item(5),
  'A: an explicit null edition_note clears the edition'
);

-- Photo items 21 (labelled), 22 and 23 (Plan 3 style), made ready as the
-- Edge Function would.
select pg_temp.add(22, 'photo-22');
select pg_temp.add(23, 'photo-23');
reset role;
update library.intake_items set status = 'ready'
 where id in (pg_temp.item(21), pg_temp.item(22), pg_temp.item(23));
set local role authenticated;

select is(
  pg_temp.copy_row((pg_temp.confirm(21, '{}') ->> 'copy_id')::uuid),
  'photo:' || pg_temp.path(21, 'cover.jpg') || ':Invented foil:null:' || pg_temp.item(21),
  'A: a photo item still gets origin photo, its cover as photo_path and its label'
);

select is(
  pg_temp.copy_row((pg_temp.confirm(22, '{}') ->> 'copy_id')::uuid),
  'photo:' || pg_temp.path(22, 'cover.jpg') || ':null:null:' || pg_temp.item(22),
  'A: a Plan 3 photo confirmed with {} still gets no edition and no note'
);

select is(
  pg_temp.copy_row((pg_temp.confirm(23, '{"edition_note":"Invented edition"}') ->> 'copy_id')::uuid),
  'photo:' || pg_temp.path(23, 'cover.jpg') || ':Invented edition:null:' || pg_temp.item(23),
  'A: a Plan 3 edition_note payload still sets the edition'
);

---------------------------------------------------------------------------
-- Cleanup: move_claude_edition_notes (as postgres, on seeded rows).
---------------------------------------------------------------------------
reset role;

insert into library.books (id, household_id, title)
values ('dddddddd-1111-0000-0000-000000000001', pg_temp.hh(), 'Invented Seed Book');

-- Confirmed photo items with Claude's clues, one per seeded copy.
insert into library.intake_items (id, household_id, batch_id, source_hash, status, extraction)
select pg_temp.item(100 + n), pg_temp.hh(), pg_temp.batch(), pg_temp.hash('seed-' || n),
       'confirmed', jsonb_build_object('editionClues', clues)
  from (values
    (1, '["Invented Box"]'::jsonb),
    (2, '["Invented foil","Signed"]'),
    (3, '[" Invented foil "]'),
    (4, '["Invented foil","Signed"]'),
    (5, '["Invented foil","Signed"]'),
    (6, '["Invented foil","Signed"]'),
    (7, '["Invented foil","Signed"]'),
    (8, '[]')
  ) s(n, clues);

insert into library.copies (id, book_id, origin, edition_note, intake_item_id, created_at)
select pg_temp.seed_copy(n), 'dddddddd-1111-0000-0000-000000000001', origin, note,
       case when n = 9 then null else pg_temp.item(100 + n) end, created
  from (values
    (1, 'photo',  'Invented Box',           now() + interval '1 minute'),
    (2, 'photo',  'Invented foil; Signed',  now() - interval '1 day'),
    (3, 'photo',  'Invented foil',          now() - interval '1 day'),
    (4, 'photo',  'Invented foil; Signed!', now() - interval '1 day'),
    (5, 'photo',  'Signed; Invented foil',  now() - interval '1 day'),
    (6, 'libib',  'Invented foil; Signed',  now() - interval '1 day'),
    (7, 'manual', 'Invented foil; Signed',  now() - interval '1 day'),
    (8, 'photo',  null,                     now() - interval '1 day'),
    (9, 'photo',  'Invented foil; Signed',  now() - interval '1 day')
  ) s(n, origin, note, created);

insert into test_vals (k, v)
select 'moved_first', library.move_claude_edition_notes(now())::text;

select is(
  pg_temp.notes(pg_temp.seed_copy(1)),
  'Invented Box|null',
  'cleanup: a copy created after p_before is untouched, even when it matches'
);

select is(
  pg_temp.notes(pg_temp.seed_copy(2)),
  'null|Invented foil; Signed',
  'cleanup: clues joined with "; " are moved to copy_note'
);

select is(
  pg_temp.notes(pg_temp.seed_copy(3)),
  'null|Invented foil',
  'cleanup: a trimmed clue is moved'
);

select is(
  pg_temp.notes(pg_temp.seed_copy(4)),
  'Invented foil; Signed!|null',
  'cleanup: an edited note is untouched'
);

select is(
  pg_temp.notes(pg_temp.seed_copy(5)),
  'Signed; Invented foil|null',
  'cleanup: clues in a different order are untouched'
);

select is(
  pg_temp.notes(pg_temp.seed_copy(6)) || ' ' || pg_temp.notes(pg_temp.seed_copy(7)),
  'Invented foil; Signed|null Invented foil; Signed|null',
  'cleanup: libib and manual copies are untouched'
);

select is(
  pg_temp.notes(pg_temp.seed_copy(8)),
  'null|null',
  'cleanup: a photo copy with empty clues and no note is untouched'
);

select is(
  pg_temp.notes(pg_temp.seed_copy(9)),
  'Invented foil; Signed|null',
  'cleanup: a photo copy with no intake_item_id is untouched'
);

select is(
  (select v from test_vals where k = 'moved_first'),
  '2',
  'cleanup: the first call moves 2 copies'
);

insert into test_vals (k, v)
select 'notes_before', string_agg(id::text || '=' || pg_temp.notes(id), ',' order by id)
  from library.copies;
insert into test_vals (k, v)
select 'moved_second', library.move_claude_edition_notes(now())::text;

select is(
  (select v from test_vals where k = 'moved_second') || ':' ||
  ((select string_agg(id::text || '=' || pg_temp.notes(id), ',' order by id) from library.copies)
     = (select v from test_vals where k = 'notes_before')),
  '0:true',
  'cleanup: a second call returns 0 and changes nothing'
);

set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

select throws_ok(
  $$ select library.move_claude_edition_notes(now()) $$,
  '42501', null,
  'authenticated: executing move_claude_edition_notes is denied'
);

reset role;
set local role anon;
set local request.jwt.claims = '{"role":"anon"}';

select throws_ok(
  $$ select library.move_claude_edition_notes(now()) $$,
  '42501', null,
  'anon: executing move_claude_edition_notes is denied'
);

reset role;

select is(
  (select prosecdef from pg_proc where oid = 'library.move_claude_edition_notes(timestamptz)'::regprocedure),
  false,
  'move_claude_edition_notes is security invoker'
);

select is(
  (select count(*)::int from pg_proc
    where oid in ('library.move_claude_edition_notes(timestamptz)'::regprocedure,
                  'library.create_scan_item(uuid, uuid, uuid, uuid, text, text, boolean)'::regprocedure,
                  'library.isbn13_is_valid(text)'::regprocedure)
      and proconfig @> array['search_path=""']),
  3,
  'the new functions all set search_path to empty'
);

---------------------------------------------------------------------------
-- RLS unchanged for non-members (B).
---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';

select is_empty(
  $$ select id from library.intake_items where id = pg_temp.item(4) $$,
  'B (non-member): sees none of A''s scan items'
);

select throws_ok(
  $$ select library.create_scan_item(pg_temp.item(60), pg_temp.hh(), pg_temp.batch(), null,
                                     '9780000000002', null, false) $$,
  '42501', null,
  'B (non-member): create_scan_item into A''s household is denied'
);

do $$
declare n int;
begin
  update library.intake_items set edition_label = 'Invented B' where id = pg_temp.item(4);
  get diagnostics n = row_count;
  insert into test_vals (k, v) values ('b_label_rows', n::text);
end
$$;

select is(
  (select v from test_vals where k = 'b_label_rows'),
  '0',
  'B (non-member): updating edition_label on A''s item changes 0 rows'
);

select is_empty(
  $$ select id, copy_note from library.copies $$,
  'B (non-member): sees none of A''s copies or their copy_note'
);

---------------------------------------------------------------------------
-- anon has no access; claim_token stays hidden from members.
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
  $$ select library.create_scan_item(pg_temp.item(61), pg_temp.hh(), pg_temp.batch(), null,
                                     '9780000000002', null, false) $$,
  '42501', null,
  'anon: executing create_scan_item is denied'
);

reset role;
set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

select throws_ok(
  $$ select claim_token from library.intake_items $$,
  '42501', null,
  'A (member): selecting claim_token is still denied'
);

select is(
  (select count(*)::int from (
     select id, source, scanned_isbn, edition_label, extra_copy from library.intake_items) s),
  (select count(*)::int from library.intake_items),
  'A (member): the new columns are selectable'
);

reset role;

select * from finish();
rollback;
