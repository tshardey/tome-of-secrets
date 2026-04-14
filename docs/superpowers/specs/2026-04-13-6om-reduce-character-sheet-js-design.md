# 6om: Reduce character-sheet.js to Initialization and Wiring — Design Spec

**Bead:** tome-of-secrets-6om — Reduce character-sheet.js to initialization and wiring
**Date:** 2026-04-13
**Scope:** Extract all domain logic from character-sheet.js into focused modules, leaving a thin orchestrator

## Problem

`character-sheet.js` is 1,662 lines. It was designed as the main orchestrator for the character sheet, but over time accumulated domain logic: currency management, print handling, dropdown population, genre selection, rolling table overlays, quest info drawers, and more. The bead goal is to reduce it to pure initialization and wiring.

## Approach

Extract each logical concern into its own module file under `assets/js/character-sheet/`. Each module exports functions that `character-sheet.js` calls during initialization. No new controller classes — just plain function modules. The two large standalone async functions (`initializeRollingTables`, `initializeQuestInfoDrawers`) move as-is without deduplication of their shared genre selection code (dedup is a separate bead).

## New Modules

### `assets/js/character-sheet/dropdownInit.js`

- **Source:** Lines 58-117 of character-sheet.js
- **Exports:** `populateDropdowns(dataModule)` — populates wizard school, library sanctum, and year dropdowns
- **Note:** `ui.populateBackgroundDropdown()` stays as a one-liner call in character-sheet.js since it's already extracted to the ui module

### `assets/js/character-sheet/calendarPeriod.js`

- **Source:** Lines 122-152
- **Exports:** `getCurrentCalendarPeriod()`, `defaultQuestMonthYearIfEmpty()`

### `assets/js/character-sheet/currencyService.js`

- **Source:** Lines 161-276
- **Exports:** `createUpdateCurrency(stateAdapter, ui, dataModule)` — factory that returns the `updateCurrency(rewards)` function with dependencies bound via closure
- **Note:** Contains reward buff auto-detection logic (`checkRewardTextForBuffs`)

### `assets/js/character-sheet/questDraftHook.js`

- **Source:** Lines 278-302
- **Exports:** `createQuestDraftedHook(deps)` — factory returning the function to assign to `stateAdapter.applyQuestDraftedEffects`
- **Dependencies:** `stateAdapter`, `updateCurrency`, `dataModule`, `toast`, `form`, `getCurrentCalendarPeriod`, `defaultQuestMonthYearIfEmpty`, `applyQuestDraftedEffects`

### `assets/js/character-sheet/genreSelection.js`

- **Source:** Lines 304-328 (updateGenreQuestDropdown), 510-545 (initializeGenreSelection, displaySelectedGenres)
- **Exports:** `updateGenreQuestDropdown(stateAdapter, dataModule)`, `initializeGenreSelection(stateAdapter, dataModule)`, `displaySelectedGenres(stateAdapter)`

### `assets/js/character-sheet/printHandler.js`

- **Source:** Lines 547-630
- **Exports:** `initializePrintHandler()` — sets up print button, beforeprint/afterprint events, tab save/restore

### `assets/js/character-sheet/currencyWarning.js`

- **Source:** Lines 632-686
- **Exports:** `initializeCurrencyWarning(form)` — sets up form submit handler and currency unsaved changes detection
- **Dependencies:** `saveState`, `showSaveIndicator`, `safeGetJSON`, `parseIntOr`, `STORAGE_KEYS`

### `assets/js/character-sheet/delegatedClickHandler.js`

- **Source:** Lines 688-791
- **Exports:** `initializeDelegatedClickHandler(form, controllers, deps)` — sets up the consolidated delegated click handler on the form
- **Dependencies:** `abilityController`, `inventoryController`, `questController`, `curseController`, `buffController`, `safeSetJSON`, `STORAGE_KEYS`, `ui`

### `assets/js/character-sheet/collapsiblePanels.js`

- **Source:** Lines 420-483
- **Exports:** `initializeCollapsiblePanels()`, `initializeQuestDrawHelpersToggle()`

