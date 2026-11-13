-- Library tagging pass and Ask (Plan 7, D5-D7, D10): book cards, the tagging
-- queue, per-feature AI usage and budgets, tag suggestions and Ask call
-- records.
--
-- book_cards           one per tagged book: a short summary and a cover
--                      description, written only by finish_tag_job.
-- tag_jobs             the tagging queue. One active (queued or processing)
--                      job per book (tag_jobs_active_uq). Books queue
--                      themselves on insert and on a synopsis or cover change.
-- ai_usage             estimated spend per household, feature and UTC month.
-- ai_usage_total       the same, project-wide. No policy and no client grant:
--                      only the definer functions below read or write it.
-- tag_suggestions      tags the tagger proposes, one row per (household, id)
--                      ever: pending, approved or dismissed.
-- tag_suggestion_books the books behind a suggestion, each with a short why.
-- ask_calls            one row per Ask, holding its reservation. No client
--                      grant.
--
-- Budget: each call reserves before it is made (claim_tag_job reserves
-- tag_reserve_micro(), begin_ask the exact Ask reservation) against both
-- usage rows, the total row first and then the household's, and is answered
-- 'budget' when either would pass its ceiling. finish and release charge the
-- cost clamped to the reservation and refund the rest to the month the
-- reservation came from, never below 0.
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

-- The tagging reservation per call: library-tagger's TAG_RESERVE_MICRO,
-- ceilingMicro(claude-sonnet-5-5) rounded up to 1,000 (Task 2).
create or replace function library.tag_reserve_micro()
returns int
language sql
immutable
set search_path = ''
as $$ select 69000 $$;

-- The largest reservation one Ask may take.
create or replace function library.ask_max_reserve_micro()
returns int
language sql
immutable
set search_path = ''
as $$ select 600000 $$;

-- Project-wide monthly ceilings: tagging $5.00, Ask $2.00.
create or replace function library.ai_global_budget_micro(p_feature text)
returns bigint
language sql
immutable
set search_path = ''
as $$ select case p_feature when 'tagging' then 5000000::bigint when 'ask' then 2000000::bigint end $$;

---------------------------------------------------------------------------
-- Tables
---------------------------------------------------------------------------

create table if not exists library.book_cards (
  book_id           uuid primary key,
  household_id      uuid not null,
  summary           text not null,
  cover_description text,
  model             text not null,
  vocab_version     int not null check (vocab_version >= 1),
  cover_url_seen    text,
  written_at        timestamptz not null default now(),
  foreign key (book_id, household_id) references library.books (id, household_id) on delete cascade,
  constraint book_cards_summary_check check (summary = btrim(summary) and char_length(summary) between 1 and 800),
  constraint book_cards_cover_description_check
    check (cover_description is null or char_length(cover_description) between 1 and 300),
  constraint book_cards_model_check check (char_length(model) between 1 and 100)
);

create index if not exists book_cards_household_id_idx on library.book_cards (household_id);
create index if not exists book_cards_book_household_idx on library.book_cards (book_id, household_id);

create table if not exists library.tag_jobs (
  id             uuid primary key default gen_random_uuid(),
  household_id   uuid not null,
  book_id        uuid not null,
  run_id         uuid,
  kind           text not null default 'full' check (kind in ('full', 'new_tags')),
  reason         text not null check (reason in ('new_book', 'changed', 'manual', 'run', 'new_tags')),
  status         text not null default 'queued' check (status in ('queued', 'processing', 'done', 'failed')),
  attempts       int not null default 0 check (attempts between 0 and 3),
  claim_token    uuid,
  claimed_at     timestamptz,
  retry_at       timestamptz,
  source_hash    text,          -- md5(synopsis | cover_url) at claim; finish requeues when it changed
  cover_at_claim text,          -- the cover_url at claim, stored on the card as cover_url_seen
  vocab_version  int,           -- the household's vocabulary version at claim
  reserved_micro int not null default 0 check (reserved_micro >= 0),
  reserved_month date,          -- the UTC month the reservation was taken from; refunds go there
  cost_micro     int not null default 0 check (cost_micro >= 0),
  usage          jsonb,
  error_code     text check (error_code in ('tag_refused', 'tag_rejected', 'tag_unreadable',
                                            'tag_unavailable', 'attempts_exhausted')),
  requested_by   uuid default auth.uid() references auth.users (id) on delete set null,
  -- clock_timestamp, so "the book's newest job" is well defined within a transaction.
  created_at     timestamptz not null default clock_timestamp(),
  updated_at     timestamptz not null default now(),
  foreign key (book_id, household_id) references library.books (id, household_id) on delete cascade
);

