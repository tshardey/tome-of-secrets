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

---------------------------------------------------------------------------
---------------------------------------------------------------------------
-- Part 2: evidence, the series status, follow-ups, money and the re-check
-- (D6, D9-D11, design 4.2, 4.4, 4.5).
--
-- D6  _same_author_books(household, book): the household's other books
--     sharing a non-empty author key with the book, newest first (created_at
--     desc, id), at most 15, as [{title, seriesName, seriesVolume}]. Full and
--     series claims return it as same_author ([] for new_tags); the claim's
--     book gains isbns: up to 2 ISBN-13s then up to 2 ISBN-10s, cleaned to
--     digits and X. An old handler ignores both (D1).
-- D9  finish_tag_job reads seriesStatus (found | none | unsure; absent from
--     older handlers; anything else is invalid_result).
--       full, unsure            nothing applied, no marker. After the job is
--                               done and after the source-hash requeue, one
--                               series job (reason unsure, no run) is queued
--                               when the book has no series, isn't hand-set
--                               and its card is unchecked. A requeued full
--                               job holds the one active slot, so it wins.
--       full, found/none/absent as Plan 10.
--       series, any status      the series is applied when present (null
--                               applies nothing) and the card is always
--                               marked checked.
--     It can't loop: only full jobs queue follow-ups, only while the marker
--     is null; every finished series job sets it; and a series claim for a
--     checked book is done at cost 0 (Plan 10 D5). So a book gets at most one
--     searched check until the marker is cleared again (D11).
-- D10 Series jobs settle at their true cost through _ai_settle_actual,
--     capped at 10x the job's own reserve (the RPCs are member-callable, so a
--     forged cost can't drain the shared budget). A household can then end
--     over its cap by one call's overrun; its next reservation fails as
--     usual. Full and new_tags finishes, and every release except a series
--     job's tag_refused / tag_unreadable, stay clamped to the job's reserve
--     (_ai_settle): a billed-unknown retry never keeps more than the job
--     reserved, whatever cost the handler passes. ai_budget's tagging
--     reserve_micro is the larger reserve, since any full run can now queue
--     a series check.
-- D11 _series_recheck_reset() clears the "checked once" marker on the likely
--     misses, once, as this migration's last statement. It queues nothing;
--     Find series offers those books again behind its confirm.
---------------------------------------------------------------------------

---------------------------------------------------------------------------
-- Constants (D10)
---------------------------------------------------------------------------

-- The series-check reservation per call: library-tagger's
-- SERIES_RESERVE_MICRO. Provisional until Task 6 measures searching jobs.
create or replace function library.series_reserve_micro()
returns int
language sql
immutable
set search_path = ''
as $$ select 150000 $$;

-- The tagging reservation per call, now with the same-author block, the Open
-- Library line and the D7 rules at their caps: library-tagger's
-- TAG_RESERVE_MICRO (was 82000).
create or replace function library.tag_reserve_micro()
returns int
language sql
immutable
set search_path = ''
as $$ select 94000 $$;

-- The follow-up's reason (D9).
alter table library.tag_jobs drop constraint if exists tag_jobs_reason_check;
alter table library.tag_jobs add constraint tag_jobs_reason_check
  check (reason in ('new_book', 'changed', 'manual', 'run', 'new_tags', 'series', 'unsure'));

---------------------------------------------------------------------------
-- Same-author books (D6)
---------------------------------------------------------------------------

create or replace function library._same_author_books(p_household uuid, p_book uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object('title', x.title, 'seriesName', x.series_name,
                                               'seriesVolume', x.series_volume)
                            order by x.created_at desc, x.id), '[]'::jsonb)
    from (select o.id, o.title, o.series_name, o.series_volume, o.created_at
            from library.books b
            join library.books o on o.household_id = b.household_id and o.id <> b.id
           where b.id = p_book and b.household_id = p_household
             and exists (select 1
                           from unnest(b.authors) ba, unnest(o.authors) oa
                          where library._author_key(ba) <> ''
                            and library._author_key(ba) = library._author_key(oa))
           order by o.created_at desc, o.id
           limit 15) x
$$;

---------------------------------------------------------------------------
-- Money (D10)
---------------------------------------------------------------------------

