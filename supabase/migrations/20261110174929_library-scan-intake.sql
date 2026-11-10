-- Library scan intake: barcode scans become intake items, items and copies
-- carry an edition label, copies get a free-text note, and the edition notes
-- Plan 3 copied from Claude's editionClues move into that note once.
--
-- A scan is an intake_items row with source = 'scan', a scanned_isbn and no
-- photo. It is created only through create_scan_item, directly as 'ready',
-- and intake_items_source_shape keeps it out of pending/processing/failed,
-- so the vision queue can never claim or bill it. claim_intake_item also
-- answers 'done' for a scan (after its usual 42501 check).
--
-- confirm_intake_item keeps its arguments. Its p_copy contract:
--   edition_note: the key's value when present (null clears it), else the
--                 item's edition_label;
--   copy_note:    p_copy ->> 'copy_note';
--   origin:       'scan' for a scan item, else 'photo';
--   photo_path:   the item's cover_path (null for a scan).
-- The Plan 3 app always sends edition_note and never copy_note, so it keeps
-- working unchanged.
--
-- Every security definer function checks library.is_member itself and uses
-- an empty search_path. move_claude_edition_notes is security invoker and
-- executable by no client role: only the migration owner runs it.
--
-- Idempotent: safe to re-run. The cleanup runs only on the application that
-- adds copies.copy_note (recorded by the first statement), with that
-- application's now() as its cutoff.

---------------------------------------------------------------------------
-- Run the cleanup only if copy_note doesn't exist yet.
---------------------------------------------------------------------------

do $$
begin
  perform set_config(
    'library.scan_intake_cleanup',
    case when exists (select 1 from pg_catalog.pg_attribute a
                       where a.attrelid = 'library.copies'::regclass
                         and a.attname = 'copy_note'
                         and not a.attisdropped)
         then 'skip' else 'run' end,
    true);
end
$$;

---------------------------------------------------------------------------
-- ISBN-13 check: 978 or any 979 prefix (including 9790), 13 digits, EAN
-- checksum. The same rule as the app's normalizeIsbn13.
---------------------------------------------------------------------------

