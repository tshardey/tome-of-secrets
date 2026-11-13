-- Library tag vocabulary, library tag rows, the added-by marker and
-- hand-removal records (Plan 7, D3 and D4).
--
-- library_tags         the vocabulary. household_id null is the shared starting
--                      list (seeded below, added_version 1); a household's own
--                      additions carry its id. Members read both.
-- book_library_tags    a book's library tags, the shape of library.book_tags.
-- added_by             'person' or 'tagger' on both tag tables. Clients can't
--                      write it (insert is column-granted), so only a definer
--                      RPC can write 'tagger'.
-- tag_removals         "removed by hand" records, written by an after-delete
--                      trigger on each tag table so a removal is remembered
--                      however it happens, and cleared when a person adds the
--                      tag back. The tagger never re-adds a recorded tag.
--
-- No client writes beyond tag rows: select only on library_tags and
-- tag_removals; every vocabulary write goes through add_library_tag.
--
-- Idempotent: safe to re-run.

---------------------------------------------------------------------------
-- Tables
---------------------------------------------------------------------------

create table if not exists library.library_tags (
  household_id  uuid references library.households (id) on delete cascade,
  id            text not null,
  label         text not null,
  category      text not null,
  active        boolean not null default true,
  added_version int not null check (added_version >= 1),
  created_by    uuid default auth.uid() references auth.users (id) on delete set null,
  created_at    timestamptz not null default now(),
  constraint library_tags_id_key unique nulls not distinct (household_id, id),
  constraint library_tags_id_format check (id ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(id) <= 40),
  constraint library_tags_label_check
    check (label = btrim(label) and char_length(label) between 1 and 60),
  constraint library_tags_category_check
    check (category in ('trope', 'creature', 'setting', 'era', 'theme', 'mood', 'plot', 'protagonist',
                        'audience', 'subgenre', 'cover-colour', 'cover-motif', 'fact'))
);

create index if not exists library_tags_household_id_idx
  on library.library_tags (household_id) where household_id is not null;
create index if not exists library_tags_created_by_idx
  on library.library_tags (created_by) where created_by is not null;

create table if not exists library.book_library_tags (
  book_id      uuid not null,
  household_id uuid not null,
  tag_id       text not null,
  added_by     text not null default 'person',
  created_at   timestamptz not null default now(),
  primary key (book_id, tag_id),
  foreign key (book_id, household_id) references library.books (id, household_id) on delete cascade,
  constraint book_library_tags_tag_id_format
    check (tag_id ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(tag_id) <= 40),
  constraint book_library_tags_added_by_check check (added_by in ('person', 'tagger'))
);

create index if not exists book_library_tags_household_id_idx
  on library.book_library_tags (household_id);
create index if not exists book_library_tags_book_household_idx
  on library.book_library_tags (book_id, household_id);

-- ToS's own tag rows get the same marker. Existing rows are person-added.
alter table library.book_tags add column if not exists added_by text not null default 'person';
alter table library.book_tags drop constraint if exists book_tags_added_by_check;
alter table library.book_tags add constraint book_tags_added_by_check
  check (added_by in ('person', 'tagger'));

create table if not exists library.tag_removals (
  book_id      uuid not null,
  household_id uuid not null,
  kind         text not null check (kind in ('tos', 'library')),
  tag_id       text not null,
  removed_by   uuid references auth.users (id) on delete set null,
  removed_at   timestamptz not null default now(),
  primary key (book_id, kind, tag_id),
  foreign key (book_id, household_id) references library.books (id, household_id) on delete cascade,
  constraint tag_removals_tag_id_format
    check (tag_id ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(tag_id) <= 40)
);

create index if not exists tag_removals_household_id_idx
  on library.tag_removals (household_id);
create index if not exists tag_removals_book_household_idx
  on library.tag_removals (book_id, household_id);
create index if not exists tag_removals_removed_by_idx
  on library.tag_removals (removed_by) where removed_by is not null;

---------------------------------------------------------------------------
-- Starting vocabulary: 144 tags, shared by every household.
---------------------------------------------------------------------------