-- Internal. Settles a reservation at the true cost: charges
-- least(greatest(p_cost, 0), 10 * p_reserved) and moves the reserved month's
-- total and household rows by charged - reserved, which may be positive
-- (never below 0). The call count is unchanged. Returns the charged cost.
create or replace function library._ai_settle_actual(p_household uuid, p_feature text, p_month date,
                                                     p_reserved int, p_cost int)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reserved int := greatest(coalesce(p_reserved, 0), 0);
  v_charged  int;
  v_delta    int;
begin
  v_charged := least(greatest(coalesce(p_cost, 0), 0), 10 * v_reserved);
  v_delta   := v_charged - v_reserved;
  update library.ai_usage_total t
     set spent_micro = greatest(0, t.spent_micro + v_delta)
   where t.feature = p_feature and t.month = p_month;
  update library.ai_usage u
     set spent_micro = greatest(0, u.spent_micro + v_delta)
   where u.household_id = p_household and u.feature = p_feature and u.month = p_month;
  return v_charged;
end;
$$;

-- This UTC month's spend and budgets for a feature. The only client path to
-- ai_usage_total. reserve_micro is the larger tagging reservation (any full
-- run may queue series checks, D10), or 0 for Ask (whose reservation is per
-- call; begin_ask answers 'budget').
create or replace function library.ai_budget(p_household uuid, p_feature text)
returns table (month date, spent_micro bigint, budget_micro bigint, reserve_micro int,
               global_spent_micro bigint, global_budget_micro bigint)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_month date := date_trunc('month', now() at time zone 'utc')::date;
begin
  if p_household is null or not library.is_member(p_household) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  if p_feature is null or p_feature not in ('tagging', 'ask') then
    raise exception 'invalid_feature' using errcode = '22023';
  end if;

  return query
  select v_month,
         coalesce((select u.spent_micro from library.ai_usage u
                    where u.household_id = p_household and u.feature = p_feature and u.month = v_month), 0)::bigint,
         library.ai_budget_micro(p_household, p_feature, v_month),
         case when p_feature = 'tagging' then greatest(library.tag_reserve_micro(), library.series_reserve_micro())
              else 0 end,
         coalesce((select t.spent_micro from library.ai_usage_total t
                    where t.feature = p_feature and t.month = v_month), 0)::bigint,
         library.ai_global_budget_micro(p_feature);
end;
$$;

---------------------------------------------------------------------------
-- Claim: same_author and isbns (D6)
---------------------------------------------------------------------------

-- As 20261117223339_library-series-suggestions.sql, plus book.isbns (up to 2
-- ISBN-13s then up to 2 ISBN-10s, cleaned to digits and X, in stored order;
-- a value of the wrong shape is skipped) and same_author (_same_author_books)
-- for full and series claims, [] for new_tags, null when nothing is claimed.
drop function if exists library.claim_tag_job(uuid);
create function library.claim_tag_job(p_job uuid)
returns table (outcome text, claim_token uuid, attempts int, kind text, book jsonb, card jsonb, vocab jsonb,
               vocab_version int, removed jsonb, tos_tags text[], series_names jsonb, same_author jsonb)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_job     library.tag_jobs%rowtype;
  v_book    library.books%rowtype;
  v_card    library.book_cards%rowtype;
  v_month   date;
  v_reserve int;
  v_token   uuid;
  v_version int;
  v_kind    text;
  v_since   int := 0;
  v_isbns   jsonb;