-- One active job per book (D5, Review Focus 4).
create unique index if not exists tag_jobs_active_uq
  on library.tag_jobs (book_id) where status in ('queued', 'processing');
create index if not exists tag_jobs_household_status_idx on library.tag_jobs (household_id, status);
create index if not exists tag_jobs_book_household_idx on library.tag_jobs (book_id, household_id, created_at);
create index if not exists tag_jobs_run_id_idx on library.tag_jobs (run_id) where run_id is not null;
create index if not exists tag_jobs_requested_by_idx on library.tag_jobs (requested_by) where requested_by is not null;

drop trigger if exists tag_jobs_set_updated_at on library.tag_jobs;
create trigger tag_jobs_set_updated_at
  before update on library.tag_jobs
  for each row execute function library.set_updated_at();

create table if not exists library.ai_usage (
  household_id uuid references library.households (id) on delete cascade,
  feature      text check (feature in ('tagging', 'ask')),
  month        date check (month = date_trunc('month', month)::date),
  spent_micro  bigint not null default 0 check (spent_micro >= 0),
  calls        int not null default 0 check (calls >= 0),
  primary key (household_id, feature, month)
);

create table if not exists library.ai_usage_total (
  feature     text check (feature in ('tagging', 'ask')),
  month       date check (month = date_trunc('month', month)::date),
  spent_micro bigint not null default 0 check (spent_micro >= 0),
  calls       int not null default 0 check (calls >= 0),
  primary key (feature, month)
);

create table if not exists library.tag_suggestions (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references library.households (id) on delete cascade,
  tag_id       text not null,
  label        text not null,
  category     text not null,
  status       text not null default 'pending' check (status in ('pending', 'approved', 'dismissed')),
  created_at   timestamptz not null default now(),
  decided_by   uuid references auth.users (id) on delete set null,
  decided_at   timestamptz,
  constraint tag_suggestions_household_tag_key unique (household_id, tag_id),
  constraint tag_suggestions_tag_id_format
    check (tag_id ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(tag_id) <= 40),
  constraint tag_suggestions_label_check check (label = btrim(label) and char_length(label) between 1 and 60),
  constraint tag_suggestions_category_check
    check (category in ('trope', 'creature', 'setting', 'era', 'theme', 'mood', 'plot', 'protagonist',
                        'audience', 'subgenre', 'cover-colour', 'cover-motif', 'fact'))
);

create index if not exists tag_suggestions_household_status_idx on library.tag_suggestions (household_id, status);
create index if not exists tag_suggestions_decided_by_idx
  on library.tag_suggestions (decided_by) where decided_by is not null;

create table if not exists library.tag_suggestion_books (
  suggestion_id uuid not null references library.tag_suggestions (id) on delete cascade,
  book_id       uuid not null,
  household_id  uuid not null,
  why           text not null check (char_length(why) between 1 and 200),
  primary key (suggestion_id, book_id),
  foreign key (book_id, household_id) references library.books (id, household_id) on delete cascade
);

create index if not exists tag_suggestion_books_book_household_idx
  on library.tag_suggestion_books (book_id, household_id);
create index if not exists tag_suggestion_books_household_id_idx on library.tag_suggestion_books (household_id);

create table if not exists library.ask_calls (
  id             uuid primary key default gen_random_uuid(),
  household_id   uuid not null references library.households (id) on delete cascade,
  requested_by   uuid default auth.uid() references auth.users (id) on delete set null,
  status         text not null default 'reserved' check (status in ('reserved', 'done', 'released')),
  reserved_micro int not null default 0 check (reserved_micro >= 0),
  reserved_month date,
  cost_micro     int not null default 0 check (cost_micro >= 0),
  usage          jsonb,
  book_count     int not null default 0 check (book_count >= 0),
  result_count   int check (result_count >= 0),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index if not exists ask_calls_household_id_idx on library.ask_calls (household_id);
create index if not exists ask_calls_requested_by_idx on library.ask_calls (requested_by) where requested_by is not null;

drop trigger if exists ask_calls_set_updated_at on library.ask_calls;
create trigger ask_calls_set_updated_at
  before update on library.ask_calls
  for each row execute function library.set_updated_at();

---------------------------------------------------------------------------
-- Budgets
---------------------------------------------------------------------------

-- A household's monthly budget for a feature. Ask: $2.00. Tagging: $5.00 in
-- the household's first tagging month (the earliest month with a counted
-- tagging call, or p_month when there is none), else $2.00. Security invoker:
-- a client reads only its own households' rows.
create or replace function library.ai_budget_micro(p_household uuid, p_feature text, p_month date)
returns bigint
language sql
stable
set search_path = ''
as $$
  select case
           when p_feature = 'ask' then 2000000::bigint
           when p_feature = 'tagging' then
             case when p_month <= coalesce((select min(u.month) from library.ai_usage u
                                             where u.household_id = p_household and u.feature = 'tagging'
                                               and u.calls > 0), p_month)
                  then 5000000::bigint else 2000000::bigint end
         end
