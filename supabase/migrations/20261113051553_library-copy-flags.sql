-- Library copy flags: per-copy Unhauled, Deluxe and Signed, the computed field
-- library.on_shelf(library.books), and an 'unhauled' outcome in
-- request_cover_searches.
--
-- Schema only. Backfilling Deluxe and Signed on existing copies is a one-off
-- production update, deliberately not in this migration.
--
-- copies.unhauled_at  when the household let the copy go; null = on the shelf.
-- copies.deluxe/signed  plain flags; existing rows become false.
-- library.on_shelf(b)  a book is off the shelf only when it has copies and
--                      every copy is unhauled. A book with no copies is on the
--                      shelf. Security invoker: copies are read under the
--                      caller's RLS. PostgREST exposes it as the column
--                      `on_shelf` of books.
--
-- No new RLS: copies' member policies already cover the new columns.
--
-- Idempotent: safe to re-run.

alter table library.copies add column if not exists unhauled_at timestamptz;
alter table library.copies add column if not exists deluxe boolean not null default false;
alter table library.copies add column if not exists signed boolean not null default false;

create index if not exists copies_on_shelf_book_id_idx
  on library.copies (book_id) where unhauled_at is null;

comment on column library.copies.unhauled_at is
  'When the household let this copy go; null = on the shelf. A book is on the shelf unless it has copies and all are unhauled (library.on_shelf).';
comment on column library.copies.deluxe is 'A deluxe edition of the book.';
comment on column library.copies.signed is 'A signed copy.';

create or replace function library.on_shelf(b library.books)
returns boolean language sql stable set search_path = '' as $$
  select not exists (select 1 from library.copies c where c.book_id = b.id)
      or exists (select 1 from library.copies c where c.book_id = b.id and c.unhauled_at is null);
$$;
revoke execute on function library.on_shelf(library.books) from public, anon;
grant execute on function library.on_shelf(library.books) to authenticated;

---------------------------------------------------------------------------
-- Cover batches skip a book that is off the shelf, unless the request is
-- manual. Otherwise the body is that of 20261112221802_library-cover-finder.sql.
---------------------------------------------------------------------------

-- One outcome per distinct id: queued | already_open | nothing_found | not_found | unhauled.
-- A book's active search blocks a new one (already_open), except for a manual
-- request (Try again, Search again): it dismisses a nothing_found, failed or
-- ready active search, keeping the book's mark, and queues a fresh one. A
-- non-manual request answers nothing_found for a nothing_found or failed
-- search. Queued, gathered and processing searches always read already_open.
-- A book that is off the shelf answers unhauled (no search row) unless manual.
create or replace function library.request_cover_searches(p_household uuid, p_book_ids uuid[],
                                                          p_batch uuid, p_manual boolean)
returns table (book_id uuid, outcome text)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_id     uuid;
  v_cover  text;
  v_on_shelf boolean;
  v_active library.cover_searches%rowtype;
  v_rows   int;
begin
  if p_household is null or not library.is_member(p_household) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  if coalesce(cardinality(p_book_ids), 0) > 1000 then
    raise exception 'too_many_books' using errcode = '22023';
  end if;

  -- Id order, so overlapping concurrent requests lock shared books in the same order (no deadlock).
  for v_id in select distinct x from unnest(coalesce(p_book_ids, '{}'::uuid[])) x where x is not null
              order by x loop
    select b.cover_url, library.on_shelf(b) into v_cover, v_on_shelf
      from library.books b
     where b.id = v_id and b.household_id = p_household;
    if not found then
      return query select v_id, 'not_found'::text;
      continue;
    end if;

    -- Off the shelf: a batch skips it. A manual request is an explicit choice.
    if not v_on_shelf and not coalesce(p_manual, false) then
      return query select v_id, 'unhauled'::text;
      continue;
    end if;

    select s.* into v_active
      from library.cover_searches s
     where s.book_id = v_id
       and s.status in ('queued', 'gathered', 'processing', 'ready', 'nothing_found', 'failed')
     for update;
    if found then
      if v_active.status in ('queued', 'gathered', 'processing')
         or (v_active.status = 'ready' and not coalesce(p_manual, false)) then
        return query select v_id, 'already_open'::text;
        continue;
      end if;
      if not coalesce(p_manual, false) then
        return query select v_id, 'nothing_found'::text;
        continue;
      end if;
      -- Manual: retire the ready or ended search (status only; the mark stays).
      update library.cover_searches s set status = 'dismissed' where s.id = v_active.id;
    end if;

    -- A concurrent request for the same book reads already_open.
    insert into library.cover_searches (household_id, book_id, requested_by, batch_id,
                                        reasons, note, cover_at_request)
    select p_household, v_id, auth.uid(), p_batch,
           coalesce(m.reasons, '{}'::text[]), m.note, v_cover
      from (select 1) one
      left join library.cover_marks m on m.book_id = v_id
    on conflict (book_id)
      where status in ('queued', 'gathered', 'processing', 'ready', 'nothing_found', 'failed')
      do nothing;
    get diagnostics v_rows = row_count;

    return query select v_id, case when v_rows > 0 then 'queued' else 'already_open' end;
  end loop;
end;
$$;