insert into library.library_tags (household_id, id, label, category, added_version)
select null, v.id, v.label, v.category, 1
  from (values
  -- trope
  ('morally-grey', 'Morally grey', 'trope'),
  ('bargains', 'Bargains', 'trope'),
  ('chosen-one-destiny', 'Chosen one destiny', 'trope'),
  ('retelling', 'Retelling', 'trope'),
  ('secret-identity', 'Secret identity', 'trope'),
  ('found-family', 'Found family', 'trope'),
  ('enemies-to-lovers', 'Enemies to lovers', 'trope'),
  ('heist-thieves', 'Heist thieves', 'trope'),
  ('quest', 'Quest', 'trope'),
  ('romantic-subplot', 'Romantic subplot', 'trope'),
  ('spies', 'Spies', 'trope'),
  ('underdog', 'Underdog', 'trope'),
  ('magic-awakening', 'Magic awakening', 'trope'),
  ('trope-subversion', 'Trope subversion', 'trope'),
  ('dark-romance', 'Dark romance', 'trope'),
  ('happy-ending', 'Happy ending', 'trope'),
  ('heartbreak', 'Heartbreak', 'trope'),
  -- creature
  ('ghosts', 'Ghosts', 'creature'),
  ('monsters', 'Monsters', 'creature'),
  ('vampires', 'Vampires', 'creature'),
  ('witches', 'Witches', 'creature'),
  ('shapeshifters', 'Shapeshifters', 'creature'),
  ('undead-zombies', 'Undead zombies', 'creature'),
  ('gods-deities', 'Gods deities', 'creature'),
  ('demons-possession', 'Demons possession', 'creature'),
  ('immortals', 'Immortals', 'creature'),
  ('aliens', 'Aliens', 'creature'),
  ('supernatural', 'Supernatural', 'creature'),
  -- setting
  ('wilderness', 'Wilderness', 'setting'),
  ('forest', 'Forest', 'setting'),
  ('royalty-courts', 'Royalty courts', 'setting'),
  ('hidden-world', 'Hidden world', 'setting'),
  ('space', 'Space', 'setting'),
  ('city-urban', 'City urban', 'setting'),
  ('small-town', 'Small town', 'setting'),
  ('school-academy', 'School academy', 'setting'),
  ('underground', 'Underground', 'setting'),
  ('water-setting', 'Water setting', 'setting'),
  ('farm-rural', 'Farm rural', 'setting'),
  ('gardens', 'Gardens', 'setting'),
  ('cafe-restaurant', 'Cafe restaurant', 'setting'),
  ('holiday', 'Holiday', 'setting'),
  ('winter-setting', 'Winter setting', 'setting'),
  ('summer-setting', 'Summer setting', 'setting'),
  -- era
  ('era-historical', 'Historical', 'era'),
  ('era-contemporary', 'Contemporary', 'era'),
  ('era-future', 'Future', 'era'),
  ('era-secondary-world', 'Secondary world', 'era'),
  -- theme
  ('death', 'Death', 'theme'),
  ('grief', 'Grief', 'theme'),
  ('afterlife', 'Afterlife', 'theme'),
  ('power-ambition', 'Power ambition', 'theme'),
  ('curses', 'Curses', 'theme'),
  ('deception', 'Deception', 'theme'),
  ('secrets', 'Secrets', 'theme'),
  ('games-competitions', 'Games competitions', 'theme'),
  ('lost-and-searching', 'Lost and searching', 'theme'),
  ('rebirth-resurrection', 'Rebirth resurrection', 'theme'),
  ('science-research', 'Science research', 'theme'),
  ('survival', 'Survival', 'theme'),
  ('transformation', 'Transformation', 'theme'),
  ('family-expectations', 'Family expectations', 'theme'),
  ('food-cooking', 'Food cooking', 'theme'),
  ('greed-wealth', 'Greed wealth', 'theme'),
  ('guardian-protector', 'Guardian protector', 'theme'),
  ('healing', 'Healing', 'theme'),
  ('immigrant-refugee', 'Immigrant refugee', 'theme'),
  ('music-arts', 'Music arts', 'theme'),
  ('poison', 'Poison', 'theme'),
  ('political-intrigue', 'Political intrigue', 'theme'),
  ('rebellion-revolution', 'Rebellion revolution', 'theme'),
  ('self-worth', 'Self worth', 'theme'),
  ('war', 'War', 'theme'),
  ('desire-temptation', 'Desire temptation', 'theme'),
  ('fire', 'Fire', 'theme'),
  -- mood
  ('pace-fast', 'Fast-paced', 'mood'),
  ('pace-slow', 'Slow-paced', 'mood'),
  ('gothic', 'Gothic', 'mood'),
  ('eerie', 'Eerie', 'mood'),
  ('emotionally-intense', 'Emotionally intense', 'mood'),
  ('hopeful', 'Hopeful', 'mood'),
  ('humorous', 'Humorous', 'mood'),
  ('lighthearted', 'Lighthearted', 'mood'),
  ('lyrical-prose', 'Lyrical prose', 'mood'),
  ('psychological', 'Psychological', 'mood'),
  ('witty-banter', 'Witty banter', 'mood'),
  -- plot
  ('plot-twist', 'Plot twist', 'plot'),
  ('interpersonal-drama', 'Interpersonal drama', 'plot'),
  ('action-battles', 'Action battles', 'plot'),
  ('journey', 'Journey', 'plot'),
  ('memorable-villain', 'Memorable villain', 'plot'),
  ('time-travel', 'Time travel', 'plot'),
  ('balls-parties', 'Balls parties', 'plot'),
  ('based-on-true-story', 'Based on true story', 'plot'),
  ('explorers', 'Explorers', 'plot'),
  ('first-contact', 'First contact', 'plot'),
  ('murder-mystery', 'Murder mystery', 'plot'),
  ('ticking-clock', 'Ticking clock', 'plot'),
  ('treasure-hunt', 'Treasure hunt', 'plot'),
  ('unusual-transport', 'Unusual transport', 'plot'),
  -- protagonist
  ('unreliable-narrator', 'Unreliable narrator', 'protagonist'),
  ('flawed-protagonist', 'Flawed protagonist', 'protagonist'),
  ('lgbtq-mc', 'LGBTQ+ main character', 'protagonist'),
  ('trans-nonbinary-mc', 'Trans or nonbinary main character', 'protagonist'),
  ('nonhuman-mc', 'Nonhuman main character', 'protagonist'),
  ('older-mc', 'Older main character', 'protagonist'),
  ('child-mc', 'Child main character', 'protagonist'),
  ('single-pov', 'Single pov', 'protagonist'),
  -- audience
  ('audience-middle-grade', 'Middle grade', 'audience'),
  ('audience-ya', 'YA', 'audience'),
  ('audience-adult', 'Adult', 'audience'),
  -- subgenre
  ('thriller', 'Thriller', 'subgenre'),
  ('dystopian', 'Dystopian', 'subgenre'),
  ('epic-fantasy', 'Epic fantasy', 'subgenre'),
  ('memoir', 'Memoir', 'subgenre'),
  ('play-drama', 'Play drama', 'subgenre'),
  -- cover-colour
  ('cover-red', 'Red', 'cover-colour'),
  ('cover-orange', 'Orange', 'cover-colour'),
  ('cover-yellow', 'Yellow', 'cover-colour'),
  ('cover-green', 'Green', 'cover-colour'),
  ('cover-blue', 'Blue', 'cover-colour'),
  ('cover-purple', 'Purple', 'cover-colour'),
  ('cover-pink', 'Pink', 'cover-colour'),
  ('cover-black', 'Black', 'cover-colour'),
  ('cover-white', 'White', 'cover-colour'),
  ('cover-brown', 'Brown', 'cover-colour'),
  ('cover-gold', 'Gold', 'cover-colour'),
  -- cover-motif
  ('cover-animal', 'Animal', 'cover-motif'),
  ('cover-plants', 'Plants', 'cover-motif'),
  ('cover-illustrated', 'Illustrated', 'cover-motif'),
  ('cover-figure', 'Figure', 'cover-motif'),
  ('cover-landscape', 'Landscape', 'cover-motif'),
  ('cover-moon-stars', 'Moon stars', 'cover-motif'),
  ('cover-skull', 'Skull', 'cover-motif'),
  ('cover-heart', 'Heart', 'cover-motif'),
  ('cover-weapon', 'Weapon', 'cover-motif'),
  ('cover-key-door', 'Key door', 'cover-motif'),
  ('cover-book', 'Book', 'cover-motif'),
  ('cover-mushrooms', 'Mushrooms', 'cover-motif'),
  ('cover-antlers-horns', 'Antlers horns', 'cover-motif'),
  ('cover-fog-mist', 'Fog mist', 'cover-motif'),
  ('cover-geometric', 'Geometric', 'cover-motif'),
  -- fact
  ('has-adaptation', 'Has adaptation', 'fact'),
  ('banned-challenged', 'Banned challenged', 'fact')
  ) as v (id, label, category)
