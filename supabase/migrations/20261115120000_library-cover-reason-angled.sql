-- A fifth cover reason: "angled" (Angled or shows edges), for a current cover
-- that is a photo of the physical book showing its edges.
alter table library.cover_marks drop constraint if exists cover_marks_reasons_check;
alter table library.cover_marks add constraint cover_marks_reasons_check
  check (reasons <@ array['wrong_language', 'placeholder', 'wrong_book', 'low_quality', 'angled']::text[]);

alter table library.cover_searches drop constraint if exists cover_searches_reasons_check;
alter table library.cover_searches add constraint cover_searches_reasons_check
  check (reasons <@ array['wrong_language', 'placeholder', 'wrong_book', 'low_quality', 'angled']::text[]);
