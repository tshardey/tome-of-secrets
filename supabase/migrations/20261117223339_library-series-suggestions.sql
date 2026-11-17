-- Library series suggestions (Plan 10 D2-D9): the tagger names a book's
-- series, a series the household already has is filled in, a new name waits
-- as a suggestion, and a one-off backfill checks books already tagged.
--
-- series_suggestions       series names the tagger proposed, one row per
--                          (household, lower(btrim(name))) ever: pending,
--                          approved (approved_as is where it led) or dismissed.
-- series_suggestion_books  the books behind a suggestion, each with the
--                          proposed volume and a short why.
-- book_cards.series_checked_at  set whenever a finish carries a series key,
--                          null or not, so the backfill never bills a book
--                          twice (D3).
-- tag_jobs kind 'series'   a text-only series check (reason 'series'),
--                          reserving series_reserve_micro() from the tagging
--                          budget (D5).
--
-- The apply rules (D7, design 4.2), all in library._apply_series, called only
-- from finish_tag_job:
--   1. A result that isn't an object, or whose name cleans to null (trimmed;
--      empty, over 200 characters, or none / n/a / na / null / standalone /
--      stand-alone / no series / unknown in any case), is ignored. A volume
--      outside 0 <= round(v, 2) < 10000 becomes null; the series is kept.
--   2. A book whose series is set, or whose user_edited_fields holds
--      seriesName or seriesVolume, is kept as it is. A series cleared by hand
--      carries the mark, so it is never refilled.
--   3. A name matching a household series case-insensitively is applied under
--      the household's most-used spelling (_series_spelling), with no change
--      to user_edited_fields.
--   4. Otherwise the suggestion for the name decides: dismissed, nothing;
--      approved, its approved_as is applied as in 3; pending or none, the book
--      joins it (the latest check's volume and why win).
-- A series write starts no tag job: books_enqueue_tagging_upd fires only on
-- synopsis and cover_url.
--
-- Lock order (D8): finish_tag_job locks the book (FOR NO KEY UPDATE) before
-- the job. A client update of a book takes the book's row lock before
-- enqueue_tagging locks the job, so both paths lock book, then job, and a
-- series write in finish can't deadlock with a hand edit. Whichever commits
-- second wins: a hand edit after a finish overwrites it; a finish after a hand
-- edit sees the mark and keeps it. This replaces the note in
-- 20261114001500_library-tagging.sql that finish takes only FOR KEY SHARE on
-- the book: an update racing a finish now waits on the book lock instead of
-- the job lock, and still sees the job done once the finish commits.
-- approve_series_suggestion also locks the suggestion's books before the
-- suggestion, the order finish uses (book, then suggestion FOR SHARE).
--
-- No direct client writes: select only, and every write goes through a
-- security definer RPC with an empty search_path and an explicit
-- library.is_member check. Internal _ functions have no client grant.
--
-- Idempotent: safe to re-run.

---------------------------------------------------------------------------
-- Constants
---------------------------------------------------------------------------

-- The series-check reservation per call: library-tagger's
-- SERIES_RESERVE_MICRO, seriesCeilingMicro() rounded up to 1,000 (D5).
create or replace function library.series_reserve_micro()
returns int
language sql
immutable
set search_path = ''
as $$ select 27000 $$;

-- The tagging reservation per call now also covers the series rules and the
-- household series block at its cap (D5). library-tagger's TAG_RESERVE_MICRO
-- (was 71000).
create or replace function library.tag_reserve_micro()
returns int
language sql
immutable
set search_path = ''
as $$ select 82000 $$;

---------------------------------------------------------------------------
-- Tables
---------------------------------------------------------------------------

create table if not exists library.series_suggestions (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references library.households (id) on delete cascade,
  name_key     text not null,
  name         text not null,
  status       text not null default 'pending' check (status in ('pending', 'approved', 'dismissed')),
  approved_as  text,
  created_at   timestamptz not null default now(),
  decided_by   uuid references auth.users (id) on delete set null,
  decided_at   timestamptz,
  constraint series_suggestions_household_key unique (household_id, name_key),
  constraint series_suggestions_name_check check (name = btrim(name) and char_length(name) between 1 and 200),
  constraint series_suggestions_name_key_check check (name_key = lower(name)),
  constraint series_suggestions_approved_as_check
    check ((status = 'approved') = (approved_as is not null)
           and (approved_as is null
                or (approved_as = btrim(approved_as) and char_length(approved_as) between 1 and 200)))
);

create index if not exists series_suggestions_household_status_idx
  on library.series_suggestions (household_id, status);
create index if not exists series_suggestions_decided_by_idx
  on library.series_suggestions (decided_by) where decided_by is not null;

create table if not exists library.series_suggestion_books (
  suggestion_id uuid not null references library.series_suggestions (id) on delete cascade,
  book_id       uuid not null,
  household_id  uuid not null,
  volume        numeric(6,2) check (volume is null or (volume >= 0 and volume < 10000)),
  why           text check (why is null or char_length(why) between 1 and 200),
  primary key (suggestion_id, book_id),
  foreign key (book_id, household_id) references library.books (id, household_id) on delete cascade
);

create index if not exists series_suggestion_books_book_household_idx
  on library.series_suggestion_books (book_id, household_id);
create index if not exists series_suggestion_books_household_id_idx
  on library.series_suggestion_books (household_id);

alter table library.book_cards add column if not exists series_checked_at timestamptz;

-- The case-insensitive series lookups (_series_spelling, _household_series_names).
create index if not exists books_household_series_key_idx
  on library.books (household_id, lower(series_name)) where series_name is not null;

-- The series kind and reason.
alter table library.tag_jobs drop constraint if exists tag_jobs_kind_check;
alter table library.tag_jobs add constraint tag_jobs_kind_check check (kind in ('full', 'new_tags', 'series'));
alter table library.tag_jobs drop constraint if exists tag_jobs_reason_check;
alter table library.tag_jobs add constraint tag_jobs_reason_check
  check (reason in ('new_book', 'changed', 'manual', 'run', 'new_tags', 'series'));

---------------------------------------------------------------------------
-- Internal helpers (no client grant)
---------------------------------------------------------------------------

-- The most-used spelling of a series among the household's books whose
-- lower(series_name) is p_key; ties go to the lowest name. Null when none.
create or replace function library._series_spelling(p_household uuid, p_key text)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select b.series_name
    from library.books b
   where b.household_id = p_household and b.series_name is not null and lower(b.series_name) = p_key
   group by b.series_name
   order by count(*) desc, b.series_name
   limit 1
$$;

-- D4: the household's series as a JSON array of names, at most 300. One name
-- per case-insensitive group (its most-used spelling, as _series_spelling),
-- ordered by the group's book count, descending, then by name. The handler
-- applies the 12,000-character cut.
create or replace function library._household_series_names(p_household uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with spellings as (
    select b.series_name as name, lower(b.series_name) as k, count(*) as n
      from library.books b
     where b.household_id = p_household and b.series_name is not null
     group by b.series_name
  ), groups as (
    select distinct on (s.k) s.name, sum(s.n) over (partition by s.k) as total
      from spellings s
     order by s.k, s.n desc, s.name
  ), capped as (
    select g.name, g.total from groups g order by g.total desc, g.name limit 300
  )
  select coalesce(jsonb_agg(to_jsonb(c.name) order by c.total desc, c.name), '[]'::jsonb) from capped c
$$;

-- D7: applies one series result to a book. The caller has locked the book
-- (finish_tag_job). Returns ignored | kept | applied | suggested | dismissed.
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

  select b.* into v_book from library.books b where b.id = p_book and b.household_id = p_household;
  if not found then
    return 'ignored';
  end if;
  if v_book.series_name is not null or v_book.user_edited_fields && '{seriesName,seriesVolume}'::text[] then
    return 'kept';
  end if;

  v_key    := lower(v_name);
  v_target := library._series_spelling(p_household, v_key);

  if v_target is null then
    insert into library.series_suggestions (household_id, name_key, name)
    values (p_household, v_key, v_name)
    on conflict (household_id, name_key) do nothing;
    -- FOR SHARE: an approve or dismiss in flight finishes first, and none can
    -- start until this commits, so a book linked here is one the approve sees.
    select s.id, s.status, s.approved_as into v_sid, v_status, v_as
      from library.series_suggestions s
     where s.household_id = p_household and s.name_key = v_key
       for share;

    if v_status = 'dismissed' then
      return 'dismissed';
    elsif v_status = 'approved' then
      v_target := coalesce(library._series_spelling(p_household, lower(v_as)), v_as);
    else
      insert into library.series_suggestion_books (suggestion_id, book_id, household_id, volume, why)
      values (v_sid, p_book, p_household, v_volume, v_why)
      on conflict (suggestion_id, book_id) do update set volume = excluded.volume, why = excluded.why;
      return 'suggested';
    end if;
  end if;

  update library.books b set series_name = v_target, series_volume = v_volume where b.id = p_book;
  return 'applied';
end;
$$;

---------------------------------------------------------------------------
-- Requests
---------------------------------------------------------------------------

-- One outcome per distinct id: queued | already_open | skipped | not_found.
--   run       a full job for a book on the shelf with no card, no active job
--             and whose newest job isn't failed (Tag all books);
--   manual    a full job for any of the household's books without an active
--             job (Retag this book), failed or not;
--   new_tags  a new_tags job for a carded book whose card's vocab_version is
--             below the household's, with no active job and whose newest job
--             isn't failed (Check for new tags);
--   series    a series job for a carded book with no series, neither
--             seriesName nor seriesVolume in user_edited_fields, a card not
--             yet checked for a series, no active job and whose newest job
--             isn't failed (Find series, D5). On the shelf or not.
-- A concurrent request for the same book reads already_open.
create or replace function library.request_tagging(p_household uuid, p_book_ids uuid[], p_reason text, p_run uuid)
returns table (book_id uuid, outcome text)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_id      uuid;
  v_book    library.books%rowtype;
  v_version int;
  v_card    int;
  v_checked timestamptz;
  v_newest  text;
  v_rows    int;
begin
  if p_household is null or not library.is_member(p_household) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  if p_reason is null or p_reason not in ('run', 'manual', 'new_tags', 'series') then
    raise exception 'invalid_reason' using errcode = '22023';
  end if;
  if coalesce(cardinality(p_book_ids), 0) > 1000 then
    raise exception 'too_many_books' using errcode = '22023';
  end if;

  v_version := library._vocab_version(p_household);

  for v_id in select distinct x from unnest(coalesce(p_book_ids, '{}'::uuid[])) x where x is not null
              order by x loop
    select b.* into v_book from library.books b where b.id = v_id and b.household_id = p_household;
    if not found then
      return query select v_id, 'not_found'::text;
      continue;
    end if;

    if exists (select 1 from library.tag_jobs j
                where j.book_id = v_id and j.status in ('queued', 'processing')) then
      return query select v_id, 'already_open'::text;
      continue;
    end if;

    if p_reason <> 'manual' then
      v_newest := (select j.status from library.tag_jobs j where j.book_id = v_id
                    order by j.created_at desc limit 1);
      v_card    := null;
      v_checked := null;
      select c.vocab_version, c.series_checked_at into v_card, v_checked
        from library.book_cards c where c.book_id = v_id;
      if v_newest = 'failed'
         or (p_reason = 'run' and (v_card is not null or not library.on_shelf(v_book)))
         or (p_reason = 'new_tags' and (v_card is null or v_card >= v_version))
         or (p_reason = 'series'
             and (v_card is null or v_checked is not null or v_book.series_name is not null
                  or v_book.user_edited_fields && '{seriesName,seriesVolume}'::text[])) then
        return query select v_id, 'skipped'::text;
        continue;
      end if;
    end if;

    insert into library.tag_jobs (household_id, book_id, run_id, kind, reason, requested_by)
    values (p_household, v_id, p_run,
            case p_reason when 'new_tags' then 'new_tags' when 'series' then 'series' else 'full' end,
            p_reason, auth.uid())
    on conflict (book_id) where status in ('queued', 'processing') do nothing;
    get diagnostics v_rows = row_count;

    return query select v_id, case when v_rows > 0 then 'queued' else 'already_open' end;
  end loop;
end;
$$;

---------------------------------------------------------------------------
-- Claim: the series kind, its reserve and the household series names
---------------------------------------------------------------------------

-- outcome: claimed | busy | done | retry_later | failed | budget. A claim
-- holds a 7-minute lease. book: title, authors, seriesName, seriesVolume,
-- description, coverUrl. card: summary, coverDescription, vocabVersion, or
-- null. vocab: the active vocabulary as [{id, category}], only the tags added
-- since the card's version for a new_tags job, [] for a series job. removed:
-- {tos, library} ids removed by hand. tos_tags: the book's current ToS tags.
-- series_names: the household's series (_household_series_names) for full
-- and series claims, [] for new_tags.
--
-- A series job reserves series_reserve_micro(), every other kind
-- tag_reserve_micro(). A series or new_tags job for a book without a card is
-- claimed as full. A series job whose book no longer qualifies (a series set,
-- hand-set or already checked since it was queued) is marked done at cost 0
-- with nothing reserved, and answers done.
drop function if exists library.claim_tag_job(uuid);
create function library.claim_tag_job(p_job uuid)
returns table (outcome text, claim_token uuid, attempts int, kind text, book jsonb, card jsonb, vocab jsonb,
               vocab_version int, removed jsonb, tos_tags text[], series_names jsonb)
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
begin
  select j.* into v_job from library.tag_jobs j where j.id = p_job for update;
  if not found or not library.is_member(v_job.household_id) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  if v_job.status in ('done', 'failed') then
    return query select v_job.status, null::uuid, v_job.attempts, v_job.kind, null::jsonb, null::jsonb,
                        null::jsonb, null::int, null::jsonb, null::text[], null::jsonb;
    return;
  end if;

  if v_job.status = 'processing' and v_job.claimed_at > now() - interval '7 minutes' then
    return query select 'busy'::text, null::uuid, v_job.attempts, v_job.kind, null::jsonb, null::jsonb,
                        null::jsonb, null::int, null::jsonb, null::text[], null::jsonb;
    return;
  end if;

  if v_job.status = 'queued' and v_job.retry_at > now() then
    return query select 'retry_later'::text, null::uuid, v_job.attempts, v_job.kind, null::jsonb, null::jsonb,
                        null::jsonb, null::int, null::jsonb, null::text[], null::jsonb;
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
                        null::jsonb, null::int, null::jsonb, null::text[], null::jsonb;
    return;
  end if;

  -- Due: queued, or processing with an expired lease (whose reservation stays
  -- charged: the call may have been billed).
  if v_job.attempts >= 3 then
    update library.tag_jobs j
       set status = 'failed', error_code = 'attempts_exhausted', claim_token = null, retry_at = null
     where j.id = p_job;
    return query select 'failed'::text, null::uuid, v_job.attempts, v_job.kind, null::jsonb, null::jsonb,
                        null::jsonb, null::int, null::jsonb, null::text[], null::jsonb;
    return;
  end if;

  v_reserve := case when v_kind = 'series' then library.series_reserve_micro() else library.tag_reserve_micro() end;
  v_month := library._ai_reserve(v_job.household_id, 'tagging', v_reserve);
  if v_month is null then
    return query select 'budget'::text, null::uuid, v_job.attempts, v_job.kind, null::jsonb, null::jsonb,
                        null::jsonb, null::int, null::jsonb, null::text[], null::jsonb;
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

  return query
  select 'claimed'::text, v_token, v_job.attempts + 1, v_kind,
         jsonb_build_object('title', v_book.title, 'authors', to_jsonb(v_book.authors),
                            'seriesName', v_book.series_name, 'seriesVolume', v_book.series_volume,
                            'description', v_book.synopsis, 'coverUrl', v_book.cover_url),
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
              else library._household_series_names(v_job.household_id) end;
end;
$$;

---------------------------------------------------------------------------
-- Finish: book lock first, the series branch, the full job's series
---------------------------------------------------------------------------

-- Records a tagging result and the charge. Returns done | stale.
-- p_result: { tos, library, summary, coverDescription, coverSeen, suggestions, series }.
--   tos           format-valid ids, never audio or a recorded removal;
--   library       active vocabulary ids, never a recorded removal; cover tags
--                 only when the cover was seen; for a new_tags job only tags
--                 added since the card's version;
--   coverSeen     on a full job, the tagger's own cover tags not in the new
--                 set are replaced (hand-added ones stay, no removal is
--                 recorded) and the cover description is rewritten; without
--                 it every cover tag and the old description stay;
--   suggestions   [{id, label, category, why}]: an id in the vocabulary is
--                 applied as a tag; a pending suggestion gains the book; a
--                 decided one gains nothing; a malformed one is dropped; at
--                 most 3 per book;
--   series        {name, volume, why} or null, on full and series jobs: when
--                 the key is present it goes through _apply_series (see the
--                 header) and the card's series_checked_at is set. Without the
--                 key (an older tagger) neither happens.
-- A series job writes no tags, card text or tag suggestions, and may have a
-- blank summary.
--
-- Lock order: the book (FOR NO KEY UPDATE), then the job (FOR UPDATE), the
-- same order as a client update of the book followed by enqueue_tagging, so
-- the two can't deadlock. Whichever commits second wins: a hand edit after
-- this finish overwrites its series; this finish after a hand edit sees the
-- mark and keeps the hand value.
--
-- Every write is on conflict do nothing. When the book's synopsis or cover
-- changed since the claim, a fresh full job is queued after finishing.
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

  if v_job.kind = 'series' then
    -- A series check: the series and the checked mark only.
    if p_result ? 'series' then
      perform library._apply_series(v_job.household_id, v_job.book_id, p_result -> 'series');
      update library.book_cards c set series_checked_at = now() where c.book_id = v_job.book_id;
    end if;
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

      -- The series (D8): every full job checks it again.
      if p_result ? 'series' then
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

  v_charged := library._ai_settle(v_job.household_id, 'tagging', v_job.reserved_month, v_job.reserved_micro,
                                  p_cost_micro, false);

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

  return 'done';
end;
$$;

---------------------------------------------------------------------------
-- Approve and dismiss (D9)
---------------------------------------------------------------------------

-- Fills the series in on every book behind the suggestion that is still
-- blank and not hand-set, and records where the suggestion led. Returns the
-- number of books filled; 0 when it isn't pending.
--   p_name     trimmed, 1..200 characters, else 22023. When it matches a
--              household series case-insensitively, the household's spelling
--              is used (how a near-duplicate is folded in).
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

  v_target := coalesce(library._series_spelling(v_s.household_id, lower(v_name)), v_name);

  update library.books b
     set series_name   = v_target,
         series_volume = case when p_volumes ? b.id::text then round((p_volumes ->> b.id::text)::numeric, 2)
                              else sb.volume end
    from library.series_suggestion_books sb
   where sb.suggestion_id = v_s.id and b.id = sb.book_id and b.household_id = sb.household_id
     and b.series_name is null
     and not (b.user_edited_fields && '{seriesName,seriesVolume}'::text[]);
  get diagnostics v_n = row_count;

  update library.series_suggestions s
     set status = 'approved', approved_as = v_target, decided_by = auth.uid(), decided_at = now()
   where s.id = v_s.id;
  return v_n;
end;
$$;

-- Marks the name dismissed for the household: it is never suggested again.
-- Returns dismissed | not_pending.
create or replace function library.dismiss_series_suggestion(p_suggestion uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_s library.series_suggestions%rowtype;
begin
  select s.* into v_s from library.series_suggestions s where s.id = p_suggestion for update;
  if not found or not library.is_member(v_s.household_id) then
    raise exception 'not_authorized' using errcode = '42501';
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
-- Row level security: members read; nothing else.
---------------------------------------------------------------------------

alter table library.series_suggestions      enable row level security;
alter table library.series_suggestion_books enable row level security;

drop policy if exists series_suggestions_select_member on library.series_suggestions;
create policy series_suggestions_select_member on library.series_suggestions
  for select to authenticated using (library.is_member(household_id));

drop policy if exists series_suggestion_books_select_member on library.series_suggestion_books;
create policy series_suggestion_books_select_member on library.series_suggestion_books
  for select to authenticated using (library.is_member(household_id));

---------------------------------------------------------------------------
-- Grants
---------------------------------------------------------------------------

revoke all on library.series_suggestions      from public, anon, authenticated;
revoke all on library.series_suggestion_books from public, anon, authenticated;
grant select on library.series_suggestions      to authenticated;
grant select on library.series_suggestion_books to authenticated;

-- See the header of 20261103000000_library-schema.sql: every new function
-- must revoke the default PUBLIC execute. Internal ones get no client grant.
revoke execute on function library.series_reserve_micro()                            from public, anon;
revoke execute on function library.tag_reserve_micro()                               from public, anon;
revoke execute on function library._series_spelling(uuid, text)                      from public, anon, authenticated;
revoke execute on function library._household_series_names(uuid)                     from public, anon, authenticated;
revoke execute on function library._apply_series(uuid, uuid, jsonb)                  from public, anon, authenticated;
revoke execute on function library.request_tagging(uuid, uuid[], text, uuid)         from public, anon;
revoke execute on function library.claim_tag_job(uuid)                               from public, anon;
revoke execute on function library.finish_tag_job(uuid, uuid, jsonb, jsonb, int, text) from public, anon;
revoke execute on function library.approve_series_suggestion(uuid, text, jsonb)      from public, anon;
revoke execute on function library.dismiss_series_suggestion(uuid)                   from public, anon;

grant execute on function library.series_reserve_micro()                             to authenticated;
grant execute on function library.tag_reserve_micro()                                to authenticated;
grant execute on function library.request_tagging(uuid, uuid[], text, uuid)          to authenticated;
grant execute on function library.claim_tag_job(uuid)                                to authenticated;
grant execute on function library.finish_tag_job(uuid, uuid, jsonb, jsonb, int, text) to authenticated;
grant execute on function library.approve_series_suggestion(uuid, text, jsonb)       to authenticated;
grant execute on function library.dismiss_series_suggestion(uuid)                    to authenticated;

comment on column library.book_cards.series_checked_at is
  'When a tagging result last carried a series (null or not). The series backfill skips a book once this is set.';
comment on table library.series_suggestions is
  'Series names the tagger proposed, one row per household and lower(name) ever. approved_as is the series it was approved as.';
