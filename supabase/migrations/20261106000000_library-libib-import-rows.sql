-- Library libib import ledger: remembers which libib rows the importer has
-- already accounted for, so books and copies deleted in the app stay deleted
-- when the same export is uploaded again.
--
-- Deliberately no foreign key to books or copies: ledger rows must outlive
-- them. No delete grant either; the ledger only ever grows or is bumped.
--
-- Idempotent: safe to re-run.

create table if not exists library.libib_import_rows (
  household_id uuid not null references library.households (id) on delete cascade,
  libib_id     text not null check (libib_id <> ''),
  copies_seen  int  not null check (copies_seen >= 1),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  primary key (household_id, libib_id)
);

drop trigger if exists libib_import_rows_set_updated_at on library.libib_import_rows;
create trigger libib_import_rows_set_updated_at
  before update on library.libib_import_rows
  for each row execute function library.set_updated_at();

alter table library.libib_import_rows enable row level security;

drop policy if exists libib_import_rows_select_member on library.libib_import_rows;
create policy libib_import_rows_select_member on library.libib_import_rows
  for select to authenticated
  using (library.is_member(household_id));

drop policy if exists libib_import_rows_insert_member on library.libib_import_rows;
create policy libib_import_rows_insert_member on library.libib_import_rows
  for insert to authenticated
  with check (library.is_member(household_id));

drop policy if exists libib_import_rows_update_member on library.libib_import_rows;
create policy libib_import_rows_update_member on library.libib_import_rows
  for update to authenticated
  using (library.is_member(household_id))
  with check (library.is_member(household_id));

revoke all on library.libib_import_rows from public, anon, authenticated;
grant select, insert, update on library.libib_import_rows to authenticated;

comment on column library.libib_import_rows.copies_seen is
  'Highest copy count the importer has accounted for; lets deleted books and copies stay deleted across re-imports.';
