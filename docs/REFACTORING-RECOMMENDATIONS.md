# Refactoring Progress for Tome of Secrets

**Last Updated:** 2025-11-16  
**Status:** Foundation Complete — Focus on Robustness & Extensibility

## Purpose

Track refactoring work to ensure the character sheet is robust, scalable, and extensible before adding new features. Focus on frontend best practices, DRY/KISS principles, and making it easy to add new game content.

---

## ✅ Completed Refactoring Work

### 1. Data Management (JSON-First Architecture)
**Status:** ✅ Complete

- JSON files in `assets/data/*` are the single source of truth
- Generator script creates consistent data structure (runs locally and in CI)
- All pages hydrate from JSON at runtime (rewards, sanctums, keeper backgrounds, shroud)
- Character sheet dropdowns populate from JSON (no hardcoded lists)
- Link consistency and slugification unified across codebase

**Impact:** Adding new items/content only requires updating JSON files. No code changes needed for new rewards, sanctums, backgrounds, etc.

### 2. Utility Functions Library
**Status:** ✅ Complete

- Created `/assets/js/utils/` with centralized helpers
- Safe localStorage operations (`safeGetJSON`, `safeSetJSON`, `safeRemoveJSON`)
- String sanitization (`escapeHtml`, `sanitizeString`)
- Common helpers (`parseIntOr`, `trimOrEmpty`, `capitalize`, `debounce`, `groupBy`)

**Impact:** DRY code, consistent implementations, safer operations. 40 tests added.

### 3. Storage Keys Centralization
**Status:** ✅ Complete

- Created `/assets/js/character-sheet/storageKeys.js`
- All localStorage keys defined as constants in one place
- Eliminated magic strings throughout codebase

**Impact:** Easy to see all stored state, prevents typos, easier to track data schema.

### 4. StateAdapter Pattern
**Status:** ✅ Complete

- Created `/assets/js/character-sheet/stateAdapter.js`
- Centralized state mutations for all operations (quests, inventory, curses, buffs, abilities)
- Event-driven system for reactive UI updates
- Automatic localStorage synchronization on all mutations
- Built-in validation and sanitization

**Impact:** All state changes go through one place, automatic persistence, event-driven UI. Comprehensive tests added (245 total tests).

### 5. Configuration Management
**Status:** ✅ Complete

- Created `/assets/js/config/gameConfig.js`
- All reward values, bonuses, and game constants centralized
- No magic numbers in business logic

**Impact:** Game balance changes require only config edits. Self-documenting code.

### 6. Test Coverage
**Status:** ✅ Complete (187 tests passing)

- State management and persistence tests
- Data structure validation tests
- Game configuration tests
- Utility function tests

---

## 🎯 Top 5 Refactoring Priorities

These priorities focus on robustness, data consistency, and extensibility before adding new features.

### Priority 1: Calculation Audit & Centralization
**Status:** ✅ Complete (2025-01-27)

**Goal:** Ensure all reward calculations are correct, consistent, and in one place

**Completed Work:**
- ✅ Extended RewardCalculator with end-of-month calculation methods:
  - `calculateBookCompletionRewards()` - Book completion XP
  - `calculateJournalEntryRewards()` - Journal entry paper scraps with Scribe bonus
  - `calculateAtmosphericBuffRewards()` - Atmospheric buff ink drops
- ✅ Refactored `handleEndOfMonth()` to use centralized RewardCalculator methods
- ✅ Audited all background bonuses - confirmed consistent application:
  - Biblioslinker: Automatic +3 Paper Scraps for Dungeon Crawls
  - Scribe's Acolyte: Automatic +3 Paper Scraps per journal entry at end of month
  - Grove Tender: Automatic atmospheric buff (handled separately)
  - Archivist/Prophet/Cartographer: Manual via buffs dropdown (+10 Ink Drops)
- ✅ Added comprehensive tests (39 tests total, all passing):
  - Base reward calculations
  - Modifier applications
  - Background bonuses
  - End-of-month calculations (book completion, journal entries, atmospheric buffs)
  - Edge cases (negative inputs, zero values, large numbers)

**Impact:**
- All calculation logic centralized in RewardCalculator service
- Single calculation path for each reward type
- All bonuses applied consistently
- Comprehensive test coverage (39 tests)
- Easier to maintain and extend in the future

---

### Priority 2: Data Consistency Validation
**Goal:** Ensure localStorage data stays consistent and valid

**Current Issues:**
- No validation when loading from localStorage
- Possible corruption if data schema changes
- No migration strategy for saved games
- Missing fields could cause crashes

**What Needs Work:**
- Create data validation layer that runs on state load
- Add schema version to saved data
- Implement migration functions for schema changes
- Validate all array items and nested objects
- Handle missing/corrupted data gracefully

**Risks:**
- **Backwards Compatibility:** High - Need to handle all existing save formats
- **Data Loss:** Medium - Must not lose player progress during validation

**Effort:** Medium (5-7 hours)