begin
  select j.* into v_job from library.tag_jobs j where j.id = p_job for update;
  if not found or not library.is_member(v_job.household_id) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  if v_job.status in ('done', 'failed') then
    return query select v_job.status, null::uuid, v_job.attempts, v_job.kind, null::jsonb, null::jsonb,
                        null::jsonb, null::int, null::jsonb, null::text[], null::jsonb, null::jsonb;
    return;
  end if;

  if v_job.status = 'processing' and v_job.claimed_at > now() - interval '7 minutes' then
    return query select 'busy'::text, null::uuid, v_job.attempts, v_job.kind, null::jsonb, null::jsonb,
                        null::jsonb, null::int, null::jsonb, null::text[], null::jsonb, null::jsonb;
    return;
  end if;

  if v_job.status = 'queued' and v_job.retry_at > now() then
    return query select 'retry_later'::text, null::uuid, v_job.attempts, v_job.kind, null::jsonb, null::jsonb,
                        null::jsonb, null::int, null::jsonb, null::text[], null::jsonb, null::jsonb;
    return;
  end if;

  select b.* into v_book from library.books b where b.id = v_job.book_id;
  select c.* into v_card from library.book_cards c where c.book_id = v_job.book_id;
  -- A new_tags or series job for a book that has lost its card is tagged in full.
  v_kind := case when v_job.kind in ('new_tags', 'series') and v_card.book_id is not null then v_job.kind
                 else 'full' end;

  -- D5: re-checked before anything is reserved.
  if v_kind = 'series'
     and (v_book.series_name is not null or v_card.series_checked_at is not null
          or v_book.user_edited_fields && '{seriesName,seriesVolume}'::text[]) then
    update library.tag_jobs j
       set status = 'done', claim_token = null, retry_at = null, error_code = null
     where j.id = p_job;
    return query select 'done'::text, null::uuid, v_job.attempts, v_job.kind, null::jsonb, null::jsonb,
                        null::jsonb, null::int, null::jsonb, null::text[], null::jsonb, null::jsonb;
    return;
  end if;

  -- Due: queued, or processing with an expired lease (whose reservation stays
  -- charged: the call may have been billed).
  if v_job.attempts >= 3 then
    update library.tag_jobs j
       set status = 'failed', error_code = 'attempts_exhausted', claim_token = null, retry_at = null
     where j.id = p_job;
    return query select 'failed'::text, null::uuid, v_job.attempts, v_job.kind, null::jsonb, null::jsonb,
                        null::jsonb, null::int, null::jsonb, null::text[], null::jsonb, null::jsonb;
    return;
  end if;

  v_reserve := case when v_kind = 'series' then library.series_reserve_micro() else library.tag_reserve_micro() end;
  v_month := library._ai_reserve(v_job.household_id, 'tagging', v_reserve);
  if v_month is null then
    return query select 'budget'::text, null::uuid, v_job.attempts, v_job.kind, null::jsonb, null::jsonb,
                        null::jsonb, null::int, null::jsonb, null::text[], null::jsonb, null::jsonb;
    return;
  end if;

  v_version := library._vocab_version(v_job.household_id);
  if v_kind = 'new_tags' then
    v_since := v_card.vocab_version;
  end if;

  v_token := gen_random_uuid();
  update library.tag_jobs j
     set status = 'processing', attempts = j.attempts + 1, claim_token = v_token, claimed_at = now(),
         retry_at = null, reserved_micro = v_reserve, reserved_month = v_month, error_code = null,
         kind = v_kind, vocab_version = v_version, cover_at_claim = v_book.cover_url,
         source_hash = md5(coalesce(v_book.synopsis, '') || '|' || coalesce(v_book.cover_url, ''))
   where j.id = p_job;

  -- D6: the ISBNs for the Open Library lookup.
  v_isbns := coalesce((select jsonb_agg(c.v order by c.ord)
                         from (select x.ord, upper(regexp_replace(x.raw, '[^0-9Xx]', '', 'g')) as v
                                 from unnest(v_book.isbn13) with ordinality x(raw, ord)
                                where upper(regexp_replace(x.raw, '[^0-9Xx]', '', 'g')) ~ '^[0-9]{13}$'
                                order by x.ord limit 2) c), '[]'::jsonb)
          || coalesce((select jsonb_agg(c.v order by c.ord)
                         from (select x.ord, upper(regexp_replace(x.raw, '[^0-9Xx]', '', 'g')) as v
                                 from unnest(v_book.isbn10) with ordinality x(raw, ord)
                                where upper(regexp_replace(x.raw, '[^0-9Xx]', '', 'g')) ~ '^[0-9]{9}[0-9X]$'
                                order by x.ord limit 2) c), '[]'::jsonb);

  return query
  select 'claimed'::text, v_token, v_job.attempts + 1, v_kind,
         jsonb_build_object('title', v_book.title, 'authors', to_jsonb(v_book.authors),
                            'seriesName', v_book.series_name, 'seriesVolume', v_book.series_volume,
                            'description', v_book.synopsis, 'coverUrl', v_book.cover_url, 'isbns', v_isbns),
         case when v_card.book_id is null then null
              else jsonb_build_object('summary', v_card.summary, 'coverDescription', v_card.cover_description,
                                      'vocabVersion', v_card.vocab_version) end,
         case when v_kind = 'series' then '[]'::jsonb
              else coalesce((select jsonb_agg(jsonb_build_object('id', t.id, 'category', t.category)
                                              order by t.category, t.id)
                               from library.library_tags t
                              where t.active and t.added_version > v_since
                                and (t.household_id is null or t.household_id = v_job.household_id)), '[]'::jsonb)
         end,
         v_version,
         jsonb_build_object(
           'tos', coalesce((select jsonb_agg(r.tag_id order by r.tag_id) from library.tag_removals r
                             where r.book_id = v_job.book_id and r.kind = 'tos'), '[]'::jsonb),
           'library', coalesce((select jsonb_agg(r.tag_id order by r.tag_id) from library.tag_removals r
                                 where r.book_id = v_job.book_id and r.kind = 'library'), '[]'::jsonb)),
         array(select bt.tag_id from library.book_tags bt where bt.book_id = v_job.book_id order by bt.tag_id),
         case when v_kind = 'new_tags' then '[]'::jsonb
              else library._household_series_names(v_job.household_id) end,
         case when v_kind = 'new_tags' then '[]'::jsonb
              else library._same_author_books(v_job.household_id, v_job.book_id) end;