$$;

-- This UTC month's spend and budgets for a feature. The only client path to
-- ai_usage_total. reserve_micro is the tagging reservation, or 0 for Ask
-- (whose reservation is per call; begin_ask answers 'budget').
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
         case when p_feature = 'tagging' then library.tag_reserve_micro() else 0 end,
         coalesce((select t.spent_micro from library.ai_usage_total t
                    where t.feature = p_feature and t.month = v_month), 0)::bigint,
         library.ai_global_budget_micro(p_feature);
end;
$$;

-- Internal. Reserves p_micro on this month's total and household rows and
-- counts a call. Returns the month, or null (nothing changed) when either row
-- would pass its budget. Locks the total row first, then the household's, as
-- claim_cover_search does, so concurrent reservations can't deadlock.
create or replace function library._ai_reserve(p_household uuid, p_feature text, p_micro int)
returns date
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_month date := date_trunc('month', now() at time zone 'utc')::date;
  v_total bigint;
  v_house bigint;
begin
  if p_feature is null or p_feature not in ('tagging', 'ask') or p_micro is null or p_micro < 0 then
    raise exception 'invalid_reservation' using errcode = '22023';
  end if;

  insert into library.ai_usage_total (feature, month) values (p_feature, v_month) on conflict do nothing;
  insert into library.ai_usage (household_id, feature, month) values (p_household, p_feature, v_month)
  on conflict do nothing;

  select t.spent_micro into v_total
    from library.ai_usage_total t where t.feature = p_feature and t.month = v_month for update;
  select u.spent_micro into v_house
    from library.ai_usage u
   where u.household_id = p_household and u.feature = p_feature and u.month = v_month for update;

  if v_total + p_micro > library.ai_global_budget_micro(p_feature)
     or v_house + p_micro > library.ai_budget_micro(p_household, p_feature, v_month) then
    return null;
  end if;

  update library.ai_usage_total t
     set spent_micro = t.spent_micro + p_micro, calls = t.calls + 1
   where t.feature = p_feature and t.month = v_month;
  update library.ai_usage u
     set spent_micro = u.spent_micro + p_micro, calls = u.calls + 1
   where u.household_id = p_household and u.feature = p_feature and u.month = v_month;
  return v_month;
end;
$$;

-- Internal. Charges the cost clamped to [0, p_reserved] and refunds the rest
-- to the reserved month's rows, never below 0; p_uncount also gives the call
-- back. Returns the charged cost.
create or replace function library._ai_settle(p_household uuid, p_feature text, p_month date,
                                              p_reserved int, p_cost int, p_uncount boolean)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reserved int := greatest(coalesce(p_reserved, 0), 0);
  v_cost     int := least(greatest(coalesce(p_cost, 0), 0), greatest(coalesce(p_reserved, 0), 0));
  v_refund   int;
  v_calls    int := case when coalesce(p_uncount, false) then 1 else 0 end;
begin
  v_refund := v_reserved - v_cost;
  update library.ai_usage_total t
     set spent_micro = greatest(0, t.spent_micro - v_refund),
         calls       = greatest(0, t.calls - v_calls)
   where t.feature = p_feature and t.month = p_month;
  update library.ai_usage u
     set spent_micro = greatest(0, u.spent_micro - v_refund),
         calls       = greatest(0, u.calls - v_calls)
   where u.household_id = p_household and u.feature = p_feature and u.month = p_month;
  return v_cost;
end;
$$;

-- Internal. library.vocab_version without the member check, for the definer
-- functions below (which check membership themselves).
create or replace function library._vocab_version(p_household uuid)
returns int
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select max(t.added_version) from library.library_tags t
                    where t.household_id is null or t.household_id = p_household), 1)
$$;

---------------------------------------------------------------------------
-- The queue: books queue themselves (D5)
---------------------------------------------------------------------------

