-- Library: shared tags per book (library.book_tags) and book series columns.
-- Idempotent like the earlier library migrations.

---------------------------------------------------------------------------
-- Series on books.
---------------------------------------------------------------------------
alter table library.books add column if not exists series_name   text;
alter table library.books add column if not exists series_volume numeric(6,2);

alter table library.books drop constraint if exists books_series_name_check;
alter table library.books add constraint books_series_name_check
  check (series_name is null
         or (series_name = btrim(series_name) and char_length(series_name) between 1 and 200));

-- Belt and braces: numeric(6,2) already caps series_volume below 10000.
alter table library.books drop constraint if exists books_series_volume_check;
alter table library.books add constraint books_series_volume_check
  check (series_volume is null or (series_volume >= 0 and series_volume < 10000));

-- Target of the composite foreign key below. Guarded rather than dropped and
-- re-added: book_tags depends on it, so a drop would fail on a rerun.
do $$ begin
  if not exists (select 1 from pg_constraint
                  where conname = 'books_id_household_key' and conrelid = 'library.books'::regclass) then
    alter table library.books add constraint books_id_household_key unique (id, household_id);
  end if;
end $$;

---------------------------------------------------------------------------
-- Tags.
---------------------------------------------------------------------------
create table if not exists library.book_tags (
  book_id      uuid not null,
  household_id uuid not null,
  tag_id       text not null,
  created_at   timestamptz not null default now(),
  primary key (book_id, tag_id),
  foreign key (book_id, household_id) references library.books (id, household_id) on delete cascade,
  constraint book_tags_tag_id_format check (tag_id ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(tag_id) <= 40),
  constraint book_tags_not_type_derived check (tag_id <> 'audio')
);

create index if not exists book_tags_household_id_idx on library.book_tags (household_id);

alter table library.book_tags enable row level security;

drop policy if exists book_tags_select_member on library.book_tags;
create policy book_tags_select_member on library.book_tags
  for select to authenticated
  using (library.is_member(household_id));

drop policy if exists book_tags_insert_member on library.book_tags;
create policy book_tags_insert_member on library.book_tags
  for insert to authenticated
  with check (library.is_member(household_id));

drop policy if exists book_tags_delete_member on library.book_tags;
create policy book_tags_delete_member on library.book_tags
  for delete to authenticated
  using (library.is_member(household_id));

revoke all on library.book_tags from public, anon, authenticated;
grant select, insert, delete on library.book_tags to authenticated;
