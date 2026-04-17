# Bead 324: Modularize character-sheet.md — Drawer Extraction

## Goal

Extract all drawer and overlay HTML from `character-sheet.md` into individual Jekyll include files under `_includes/character-sheet/drawers/`. This reduces the file from ~1,447 lines to ~1,060 lines and makes each drawer independently editable.

## Scope

**In scope:** All overlay and drawer markup (lines ~1054–1434 of `character-sheet.md`).

**Out of scope:** Tab panel extraction — tracked separately in a follow-up bead.

## Approach

Simple Jekyll `{% include %}` extraction. Each drawer's backdrop + panel markup moves to its own file with no logic changes. The rendered HTML output is byte-identical before and after.

## Files to Create

All files under `_includes/character-sheet/drawers/`:

| File | Source lines | Description |
|------|-------------|-------------|
| `table-overlay.html` | 1054–1060 | Table overlay backdrop + panel |
| `leveling-rewards.html` | 1064–1085 | Leveling rewards backdrop + drawer |
| `school-mastery.html` | 1087–1101 | School mastery abilities backdrop + drawer |
| `keeper-backgrounds.html` | 1103–1117 | Keeper backgrounds backdrop + drawer |
| `wizard-schools.html` | 1119–1133 | Wizard/magical schools backdrop + drawer |
| `library-sanctums.html` | 1135–1149 | Library sanctums backdrop + drawer |
| `genre-quests.html` | 1151–1178 | Genre quests info backdrop + drawer |
| `atmospheric-buffs.html` | 1180–1204 | Atmospheric buffs info backdrop + drawer |
| `side-quests.html` | 1206–1231 | Side quests info backdrop + drawer |
| `dungeons.html` | 1233–1271 | Dungeons info backdrop + drawer |
| `book-edit.html` | 1273–1354 | Book edit backdrop + drawer |
| `quest-edit.html` | 1356–1434 | Quest edit backdrop + drawer |

## Changes to character-sheet.md

The entire overlay/drawer block (lines ~1054–1434) is replaced with:

```liquid
<!-- Overlay & Drawer Panels -->
{% include character-sheet/drawers/table-overlay.html %}
{% include character-sheet/drawers/leveling-rewards.html %}
{% include character-sheet/drawers/school-mastery.html %}
{% include character-sheet/drawers/keeper-backgrounds.html %}
{% include character-sheet/drawers/wizard-schools.html %}
{% include character-sheet/drawers/library-sanctums.html %}
{% include character-sheet/drawers/genre-quests.html %}
{% include character-sheet/drawers/atmospheric-buffs.html %}
{% include character-sheet/drawers/side-quests.html %}
{% include character-sheet/drawers/dungeons.html %}
{% include character-sheet/drawers/book-edit.html %}
{% include character-sheet/drawers/quest-edit.html %}
```

## What Doesn't Change

- **No JS changes** — all element IDs remain identical
- **No CSS changes** — all class names remain identical
- **No behavioral changes** — rendered HTML is byte-identical
- **No Liquid logic changes** — the `site.baseurl` and `site.images_cdn_base` references in the dungeons drawer continue to work inside includes

## Verification

1. Run Jekyll build — no errors
2. Run existing test suite — all pass
3. Diff rendered `character-sheet.html` before and after — byte-identical
