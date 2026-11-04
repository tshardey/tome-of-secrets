-- Library schema: household physical-book catalog for the tos-personal-library app.
--
-- Every Tome of Secrets player can sign in to this project, so all access is
-- restricted to household members via RLS. Households and memberships are
-- only ever created through the security definer RPCs below.
--
-- Idempotent: safe to re-run.

create schema if not exists library;

---------------------------------------------------------------------------
-- Tables
---------------------------------------------------------------------------

create table if not exists library.households (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  invite_code text not null unique default encode(extensions.gen_random_bytes(6), 'hex'),
  created_at  timestamptz not null default now()
);

create table if not exists library.household_members (
  household_id uuid not null references library.households (id) on delete cascade,
  user_id      uuid not null references auth.users (id) on delete cascade,
  display_name text not null,
  created_at   timestamptz not null default now(),
  primary key (household_id, user_id)
);

create table if not exists library.books (
  id                 uuid primary key default gen_random_uuid(),
  household_id       uuid not null references library.households (id) on delete cascade,
  title              text not null,
  authors            text[] not null default '{}',
  synopsis           text,
  cover_url          text,
  isbn13             text[] not null default '{}',
  isbn10             text[] not null default '{}',
  openlibrary_id     text,
  google_books_id    text,
  page_count         int,
  publisher          text,
  publish_date       text,
  user_edited_fields text[] not null default '{}',
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create table if not exists library.copies (
  id                 uuid primary key default gen_random_uuid(),
  book_id            uuid not null references library.books (id) on delete cascade,
  owner_user_id      uuid references auth.users (id) on delete set null, -- null = shared
  edition_note       text,
  location           text,
  origin             text not null check (origin in ('libib', 'photo', 'manual')),
  libib_id           text,
  photo_path         text,
  user_edited_fields text[] not null default '{}',
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create index if not exists books_household_id_idx on library.books (household_id);
create index if not exists copies_book_id_idx on library.copies (book_id);
create index if not exists copies_libib_id_idx on library.copies (libib_id) where libib_id is not null;
-- Supports the ON DELETE SET NULL from auth.users.
create index if not exists copies_owner_user_id_idx on library.copies (owner_user_id) where owner_user_id is not null;
-- Supports "which households am I in?" lookups and ON DELETE CASCADE from auth.users.
create index if not exists household_members_user_id_idx on library.household_members (user_id);

---------------------------------------------------------------------------
-- updated_at trigger
---------------------------------------------------------------------------

create or replace function library.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists books_set_updated_at on library.books;
create trigger books_set_updated_at
  before update on library.books
  for each row execute function library.set_updated_at();

drop trigger if exists copies_set_updated_at on library.copies;
create trigger copies_set_updated_at
  before update on library.copies
  for each row execute function library.set_updated_at();

---------------------------------------------------------------------------
-- Membership helper + household RPCs (security definer, empty search_path)
---------------------------------------------------------------------------

create or replace function library.is_member(p_household uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from library.household_members m
     where m.household_id = p_household
       and m.user_id = auth.uid()
  );
$$;

create or replace function library.create_household(p_name text, p_display_name text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_household uuid;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;

  insert into library.households (name)
  values (p_name)
  returning id into v_household;

  insert into library.household_members (household_id, user_id, display_name)
  values (v_household, v_uid, p_display_name);

  return v_household;
end;
$$;

create or replace function library.join_household(p_invite_code text, p_display_name text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_household uuid;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;

  select h.id
    into v_household
    from library.households h
   where h.invite_code = p_invite_code;

  if v_household is null then
    raise exception 'invalid_invite_code';
  end if;

  -- Idempotent: re-joining keeps the existing membership row.
  insert into library.household_members (household_id, user_id, display_name)
  values (v_household, v_uid, p_display_name)
  on conflict (household_id, user_id) do nothing;

  return v_household;
end;
$$;

---------------------------------------------------------------------------
-- Row level security
---------------------------------------------------------------------------

alter table library.households        enable row level security;
alter table library.household_members enable row level security;
alter table library.books             enable row level security;
alter table library.copies            enable row level security;

-- households / household_members: read-only for members; writes via RPCs only.
drop policy if exists households_select_member on library.households;
create policy households_select_member on library.households
  for select to authenticated
  using (library.is_member(id));

drop policy if exists household_members_select_member on library.household_members;
create policy household_members_select_member on library.household_members
  for select to authenticated
  using (library.is_member(household_id));

-- books: full CRUD for members of the book's household.
drop policy if exists books_select_member on library.books;
create policy books_select_member on library.books
  for select to authenticated
  using (library.is_member(household_id));

drop policy if exists books_insert_member on library.books;
create policy books_insert_member on library.books
  for insert to authenticated
  with check (library.is_member(household_id));

drop policy if exists books_update_member on library.books;
create policy books_update_member on library.books
  for update to authenticated
  using (library.is_member(household_id))
  with check (library.is_member(household_id));

drop policy if exists books_delete_member on library.books;
create policy books_delete_member on library.books
  for delete to authenticated
  using (library.is_member(household_id));

-- copies: full CRUD for members of the parent book's household.
drop policy if exists copies_select_member on library.copies;
create policy copies_select_member on library.copies
  for select to authenticated
  using (exists (select 1 from library.books b
                  where b.id = book_id and library.is_member(b.household_id)));

drop policy if exists copies_insert_member on library.copies;
create policy copies_insert_member on library.copies
  for insert to authenticated
  with check (exists (select 1 from library.books b
                       where b.id = book_id and library.is_member(b.household_id)));

drop policy if exists copies_update_member on library.copies;
create policy copies_update_member on library.copies
  for update to authenticated
  using (exists (select 1 from library.books b
                  where b.id = book_id and library.is_member(b.household_id)))
  with check (exists (select 1 from library.books b
                       where b.id = book_id and library.is_member(b.household_id)));

drop policy if exists copies_delete_member on library.copies;
create policy copies_delete_member on library.copies
  for delete to authenticated
  using (exists (select 1 from library.books b
                  where b.id = book_id and library.is_member(b.household_id)));

---------------------------------------------------------------------------
-- Grants: authenticated only; nothing for anon / public.
---------------------------------------------------------------------------

revoke all on schema library from public, anon;
revoke all on all tables in schema library from public, anon, authenticated;
-- Postgres grants EXECUTE on every new function to PUBLIC by default, and a
-- per-schema `alter default privileges` cannot remove that global default
-- (changing the global default would also affect ToS's `public` schema).
-- So EVERY new function added to `library` must explicitly
-- `revoke execute on function ... from public, anon;` and then
-- `grant execute ... to authenticated` only if callers need it.
revoke execute on function library.set_updated_at()             from public, anon, authenticated;
revoke execute on function library.is_member(uuid)              from public, anon;
revoke execute on function library.create_household(text, text) from public, anon;
revoke execute on function library.join_household(text, text)   from public, anon;

grant usage on schema library to authenticated;

grant select on library.households        to authenticated;
grant select on library.household_members to authenticated;
grant select, insert, update, delete on library.books  to authenticated;
grant select, insert, update, delete on library.copies to authenticated;

grant execute on function library.is_member(uuid)              to authenticated;
grant execute on function library.create_household(text, text) to authenticated;
grant execute on function library.join_household(text, text)   to authenticated;