end;
$$;

---------------------------------------------------------------------------
-- Finish: the series status, the follow-up and the true series cost (D9, D10)
---------------------------------------------------------------------------

-- As 20261117223339_library-series-suggestions.sql (see its notes on
-- p_result, the lock order and the source-hash requeue), plus:
--   seriesStatus  found | none | unsure, or absent / null (an older tagger);
--                 anything else is invalid_result (22023).
--   full job      unsure: no _apply_series and no marker; after the job is
--                 done and after the requeue, one series job (reason unsure,
--                 run_id null) when the book has no series, isn't hand-set
--                 and its card is unchecked. found / none / absent: as Plan 10.
--   series job    the series is applied when the key is present (null
--                 applies nothing); the card is marked checked always.
--   charge        a series job through _ai_settle_actual (true cost, 10x the
--                 job's reserve at most); every other kind clamped as before.
create or replace function library.finish_tag_job(p_job uuid, p_claim uuid, p_result jsonb, p_usage jsonb,
                                                  p_cost_micro int, p_model text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_job       library.tag_jobs%rowtype;
  v_household uuid;
  v_book_id   uuid;
  v_since     int := 0;
  v_full      boolean;
  v_seen      boolean;
  v_lib       text[];
  v_summary   text;
  v_cover     text;
  v_s         jsonb;
  v_id        text;
  v_label     text;
  v_category  text;
  v_why       text;
  v_sid       uuid;
  v_sstatus   text;
  v_suggested int := 0;
  v_charged   int;
  v_status    text;
  v_followup  boolean := false;
begin
  -- Unlocked read for the member check and the book id; the book is locked
  -- before the job (see above).
  select j.household_id, j.book_id into v_household, v_book_id from library.tag_jobs j where j.id = p_job;
  if not found or not library.is_member(v_household) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  perform 1 from library.books b where b.id = v_book_id for no key update;
  select j.* into v_job from library.tag_jobs j where j.id = p_job for update;

  if v_job.status <> 'processing' or p_claim is null or v_job.claim_token is distinct from p_claim then
    return 'stale';
  end if;

  if p_result is null or jsonb_typeof(p_result) <> 'object'
     or coalesce(jsonb_typeof(p_result -> 'tos'), 'array') <> 'array'
     or coalesce(jsonb_typeof(p_result -> 'library'), 'array') <> 'array'
     or coalesce(jsonb_typeof(p_result -> 'suggestions'), 'array') <> 'array'
     or coalesce(jsonb_typeof(p_result -> 'summary'), 'null') not in ('string', 'null')
     or coalesce(jsonb_typeof(p_result -> 'coverDescription'), 'null') not in ('string', 'null')
     or p_model is null or char_length(p_model) not between 1 and 100 then
    raise exception 'invalid_result' using errcode = '22023';
  end if;

  -- D9: found | none | unsure; absent (or null) from an older tagger.
  if coalesce(jsonb_typeof(p_result -> 'seriesStatus'), 'null') <> 'null' then
    if jsonb_typeof(p_result -> 'seriesStatus') <> 'string'
       or p_result ->> 'seriesStatus' not in ('found', 'none', 'unsure') then
      raise exception 'invalid_result' using errcode = '22023';
    end if;
    v_status := p_result ->> 'seriesStatus';
  end if;

  if v_job.kind = 'series' then
    -- A series check: the series and the checked mark only. Every finished
    -- series job marks the card, whatever its status (D9), so it never runs
    -- twice.
    if p_result ? 'series' then
      perform library._apply_series(v_job.household_id, v_job.book_id, p_result -> 'series');
    end if;
    update library.book_cards c set series_checked_at = now() where c.book_id = v_job.book_id;
  else
    v_full := v_job.kind = 'full';
    -- A full job must leave a card; without one every later run would bill the
    -- book again. The function releases a blank summary as tag_unreadable.
    if v_full and coalesce(btrim(p_result ->> 'summary'), '') = '' then
      raise exception 'invalid_result' using errcode = '22023';
    end if;
    v_seen := v_full and coalesce(p_result -> 'coverSeen', 'false'::jsonb) = 'true'::jsonb;
    if not v_full then
      v_since := coalesce((select c.vocab_version from library.book_cards c where c.book_id = v_job.book_id), 0);
    end if;

    -- ToS tags.
    insert into library.book_tags (book_id, household_id, tag_id, added_by)
    select v_job.book_id, v_job.household_id, x.id, 'tagger'
      from (select distinct e.value #>> '{}' as id
              from jsonb_array_elements(coalesce(p_result -> 'tos', '[]'::jsonb)) e
             where jsonb_typeof(e.value) = 'string') x
     where x.id ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(x.id) <= 40 and x.id <> 'audio'
       and not exists (select 1 from library.tag_removals r
                        where r.book_id = v_job.book_id and r.kind = 'tos' and r.tag_id = x.id)
    on conflict do nothing;

    -- Library tags: the allowed subset of the result.
    v_lib := array(
      select distinct t.id
        from jsonb_array_elements(coalesce(p_result -> 'library', '[]'::jsonb)) e
        join library.library_tags t
          on t.id = e.value #>> '{}' and t.active and t.added_version > v_since
         and (t.household_id is null or t.household_id = v_job.household_id)
       where jsonb_typeof(e.value) = 'string'
         and (v_seen or t.category not in ('cover-colour', 'cover-motif'))
         and not exists (select 1 from library.tag_removals r
                          where r.book_id = v_job.book_id and r.kind = 'library' and r.tag_id = t.id));

    -- Cover tags follow the cover (D7): the tagger's own, never a hand-added one,
    -- and no removal record (the replacing flag is on only for this delete).
    if v_seen then
      perform set_config('library.tagger_replacing', 'on', true);
      delete from library.book_library_tags bl
       using library.library_tags t
       where bl.book_id = v_job.book_id and bl.added_by = 'tagger'
         and t.id = bl.tag_id and (t.household_id is null or t.household_id = v_job.household_id)
         and t.category in ('cover-colour', 'cover-motif')
         and not (bl.tag_id = any (v_lib));
      perform set_config('library.tagger_replacing', 'off', true);
    end if;

    insert into library.book_library_tags (book_id, household_id, tag_id, added_by)
    select v_job.book_id, v_job.household_id, x, 'tagger' from unnest(v_lib) x
    on conflict do nothing;

    -- The card.
    if v_full then
      v_summary := btrim(left(btrim(p_result ->> 'summary'), 800));
      v_cover   := case when v_seen then nullif(btrim(left(btrim(p_result ->> 'coverDescription'), 300)), '') end;
      insert into library.book_cards as c (book_id, household_id, summary, cover_description, model,
                                           vocab_version, cover_url_seen, written_at)
      values (v_job.book_id, v_job.household_id, v_summary, v_cover, p_model, v_job.vocab_version,
              case when v_seen then v_job.cover_at_claim end, now())
      on conflict (book_id) do update
        set summary           = excluded.summary,
            cover_description = case when v_seen then excluded.cover_description else c.cover_description end,
            cover_url_seen    = case when v_seen then excluded.cover_url_seen else c.cover_url_seen end,
            model             = excluded.model,
            vocab_version     = excluded.vocab_version,
            written_at        = excluded.written_at;

      -- The series (D8): every full job checks it again. Unsure (D9) applies
      -- nothing and leaves the marker for the series check queued below.
      if v_status = 'unsure' then
        v_followup := true;
      elsif p_result ? 'series' then
        perform library._apply_series(v_job.household_id, v_job.book_id, p_result -> 'series');
        update library.book_cards c set series_checked_at = now() where c.book_id = v_job.book_id;
      end if;
    else
      update library.book_cards c
         set vocab_version = greatest(c.vocab_version, v_job.vocab_version)
       where c.book_id = v_job.book_id;
    end if;

    -- Suggestions.
    for v_s in select e.value from jsonb_array_elements(coalesce(p_result -> 'suggestions', '[]'::jsonb)) e loop
      exit when v_suggested >= 3;
      continue when jsonb_typeof(v_s) <> 'object'
                 or coalesce(jsonb_typeof(v_s -> 'id'), '') <> 'string'
                 or coalesce(jsonb_typeof(v_s -> 'label'), '') <> 'string'
                 or coalesce(jsonb_typeof(v_s -> 'category'), '') <> 'string'
                 or coalesce(jsonb_typeof(v_s -> 'why'), '') <> 'string';
      v_id       := v_s ->> 'id';
      v_label    := btrim(left(btrim(v_s ->> 'label'), 60));
      v_category := v_s ->> 'category';
      v_why      := btrim(left(btrim(v_s ->> 'why'), 200));
      continue when v_id !~ '^[a-z0-9]+(-[a-z0-9]+)*$' or char_length(v_id) > 40
                 or v_category not in ('trope', 'creature', 'setting', 'era', 'theme', 'mood', 'plot',
                                       'protagonist', 'audience', 'subgenre', 'cover-colour', 'cover-motif', 'fact')
                 or v_label = '' or v_why = '';
      continue when exists (select 1 from library.tag_removals r
                             where r.book_id = v_job.book_id and r.kind = 'library' and r.tag_id = v_id);

      -- Already in the vocabulary: a tag, under the same rules as the list.
      if exists (select 1 from library.library_tags t
                  where t.id = v_id and (t.household_id is null or t.household_id = v_job.household_id)) then
        insert into library.book_library_tags (book_id, household_id, tag_id, added_by)
        select v_job.book_id, v_job.household_id, t.id, 'tagger'
          from library.library_tags t
         where t.id = v_id and t.active and t.added_version > v_since
           and (t.household_id is null or t.household_id = v_job.household_id)
           and (v_seen or t.category not in ('cover-colour', 'cover-motif'))
        on conflict do nothing;
        continue;
      end if;

      continue when not v_seen and (v_category in ('cover-colour', 'cover-motif') or v_id like 'cover-%');

      insert into library.tag_suggestions (household_id, tag_id, label, category)
      values (v_job.household_id, v_id, v_label, v_category)
      on conflict (household_id, tag_id) do nothing;
      -- FOR SHARE: an approve or dismiss in flight finishes first, and none
      -- can start until this commits, so a book linked here is one the approve
      -- will see.
      select s.id, s.status into v_sid, v_sstatus
        from library.tag_suggestions s where s.household_id = v_job.household_id and s.tag_id = v_id
         for share;
      if v_sstatus = 'pending' then
        insert into library.tag_suggestion_books (suggestion_id, book_id, household_id, why)
        values (v_sid, v_job.book_id, v_job.household_id, v_why)
        on conflict do nothing;
      elsif v_sstatus = 'approved' then
        -- Approved since the vocabulary check above: now a tag like any other.
        insert into library.book_library_tags (book_id, household_id, tag_id, added_by)
        select v_job.book_id, v_job.household_id, t.id, 'tagger'
          from library.library_tags t
         where t.id = v_id and t.active
           and (t.household_id is null or t.household_id = v_job.household_id)
        on conflict do nothing;
      end if;
      v_suggested := v_suggested + 1;
    end loop;
  end if;

  -- D10: a series job records its true cost (10x guard); the others stay
  -- clamped to the reserve.
  if v_job.kind = 'series' then
    v_charged := library._ai_settle_actual(v_job.household_id, 'tagging', v_job.reserved_month,
                                           v_job.reserved_micro, p_cost_micro);
  else
    v_charged := library._ai_settle(v_job.household_id, 'tagging', v_job.reserved_month, v_job.reserved_micro,
                                    p_cost_micro, false);
  end if;

  update library.tag_jobs j
     set status = 'done', cost_micro = j.cost_micro + v_charged, usage = p_usage,
         claim_token = null, retry_at = null, error_code = null
   where j.id = p_job;

  -- The synopsis or cover changed mid-job: tag it again (Review Focus 3).
  -- Read now, after the writes, so a change committed while this ran is seen.
  -- A change still uncommitted holds the book lock this finish waited for, or
  -- waits on it, and queues its own job once this commits.
  if (select md5(coalesce(b.synopsis, '') || '|' || coalesce(b.cover_url, ''))
        from library.books b where b.id = v_job.book_id) is distinct from v_job.source_hash then
    insert into library.tag_jobs (household_id, book_id, kind, reason, requested_by)
    values (v_job.household_id, v_job.book_id, 'full', 'changed', auth.uid())
    on conflict (book_id) where status in ('queued', 'processing') do nothing;
  end if;

  -- D9: an unsure full job queues one series check, after the requeue above
  -- (a requeued full job holds the active slot and wins). Only while the
  -- book is blank, not hand-set and unchecked; the series job marks it.
  if v_followup then
    insert into library.tag_jobs (household_id, book_id, kind, reason, requested_by)
    select v_job.household_id, v_job.book_id, 'series', 'unsure', auth.uid()
      from library.books b
      join library.book_cards c on c.book_id = b.id
     where b.id = v_job.book_id
       and b.series_name is null
       and not (b.user_edited_fields && '{seriesName,seriesVolume}'::text[])
       and c.series_checked_at is null
    on conflict (book_id) where status in ('queued', 'processing') do nothing;
  end if;

  return 'done';
end;
$$;


---------------------------------------------------------------------------
-- Release: the true cost of a failed series check (D10)
---------------------------------------------------------------------------

-- As 20261114001500_library-tagging.sql (same outcomes), except that a
-- series job released with tag_refused or tag_unreadable (the call ran and
-- its usage is known) settles at its true cost through _ai_settle_actual.
-- Every other release is clamped to the job's own reserved_micro, so a
-- billed-unknown retry, whatever cost the handler passes, keeps at most what
-- this job reserved.
create or replace function library.release_tag_job(p_job uuid, p_claim uuid, p_error text, p_retry_at timestamptz,
                                                   p_usage jsonb, p_cost_micro int)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_job      library.tag_jobs%rowtype;
  v_status   text;
  v_error    text;
  v_retry_at timestamptz;
  v_attempts int;
  v_uncount  boolean := false;
  v_cost     int := p_cost_micro;
  v_charged  int;
begin
  select j.* into v_job from library.tag_jobs j where j.id = p_job for update;
  if not found or not library.is_member(v_job.household_id) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  if v_job.status <> 'processing' or p_claim is null or v_job.claim_token is distinct from p_claim then
    return 'stale';
  end if;

  v_attempts := v_job.attempts;

  if p_error in ('misconfigured', 'billing') then
    v_status   := 'queued';
    v_attempts := greatest(0, v_job.attempts - 1);
    v_uncount  := true;
    v_cost     := 0;
  elsif p_error = 'tos_tags_unavailable' and p_retry_at is not null then
    v_status   := 'queued';
    v_retry_at := p_retry_at;
    v_attempts := greatest(0, v_job.attempts - 1);
    v_uncount  := true;
    v_cost     := 0;
  elsif p_error is null and p_retry_at is not null then
    if v_job.attempts < 3 then
      v_status   := 'queued';
      v_retry_at := p_retry_at;
    else
      v_status := 'failed';
      v_error  := 'tag_unavailable';
    end if;
  elsif p_error in ('tag_refused', 'tag_rejected', 'tag_unreadable') then
    v_status := 'failed';
    v_error  := p_error;
  else
    raise exception 'invalid_release' using errcode = '22023';
  end if;

  -- D10: a series job's usage-bearing failure records its true cost (10x
  -- guard). Everything else stays clamped to the job's own reserve, so a
  -- billed-unknown retry never keeps more than was reserved.
  if v_job.kind = 'series' and v_error in ('tag_refused', 'tag_unreadable') then
    v_charged := library._ai_settle_actual(v_job.household_id, 'tagging', v_job.reserved_month,
                                           v_job.reserved_micro, v_cost);
  else
    v_charged := library._ai_settle(v_job.household_id, 'tagging', v_job.reserved_month, v_job.reserved_micro,
                                    v_cost, v_uncount);
  end if;

  update library.tag_jobs j
     set status      = v_status,
         attempts    = v_attempts,
         retry_at    = v_retry_at,
         error_code  = v_error,
         usage       = p_usage,
         cost_micro  = j.cost_micro + v_charged,
         claim_token = null
   where j.id = p_job;

  return v_status;
end;
$$;


---------------------------------------------------------------------------
-- The one-time re-check (D11, design 4.5)
---------------------------------------------------------------------------

-- Internal, no client grant. Clears book_cards.series_checked_at on every
-- checked card whose book has no series, isn't hand-set (neither seriesName
-- nor seriesVolume in user_edited_fields), has no pending row on a listed
-- suggestion (a pending new row, or any existing row), and either shares a
-- non-empty author key with another book in its household that has a
-- series, or has a synopsis under 100 characters. A dismissed or approved
-- book row, or a pending one on a decided new row, doesn't keep it. Queues
-- nothing. Returns the number of markers cleared.
create or replace function library._series_recheck_reset()
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_n int;
begin
  -- The author keys of every book with a series, computed once.
  with series_keys as (
    select distinct o.household_id, o.id, library._author_key(a.name) as k
      from library.books o, unnest(o.authors) a(name)
     where o.series_name is not null and library._author_key(a.name) <> ''
  )
  update library.book_cards c
     set series_checked_at = null
    from library.books b
   where b.id = c.book_id and b.household_id = c.household_id
     and c.series_checked_at is not null
     and b.series_name is null
     and not (b.user_edited_fields && '{seriesName,seriesVolume}'::text[])
     and not exists (select 1
                       from library.series_suggestion_books sb
                       join library.series_suggestions s on s.id = sb.suggestion_id
                      where sb.book_id = b.id and sb.status = 'pending'
                        and (s.kind = 'existing' or s.status = 'pending'))
     and (char_length(coalesce(b.synopsis, '')) < 100
          or exists (select 1
                       from series_keys sk, unnest(b.authors) ba(name)
                      where sk.household_id = b.household_id and sk.id <> b.id
                        and sk.k = library._author_key(ba.name)));
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

