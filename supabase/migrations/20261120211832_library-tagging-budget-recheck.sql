-- Library tagging budget and series re-check (2026-11-20).
--
-- 1. Tagging is $7.00 a month, every month, for a household and for the
--    project. The first-month rule ($5.00 in a household's first tagging
--    month, $2.00 after) is gone. Ask stays $2.00. ai_budget_micro and
--    ai_global_budget_micro keep their signatures, volatility, search_path,
--    security mode and grants; ai_budget_micro's p_household and p_month are
--    now unused but kept for its callers.
-- 2. library._series_recheck_all_blank() clears the "checked once" marker
--    on every blank book: no series, not hand-set, and not on an open
--    suggestion (the same exclusion as _series_recheck_reset). It queues
--    nothing; Find series offers those books again behind its confirm.
--    Books with a series are out of scope: _apply_series keeps them.
--
-- Re-runnable: the functions are idempotent. The last statement,
-- select library._series_recheck_all_blank(), is not: every re-apply clears
-- the markers it selects again, so Find series offers those books again.

---------------------------------------------------------------------------
-- Budgets
---------------------------------------------------------------------------

-- Project-wide monthly ceilings: tagging $7.00, Ask $2.00.
create or replace function library.ai_global_budget_micro(p_feature text)
returns bigint
language sql
immutable
set search_path = ''
as $$ select case p_feature when 'tagging' then 7000000::bigint when 'ask' then 2000000::bigint end $$;

-- A household's monthly budget for a feature: tagging $7.00, Ask $2.00, in
-- every month. Security invoker.
create or replace function library.ai_budget_micro(p_household uuid, p_feature text, p_month date)
returns bigint
language sql
stable
set search_path = ''
as $$
  select case
           when p_feature = 'ask' then 2000000::bigint
           when p_feature = 'tagging' then 7000000::bigint
         end
$$;

---------------------------------------------------------------------------
-- The one-time re-check of every blank book
---------------------------------------------------------------------------

-- Internal, no client grant. Clears book_cards.series_checked_at on every
-- checked card whose book has no series, isn't hand-set (neither seriesName
-- nor seriesVolume in user_edited_fields), and has no pending row on a
-- listed suggestion (a pending new row, or any existing row). A dismissed or
-- approved book row, or a pending one on a decided new row, doesn't keep it.
-- Queues nothing. Returns the number of markers cleared.
create or replace function library._series_recheck_all_blank()
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_n int;
begin
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
                        and (s.kind = 'existing' or s.status = 'pending'));
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

---------------------------------------------------------------------------
-- Grants
---------------------------------------------------------------------------

revoke execute on function library.ai_global_budget_micro(text)                       from public, anon;
revoke execute on function library.ai_budget_micro(uuid, text, date)                  from public, anon;
revoke execute on function library._series_recheck_all_blank()                       from public, anon, authenticated;

grant execute on function library.ai_global_budget_micro(text)                        to authenticated;
grant execute on function library.ai_budget_micro(uuid, text, date)                   to authenticated;

-- The re-check runs once, when this migration is pushed. It must stay the
-- last statement.
select library._series_recheck_all_blank();