on conflict (household_id, id) do nothing;

---------------------------------------------------------------------------
-- Functions
---------------------------------------------------------------------------

-- The vocabulary version a household sees: the highest added_version over the
-- starting rows and the household's own. A null household reads the starting
-- version.
create or replace function library.vocab_version(p_household uuid)
returns int
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if p_household is not null and not library.is_member(p_household) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  return coalesce((select max(t.added_version) from library.library_tags t
                    where t.household_id is null or t.household_id = p_household), 1);
end;
$$;

-- True when the id names an active tag the household can use: a starting tag
-- or one of its own. Used by the book_library_tags insert policy.
create or replace function library.is_active_library_tag(p_household uuid, p_tag text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select library.is_member(p_household)
     and exists (select 1 from library.library_tags t
                  where t.id = p_tag and t.active
                    and (t.household_id is null or t.household_id = p_household));
$$;

-- Adds a tag to a household's vocabulary and returns the new version.
create or replace function library.add_library_tag(p_household uuid, p_id text, p_label text, p_category text)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_label   text := btrim(p_label);
  v_version int;
begin
  if p_household is null or not library.is_member(p_household) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  if p_id is null or p_id !~ '^[a-z0-9]+(-[a-z0-9]+)*$' or char_length(p_id) > 40 then
    raise exception 'invalid_tag_id' using errcode = '22023';
  end if;
  if v_label is null or char_length(v_label) not between 1 and 60 then
    raise exception 'invalid_label' using errcode = '22023';
  end if;
  if p_category is null or p_category not in ('trope', 'creature', 'setting', 'era', 'theme', 'mood', 'plot',
                                               'protagonist', 'audience', 'subgenre', 'cover-colour',
                                               'cover-motif', 'fact') then
    raise exception 'invalid_category' using errcode = '22023';
  end if;

  -- Serialise additions per household so the cap and the version hold.
  perform pg_advisory_xact_lock(hashtextextended('library_tags:' || p_household::text, 0));

  if exists (select 1 from library.library_tags t where t.household_id is null and t.id = p_id) then
    raise exception 'tag_exists' using errcode = '23505';
  end if;
  if (select count(*) from library.library_tags t where t.household_id = p_household) >= 400 then
    raise exception 'too_many_tags' using errcode = '22023';
  end if;

  v_version := library.vocab_version(p_household) + 1;
  insert into library.library_tags (household_id, id, label, category, added_version, created_by)
  values (p_household, p_id, v_label, p_category, v_version, auth.uid());
  return v_version;
end;
$$;

-- After delete on a tag table: remember a hand removal. TG_ARGV[0] is the
-- kind ('tos' or 'library'). Nothing is recorded when the book is gone (the
-- cascade from deleting a book, where the record would only fail its own
-- foreign key) or when the tagger is replacing its own tags
-- (library.tagger_replacing = 'on', transaction-local).
create or replace function library.record_tag_removal()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(current_setting('library.tagger_replacing', true), '') = 'on' then
    return null;
  end if;
  if not exists (select 1 from library.books b where b.id = old.book_id) then
    return null;
  end if;

  insert into library.tag_removals as r (book_id, household_id, kind, tag_id, removed_by, removed_at)
  values (old.book_id, old.household_id, tg_argv[0], old.tag_id, auth.uid(), now())
  on conflict (book_id, kind, tag_id) do update
    set removed_by = excluded.removed_by,
        removed_at = excluded.removed_at;
  return null;
end;
$$;

-- After insert of a person-added tag: adding it back by hand clears the record.
create or replace function library.clear_tag_removal()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from library.tag_removals r
   where r.book_id = new.book_id and r.kind = tg_argv[0] and r.tag_id = new.tag_id;
  return null;
end;
$$;

drop trigger if exists book_tags_record_removal on library.book_tags;
create trigger book_tags_record_removal
  after delete on library.book_tags
  for each row execute function library.record_tag_removal('tos');

drop trigger if exists book_tags_clear_removal on library.book_tags;
create trigger book_tags_clear_removal
  after insert on library.book_tags
  for each row when (new.added_by = 'person')
  execute function library.clear_tag_removal('tos');

drop trigger if exists book_library_tags_record_removal on library.book_library_tags;
create trigger book_library_tags_record_removal
  after delete on library.book_library_tags
  for each row execute function library.record_tag_removal('library');

drop trigger if exists book_library_tags_clear_removal on library.book_library_tags;
create trigger book_library_tags_clear_removal
  after insert on library.book_library_tags
  for each row when (new.added_by = 'person')
  execute function library.clear_tag_removal('library');

---------------------------------------------------------------------------
-- RLS
---------------------------------------------------------------------------

alter table library.library_tags      enable row level security;
alter table library.book_library_tags enable row level security;
alter table library.tag_removals      enable row level security;

drop policy if exists library_tags_select_member on library.library_tags;
create policy library_tags_select_member on library.library_tags
  for select to authenticated
  using (household_id is null or library.is_member(household_id));

drop policy if exists book_library_tags_select_member on library.book_library_tags;
create policy book_library_tags_select_member on library.book_library_tags
  for select to authenticated
  using (library.is_member(household_id));

drop policy if exists book_library_tags_insert_member on library.book_library_tags;
create policy book_library_tags_insert_member on library.book_library_tags
  for insert to authenticated
  with check (library.is_active_library_tag(household_id, tag_id));

drop policy if exists book_library_tags_delete_member on library.book_library_tags;
create policy book_library_tags_delete_member on library.book_library_tags
  for delete to authenticated
  using (library.is_member(household_id));

drop policy if exists tag_removals_select_member on library.tag_removals;
create policy tag_removals_select_member on library.tag_removals
  for select to authenticated
  using (library.is_member(household_id));

---------------------------------------------------------------------------
-- Grants
---------------------------------------------------------------------------

-- Revoking the table privileges also revokes earlier column grants.
revoke all on library.library_tags      from public, anon, authenticated;
revoke all on library.book_library_tags from public, anon, authenticated;
revoke all on library.tag_removals      from public, anon, authenticated;
revoke insert on library.book_tags from public, anon, authenticated;

grant select on library.library_tags to authenticated;
grant select on library.tag_removals to authenticated;
grant select, delete on library.book_library_tags to authenticated;
grant insert (book_id, household_id, tag_id) on library.book_library_tags to authenticated;
-- book_tags keeps its select and delete grants.
grant insert (book_id, household_id, tag_id) on library.book_tags to authenticated;

-- See the header of 20261103000000_library-schema.sql: every new function
-- must revoke the default PUBLIC execute.
revoke execute on function library.vocab_version(uuid)                     from public, anon;
revoke execute on function library.is_active_library_tag(uuid, text)       from public, anon;
revoke execute on function library.add_library_tag(uuid, text, text, text) from public, anon;
revoke execute on function library.record_tag_removal()                    from public, anon, authenticated;
revoke execute on function library.clear_tag_removal()                     from public, anon, authenticated;

grant execute on function library.vocab_version(uuid)                      to authenticated;
grant execute on function library.is_active_library_tag(uuid, text)        to authenticated;
grant execute on function library.add_library_tag(uuid, text, text, text)  to authenticated;

comment on table library.library_tags is
  'Library-tag vocabulary. household_id null is the shared starting list. Members read; additions go through add_library_tag.';
comment on table library.tag_removals is
  'Tags removed by hand, per book and kind (tos or library). Written by the delete triggers; the tagger never re-adds a recorded tag.';
