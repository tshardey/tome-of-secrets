-- Library read status per household member (Plan 8, D2-D3): who has read or
-- not finished which book, and the three rules that write it.
--
-- read_statuses  one row per (book, member): 'read', 'dnf' or 'cleared' (the
--                member marked it Unread in the app; only the app writes
--                cleared). source says who wrote it: app, storygraph or tos.
--                marked_at is when the status itself was last set; filling a
--                date later leaves it alone, and the ToS rule compares against
--                it. A member who leaves, or a deleted book, takes the rows.
--
-- Who wins (D3), one function each:
--   set_read_status    the app. Always applies, for auth.uid() only.
--   record_tos_reads   ToS completions. Fills a missing date on a read row;
--                      replaces a dnf or cleared row only with a completion
--                      newer than marked_at.
--   _apply_history     a StoryGraph row (the upload and the matcher call it).
--                      Inserts when there is no row, otherwise only upgrades
--                      its own storygraph rows; app, tos and cleared rows are
--                      never touched. No client execute.
--
-- No RPC takes a user id: writes are for auth.uid(). No client insert, update
-- or delete. Idempotent: safe to re-run.

---------------------------------------------------------------------------
-- Table
---------------------------------------------------------------------------

create table if not exists library.read_statuses (
  book_id      uuid not null,
  household_id uuid not null,
  user_id      uuid not null,
  status       text not null check (status in ('read', 'dnf', 'cleared')),
  finished_on  date,
  source       text not null check (source in ('app', 'storygraph', 'tos')),
  marked_at    timestamptz not null default now(),
  set_by       uuid references auth.users (id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  primary key (book_id, user_id),
  foreign key (book_id, household_id) references library.books (id, household_id) on delete cascade,
  foreign key (household_id, user_id) references library.household_members (household_id, user_id) on delete cascade,
  constraint read_statuses_cleared_no_date check (status <> 'cleared' or finished_on is null)
);

create index if not exists read_statuses_household_id_idx on library.read_statuses (household_id);
create index if not exists read_statuses_user_id_idx on library.read_statuses (user_id);
create index if not exists read_statuses_set_by_idx on library.read_statuses (set_by) where set_by is not null;

drop trigger if exists read_statuses_set_updated_at on library.read_statuses;
create trigger read_statuses_set_updated_at
  before update on library.read_statuses
  for each row execute function library.set_updated_at();

---------------------------------------------------------------------------
-- App: set_read_status
---------------------------------------------------------------------------

-- Marks the books read, dnf or unread (stored as cleared) for the caller.
-- keep mode (p_keep_dates): an existing date is kept and p_finished_on only
-- fills a missing one; otherwise p_finished_on is the date. Unread stores no
-- date. Duplicate ids are answered once; an id outside the household is
-- not_found. 'unchanged' = status, date and source would all stay the same.
create or replace function library.set_read_status(
  p_household uuid, p_book_ids uuid[], p_status text, p_finished_on date, p_keep_dates boolean)
returns table (book_id uuid, outcome text)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_user   uuid := auth.uid();
  v_status text;
  v_id     uuid;
  v_row    library.read_statuses;
  v_has    boolean;
  v_date   date;
begin
  if p_household is null or v_user is null or not library.is_member(p_household) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  if p_status is null or p_status not in ('read', 'dnf', 'unread') then
    raise exception 'invalid_status' using errcode = '22023';
  end if;
  if p_book_ids is null or cardinality(p_book_ids) > 1000 then
    raise exception 'invalid_book_ids' using errcode = '22023';
  end if;
  v_status := case p_status when 'unread' then 'cleared' else p_status end;

  for v_id in select distinct x from unnest(p_book_ids) x where x is not null order by x loop
    if not exists (select 1 from library.books b where b.id = v_id and b.household_id = p_household) then
      book_id := v_id; outcome := 'not_found'; return next;
      continue;
    end if;

    select * into v_row from library.read_statuses s where s.book_id = v_id and s.user_id = v_user;
    v_has := found;

    v_date := case
      when v_status = 'cleared' then null
      when coalesce(p_keep_dates, false) then coalesce(v_row.finished_on, p_finished_on)
      else p_finished_on
    end;

    if v_has and v_row.status = v_status and v_row.finished_on is not distinct from v_date
       and v_row.source = 'app' then
      book_id := v_id; outcome := 'unchanged'; return next;
      continue;
    end if;

    insert into library.read_statuses as s
      (book_id, household_id, user_id, status, finished_on, source, marked_at, set_by)
    values (v_id, p_household, v_user, v_status, v_date, 'app', now(), v_user)
    on conflict (book_id, user_id) do update
      set status = excluded.status, finished_on = excluded.finished_on, source = 'app',
          marked_at = now(), set_by = v_user;

    book_id := v_id; outcome := 'changed'; return next;
  end loop;
end;
$$;

---------------------------------------------------------------------------
-- ToS: record_tos_reads
---------------------------------------------------------------------------

-- Items are [{bookId, completedAt, finishedOn}]. completedAt is clamped to
-- now(). A malformed item (bookId not a uuid, an unparsable date) or a book
-- outside the household is not_found and does not stop the others. One result
-- per item, in order; book_id is null for an item whose id could not be read.
create or replace function library.record_tos_reads(p_household uuid, p_items jsonb)
returns table (book_id uuid, outcome text)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_user      uuid := auth.uid();
  v_item      jsonb;
  v_id        uuid;
  v_completed timestamptz;
  v_finished  date;
  v_row       library.read_statuses;
  v_has       boolean;
begin
  if p_household is null or v_user is null or not library.is_member(p_household) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) > 500 then
    raise exception 'invalid_items' using errcode = '22023';
  end if;

  for v_item in select e from jsonb_array_elements(p_items) e loop
    v_id := null; v_completed := null; v_finished := null;
    begin
      v_id := (v_item ->> 'bookId')::uuid;
      v_completed := (v_item ->> 'completedAt')::timestamptz;
      -- least() ignores nulls, so clamp only a real value.
      if v_completed > now() then v_completed := now(); end if;
      v_finished := (v_item ->> 'finishedOn')::date;
    exception when others then
      book_id := v_id; outcome := 'not_found'; return next;
      continue;
    end;

    if v_id is null
       or not exists (select 1 from library.books b where b.id = v_id and b.household_id = p_household) then
      book_id := v_id; outcome := 'not_found'; return next;
      continue;
    end if;

    select * into v_row from library.read_statuses s where s.book_id = v_id and s.user_id = v_user;
    v_has := found;

    if not v_has then
      insert into library.read_statuses (book_id, household_id, user_id, status, finished_on, source, marked_at)
      values (v_id, p_household, v_user, 'read', v_finished, 'tos', coalesce(v_completed, now()));
      outcome := 'added';
    elsif v_row.status = 'read' then
      if v_row.finished_on is null and v_finished is not null then
        update library.read_statuses s set finished_on = v_finished
         where s.book_id = v_id and s.user_id = v_user;
        outcome := 'dated';
      else
        outcome := 'unchanged';
      end if;
    elsif v_completed is not null and v_completed > v_row.marked_at then
      update library.read_statuses s
         set status = 'read', finished_on = v_finished, source = 'tos',
             marked_at = v_completed, set_by = null
       where s.book_id = v_id and s.user_id = v_user;
      outcome := 'replaced';
    else
      outcome := 'unchanged';
    end if;

    book_id := v_id; return next;
  end loop;
