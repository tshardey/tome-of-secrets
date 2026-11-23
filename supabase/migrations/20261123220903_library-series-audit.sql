-- Library series audit (Plan 12, 2026-11-23).
--
-- Audit series checks a series the tagger filled in or Tierra approved. It
-- never changes a book: a doubtful series becomes a flag that waits for a
-- member's decision. Part 1 (this section): the job kind, the marker, the
-- trigger, the flags table, requests and claims. Part 2 (below):
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

---------------------------------------------------------------------------
---------------------------------------------------------------------------
-- Part 2: the finish, the release, the decisions and undo (D7-D9).
--
-- D7  finish_tag_job handles kind 'audit' (the kind, never the reason: a
--     queued audit job a synopsis edit upgraded to full is a full job). It
--     validates p_result.audit, then: a series changed since the claim
--     (audit_seen) writes nothing and sets no marker; a book hand-set since
--     sets the marker only; otherwise at most one flag (agree and unsure
--     none; a number only when it is named and differs; the spelling guard
--     turns a re-spelt wrong_series into nothing or a wrong_number) and the
--     marker. It never writes the book. Audits settle at their true cost
--     (10x guard), and so do their tag_refused / tag_unreadable releases.
-- D8  apply_series_audit, keep_series_audit and edit_series_audit decide a
--     pending flag: book lock, then flag lock; a flag whose book's series no
--     longer matches it becomes stale. The flag's status is set before the
--     book write, so the trigger (pending flags only) leaves it alone; every
--     decision adds seriesName and seriesVolume to user_edited_fields, so
--     the book is never audited or tagged for a series again.
-- D9  undo_series_dismissal (a new row) and undo_series_book_dismissal (one
--     book of an existing row) put a dismissal back to pending. Neither
--     queues a job or spends anything.
---------------------------------------------------------------------------

---------------------------------------------------------------------------
-- The audit result (D7)
---------------------------------------------------------------------------

-- Internal, no client grant. Called by finish_tag_job with the book locked.
-- p_audit is {verdict, name, volume, why}; anything else is invalid_result
-- (22023). Cleans as _apply_series does (trim, at most 200 characters,
-- placeholders -> null; volume round(v, 2) in [0, 10000) else null; why
-- trimmed, clipped to 200, empty -> null). Returns
--   changed       the series differs from p_seen (the series at claim):
--                 nothing written, no marker;
--   hand_set      the series is hand-set now: the marker only;
--   none          no flag, the marker set;
--   wrong_series | wrong_number   that flag written (one pending per book;
--                 a pending one is refreshed) and the marker set.
-- The spelling guard (decision 6): a wrong_series name that is the current
-- series spelled differently (the same lower() name, or the same non-empty
-- _series_loose_key) is agree, unless it names a different number, which is
-- a wrong_number flag. Two names whose keys are both empty (punctuation
-- only) are not the same spelling.
create or replace function library._apply_series_audit(p_household uuid, p_book uuid, p_job uuid, p_seen jsonb,
                                                       p_audit jsonb)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_verdict text;
  v_name    text;
  v_volume  numeric;
  v_why     text;
  v_book    library.books%rowtype;
  v_key     text;
  v_kind    text;
  v_pname   text;
  v_pvolume numeric;
