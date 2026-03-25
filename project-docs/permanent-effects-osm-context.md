# Permanent Effects Audit and Execution Context

## Scope

This document captures the current audit and implementation guidance for `tome-of-secrets-osm`:

- Parent bead: `tome-of-secrets-osm` - Permanent buffs and class abilities: calculate and apply as appropriate
- Child beads:
  - `tome-of-secrets-osm.1` - Model permanent effects as structured capabilities
  - `tome-of-secrets-osm.2` - Auto-apply deterministic permanent reward modifiers
  - `tome-of-secrets-osm.3` - Apply expedition passive bonuses mechanically
  - `tome-of-secrets-osm.4` - Extend helper UX for monthly permanent interventions
  - `tome-of-secrets-osm.5` - Design workflow support for dungeon and monthly-action abilities

Dependency shape:

- `tome-of-secrets-osm.2` depends on `tome-of-secrets-osm.1`
- `tome-of-secrets-osm.3` depends on `tome-of-secrets-osm.1`
- `tome-of-secrets-osm.4` depends on `tome-of-secrets-osm.1`
- `tome-of-secrets-osm.5` depends on `tome-of-secrets-osm.1`

The main goal is to close the gap between permanent effects that are shown in the UI and permanent effects that are actually enforced in gameplay.

## Why this work exists

Today the character sheet has three different behaviors for "permanent" effects:

1. Some effects are mechanically enforced.
2. Some effects are shown only as helper rows that the player must track manually.
3. Some effects are displayed in the Permanent Bonuses section but do not affect any game logic.

This causes drift between the rules text, the helper panels, and actual reward/state calculations.

## Canonical data sources

These are the permanent-effect sources that matter for `tome-of-secrets-osm`.

### Level-based permanent effects

- `assets/data/permanentBonuses.json`
- `assets/data/levelRewards.json`
- `assets/data/xpLevels.json`

Notes:

- `permanentBonuses.json` contains prose/HTML rule text by level.
- `levelRewards.json` contains mechanical level-up rewards already applied by code.
- `xpLevels.json` is only the XP threshold table.

### School benefits

- `assets/data/schoolBenefits.json`

Notes:

- One selected school benefit is active at a time.
- Benefits are prose-based, not typed mechanics.

### Mastery abilities

- `assets/data/masteryAbilities.json`

Notes:

- Learned abilities are persisted in state, but most benefits are not consumed by gameplay logic.

### Series campaign / expedition rewards

- `assets/data/seriesCompletionRewards.json`

Notes:

- Typed rewards like `currency`, `item-slot-bonus`, and `familiar-slot-bonus` are partially applied.
- `passive-rule-modifier` rewards are mostly display-only.

## Generated and aggregate data entry points

- `assets/js/character-sheet/data.json-exports.js`
- `assets/js/character-sheet/data.js`

These are the generated/exported access points used by the app at runtime. Do not edit `data.json-exports.js` directly.

## Current mechanical behavior by area

### Already auto-applied

- Level-up currency, SMP, and inventory slot rewards from `assets/data/levelRewards.json`
- School of Enchantment dungeon befriend XP multiplier in `assets/js/services/RewardCalculator.js`
- Expedition typed rewards:
  - `currency`
  - `item-slot-bonus`
  - `familiar-slot-bonus`

### Display-only or helper-only today

- `assets/data/permanentBonuses.json` entries are rendered in the Permanent Bonuses section
- Expedition `passive-rule-modifier` rewards are rendered in the Permanent Bonuses section
- Some school/ability/permanent effects are surfaced in quest-draw helpers
- Some school/ability/expedition effects are surfaced in curse helpers

### Important current gap

The app does not have a single typed permanent-effect resolver. Most mechanics still depend on prose text or are not implemented at all.

## Current code hook points

### Permanent bonus display

- `assets/js/viewModels/generalInfoViewModel.js`
- `assets/js/character-sheet/ui.js`
- `assets/js/controllers/CharacterController.js`
- `assets/js/controllers/CampaignsController.js`
- `assets/js/services/SeriesCompletionService.js`

### Quest-draw helpers

- `assets/js/character-sheet/questDrawHelperDiscovery.js`
- `assets/js/character-sheet/stateAdapter.js`
- `assets/js/controllers/QuestController.js`
- `assets/js/controllers/EndOfMonthController.js`
- `assets/js/character-sheet/renderComponents.js`

### Curse / Worn Page helpers