end;
$$;

---------------------------------------------------------------------------
-- StoryGraph: _apply_history (internal)
---------------------------------------------------------------------------

-- Returns whether it wrote. No row: insert sg_status as a storygraph row. A
-- storygraph row: upgrade dnf to read (never back) and take last_read when it
-- isn't null and the row isn't being downgraded. An app or tos row, including every cleared row, is never touched.
create or replace function library._apply_history(
  p_household uuid, p_user uuid, p_book uuid, p_sg_status text, p_last_read date)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row    library.read_statuses;
  v_has    boolean;
  v_status text;
  v_date   date;
begin
  if p_sg_status is null or p_sg_status not in ('read', 'dnf') then
    raise exception 'invalid_status' using errcode = '22023';
  end if;

  select * into v_row from library.read_statuses s where s.book_id = p_book and s.user_id = p_user;
  v_has := found;
  if not v_has then
    insert into library.read_statuses (book_id, household_id, user_id, status, finished_on, source)
    values (p_book, p_household, p_user, p_sg_status, p_last_read, 'storygraph')
    on conflict (book_id, user_id) do nothing;
    return found;
  end if;

  if v_row.source <> 'storygraph' then
    return false;
  end if;

  -- A dnf onto a read row is a downgrade: it changes nothing, not even the date.
  if p_sg_status = 'dnf' and v_row.status = 'read' then
    return false;
  end if;

  v_status := p_sg_status;
  v_date   := coalesce(p_last_read, v_row.finished_on);
  if v_status = v_row.status and v_date is not distinct from v_row.finished_on then
    return false;
  end if;

  update library.read_statuses s
     set status = v_status, finished_on = v_date,
         marked_at = case when v_status <> v_row.status then now() else s.marked_at end
   where s.book_id = p_book and s.user_id = p_user;
  return true;
end;
$$;

---------------------------------------------------------------------------
-- RLS and grants
---------------------------------------------------------------------------

alter table library.read_statuses enable row level security;

drop policy if exists read_statuses_select_member on library.read_statuses;
create policy read_statuses_select_member on library.read_statuses
  for select to authenticated using (library.is_member(household_id));

revoke all on library.read_statuses from public, anon, authenticated;
grant select on library.read_statuses to authenticated;

revoke execute on function library.set_read_status(uuid, uuid[], text, date, boolean) from public, anon;
revoke execute on function library.record_tos_reads(uuid, jsonb)                      from public, anon;
revoke execute on function library._apply_history(uuid, uuid, uuid, text, date)       from public, anon, authenticated;

grant execute on function library.set_read_status(uuid, uuid[], text, date, boolean) to authenticated;
grant execute on function library.record_tos_reads(uuid, jsonb)                      to authenticated;
