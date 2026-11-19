-- Library series accuracy (Plan 11). Part 1: the author rule, per-book
-- "existing" series suggestions, approve and dismiss (D2-D5, design 4.1).
--
-- D2  library._author_key(name) normalises an author name: NFKD, lowercase,
--     letters and digits only ("T. J. Holt" and "Tj Holt" are both tjholt).
--     The same vectors are asserted against library-tagger/series.ts
--     authorKey. An empty key never matches anything.
--     library._authors_match_series(household, book, key) is true when some
--     other household book whose lower(series_name) is key shares a non-empty
--     author key with the book.
-- D3  series_suggestions gains kind ('new' | 'existing'), unique per
--     (household, kind, name_key). series_suggestion_books gains status
--     ('pending' | 'approved' | 'dismissed') and decided_at.
--       new       a series name the household doesn't have, as in Plan 10.
--                 The row's status is the name decision; its books stay
--                 pending until approve marks the filled ones approved.
--       existing  a household series a book by another author was said to
--                 belong to, keyed by lower(spelling), named by the spelling
--                 when created. The row stays pending with approved_as null
--                 for ever; only its books carry decisions. It is listed while
--                 it has a pending book.
--     Plan 10 rows become kind new with every book pending, which is right:
--     decided new rows are filtered by row status, as before.
-- D4  _apply_series, steps 3-4 (steps 1-2, ignore and keep, are unchanged):
--     3. When the household has the series (_series_spelling): authors match
--        -> the spelling and volume are applied; no match ->
--        _suggest_existing under the spelling.
--     4. Otherwise the new row for the name (FOR SHARE): dismissed -> nothing;
--        approved -> its target (the household spelling of approved_as, or
--        approved_as itself) is applied when the authors match it, else
--        _suggest_existing under the target; pending or none -> the book joins
--        the new row.
--     _suggest_existing adds the book to the existing row as pending, or
--     refreshes its volume and why while it is still pending. A dismissed
--     book stays dismissed. Dismissal is per book, so it never stops a later
--     same-author book filling the series, or another book being suggested.
--     Both author-match fills go through _fill_existing: a book dismissed on
--     the existing row for that series is never filled, even when it later
--     author-matches (say, after a same-author book was approved into it); a
--     book filled there has its pending row on that existing row approved.
-- D5  approve_series_suggestion fills only pending books (still blank, not
--     hand-set), marks each filled book approved, and for an existing row
--     marks every other pending book approved too (they leave the list); the
--     row stays pending. An existing row fills under the household spelling of
--     its own key (p_name is validated, not used). A new row is decided as in
--     Plan 10. dismiss_series_suggestion on an existing row dismisses its
--     pending books (dismissed), or answers not_pending when it has none.
--
-- Lock order as Plan 10: finish_tag_job locks the book, then _apply_series /
-- _suggest_existing take the suggestion FOR SHARE; approve locks the
-- suggestion's books, then the suggestion FOR UPDATE; dismiss locks only the
-- suggestion, then its book rows.
--
-- Older library clients (D1): the series list still reads the same tables;
-- approve and dismiss decide by kind on the server.
--
-- No direct client writes. Every function is security definer with an empty
-- search_path; client-callable ones check library.is_member; internal _
-- functions have no client grant.
--
-- Idempotent: safe to re-run.

---------------------------------------------------------------------------
-- Schema (D3)
---------------------------------------------------------------------------

alter table library.series_suggestions add column if not exists kind text not null default 'new'
  check (kind in ('new', 'existing'));

alter table library.series_suggestions drop constraint if exists series_suggestions_household_key;
alter table library.series_suggestions drop constraint if exists series_suggestions_household_kind_key;
alter table library.series_suggestions add constraint series_suggestions_household_kind_key
  unique (household_id, kind, name_key);

-- An existing row carries no decision of its own.
alter table library.series_suggestions drop constraint if exists series_suggestions_existing_check;
alter table library.series_suggestions add constraint series_suggestions_existing_check
  check (kind = 'new' or (status = 'pending' and approved_as is null));

alter table library.series_suggestion_books add column if not exists status text not null default 'pending'
  check (status in ('pending', 'approved', 'dismissed'));
alter table library.series_suggestion_books add column if not exists decided_at timestamptz;

---------------------------------------------------------------------------
-- Author keys (D2)
---------------------------------------------------------------------------

