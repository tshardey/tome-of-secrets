---
name: TCG Modifier Pipeline Refactor
overview: Refactor the reward system into a data-driven TCG-style modifier pipeline where items, backgrounds, schools, and mastery abilities declare structured effects that auto-apply through a centralized event-driven system, replacing scattered hardcoded logic.
todos:
  - id: phase-1-schema
    content: "Phase 1: Define effect schema, create ModifierPipeline + EffectRegistry + TriggerPayload services, add effects arrays to backgrounds/schools/abilities JSON, write pipeline tests"
    status: pending
  - id: phase-2-quest-complete
    content: "Phase 2: Wire ON_QUEST_COMPLETED trigger -- auto-apply background/school/mastery effects, replace hardcoded Biblioslinker/Enchantment logic, update BaseQuestHandler"
    status: pending
  - id: phase-3-month-end
    content: "Phase 3: Wire ON_MONTH_END + ON_JOURNAL_ENTRY -- worn page prevention, journal rewards through pipeline, atmospheric buff calculation"
    status: pending
  - id: phase-4-draft-start
    content: "Phase 4: Wire ON_QUEST_DRAFTED (Cartographer) + ON_MONTH_START (Divination, quest pool mods, atmospheric generation)"
    status: pending
  - id: phase-5-permanent-activate
    content: "Phase 5: Wire permanent effects (slot unlocks, UI) and activated abilities (Evocation, Scepter, Transmutation) with cooldown tracking"
    status: pending
  - id: phase-6-content
    content: "Phase 6: Apply content updates from audit -- update item/ability descriptions and effects for Cartographer, Evocation, Enchantment, Conjuration, Librarian's Quill, Scepter, Celestial Koi Fish, mastery abilities"
    status: pending
isProject: false
---

# TCG Modifier Pipeline Refactor

## Problem Statement

The current reward system has three structural issues:

1. **Scattered hardcoded logic** - Backgrounds (only Biblioslinker), schools (only Enchantment), and mastery abilities (none) have hardcoded branches in `RewardCalculator.js`. Adding a new effect means writing new code in multiple files.
2. **Manual-only application** - Most buffs require the player to manually select them via buff cards. Effects like background bonuses, school bonuses, and mastery abilities that should auto-apply based on game context simply don't apply.
3. **No structured data** - `keeperBackgrounds.json`, `schoolBenefits.json`, and `masteryAbilities.json` only contain prose descriptions. The code can't programmatically determine what they do.

## Architecture: The Modifier Pipeline

### Key Insight

Not all effects can be auto-calculated. Many items are intentionally subjective ("books with beautiful prose", "books with dragons"). The player decides when those apply via the existing buff card UI. The pipeline must handle BOTH auto-apply effects (deterministic, based on quest context) AND player-selected effects (subjective, via buff cards).

### The Effect Schema

Every background, school, mastery ability, and (where applicable) item will gain a structured `effects` array:

```json
{
  "effects": [
    {
      "trigger": "ON_QUEST_COMPLETED",
      "condition": {
        "questType": "dungeon_crawl",
        "encounterAction": "befriend"
      },
      "modifier": {
        "type": "MULTIPLY",
        "resource": "xp",
        "value": 1.5
      }
    }
  ]
}
```

**Modifier types:** `ADD_FLAT`, `MULTIPLY`, `PREVENT`, `GRANT_RESOURCE`, `UNLOCK_SLOT`, `ACTIVATE` (cooldown-based)

**Triggers:** `ON_QUEST_COMPLETED`, `ON_QUEST_DRAFTED`, `ON_MONTH_END`, `ON_MONTH_START`, `ON_JOURNAL_ENTRY`, `ON_BOOK_COMPLETED`, `ON_STATE_LOAD`, `ON_ACTIVATE`

**Conditions (for auto-apply):** `questType`, `encounterType`, `encounterAction`, `hasTag`, `genre`, `pageCount`, `isNewAuthor`, etc.

### Resolution Order (The Stack)

When a trigger fires, modifiers resolve in this order:

1. **Base value** - default reward for the action
2. **Flat additions** (`ADD_FLAT`) - all flat bonuses summed
3. **Multipliers** (`MULTIPLY`) - applied to the running total
4. **Overrides/Prevents** (`PREVENT`) - can cancel effects entirely

This matches the existing `RewardCalculator.applyModifiers` pattern (flat then multiplier) but formalizes it.

### New Files

- `assets/js/services/ModifierPipeline.js` - Core engine: collects active cards, filters by trigger, evaluates conditions, applies modifiers in resolution order, returns `Reward` with receipt
- `assets/js/services/EffectRegistry.js` - Gathers all active "cards" (equipped items, background, school, learned abilities, active temp buffs) and their effects from data
- `assets/js/services/TriggerPayload.js` - Standardized payload objects for each trigger type (quest context, month context, etc.)

### Integration Strategy

The pipeline wraps around (not replaces) the existing `RewardCalculator`. We keep `Reward` class and receipts. The pipeline calls `RewardCalculator.getBaseRewards()` for base values, then applies auto-apply effects from the registry, then merges player-selected buff card effects, all through the same resolution order.

```
getBaseRewards() --> auto-apply effects --> player-selected buffs --> background --> school --> mastery
                    (from EffectRegistry)   (from buff cards UI)     (auto if has effects data)
```

Existing `calculateFinalRewards` in `RewardCalculator.js` becomes a thin wrapper that delegates to the pipeline.

## Phased Implementation

### Phase 1: Foundation (no behavior changes)