-- After insert: a full new_book job. After a synopsis or cover change: an
-- active queued job is upgraded to full; a processing one is left alone
-- (finish_tag_job requeues it from the source hash); otherwise a full
-- changed job.
--
-- The active job is locked first. When finish_tag_job holds it (a job being
-- finished), this update waits for that finish to commit and then sees the
-- job done, so it queues the changed job itself instead of relying on
-- finish's source-hash check, which can't see this uncommitted change. No
-- deadlock: finish takes only FOR KEY SHARE on the book (its foreign-key
-- checks), which doesn't conflict with this update's FOR NO KEY UPDATE.
create or replace function library.enqueue_tagging()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' then
    perform 1 from library.tag_jobs j
      where j.book_id = new.id and j.status in ('queued', 'processing')
      for update;
    update library.tag_jobs j set kind = 'full'
     where j.book_id = new.id and j.status = 'queued' and j.kind <> 'full';
    if exists (select 1 from library.tag_jobs j
                where j.book_id = new.id and j.status in ('queued', 'processing')) then
      return null;
    end if;
  end if;

  insert into library.tag_jobs (household_id, book_id, kind, reason, requested_by)
  values (new.household_id, new.id, 'full', case when tg_op = 'INSERT' then 'new_book' else 'changed' end, auth.uid())
  on conflict (book_id) where status in ('queued', 'processing') do nothing;
  return null;
end;
$$;

drop trigger if exists books_enqueue_tagging_ins on library.books;
create trigger books_enqueue_tagging_ins
  after insert on library.books
  for each row execute function library.enqueue_tagging();

drop trigger if exists books_enqueue_tagging_upd on library.books;
create trigger books_enqueue_tagging_upd
  after update of synopsis, cover_url on library.books
  for each row
  when (old.synopsis is distinct from new.synopsis or old.cover_url is distinct from new.cover_url)
  execute function library.enqueue_tagging();

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
--             isn't failed (Check for new tags).
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
  v_newest  text;
  v_rows    int;
begin
  if p_household is null or not library.is_member(p_household) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  if p_reason is null or p_reason not in ('run', 'manual', 'new_tags') then
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
      v_card := (select c.vocab_version from library.book_cards c where c.book_id = v_id);
      if v_newest = 'failed'
         or (p_reason = 'run' and (v_card is not null or not library.on_shelf(v_book)))
         or (p_reason = 'new_tags' and (v_card is null or v_card >= v_version)) then
        return query select v_id, 'skipped'::text;
        continue;
      end if;
    end if;

    insert into library.tag_jobs (household_id, book_id, run_id, kind, reason, requested_by)
    values (p_household, v_id, p_run, case when p_reason = 'new_tags' then 'new_tags' else 'full' end,
            p_reason, auth.uid())
    on conflict (book_id) where status in ('queued', 'processing') do nothing;
    get diagnostics v_rows = row_count;

    return query select v_id, case when v_rows > 0 then 'queued' else 'already_open' end;
  end loop;
end;
$$;

---------------------------------------------------------------------------
-- Tagging: claim (reserve), then finish or release (charge and refund)
---------------------------------------------------------------------------

-- outcome: claimed | busy | done | retry_later | failed | budget. A claim
-- holds a 7-minute lease. book: title, authors, seriesName, seriesVolume,
-- description, coverUrl. card: summary, coverDescription, vocabVersion, or
-- null. vocab: the active vocabulary as [{id, category}], only the tags added
-- since the card's version for a new_tags job. removed: {tos, library} ids
-- removed by hand. tos_tags: the book's current ToS tags.
create or replace function library.claim_tag_job(p_job uuid)
returns table (outcome text, claim_token uuid, attempts int, kind text, book jsonb, card jsonb, vocab jsonb,
               vocab_version int, removed jsonb, tos_tags text[])
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
  v_reserve int := library.tag_reserve_micro();
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
                        null::jsonb, null::int, null::jsonb, null::text[];
    return;
  end if;

  if v_job.status = 'processing' and v_job.claimed_at > now() - interval '7 minutes' then
    return query select 'busy'::text, null::uuid, v_job.attempts, v_job.kind, null::jsonb, null::jsonb,
                        null::jsonb, null::int, null::jsonb, null::text[];
    return;
  end if;

  if v_job.status = 'queued' and v_job.retry_at > now() then
    return query select 'retry_later'::text, null::uuid, v_job.attempts, v_job.kind, null::jsonb, null::jsonb,
                        null::jsonb, null::int, null::jsonb, null::text[];
    return;
  end if;

  -- Due: queued, or processing with an expired lease (whose reservation stays
  -- charged: the call may have been billed).
  if v_job.attempts >= 3 then
    update library.tag_jobs j
       set status = 'failed', error_code = 'attempts_exhausted', claim_token = null, retry_at = null
     where j.id = p_job;
    return query select 'failed'::text, null::uuid, v_job.attempts, v_job.kind, null::jsonb, null::jsonb,
                        null::jsonb, null::int, null::jsonb, null::text[];
    return;
  end if;

  v_month := library._ai_reserve(v_job.household_id, 'tagging', v_reserve);
  if v_month is null then
    return query select 'budget'::text, null::uuid, v_job.attempts, v_job.kind, null::jsonb, null::jsonb,
                        null::jsonb, null::int, null::jsonb, null::text[];
    return;
  end if;

  select b.* into v_book from library.books b where b.id = v_job.book_id;
  select c.* into v_card from library.book_cards c where c.book_id = v_job.book_id;
  v_version := library._vocab_version(v_job.household_id);
  -- A new_tags job for a book that has lost its card is tagged in full.
  v_kind := case when v_job.kind = 'new_tags' and v_card.book_id is not null then 'new_tags' else 'full' end;
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
         coalesce((select jsonb_agg(jsonb_build_object('id', t.id, 'category', t.category)
                                    order by t.category, t.id)
                     from library.library_tags t
                    where t.active and t.added_version > v_since
                      and (t.household_id is null or t.household_id = v_job.household_id)), '[]'::jsonb),
         v_version,
         jsonb_build_object(
           'tos', coalesce((select jsonb_agg(r.tag_id order by r.tag_id) from library.tag_removals r
                             where r.book_id = v_job.book_id and r.kind = 'tos'), '[]'::jsonb),
           'library', coalesce((select jsonb_agg(r.tag_id order by r.tag_id) from library.tag_removals r
                                 where r.book_id = v_job.book_id and r.kind = 'library'), '[]'::jsonb)),
         array(select bt.tag_id from library.book_tags bt where bt.book_id = v_job.book_id order by bt.tag_id);
