-- Two more cover motifs for the shared library vocabulary (follow-up to
-- 20261114120000_library-cover-motifs.sql).
--
-- Adds cover-jewelry (jewellery, gems, rings, necklaces) and cover-food-drink
-- (food, drinks, cups, bottles, fruit, cakes, place settings) as shared
-- cover-motif tags (household_id null), labels by the seed convention: the
-- cover- prefix dropped, hyphens to spaces, sentence case. A crown keeps
-- cover-crown; a jewelled crown may get both.
--
-- added_version is 1 and vocab_version is NOT bumped, for the same reason as
-- the previous cover-motif migration: full jobs already send the whole active
-- vocabulary, and a new_tags job sends no image, so it can't add cover tags.
--
-- A household row with one of these ids is left untouched (on conflict do
-- nothing against (household_id, id); the tagger dedupes by id).
--
-- tag_reserve_micro() is unchanged: with 578 vocabulary ids (400 household +
-- 178 shared) and the longer prompt, ceilingMicro is 70,711, still under the
-- 71,000 reservation (checked 2026-11-13).
--
-- Idempotent: safe to re-run.

insert into library.library_tags (household_id, id, label, category, added_version)
select null, v.id, v.label, 'cover-motif', 1
  from (values
  ('cover-jewelry', 'Jewelry'),
  ('cover-food-drink', 'Food drink')
  ) as v (id, label)
on conflict (household_id, id) do nothing;
