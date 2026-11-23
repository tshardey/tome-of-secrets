-- Library series audit (Plan 12, 2026-11-23).
--
-- Audit series checks a series the tagger filled in or Tierra approved. It
-- never changes a book: a doubtful series becomes a flag that waits for a
-- member's decision. Part 1 (this section): the job kind, the marker, the
-- trigger, the flags table, requests and claims. Part 2 (below, Task 2):
-- the finish, the decisions and undo.
--
-- D1  Order: this migration and library-tagger ship first; only the new
--     library app requests audits, and it merges last. Until then nothing
--     queues an audit job. An old handler that meets one anyway gets outcome
--     'audit' from claim_tag_job, which changes nothing (Review Focus 5).
-- D2  book_cards.series_audited_at: set by an audit finish, cleared by the
--     trigger books_series_audit_reset whenever a book's series name or
--     number changes, which also retires the book's pending flags as 'stale'.
--     Every writer of a series clears it with no code of its own.
-- D3  library.series_audit_flags: one row per flag (wrong_series or
--     wrong_number), at most one pending per book. Members read their
--     household's flags; every write goes through definer functions.
-- D4  tag_jobs kind and reason 'audit', and tag_jobs.audit_seen (the series
--     at claim). request_tagging 'audit' queues a carded book with a series,
--     neither seriesName nor seriesVolume hand-set, not yet audited, with no
--     active job and whose newest job isn't failed unless it is a failed
--     audit (the retry). claim_audit_job claims it; claim_tag_job answers
--     'audit' for it. _same_author_books gains handSet. Full jobs never audit.
-- D7  _series_loose_key: the audit's spelling guard only.
--
-- Re-runnable: create or replace, if [not] exists, drop ... if exists.

---------------------------------------------------------------------------
-- The marker and the job columns (D2, D4)
---------------------------------------------------------------------------

alter table library.book_cards add column if not exists series_audited_at timestamptz;
alter table library.tag_jobs   add column if not exists audit_seen jsonb;

alter table library.tag_jobs drop constraint if exists tag_jobs_kind_check;
alter table library.tag_jobs add constraint tag_jobs_kind_check
  check (kind in ('full', 'new_tags', 'series', 'audit'));
alter table library.tag_jobs drop constraint if exists tag_jobs_reason_check;
alter table library.tag_jobs add constraint tag_jobs_reason_check
  check (reason in ('new_book', 'changed', 'manual', 'run', 'new_tags', 'series', 'unsure', 'audit'));

---------------------------------------------------------------------------
-- The loose key (D7)
---------------------------------------------------------------------------

-- Internal, no client grant. Folds case, accents (NFKD), punctuation and
-- spaces, and a whole leading word "the": 'The Thornmere Cycle',
-- 'Thornmere-Cycle' and 'THORNMERE CYCLE.' all read 'thornmerecycle'. Used
-- only by the audit's spelling guard; series matching elsewhere stays on
-- lower() (_series_spelling).
create or replace function library._series_loose_key(p_name text)
returns text
language sql
immutable
set search_path = ''
as $$
  select regexp_replace(regexp_replace(lower(normalize(coalesce(p_name, ''), NFKD)), '^\s*the\s+', ''),
                        '[^[:alnum:]]', '', 'g')
$$;

---------------------------------------------------------------------------
-- The flags table (D3)
---------------------------------------------------------------------------

create table if not exists library.series_audit_flags (
  id              uuid primary key default gen_random_uuid(),
  household_id    uuid not null references library.households (id) on delete cascade,
  book_id         uuid not null,
  job_id          uuid references library.tag_jobs (id) on delete set null,
  kind            text not null check (kind in ('wrong_series', 'wrong_number')),
  current_name    text not null check (char_length(current_name) between 1 and 200),
  current_volume  numeric(6,2) check (current_volume is null or (current_volume >= 0 and current_volume < 10000)),
  proposed_name   text check (proposed_name is null or (proposed_name = btrim(proposed_name) and char_length(proposed_name) between 1 and 200)),
  proposed_volume numeric(6,2) check (proposed_volume is null or (proposed_volume >= 0 and proposed_volume < 10000)),
  why             text check (why is null or char_length(why) between 1 and 200),
  status          text not null default 'pending' check (status in ('pending', 'applied', 'kept', 'edited', 'stale')),
  created_at      timestamptz not null default now(),
  decided_by      uuid references auth.users (id) on delete set null,
  decided_at      timestamptz,
  foreign key (book_id, household_id) references library.books (id, household_id) on delete cascade,
  constraint series_audit_flags_number_check
    check (kind <> 'wrong_number' or (proposed_name is null and proposed_volume is not null))
);

