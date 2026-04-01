---
name: TCG Audit Remediation Plan
overview: "Address all gaps identified by the per-file TCG audits: fix incomplete effect implementations in the modifier pipeline, add missing structured effects to data files, resolve data integrity issues (dual sources of truth, name-keyed state, prose-vs-code drift), and add comprehensive test coverage across all data files."
todos:
  - id: fix-activate-unlock
    content: "Phase 1a-1c: Implement ACTIVATE/UNLOCK_SLOT in pipeline, fix mastery ability trigger mismatches"
    status: pending
  - id: fix-double-apply
    content: "Phase 1f: Fence legacy/pipeline double-application for backgrounds"
    status: pending
  - id: fix-abjuration-evocation
    content: "Phase 1d-1e: Complete Abjuration follow-through and Evocation controller activation"
    status: pending
  - id: real-data-tests
    content: "Phase 4a: Real-data integration tests for pipeline with actual JSON catalogs"
    status: pending
  - id: activation-cooldown-tests
    content: "Phase 4b: Activation and cooldown behavior tests"
    status: pending
  - id: item-effects-migration
    content: "Phase 2a: Add effects arrays to deterministic items (Celestial Koi Fish, Lantern, familiars)"
    status: pending
  - id: sanctum-tempbuff-migration
    content: "Phase 2b-2c: Migrate sanctum benefits and evaluate temp buff structured effects"
    status: pending
  - id: schema-contract-tests
    content: "Phase 4c: Schema contract tests for all 24 data JSON files"
    status: pending
  - id: cross-file-tests
    content: "Phase 4d: Cross-file consistency tests (suggestedItems, associatedBuffs, stickerSlug, rooms-wings)"
    status: pending
  - id: data-integrity-fixes
    content: "Phase 3a-3d: Fix dual sources of truth, stabilize ID-based keys, fix wings NaN"
    status: pending
  - id: behavioral-regression-tests
    content: "Phase 4e-4f: Named entity behavioral regressions and remaining test gaps (SlotService, SideQuestDeckService, etc.)"
    status: pending
isProject: false
---

# TCG Audit Remediation Plan

## Current State

The modifier pipeline infrastructure (Phase 1-4 of the original plan) is largely **built**: `ModifierPipeline.js`, `EffectRegistry.js`, `TriggerPayload.js`, and `effectSchema.js` all exist and are wired into quest completion, journal entry, worn page prevention, quest drafting, forced atmospheric buffs, and slot services. All 66 test suites pass (1368 tests, 27 skipped).

However, the per-file audits reveal three categories of gaps:

1. **Incomplete implementations** -- pipeline modifier types (`ACTIVATE`, `UNLOCK_SLOT`) lack application logic; several mastery abilities, school benefits, and items have effects declared in JSON that are effectively no-ops at runtime
2. **Missing structured effects** -- only 5 of 38 items have `effects` arrays; sanctum benefits and temporary buffs have zero; several items with deterministic mechanics still rely solely on legacy `rewardModifier` paths
3. **Weak test coverage** -- most tests use mocked catalogs, not real data; no contract/schema tests for most JSON files; no cross-file consistency tests; no integration tests for activation/cooldown paths

## Triage: What Can Be Ignored

The following data files are **lookup/display tables** with no TCG effects to implement. They need only lightweight schema contract tests (covered in Phase 4 below):

- `xpLevels.json`, `levelRewards.json` -- XP thresholds and per-level rewards
- `wings.json`, `roomThemes.json` -- dungeon structure and visual themes
- `dungeonRewards.json` -- display-only (runtime sources from config)
- `expansions.json` -- feature manifest (partially wired)

---

## Phase 1: Fix Broken Pipeline Mechanics

**Goal:** Make every declared `effects` entry in JSON actually execute at runtime.

### 1a. Implement `ACTIVATE` resolution in ModifierPipeline

[assets/js/services/ModifierPipeline.js](assets/js/services/ModifierPipeline.js) has no application logic for `ACTIVATE` modifiers -- they fall through the numeric resolution loop silently. The pipeline needs to:

- Recognize `ACTIVATE` effects and delegate to a cooldown-checking service
- Track monthly/per-use cooldown state in `characterState`
- Return activation eligibility in the receipt (not a numeric modifier)

Affected: Evocation (use one book for two quests), Transmutation (swap resources), Scepter of Knowledge (ignore prompt), Quick Shot / Concussive Blast / Irresistible Charm (mastery activations), Divination quest-pool manipulation.

### 1b. Implement `UNLOCK_SLOT` resolution

`UNLOCK_SLOT` is validated by schema but not applied. [assets/js/services/SlotService.js](assets/js/services/SlotService.js) already handles slot unlocks on `ON_STATE_LOAD`, but the pipeline itself should either:

- Formally delegate to `SlotService` when resolving `UNLOCK_SLOT`, or
- Document that `UNLOCK_SLOT` is handled outside `resolve()` and mark it as non-numeric in the pipeline

