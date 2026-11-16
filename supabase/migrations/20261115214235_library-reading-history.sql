-- Library private reading history (Plan 8, D2, D5, D7): each member's
-- StoryGraph rows, the keys that match them to books, and the upload.
--
-- reading_history             one row per member and StoryGraph book. Only the
--                             five fields the app sends are stored (title,
--                             authors, ISBN/UID as isbn13, status, last read),
--                             plus the keys derived from them. Private to its
--                             member. book_id is set only when matched; a
--                             deleted book frees the row (before update trigger).
-- reading_history_candidates  up to 3 books a row may be ("possible matches"),
--                             pending or dismissed by the member.
--
-- Keys (D5) mirror the library app's src/lib/libib/match-keys.ts and isbn.ts
-- rule for rule; see the notes on each function. Books carry expression indexes
-- on them so the matcher looks books up by key instead of scanning.
--
-- _match_history_row(id)      the one matcher (the upload and the books trigger).
--                             Pure matching: it sets book_id/match_state
--                             and candidates and returns the new state; the
--                             caller applies the status with _apply_history.
-- upload_reading_history      the RPC. 1..500 rows for auth.uid(), upserted on
--                             sg_key (D7), matched, and applied.
-- match_history_for_book      the "check history on new book" hook (D4): a
--                             trigger on books, after insert or a change of
--                             title, authors or ISBNs. It re-matches every
--                             member's non-matched rows the book could match.
--                             A matching error is a warning, never a failed write.
-- link_reading_history        Link: the caller's row to a household book.
-- dismiss_reading_match       Not this book: dismiss one candidate for good.
--
-- No client insert, update or delete. Idempotent: safe to re-run. If a key
-- function's rules change, the books_match_* indexes must be rebuilt (REINDEX).

---------------------------------------------------------------------------
-- Key functions (D5), immutable
---------------------------------------------------------------------------

-- baseNormalize: NFD, strip combining marks, lowercase, drop ' ’ ‘, & -> " and ",
-- runs of anything but letters/digits -> one space, trim. TS strips every \p{M};
-- Postgres has no \p{M}, so the combining-mark blocks are listed (U+0300-036F
-- per D5, plus the extended, supplement, symbol, kana voicing and half-mark
-- blocks). [:alnum:] is the database locale's letters and digits.
create or replace function library.match_norm(p text)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select btrim(regexp_replace(
           replace(
             regexp_replace(
               lower(regexp_replace(normalize(coalesce(p, ''), NFD),
                     '[̀-ͯ᪰-᫿᷀-᷿⃐-⃿゙゚︠-︯]', '', 'g')),
               '[''’‘]', '', 'g'),
             '&', ' and '),
           '[^[:alnum:]]+', ' ', 'g'), ' ')
$$;