create unique index if not exists series_audit_flags_one_pending
  on library.series_audit_flags (book_id) where status = 'pending';
create index if not exists series_audit_flags_household_status_idx
  on library.series_audit_flags (household_id, status);
-- The foreign keys' own indexes (book_id is led by the pending index only).
create index if not exists series_audit_flags_book_household_idx
  on library.series_audit_flags (book_id, household_id);
create index if not exists series_audit_flags_job_idx
  on library.series_audit_flags (job_id) where job_id is not null;
create index if not exists series_audit_flags_decided_by_idx
  on library.series_audit_flags (decided_by) where decided_by is not null;

alter table library.series_audit_flags enable row level security;

drop policy if exists series_audit_flags_select_member on library.series_audit_flags;
create policy series_audit_flags_select_member on library.series_audit_flags
  for select to authenticated using (library.is_member(household_id));

revoke all on library.series_audit_flags from public, anon, authenticated;
grant select on library.series_audit_flags to authenticated;

---------------------------------------------------------------------------
-- The trigger (D2)
---------------------------------------------------------------------------

-- Internal, no client grant. After a book's series name or number changes:
-- the card's audit marker is cleared and every pending flag of the book is
-- retired as stale. It writes book_cards and series_audit_flags only, never
-- books, so it can't fire itself.
create or replace function library._series_audit_reset()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update library.book_cards c
     set series_audited_at = null
   where c.book_id = new.id and c.series_audited_at is not null;
  update library.series_audit_flags f
     set status = 'stale', decided_at = now()
   where f.book_id = new.id and f.status = 'pending';
  return null;
end;
$$;

drop trigger if exists books_series_audit_reset on library.books;
create trigger books_series_audit_reset
  after update of series_name, series_volume on library.books
  for each row
  when (old.series_name is distinct from new.series_name or old.series_volume is distinct from new.series_volume)
  execute function library._series_audit_reset();

---------------------------------------------------------------------------
-- Same-author books: handSet (D4)
---------------------------------------------------------------------------