---------------------------------------------------------------------------
-- Grants (part 2)
---------------------------------------------------------------------------

revoke execute on function library.series_reserve_micro()                              from public, anon;
revoke execute on function library.tag_reserve_micro()                                 from public, anon;
revoke execute on function library._same_author_books(uuid, uuid)                      from public, anon, authenticated;
revoke execute on function library._ai_settle_actual(uuid, text, date, int, int)       from public, anon, authenticated;
revoke execute on function library._series_recheck_reset()                             from public, anon, authenticated;
revoke execute on function library.ai_budget(uuid, text)                               from public, anon;
revoke execute on function library.claim_tag_job(uuid)                                 from public, anon;
revoke execute on function library.finish_tag_job(uuid, uuid, jsonb, jsonb, int, text) from public, anon;
revoke execute on function library.release_tag_job(uuid, uuid, text, timestamptz, jsonb, int) from public, anon;

grant execute on function library.series_reserve_micro()                               to authenticated;
grant execute on function library.tag_reserve_micro()                                  to authenticated;
grant execute on function library.ai_budget(uuid, text)                                to authenticated;
grant execute on function library.claim_tag_job(uuid)                                  to authenticated;
grant execute on function library.finish_tag_job(uuid, uuid, jsonb, jsonb, int, text)  to authenticated;
grant execute on function library.release_tag_job(uuid, uuid, text, timestamptz, jsonb, int) to authenticated;

-- D11: the re-check runs once, when this migration is pushed. It must stay
-- the last statement.
select library._series_recheck_reset();