begin
  -- 1. Validate.
  if p_audit is null or jsonb_typeof(p_audit) <> 'object'
     or coalesce(jsonb_typeof(p_audit -> 'verdict'), '') <> 'string'
     or p_audit ->> 'verdict' not in ('agree', 'wrong_series', 'wrong_number', 'unsure')
     or coalesce(jsonb_typeof(p_audit -> 'name'), 'null') not in ('string', 'null')
     or coalesce(jsonb_typeof(p_audit -> 'volume'), 'null') not in ('number', 'null')
     or coalesce(jsonb_typeof(p_audit -> 'why'), 'null') not in ('string', 'null') then
    raise exception 'invalid_result' using errcode = '22023';
  end if;
  v_verdict := p_audit ->> 'verdict';

  -- 2. The series changed mid-job: it is audited afresh later.
  select b.* into v_book from library.books b where b.id = p_book and b.household_id = p_household;
  if not found or p_seen is null
     or v_book.series_name is distinct from (p_seen ->> 'name')
     or v_book.series_volume is distinct from (p_seen ->> 'volume')::numeric then
    return 'changed';
  end if;

  -- 3. Hand-set mid-job: Tierra's series stands.
  if v_book.user_edited_fields && '{seriesName,seriesVolume}'::text[] then
    update library.book_cards c set series_audited_at = now() where c.book_id = p_book;
    return 'hand_set';
  end if;

  -- 4. Clean, then the flag rules.
  if jsonb_typeof(p_audit -> 'name') = 'string' then
    v_name := regexp_replace(p_audit ->> 'name', '^\s+|\s+$', '', 'g');
    if v_name = '' or char_length(v_name) > 200
       or lower(v_name) in ('none', 'n/a', 'na', 'null', 'standalone', 'stand-alone', 'no series', 'unknown') then
      v_name := null;
    end if;
  end if;
  if jsonb_typeof(p_audit -> 'volume') = 'number' then
    v_volume := round((p_audit ->> 'volume')::numeric, 2);
    if v_volume < 0 or v_volume >= 10000 then
      v_volume := null;
    end if;
  end if;
  if jsonb_typeof(p_audit -> 'why') = 'string' then
    v_why := nullif(btrim(left(regexp_replace(p_audit ->> 'why', '^\s+|\s+$', '', 'g'), 200)), '');
  end if;

  if v_verdict = 'wrong_number' then
    if v_volume is not null and v_volume is distinct from v_book.series_volume then
      v_kind    := 'wrong_number';
      v_pvolume := v_volume;
    end if;
  elsif v_verdict = 'wrong_series' then
    v_key := library._series_loose_key(v_name);
    if v_name is not null
       and (lower(v_name) = lower(v_book.series_name)
            or (v_key <> '' and v_key = library._series_loose_key(v_book.series_name))) then
      if v_volume is not null and v_volume is distinct from v_book.series_volume then
        v_kind    := 'wrong_number';
        v_pvolume := v_volume;
      end if;
    else
      v_kind    := 'wrong_series';
      v_pname   := v_name;
      v_pvolume := case when v_name is not null then v_volume end;
    end if;
  end if;

  if v_kind is not null then
    insert into library.series_audit_flags as f (household_id, book_id, job_id, kind, current_name, current_volume,
                                                 proposed_name, proposed_volume, why)
    values (p_household, p_book, p_job, v_kind, v_book.series_name, v_book.series_volume, v_pname, v_pvolume, v_why)
    on conflict (book_id) where status = 'pending' do update
      set kind            = excluded.kind,
          current_name    = excluded.current_name,
          current_volume  = excluded.current_volume,
          proposed_name   = excluded.proposed_name,
          proposed_volume = excluded.proposed_volume,
          why             = excluded.why,
          job_id          = excluded.job_id,
          created_at      = now();
  end if;

  -- 5. The marker.
  update library.book_cards c set series_audited_at = now() where c.book_id = p_book;
  return coalesce(v_kind, 'none');
end;
$$;

---------------------------------------------------------------------------
-- Finish: the audit branch and its true cost (D7)
---------------------------------------------------------------------------

-- As 20261119232416_library-series-accuracy.sql, plus:
--   audit job   _apply_series_audit with p_result.audit (validated there:
--               invalid_result, 22023); tags, card and suggestions ignored.
--   charge      an audit job, like a series job, through _ai_settle_actual.
-- The claim token, lock order and source-hash requeue are unchanged.
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
  elsif v_job.kind = 'audit' then
    -- D7: an audit writes at most one flag and the marker, never the book.
    -- Tags, the card and suggestions are ignored.
    perform library._apply_series_audit(v_job.household_id, v_job.book_id, v_job.id, v_job.audit_seen,
                                        p_result -> 'audit');
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

  -- D10: a series or audit job records its true cost (10x guard); the others
  -- stay clamped to the reserve.
  if v_job.kind in ('series', 'audit') then
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
-- Release: an audit's usage-bearing failure at its true cost (D7)
---------------------------------------------------------------------------

-- As 20261119232416_library-series-accuracy.sql, except that the true-cost
-- branch covers audit jobs as well as series jobs. A failed audit sets no
-- marker, so it can be requested again (D4).
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

  -- D10: a series or audit job's usage-bearing failure records its true cost
  -- (10x guard). Everything else stays clamped to the job's own reserve, so
  -- a billed-unknown retry never keeps more than was reserved.
  if v_job.kind in ('series', 'audit') and v_error in ('tag_refused', 'tag_unreadable') then
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
-- Decisions (D8)
---------------------------------------------------------------------------