-- As 20261119232416_library-series-accuracy.sql, plus handSet: the
-- neighbour's seriesName or seriesVolume is in user_edited_fields.
create or replace function library._same_author_books(p_household uuid, p_book uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object('title', x.title, 'seriesName', x.series_name,
                                               'seriesVolume', x.series_volume, 'handSet', x.hand_set)
                            order by x.created_at desc, x.id), '[]'::jsonb)
    from (select o.id, o.title, o.series_name, o.series_volume, o.created_at,
                 o.user_edited_fields && '{seriesName,seriesVolume}'::text[] as hand_set
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
-- Requests (D4)
---------------------------------------------------------------------------

-- As 20261122174720_library-series-retry.sql, plus:
--   audit     an audit job for a carded book with a series, neither
--             seriesName nor seriesVolume in user_edited_fields, a card not
--             yet audited (series_audited_at null), no active job and whose
--             newest job isn't failed, unless that failed job is itself an
--             audit job (Audit series; a failed audit can be asked again).
--             On the shelf or not.
-- One outcome per distinct id: queued | already_open | skipped | not_found.
create or replace function library.request_tagging(p_household uuid, p_book_ids uuid[], p_reason text, p_run uuid)
returns table (book_id uuid, outcome text)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_id          uuid;
  v_book        library.books%rowtype;
  v_version     int;
  v_card        int;
  v_checked     timestamptz;
  v_audited     timestamptz;
  v_newest      text;
  v_newest_kind text;
  v_rows        int;
begin
  if p_household is null or not library.is_member(p_household) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  if p_reason is null or p_reason not in ('run', 'manual', 'new_tags', 'series', 'audit') then
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
      -- select into sets both to null when the book has no job.
      select j.status, j.kind into v_newest, v_newest_kind
        from library.tag_jobs j where j.book_id = v_id
       order by j.created_at desc limit 1;
      v_card    := null;
      v_checked := null;
      v_audited := null;
      select c.vocab_version, c.series_checked_at, c.series_audited_at into v_card, v_checked, v_audited
        from library.book_cards c where c.book_id = v_id;
      if (v_newest = 'failed' and not (p_reason in ('series', 'audit') and v_newest_kind = p_reason))
         or (p_reason = 'run' and (v_card is not null or not library.on_shelf(v_book)))
         or (p_reason = 'new_tags' and (v_card is null or v_card >= v_version))
         or (p_reason = 'series'
             and (v_card is null or v_checked is not null or v_book.series_name is not null
                  or v_book.user_edited_fields && '{seriesName,seriesVolume}'::text[]))
         or (p_reason = 'audit'
             and (v_card is null or v_audited is not null or v_book.series_name is null
                  or v_book.user_edited_fields && '{seriesName,seriesVolume}'::text[])) then
        return query select v_id, 'skipped'::text;
        continue;
      end if;
    end if;

    insert into library.tag_jobs (household_id, book_id, run_id, kind, reason, requested_by)
    values (p_household, v_id, p_run,
            case p_reason when 'new_tags' then 'new_tags' when 'series' then 'series'
                          when 'audit' then 'audit' else 'full' end,
            p_reason, auth.uid())
    on conflict (book_id) where status in ('queued', 'processing') do nothing;
    get diagnostics v_rows = row_count;

    return query select v_id, case when v_rows > 0 then 'queued' else 'already_open' end;
  end loop;
end;
$$;

---------------------------------------------------------------------------
-- The old claim: outcome 'audit' (D4, Review Focus 5)
---------------------------------------------------------------------------

-- As 20261119232416_library-series-accuracy.sql, plus: after the done/failed,
-- busy and retry_later checks, an audit job answers outcome 'audit' with
-- every other column null and changes nothing (no reservation, no attempt).
-- An older handler maps an unknown kind to full, so it must never claim an
-- audit job here; the new handler calls claim_audit_job on this outcome.
create or replace function library.claim_tag_job(p_job uuid)
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

  -- D4: an audit job is claimed only by claim_audit_job.
  if v_job.kind = 'audit' then
    return query select 'audit'::text, null::uuid, null::int, null::text, null::jsonb, null::jsonb,
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
-- The audit claim (D4)
---------------------------------------------------------------------------

-- Claims an audit job. Outcomes:
--   not_authorized (42501)  the job is missing or the caller isn't a member;
--   not_audit               the job isn't an audit job; nothing changes;
--   done | failed           already finished (status as stored);
--   busy | retry_later      as claim_tag_job;
--   done                    re-checked before reserving: the book has no card
--                           or no series, is hand-set, or is already audited;
--                           the job is done at cost 0 with nothing reserved;
--   failed                  attempts exhausted, as claim_tag_job;
--   budget                  series_reserve_micro() can't be reserved;
--   claimed                 processing, with audit_seen = the series now, and
--                           book (as claim_tag_job's, with isbns), card,
--                           series_names and same_author (with handSet).
-- The job's source_hash, cover_at_claim and vocab_version are set as
-- claim_tag_job sets them, so the finish's mid-job checks read the same.
create or replace function library.claim_audit_job(p_job uuid)
returns table (outcome text, claim_token uuid, attempts int, book jsonb, card jsonb, series_names jsonb,
               same_author jsonb)
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
  v_reserve int := library.series_reserve_micro();
  v_token   uuid;
  v_isbns   jsonb;
begin
  select j.* into v_job from library.tag_jobs j where j.id = p_job for update;
  if not found or not library.is_member(v_job.household_id) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  if v_job.kind <> 'audit' then
    return query select 'not_audit'::text, null::uuid, v_job.attempts, null::jsonb, null::jsonb, null::jsonb,
                        null::jsonb;
    return;
  end if;

  if v_job.status in ('done', 'failed') then
    return query select v_job.status, null::uuid, v_job.attempts, null::jsonb, null::jsonb, null::jsonb,
                        null::jsonb;
    return;
  end if;

  if v_job.status = 'processing' and v_job.claimed_at > now() - interval '7 minutes' then
    return query select 'busy'::text, null::uuid, v_job.attempts, null::jsonb, null::jsonb, null::jsonb,
                        null::jsonb;
    return;
  end if;

  if v_job.status = 'queued' and v_job.retry_at > now() then
    return query select 'retry_later'::text, null::uuid, v_job.attempts, null::jsonb, null::jsonb, null::jsonb,
                        null::jsonb;
    return;
  end if;

  select b.* into v_book from library.books b where b.id = v_job.book_id;
  select c.* into v_card from library.book_cards c where c.book_id = v_job.book_id;

  -- Re-checked before anything is reserved.
  if v_card.book_id is null or v_book.series_name is null or v_card.series_audited_at is not null
     or v_book.user_edited_fields && '{seriesName,seriesVolume}'::text[] then
    update library.tag_jobs j
       set status = 'done', claim_token = null, retry_at = null, error_code = null
     where j.id = p_job;
    return query select 'done'::text, null::uuid, v_job.attempts, null::jsonb, null::jsonb, null::jsonb,
                        null::jsonb;
    return;
  end if;

  -- Due: queued, or processing with an expired lease (whose reservation stays
  -- charged: the call may have been billed).
  if v_job.attempts >= 3 then
    update library.tag_jobs j
       set status = 'failed', error_code = 'attempts_exhausted', claim_token = null, retry_at = null
     where j.id = p_job;
    return query select 'failed'::text, null::uuid, v_job.attempts, null::jsonb, null::jsonb, null::jsonb,
                        null::jsonb;
    return;
  end if;

  v_month := library._ai_reserve(v_job.household_id, 'tagging', v_reserve);
  if v_month is null then
    return query select 'budget'::text, null::uuid, v_job.attempts, null::jsonb, null::jsonb, null::jsonb,
                        null::jsonb;
    return;
  end if;

  v_token := gen_random_uuid();
  update library.tag_jobs j
     set status = 'processing', attempts = j.attempts + 1, claim_token = v_token, claimed_at = now(),
         retry_at = null, reserved_micro = v_reserve, reserved_month = v_month, error_code = null,
         vocab_version = library._vocab_version(v_job.household_id), cover_at_claim = v_book.cover_url,
         source_hash = md5(coalesce(v_book.synopsis, '') || '|' || coalesce(v_book.cover_url, '')),
         audit_seen = jsonb_build_object('name', v_book.series_name, 'volume', v_book.series_volume)
   where j.id = p_job;

  -- The ISBNs for the Open Library lookup, exactly as claim_tag_job.
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
  select 'claimed'::text, v_token, v_job.attempts + 1,
         jsonb_build_object('title', v_book.title, 'authors', to_jsonb(v_book.authors),
                            'seriesName', v_book.series_name, 'seriesVolume', v_book.series_volume,
                            'description', v_book.synopsis, 'coverUrl', v_book.cover_url, 'isbns', v_isbns),
         jsonb_build_object('summary', v_card.summary, 'coverDescription', v_card.cover_description,
                            'vocabVersion', v_card.vocab_version),
         library._household_series_names(v_job.household_id),
         library._same_author_books(v_job.household_id, v_job.book_id);
end;
$$;

---------------------------------------------------------------------------
-- Grants (part 1)
---------------------------------------------------------------------------

-- See the header of 20261103000000_library-schema.sql: every new function
-- must revoke the default PUBLIC execute. Internal ones get no client grant.
-- create or replace keeps grants; they are restated so this file stands alone.
revoke execute on function library._series_loose_key(text)                          from public, anon, authenticated;
revoke execute on function library._series_audit_reset()                            from public, anon, authenticated;
revoke execute on function library._same_author_books(uuid, uuid)                   from public, anon, authenticated;
revoke execute on function library.request_tagging(uuid, uuid[], text, uuid)        from public, anon;
revoke execute on function library.claim_tag_job(uuid)                              from public, anon;
revoke execute on function library.claim_audit_job(uuid)                            from public, anon;

grant execute on function library.request_tagging(uuid, uuid[], text, uuid)         to authenticated;
grant execute on function library.claim_tag_job(uuid)                               to authenticated;
grant execute on function library.claim_audit_job(uuid)                             to authenticated;
