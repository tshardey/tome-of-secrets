# ADR-003: TCG Modifier Pipeline — Structured Effects and Data-Driven Mechanics

**Date:** 2026-04-01  
**Technical Story:** Replace ad-hoc hardcoded bonus logic with a declarative, data-driven modifier pipeline

---

## Context and Problem Statement

After ADR-001 established the controller architecture and ADR-002 added cloud save, the reward engine remained a tangle of hardcoded special cases. Every background bonus, school ability, item effect, and mastery ability had its own bespoke code path inside `RewardCalculator.js`, `AtmosphericBuffService.js`, and the controllers. Adding or changing any game mechanic required:

1. **Finding and updating multiple files** — the same effect could be partially implemented in the calculator, partially in a controller, and partially in the UI
2. **No canonical description** of what a mechanic does — the game's source of truth was scattered between Markdown prose and JavaScript, which diverged silently
3. **No runtime validation** — invalid effect configurations (wrong trigger, missing resource) failed silently
4. **Untestable mechanics** — effects were too entangled to test in isolation; most tests required full character-sheet mocks
5. **No activation/cooldown model** — school abilities and mastery abilities that are player-activated once per month had no formal activation state

The project needed a single, consistent model for "something grants a bonus/action under a condition" so that game content could be authored in data and executed by a generic runtime.

---

## Decision Drivers

- Maintain the static-site constraint (no build step for data; `generate-data.js` is the only pre-process)
- Keep the game playable even while the pipeline migration is incomplete (never break existing behavior)
- Allow new game mechanics to be added without touching JavaScript — only JSON
- Make effects testable in isolation using real catalog data
- Support the three major effect families: numeric rewards (`ADD_FLAT`, `MULTIPLY`, `GRANT_RESOURCE`), prevention (`PREVENT`), and activation (`ACTIVATE`, `UNLOCK_SLOT`)

---

## Considered Options

### Option 1: Big-bang rewrite of RewardCalculator

Replace all hardcoded paths with a generic pipeline in one pass.

**Pros:** Clean slate; no legacy debt  
**Cons:** High regression risk; would break a working game for weeks; extremely hard to test incrementally

### Option 2: Declarative effects in JSON + incremental pipeline migration (Selected)

Add `effects` arrays to data files. Build a pipeline that resolves them. Keep legacy `rewardModifier` paths running in parallel while each entity migrates.

**Pros:**
- Game stays playable throughout the migration
- Each entity can be migrated and tested independently
- JSON `effects` serve as machine-readable documentation of intended behavior
- Schema validation catches data errors at test time, not at runtime

**Cons:**
- Temporary complexity from dual paths (legacy + pipeline)
- Need a fence to prevent double-application during the overlap period

### Option 3: Single-file configuration object

Describe all effects as a big configuration object in JavaScript.

**Pros:** No JSON parsing step  
**Cons:** Not editable without code changes; loses the separation between content and code; hard to validate

---

## Decision

**Option 2** was selected. The implementation spans four layers:

### Layer 1: Effect Schema (`assets/js/services/effectSchema.js`)

Effects are plain JSON objects validated against a schema. Each effect has:

```json
{
  "trigger": "ON_QUEST_COMPLETED",
  "condition": { "questType": "genre_quest" },
  "modifier": { "type": "ADD_FLAT", "resource": "inkDrops", "value": 5 },
  "cooldown": "monthly",
  "description": "Human-readable description for UI"
}
```

**Triggers** (`TRIGGERS` enum):
- `ON_QUEST_COMPLETED` — fires when any quest is completed
- `ON_JOURNAL_ENTRY` — fires for each journal entry at EOM
- `ON_WORN_PAGE` — fires when a Worn Page penalty would be applied
- `ON_STATE_LOAD` — fires once when character state is loaded (for persistent slot unlocks)
- `ON_MONTH_END` — fires during EOM processing
- `ON_MONTH_START` — fires when a new month begins
- `ON_ACTIVATE` — fires when the player explicitly activates an ability

**Modifier types** (`MODIFIER_TYPES` enum):
- `ADD_FLAT` / `GRANT_RESOURCE` — additive numeric bonuses
- `MULTIPLY` — multiplicative (applies after all additive bonuses)
- `PREVENT` — blocks a penalty from applying
- `ACTIVATE` — records an activation; handled as a cooldown-gated player action
- `UNLOCK_SLOT` — deferred to `SlotService` on state load; non-numeric

### Layer 2: Effect Registry (`assets/js/services/EffectRegistry.js`)

`EffectRegistry` indexes all catalog entries (items, backgrounds, schools, mastery abilities, sanctum benefits) at initialization. It provides typed query methods:

- `getEffectsForTrigger(trigger, stateAdapter, dataModule)` — returns all active effects matching a trigger
- `getSanctumAssociatedBuffIds(sanctumIdOrName, dataModule)` — reads sanctum `ON_MONTH_END` MULTIPLY effects to determine which atmospheric buffs receive a ×2 multiplier
- `getForcedAtmosphericBuffNames(stateAdapterLike, dataModule)` — reads `ON_MONTH_START force_atmospheric_buff` effects

### Layer 3: Modifier Pipeline (`assets/js/services/ModifierPipeline.js`)

