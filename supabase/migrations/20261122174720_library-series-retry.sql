-- Library series retry (2026-11-22).
--
-- A series request (Find series) now takes a book whose newest job is a
-- failed series job, so series checks that failed (such as the tag_unreadable
-- failures from the tagger bug fixed in #160) can be asked again. A newest
-- failed full or new_tags job still skips a series request, and every other
-- series rule is unchanged: a card, not yet checked, no series, neither
-- seriesName nor seriesVolume hand-set, no active job. run and new_tags
-- requests still skip any book whose newest job failed, whatever its kind;
-- manual requests take failed books as before.
--
-- library.request_tagging keeps its signature, language, security mode,
-- search_path and grants (restated below). Re-runnable.

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
--             isn't failed, unless that failed job is itself a series job
--             (Find series, D5; a failed series check can be asked again).
--             On the shelf or not.
-- A concurrent request for the same book reads already_open.
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
  v_newest      text;
  v_newest_kind text;
  v_rows        int;
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
      -- select into sets both to null when the book has no job.
      select j.status, j.kind into v_newest, v_newest_kind
        from library.tag_jobs j where j.book_id = v_id
       order by j.created_at desc limit 1;
      v_card    := null;
      v_checked := null;
      select c.vocab_version, c.series_checked_at into v_card, v_checked
        from library.book_cards c where c.book_id = v_id;
      if (v_newest = 'failed' and not (p_reason = 'series' and v_newest_kind = 'series'))
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

-- See the header of 20261103000000_library-schema.sql: every new function
-- must revoke the default PUBLIC execute. create or replace keeps the grants;
-- they are restated so this file stands alone.
revoke execute on function library.request_tagging(uuid, uuid[], text, uuid) from public, anon;
grant execute on function library.request_tagging(uuid, uuid[], text, uuid)  to authenticated;