Affected: Conjuration familiar slot, Echo Chamber extra slot.

### 1c. Fix mastery ability trigger mismatches

Per the audit, `Quick Shot`, `Concussive Blast`, and `Irresistible Charm` declare `ACTIVATE` modifiers on `ON_QUEST_COMPLETED`, which is the wrong trigger. These should use `ON_ACTIVATE` (player-initiated). Fix the trigger in [assets/data/masteryAbilities.json](assets/data/masteryAbilities.json) and ensure the activation UI in [assets/js/character-sheet/ui.js](assets/js/character-sheet/ui.js) reads `ON_ACTIVATE` effects correctly.

### 1d. Complete Abjuration follow-through

[assets/data/schoolBenefits.json](assets/data/schoolBenefits.json) defines Abjuration's `PREVENT` for worn page, which works. But the follow-up benefit (draw/choose/complete a quest from the prevented page) is not represented in runtime. Either:

- Add a second effect that grants a quest draw on prevention, or
- Document it as a manual player action and update the prose accordingly

### 1e. Complete Evocation controller actions

Evocation is defined as an activated school effect in data, but the controller logic for "use one book to complete two quests" is incomplete. Wire the activation path through the controller and ensure cooldown tracking works.

### 1f. Eliminate legacy/pipeline double-application

The audit flags that legacy manual background bonus cards can overlap with pipeline auto-apply. In [assets/js/services/RewardCalculator.js](assets/js/services/RewardCalculator.js), the `_collectBuffCardPipelineEffects` method still generates hardcoded `[Background]` entries for Archivist/Prophet/Cartographer ink alongside the pipeline auto-apply from `EffectRegistry`. Add a fence so effects from the same source don't stack.

---

## Phase 2: Add Missing Structured Effects to Data Files

**Goal:** Ensure items/entities with deterministic, auto-applicable mechanics have `effects` arrays.

### 2a. Identify items needing `effects` migration

Of 38 items, only 5 have `effects`. Most items are **subjective** (player decides applicability) and correctly use `rewardModifier` only. But several items have deterministic mechanics that should be pipeline-driven:

- **Celestial Koi Fish** -- "+10 XP for celestial motif / night sky cover" (deterministic if tag-based)
- **Lantern of Foresight** -- quest-pool draw modification (deterministic)
- **Items with prevention mechanics** not yet declared (if any beyond Chalice/Raven)
- **Familiar items** -- familiar bonus scaling uses special-case code in `_applyFamiliarStateLoadModifiers`; consider migrating to `ON_STATE_LOAD` effects

For each, add an `effects` array to [assets/data/allItems.json](assets/data/allItems.json) and run `node scripts/generate-data.js`.

### 2b. Migrate sanctum benefits to pipeline

[assets/data/sanctumBenefits.json](assets/data/sanctumBenefits.json) has 0 effects. Sanctum atmospheric multipliers are hardcoded in `AtmosphericBuffService`. Add `effects` arrays and have the service read them from the registry, or at minimum add stable IDs and validate `associatedBuffs` cross-references.

### 2c. Evaluate temporary buff migration

[assets/data/temporaryBuffs.json](assets/data/temporaryBuffs.json) and [assets/data/temporaryBuffsFromRewards.json](assets/data/temporaryBuffsFromRewards.json) have 0 effects. These are already consumed by `EffectRegistry` for reward-temp-buffs when they match by name/id. The question is whether they need structured `effects` or if the existing `rewardModifier` path is sufficient. At minimum:

- Unify the two catalogs or add strict merge-precedence tests
- Align `Long Read Focus` prose (scaling) with runtime (flat)
- Add `effects` to any temp buffs with deterministic mechanics (auto-expire at EOM, choose-one)

---

## Phase 3: Fix Data Integrity Issues

### 3a. Resolve dual sources of truth


| File                      | Issue                                                                  | Fix                                                                                                   |
| ------------------------- | ---------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `extraCreditRewards.json` | Lists XP/Ink values but runtime uses `GAME_CONFIG` (paper scraps only) | Either sync JSON with runtime or add a comment/field marking it non-authoritative; add alignment test |
| `dungeonRewards.json`     | Display-only; penalties not enforced                                   | Add alignment test between display strings and config values                                          |
| `genreQuests.json`        | `rewards` field used for preview but completion uses config constants  | Add parity test ensuring preview == awarded                                                           |


### 3b. Stabilize ID-based state keys

The audits flag name-based state keys for:

- **Sanctum benefits** -- keyed by display name, rename breaks persistence
- **Atmospheric buffs** -- keyed by display name in state
- **Side quests** -- text-based matching instead of stable IDs

For each, evaluate migration feasibility. At minimum, add `id` fields where missing and create migration paths in [assets/js/character-sheet/dataMigrator.js](assets/js/character-sheet/dataMigrator.js).

### 3c. Fix cross-file reference integrity

- `restorationProjects.json` `suggestedItems` that don't resolve to real items in `allItems.json`
- `sanctumBenefits.json` `associatedBuffs` references not validated against atmospheric catalog
- `atmosphericBuffs.json` `stickerSlug` not validated against `roomThemes.json`