-- titleKey: drop a trailing parenthetical containing the word "edition" (libib's
-- EDITION_RE) or a "#" (StoryGraph's "(Series, #2)") unless nothing is left
-- before it; match_norm; drop a leading the/a/an when more tokens follow.
-- '' means nothing to match on.
create or replace function library.match_title_key(p text)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select regexp_replace(
           library.match_norm(case when s.x ~ '\S' then s.x else coalesce(p, '') end),
           '^(the|a|an) (?=.)', '')
    from (select regexp_replace(coalesce(p, ''), '\s*\([^)]*(\yedition\y|#)[^)]*\)\s*$', '', 'i') as x) s
$$;

-- baseTitleKey: match_title_key of the text before the first ":" or " - ".
create or replace function library.match_base_title_key(p text)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select library.match_title_key(regexp_replace(coalesce(p, ''), '(:| - ).*$', ''))
$$;

-- authorKey: match_norm, with runs of single-letter tokens (initials) joined.
create or replace function library.match_author_key(p text)
returns text
language plpgsql
immutable
parallel safe
set search_path = ''
as $$
declare
  v_tok  text;
  v_out  text[] := '{}';
  v_prev boolean := false;
  v_ini  boolean;
begin
  foreach v_tok in array string_to_array(library.match_norm(p), ' ') loop
    continue when v_tok = '';
    v_ini := char_length(v_tok) = 1 and v_tok ~ '^[[:alpha:]]$';
    if v_ini and v_prev then
      v_out[cardinality(v_out)] := v_out[cardinality(v_out)] || v_tok;
    else
      v_out := v_out || v_tok;
    end if;
    v_prev := v_ini;
  end loop;
  return array_to_string(v_out, ' ');
end;
$$;

-- normalizeIsbn13 / normalizeIsbn10 + isbn10To13: strip whitespace and hyphens;
-- a valid ISBN-13 (978/979, checksum) as is; a valid ISBN-10 as its 978 form;
-- anything else (bad checksum, an ASIN, blank) null.
create or replace function library.match_isbn13(p text)
returns text
language plpgsql
immutable
parallel safe
set search_path = ''
as $$
declare
  v   text := upper(regexp_replace(coalesce(p, ''), '[[:space:]-]', '', 'g'));
  v_s int := 0;
  i   int;
begin
  if v ~ '^97[89][0-9]{10}$' then
    for i in 1..12 loop
      v_s := v_s + substr(v, i, 1)::int * case when i % 2 = 1 then 1 else 3 end;
    end loop;
    return case when (10 - v_s % 10) % 10 = substr(v, 13, 1)::int then v end;
  end if;
  if v ~ '^[0-9]{9}[0-9X]$' then
    for i in 1..10 loop
      v_s := v_s + (11 - i) * case when substr(v, i, 1) = 'X' then 10 else substr(v, i, 1)::int end;
    end loop;
    if v_s % 11 <> 0 then
      return null;
    end if;
    v := '978' || left(v, 9);
    v_s := 0;
    for i in 1..12 loop
      v_s := v_s + substr(v, i, 1)::int * case when i % 2 = 1 then 1 else 3 end;
    end loop;
    return v || ((10 - v_s % 10) % 10)::text;
  end if;
  return null;
end;
$$;

-- canonicalIsbns: the ISBN-13s of a book's isbn13 and isbn10 arrays. The
-- two-array form backs the books index; book_isbn13s is the row form.
create or replace function library._isbn13s(p_isbn13 text[], p_isbn10 text[])
returns text[]
language sql
immutable
parallel safe
set search_path = ''
as $$
  select coalesce(array_agg(distinct s.k order by s.k), '{}')
    from (select library.match_isbn13(x) as k
            from unnest(coalesce(p_isbn13, '{}') || coalesce(p_isbn10, '{}')) x) s
   where s.k is not null
$$;

create or replace function library.book_isbn13s(b library.books)
returns text[]
language sql
immutable
parallel safe
set search_path = ''
as $$
  select library._isbn13s(b.isbn13, b.isbn10)
$$;

-- Lookups by key. B-tree on the first 200 characters (a whole key could pass
-- the b-tree size limit on a very long title); the matcher rechecks full keys.
-- text_pattern_ops compares bytewise, so a "starts with" is a range scan.
create index if not exists books_match_title_key_idx
  on library.books (left(library.match_title_key(title), 200) text_pattern_ops);
create index if not exists books_match_base_title_key_idx
  on library.books (left(library.match_base_title_key(title), 200) text_pattern_ops);
create index if not exists books_match_isbn13s_idx
  on library.books using gin (library._isbn13s(isbn13, isbn10));

---------------------------------------------------------------------------
-- Tables (D2)
---------------------------------------------------------------------------

create table if not exists library.reading_history (
  id             uuid primary key default gen_random_uuid(),
  household_id   uuid not null,
  user_id        uuid not null,
  sg_key         text not null,
  title          text not null check (char_length(title) between 1 and 500),
  authors        text[] not null default '{}',
  isbn13         text,
  sg_status      text not null check (sg_status in ('read', 'dnf')),
  last_read      date,
  title_key      text not null,
  base_title_key text not null,
  author_keys    text[] not null default '{}',
  book_id        uuid references library.books (id) on delete set null,
  match_state    text not null default 'unmatched'
                   check (match_state in ('matched', 'possible', 'dismissed', 'unmatched')),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (household_id, user_id, sg_key),
  foreign key (household_id, user_id) references library.household_members (household_id, user_id) on delete cascade,
  constraint reading_history_book_only_when_matched check (book_id is null or match_state = 'matched')
);

create index if not exists reading_history_isbn13_idx
  on library.reading_history (household_id, isbn13) where isbn13 is not null;
-- text_pattern_ops: equality, plus the books trigger's bytewise "starts with"
-- range on base_title_key.
create index if not exists reading_history_base_title_key_idx
  on library.reading_history (household_id, base_title_key text_pattern_ops);
create index if not exists reading_history_book_id_idx
  on library.reading_history (book_id) where book_id is not null;
create index if not exists reading_history_user_id_idx
  on library.reading_history (user_id);

create table if not exists library.reading_history_candidates (
  history_id   uuid not null references library.reading_history (id) on delete cascade,
  book_id      uuid not null,
  household_id uuid not null,
  reason       text not null
                 check (reason in ('isbn_title_differs', 'several_books', 'title_author_differs', 'title_prefix')),
  state        text not null default 'pending' check (state in ('pending', 'dismissed')),
  created_at   timestamptz not null default now(),
  primary key (history_id, book_id),
  foreign key (book_id, household_id) references library.books (id, household_id) on delete cascade
);

create index if not exists reading_history_candidates_book_idx
  on library.reading_history_candidates (book_id, household_id);

drop trigger if exists reading_history_set_updated_at on library.reading_history;
create trigger reading_history_set_updated_at
  before update on library.reading_history
  for each row execute function library.set_updated_at();

-- A matched row whose book was deleted (book_id set null) is unmatched again.
create or replace function library.reading_history_free_row()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.match_state = 'matched' and new.book_id is null then
    new.match_state := 'unmatched';
  end if;
  return new;
end;
$$;

drop trigger if exists reading_history_free_row on library.reading_history;
create trigger reading_history_free_row
  before update on library.reading_history
  for each row execute function library.reading_history_free_row();

---------------------------------------------------------------------------
-- The matcher (D5), internal
---------------------------------------------------------------------------

-- In order, skipping books this row has dismissed:
--   1. ISBN: books whose ISBNs contain the row's isbn13. Exactly one whose
--      title key or base title key equals either of the row's, or whose
--      authors overlap -> clear. Otherwise each is isbn_title_differs.
--   2. Title + first author: books whose title or base title key equals either
--      of the row's and whose author keys include the row's first author key.
--      Exactly one, and no ISBN candidate -> clear. Otherwise each is
--      several_books.
--   3. Close: an equal title key without the first author -> title_author_differs;
--      one base title key a whole-token prefix of the other, the shorter at
--      least 2 tokens, authors overlapping -> title_prefix.
-- At most 3 candidates (ISBN, then several_books, then close; each by title).
-- State: matched, else possible (pending candidates), else dismissed (it has
-- dismissed candidates), else unmatched. A matched row is returned untouched.
-- Authors overlap only on a shared non-empty key; an empty key matches nothing.
create or replace function library._match_history_row(p_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  r           library.reading_history;
  v_dismissed uuid[];
  v_first     text;
  v_eq        text[];
  v_prefixes  text[];
  v_toks      text[];
  v_tk        text;
  v_btk       text;
  b           record;
  v_isbn      uuid[] := '{}';
  v_several   uuid[] := '{}';
  v_close     uuid[] := '{}';
  v_close_why text[] := '{}';
  v_ids       uuid[];
  v_why       text[];
  v_match     uuid;
  v_teq       boolean;
  v_overlap   boolean;
  v_state     text;
  i           int;
begin
  select * into r from library.reading_history h where h.id = p_id for update;
  if not found then
    return null;
  end if;
  if r.match_state = 'matched' and r.book_id is not null then
    return 'matched';
  end if;

  select coalesce(array_agg(c.book_id), '{}') into v_dismissed
    from library.reading_history_candidates c
   where c.history_id = p_id and c.state = 'dismissed';
  delete from library.reading_history_candidates c where c.history_id = p_id and c.state = 'pending';

  v_first := nullif(r.author_keys[1], '');
  v_tk    := nullif(r.title_key, '');
  v_btk   := nullif(r.base_title_key, '');
  -- Keys a book's title key or base title key may equal, the token prefixes
  -- (2+ tokens) of the row's base title key, and, for "the row's base title
  -- key is a prefix of the book's", a range on the book's base title key.
  v_eq       := array(select left(k, 200) from unnest(array[v_tk, v_btk]) k where k is not null);
  v_toks     := string_to_array(v_btk, ' ');
  v_prefixes := array(select left(array_to_string(v_toks[1:n], ' '), 200)
                        from generate_series(2, cardinality(v_toks) - 1) n);

  -- 1. ISBN
  if r.isbn13 is not null then
    for b in
      select bk.id, library.match_title_key(bk.title) as tk, library.match_base_title_key(bk.title) as btk,
             array(select library.match_author_key(a) from unnest(bk.authors) a) as aks
        from library.books bk
       where library._isbn13s(bk.isbn13, bk.isbn10) @> array[r.isbn13]
         and bk.household_id = r.household_id
         and bk.id <> all(v_dismissed)
       order by bk.title, bk.id
    loop
      v_isbn := v_isbn || b.id;
      if cardinality(v_isbn) = 1 then
        v_teq := (b.tk <> '' and b.tk in (v_tk, v_btk)) or (b.btk <> '' and b.btk in (v_tk, v_btk));
        v_overlap := exists (select 1 from unnest(b.aks) k where k <> '' and k = any(r.author_keys));
        v_match := case when coalesce(v_teq, false) or v_overlap then b.id end;
      else
        v_match := null;
      end if;
    end loop;
  end if;

  -- 2 and 3. Title
  if v_match is null and (v_tk is not null or v_btk is not null) then
    for b in
      select bk.id, k.tk, k.btk,
             array(select library.match_author_key(a) from unnest(bk.authors) a) as aks
        from library.books bk
        cross join lateral (select library.match_title_key(bk.title) as tk,
                                   library.match_base_title_key(bk.title) as btk) k
       where bk.id in (
               select x.id from library.books x
                where left(library.match_title_key(x.title), 200) = any(v_eq)
               union
               select x.id from library.books x
                where left(library.match_base_title_key(x.title), 200) = any(v_eq || v_prefixes)
               union
               select x.id from library.books x
                where v_btk ~ ' ' and char_length(v_btk) < 199
                  and left(library.match_base_title_key(x.title), 200) ~>=~ (v_btk || ' ')
                  and left(library.match_base_title_key(x.title), 200) ~<~ (v_btk || '!'))
         and bk.household_id = r.household_id
         and bk.id <> all(v_dismissed)
         and bk.id <> all(v_isbn)
       order by bk.title, bk.id
    loop
      v_teq := coalesce((b.tk <> '' and b.tk in (v_tk, v_btk)) or (b.btk <> '' and b.btk in (v_tk, v_btk)), false);
      if v_teq and v_first is not null and v_first = any(b.aks) then
        v_several := v_several || b.id;
      elsif v_teq then
        v_close := v_close || b.id;
        v_close_why := v_close_why || 'title_author_differs'::text;
      elsif v_btk is not null and b.btk <> ''
            and ((starts_with(b.btk, v_btk || ' ') and v_btk ~ ' ')
              or (starts_with(v_btk, b.btk || ' ') and b.btk ~ ' '))
            and exists (select 1 from unnest(b.aks) k where k <> '' and k = any(r.author_keys)) then
        v_close := v_close || b.id;
        v_close_why := v_close_why || 'title_prefix'::text;
      end if;
    end loop;

    if cardinality(v_several) = 1 and cardinality(v_isbn) = 0 then
      v_match := v_several[1];
    end if;
  end if;

  if v_match is not null then
    update library.reading_history h set book_id = v_match, match_state = 'matched' where h.id = p_id;
    return 'matched';
  end if;

  v_ids := v_isbn || v_several || v_close;
  v_why := array(select 'isbn_title_differs'::text from unnest(v_isbn))
        || array(select 'several_books'::text from unnest(v_several))
        || v_close_why;
  for i in 1..least(cardinality(v_ids), 3) loop
    insert into library.reading_history_candidates (history_id, book_id, household_id, reason)
    values (p_id, v_ids[i], r.household_id, v_why[i])
    on conflict (history_id, book_id) do nothing;
  end loop;

  v_state := case
    when cardinality(v_ids) > 0 then 'possible'
    when cardinality(v_dismissed) > 0 then 'dismissed'
    else 'unmatched'
  end;
  update library.reading_history h set book_id = null, match_state = v_state where h.id = p_id;
  return v_state;
end;
$$;

---------------------------------------------------------------------------
-- Upload (D7)
---------------------------------------------------------------------------

-- p_rows: [{title, authors: text[], isbnUid: text|null, status: 'read'|'dnf',
-- lastRead: 'YYYY-MM-DD'|null}], 1..500; any malformed row rejects the batch
-- (22023). Each row is upserted on sg_key for auth.uid(): isbn:<isbn13> when
-- isbnUid is an ISBN, else uid:<trimmed lowercased isbnUid>, else
-- t:<title key>|<author keys joined by ;>. A null lastRead keeps the stored
-- one. Non-matched rows are matched; matched rows have their status applied
-- through _apply_history. Counts are per input row by state after the call;
-- unmatched includes dismissed. applied = _apply_history wrote.
create or replace function library.upload_reading_history(p_household uuid, p_rows jsonb)
returns table (rows int, matched int, applied int, possible int, unmatched int)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_user    uuid := auth.uid();
  v_row     jsonb;
  v_title   text;
  v_authors text[];
  v_uid     text;
  v_status  text;
  v_last    date;
  v_isbn    text;
  v_tk      text;
  v_btk     text;
  v_aks     text[];
  v_key     text;
  v_h       library.reading_history;
  v_state   text;
  v_states  text[] := '{}';
  v_applied int := 0;
begin
  if p_household is null or v_user is null or not library.is_member(p_household) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  if p_rows is null or jsonb_typeof(p_rows) <> 'array'
     or jsonb_array_length(p_rows) not between 1 and 500 then
    raise exception 'invalid_rows' using errcode = '22023';
  end if;

  for v_row in select e from jsonb_array_elements(p_rows) e loop
    if jsonb_typeof(v_row) <> 'object'
       or jsonb_typeof(v_row -> 'title') is distinct from 'string'
       or jsonb_typeof(v_row -> 'status') is distinct from 'string'
       or coalesce(jsonb_typeof(v_row -> 'authors'), 'null') not in ('array', 'null')
       or coalesce(jsonb_typeof(v_row -> 'isbnUid'), 'null') not in ('string', 'null')
       or coalesce(jsonb_typeof(v_row -> 'lastRead'), 'null') not in ('string', 'null') then
      raise exception 'invalid_row' using errcode = '22023';
    end if;

    v_title := btrim(v_row ->> 'title');
    if char_length(v_title) not between 1 and 500 then
      raise exception 'invalid_title' using errcode = '22023';
    end if;

    v_status := v_row ->> 'status';
    if v_status not in ('read', 'dnf') then
      raise exception 'invalid_status' using errcode = '22023';
    end if;

    v_authors := '{}';
    if jsonb_typeof(v_row -> 'authors') = 'array' then
      if jsonb_array_length(v_row -> 'authors') > 50
         or exists (select 1 from jsonb_array_elements(v_row -> 'authors') a
                     where jsonb_typeof(a) <> 'string') then
        raise exception 'invalid_authors' using errcode = '22023';
      end if;
      v_authors := array(select btrim(t.a) from jsonb_array_elements_text(v_row -> 'authors') with ordinality t(a, o)
                          where btrim(t.a) <> '' order by t.o);
      if exists (select 1 from unnest(v_authors) a where char_length(a) > 500) then
        raise exception 'invalid_authors' using errcode = '22023';
      end if;
    end if;

    v_uid := nullif(btrim(v_row ->> 'isbnUid'), '');
    if char_length(v_uid) > 100 then
      raise exception 'invalid_isbn_uid' using errcode = '22023';
    end if;

    v_last := null;
    if v_row ->> 'lastRead' is not null then
      if (v_row ->> 'lastRead') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then
        raise exception 'invalid_last_read' using errcode = '22023';
      end if;
      begin
        v_last := (v_row ->> 'lastRead')::date;
      exception when others then
        raise exception 'invalid_last_read' using errcode = '22023';
      end;
    end if;

    v_tk   := library.match_title_key(v_title);
    v_btk  := library.match_base_title_key(v_title);
    v_aks  := array(select s.k
                      from (select library.match_author_key(t.a) as k, t.o
                              from unnest(v_authors) with ordinality t(a, o)) s
                     where s.k <> '' order by s.o);
    v_isbn := library.match_isbn13(v_uid);
    v_key  := case
      when v_isbn is not null then 'isbn:' || v_isbn
      when v_uid is not null then 'uid:' || lower(v_uid)
      else 't:' || v_tk || '|' || array_to_string(v_aks, ';')
    end;

    insert into library.reading_history as h
      (household_id, user_id, sg_key, title, authors, isbn13, sg_status, last_read,
       title_key, base_title_key, author_keys)
    values (p_household, v_user, v_key, v_title, v_authors, v_isbn, v_status, v_last, v_tk, v_btk, v_aks)
    on conflict (household_id, user_id, sg_key) do update
      set title = excluded.title, authors = excluded.authors, isbn13 = excluded.isbn13,
          sg_status = excluded.sg_status, last_read = coalesce(excluded.last_read, h.last_read),
          title_key = excluded.title_key, base_title_key = excluded.base_title_key,
          author_keys = excluded.author_keys
    returning h.* into v_h;

    v_state := library._match_history_row(v_h.id);
    if v_state = 'matched' then
      select * into v_h from library.reading_history h where h.id = v_h.id;
      if library._apply_history(p_household, v_user, v_h.book_id, v_h.sg_status, v_h.last_read) then
        v_applied := v_applied + 1;
      end if;
    end if;
    v_states := v_states || v_state;
  end loop;

  rows      := cardinality(v_states);
  matched   := (select count(*)::int from unnest(v_states) s where s = 'matched');
  applied   := v_applied;
  possible  := (select count(*)::int from unnest(v_states) s where s = 'possible');
  unmatched := (select count(*)::int from unnest(v_states) s where s in ('unmatched', 'dismissed'));
  return next;
end;
$$;

---------------------------------------------------------------------------
-- The new-book hook (D4)
---------------------------------------------------------------------------

-- After a book is inserted, or its title, authors or ISBNs change: every
-- member's history rows in the book's household that aren't matched and that
-- the book could match go through _match_history_row; a clear match has its
-- status applied for that row's member (from their own history only) through
-- _apply_history, which never touches an app, tos or cleared row.
--
-- Prefilter, a superset of what the matcher can match, all by index:
--   - the row's isbn13 is one of the book's ISBN-13s;
--   - the row's base title key is a token prefix of one of the book's keys
--     (or empty or a lone article) and either has 2+ tokens or the row's title
--     key or base title key equals one of the book's keys;
--   - the book's base title key (2+ tokens) is a token prefix of the row's;
--   - the row has a pending candidate for this book (an edit can drop it).
-- A row's base title key is a token prefix of its title key, so "the row's
-- title key equals a book key" is reached through the first lookup.
--
-- Any error is caught and raised as a warning: intake matters more than a
-- missed auto-link, and the next upload re-runs matching.
create or replace function library.match_history_for_book()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_isbns text[];
  v_btk   text;
  v_keys  text[];
  v_pref  text[];
  v_id    uuid;
  h       library.reading_history;
begin
  if tg_op = 'UPDATE'
     and old.title is not distinct from new.title
     and old.authors is not distinct from new.authors
     and old.isbn13 is not distinct from new.isbn13
     and old.isbn10 is not distinct from new.isbn10 then
    return null;
  end if;

  begin
    v_isbns := library._isbn13s(new.isbn13, new.isbn10);
    v_btk   := library.match_base_title_key(new.title);
    v_keys  := array(select distinct k
                       from unnest(array[library.match_title_key(new.title), v_btk]) k
                      where k <> '');
    v_pref  := array(select distinct array_to_string(s.t[1:n], ' ')
                       from (select string_to_array(k, ' ') as t from unnest(v_keys) k) s
                      cross join lateral generate_series(1, cardinality(s.t)) n)
               || array['', 'the', 'a', 'an'];

    for v_id in
      select r.id from library.reading_history r
       where r.household_id = new.household_id and r.match_state <> 'matched'
         and r.isbn13 = any(v_isbns)
      union
      select r.id from library.reading_history r
       where r.household_id = new.household_id and r.match_state <> 'matched'
         and r.base_title_key = any(v_pref)
         and (r.base_title_key ~ ' ' or r.base_title_key = any(v_keys) or r.title_key = any(v_keys))
      union
      select r.id from library.reading_history r
       where r.household_id = new.household_id and r.match_state <> 'matched'
         and v_btk ~ ' '
         and r.base_title_key ~>=~ (v_btk || ' ')
         and r.base_title_key ~<~ (v_btk || '!')
      union
      select c.history_id from library.reading_history_candidates c
        join library.reading_history r on r.id = c.history_id
       where c.book_id = new.id and c.household_id = new.household_id
         and c.state = 'pending' and r.match_state <> 'matched'
      order by 1
    loop
      if library._match_history_row(v_id) = 'matched' then
        select * into h from library.reading_history r where r.id = v_id;
        perform library._apply_history(h.household_id, h.user_id, h.book_id, h.sg_status, h.last_read);
      end if;
    end loop;
  exception when others then raise warning 'read_history_match_failed %', sqlstate;
  end;
  return null;
end;
$$;

-- One trigger for both events: a WHEN clause can't name OLD on insert, so the
-- "did a matching column change" check is the function's first step.
drop trigger if exists books_match_reading_history on library.books;
create trigger books_match_reading_history
  after insert or update of title, authors, isbn13, isbn10 on library.books
  for each row execute function library.match_history_for_book();

---------------------------------------------------------------------------
-- Link and Not this book
---------------------------------------------------------------------------

-- Link: the caller's history row to a book of the row's household. Sets
-- book_id and matched, deletes the row's pending candidates (and any
-- candidate for this book), and applies the row's status through
-- _apply_history. 'linked', or 'not_found' when the row isn't the caller's or
-- the book isn't in the row's household.
create or replace function library.link_reading_history(p_history uuid, p_book uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  r      library.reading_history;
begin
  if v_user is null then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  if p_history is null or p_book is null then
    raise exception 'invalid_input' using errcode = '22023';
  end if;

  select * into r from library.reading_history h
   where h.id = p_history and h.user_id = v_user
     for update;
  if not found or not library.is_member(r.household_id) then
    return 'not_found';
  end if;
  if not exists (select 1 from library.books b where b.id = p_book and b.household_id = r.household_id) then
    return 'not_found';
  end if;

  delete from library.reading_history_candidates c
   where c.history_id = p_history and (c.state = 'pending' or c.book_id = p_book);
  update library.reading_history h set book_id = p_book, match_state = 'matched' where h.id = p_history;
  perform library._apply_history(r.household_id, v_user, p_book, r.sg_status, r.last_read);
  return 'linked';
end;
$$;

-- Not this book: the pair is dismissed for good (the matcher skips it). The
-- row's state is recomputed without re-matching: possible while a candidate is
-- pending, else dismissed. A matched row keeps its match. 'dismissed', or
-- 'not_found' when the row isn't the caller's or the book isn't its candidate.
create or replace function library.dismiss_reading_match(p_history uuid, p_book uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  r      library.reading_history;
begin
  if v_user is null then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  if p_history is null or p_book is null then
    raise exception 'invalid_input' using errcode = '22023';
  end if;

  select * into r from library.reading_history h
   where h.id = p_history and h.user_id = v_user
     for update;
  if not found or not library.is_member(r.household_id) then
    return 'not_found';
  end if;

  update library.reading_history_candidates c set state = 'dismissed'
   where c.history_id = p_history and c.book_id = p_book;
  if not found then
    return 'not_found';
  end if;

  update library.reading_history h
     set match_state = case
           when exists (select 1 from library.reading_history_candidates c
                         where c.history_id = p_history and c.state = 'pending') then 'possible'
           else 'dismissed' end
   where h.id = p_history and h.match_state <> 'matched';
  return 'dismissed';
end;
$$;

---------------------------------------------------------------------------
-- RLS and grants
---------------------------------------------------------------------------

alter table library.reading_history enable row level security;
alter table library.reading_history_candidates enable row level security;

drop policy if exists reading_history_select_own on library.reading_history;
create policy reading_history_select_own on library.reading_history
  for select to authenticated
  using (user_id = (select auth.uid()) and library.is_member(household_id));

drop policy if exists reading_history_candidates_select_own on library.reading_history_candidates;
create policy reading_history_candidates_select_own on library.reading_history_candidates
  for select to authenticated
  using (exists (select 1 from library.reading_history h
                  where h.id = history_id
                    and h.user_id = (select auth.uid())
                    and library.is_member(h.household_id)));

revoke all on library.reading_history            from public, anon, authenticated;
revoke all on library.reading_history_candidates from public, anon, authenticated;
grant select on library.reading_history            to authenticated;
grant select on library.reading_history_candidates to authenticated;

-- The key functions are pure; authenticated (and service_role) evaluate them
-- whenever they write a book, through the books_match_* indexes.
revoke execute on function library.match_norm(text)                    from public, anon;
revoke execute on function library.match_title_key(text)               from public, anon;
revoke execute on function library.match_base_title_key(text)          from public, anon;
revoke execute on function library.match_author_key(text)              from public, anon;
revoke execute on function library.match_isbn13(text)                  from public, anon;
revoke execute on function library._isbn13s(text[], text[])            from public, anon;
revoke execute on function library.book_isbn13s(library.books)         from public, anon;
revoke execute on function library.upload_reading_history(uuid, jsonb) from public, anon;
revoke execute on function library._match_history_row(uuid)            from public, anon, authenticated;
revoke execute on function library.reading_history_free_row()          from public, anon, authenticated;
revoke execute on function library.match_history_for_book()            from public, anon, authenticated;
revoke execute on function library.link_reading_history(uuid, uuid)    from public, anon;
revoke execute on function library.dismiss_reading_match(uuid, uuid)   from public, anon;

grant execute on function library.match_norm(text)                    to authenticated, service_role;
grant execute on function library.match_title_key(text)               to authenticated, service_role;
grant execute on function library.match_base_title_key(text)          to authenticated, service_role;
grant execute on function library.match_author_key(text)              to authenticated, service_role;
grant execute on function library.match_isbn13(text)                  to authenticated, service_role;
grant execute on function library._isbn13s(text[], text[])            to authenticated, service_role;
grant execute on function library.book_isbn13s(library.books)         to authenticated, service_role;
grant execute on function library.upload_reading_history(uuid, jsonb) to authenticated;
grant execute on function library.link_reading_history(uuid, uuid)    to authenticated;
grant execute on function library.dismiss_reading_match(uuid, uuid)   to authenticated;