-- Touches no table, so it needs no definer rights; it has no client grant.
create or replace function library._author_key(p_name text)
returns text
language sql
immutable
set search_path = ''
as $$ select regexp_replace(lower(normalize(coalesce(p_name, ''), NFKD)), '[^[:alnum:]]', '', 'g') $$;

create or replace function library._authors_match_series(p_household uuid, p_book uuid, p_key text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from library.books b
      join library.books o
        on o.household_id = b.household_id and o.id <> b.id
       and o.series_name is not null and lower(o.series_name) = p_key
     where b.id = p_book and b.household_id = p_household
       and exists (select 1
                     from unnest(b.authors) ba, unnest(o.authors) oa
                    where library._author_key(ba) <> ''
                      and library._author_key(ba) = library._author_key(oa)))
$$;

---------------------------------------------------------------------------
-- Suggestions (D4)
---------------------------------------------------------------------------

-- Adds the book to the existing-series row for lower(p_name) (created on
-- first use, named p_name). The caller has locked the book. Returns
-- dismissed when this book was dismissed for that series, else suggested.
create or replace function library._suggest_existing(p_household uuid, p_book uuid, p_name text,
                                                     p_volume numeric, p_why text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_sid    uuid;
  v_status text;
begin
  insert into library.series_suggestions (household_id, kind, name_key, name)
  values (p_household, 'existing', lower(p_name), p_name)
  on conflict (household_id, kind, name_key) do nothing;
  -- FOR SHARE: an approve or dismiss in flight finishes first, and none can
  -- start until this commits, so a book linked here is one they see.
  select s.id into v_sid
    from library.series_suggestions s
   where s.household_id = p_household and s.kind = 'existing' and s.name_key = lower(p_name)
     for share;

  insert into library.series_suggestion_books as sb (suggestion_id, book_id, household_id, volume, why)
  values (v_sid, p_book, p_household, p_volume, p_why)
  on conflict (suggestion_id, book_id) do update
    set volume = excluded.volume, why = excluded.why
    where sb.status = 'pending';

  select sb.status into v_status
    from library.series_suggestion_books sb
   where sb.suggestion_id = v_sid and sb.book_id = p_book;
  return case when v_status = 'dismissed' then 'dismissed' else 'suggested' end;
end;
$$;

-- The author-match fill (D4 steps 3 and 4-approved). The caller has locked
-- the book. A per-book dismissal wins: when this book was dismissed on the
-- existing row for p_target it is not filled and the answer is dismissed.
-- Otherwise the series is applied, and a pending row this book has there is
-- marked approved so the list isn't stale. Takes the suggestion FOR SHARE
-- after the book lock, the same order as _suggest_existing.
create or replace function library._fill_existing(p_household uuid, p_book uuid, p_target text, p_volume numeric)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_sid    uuid;
  v_status text;
begin
  select s.id into v_sid
    from library.series_suggestions s
   where s.household_id = p_household and s.kind = 'existing' and s.name_key = lower(p_target)
     for share;
  if v_sid is not null then
    select sb.status into v_status
      from library.series_suggestion_books sb
     where sb.suggestion_id = v_sid and sb.book_id = p_book;
    if v_status = 'dismissed' then
      return 'dismissed';
    end if;
    update library.series_suggestion_books sb
       set status = 'approved', decided_at = now()
     where sb.suggestion_id = v_sid and sb.book_id = p_book and sb.status = 'pending';
  end if;
  update library.books b set series_name = p_target, series_volume = p_volume where b.id = p_book;
  return 'applied';
end;
$$;

-- D7 (Plan 10) with D4's steps 3-4: applies one series result to a book. The
-- caller has locked the book (finish_tag_job). Returns ignored | kept |
-- applied | suggested | dismissed.
create or replace function library._apply_series(p_household uuid, p_book uuid, p_series jsonb)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name   text;
  v_volume numeric;
  v_why    text;
  v_key    text;
  v_book   library.books%rowtype;
  v_target text;
  v_sid    uuid;
  v_status text;
  v_as     text;
begin
  -- 1. Ignore.
  if p_series is null or jsonb_typeof(p_series) <> 'object'
     or coalesce(jsonb_typeof(p_series -> 'name'), '') <> 'string' then
    return 'ignored';
  end if;
  v_name := regexp_replace(p_series ->> 'name', '^\s+|\s+$', '', 'g');
  if v_name = '' or char_length(v_name) > 200
     or lower(v_name) in ('none', 'n/a', 'na', 'null', 'standalone', 'stand-alone', 'no series', 'unknown') then
    return 'ignored';
  end if;
  if jsonb_typeof(p_series -> 'volume') = 'number' then
    v_volume := round((p_series ->> 'volume')::numeric, 2);
    if v_volume < 0 or v_volume >= 10000 then
      v_volume := null;
    end if;
  end if;
  if jsonb_typeof(p_series -> 'why') = 'string' then
    v_why := nullif(btrim(left(regexp_replace(p_series ->> 'why', '^\s+|\s+$', '', 'g'), 200)), '');
  end if;

  -- 2. Keep.
  select b.* into v_book from library.books b where b.id = p_book and b.household_id = p_household;
  if not found then
    return 'ignored';
  end if;
  if v_book.series_name is not null or v_book.user_edited_fields && '{seriesName,seriesVolume}'::text[] then
    return 'kept';
  end if;

  -- 3. A series the household has: only an author match fills it.
  v_key    := lower(v_name);
  v_target := library._series_spelling(p_household, v_key);
  if v_target is not null then
    if library._authors_match_series(p_household, p_book, v_key) then
      return library._fill_existing(p_household, p_book, v_target, v_volume);
    end if;
    return library._suggest_existing(p_household, p_book, v_target, v_volume, v_why);
  end if;

  -- 4. A new name: its suggestion decides.
  insert into library.series_suggestions (household_id, kind, name_key, name)
  values (p_household, 'new', v_key, v_name)
  on conflict (household_id, kind, name_key) do nothing;
  -- FOR SHARE: an approve or dismiss in flight finishes first, and none can
  -- start until this commits, so a book linked here is one the approve sees.
  select s.id, s.status, s.approved_as into v_sid, v_status, v_as
    from library.series_suggestions s
   where s.household_id = p_household and s.kind = 'new' and s.name_key = v_key
     for share;

  if v_status = 'dismissed' then
    return 'dismissed';
  elsif v_status = 'approved' then
    v_target := coalesce(library._series_spelling(p_household, lower(v_as)), v_as);
    if library._authors_match_series(p_household, p_book, lower(v_target)) then
      return library._fill_existing(p_household, p_book, v_target, v_volume);
    end if;
    return library._suggest_existing(p_household, p_book, v_target, v_volume, v_why);
  end if;

  insert into library.series_suggestion_books (suggestion_id, book_id, household_id, volume, why)
  values (v_sid, p_book, p_household, v_volume, v_why)
  on conflict (suggestion_id, book_id) do update set volume = excluded.volume, why = excluded.why;
  return 'suggested';
end;
$$;

---------------------------------------------------------------------------
-- Approve and dismiss (D5)
---------------------------------------------------------------------------

-- Fills the series in on every pending book behind the suggestion that is
-- still blank and not hand-set, and marks those books approved. Returns the
-- number of books filled; 0 when there is nothing to decide.
--   new       the series is p_name, or the household's spelling of it (how a
--             near-duplicate is folded in); the row becomes approved with
--             approved_as set. Books not filled stay pending.
--   existing  the series is the household's spelling of the row's key (or
--             the row's name when no book carries it any more); p_name is
--             validated but not used. Every other pending book is marked
--             approved too, and the row stays pending.
--   p_name     trimmed, 1..200 characters, else 22023.
--   p_volumes  a JSON object {"<book uuid>": number | null}, else 22023; each
--              number must be 0 <= round(v, 2) < 10000, else 22023. A book
--              listed gets that volume (null clears it); any other book gets
--              its proposed volume.
-- No change to user_edited_fields. Locks the books before the suggestion, the
-- order finish_tag_job uses.
create or replace function library.approve_series_suggestion(p_suggestion uuid, p_name text, p_volumes jsonb)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_s      library.series_suggestions%rowtype;
  v_name   text;
  v_target text;
  v_e      record;
  v_n      int;
begin
  select s.* into v_s from library.series_suggestions s where s.id = p_suggestion;
  if not found or not library.is_member(v_s.household_id) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  v_name := regexp_replace(coalesce(p_name, ''), '^\s+|\s+$', '', 'g');
  if v_name = '' or char_length(v_name) > 200 then
    raise exception 'invalid_name' using errcode = '22023';
  end if;
  if p_volumes is null or jsonb_typeof(p_volumes) <> 'object' then
    raise exception 'invalid_volumes' using errcode = '22023';
  end if;
  for v_e in select e.value from jsonb_each(p_volumes) e loop
    continue when jsonb_typeof(v_e.value) = 'null';
    if jsonb_typeof(v_e.value) <> 'number'
       or round((v_e.value #>> '{}')::numeric, 2) < 0 or round((v_e.value #>> '{}')::numeric, 2) >= 10000 then
      raise exception 'invalid_volumes' using errcode = '22023';
    end if;
  end loop;

  perform 1
     from library.books b
     join library.series_suggestion_books sb on sb.book_id = b.id and sb.household_id = b.household_id
    where sb.suggestion_id = v_s.id
    order by b.id
      for no key update of b;
  select s.* into v_s from library.series_suggestions s where s.id = p_suggestion for update;

  if v_s.status <> 'pending' then
    return 0;
  end if;

  if v_s.kind = 'existing' then
    v_target := coalesce(library._series_spelling(v_s.household_id, v_s.name_key), v_s.name);
  else
    v_target := coalesce(library._series_spelling(v_s.household_id, lower(v_name)), v_name);
  end if;

  with filled as (
    update library.books b
       set series_name   = v_target,
           series_volume = case when p_volumes ? b.id::text then round((p_volumes ->> b.id::text)::numeric, 2)
                                else sb.volume end
      from library.series_suggestion_books sb
     where sb.suggestion_id = v_s.id and sb.status = 'pending'
       and b.id = sb.book_id and b.household_id = sb.household_id
       and b.series_name is null
       and not (b.user_edited_fields && '{seriesName,seriesVolume}'::text[])
    returning b.id
  ), marked as (
    update library.series_suggestion_books sb
       set status = 'approved', decided_at = now()
     where sb.suggestion_id = v_s.id and sb.book_id in (select f.id from filled f)
    returning 1
  )
  select count(*)::int into v_n from filled;

  if v_s.kind = 'existing' then
    update library.series_suggestion_books sb
       set status = 'approved', decided_at = now()
     where sb.suggestion_id = v_s.id and sb.status = 'pending';
  else
    update library.series_suggestions s
       set status = 'approved', approved_as = v_target, decided_by = auth.uid(), decided_at = now()
     where s.id = v_s.id;
  end if;
  return v_n;
end;
$$;

-- new: marks the name dismissed for the household; it is never suggested
-- again. existing: dismisses the row's pending books only. Returns
-- dismissed | not_pending.
create or replace function library.dismiss_series_suggestion(p_suggestion uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_s library.series_suggestions%rowtype;
  v_n int;
begin
  select s.* into v_s from library.series_suggestions s where s.id = p_suggestion for update;
  if not found or not library.is_member(v_s.household_id) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  if v_s.kind = 'existing' then
    update library.series_suggestion_books sb
       set status = 'dismissed', decided_at = now()
     where sb.suggestion_id = v_s.id and sb.status = 'pending';
    get diagnostics v_n = row_count;
    return case when v_n > 0 then 'dismissed' else 'not_pending' end;
  end if;
  if v_s.status <> 'pending' then
    return 'not_pending';
  end if;
  update library.series_suggestions s
     set status = 'dismissed', decided_by = auth.uid(), decided_at = now()
   where s.id = v_s.id;
  return 'dismissed';
end;
$$;

---------------------------------------------------------------------------
-- Grants
---------------------------------------------------------------------------

-- See the header of 20261103000000_library-schema.sql: every new function
-- must revoke the default PUBLIC execute. Internal ones get no client grant.
revoke execute on function library._author_key(text)                                 from public, anon, authenticated;
revoke execute on function library._authors_match_series(uuid, uuid, text)          from public, anon, authenticated;
revoke execute on function library._suggest_existing(uuid, uuid, text, numeric, text) from public, anon, authenticated;
revoke execute on function library._fill_existing(uuid, uuid, text, numeric)         from public, anon, authenticated;
revoke execute on function library._apply_series(uuid, uuid, jsonb)                  from public, anon, authenticated;
revoke execute on function library.approve_series_suggestion(uuid, text, jsonb)      from public, anon;
revoke execute on function library.dismiss_series_suggestion(uuid)                   from public, anon;

grant execute on function library.approve_series_suggestion(uuid, text, jsonb)       to authenticated;
grant execute on function library.dismiss_series_suggestion(uuid)                    to authenticated;

comment on column library.series_suggestions.kind is
  'new: a series name the household doesn''t have. existing: a household series suggested for books by other authors; only its books carry decisions.';
comment on column library.series_suggestion_books.status is
  'pending until decided. approved: filled by approve (or, on an existing row, approved while hand-set). dismissed: dismissed for this book only.';