end;
$$;

-- Records a tagging result and the charge. Returns done | stale.
-- p_result: { tos, library, summary, coverDescription, coverSeen, suggestions }.
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
--                 most 3 per book.
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
  v_job      library.tag_jobs%rowtype;
  v_since    int := 0;
  v_full     boolean;
  v_seen     boolean;
  v_lib      text[];
  v_summary  text;
  v_cover    text;
  v_s        jsonb;
  v_id       text;
  v_label    text;
  v_category text;
  v_why      text;
  v_sid      uuid;
  v_sstatus  text;
  v_suggested int := 0;
  v_charged  int;
begin
  select j.* into v_job from library.tag_jobs j where j.id = p_job for update;
  if not found or not library.is_member(v_job.household_id) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

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

  v_charged := library._ai_settle(v_job.household_id, 'tagging', v_job.reserved_month, v_job.reserved_micro,
                                  p_cost_micro, false);

  update library.tag_jobs j
     set status = 'done', cost_micro = j.cost_micro + v_charged, usage = p_usage,
         claim_token = null, retry_at = null, error_code = null
   where j.id = p_job;

  -- The synopsis or cover changed mid-job: tag it again (Review Focus 3).
  -- Read now, after the writes, so a change committed while this ran is seen.
  -- A change still uncommitted is waiting on this job's lock in
  -- enqueue_tagging and queues its own job once this commits.
  if (select md5(coalesce(b.synopsis, '') || '|' || coalesce(b.cover_url, ''))
        from library.books b where b.id = v_job.book_id) is distinct from v_job.source_hash then
    insert into library.tag_jobs (household_id, book_id, kind, reason, requested_by)
    values (v_job.household_id, v_job.book_id, 'full', 'changed', auth.uid())
    on conflict (book_id) where status in ('queued', 'processing') do nothing;
  end if;

  return 'done';
end;
$$;

-- Ends a claim without a result. Returns the new status, or stale.
--   misconfigured | billing                             queued; attempt and call given back; cost 0
--   tos_tags_unavailable with p_retry_at                queued with retry_at; attempt and call given
--                                                       back; cost 0 (no Claude call was made)
--   null error with p_retry_at, attempts < 3            queued with retry_at
--   null error with p_retry_at, attempts = 3            failed, tag_unavailable
--   tag_refused | tag_rejected | tag_unreadable         failed with that code
--   anything else                                       22023
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

  v_charged := library._ai_settle(v_job.household_id, 'tagging', v_job.reserved_month, v_job.reserved_micro,
                                  v_cost, v_uncount);

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
-- Suggestions
---------------------------------------------------------------------------

-- Adds the suggested tag to the household's vocabulary (version + 1, unless
-- it is already there) with the given label and category, and applies it as
-- the tagger's to every book behind the suggestion that hasn't had it removed
-- by hand. Returns the number of books tagged; 0 when it isn't pending.
create or replace function library.approve_tag_suggestion(p_suggestion uuid, p_label text, p_category text)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_s        library.tag_suggestions%rowtype;
  v_label    text;
  v_category text;
  v_n        int;
