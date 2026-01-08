# Tome of Secrets — Refactor Roadmap (Post Cloud Save)

This doc is a “pick it back up later” plan for continuing the transition from **Jekyll + localStorage** into a more game-like web app architecture **without** taking on full-time ops.

It assumes you’ll spend a few days/weeks validating Cloud Save in production first.

---

## Current state (what’s already done)

### Persistence
- **Large state moved to IndexedDB** (local-first) via `assets/js/character-sheet/persistence.js`.
- **State load/save became async** (`loadState`, `saveState`) and boot paths were updated accordingly.
- **Legacy localStorage remains** for small/shared keys (form data, monthly books, schema version, etc.).

### Cloud save (Supabase)
- Sidebar **Cloud Save** panel (magic link email auth).
- "Sync now" supports push/pull + conflict prompts.
- **Event-driven auto-sync**:
  - Triggers within 3-5 seconds of local state changes (not on a timer).
  - Auto-push when safe (no cloud changes since last sync).
  - Auto-pull when safe (local unchanged since last sync) — no forced reload.
  - Cross-tab detection via localStorage `storage` events.
  - Visibility change triggers immediate sync (catches stale sessions).
  - Polling fallback reduced to 3 minutes (safety net).
- Hashing uses canonical key ordering to avoid "false diffs" from JSON key order.
- Concurrency protection prevents manual and auto syncs from running simultaneously.

### UX cleanups
- Removed the old **Data Management** (download/upload) section.

### Phase 3: Comprehensive Refactor ✅ COMPLETE
- **Expansion manifest system** - `expansions.json` and `contentRegistry.js` for feature gating
- **Stable IDs** - All content files now have stable kebab-case IDs with backward-compatible lookups
- **Data validation** - Automated validation script with CI/CD integration
- **Calculation transparency** - Reward receipts show full breakdown of all calculations
- **Service extraction** - All business logic extracted from UI into testable service modules
- **UI/logic separation** - All UI functions refactored to pure renderers using view models
- **Comprehensive testing** - 68+ tests covering all new services and view models

---

## Phase 0 — Production validation checklist (do this first)

### Cloud save correctness
- **First sync**:
  - New account/device: confirm you get the “choose pull vs push” dialog.
- **Conflict**:
  - Two devices make changes without syncing → confirm conflict prompt is accurate and choice is respected.
- **Auto-sync**:
  - Confirm “Last synced” updates.
  - Confirm auto-pull only happens when local is unchanged.

### Failure modes
- Offline behavior: UI messages should be understandable; no data loss.
- Rate limiting: avoid spamming magic-link sends; confirm error copy is understandable.

### Security
- Confirm Supabase table **RLS** policies are enabled and correct (see `SUPABASE-CLOUD-SAVE.md`).

---

## Phase 1 — Make "character info" truly local-first (no Save button required) ✅ COMPLETE

**Status:** ✅ Implemented and tested

Right now, some inputs only persist when the user clicks **Save Character Info**.

### Goal
- Any meaningful edit should persist locally immediately (or with a small debounce).
- Cloud auto-sync then becomes much more intuitive.

### Implementation
- **Added debounced "form persistence" layer** (`assets/js/character-sheet/formPersistence.js`):
  - Listens for `input`/`change` events on `#character-sheet`.
  - Uses allowlist approach to exclude transient inputs (quest creation fields, dropdown selects, etc.).
  - Saves to `STORAGE_KEYS.CHARACTER_SHEET_FORM` with 500ms debounce.
  - Emits `tos:localStateChanged` event for Phase 2 preparation.
- **Save indicator** added to UI:
  - Shows icon + "Saved" text briefly (2 seconds) after auto-save.
  - Positioned next to "Save Character Info" button.
- **Save button** updated:
  - Removed alert popup, now shows save indicator instead.
  - Still functional for manual saves.
- **Dropdown population order** fixed:
  - Dropdowns (background, school, sanctum) now populate before `loadState()` to ensure saved values load correctly.

### Notes
- "Save Character Info" button remains functional but is no longer required for form fields.
- Save indicator provides visual feedback for auto-saves.
- All quest creation fields properly excluded from auto-save.

### Tests
- ✅ Jest tests added in `tests/formPersistence.test.js`:
  - Typing into `keeperName` persists without clicking Save.
  - Transient fields (`new-quest-*`, dropdowns) do not trigger saves.
  - Debounce prevents rapid successive saves.
  - `tos:localStateChanged` event fires after save.

---

## Phase 2 — Event-driven auto-sync (less polling, more "just works") ✅ COMPLETE

**Status:** ✅ Implemented and tested

The previous auto-sync was a conservative polling loop (30-second intervals).

### Goal
- Auto-sync shortly after local data changes, not on a timer.

### Implementation
- **Created `autoSyncScheduler.js` module** (`assets/js/auth/autoSyncScheduler.js`):
  - Centralized sync scheduler with 3-second debouncing
  - Concurrency guard prevents overlapping syncs
  - Methods for immediate sync (visibility changes) and flush (manual sync)
