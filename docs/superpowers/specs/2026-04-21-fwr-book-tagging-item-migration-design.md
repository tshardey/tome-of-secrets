# ADR-003 Book Tagging & Item Migration Design

**Bead:** tome-of-secrets-fwr  
**Date:** 2026-04-21  
**Goal:** Introduce a book tagging system that lets the modifier pipeline auto-apply item effects at quest completion, replacing manual item selection and the legacy `rewardModifier` code paths.

**Architecture:** Add a `tags` field to the book data model with a defined vocabulary of ~22 genre and content tags. Extend `ModifierPipeline` with a `tagMatch` condition type using disjunctive normal form (OR of AND-groups). Migrate all 30 eligible items from `rewardModifier`/`passiveRewardModifier` to `effects` arrays with `tagMatch` and/or `pageCount` conditions. Remove legacy modifier code paths from RewardCalculator, RestorationController, and BuffController.

---

## 1. Book Tags

### Data Model

Add `tags: string[]` to the book object in character state. The field stores zero or more tag IDs from a fixed vocabulary.

```json
{
  "id": "abc-123",
  "title": "The Name of the Wind",
  "author": "Patrick Rothfuss",
  "tags": ["fantasy", "magic-system", "series"],
  "status": "completed",
  "pageCount": 662
}
```

Existing books without a `tags` field receive `tags: []` on load via `dataValidator`. No destructive migration is needed — untagged books simply do not trigger tag-based effects, which matches current behavior (player never "applied" items to those books).

### Tag Vocabulary

Players multi-select from a fixed list when adding or editing a book. Two categories:

**Genre tags:**

| Tag ID                 | Display Label          |
| ---------------------- | ---------------------- |
| `fantasy`              | Fantasy                |
| `romance`              | Romance                |
| `sci-fi`               | Sci-Fi                 |
| `mystery`              | Mystery                |
| `horror`               | Horror                 |
| `literary-fiction`      | Literary Fiction       |
| `contemporary-fiction`  | Contemporary Fiction   |
| `non-fiction`           | Non-Fiction            |
| `classics`             | Classics               |

**Content tags:**

| Tag ID                   | Display Label                  |
| ------------------------ | ------------------------------ |
| `series`                 | Part of a Series               |
| `dragons`                | Dragons / Legendary Creatures  |
| `fae`                    | Fae / Faerie                   |
| `nature-magic`           | Nature Magic / Plants          |
| `magic-system`           | Magic Systems                  |
| `multiple-pov`           | Multiple POV / Narrators       |
| `non-linear-narrative`   | Non-Linear Narrative           |
| `technology`             | Robots / AI / Technology       |
| `social`                 | Social Gatherings / Events     |
| `philosophical`          | Faith / Philosophy / Spirituality |
| `dark`                   | Dark Themes                    |
| `new-author`             | New-to-You Author              |
| `celestial`              | Celestial Motifs               |
| `unlocked`               | Unlocking / Discovery          |

### UI

- **Book add form** (`_includes/character-sheet/tabs/library.html`): Add a multi-select tag picker after the existing form fields. Checkbox group or similar compact multi-select.
- **Book edit drawer** (`_includes/character-sheet/drawers/book-edit.html`): Same tag picker, pre-populated with the book's current tags.
- Tags are optional — a book with no tags is valid.

---

## 2. `tagMatch` Condition Type

### Schema

A new condition field in the effect schema, using disjunctive normal form (DNF): an array of AND-groups, where any group matching is sufficient.

```json
{
  "trigger": "ON_QUEST_COMPLETED",
  "condition": {
    "tagMatch": [["romance"], ["contemporary-fiction", "social"]]
  },
  "modifier": { "type": "ADD_FLAT", "resource": "inkDrops", "value": 10 }
}
```

Evaluation: for each AND-group, check that the book has *all* tags in the group. If *any* group passes, the condition is met.

```text
tagMatch: [["romance"], ["contemporary-fiction", "social"]]
  => book has "romance"? YES => condition met
  OR book has "contemporary-fiction" AND "social"? => condition met
```

### Implementation

Add `tagMatch` evaluation to `ModifierPipeline.evaluateCondition()` alongside the existing `hasTag`, `pageCount`, and `questType` checks. The existing `hasTag` condition (simple OR) remains for backwards compatibility with already-migrated items like the Prophet background.

### TriggerPayload

`TriggerPayload.questCompleted()` already accepts a `tags` array. The book completion flow needs to pass `book.tags` into the payload when building the trigger. This happens in the quest completion cascade in `stateAdapter.markBookComplete()` / `QuestController.handleCompleteQuest()`.

---

## 3. Item Data Migration

### Scope

30 items migrate from `rewardModifier`/`passiveRewardModifier` to `effects` arrays:

- **24 tag-based items** — get `tagMatch` conditions
- **3 page-condition items** — get `pageCount` conditions (Bookwyrm's Scale, Tome of Potential, Page Sprite)
- **3 hybrid items** — already have `effects`; remove duplicate `rewardModifier` (Librarian's Quill, Golden Pen, Celestial Koi Fish)

### Out of Scope

These items are **not migrated** — they are atmospheric/context items with a completely different workflow:

- Gilded Painting (reading location)
- Garden Gnome (reading location)
- Mystical Moth (reading location)
- Coffee Elemental (reading context)
- Scatter Brain Scarab (reading multiple books)
- Tome-Bound Cat (atmospheric buff multiplier)

### Effect Structure Per Item

Each item gets two effects: one for the equipped slot (full bonus) and one for passive slots (reduced bonus). Example for Pocket Dragon:

```json
"Pocket Dragon": {
  "effects": [
    {
      "trigger": "ON_QUEST_COMPLETED",
      "condition": { "tagMatch": [["fantasy", "series"]] },
      "modifier": { "type": "ADD_FLAT", "resource": "inkDrops", "value": 20 },
      "slot": "equipped",
      "description": "Earn a +20 Ink Drop bonus for books in a fantasy series."
    },
    {
      "trigger": "ON_QUEST_COMPLETED",
      "condition": { "tagMatch": [["fantasy", "series"]] },
      "modifier": { "type": "ADD_FLAT", "resource": "inkDrops", "value": 10 },
      "slot": "passive",
      "description": "Fantasy series books grant +10 Ink Drops (passive)."
    }
  ]
}
```

The `slot` field is new — it tells `EffectRegistry` whether to include this effect based on the item's current slot (equipped vs. passive). Items without a `slot` field fire regardless (backwards compatible with existing effects).

### Complete Item-to-Condition Mapping

| Item                         | tagMatch                                            | pageCount | Resources                                              |
| ---------------------------- | --------------------------------------------------- | --------- | ------------------------------------------------------ |
| Librarian's Compass          | `[["new-author"]]`                                  | —         | +20/+10 inkDrops                                       |
| Amulet of Duality            | `[["multiple-pov"]]`                                | —         | +15/+7 inkDrops                                        |
| Cloak of the Story-Weaver    | `[["series"]]`                                      | —         | +10/+5 inkDrops                                        |
| Blood Fury Tattoo            | `[["series"]]`                                      | —         | +15/+7 inkDrops                                        |
| The Bookwyrm's Scale         | —                                                   | min: 500  | +10/+5 inkDrops                                        |
| Key of the Archive           | `[["unlocked"]]`                                    | —         | +15/+7 inkDrops                                        |
| Tome of Potential            | —                                                   | min: 400  | x3/x1.5 inkDrops                                       |
| Pocket Dragon                | `[["fantasy", "series"]]`                           | —         | +20/+10 inkDrops                                       |
| Page Sprite                  | —                                                   | max: 299  | x2/x1.5 inkDrops                                       |
| Crystal Sprite               | `[["literary-fiction"]]`                             | —         | +15/+7 paperScraps                                     |
| Reading Glasses              | `[["non-fiction"]]`                                  | —         | +20/+10 xp                                             |
| Baby Hollyphant              | `[["philosophical"]]`                                | —         | +15 xp +5 paper / +7 xp                                |
| Lab Assistant Automaton      | `[["technology"]]`                                   | —         | +15/+7 inkDrops                                        |
| Temporal Sprite              | `[["non-linear-narrative"]]`                         | —         | +20/+10 inkDrops                                       |
| Ingredient Sprite            | `[["magic-system"]]`                                 | —         | +15/+7 inkDrops                                        |
| Herb Dragon                  | `[["nature-magic"]]`                                 | —         | +15/+7 inkDrops                                        |
| Dancing Shoes                | `[["romance"], ["contemporary-fiction", "social"]]`  | —         | +10 ink +5 paper / +5 ink                               |
| Dragon Fang                  | `[["dragons"]]`                                      | —         | +20/+10 inkDrops                                       |
| Romance Reader's Ribbon      | `[["romance"]]`                                      | —         | +15/+7 inkDrops                                        |
| Star Navigator's Chart       | `[["sci-fi"]]`                                       | —         | +15/+7 inkDrops                                        |
| Fae-Touched Crystal          | `[["fantasy", "fae"]]`                               | —         | +15/+7 inkDrops                                        |
| Warding Candle               | `[["horror"], ["fantasy", "dark"]]`                  | —         | +15/+7 inkDrops                                        |
| Literary Medallion           | `[["classics"], ["literary-fiction"]]`                | —         | +20/+10 xp                                             |
| Detective's Magnifying Glass | `[["mystery"]]`                                      | —         | +15/+7 inkDrops                                        |
| Librarian's Quill (hybrid)   | —                                                   | —         | +2/+1 paperScraps (ON_JOURNAL_ENTRY, already migrated)  |
| Golden Pen (hybrid)          | —                                                   | —         | +10/+5 paperScraps (ON_JOURNAL_ENTRY, already migrated) |
| Celestial Koi Fish (hybrid)  | `[["celestial"]]`                                    | —         | +10/+5 xp (already has effects, remove rewardModifier)  |

---

## 4. Quest Completion Flow Changes

### Current Flow

1. Player completes a quest
2. Player manually selects which equipped/passive items to apply
3. `RewardCalculator` reads `rewardModifier`/`passiveRewardModifier` from selected items
4. Rewards calculated, receipt stored on quest in `completedQuests`

### New Flow

1. Player completes a book in the library (book has tags)
2. Book completion triggers quest completion cascade
3. `ModifierPipeline.resolve()` runs with `ON_QUEST_COMPLETED` trigger, book tags in payload
4. Pipeline auto-applies all matching item effects (based on `tagMatch` and `pageCount` conditions, filtered by equipped/passive slot)
5. Receipt stored on quest — UI shows which items fired and why

The player no longer manually picks items. The pipeline determines applicability from book tags.

### Display

The quest completion UI and archived quest view continue to show which items were applied, sourced from the pipeline receipt. The display format stays the same; only the source of truth changes (pipeline receipt instead of manual selection).

---

## 5. Legacy Code Removal

Once all 30 items have `effects` arrays, the following legacy code paths are removed:

### RewardCalculator.js

- `_getModifier()` — the branch that reads `rewardModifier`/`passiveRewardModifier` and checks `pageCondition`
- `_collectBuffCardPipelineEffects()` — the item modifier branch (background skip fence stays if needed, but backgrounds are already on effects)
- `_modifierToBuffCardEffects()` — converts legacy modifier shapes to buff card format
- `_applyFamiliarStateLoadModifiers()` — familiar-specific modifier adjustments

### RestorationController.js

- `calculatePassiveBonuses()` — manual iteration over passive item/familiar slots reading `passiveRewardModifier`
- `applyPassiveModifier()` — per-resource-field modifier application (`if (modifier.inkDrops)...` repeated for each resource)

Passive bonuses instead come from `ModifierPipeline.resolve()` with the appropriate trigger, filtered by `slot: "passive"`.

### BuffController.js

- The `rewardModifier` read block (lines 176-192) for one-time buff application — only if any non-atmospheric temporary buffs use `rewardModifier`. Atmospheric buffs are out of scope.

### Item Data

- Remove `rewardModifier`, `passiveRewardModifier`, `pageCondition`, `passivePageCondition` fields from all 30 migrated items in `allItems.json`

---

## 6. EffectRegistry Slot Filtering

### New Behavior

`EffectRegistry.getActiveEffects()` already queries equipped and passive item slots. It needs to be extended to respect the `slot` field on effects:

- Effects with `"slot": "equipped"` only fire for items in the equipped slot
- Effects with `"slot": "passive"` only fire for items in passive slots
- Effects with no `slot` field fire regardless (backwards compatible)

This replaces the current pattern where `RewardCalculator` checks which slot an item is in and then picks between `rewardModifier` and `passiveRewardModifier`.

---

## 7. Backwards Compatibility

### Archived Quests

Completed quests store `buffs[]` (item names) and `receipt` (full reward breakdown) as frozen snapshots. These are never re-derived. The migration does not touch them — archived quest display works unchanged.

### In-Progress Quests

A small number of active quests may have pre-selected items in their `buffs[]` array. These can be handled manually by the player after the migration. No automated migration is needed.

### Untagged Books

Books without tags (`tags: []`) do not trigger any `tagMatch` conditions. This matches current behavior — if the player didn't manually select items for a book before, they won't auto-apply now. Players can retroactively tag books via the edit drawer to start receiving item bonuses.

### Schema Version

Increment the schema version. The `dataMigrator` adds `tags: []` to all existing books that lack the field.

---

## 8. Testing Strategy

### Data Contracts (`dataContracts.test.js`)

- Validate every item in `allItems.json` has either an `effects` array or is in the known atmospheric/context exclusion list
- Validate `tagMatch` conditions use only tags from the defined vocabulary
- Validate `slot` field values are `"equipped"` or `"passive"`

### Pipeline Integration (`realDataIntegration.test.js`)

- Test `tagMatch` DNF evaluation: single tag, multiple tags (AND), multiple groups (OR)
- Test real item effects with matching and non-matching tag sets
- Test `pageCount` conditions continue to work
- Test `slot` filtering: same item produces different bonuses in equipped vs. passive

### Reward Regression

- For each migrated item, verify the pipeline produces the same reward values as the old `rewardModifier` path
- Test with the same inputs (page count, tags) to confirm parity

### Tag UI

- Manual testing: tag picker on add form and edit drawer
- Verify tags persist on book object through save/load cycle
- Verify tags pass through to `TriggerPayload` at book completion

---

## 9. Out of Scope

- **Atmospheric/context items** (6 items) — different workflow, not book-tag-driven
- **Temporary buffs** — separate system with its own application flow
- **Auto-tagging from quests** — quests could imply genre, but manual tagging is sufficient
- **Tag search/filtering in library** — useful future feature but not required for this migration
- **ACTIVATE effects** — activation/cooldown mechanics are unchanged by this work
