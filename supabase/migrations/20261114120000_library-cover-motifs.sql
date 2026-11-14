-- More cover motifs for the shared library vocabulary (Plan 7 follow-up).
--
-- The 15 starting cover-motif tags were too broad (a wolf and a teacup both
-- landed on "Animal" or "Illustrated"). This adds 32 shared, more specific
-- cover-motif tags (household_id null), labels by the seed convention: the
-- cover- prefix dropped, hyphens to spaces, sentence case. The tagger prompt
-- is told to prefer the specific tag over the broad one.
--
-- added_version is 1 and vocab_version is NOT bumped, on purpose. Full jobs
-- already send the whole active vocabulary, so Retag picks these up. A
-- new_tags job sends no image and the tagger drops every cover-* tag without
-- one, so a bump would only invite a "Check for new tags" pass that can't add
-- cover tags.
--
-- A household may already own a tag with one of these ids (e.g. an approved
-- suggestion). Those rows are left untouched: the insert is on conflict do
-- nothing against (household_id, id), and a household row never conflicts
-- with a shared one. The tagger dedupes the claim's vocabulary by id.
--
-- Idempotent: safe to re-run.

insert into library.library_tags (household_id, id, label, category, added_version)
select null, v.id, v.label, 'cover-motif', 1
  from (values
  ('cover-celestial', 'Celestial'),
  ('cover-creature', 'Creature'),
  ('cover-architectural', 'Architectural'),
  ('cover-collage', 'Collage'),
  ('cover-instrument', 'Instrument'),
  ('cover-minimalist', 'Minimalist'),
  ('cover-sculpture', 'Sculpture'),
  ('cover-sky', 'Sky'),
  ('cover-historical', 'Historical'),
  ('cover-photo-realistic', 'Photo realistic'),
  ('cover-abstract', 'Abstract'),
  ('cover-sword', 'Sword'),
  ('cover-dragon', 'Dragon'),
  ('cover-crown', 'Crown'),
  ('cover-castle', 'Castle'),
  ('cover-ship', 'Ship'),
  ('cover-city-skyline', 'City skyline'),
  ('cover-tree', 'Tree'),
  ('cover-eye', 'Eye'),
  ('cover-hand', 'Hand'),
  ('cover-mask', 'Mask'),
  ('cover-bird', 'Bird'),
  ('cover-wolf', 'Wolf'),
  ('cover-cat', 'Cat'),
  ('cover-fire', 'Fire'),
  ('cover-water-waves', 'Water waves'),
  ('cover-map', 'Map'),
  ('cover-stairs', 'Stairs'),
  ('cover-flowers', 'Flowers'),
  ('cover-silhouette', 'Silhouette'),
  ('cover-typography-only', 'Typography only'),
  ('cover-couple', 'Couple')
  ) as v (id, label)
on conflict (household_id, id) do nothing;

-- The tagger's per-call ceiling grew with the larger vocabulary cap
-- (400 household + 176 shared = 576 ids; ceilingMicro 70,509). The reservation
-- is the ceiling rounded up to 1,000 (library-tagger TAG_RESERVE_MICRO; was
-- 69000). Raised 2026-11-14.
create or replace function library.tag_reserve_micro()
returns int
language sql
immutable
set search_path = ''
as $$ select 71000 $$;