-- Internal, no client grant: the three decisions' shared steps. p_decision
-- is applied | kept | edited (p_name and p_volume are read for edited only).
--   not_authorized (42501)  the flag is missing or the caller isn't a member;
--   invalid_name (22023)    edited: the trimmed name is over 200 characters;
--   invalid_volume (22023)  edited: round(v, 2) outside [0, 10000);
--   not_pending             the flag is decided or stale;
--   stale                   the book's series no longer matches the flag (the
--                           trigger normally retires it first): the flag
--                           becomes stale and the book is unchanged;
--   p_decision              done. The flag is decided first, then the book:
--                           its series as decided, with seriesName and
--                           seriesVolume added to user_edited_fields (no
--                           duplicates).
-- Locks the book, then the flag, the order finish_tag_job uses.
create or replace function library._decide_series_audit(p_flag uuid, p_decision text, p_name text, p_volume numeric)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_household uuid;
  v_book_id   uuid;
  v_book      library.books%rowtype;
  v_flag      library.series_audit_flags%rowtype;
  v_typed     text;
  v_name      text;
  v_volume    numeric;
begin
  select f.household_id, f.book_id into v_household, v_book_id
    from library.series_audit_flags f where f.id = p_flag;
  if not found or not library.is_member(v_household) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  if p_decision = 'edited' then
    v_typed := regexp_replace(coalesce(p_name, ''), '^\s+|\s+$', '', 'g');
    if char_length(v_typed) > 200 then
      raise exception 'invalid_name' using errcode = '22023';
    end if;
    if p_volume is not null then
      v_volume := round(p_volume, 2);
      if v_volume < 0 or v_volume >= 10000 then
        raise exception 'invalid_volume' using errcode = '22023';
      end if;
    end if;
  end if;

  select b.* into v_book from library.books b where b.id = v_book_id for no key update;
  select f.* into v_flag from library.series_audit_flags f where f.id = p_flag for update;

  if v_flag.status <> 'pending' then
    return 'not_pending';
  end if;
  if v_book.series_name is distinct from v_flag.current_name
     or v_book.series_volume is distinct from v_flag.current_volume then
    update library.series_audit_flags f set status = 'stale', decided_at = now() where f.id = p_flag;
    return 'stale';
  end if;

  if p_decision = 'applied' then
    if v_flag.kind = 'wrong_number' then
      v_name   := v_book.series_name;
      v_volume := v_flag.proposed_volume;
    elsif v_flag.proposed_name is null then
      v_name   := null;
      v_volume := null;
    else
      -- No author check: applying another author's series is Tierra's call.
      v_name   := coalesce(library._series_spelling(v_household, lower(v_flag.proposed_name)), v_flag.proposed_name);
      v_volume := v_flag.proposed_volume;
    end if;
  elsif p_decision = 'kept' then
    v_name   := v_book.series_name;
    v_volume := v_book.series_volume;
  elsif p_decision = 'edited' then
    if v_typed = '' then
      v_name   := null;
      v_volume := null;
    else
      v_name := coalesce(library._series_spelling(v_household, lower(v_typed)), v_typed);
    end if;
  else
    raise exception 'invalid_decision' using errcode = '22023';
  end if;

  -- Decided before the book write: the trigger retires pending flags only.
  update library.series_audit_flags f
     set status = p_decision, decided_by = auth.uid(), decided_at = now()
   where f.id = p_flag;

  update library.books b
     set series_name        = v_name,
         series_volume      = v_volume,
         user_edited_fields = b.user_edited_fields
                              || array(select x.f
                                         from unnest('{seriesName,seriesVolume}'::text[]) with ordinality x(f, o)
                                        where not (x.f = any (b.user_edited_fields))
                                        order by x.o)
   where b.id = v_book_id;

  return p_decision;
end;
$$;

-- Use audit's answer: wrong_series sets the proposed series (the household's
-- spelling) and number, or clears both for a standalone; wrong_number sets
-- the number only. Returns applied | not_pending | stale.
create or replace function library.apply_series_audit(p_flag uuid)
returns text
language sql
security definer
set search_path = ''
as $$ select library._decide_series_audit(p_flag, 'applied', null, null) $$;

-- Keep it: the series stays; only the hand-set mark is added. Returns
-- kept | not_pending | stale.
create or replace function library.keep_series_audit(p_flag uuid)
returns text
language sql
security definer
set search_path = ''
as $$ select library._decide_series_audit(p_flag, 'kept', null, null) $$;