**Success Criteria:**
- All loaded data is validated before use
- Schema version tracking in place
- Migration system for handling old saves
- Graceful handling of invalid/corrupted data
- Tests for various corrupted data scenarios

---

### Priority 3: UI Rendering Refactor (Security & Reusability)
**Goal:** Make rendering safer, more testable, and reusable

**Current Issues:**
- String concatenation with `innerHTML +=` throughout `ui.js`
- Potential XSS vulnerabilities with user input
- Hard to maintain complex HTML structures
- No component reusability
- Difficult to test rendering in isolation

**What Needs Work:**
- Wrap all rendering with sanitization (use existing `escapeHtml`)
- Extract reusable rendering functions (quest rows, reward cards, etc.)
- Create small DOM helper utilities for common patterns
- Move rendering logic into testable functions

**Risks:**
- **Backwards Compatibility:** Low - Visual changes only
- **Breaking Changes:** Low - Pure refactor, no logic changes

**Effort:** Medium (4-6 hours)

**Success Criteria:**
- All user-generated content is sanitized before rendering
- Reusable render functions for common UI elements
- No `innerHTML +=` without sanitization
- Rendering logic is testable in isolation

---

### Priority 4: Form Validation Extraction
**Goal:** Consistent, reusable validation with better UX

**Current Issues:**
- Validation logic scattered in event handlers
- Inconsistent error messages
- Intrusive `alert()` calls
- Duplicate validation code across quest types
- Hard to test validation logic

**What Needs Work:**
- Create centralized Validator service
- Reusable validation rules (required, minLength, etc.)
- Inline error display (replace alerts)
- Apply to all forms (quests, inventory, buffs, etc.)

**Risks:**
- **Backwards Compatibility:** Low - Validation logic stays the same
- **UX Changes:** Medium - Different error display (improvement)

**Effort:** Low-Medium (3-4 hours)

**Success Criteria:**
- Single Validator service used everywhere
- No duplicate validation logic
- All alerts replaced with inline errors
- Validation logic has unit tests

---

### Priority 5: Event Handler Extraction (Controllers)
**Goal:** Separate event wiring from business logic for maintainability

**Current Issues:**
- ~1000 line initialization function in `character-sheet.js`
- Event handlers mixed with business logic
- Hard to test event handling separately
- Difficult to add new features without touching main init

**What Needs Work:**
- Extract controllers for major features (QuestController, InventoryController, etc.)
- Controllers wire events and delegate to state/UI
- Slim down main initialization
- Clear boundaries between concerns

**Risks:**
- **Backwards Compatibility:** Low - Internal refactor only
- **Breaking Changes:** Low - No logic changes

**Effort:** Medium-High (6-8 hours)

**Success Criteria:**
- Main init function < 200 lines
- Controllers handle feature-specific events
- Clear separation between event wiring and logic
- Easy to add new features by creating new controllers

---

## 📊 Progress Tracking

| Priority | Status | Completion |
|----------|--------|------------|
| Calculation Audit & Centralization | ✅ Complete | 100% |
| Data Consistency Validation | 🔴 Not Started | 0% |
| UI Rendering Refactor | 🔴 Not Started | 0% |
| Form Validation Extraction | 🔴 Not Started | 0% |
| Event Handler Extraction | 🔴 Not Started | 0% |

**Legend:**
- 🔴 Not Started
- 🟡 In Progress
- 🟢 Needs Testing
- ✅ Complete

---

## 🚫 Explicitly Deferred

These are intentionally not priorities right now:

- **Performance Optimizations** - Current performance is acceptable
- **TypeScript Migration** - Adds complexity for solo project
- **Extensive Documentation** - Keep it pragmatic, add as needed
- **Advanced Features** - Focus on robustness before new features

---

## Notes

### Why These 5?

1. **Calculations** - Core to game mechanics, must be correct and consistent
2. **Data Validation** - Prevents crashes and data loss, essential for reliability
3. **UI Rendering** - Security and maintainability, blocks future UI work
4. **Form Validation** - UX improvement and DRY, touches many features
5. **Controllers** - Makes codebase extensible, enables future features

### Order of Work

Recommended order: **1 → 2 → 3 → 4 → 5**

- Priorities 1-2 address data integrity concerns (calculations, localStorage)
- Priority 3 improves safety and testability
- Priorities 4-5 improve structure and extensibility

Can work in parallel on 3-5 since they don't overlap much.

### Adding New Content After Refactoring

Once complete, adding new content will be straightforward:

- **New reward item:** Update JSON, add image, done
- **New quest type:** Add config, create handler, wire to controller
- **New background:** Update JSON, tests validate structure
- **New mechanic:** Config + StateAdapter method + tests

---

## Maintenance

Update this document as you:
- Complete priorities (move to ✅ section with date)
- Start new work (update status emoji)
- Discover new issues (add to priorities or notes)
- Change priorities (reorder with justification)

Keep it concise. Delete outdated information. Focus on what's next.