`ModifierPipeline.resolve(trigger, payload, stateAdapter, dataModule)` is a pure function that:

1. Queries `EffectRegistry` for all effects matching the trigger
2. Evaluates conditions (quest type, page count, atmospheric buff active, etc.)
3. Applies modifiers in resolution order: `ADD_FLAT` → `GRANT_RESOURCE` → `MULTIPLY` → `PREVENT` → `UNLOCK_SLOT` (deferred) → `ACTIVATE`
4. Returns a receipt object describing what was applied, to whom, and why

The pipeline is side-effect-free. It never writes state — callers apply the receipt.

### Layer 4: Data Files (`assets/data/*.json`)

`effects` arrays were added to all entities with deterministic mechanics:

| File | Entities with effects |
|---|---|
| `keeperBackgrounds.json` | All 6 backgrounds (ink/paper/XP bonuses, forced buffs) |
| `schoolBenefits.json` | All 6 schools (quest bonuses, prevention, activation, slot unlocks) |
| `masteryAbilities.json` | Silver Tongue, Alchemic Focus, Quick Shot, Concussive Blast, Irresistible Charm, Empowered Bond, Divination abilities |
| `allItems.json` | Librarian's Quill, Golden Pen, Chalice of Restoration, Raven Familiar, Scepter of Knowledge, Ward Against the Shroud, Celestial Koi Fish, Lantern of Foresight, familiar items |
| `sanctumBenefits.json` | All 3 sanctums (atmospheric buff ×2 multipliers via `ON_MONTH_END`) |

Entities with subjective mechanics (player decides applicability) retain only `rewardModifier` and are correctly excluded from the pipeline. This is a design choice, not a gap.

---

## Consequences

### Positive

- **Single source of truth**: every automated game mechanic is described in one JSON `effects` array per entity; the Markdown prose description is derived from, not separate from, the data
- **Testable in isolation**: `realDataIntegration.test.js` loads actual JSON catalogs and asserts pipeline output without DOM or controller mocks
- **Schema-validated**: `dataContracts.test.js` catches malformed effects (wrong trigger, missing resource, invalid modifier type) at test time
- **Activation/cooldown model**: `ACTIVATE` effects with `"cooldown": "monthly"` are tracked in character state; `activationCooldown.test.js` asserts that activations are gated and reset at month boundaries
- **Slot unlocks data-driven**: `UNLOCK_SLOT` effects allow familiar slots and item slots to be granted by Conjuration school selection or Echo Chamber item without any special-case controller code
- **Double-application fenced**: `RewardCalculator._collectBuffCardPipelineEffects` skips `[Background]` buff cards because those bonuses are now sourced exclusively from `EffectRegistry` using `keeperBackgrounds.json`; the legacy path and the pipeline never both fire for the same entity

### Negative / Known Trade-offs

- **Two reward paths coexist**: items and buffs without `effects` arrays still use `rewardModifier` and legacy controller code. This is intentional (subjective mechanics should remain player-driven) but creates an asymmetry that new contributors need to understand.
- **`ACTIVATE` effects are discovery-only**: the pipeline records that an activation was used and checks cooldowns, but the *action* taken (e.g. "complete two quests from one book") is still executed by controller logic. The pipeline is not yet a full execution engine for non-numeric effects.
- **Temp buff use-count enforcement is partial**: `Enchanted Focus` now carries `useCount: 3` in data and `usesLeft` is decremented via `StateAdapter.decrementUseCountBuffsOnBookComplete()` when a book is marked complete. However, `The Archivist's Favor` choose-one (reroll / +100 XP / 50% off) remains a manual player step — the mechanic is inherently a choice that cannot be auto-applied without a dedicated UI flow.
- **Sanctum multipliers are pipeline-read but not pipeline-applied**: `EffectRegistry.getSanctumAssociatedBuffIds` reads sanctum `effects` to determine which buffs get doubled. The actual multiplication happens in `AtmosphericBuffService.calculateDailyValue`, not in `ModifierPipeline.resolve`. This is a deliberate architectural shortcut: atmospheric buff calculation runs on every UI render and the full pipeline overhead is unnecessary for a two-branch conditional.

### Deferred Work

The following were explicitly scoped out of this ADR and remain open:

- **Full ACTIVATE execution engine**: making `ACTIVATE` effects self-describing enough that controller logic for each action can be eliminated
- **Abjuration follow-up quest**: the draw-from-prevented-page follow-through is documented in prose as a manual player step; a future ADR could add a UI prompt on prevention
- **Side quest stable IDs in state**: side quest state is currently matched by text; migrating to ID-based keys requires a state migration in `dataMigrator.js`

---

## Related Documents

- [ADR-001: Character Sheet Architecture Refactoring](ADR-001-character-sheet-refactoring.md)
- [ADR-002: Cloud Save and Data Architecture](ADR-002-cloud-save-and-data-architecture.md)
- [EXTENDING-THE-CODEBASE.md](EXTENDING-THE-CODEBASE.md) — practical guide for adding new effects
- `tests/realDataIntegration.test.js` — integration tests for the pipeline with real JSON catalogs
- `tests/activationCooldown.test.js` — activation and cooldown behavior contracts
- `tests/dataContracts.test.js` — schema contract tests for all 24 data JSON files