create or replace function library.isbn13_is_valid(p text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select case
           when p ~ '^97[89][0-9]{10}$' then
             (select sum(substr(p, d.i, 1)::int * case when d.i % 2 = 1 then 1 else 3 end) % 10 = 0
                from generate_series(1, 13) d(i))
           else false
         end;
$$;

---------------------------------------------------------------------------
-- intake_items: source, scanned ISBN, edition label, deliberate extra copy
---------------------------------------------------------------------------

alter table library.intake_items
  add column if not exists source        text not null default 'photo',
  add column if not exists scanned_isbn  text,
  add column if not exists edition_label text,
  add column if not exists extra_copy    boolean not null default false;

-- Scans have no photo, so no hash. Its format check stays.
alter table library.intake_items alter column source_hash drop not null;

alter table library.intake_items drop constraint if exists intake_items_source_check;
alter table library.intake_items add constraint intake_items_source_check
  check (source in ('photo', 'scan'));

alter table library.intake_items drop constraint if exists intake_items_scanned_isbn_check;
alter table library.intake_items add constraint intake_items_scanned_isbn_check
  check (scanned_isbn is null or library.isbn13_is_valid(scanned_isbn));

alter table library.intake_items drop constraint if exists intake_items_edition_label_check;
alter table library.intake_items add constraint intake_items_edition_label_check
  check (edition_label is null
         or (edition_label = btrim(edition_label)
             and edition_label <> ''
             and char_length(edition_label) <= 120));

alter table library.intake_items drop constraint if exists intake_items_cover_required;
alter table library.intake_items add constraint intake_items_cover_required
  check (cover_path is not null or status in ('confirmed', 'discarded') or source = 'scan');

-- A photo has a hash. A scan has an ISBN, no hash, no photos, and is never
-- pending, processing or failed, so it can never be claimed.
alter table library.intake_items drop constraint if exists intake_items_source_shape;
alter table library.intake_items add constraint intake_items_source_shape
  check ((source = 'photo' and source_hash is not null)
         or (source = 'scan'
             and source_hash is null
             and scanned_isbn is not null
             and cover_path is null
             and title_page_path is null
             and status in ('ready', 'confirmed', 'discarded')));

alter table library.intake_items drop constraint if exists intake_items_discard_reason_check;
alter table library.intake_items add constraint intake_items_discard_reason_check
  check (discard_reason in ('discarded', 'already_recorded', 'replaced_by_photo'));

---------------------------------------------------------------------------
-- copies: scan origin, copy note
---------------------------------------------------------------------------

alter table library.copies add column if not exists copy_note text;

alter table library.copies drop constraint if exists copies_copy_note_check;
alter table library.copies add constraint copies_copy_note_check
  check (copy_note is null or char_length(copy_note) <= 2000);

alter table library.copies drop constraint if exists copies_origin_check;
alter table library.copies add constraint copies_origin_check
  check (origin in ('libib', 'photo', 'manual', 'scan'));

---------------------------------------------------------------------------
-- RPCs (security definer, empty search_path, explicit membership check)
---------------------------------------------------------------------------

-- Saves one scan as a ready intake item. Idempotent on p_item: a resend of
-- the same scan returns 'exists'. Any other existing row with that id raises
-- the same 42501 as a foreign household, so ids can't be probed.
create or replace function library.create_scan_item(p_item uuid, p_household uuid, p_batch uuid,
                                                    p_owner uuid, p_isbn text, p_edition text,
                                                    p_extra_copy boolean)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rows      int;
  v_source    text;
  v_household uuid;
begin
  if p_household is null or not library.is_member(p_household) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  if p_owner is not null and not exists (
       select 1 from library.household_members m
        where m.household_id = p_household and m.user_id = p_owner) then
    raise exception 'owner_not_member' using errcode = '22023';
  end if;

  insert into library.intake_items (id, household_id, uploaded_by, batch_id, owner_user_id,
                                    source, scanned_isbn, edition_label, extra_copy, status)
  values (p_item, p_household, auth.uid(), p_batch, p_owner,
          'scan', p_isbn, nullif(btrim(p_edition), ''), coalesce(p_extra_copy, false), 'ready')
  on conflict (id) do nothing;
  get diagnostics v_rows = row_count;

  if v_rows > 0 then
    return 'created';
  end if;

  select i.source, i.household_id into v_source, v_household
    from library.intake_items i where i.id = p_item;
  if v_source = 'scan' and v_household = p_household then
    return 'exists';
  end if;

  raise exception 'not_authorized' using errcode = '42501';
end;
$$;

create or replace function library.claim_intake_item(p_item uuid)
returns table (outcome text, claim_token uuid, attempts int, cover_path text,
               title_page_path text, retry_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_item  library.intake_items%rowtype;
  v_calls int;
  v_token uuid;
begin
  select i.* into v_item from library.intake_items i where i.id = p_item for update;
  if not found or not library.is_member(v_item.household_id) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  -- A scan never goes to the vision model and never bills.
  if v_item.source = 'scan' then
    return query select 'done'::text, null::uuid, v_item.attempts, null::text, null::text, null::timestamptz;
    return;
  end if;

  if v_item.status in ('ready', 'confirmed', 'discarded', 'failed') then
    return query select 'done'::text, null::uuid, v_item.attempts, null::text, null::text, null::timestamptz;
    return;
  end if;

  if v_item.status = 'processing' and v_item.claimed_at > now() - interval '7 minutes' then
    return query select 'busy'::text, null::uuid, v_item.attempts, null::text, null::text, null::timestamptz;
    return;
  end if;

  if v_item.status = 'pending' and v_item.retry_at > now() then
    return query select 'retry_later'::text, null::uuid, v_item.attempts, null::text, null::text, v_item.retry_at;
    return;
  end if;

  -- Due: pending, or processing with an expired lease.
  if v_item.attempts >= 3 then
    update library.intake_items i
       set status = 'failed', error_code = 'attempts_exhausted', claim_token = null, retry_at = null
     where i.id = p_item;
    return query select 'failed'::text, null::uuid, v_item.attempts, null::text, null::text, null::timestamptz;
    return;
  end if;

  insert into library.intake_usage as u (household_id, day, vision_calls)
  values (v_item.household_id, (now() at time zone 'utc')::date, 1)
  on conflict (household_id, day) do update
    set vision_calls = u.vision_calls + 1
    where u.vision_calls < 500
  returning u.vision_calls into v_calls;

  if v_calls is null then
    return query select 'daily_cap'::text, null::uuid, v_item.attempts, null::text, null::text, null::timestamptz;
    return;
  end if;

  v_token := gen_random_uuid();
  update library.intake_items i
     set status = 'processing', attempts = i.attempts + 1, claim_token = v_token,
         claimed_at = now(), retry_at = null, error_code = null
   where i.id = p_item;

  return query select 'claimed'::text, v_token, v_item.attempts + 1, v_item.cover_path,
                      v_item.title_page_path, null::timestamptz;
end;
$$;

create or replace function library.confirm_intake_item(p_item uuid, p_book_id uuid,
                                                       p_book jsonb, p_copy jsonb)
returns table (book_id uuid, copy_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_item  library.intake_items%rowtype;
  v_book  uuid;
  v_copy  uuid;
  v_title text;
  v_copy_in jsonb := coalesce(p_copy, '{}'::jsonb);
begin
  select i.* into v_item from library.intake_items i where i.id = p_item for update;
  if not found or not library.is_member(v_item.household_id) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  -- Idempotent: a confirmed item returns its stored result and writes nothing.
  if v_item.status = 'confirmed' then
    return query select v_item.result_book_id, v_item.result_copy_id;
    return;
  end if;

  if v_item.status not in ('ready', 'failed') then
    raise exception 'not_confirmable';
  end if;

  if p_book_id is null then
    v_title := btrim(p_book ->> 'title');
    if v_title is null or v_title = '' then
      raise exception 'title_required' using errcode = '22023';
    end if;

    insert into library.books (household_id, title, authors, synopsis, cover_url, isbn13, isbn10,
                               openlibrary_id, google_books_id, page_count, publisher, publish_date)
    values (
      v_item.household_id,
      v_title,
      array(select e.value from jsonb_array_elements_text(
              case when jsonb_typeof(p_book -> 'authors') = 'array' then p_book -> 'authors' else '[]' end)
              with ordinality e(value, ord) order by e.ord),
      p_book ->> 'synopsis',
      p_book ->> 'cover_url',
      array(select e.value from jsonb_array_elements_text(
              case when jsonb_typeof(p_book -> 'isbn13') = 'array' then p_book -> 'isbn13' else '[]' end)
              with ordinality e(value, ord) order by e.ord),
      array(select e.value from jsonb_array_elements_text(
              case when jsonb_typeof(p_book -> 'isbn10') = 'array' then p_book -> 'isbn10' else '[]' end)
              with ordinality e(value, ord) order by e.ord),
      p_book ->> 'openlibrary_id',
      p_book ->> 'google_books_id',
      (p_book ->> 'page_count')::int,
      p_book ->> 'publisher',
      p_book ->> 'publish_date'
    )
    returning id into v_book;
  else
    select b.id into v_book
      from library.books b
     where b.id = p_book_id
       and b.household_id = v_item.household_id;
    if v_book is null then
      raise exception 'not_authorized' using errcode = '42501';
    end if;
  end if;

  insert into library.copies (book_id, owner_user_id, edition_note, copy_note, location, origin,
                              photo_path, intake_item_id)
  values (
    v_book,
    -- An absent key keeps the item's owner; an explicit null means shared.
    case when v_copy_in ? 'owner_user_id' then (v_copy_in ->> 'owner_user_id')::uuid
         else v_item.owner_user_id end,
    -- An absent key takes the item's edition label; an explicit null clears it.
    case when v_copy_in ? 'edition_note' then v_copy_in ->> 'edition_note'
         else v_item.edition_label end,
    v_copy_in ->> 'copy_note',
    v_copy_in ->> 'location',
    case when v_item.source = 'scan' then 'scan' else 'photo' end,
    v_item.cover_path,
    p_item
  )
  returning id into v_copy;

  update library.intake_items i
     set status = 'confirmed', result_book_id = v_book, result_copy_id = v_copy,
         claim_token = null, retry_at = null
   where i.id = p_item;

  return query select v_book, v_copy;
end;
$$;

---------------------------------------------------------------------------
-- One-time cleanup (security invoker, no client grant)
---------------------------------------------------------------------------

-- Moves the edition notes Plan 3 copied from Claude's editionClues into
-- copy_note, for every household. A copy moves only if its note is still
-- exactly what Plan 3 wrote: origin photo, linked to its intake item, created
-- before p_before, and edition_note equal to the item's clues, in order,
-- joined with '; ' and trimmed. Edited notes and libib/manual copies are left
-- alone. Returns the number of copies moved; a second call moves nothing.
create or replace function library.move_claude_edition_notes(p_before timestamptz)
returns int
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_count int;
begin
  update library.copies c
     set copy_note = c.edition_note,
         edition_note = null
    from library.intake_items i
   where c.intake_item_id = i.id
     and c.origin = 'photo'
     and c.created_at < p_before
     and c.edition_note is not null
     and jsonb_typeof(i.extraction -> 'editionClues') = 'array'
     and c.edition_note = regexp_replace(
           array_to_string(
             array(select e.value
                     from jsonb_array_elements_text(
                            case when jsonb_typeof(i.extraction -> 'editionClues') = 'array'
                                 then i.extraction -> 'editionClues' else '[]'::jsonb end)
                          with ordinality e(value, ord)
                    order by e.ord),
             '; '),
           '^\s+|\s+$', '', 'g');
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

---------------------------------------------------------------------------
-- Row level security: a direct insert can only make a pending photo row.
---------------------------------------------------------------------------

drop policy if exists intake_items_insert_member on library.intake_items;
create policy intake_items_insert_member on library.intake_items
  for insert to authenticated
  with check (library.is_member(household_id)
              and uploaded_by = (select auth.uid())
              and status = 'pending'
              and source = 'photo');

---------------------------------------------------------------------------
-- Grants
---------------------------------------------------------------------------

-- Revoking the table privileges also revokes the earlier column grants.
revoke all on library.intake_items from public, anon, authenticated;

-- Every column except claim_token.
grant select (id, household_id, uploaded_by, batch_id, owner_user_id, cover_path,
              title_page_path, source_hash, status, attempts, claimed_at, retry_at,
              extraction, vision_usage, lookup, error_code, discard_reason,
              result_book_id, result_copy_id, created_at, updated_at,
              source, scanned_isbn, edition_label, extra_copy)
  on library.intake_items to authenticated;
-- No source, status or extra_copy: scans are made only by create_scan_item.
grant insert (id, household_id, batch_id, owner_user_id, cover_path, title_page_path, source_hash,
              scanned_isbn, edition_label)
  on library.intake_items to authenticated;
grant update (lookup, owner_user_id, edition_label) on library.intake_items to authenticated;

-- See the header of 20261103000000_library-schema.sql: every new function
-- must revoke the default PUBLIC execute. isbn13_is_valid is granted to
-- authenticated because the check constraint runs as the inserting role.
revoke execute on function library.isbn13_is_valid(text) from public, anon;
revoke execute on function library.create_scan_item(uuid, uuid, uuid, uuid, text, text, boolean)
  from public, anon;
revoke execute on function library.move_claude_edition_notes(timestamptz)
  from public, anon, authenticated;

grant execute on function library.isbn13_is_valid(text) to authenticated;
grant execute on function library.create_scan_item(uuid, uuid, uuid, uuid, text, text, boolean)
  to authenticated;

comment on column library.intake_items.source is
  'photo (vision pipeline) or scan (barcode; created ready by create_scan_item, never claimed).';
comment on column library.intake_items.edition_label is
  'Edition label chosen at intake; becomes copies.edition_note on confirm unless p_copy overrides it.';
comment on column library.intake_items.extra_copy is
  'Set by create_scan_item when the person deliberately scanned another copy of the same ISBN.';
comment on column library.copies.copy_note is
  'Free-text note about this physical copy (sprayed edges, signed, damage).';

---------------------------------------------------------------------------
-- The cleanup, only on the application that added copy_note. A missing flag
-- means the first statement ran in another transaction: fail loudly rather
-- than skip the cleanup silently.
---------------------------------------------------------------------------

do $$
declare
  v_flag text := current_setting('library.scan_intake_cleanup', true);
begin
  if v_flag is null or v_flag not in ('run', 'skip') then
    raise exception 'library.scan_intake_cleanup is not set; run this migration in one transaction';
  end if;
  if v_flag = 'run' then
    perform library.move_claude_edition_notes(now());
  end if;
end
$$;