begin
  select s.* into v_s from library.tag_suggestions s where s.id = p_suggestion for update;
  if not found or not library.is_member(v_s.household_id) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  v_label    := coalesce(nullif(btrim(p_label), ''), v_s.label);
  v_category := coalesce(p_category, v_s.category);
  if char_length(v_label) > 60 then
    raise exception 'invalid_label' using errcode = '22023';
  end if;
  if v_category not in ('trope', 'creature', 'setting', 'era', 'theme', 'mood', 'plot', 'protagonist',
                        'audience', 'subgenre', 'cover-colour', 'cover-motif', 'fact') then
    raise exception 'invalid_category' using errcode = '22023';
  end if;

  if v_s.status <> 'pending' then
    return 0;
  end if;

  if not exists (select 1 from library.library_tags t
                  where t.id = v_s.tag_id and (t.household_id is null or t.household_id = v_s.household_id)) then
    perform library.add_library_tag(v_s.household_id, v_s.tag_id, v_label, v_category);
  end if;

  insert into library.book_library_tags (book_id, household_id, tag_id, added_by)
  select sb.book_id, sb.household_id, v_s.tag_id, 'tagger'
    from library.tag_suggestion_books sb
   where sb.suggestion_id = v_s.id
     and exists (select 1 from library.library_tags t
                  where t.id = v_s.tag_id and t.active
                    and (t.household_id is null or t.household_id = v_s.household_id))
     and not exists (select 1 from library.tag_removals r
                      where r.book_id = sb.book_id and r.kind = 'library' and r.tag_id = v_s.tag_id)
  on conflict do nothing;
  get diagnostics v_n = row_count;

  update library.tag_suggestions s
     set status = 'approved', label = v_label, category = v_category,
         decided_by = auth.uid(), decided_at = now()
   where s.id = v_s.id;
  return v_n;
end;
$$;