- Define the effect schema as a JS module with validation
- Create `ModifierPipeline.js` and `EffectRegistry.js`
- Add `effects` arrays to `keeperBackgrounds.json`, `schoolBenefits.json`, `masteryAbilities.json`
- Keep existing `rewardModifier` / `passiveRewardModifier` fields on items (backward compat)
- Write comprehensive tests for the pipeline in isolation
- Run `generate-data.js`, verify all existing tests still pass

### Phase 2: Wire ON_QUEST_COMPLETED

This is the most impactful trigger (covers ~35 of the audited items).

- Create `QuestCompletedPayload` with quest type, encounter info, genre, page count, etc.
- `EffectRegistry` gathers: equipped items, passive items, background, school, learned abilities, active temp buffs
- Pipeline auto-applies: Enchantment 1.5x XP, Biblioslinker dungeon bonus, Silver Tongue side quest bonus, Conjuration familiar slot ink bonus, Alchemic Focus extra credit XP
- Player-selected buff cards continue to work for subjective items (Librarian's Compass, Dragon Fang, etc.)
- Remove hardcoded `applyBackgroundBonuses` and `applySchoolBonuses` from `RewardCalculator` (replaced by pipeline)
- Update `BaseQuestHandler.completeActiveQuest` to use pipeline
- Existing test suite must pass; add new tests for auto-apply behaviors

### Phase 3: Wire ON_MONTH_END and ON_JOURNAL_ENTRY

- Abjuration / Ward Against the Shroud / Raven Familiar / Chalice: PREVENT worn page
- Scribe's Acolyte + Librarian's Quill + Golden Pen: journal entry paper scraps
- Atmospheric buff ink calculation stays similar but runs through pipeline
- Remove hardcoded scribe bonus from `calculateJournalEntryRewards`

### Phase 4: Wire ON_QUEST_DRAFTED and ON_MONTH_START

- Cartographer's Guild: GRANT_RESOURCE on dungeon quest drafted
- Divination / Lantern of Foresight / Flicker of Prophecy / Master of Fates: modify quest pool draws
- Grove Tender / Gilded Painting / Garden Gnome / Mystical Moth: atmospheric buff generation

### Phase 5: Wire Permanent and Activated Abilities

- Conjuration extra familiar slot, Echo Chamber extra slot: UNLOCK_SLOT on state load
- Transmutation UI, Philosopher's Stone: ACTIVATE with monthly cooldown
- Evocation / Quick Shot / Concussive Blast: ACTIVATE with cooldown
- Scepter of Knowledge, Irresistible Charm: ACTIVATE with cooldown
- Empowered Bond familiar bonus doubling: modifier on state load

### Phase 6: Content Updates

Apply the specific game design updates from the audit:

- **Cartographer's Guild**: "For each dungeon room card you add to your active quests gain 15 ink drops" (update `keeperBackgrounds.json` description + effects)
- **Evocation**: "Once per month you may use one book to complete two quests, regardless of prompt" (update `schoolBenefits.json`)
- **Enchantment**: "When you face a monster in a dungeon, you earn 1.5x XP" (update condition -- currently befriend-only, change to any monster encounter)
- **Conjuration**: "Gain an additional familiar slot" (update description)
- **Librarian's Quill**: "+2 paper scraps for each journal entry" (update `allItems.json` + add ON_JOURNAL_ENTRY effect)
- **Scepter of Knowledge**: "Once per month ignore prompt and read non-fiction" (update description + add ACTIVATE effect)
- **Celestial Koi Fish**: "+10 XP for celestial motif / night sky cover" (add ON_QUEST_COMPLETED effect with condition)
- **Mastery abilities**: Update Flicker of Prophecy, Master of Fates, Quick Shot, Concussive Blast, Silver Tongue, Irresistible Charm, Echo Chamber per audit descriptions

## Key Design Decisions

1. **Backward compatible** - Existing `rewardModifier` / `passiveRewardModifier` on items stay. The pipeline reads them alongside new `effects` arrays. Items without `effects` work exactly as before via buff cards.
2. **Subjective items stay manual** - Items like "Librarian's Compass" (+20 Ink Drops for new-to-you author) remain player-selected via buff cards. Only items with deterministic conditions (quest type, page count, equipped state) get `autoApply` effects.
3. **Existing `Reward` class preserved** - Receipt system and `toJSON()` stay identical. Pipeline just produces `Reward` objects.
4. **Tests gate every phase** - No phase merges without `npm test` passing. Each phase adds new tests for new behaviors.
5. **Data files are source of truth** - All effect definitions live in JSON under `assets/data/`. Run `generate-data.js` after any JSON change. No effect logic in JavaScript files except the generic pipeline engine.

## Files Modified Per Phase

**Phase 1:** New `ModifierPipeline.js`, `EffectRegistry.js`, `TriggerPayload.js`. Modified: `keeperBackgrounds.json`, `schoolBenefits.json`, `masteryAbilities.json`, `generate-data.js`, `data.js`. New test files.

**Phase 2:** Modified: `RewardCalculator.js` (slim down), `BaseQuestHandler.js`, `QuestController.js`, `character-sheet.js` (pass pipeline to dependencies). Modified tests: `RewardCalculator.test.js`, `RewardCalculatorReceipts.test.js`.

**Phase 3:** Modified: `EndOfMonthController.js`, `CurseController.js` (worn page). Modified: `RewardCalculator.js` (remove journal/atmospheric helpers or delegate).

**Phase 4:** Modified: `QuestController.js` (quest draft hook), deck controllers (quest pool modification).

**Phase 5:** Modified: `InventoryController.js` (slot unlocks), `CharacterController.js` (state load effects). New: cooldown tracking in state.

**Phase 6:** Modified: `allItems.json`, `keeperBackgrounds.json`, `schoolBenefits.json`, `masteryAbilities.json`, various content files.