- **Event emission from storage layer** (`assets/js/utils/storage.js`):
  - `safeSetJSON()` emits `tos:localStateChanged` for cloud-synced keys
  - Allowlist approach prevents unnecessary syncs for UI-only keys
  - `suppressEvents` parameter prevents loops during cloud snapshot application
- **Event emission from persistence layer** (`assets/js/character-sheet/persistence.js`):
  - `setStateKey()` emits events for IndexedDB writes
  - Supports `suppressEvents` for loop prevention
- **Loop prevention in cloud sync** (`assets/js/services/cloudSync.js`):
  - `applySnapshot()` passes `suppressEvents: true` when applying cloud snapshots
  - Prevents infinite sync loops when cloud data is applied locally
- **Event-driven sync integration** (`assets/js/auth/cloudAuth.js`):
  - Replaced 30-second polling with event-driven triggers
  - Added listeners for:
    - `tos:localStateChanged` (local state changes)
    - `storage` (cross-tab localStorage changes)
    - `visibilitychange` (immediate sync when tab becomes visible)
  - Reduced polling fallback to 3 minutes (safety net)
  - Manual sync cancels pending auto-sync and waits for in-progress syncs
  - Shared `syncInProgress` flag prevents concurrent manual and auto syncs

### Notes
- Cloud sync now triggers within 3-5 seconds of local state changes automatically
- Multiple rapid changes are debounced into a single sync
- Cross-tab localStorage changes trigger sync in other tabs
- Cloud snapshot application doesn't trigger sync loops (events suppressed)
- Manual sync takes priority and waits for any in-progress auto-sync
- Polling fallback still works (reduced to 3 minutes) for edge cases
- All existing guardrails preserved (conflict detection, etc.)

### Tests
- ✅ Jest tests added:
  - `tests/eventEmission.test.js` - Event emission from storage and persistence layers
  - `tests/autoSyncScheduler.test.js` - Debouncing, concurrency, and scheduler methods
  - `tests/eventDrivenSync.test.js` - Integration tests for end-to-end event flow
  - `tests/cloudSync.test.js` - Loop prevention in `applySnapshot()`

---

## Phase 3 — Make expansions data-driven and painless ✅ COMPLETE

**Status:** ✅ Implemented and tested

The expansion "ordeal" is usually caused by mixing:
- engine rules + UI logic + content data + save state changes

### Goal
- Adding expansions becomes: "add JSON data + optional renderer + optional migrations".

### Implementation

#### Content Manifest System
- **Created `assets/data/expansions.json`**:
  - Declares core game and all expansions (currently `library-restoration`)
  - Each expansion specifies version, enabled status, features, and data files
  - All expansions enabled by default for players
- **Created `assets/js/config/contentRegistry.js`**:
  - Runtime registry for querying expansion status
  - Provides functions: `isExpansionEnabled()`, `getExpansionVersion()`, `getEnabledFeatures()`, etc.
  - Exported via `scripts/generate-data.js`

#### Stable IDs System
- **Added stable kebab-case IDs to all content files**:
  - `allItems.json` - Added `id` and `name` fields to all items
  - `genreQuests.json` - Added `id` fields
  - `sideQuestsDetailed.json` - Added `id` fields
  - `curseTableDetailed.json` - Added `id` fields
  - `masteryAbilities.json` - Added `id` and `name` fields
  - `atmosphericBuffs.json` - Added `id` and `name` fields
  - `temporaryBuffs.json` - Added `id` and `name` fields
  - `temporaryBuffsFromRewards.json` - Added `id` and `name` fields
  - `dungeonRooms.json` - Added `id` fields
  - `wings.json` - IDs already existed
  - `restorationProjects.json` - Keys used as IDs
- **Updated `assets/js/character-sheet/data.js`**:
  - Added ID lookup helpers for all content types (e.g., `itemsById`, `getItem()`, `getGenreQuest()`, etc.)
  - Maintains backward compatibility with name-based lookups
  - All lookups support both ID and name resolution

#### Data Validation Script
- **Created `scripts/validate-data.js`**:
  - Validates unique IDs within categories
  - Validates kebab-case format for IDs
  - Validates item references in quest rewards
  - Validates quest references
  - Validates required fields and types
  - Validates cross-references (expansion features reference valid data)
  - Detects duplicate display names that could cause confusion
- **Integrated into CI/CD**:
  - Added to `.github/workflows/jekyll.yml` to run on every push
  - Runs before tests and build
  - Fails build if validation errors are found

#### Calculation Trust & Transparency
- **Enhanced `RewardCalculator.js`**:
  - Added calculation receipt system to `Reward` class
  - Receipts track base values, modifiers (with sources), and final totals
  - All calculation methods populate receipt accurately
- **Receipt display in UI**:
  - Tooltips on reward indicators show detailed breakdown
  - Modal dialog displays full calculation receipt on quest completion
  - Receipts stored with completed quests for later review
- **Comprehensive test coverage**:
  - Created `tests/RewardCalculatorReceipts.test.js` with 20+ test cases
  - Tests verify receipt accuracy for all calculation scenarios