- `assets/js/character-sheet/curseHelperDiscovery.js`
- `assets/js/character-sheet/stateAdapter.js`
- `assets/js/controllers/CurseController.js`
- `assets/js/controllers/EndOfMonthController.js`

### Reward and completion math

- `assets/js/services/RewardCalculator.js`
- `assets/js/services/QuestService.js`
- `assets/js/quest-handlers/BaseQuestHandler.js`
- `assets/js/character-sheet.js`
- `assets/js/controllers/EndOfMonthController.js`

### Deck / workflow surfaces

- `assets/js/controllers/GenreQuestDeckController.js`
- `assets/js/controllers/AtmosphericBuffDeckController.js`
- `assets/js/controllers/QuestController.js`
- `assets/js/controllers/CurseController.js`

### Slot and familiar capacity

- `assets/js/services/SlotService.js`
- `assets/js/controllers/InventoryController.js`
- `assets/js/character-sheet/ui.js`

## Audit matrix

### Level-based permanent effects

| Source | Effect | Current status | Recommended handling | Likely hook points |
| --- | --- | --- | --- | --- |
| `permanentBonuses.json` level 3 | Atmospheric Forecaster | Displayed and surfaced as quest helper; not enforced | Helper/manual | `questDrawHelperDiscovery.js`, `ui.js`, maybe future atmospheric deck UX |
| `permanentBonuses.json` level 6 | Novice's Focus | Not applied | Auto-apply | `character-sheet.js`, `RewardCalculator.js`, library/book completion flow |
| `permanentBonuses.json` level 7 | Focused Atmosphere | Not applied | Auto-apply | `RewardCalculator.calculateAtmosphericBuffRewards()` |
| `permanentBonuses.json` level 9 | Insightful Draw | Displayed and surfaced as quest helper; not enforced | Helper/manual first, optional deck automation later | `questDrawHelperDiscovery.js`, `GenreQuestDeckController.js` |
| `levelRewards.json` | Ink, paper, SMP, inventory slot | Already applied | Keep auto-applied | `CharacterController.js` |

### School benefits

| Source | Effect | Current status | Recommended handling | Likely hook points |
| --- | --- | --- | --- | --- |
| `schoolBenefits.json` Abjuration | Replace Worn Page penalty with card draw/choice once per month | Helper/manual | Curse helper UX/state | `curseHelperDiscovery.js`, `CurseController.js`, `EndOfMonthController.js` |
| `schoolBenefits.json` Divination | Roll 2 dice for Monthly Quest once per month | Helper/manual | Quest helper UX/state | `questDrawHelperDiscovery.js`, `QuestController.js`, `EndOfMonthController.js` |
| `schoolBenefits.json` Evocation | Short story/novella substitution for dungeon monster once per month | Not applied | Workflow-specific design or implementation | Dungeon/quest resolution controllers |
| `schoolBenefits.json` Enchantment | 1.5x XP when befriending monster in dungeon | Already applied | Keep auto-applied | `RewardCalculator.applySchoolBonuses()` |
| `schoolBenefits.json` Conjuration | +5 Ink Drops when completing quest while Familiar slot is equipped | Not applied | Auto-apply | `RewardCalculator.js`, permanent-effect resolver |
| `schoolBenefits.json` Transmutation | Currency conversion once per month | Not applied | Workflow-specific design or implementation | New monthly action UI/state |

### Mastery abilities

| Source | Effect | Current status | Recommended handling | Likely hook points |
| --- | --- | --- | --- | --- |
| `masteryAbilities.json` Ward Against the Shroud | Negate one Worn Page penalty once per month | Helper/manual | Curse helper UX/state | `curseHelperDiscovery.js`, `CurseController.js` |
| `masteryAbilities.json` Grand Dispelling | Remove all active Worn Page penalties once per month | Helper/manual | Curse helper UX/state | `curseHelperDiscovery.js`, `CurseController.js` |
| `masteryAbilities.json` Flicker of Prophecy | Adjust Genre Quest d6 by +/-1 | Helper/manual | Quest helper UX/state | `questDrawHelperDiscovery.js`, future genre draw workflow |
| `masteryAbilities.json` Master of Fates | Draw two extra cards and choose final pool | Helper/manual | Quest helper UX/state | `questDrawHelperDiscovery.js`, possible future deck automation |
| `masteryAbilities.json` Quick Shot | Evocation applies to any dungeon room challenge | Not applied | Workflow-specific design or implementation | Dungeon resolution flow |
| `masteryAbilities.json` Concussive Blast | Evocation also completes second prompt in same room | Not applied | Workflow-specific design or implementation | Dungeon resolution flow |
| `masteryAbilities.json` Silver Tongue | +5 Paper Scraps on Side Quests | Not applied | Auto-apply | `RewardCalculator.js` |
| `masteryAbilities.json` Irresistible Charm | Auto-succeed at befriending monster once per month | Not applied | Workflow-specific design or implementation | Dungeon encounter UX/state |
| `masteryAbilities.json` Empowered Bond | Familiar bonus permanently increased by +5 | Not applied | Auto-apply | Familiar reward modifier logic |
| `masteryAbilities.json` Echo Chamber | Unlock additional Familiar slot | Not applied | Auto-apply | `SlotService.js`, loadout rendering |
| `masteryAbilities.json` Alchemic Focus | +5 XP for books read outside monthly quest pool | Not applied | Workflow-specific or book-completion-specific implementation | Book/library completion logic |
| `masteryAbilities.json` Philosopher's Stone | Sacrifice 50 XP for 50 Ink Drops and 10 Paper Scraps once per month | Not applied | Workflow-specific design or implementation | New monthly action UI/state |