create or replace function library.dismiss_tag_suggestion(p_suggestion uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_s library.tag_suggestions%rowtype;
begin
  select s.* into v_s from library.tag_suggestions s where s.id = p_suggestion for update;
  if not found or not library.is_member(v_s.household_id) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  if v_s.status <> 'pending' then
    return 'not_pending';
  end if;
  update library.tag_suggestions s
     set status = 'dismissed', decided_by = auth.uid(), decided_at = now()
   where s.id = v_s.id;
  return 'dismissed';
end;
$$;

---------------------------------------------------------------------------
-- Ask
---------------------------------------------------------------------------

-- Reserves p_reserve_micro for one Ask. outcome: reserved | budget.
create or replace function library.begin_ask(p_household uuid, p_reserve_micro int, p_book_count int)
returns table (outcome text, call_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_month date;
  v_id    uuid;
begin
  if p_household is null or not library.is_member(p_household) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  if p_reserve_micro is null or p_reserve_micro < 1 or p_reserve_micro > library.ask_max_reserve_micro()
     or p_book_count is null or p_book_count not between 0 and 2000 then
    raise exception 'invalid_reservation' using errcode = '22023';
  end if;

  v_month := library._ai_reserve(p_household, 'ask', p_reserve_micro);
  if v_month is null then
    return query select 'budget'::text, null::uuid;
    return;
  end if;

  insert into library.ask_calls (household_id, requested_by, status, reserved_micro, reserved_month, book_count)
  values (p_household, auth.uid(), 'reserved', p_reserve_micro, v_month, p_book_count)
  returning id into v_id;
  return query select 'reserved'::text, v_id;
end;
$$;

-- Charges the clamped cost and records the result. Returns done | stale.
create or replace function library.finish_ask(p_call uuid, p_cost_micro int, p_usage jsonb, p_result_count int)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_call    library.ask_calls%rowtype;
  v_charged int;
begin
  select a.* into v_call from library.ask_calls a where a.id = p_call for update;
  if not found or not library.is_member(v_call.household_id) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  if v_call.status <> 'reserved' then
    return 'stale';
  end if;

  v_charged := library._ai_settle(v_call.household_id, 'ask', v_call.reserved_month, v_call.reserved_micro,
                                  p_cost_micro, false);
  update library.ask_calls a
     set status = 'done', cost_micro = v_charged, usage = p_usage,
         result_count = greatest(coalesce(p_result_count, 0), 0)
   where a.id = p_call;
  return 'done';
end;
$$;

-- Ends an Ask without a result, charging the clamped cost; at 0 the call is
-- given back too. Returns released | stale.
create or replace function library.release_ask(p_call uuid, p_cost_micro int, p_usage jsonb)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_call    library.ask_calls%rowtype;
  v_charged int;
begin
  select a.* into v_call from library.ask_calls a where a.id = p_call for update;
  if not found or not library.is_member(v_call.household_id) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  if v_call.status <> 'reserved' then
    return 'stale';
  end if;

  v_charged := library._ai_settle(v_call.household_id, 'ask', v_call.reserved_month, v_call.reserved_micro,
                                  p_cost_micro, coalesce(p_cost_micro, 0) <= 0);
  update library.ask_calls a
     set status = 'released', cost_micro = v_charged, usage = p_usage
   where a.id = p_call;
  return 'released';
end;
$$;

-- The household's books among p_book_ids, in the order given; any other id
-- is dropped silently. trimmed_description (600 characters) only for a book
-- with no card.
create or replace function library.ask_context(p_household uuid, p_book_ids uuid[])
returns table (book_id uuid, title text, authors text[], series_name text, series_volume numeric,
               page_count int, publish_date text, summary text, cover_description text,
               trimmed_description text, tos_tags text[], library_tags text[])
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
begin
  if p_household is null or not library.is_member(p_household) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  if coalesce(cardinality(p_book_ids), 0) > 2000 then
    raise exception 'too_many_books' using errcode = '22023';
  end if;

  return query
  select b.id, b.title, b.authors, b.series_name, b.series_volume::numeric, b.page_count, b.publish_date,
         c.summary, c.cover_description,
         case when c.book_id is null then left(b.synopsis, 600) end,
         array(select t.tag_id from library.book_tags t where t.book_id = b.id order by t.tag_id),
         array(select t.tag_id from library.book_library_tags t where t.book_id = b.id order by t.tag_id)
    from (select x.id, min(x.ord) as ord
            from unnest(coalesce(p_book_ids, '{}'::uuid[])) with ordinality as x (id, ord)
           group by x.id) ids
    join library.books b on b.id = ids.id and b.household_id = p_household
    left join library.book_cards c on c.book_id = b.id
   order by ids.ord;
end;
$$;

-- Full descriptions (2,000 characters) for at most 5 of the household's books.
create or replace function library.ask_descriptions(p_household uuid, p_book_ids uuid[])
returns table (book_id uuid, description text)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
begin
  if p_household is null or not library.is_member(p_household) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  if coalesce(cardinality(p_book_ids), 0) > 5 then
    raise exception 'too_many_books' using errcode = '22023';
  end if;

  return query
  select b.id, left(b.synopsis, 2000)
    from library.books b
   where b.id = any (coalesce(p_book_ids, '{}'::uuid[])) and b.household_id = p_household;
end;
$$;

---------------------------------------------------------------------------
-- Row level security: members read; nothing else. ai_usage_total and
-- ask_calls have no policy at all.
---------------------------------------------------------------------------

alter table library.book_cards           enable row level security;
alter table library.tag_jobs             enable row level security;
alter table library.ai_usage             enable row level security;
alter table library.ai_usage_total       enable row level security;
alter table library.tag_suggestions      enable row level security;
alter table library.tag_suggestion_books enable row level security;
alter table library.ask_calls            enable row level security;

drop policy if exists book_cards_select_member on library.book_cards;
create policy book_cards_select_member on library.book_cards
  for select to authenticated using (library.is_member(household_id));

drop policy if exists tag_jobs_select_member on library.tag_jobs;
create policy tag_jobs_select_member on library.tag_jobs
  for select to authenticated using (library.is_member(household_id));

drop policy if exists ai_usage_select_member on library.ai_usage;
create policy ai_usage_select_member on library.ai_usage
  for select to authenticated using (library.is_member(household_id));

drop policy if exists tag_suggestions_select_member on library.tag_suggestions;
create policy tag_suggestions_select_member on library.tag_suggestions
  for select to authenticated using (library.is_member(household_id));

drop policy if exists tag_suggestion_books_select_member on library.tag_suggestion_books;
create policy tag_suggestion_books_select_member on library.tag_suggestion_books
  for select to authenticated using (library.is_member(household_id));

---------------------------------------------------------------------------
-- Grants
---------------------------------------------------------------------------

-- Revoking the table privileges also revokes earlier column grants.
revoke all on library.book_cards           from public, anon, authenticated;
revoke all on library.tag_jobs             from public, anon, authenticated;
revoke all on library.ai_usage             from public, anon, authenticated;
revoke all on library.ai_usage_total       from public, anon, authenticated;
revoke all on library.tag_suggestions      from public, anon, authenticated;
revoke all on library.tag_suggestion_books from public, anon, authenticated;
revoke all on library.ask_calls            from public, anon, authenticated;

grant select on library.book_cards           to authenticated;
grant select on library.ai_usage             to authenticated;
grant select on library.tag_suggestions      to authenticated;
grant select on library.tag_suggestion_books to authenticated;
-- Every column except claim_token.
grant select (id, household_id, book_id, run_id, kind, reason, status, attempts, claimed_at, retry_at,
              source_hash, cover_at_claim, vocab_version, reserved_micro, reserved_month, cost_micro, usage,
              error_code, requested_by, created_at, updated_at)
  on library.tag_jobs to authenticated;

-- See the header of 20261103000000_library-schema.sql: every new function
-- must revoke the default PUBLIC execute. Internal ones get no client grant.
revoke execute on function library.tag_reserve_micro()                                from public, anon;
revoke execute on function library.ask_max_reserve_micro()                            from public, anon;
revoke execute on function library.ai_global_budget_micro(text)                       from public, anon;
revoke execute on function library.ai_budget_micro(uuid, text, date)                  from public, anon;
revoke execute on function library.ai_budget(uuid, text)                              from public, anon;
revoke execute on function library._ai_reserve(uuid, text, int)                       from public, anon, authenticated;
revoke execute on function library._ai_settle(uuid, text, date, int, int, boolean)    from public, anon, authenticated;
revoke execute on function library._vocab_version(uuid)                               from public, anon, authenticated;
revoke execute on function library.enqueue_tagging()                                  from public, anon, authenticated;
revoke execute on function library.request_tagging(uuid, uuid[], text, uuid)          from public, anon;
revoke execute on function library.claim_tag_job(uuid)                                from public, anon;
revoke execute on function library.finish_tag_job(uuid, uuid, jsonb, jsonb, int, text) from public, anon;
revoke execute on function library.release_tag_job(uuid, uuid, text, timestamptz, jsonb, int)
  from public, anon;
revoke execute on function library.approve_tag_suggestion(uuid, text, text)           from public, anon;
revoke execute on function library.dismiss_tag_suggestion(uuid)                       from public, anon;
revoke execute on function library.begin_ask(uuid, int, int)                          from public, anon;
revoke execute on function library.finish_ask(uuid, int, jsonb, int)                  from public, anon;
revoke execute on function library.release_ask(uuid, int, jsonb)                      from public, anon;
revoke execute on function library.ask_context(uuid, uuid[])                          from public, anon;
revoke execute on function library.ask_descriptions(uuid, uuid[])                     from public, anon;

grant execute on function library.tag_reserve_micro()                                 to authenticated;
grant execute on function library.ask_max_reserve_micro()                             to authenticated;
grant execute on function library.ai_global_budget_micro(text)                        to authenticated;
grant execute on function library.ai_budget_micro(uuid, text, date)                   to authenticated;
grant execute on function library.ai_budget(uuid, text)                               to authenticated;
grant execute on function library.request_tagging(uuid, uuid[], text, uuid)           to authenticated;
grant execute on function library.claim_tag_job(uuid)                                 to authenticated;
grant execute on function library.finish_tag_job(uuid, uuid, jsonb, jsonb, int, text) to authenticated;
grant execute on function library.release_tag_job(uuid, uuid, text, timestamptz, jsonb, int) to authenticated;
grant execute on function library.approve_tag_suggestion(uuid, text, text)            to authenticated;
grant execute on function library.dismiss_tag_suggestion(uuid)                        to authenticated;
grant execute on function library.begin_ask(uuid, int, int)                           to authenticated;
grant execute on function library.finish_ask(uuid, int, jsonb, int)                   to authenticated;
grant execute on function library.release_ask(uuid, int, jsonb)                       to authenticated;
grant execute on function library.ask_context(uuid, uuid[])                           to authenticated;
grant execute on function library.ask_descriptions(uuid, uuid[])                      to authenticated;

comment on table library.ai_usage is
  'Estimated AI spend per household, feature and UTC month, in micro-dollars. Changed only by the reserve and settle helpers; no client write grant.';
comment on table library.ai_usage_total is
  'Project-wide AI spend per feature and UTC month, in micro-dollars. No client grant at all; read through ai_budget().';
comment on column library.tag_jobs.reserved_month is
  'The UTC month the current reservation was taken from; finish and release refund to that month.';
comment on column library.tag_jobs.cost_micro is
  'Charged cost of this job''s tagging calls, each clamped to its reservation.';