### 3d. Fix wings zero-room NaN

[assets/data/wings.json](assets/data/wings.json) has a special wing with empty `rooms` that produces `NaN%` in library progress. Guard division-by-zero in the wing progress renderer.

---

## Phase 4: Comprehensive Test Coverage

This is the largest phase. Tests are organized by category.

### 4a. Real-data integration tests (new file: `tests/realDataIntegration.test.js`)

Replace mock-catalog pipeline tests with tests that load actual JSON:

- Journal effects: Librarian's Quill, Golden Pen produce correct paper scraps via `ON_JOURNAL_ENTRY`
- Quest completion: backgrounds (all 6) auto-apply correctly with real `keeperBackgrounds.json`
- Quest completion: schools (all 6) auto-apply correctly with real `schoolBenefits.json`
- Quest completion: mastery abilities that have `ON_QUEST_COMPLETED` effects
- Worn page prevention: Abjuration, Ward Against the Shroud, Raven Familiar, Chalice
- No-double-stack: pipeline auto-apply + legacy buff cards don't duplicate

### 4b. Activation and cooldown tests (new file: `tests/activationCooldown.test.js`)

- Evocation monthly activation
- Transmutation monthly activation
- Scepter of Knowledge monthly activation
- Quick Shot / Concussive Blast / Irresistible Charm (after trigger fix)
- Cooldown state persists across saves
- Cooldown resets at month boundary

### 4c. Schema contract tests (new file: `tests/dataContracts.test.js`)

For every JSON file under `assets/data/`, validate:

- Required fields present and correct types
- IDs unique within file
- Numeric values in expected ranges
- Enum values from allowed sets
- No orphaned references

Specific per-file contracts:

- `allItems.json`: every item has `id`, `name`, `type`, `img`, `bonus`; items with `effects` have valid effect schemas
- `keeperBackgrounds.json`: every background has `effects` array
- `schoolBenefits.json`: every school has `effects` array
- `masteryAbilities.json`: every ability with `effects` uses correct trigger
- `curseTableDetailed.json`: unique `number` values, required `name`/`description`
- `dungeonCompletionRewards.json`: all rolls 1-20 present with valid reward shapes
- `sideQuestsDetailed.json`: stable IDs present
- `wings.json`: room references resolve to `dungeonRooms.json`
- `atmosphericBuffs.json`: `stickerSlug` resolves in `roomThemes.json`

### 4d. Cross-file consistency tests (extend `tests/dataContracts.test.js` or new file)

- `restorationProjects` `suggestedItems` all exist in `allItems.json`
- `sanctumBenefits` `associatedBuffs` all exist in `atmosphericBuffs.json`
- `atmosphericBuffs` `stickerSlug` all resolve in `roomThemes.json` sticker catalog
- `dungeonRooms` room IDs all appear in exactly one wing in `wings.json`
- `temporaryBuffs` and `temporaryBuffsFromRewards` have no conflicting entries (or tested precedence)
- `genreQuests` preview rewards match runtime config values
- `extraCreditRewards` values match `GAME_CONFIG`

### 4e. Behavioral regression tests for named entities

Add explicit tests for entities the audits flag as potentially no-op or semantically wrong:

- **Dungeon completion rewards**: `Story Surge`, `Librarian's Blessing`, `Enchanted Focus`, `The Archivist's Favor` -- assert they produce real game-state changes or are documented as narrative-only
- **Series completion stops**: stops 2, 5, 7, 10 mechanical promises
- **Temporary buffs**: `The Archivist's Favor`, `Enchanted Focus`, `Unwavering Resolve` -- choice handling, use-count, expiry
- **Permanent bonuses**: page-count and atmospheric modifiers actually apply in reward flows

### 4f. Existing test gaps to fill

- `SlotService` direct unit tests (milestone and edge cases)
- `SideQuestDeckService` behavior contracts
- Wing progress with zero rooms
- Atmospheric buff forced-name validation
- Content registry disabled-core and transitive-requires tests

---

## Prioritization

**Do first (highest impact, highest risk):**

1. Phase 1a-1c: Fix broken pipeline mechanics (ACTIVATE/UNLOCK_SLOT, mastery triggers)
2. Phase 4a: Real-data integration tests (catch regressions before more changes)
3. Phase 1f: Legacy/pipeline double-application fence

**Do second (data completeness):**
4. Phase 2a: Item effects migration (Celestial Koi Fish, Lantern, familiars)
5. Phase 4b: Activation and cooldown tests
6. Phase 4c: Schema contract tests

**Do third (integrity and polish):**
7. Phase 3a-3d: Data integrity fixes
8. Phase 4d: Cross-file consistency tests
9. Phase 2b-2c: Sanctum and temp buff migration
10. Phase 1d-1e: Abjuration/Evocation completion
11. Phase 4e-4f: Behavioral regressions and remaining test gaps