### Series expedition rewards

| Source | Effect | Current status | Recommended handling | Likely hook points |
| --- | --- | --- | --- | --- |
| `seriesCompletionRewards.json` stop 2 | Organize the Stacks grants +20 XP instead of +15 | Display-only | Auto-apply | `RewardCalculator.getBaseRewards()` or derived modifier layer |
| `seriesCompletionRewards.json` stop 4 | +1 passive item slot | Already applied | Keep auto-applied | `SeriesCompletionService.js`, passive item slot state |
| `seriesCompletionRewards.json` stop 5 | Adventure Journal entries grant +10 Paper Scraps instead of +5 | Display-only | Auto-apply | `RewardCalculator.calculateJournalEntryRewards()` |
| `seriesCompletionRewards.json` stop 7 | Books read for a Series grant +15 Ink Drops instead of +10 | Display-only | Auto-apply | Book completion logic, series lookup in `stateAdapter.js` |
| `seriesCompletionRewards.json` stop 8 | Ignore any single Shroud penalty or Spoon loss once per month | Display-only today | Helper/manual | Curse helper or broader monthly helper UX |
| `seriesCompletionRewards.json` stop 10 | +1 familiar slot | Already applied | Keep auto-applied | `SeriesCompletionService.js`, passive familiar slot state |
| `seriesCompletionRewards.json` stop 10 bundled text | +10 XP for all Dungeon Rooms | Not applied | Auto-apply or normalize schema | `RewardCalculator.js`, expedition reward typing |

## Important observations

### The active quest bonus picker is not the right home for always-on effects

The card picker in `assets/js/character-sheet/ui.js` currently exists for manually selected quest modifiers such as:

- background bonuses that are optional/manual in practice
- temporary buffs
- equipped/passive items

Permanent class/school/level passives that are always on should not be forced through this picker. They should be resolved automatically and appear in receipts when they affect rewards.

### Helper panels are already a good fit for player-choice interventions

The helper systems are a strong fit for effects that are:

- once per month
- cancel/replace rather than add numeric rewards
- timing-sensitive
- player-choice based

That includes many Worn Page mitigations and quest draw interventions.

### Some effects need true workflow UI, not just reward math

These are not good candidates for raw reward modifiers:

- Evocation
- Quick Shot
- Concussive Blast
- Irresistible Charm
- Transmutation
- Philosopher's Stone
- possibly Alchemic Focus, depending on how "outside the monthly quest pool" is defined in current UX

## Recommended implementation order

### Phase 1 - foundation

Complete `tome-of-secrets-osm.1`.

Goal:

- Introduce a single typed permanent-effect resolver/service that derives the keeper's active capabilities from:
  - level
  - selected school
  - learned mastery abilities
  - series expedition progress

Expected shape:

- A module/service that returns structured flags/modifiers rather than prose.
- Enough detail to support:
  - reward deltas
  - slot bonuses
  - familiar bonus boosts
  - atmospheric modifiers
  - journal modifiers
  - book completion modifiers
  - helper/manual capabilities
  - workflow-only capabilities

### Phase 2 - deterministic auto-apply effects

Complete `tome-of-secrets-osm.2` and `tome-of-secrets-osm.3`.

Good first auto-applied targets:

- Novice's Focus
- Focused Atmosphere
- Conjuration
- Silver Tongue
- Empowered Bond
- Echo Chamber
- Organize the Stacks expedition bonus
- Adventure Journal expedition bonus
- Series book Ink Drop expedition bonus
- Dungeon Room XP expedition bonus

### Phase 3 - helper/manual coverage

Complete `tome-of-secrets-osm.4`.

Goal:

- Make sure every monthly manual intervention is either:
  - intentionally present in helper UX, or
  - explicitly documented as out of scope

### Phase 4 - workflow-specific ability design or implementation

Complete `tome-of-secrets-osm.5`.

Goal:

- Design or implement the remaining permanent abilities that require new buttons, new action flows, new state, or new dungeon-specific UX.

## Suggested architecture direction

Avoid adding more special-case text parsing to gameplay logic.

Preferred pattern:

1. Keep raw prose in the data files for display.
2. Add a structured derived layer for mechanics.
3. Let helper discovery continue to parse or map prose for UI only where necessary.
4. Let reward/state/slot workflows consume only the structured permanent-effect layer.

Potential service responsibilities:

- `getPermanentEffectState(characterState, formSelections)` or similar
- expose booleans such as:
  - `hasNovicesFocus`
  - `hasFocusedAtmosphere`
  - `hasEchoChamber`
  - `canUseAtmosphericForecaster`
- expose numeric modifiers such as:
  - `bookCompletionBonusXp`
  - `sideQuestBonusPaperScraps`
  - `questCompletionFamiliarInkBonus`
  - `familiarRewardBonus`
  - `organizeTheStacksXpOverride`
  - `dungeonRoomXpBonus`
  - `journalEntryPaperScrapOverride`
  - `seriesBookInkBonusOverride`

If the typed data grows large enough, consider normalizing expedition passive bonuses into explicit schema fields instead of relying on `reward.text`.

## Existing tests worth extending

- `tests/RewardCalculator.test.js`
- `tests/questDrawHelperDiscovery.test.js`
- `tests/viewModels/generalInfoViewModel.test.js`
- `tests/characterSheet.test.js`
- `tests/questHandlers.test.js`

Additional likely test targets:

- `SeriesCompletionService` reward application behavior
- slot calculation behavior when Echo Chamber is learned
- book completion reward logic when page count and series membership are present
- end-of-month atmospheric/journal reward calculations with permanent modifiers

## Specific implementation notes

### Book/page count data already exists

The app already tracks page count on books and can propagate page count into quests. That means long-book logic such as Novice's Focus should not require new data collection, only new plumbing.

Relevant places:

- `assets/js/controllers/LibraryController.js`
- `assets/js/quest-handlers/BaseQuestHandler.js`
- `assets/js/models/Quest.js`
- `assets/js/services/RewardCalculator.js`

### Series membership data already exists

Series tracking is already persisted in state and books can belong to a series.

Relevant places:

- `assets/js/character-sheet/stateAdapter.js`
- series lookup helpers such as `getSeriesForBook()` and expedition progress methods

This should be enough to implement series-book bonus logic without inventing a new storage model.

### Helper reset behavior already exists

Monthly helper reset and cleanup logic already lives in:

- `assets/js/controllers/EndOfMonthController.js`
- `assets/js/character-sheet/stateAdapter.js`

This should be reused rather than reinvented.

## Known naming and data notes

- Runtime code often calls expedition data `seriesExpedition` even though the data file/export is `seriesCompletionRewards`.
- `masteryAbilities.json` has a small punctuation typo in `Silver Tongue` (`..` at the end of the text).
- `Philosopher's Stone` uses slug `philosophers-stone` while the display name includes the apostrophe.

## Open design questions for the implementing agent

- Should expedition passive numeric bonuses remain prose-backed and be mapped in code, or should the JSON schema be expanded to represent them explicitly?
- Should helper/manual effects remain only in helper tables, or should some gain direct action buttons in the UI?
- How should Alchemic Focus define "outside of your monthly quest pool" in current book-completion flows:
  - book not linked to an active monthly quest
  - book completed from general library state
  - something else
- Should the stop 10 expedition reward be split into two typed rewards so the familiar-slot bonus and dungeon XP bonus are not coupled in one text blob?

## Recommended handoff summary

If you are the next agent picking this up:

1. Start with `tome-of-secrets-osm.1`.
2. Build the typed permanent-effect resolver before adding more one-off logic.
3. Implement deterministic numeric effects next.
4. Reuse helper infrastructure for monthly intervention effects.
5. Treat dungeon/workflow abilities as a separate design surface, not just a RewardCalculator patch.