-- Edit...: the series as typed (trimmed, stored under the household's
-- spelling); a blank or null name clears the series and the number. Returns
-- edited | not_pending | stale; invalid_name / invalid_volume (22023).
create or replace function library.edit_series_audit(p_flag uuid, p_name text, p_volume numeric)
returns text
language sql
security definer
set search_path = ''
as $$ select library._decide_series_audit(p_flag, 'edited', p_name, p_volume) $$;

---------------------------------------------------------------------------
-- Undo a dismissal (D9)
---------------------------------------------------------------------------

-- A dismissed new row goes back to pending, undecided. Its book rows were
-- never changed by the dismissal, so it returns with its books as they were.
-- Returns restored | not_dismissed; an existing row is invalid_kind (22023).
create or replace function library.undo_series_dismissal(p_suggestion uuid)
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
  if v_s.kind <> 'new' then
    raise exception 'invalid_kind' using errcode = '22023';
  end if;
  if v_s.status <> 'dismissed' then
    return 'not_dismissed';
  end if;
  update library.series_suggestions s
     set status = 'pending', decided_by = null, decided_at = null
   where s.id = p_suggestion;
  return 'restored';
end;
$$;

-- One dismissed book of an existing row goes back to pending. A book that
-- has a series now or is hand-set can't come back (approve would skip it).
-- Returns restored | not_eligible | not_dismissed; a new row is invalid_kind
-- (22023). Locks the book, then the suggestion FOR SHARE, as approve does.
create or replace function library.undo_series_book_dismissal(p_suggestion uuid, p_book uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_household uuid;
  v_kind      text;
  v_book      library.books%rowtype;
  v_status    text;
begin
  select s.household_id, s.kind into v_household, v_kind
    from library.series_suggestions s where s.id = p_suggestion;
  if not found or not library.is_member(v_household) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  if v_kind <> 'existing' then
    raise exception 'invalid_kind' using errcode = '22023';
  end if;

  select b.* into v_book from library.books b
   where b.id = p_book and b.household_id = v_household
     for no key update;
  perform 1 from library.series_suggestions s where s.id = p_suggestion for share;
  select sb.status into v_status
    from library.series_suggestion_books sb
   where sb.suggestion_id = p_suggestion and sb.book_id = p_book
     for update;

  if v_status is distinct from 'dismissed' then
    return 'not_dismissed';
  end if;
  if v_book.series_name is not null or v_book.user_edited_fields && '{seriesName,seriesVolume}'::text[] then
    return 'not_eligible';
  end if;
  update library.series_suggestion_books sb
     set status = 'pending', decided_at = null
   where sb.suggestion_id = p_suggestion and sb.book_id = p_book;
  return 'restored';
end;
$$;

---------------------------------------------------------------------------
-- Grants (part 2)
---------------------------------------------------------------------------

revoke execute on function library._apply_series_audit(uuid, uuid, uuid, jsonb, jsonb) from public, anon, authenticated;
revoke execute on function library._decide_series_audit(uuid, text, text, numeric)    from public, anon, authenticated;
revoke execute on function library.finish_tag_job(uuid, uuid, jsonb, jsonb, int, text) from public, anon;
revoke execute on function library.release_tag_job(uuid, uuid, text, timestamptz, jsonb, int) from public, anon;
revoke execute on function library.apply_series_audit(uuid)                          from public, anon;
revoke execute on function library.keep_series_audit(uuid)                           from public, anon;
revoke execute on function library.edit_series_audit(uuid, text, numeric)            from public, anon;
revoke execute on function library.undo_series_dismissal(uuid)                       from public, anon;
revoke execute on function library.undo_series_book_dismissal(uuid, uuid)            from public, anon;

grant execute on function library.finish_tag_job(uuid, uuid, jsonb, jsonb, int, text) to authenticated;
grant execute on function library.release_tag_job(uuid, uuid, text, timestamptz, jsonb, int) to authenticated;
grant execute on function library.apply_series_audit(uuid)                           to authenticated;
grant execute on function library.keep_series_audit(uuid)                            to authenticated;
grant execute on function library.edit_series_audit(uuid, text, numeric)             to authenticated;
grant execute on function library.undo_series_dismissal(uuid)                        to authenticated;
grant execute on function library.undo_series_book_dismissal(uuid, uuid)            to authenticated;