#### Service Extraction & Business Logic Separation
- **Created service modules**:
  - `RewardCalculator.js` - Centralized all reward calculations (already existed, enhanced)
  - `QuestRewardService.js` - Blueprint reward calculations
  - `QuestService.js` - Quest-related calculations and formatting
  - `InventoryService.js` - Inventory item hydration and filtering
  - `SlotService.js` - Slot limit calculations
  - `AbilityService.js` - Ability filtering and formatting
  - `AtmosphericBuffService.js` - Atmospheric buff calculations and logic
- **Post-load repairs**:
  - Created `assets/js/character-sheet/postLoadRepair.js`
  - Moved repair logic from `character-sheet.js`
  - Contains `repairCompletedRestorationProjects()` and `repairCompletedFamiliarEncounters()`
  - Called after `loadState()` to apply all necessary repairs
- **Invariant enforcement**:
  - Enhanced `StateAdapter` to enforce state invariants
  - Items cannot be both equipped and in passive slots
  - Automatic unequipping when items moved to passive slots
  - Removed duplicate logic from controllers

#### UI/Logic Separation & View Models
- **Refactored all UI rendering functions** to be pure renderers:
  - `renderLoadout()` - Now accepts view model, performs no calculations
  - `renderActiveAssignments()`, `renderCompletedQuests()`, `renderDiscardedQuests()` - Use view models
  - `renderMasteryAbilities()` - Uses view model
  - `renderAtmosphericBuffs()` - Uses view model
  - `renderActiveCurses()`, `renderCompletedCurses()` - Use view models
  - `renderBenefits()`, `renderPermanentBonuses()` - Use view models
- **Created view model layer**:
  - `inventoryViewModel.js` - Transforms state + services into UI-ready inventory data
  - `questViewModel.js` - Transforms quest state into UI-ready quest data
  - `abilityViewModel.js` - Transforms ability state into UI-ready data
  - `atmosphericBuffViewModel.js` - Transforms buff state into UI-ready data
  - `curseViewModel.js` - Transforms curse state into UI-ready data
  - `generalInfoViewModel.js` - Transforms character info into UI-ready data
- **Backward compatibility maintained**:
  - All UI functions have backward-compatible wrappers
  - Existing code continues to work without changes
  - Gradual migration path for future updates

### Tests
- ✅ Comprehensive test suite created:
  - `tests/services/AbilityService.test.js` - 18 tests
  - `tests/services/AtmosphericBuffService.test.js` - 14 tests
  - `tests/viewModels/abilityViewModel.test.js` - 6 tests
  - `tests/viewModels/atmosphericBuffViewModel.test.js` - 6 tests
  - `tests/viewModels/curseViewModel.test.js` - 5 tests
  - `tests/viewModels/generalInfoViewModel.test.js` - 10 tests
  - `tests/RewardCalculatorReceipts.test.js` - 20+ tests
  - All 68+ tests passing

### Notes
- All expansion content enabled by default
- Stable IDs prevent display name issues
- Calculation receipts provide full transparency for reward calculations
- UI functions are now pure renderers with no business logic
- All business logic is in testable service modules
- State access consistently uses storage keys
- Architecture is consistent across all components

---

## Phase 4 — UI/UX overhaul (without rewrites)

Once persistence/sync is stable, invest in UX.

### Quick wins
- Replace intrusive alerts with inline toasts/snackbars.
- Make Cloud Save status more “game-like”:
  - “Online”, “Offline”, “Synced”, “Needs attention”.
- Add a dedicated “Settings” panel (email, sign out, sync controls).

### Medium wins
- Reduce “form-like” feel:
  - collapse sections
  - emphasize progression, quests, inventory loops
  - make the character sheet feel like a dashboard

---

## Phase 5 — Optional: move from Jekyll-as-app to “app shell”

You can keep Jekyll for content, but treat the “game” as an app.

### Options
- Keep Jekyll + modernize JS incrementally (current direction).
- Or introduce a minimal SPA “app shell” for the character sheet / library pages only:
  - Jekyll serves content pages
  - App routes handle stateful game pages

This is not required if the current architecture stays maintainable.

---

## Phase 6 — Cloud save evolution (future)

Current model is one snapshot per user. This is correct for “solo game”.

### Potential upgrades
- Multiple save slots per user (e.g., “Main”, “Experimental”, “Season 2”).
- Soft history (keep last N snapshots).
- Better conflict UI (diff-ish, or “what changed” summary).

---

## Suggested "next work session" order

1. ✅ **Phase 1: Auto-persist character info inputs (debounced).** — COMPLETE
2. ✅ **Phase 2: Event-driven auto-sync (debounced on change).** — COMPLETE
3. ✅ **Phase 3: Expansion manifest + data validation + UI/logic separation.** — COMPLETE
4. **Phase 4: UX improvements (toasts, status indicators).** — NEXT
5. Phase 5: Optional - Move from Jekyll-as-app to "app shell"
6. Phase 6: Cloud save evolution (multiple save slots, history)

---

## Notes / reminders

- Jekyll `_config.yml` changes require restarting the server.
- Supabase redirect URLs must include whatever URL is in the browser bar (localhost vs GitHub Pages).
- Keep RLS on for any browser-accessible tables.