### `assets/js/character-sheet/deckActions.js`

- **Source:** Lines 486-508
- **Exports:** `initializeDeckActions(deckControllers)` — wires add-selected and clear-draw buttons
- **Note:** `updateDeckActionsLabel` moves into this module and is returned/exported so character-sheet.js can attach it to `dependencies.updateDeckActionsLabel`

### `assets/js/character-sheet/stateInitUI.js`

- **Source:** Lines 793-901
- **Exports:** `initializeStateDependentUI(deps)` — item dropdown population, shelf books visualization, dusty blueprints sync, `renderAll` call
- **Dependencies:** `ui`, `dataModule`, `stateAdapter`, `characterState`, `completedBooksSet`, `safeGetJSON`, `safeSetJSON`, `STORAGE_KEYS`, `parseIntOr`

### `assets/js/character-sheet/rollingTables.js`

- **Source:** Lines 904-1251
- **Exports:** `initializeRollingTables()` — moved as-is, the entire async function
- **Note:** Contains duplicated genre selection UI code shared with questInfoDrawers. Dedup is out of scope for this bead.

### `assets/js/character-sheet/questInfoDrawers.js`

- **Source:** Lines 1253-1660
- **Exports:** `initializeQuestInfoDrawers(updateCurrency, ui, stateAdapter)` — moved as-is, the entire async function
- **Note:** Contains duplicated genre selection UI code shared with rollingTables. Dedup is out of scope for this bead.

## What Stays in character-sheet.js

After extraction, `character-sheet.js` contains:

1. **Imports** — controllers + new modules
2. **`completedBooksSet`** — module-level `Set` + `initializeCompletedBooksSet()` / `saveCompletedBooksSet()` helpers (shared across multiple callsites including `onBookMarkedComplete` callback and controller initialization)
3. **`initializeCharacterSheet()`** — the orchestration function, calling modules in order:
   - `ui.populateBackgroundDropdown()`
   - `populateDropdowns(dataModule)`
   - `await loadState(form)`
   - `defaultQuestMonthYearIfEmpty()`
   - `initializeFormPersistence(form)`
   - Create `stateAdapter`
   - `const updateCurrency = createUpdateCurrency(stateAdapter, ui, dataModule)`
   - Wire `stateAdapter.applyQuestDraftedEffects` hook
   - `initializeCompletedBooksSet()`
   - Create shared `dependencies` object
   - Instantiate and initialize all controllers
   - `initializeCollapsiblePanels()`
   - `initializeQuestDrawHelpersToggle()`
   - `initializeDeckActions(deckControllers)`
   - `initializeGenreSelection(stateAdapter, updateGenreQuestDropdown)`
   - `initializePrintHandler()`
   - `initializeCurrencyWarning(form)`
   - `initializeDelegatedClickHandler(form, controllers)`
   - `initializeStateDependentUI(deps)`
   - `await initializeRollingTables()`
   - `await initializeQuestInfoDrawers(updateCurrency, ui, stateAdapter)`
4. **`onBookMarkedComplete` callback** — stays as wiring (coordinates across controllers, completedBooksSet, currency, shelf books)
5. **`updateDeckActionsLabel`** — lives in `deckActions.js`, imported and attached to `dependencies.updateDeckActionsLabel`

Estimated final size: ~200-250 lines.

## What Does NOT Change

- Controller files — untouched
- HTML markup — untouched
- CSS — untouched
- Public API — `initializeCharacterSheet()` export unchanged
- Behavior — all modules execute the same code, just organized into separate files

## Testing

- Existing test suite must pass unchanged — all extractions are pure moves with no logic changes
- No new unit tests for the extraction itself
- Manual verification: character sheet loads and all features work (dropdowns, print, drawers, genre selection, currency, shelf books, deck actions)

## Out of Scope

- Deduplication of shared genre selection UI code between `rollingTables.js` and `questInfoDrawers.js` — tracked as a separate bead
- Refactoring extracted modules to improve their internal structure
- Converting any extracted code to controller classes
