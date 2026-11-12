-- Library cover finder: household members mark books with bad or missing
-- covers, the open app gathers candidate covers, the library-covers Edge
-- Function screens them with Claude, and a person applies one.
--
-- cover_marks        one row per marked book, shared by the household.
-- cover_searches     the queue and the results store. One active search per
--                    book (cover_searches_active_uq). A book's active row, when
--                    there is one, is always its newest row: a new search is
--                    inserted only after the active one is applied or dismissed.
-- cover_usage        estimated spend per household per UTC month.
-- cover_usage_total  the same, project-wide. No policy and no client grant:
--                    only the definer functions below read or write it.
--
-- Budget: claim_cover_search reserves cover_reserve_micro() against both
-- usage rows (the total row first, then the household's) before the
-- screening call, and answers 'budget' when either would pass its ceiling.
-- finish and release charge the clamped cost and refund the rest to the
-- month the reservation came from (reserved_month), never below 0.
--
-- No direct client writes: select only (claim_token is never readable), and
-- every write goes through a security definer RPC with an empty search_path
-- and an explicit library.is_member check. A missing id raises the same
-- 42501 as a foreign one, so ids can't be probed.
--
-- Idempotent: safe to re-run.

---------------------------------------------------------------------------
-- Constants (each a one-line change)
---------------------------------------------------------------------------

-- $5.00 per household per UTC month.
create or replace function library.cover_budget_micro()
returns bigint
language sql
immutable
set search_path = ''
as $$ select 5000000::bigint $$;

-- $5.00 for the whole project per UTC month.
create or replace function library.cover_global_budget_micro()
returns bigint
language sql
immutable
set search_path = ''
as $$ select 5000000::bigint $$;

-- The per-call ceiling reserved before each screening call.
create or replace function library.cover_reserve_micro()
returns int
language sql
immutable
set search_path = ''
as $$ select 4300 $$;

---------------------------------------------------------------------------
-- Tables
---------------------------------------------------------------------------

create table if not exists library.cover_marks (
  book_id      uuid primary key,
  household_id uuid not null,
  reasons      text[] not null default '{}',
  note         text,
  marked_by    uuid default auth.uid() references auth.users (id) on delete set null,
  marked_at    timestamptz not null default now(),
  foreign key (book_id, household_id) references library.books (id, household_id) on delete cascade
);

create table if not exists library.cover_searches (
  id               uuid primary key default gen_random_uuid(),
  household_id     uuid not null,
  book_id          uuid not null,
  requested_by     uuid default auth.uid() references auth.users (id) on delete set null,
  batch_id         uuid not null,
  reasons          text[] not null default '{}',
  note             text,
  cover_at_request text,
  status           text not null default 'queued'
                   check (status in ('queued', 'gathered', 'processing', 'ready',
                                     'nothing_found', 'failed', 'applied', 'dismissed')),
  attempts         int not null default 0 check (attempts between 0 and 3),
  claim_token      uuid,
  claimed_at       timestamptz,
  retry_at         timestamptz,
  candidates       jsonb check (candidates is null
                                or (jsonb_typeof(candidates) = 'array' and jsonb_array_length(candidates) <= 6)),
  results          jsonb not null default '[]'
                   check (jsonb_typeof(results) = 'array' and jsonb_array_length(results) <= 4),
  screening        jsonb,
  usage            jsonb,
  reserved_micro   int not null default 0 check (reserved_micro >= 0),
  reserved_month   date, -- the UTC month the reservation was taken from; refunds go there
  cost_micro       int not null default 0 check (cost_micro >= 0),
  error_code       text check (error_code in ('screen_refused', 'screen_rejected', 'screen_unreadable',
                                              'screen_unavailable', 'attempts_exhausted')),
  seen_at          timestamptz,
  applied_by       uuid references auth.users (id) on delete set null,
  applied_url      text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  foreign key (book_id, household_id) references library.books (id, household_id) on delete cascade
);

create table if not exists library.cover_usage (
  household_id uuid references library.households (id) on delete cascade,
  month        date check (month = date_trunc('month', month)::date),
  spent_micro  bigint not null default 0 check (spent_micro >= 0),
  screens      int not null default 0 check (screens >= 0),
  primary key (household_id, month)
);

create table if not exists library.cover_usage_total (
  month       date primary key check (month = date_trunc('month', month)::date),
  spent_micro bigint not null default 0 check (spent_micro >= 0),
  screens     int not null default 0 check (screens >= 0)
);

-- The reasons and note checks, shared by marks and searches.
alter table library.cover_marks drop constraint if exists cover_marks_reasons_check;
alter table library.cover_marks add constraint cover_marks_reasons_check
  check (reasons <@ array['wrong_language', 'placeholder', 'wrong_book', 'low_quality']::text[]);

alter table library.cover_marks drop constraint if exists cover_marks_note_check;
alter table library.cover_marks add constraint cover_marks_note_check
  check (note is null or (note = btrim(note) and char_length(note) between 1 and 500));

alter table library.cover_searches drop constraint if exists cover_searches_reasons_check;
alter table library.cover_searches add constraint cover_searches_reasons_check
  check (reasons <@ array['wrong_language', 'placeholder', 'wrong_book', 'low_quality']::text[]);

alter table library.cover_searches drop constraint if exists cover_searches_note_check;
alter table library.cover_searches add constraint cover_searches_note_check
  check (note is null or (note = btrim(note) and char_length(note) between 1 and 500));

-- One active search per book (D2).
create unique index if not exists cover_searches_active_uq
  on library.cover_searches (book_id)
  where status in ('queued', 'gathered', 'processing', 'ready', 'nothing_found', 'failed');
create index if not exists cover_searches_household_status_idx
  on library.cover_searches (household_id, status);
-- Cover the composite foreign keys and the ON DELETE SET NULL actions.
create index if not exists cover_searches_book_household_idx
  on library.cover_searches (book_id, household_id);
create index if not exists cover_searches_requested_by_idx
  on library.cover_searches (requested_by) where requested_by is not null;
create index if not exists cover_searches_applied_by_idx
  on library.cover_searches (applied_by) where applied_by is not null;
create index if not exists cover_marks_household_id_idx
  on library.cover_marks (household_id);
create index if not exists cover_marks_book_household_idx
  on library.cover_marks (book_id, household_id);
create index if not exists cover_marks_marked_by_idx
  on library.cover_marks (marked_by) where marked_by is not null;

drop trigger if exists cover_searches_set_updated_at on library.cover_searches;
create trigger cover_searches_set_updated_at
  before update on library.cover_searches
  for each row execute function library.set_updated_at();

---------------------------------------------------------------------------
-- Budget read
---------------------------------------------------------------------------

-- This UTC month's household and project-wide spend; 0 when there is no row.
-- The only client path to cover_usage_total.
create or replace function library.cover_budget(p_household uuid)
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

  return query
  select v_month,
         coalesce((select u.spent_micro from library.cover_usage u
                    where u.household_id = p_household and u.month = v_month), 0)::bigint,
         library.cover_budget_micro(),
         library.cover_reserve_micro(),
         coalesce((select t.spent_micro from library.cover_usage_total t
                    where t.month = v_month), 0)::bigint,
         library.cover_global_budget_micro();
end;
$$;

---------------------------------------------------------------------------
-- Marks
---------------------------------------------------------------------------

-- Marks (or re-marks) a book; last write wins. A note that is new (no mark
-- before) or distinct from the previous one dismisses the book's active
-- nothing_found or failed search, so the next batch tries it again.
create or replace function library.mark_for_cover(p_book uuid, p_reasons text[], p_note text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_household uuid;
  v_note      text := nullif(btrim(p_note), '');
  v_old_note  text;
  v_had_mark  boolean;
begin
  select b.household_id into v_household from library.books b where b.id = p_book;
  if v_household is null or not library.is_member(v_household) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  select true, m.note into v_had_mark, v_old_note
    from library.cover_marks m where m.book_id = p_book for update;
  v_had_mark := coalesce(v_had_mark, false);

  insert into library.cover_marks as m (book_id, household_id, reasons, note, marked_by, marked_at)
  values (p_book, v_household,
          array(select distinct r from unnest(coalesce(p_reasons, '{}'::text[])) r order by 1),
          v_note, auth.uid(), now())
  on conflict (book_id) do update
    set reasons   = excluded.reasons,
        note      = excluded.note,
        marked_by = excluded.marked_by,
        marked_at = excluded.marked_at;

  if v_note is not null and (not v_had_mark or v_old_note is distinct from v_note) then
    update library.cover_searches s
       set status = 'dismissed'
     where s.book_id = p_book
       and s.status in ('nothing_found', 'failed');
  end if;
end;
$$;

create or replace function library.unmark_for_cover(p_book uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_household uuid;
begin
  select b.household_id into v_household from library.books b where b.id = p_book;
  if v_household is null or not library.is_member(v_household) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  delete from library.cover_marks m where m.book_id = p_book;
  return found;
end;
$$;

---------------------------------------------------------------------------
-- Requests and gathering
---------------------------------------------------------------------------

-- One outcome per distinct id: queued | already_open | nothing_found | not_found.
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
    select b.cover_url into v_cover
      from library.books b
     where b.id = v_id and b.household_id = p_household;
    if not found then
      return query select v_id, 'not_found'::text;
      continue;
    end if;

    select s.* into v_active
      from library.cover_searches s
     where s.book_id = v_id
       and s.status in ('queued', 'gathered', 'processing', 'ready', 'nothing_found', 'failed')
     for update;
    if found then
      if v_active.status not in ('nothing_found', 'failed') then
        return query select v_id, 'already_open'::text;
        continue;
      end if;
      if not coalesce(p_manual, false) then
        return query select v_id, 'nothing_found'::text;
        continue;
      end if;
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

-- Saves the gathered candidates of a queued search: gathered, or
-- nothing_found when there are none. Anything but a queued search is skipped.
-- Each candidate is {url, source, width, height, language, editionTitle} and
-- nothing else; anything malformed raises 22023.
create or replace function library.record_cover_candidates(p_search uuid, p_candidates jsonb)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_search library.cover_searches%rowtype;
  v_c      jsonb;
begin
  select s.* into v_search from library.cover_searches s where s.id = p_search for update;
  if not found or not library.is_member(v_search.household_id) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  if v_search.status <> 'queued' then
    return 'skipped';
  end if;

  if p_candidates is null or jsonb_typeof(p_candidates) <> 'array'
     or jsonb_array_length(p_candidates) > 6 then
    raise exception 'invalid_candidates' using errcode = '22023';
  end if;

  -- Checked one step at a time, so no cast runs on a value of the wrong type.
  for v_c in select e.value from jsonb_array_elements(p_candidates) e loop
    if jsonb_typeof(v_c) <> 'object' then
      raise exception 'invalid_candidates' using errcode = '22023';
    end if;
    if exists (select 1 from jsonb_object_keys(v_c) k
                where k not in ('url', 'source', 'width', 'height', 'language', 'editionTitle')) then
      raise exception 'invalid_candidates' using errcode = '22023';
    end if;
    if coalesce(jsonb_typeof(v_c -> 'url'), '') <> 'string'
       or coalesce(jsonb_typeof(v_c -> 'source'), '') <> 'string'
       or coalesce(jsonb_typeof(v_c -> 'width'), '') <> 'number'
       or coalesce(jsonb_typeof(v_c -> 'height'), '') <> 'number'
       or coalesce(jsonb_typeof(v_c -> 'language'), 'null') not in ('string', 'null')
       or coalesce(jsonb_typeof(v_c -> 'editionTitle'), 'null') not in ('string', 'null') then
      raise exception 'invalid_candidates' using errcode = '22023';
    end if;
    if char_length(v_c ->> 'url') > 1000
       or not (starts_with(v_c ->> 'url', 'https://covers.openlibrary.org/')
               or starts_with(v_c ->> 'url', 'https://books.google.com/'))
       or (v_c ->> 'source') not in ('openlibrary', 'google')
       or (v_c ->> 'width')::numeric not between 1 and 2147483647
       or (v_c ->> 'height')::numeric not between 1 and 2147483647
       or (v_c ->> 'width')::numeric <> trunc((v_c ->> 'width')::numeric)
       or (v_c ->> 'height')::numeric <> trunc((v_c ->> 'height')::numeric)
       or char_length(coalesce(v_c ->> 'language', '')) > 20
       or char_length(coalesce(v_c ->> 'editionTitle', '')) > 200 then
      raise exception 'invalid_candidates' using errcode = '22023';
    end if;
  end loop;

  if jsonb_array_length(p_candidates) = 0 then
    update library.cover_searches s
       set status = 'nothing_found', candidates = '[]'::jsonb
     where s.id = p_search;
    return 'nothing_found';
  end if;

  update library.cover_searches s
     set status = 'gathered', candidates = p_candidates
   where s.id = p_search;
  return 'gathered';
end;
$$;

---------------------------------------------------------------------------
-- Screening: claim (reserve), then finish or release (charge and refund)
---------------------------------------------------------------------------

-- outcome: claimed | busy | done | retry_later | failed | budget | not_gathered
create or replace function library.claim_cover_search(p_search uuid)
returns table (outcome text, claim_token uuid, attempts int, candidates jsonb, title text,
               authors text[], reasons text[], note text, retry_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_search  library.cover_searches%rowtype;
  v_month   date := date_trunc('month', now() at time zone 'utc')::date;
  v_reserve int := library.cover_reserve_micro();
  v_total   bigint;
  v_house   bigint;
  v_token   uuid;
  v_title   text;
  v_authors text[];
begin
  select s.* into v_search from library.cover_searches s where s.id = p_search for update;
  if not found or not library.is_member(v_search.household_id) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  if v_search.status = 'queued' then
    return query select 'not_gathered'::text, null::uuid, v_search.attempts, null::jsonb, null::text,
                        null::text[], null::text[], null::text, null::timestamptz;
    return;
  end if;

  if v_search.status in ('ready', 'nothing_found', 'failed', 'applied', 'dismissed') then
    return query select 'done'::text, null::uuid, v_search.attempts, null::jsonb, null::text,
                        null::text[], null::text[], null::text, null::timestamptz;
    return;
  end if;

  if v_search.status = 'processing' and v_search.claimed_at > now() - interval '7 minutes' then
    return query select 'busy'::text, null::uuid, v_search.attempts, null::jsonb, null::text,
                        null::text[], null::text[], null::text, null::timestamptz;
    return;
  end if;

  if v_search.status = 'gathered' and v_search.retry_at > now() then
    return query select 'retry_later'::text, null::uuid, v_search.attempts, null::jsonb, null::text,
                        null::text[], null::text[], null::text, v_search.retry_at;
    return;
  end if;

  -- Due: gathered, or processing with an expired lease (whose reservation
  -- stays charged: the call may have been billed).
  if v_search.attempts >= 3 then
    update library.cover_searches s
       set status = 'failed', error_code = 'attempts_exhausted', claim_token = null, retry_at = null
     where s.id = p_search;
    return query select 'failed'::text, null::uuid, v_search.attempts, null::jsonb, null::text,
                        null::text[], null::text[], null::text, null::timestamptz;
    return;
  end if;

  -- Reserve against both ceilings. Locks in a fixed order, the total row
  -- first and then the household's, so concurrent claims can't deadlock.
  insert into library.cover_usage_total (month) values (v_month) on conflict do nothing;
  insert into library.cover_usage (household_id, month) values (v_search.household_id, v_month)
  on conflict do nothing;

  select t.spent_micro into v_total
    from library.cover_usage_total t where t.month = v_month for update;
  select u.spent_micro into v_house
    from library.cover_usage u
   where u.household_id = v_search.household_id and u.month = v_month for update;

  if v_total + v_reserve > library.cover_global_budget_micro()
     or v_house + v_reserve > library.cover_budget_micro() then
    return query select 'budget'::text, null::uuid, v_search.attempts, null::jsonb, null::text,
                        null::text[], null::text[], null::text, null::timestamptz;
    return;
  end if;

  update library.cover_usage_total t
     set spent_micro = t.spent_micro + v_reserve, screens = t.screens + 1
   where t.month = v_month;
  update library.cover_usage u
     set spent_micro = u.spent_micro + v_reserve, screens = u.screens + 1
   where u.household_id = v_search.household_id and u.month = v_month;

  v_token := gen_random_uuid();
  update library.cover_searches s
     set status = 'processing', attempts = s.attempts + 1, claim_token = v_token,
         claimed_at = now(), retry_at = null, reserved_micro = v_reserve,
         reserved_month = v_month, error_code = null
   where s.id = p_search;

  select b.title, b.authors into v_title, v_authors
    from library.books b where b.id = v_search.book_id;

  return query select 'claimed'::text, v_token, v_search.attempts + 1, v_search.candidates, v_title,
                      v_authors, v_search.reasons, v_search.note, null::timestamptz;
end;
$$;

-- Records the ranked results, each one of the search's candidates, and the
-- charge. Returns ready | nothing_found | stale.
create or replace function library.finish_cover_search(p_search uuid, p_claim uuid, p_result_urls text[],
                                                       p_screening jsonb, p_usage jsonb, p_cost_micro int)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_search  library.cover_searches%rowtype;
  v_results jsonb := '[]'::jsonb;
  v_url     text;
  v_c       jsonb;
  v_cost    int;
  v_refund  int;
  v_status  text;
begin
  select s.* into v_search from library.cover_searches s where s.id = p_search for update;
  if not found or not library.is_member(v_search.household_id) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  if v_search.status <> 'processing' or p_claim is null or v_search.claim_token is distinct from p_claim then
    return 'stale';
  end if;

  if coalesce(cardinality(p_result_urls), 0) > 4 then
    raise exception 'invalid_results' using errcode = '22023';
  end if;

  -- Each URL must be a candidate's, at most once; results keep the given order.
  foreach v_url in array coalesce(p_result_urls, '{}'::text[]) loop
    v_c := null;
    select e.value into v_c
      from jsonb_array_elements(coalesce(v_search.candidates, '[]'::jsonb)) e
     where e.value ->> 'url' = v_url
     limit 1;
    if v_c is null or v_results @> jsonb_build_array(v_c) then
      raise exception 'invalid_results' using errcode = '22023';
    end if;
    v_results := v_results || jsonb_build_array(v_c);
  end loop;

  v_cost   := least(greatest(coalesce(p_cost_micro, 0), 0), v_search.reserved_micro);
  v_refund := v_search.reserved_micro - v_cost;
  v_status := case when jsonb_array_length(v_results) = 0 then 'nothing_found' else 'ready' end;

  update library.cover_usage_total t
     set spent_micro = greatest(0, t.spent_micro - v_refund)
   where t.month = v_search.reserved_month;
  update library.cover_usage u
     set spent_micro = greatest(0, u.spent_micro - v_refund)
   where u.household_id = v_search.household_id and u.month = v_search.reserved_month;

  update library.cover_searches s
     set status      = v_status,
         results     = v_results,
         screening   = p_screening,
         usage       = p_usage,
         cost_micro  = s.cost_micro + v_cost,
         claim_token = null
   where s.id = p_search;

  return v_status;
end;
$$;

-- Ends a claim without results. Returns the new status, or stale.
--   misconfigured | billing                                gathered; attempt and screen given back; cost 0
--   null error with p_retry_at, attempts < 3               gathered with retry_at
--   null error with p_retry_at, attempts = 3               failed, screen_unavailable
--   screen_refused | screen_rejected | screen_unreadable   failed with that code
--   anything else                                          22023
create or replace function library.release_cover_search(p_search uuid, p_claim uuid, p_error text,
                                                        p_retry_at timestamptz, p_usage jsonb,
                                                        p_cost_micro int)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_search   library.cover_searches%rowtype;
  v_status   text;
  v_error    text;
  v_retry_at timestamptz;
  v_attempts int;
  v_screens  int := 0;
  v_cost     int;
  v_refund   int;
begin
  select s.* into v_search from library.cover_searches s where s.id = p_search for update;
  if not found or not library.is_member(v_search.household_id) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  if v_search.status <> 'processing' or p_claim is null or v_search.claim_token is distinct from p_claim then
    return 'stale';
  end if;

  v_cost     := least(greatest(coalesce(p_cost_micro, 0), 0), v_search.reserved_micro);
  v_attempts := v_search.attempts;

  if p_error in ('misconfigured', 'billing') then
    v_status   := 'gathered';
    v_attempts := greatest(0, v_search.attempts - 1);
    v_screens  := 1;
    v_cost     := 0;
  elsif p_error is null and p_retry_at is not null then
    if v_search.attempts < 3 then
      v_status   := 'gathered';
      v_retry_at := p_retry_at;
    else
      v_status := 'failed';
      v_error  := 'screen_unavailable';
    end if;
  elsif p_error in ('screen_refused', 'screen_rejected', 'screen_unreadable') then
    v_status := 'failed';
    v_error  := p_error;
  else
    raise exception 'invalid_release' using errcode = '22023';
  end if;

  v_refund := v_search.reserved_micro - v_cost;

  update library.cover_usage_total t
     set spent_micro = greatest(0, t.spent_micro - v_refund),
         screens     = greatest(0, t.screens - v_screens)
   where t.month = v_search.reserved_month;
  update library.cover_usage u
     set spent_micro = greatest(0, u.spent_micro - v_refund),
         screens     = greatest(0, u.screens - v_screens)
   where u.household_id = v_search.household_id and u.month = v_search.reserved_month;

  update library.cover_searches s
     set status      = v_status,
         attempts    = v_attempts,
         retry_at    = v_retry_at,
         error_code  = v_error,
         usage       = p_usage,
         cost_micro  = s.cost_micro + v_cost,
         claim_token = null
   where s.id = p_search;

  return v_status;
end;
$$;

---------------------------------------------------------------------------
-- Review: apply, keep, seen
---------------------------------------------------------------------------

-- The only cover write path. p_expected_cover is the cover the reviewer was
-- shown. Returns applied | cover_changed | not_ready | invalid_choice.
create or replace function library.apply_cover(p_search uuid, p_url text, p_expected_cover text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_search library.cover_searches%rowtype;
  v_book   library.books%rowtype;
begin
  select s.* into v_search from library.cover_searches s where s.id = p_search for update;
  if not found or not library.is_member(v_search.household_id) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  select b.* into v_book from library.books b where b.id = v_search.book_id for update;
  if not found then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  if v_search.status <> 'ready' then
    return 'not_ready';
  end if;

  if p_url is null or not exists (select 1 from jsonb_array_elements(v_search.results) e
                                   where e.value ->> 'url' = p_url) then
    return 'invalid_choice';
  end if;

  if v_book.cover_url is distinct from p_expected_cover then
    return 'cover_changed';
  end if;

  -- A person chose it, so fill-only enrichment never replaces it.
  update library.books b
     set cover_url = p_url,
         user_edited_fields = array(select distinct f
                                      from unnest(b.user_edited_fields || '{coverUrl}'::text[]) f
                                     order by 1)
   where b.id = v_book.id;

  update library.cover_searches s
     set status = 'applied', applied_by = auth.uid(), applied_url = p_url
   where s.id = p_search;

  delete from library.cover_marks m where m.book_id = v_book.id;

  return 'applied';
end;
$$;

-- Keep the current cover: a ready search becomes dismissed and the mark goes.
create or replace function library.dismiss_cover_search(p_search uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_search library.cover_searches%rowtype;
begin
  select s.* into v_search from library.cover_searches s where s.id = p_search for update;
  if not found or not library.is_member(v_search.household_id) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  if v_search.status <> 'ready' then
    return 'not_ready';
  end if;

  update library.cover_searches s set status = 'dismissed' where s.id = p_search;
  delete from library.cover_marks m where m.book_id = v_search.book_id;
  return 'dismissed';
end;
$$;

-- Sets seen_at on unseen nothing_found/failed rows of the caller's
-- households. Other ids are skipped silently. Returns the count.
create or replace function library.mark_cover_results_seen(p_searches uuid[])
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count int;
begin
  if auth.uid() is null then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  update library.cover_searches s
     set seen_at = now()
   where s.id = any (coalesce(p_searches, '{}'::uuid[]))
     and s.status in ('nothing_found', 'failed')
     and s.seen_at is null
     and library.is_member(s.household_id);
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

---------------------------------------------------------------------------
-- Row level security: members read; nothing else. cover_usage_total has no
-- policy at all.
---------------------------------------------------------------------------

alter table library.cover_marks       enable row level security;
alter table library.cover_searches    enable row level security;
alter table library.cover_usage       enable row level security;
alter table library.cover_usage_total enable row level security;

drop policy if exists cover_marks_select_member on library.cover_marks;
create policy cover_marks_select_member on library.cover_marks
  for select to authenticated
  using (library.is_member(household_id));

drop policy if exists cover_searches_select_member on library.cover_searches;
create policy cover_searches_select_member on library.cover_searches
  for select to authenticated
  using (library.is_member(household_id));

drop policy if exists cover_usage_select_member on library.cover_usage;
create policy cover_usage_select_member on library.cover_usage
  for select to authenticated
  using (library.is_member(household_id));

---------------------------------------------------------------------------
-- Grants
---------------------------------------------------------------------------

-- Revoking the table privileges also revokes earlier column grants.
revoke all on library.cover_marks       from public, anon, authenticated;
revoke all on library.cover_searches    from public, anon, authenticated;
revoke all on library.cover_usage       from public, anon, authenticated;
revoke all on library.cover_usage_total from public, anon, authenticated;

grant select on library.cover_marks to authenticated;
grant select on library.cover_usage to authenticated;
-- Every column except claim_token.
grant select (id, household_id, book_id, requested_by, batch_id, reasons, note, cover_at_request,
              status, attempts, claimed_at, retry_at, candidates, results, screening, usage,
              reserved_micro, reserved_month, cost_micro, error_code, seen_at, applied_by,
              applied_url, created_at, updated_at)
  on library.cover_searches to authenticated;

-- See the header of 20261103000000_library-schema.sql: every new function
-- must revoke the default PUBLIC execute.
revoke execute on function library.cover_budget_micro()                                 from public, anon;
revoke execute on function library.cover_global_budget_micro()                          from public, anon;
revoke execute on function library.cover_reserve_micro()                                from public, anon;
revoke execute on function library.cover_budget(uuid)                                   from public, anon;
revoke execute on function library.mark_for_cover(uuid, text[], text)                   from public, anon;
revoke execute on function library.unmark_for_cover(uuid)                               from public, anon;
revoke execute on function library.request_cover_searches(uuid, uuid[], uuid, boolean)  from public, anon;
revoke execute on function library.record_cover_candidates(uuid, jsonb)                 from public, anon;
revoke execute on function library.claim_cover_search(uuid)                             from public, anon;
revoke execute on function library.finish_cover_search(uuid, uuid, text[], jsonb, jsonb, int)
  from public, anon;
revoke execute on function library.release_cover_search(uuid, uuid, text, timestamptz, jsonb, int)
  from public, anon;
revoke execute on function library.apply_cover(uuid, text, text)                        from public, anon;
revoke execute on function library.dismiss_cover_search(uuid)                           from public, anon;
revoke execute on function library.mark_cover_results_seen(uuid[])                      from public, anon;

grant execute on function library.cover_budget_micro()                                  to authenticated;
grant execute on function library.cover_global_budget_micro()                           to authenticated;
grant execute on function library.cover_reserve_micro()                                 to authenticated;
grant execute on function library.cover_budget(uuid)                                    to authenticated;
grant execute on function library.mark_for_cover(uuid, text[], text)                    to authenticated;
grant execute on function library.unmark_for_cover(uuid)                                to authenticated;
grant execute on function library.request_cover_searches(uuid, uuid[], uuid, boolean)   to authenticated;
grant execute on function library.record_cover_candidates(uuid, jsonb)                  to authenticated;
grant execute on function library.claim_cover_search(uuid)                              to authenticated;
grant execute on function library.finish_cover_search(uuid, uuid, text[], jsonb, jsonb, int)
  to authenticated;
grant execute on function library.release_cover_search(uuid, uuid, text, timestamptz, jsonb, int)
  to authenticated;
grant execute on function library.apply_cover(uuid, text, text)                         to authenticated;
grant execute on function library.dismiss_cover_search(uuid)                            to authenticated;
grant execute on function library.mark_cover_results_seen(uuid[])                       to authenticated;

comment on table library.cover_usage is
  'Estimated cover-screening spend per household per UTC month, in micro-dollars. Changed only by the claim, finish and release RPCs; no client write grant.';
comment on table library.cover_usage_total is
  'Project-wide cover-screening spend per UTC month, in micro-dollars. No client grant at all; read through cover_budget().';
comment on column library.cover_searches.reserved_month is
  'The UTC month the current reservation was taken from; finish and release refund to that month.';
comment on column library.cover_searches.cost_micro is
  'Charged cost of this search''s screening calls, each clamped to its reservation.';
