---
name: curse tab worn-page helpers
overview: Add a Curse tab helper panel that lists all Worn Page mitigation sources (items, temporary buffs, mastery abilities, school passives, series passives), allows marking uses, and refreshes uses monthly or every two months on End of Month.
todos:
  - id: add-state-keys-and-shape
    content: Add persisted state keys/defaults for curse helper usage and cooldown progress.
    status: completed
  - id: build-helper-discovery
    content: Implement helper discovery and stable source-ID generation across all selected source types.
    status: completed
  - id: curse-tab-ui-section
    content: Add Curse tab helper panel markup and render path in UI/render components.
    status: completed
  - id: helper-actions
    content: Handle mark-used/undo actions in CurseController and persist updates.
    status: completed
  - id: end-month-refresh
    content: Apply monthly and every-2-month refresh rules in EndOfMonthController and re-render Curse tab.
    status: completed
  - id: tests
    content: Add/adjust tests for helper discovery, usage tracking, and cadence refresh behavior.
    status: pending
isProject: false
---

# Implement Worn Page Helpers in Curse Tab

## Goal

Expose all owned/active Worn Page mitigation effects directly in the Curse tab, let players mark a use, and auto-refresh uses by cadence (monthly or every 2 months) when End of Month is processed.

## Scope and behavior

- Include all source types you confirmed:
  - owned items/familiars (equipped, inventory, passive slots)
  - active temporary buffs
  - learned mastery abilities
  - school passive rule modifier(s)
  - series expedition passive rule modifier(s)
- Track usage **separately per source instance** (not merged by item name), so active vs passive cadence can differ.
- Cadence rules:
  - `monthly`: available every End of Month
  - `every-2-months`: available after 2 End-of-Month cycles
  - one-time temporary buffs stay one-time and do not auto-refresh unless explicitly defined otherwise.

## Implementation plan

- Add a dedicated persisted state slice for helper usage/cooldown and helper identifiers in [assets/js/character-sheet/storageKeys.js](/workspaces/tome-of-secrets/assets/js/character-sheet/storageKeys.js), plus default state shape and migration-safe initialization.
- Add helper computation + state APIs in [assets/js/character-sheet/stateAdapter.js](/workspaces/tome-of-secrets/assets/js/character-sheet/stateAdapter.js):
  - build current helper list from character state + data catalogs
  - assign stable source IDs (include source type + slot mode + name)
  - expose mark-used and refresh counters APIs.
- Add a Curse-tab helper section to [character-sheet.md](/workspaces/tome-of-secrets/character-sheet.md):
  - table/list for “Worn Page Mitigation Helpers”
  - columns: source, effect, cadence, status/cooldown, action.
- Add rendering components in [assets/js/character-sheet/renderComponents.js](/workspaces/tome-of-secrets/assets/js/character-sheet/renderComponents.js) and wiring in [assets/js/character-sheet/ui.js](/workspaces/tome-of-secrets/assets/js/character-sheet/ui.js) to render helper rows and empty state.
- Extend [assets/js/controllers/CurseController.js](/workspaces/tome-of-secrets/assets/js/controllers/CurseController.js) click handling for helper actions (`mark used`, optional `undo`) and re-render/save flow.
- Extend End-of-Month processing in [assets/js/controllers/EndOfMonthController.js](/workspaces/tome-of-secrets/assets/js/controllers/EndOfMonthController.js) to:
  - tick helper cooldown counters
  - restore monthly helpers each cycle
  - restore every-2-month helpers every second cycle
  - refresh Curse UI after reset.
- Add focused tests under [tests/](/workspaces/tome-of-secrets/tests):
  - helper-source discovery from items/buffs/abilities/school/series
  - separate-per-source cooldown behavior
  - monthly vs two-month refresh progression across consecutive End-of-Month calls
  - integration-level check for Curse tab rendering state transitions.

## Notes for data mapping

- Primary text sources are in:
  - [assets/data/allItems.json](/workspaces/tome-of-secrets/assets/data/allItems.json)
  - [assets/data/temporaryBuffs.json](/workspaces/tome-of-secrets/assets/data/temporaryBuffs.json)
  - [assets/data/masteryAbilities.json](/workspaces/tome-of-secrets/assets/data/masteryAbilities.json)
  - [assets/data/schoolBenefits.json](/workspaces/tome-of-secrets/assets/data/schoolBenefits.json)
  - [assets/data/seriesCompletionRewards.json](/workspaces/tome-of-secrets/assets/data/seriesCompletionRewards.json)
- Start with explicit allowlist matching for known Worn Page mitigation phrases to avoid false positives, then centralize matcher logic for easier future additions.

