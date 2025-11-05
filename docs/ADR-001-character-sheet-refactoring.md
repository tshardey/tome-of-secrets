# ADR-001: Character Sheet Architecture Refactoring

**Date:** 2025-11-05  
**Technical Story:** Refactor monolithic character sheet into modular, maintainable architecture

## Context and Problem Statement

The Tome of Secrets character sheet began as a simple interface for tracking reading progress but evolved into a complex system managing quests, rewards, inventory, and character progression. The original implementation suffered from:

1. **Monolithic JavaScript file** (`character-sheet.js`) exceeding 900 lines with mixed concerns
2. **Code duplication** in reward calculation logic across multiple quest types
3. **Nested conditionals** making quest creation and editing difficult to understand and extend
4. **Bugs** related to reward calculation (background bonuses not applied consistently, duplicate quest entries)
5. **Poor UI/UX** with an extremely long single-page form that was difficult to navigate on smaller screens
6. **Limited extensibility** - adding new quest types or modifying reward logic required changes in multiple places

The codebase violated DRY (Don't Repeat Yourself) principles and made adding new game content risky and time-consuming.

## Decision Drivers

* Need to maintain and extend the game with new content easily
* Solo developer project requiring clear, maintainable code
* Bug fixes should be localized and not require changes across multiple files
* UI should be accessible on various screen sizes
* Test coverage should be comprehensive and reliable
* Static site architecture (Jekyll + GitHub Pages) must be preserved

## Considered Options

### Option 1: Complete Rewrite with Backend
**Pros:**
- Modern full-stack architecture
- Database for state management
- Better separation of concerns

**Cons:**
- Requires hosting infrastructure (costs)
- Loss of static site simplicity
- Significant development time
- Overkill for solo player game

### Option 2: Incremental Refactoring (Selected)
**Pros:**
- Maintains static site architecture
- Improves code quality without major disruption
- Can be done in phases
- Preserves existing functionality

**Cons:**
- Still client-side JavaScript complexity
- LocalStorage limitations remain

### Option 3: Status Quo
**Pros:**
- No immediate work required

**Cons:**
- Technical debt continues to grow
- Bugs harder to fix
- New features become increasingly difficult to implement

## Decision Outcome

**Chosen option: "Incremental Refactoring"** - We refactored the existing codebase into a modular, service-oriented architecture while maintaining the static site foundation.

### Architecture Changes

#### Phase 1: UI/UX Improvements

**Decision:** Implement tabbed interface for character sheet

**Implementation:**
- Created 7 logical tabs: Character, Abilities, Inventory, Environment, Quests, Archived, Curses
- New `tabs.js` module handles tab switching with localStorage persistence
- New `tabs.css` for mobile-responsive tab styling
- Moved buffs to dedicated "Environment" tab for future room decorator feature

**Benefits:**
- Reduced visual clutter
- Improved mobile experience
- Logical content grouping
- Room for future expansion

#### Phase 2: Code Architecture Refactoring

**Decision 1: Service Pattern for Reward Calculation**

**Implementation:**
```javascript
// Before: Scattered reward logic in multiple places
// After: Centralized RewardCalculator service
class RewardCalculator {
    static getBaseRewards(type, prompt, options) { ... }
    static applyModifiers(baseReward, appliedBuffs) { ... }
    static applyBackgroundBonuses(baseReward, quest, background) { ... }
}

class Reward {
    constructor({ xp, inkDrops, paperScraps, items, modifiedBy }) { ... }
    clone() { ... }
    toJSON() { ... }
}
```

**Location:** `/assets/js/services/RewardCalculator.js`

**Benefits:**
- Single source of truth for reward calculations
- Easier to test and debug
- Clear separation of concerns
- Reward tracking with `modifiedBy` field

**Decision 2: Factory Pattern for Quest Handlers**

**Implementation:**
```javascript
// Before: 200+ lines of nested if/else in single event handler
// After: Separate handler classes for each quest type

class BaseQuestHandler {
    validate() { /* Abstract */ }
    createQuests() { /* Abstract */ }
    static completeActiveQuest(quest, background) { ... }
    static determinePromptForEdit(type, originalQuest, formElements, data) { ... }
}

class DungeonQuestHandler extends BaseQuestHandler { ... }
class GenreQuestHandler extends BaseQuestHandler { ... }
class SideQuestHandler extends BaseQuestHandler { ... }
class ExtraCreditHandler extends BaseQuestHandler { ... }

class QuestHandlerFactory {
    static getHandler(type, formElements, data) { ... }
}
```

**Location:** `/assets/js/quest-handlers/`

**Benefits:**
- Each quest type encapsulated in its own class
- Easy to add new quest types
- Consistent interface via base class
- Testable in isolation
- Reduced cognitive load

**Decision 3: Model Classes**

**Implementation:**
```javascript
class Quest {
    constructor({ type, prompt, month, year, book, notes, buffs, rewards, isEncounter }) { ... }
    isDungeonQuest() { ... }
    isGenreQuest() { ... }
    clone() { ... }
    toJSON() { ... }
    static fromJSON(data) { ... }
}

class Character {
    constructor({ activeAssignments, completedQuests, discardedQuests, inventoryItems, curses }) { ... }
    completeQuest(index) { ... }
    discardQuest(index) { ... }
    addInventoryItem(item) { ... }
    toJSON() { ... }
}
```

**Location:** `/assets/js/models/`

**Benefits:**
- Type safety through validation
- Helper methods for common operations
- Consistent serialization
- Foundation for future features

**Decision 4: DRY "End of Month" Processing**

**Implementation:**
```javascript
// Before: Single button with inline logic
// After: Centralized handler, multiple buttons

const handleEndOfMonth = () => {
    // Process atmospheric buffs
    // Award book completion XP
    // Award journal entry rewards
    // Clear completed books set
    // Process temporary buff expiration
    // Re-render UI
};

document.querySelectorAll('.end-of-month-button')
    .forEach(button => button.addEventListener('click', handleEndOfMonth));
```

**Benefits:**
- Single source of truth for monthly processing
- Buttons in multiple contextually relevant locations
- Easy to maintain and extend

### Positive Consequences

1. **Maintainability:** Code is organized into logical modules with clear responsibilities
2. **Extensibility:** Adding new quest types requires creating a single new handler class
3. **Testability:** 168 tests covering all major functionality (7 test suites)
4. **Bug Fixes:** Fixed 2 critical bugs (duplicate quest entries, missing background bonuses)
5. **UI/UX:** Character sheet now usable on mobile devices
6. **Documentation:** Code is self-documenting with clear class and method names
7. **Future-Ready:** Architecture supports planned features (room decorator, etc.)

### Negative Consequences

1. **Initial Complexity:** More files to navigate (mitigated by clear organization)
2. **Learning Curve:** New contributors need to understand the architecture
3. **Bundle Size:** Slightly larger JavaScript bundle (minimal impact for static site)

## Compliance

The refactoring maintains compliance with all project constraints:

- ✅ Static site architecture (Jekyll + GitHub Pages) preserved
- ✅ No backend/database required
- ✅ LocalStorage for state persistence
- ✅ All tests passing (168/168)
- ✅ No breaking changes to existing saved character data
- ✅ Backward compatibility maintained

## Technical Details

### File Structure

```
tome-of-secrets/
├── assets/js/
│   ├── character-sheet.js           # Main orchestrator (reduced to ~975 lines)
│   ├── main.js                      # Entry point
│   ├── tabs.js                      # Tab navigation logic
│   ├── character-sheet/
│   │   ├── data.js                  # Game data (items, quests, rewards)
│   │   ├── state.js                 # State management & localStorage
│   │   └── ui.js                    # UI rendering functions
│   ├── services/
│   │   └── RewardCalculator.js     # Reward calculation service
│   ├── quest-handlers/
│   │   ├── BaseQuestHandler.js     # Abstract base class
│   │   ├── QuestHandlerFactory.js  # Factory for handler instantiation
│   │   ├── DungeonQuestHandler.js  # Dungeon quest logic
│   │   ├── GenreQuestHandler.js    # Genre quest logic
│   │   ├── SideQuestHandler.js     # Side quest logic
│   │   └── ExtraCreditHandler.js   # Extra credit logic
│   └── models/
│       ├── Quest.js                 # Quest model class
│       └── Character.js             # Character model class
├── assets/css/
│   └── tabs.css                     # Tab navigation styles
├── tests/
│   ├── characterSheet.test.js       # Main character sheet tests
│   ├── questHandlers.test.js        # Quest handler tests (NEW)
│   ├── RewardCalculator.test.js     # Reward calculation tests (NEW)
│   ├── tabs.test.js                 # Tab navigation tests (NEW)
│   └── ...
└── character-sheet.md               # Character sheet HTML structure
```

### Testing Strategy

- **Unit Tests:** RewardCalculator, Quest Handlers
- **Integration Tests:** Character sheet interactions
- **Coverage:** All critical paths tested
- **Framework:** Jest with jsdom for DOM simulation

### Migration Notes

No data migration was required. The refactoring maintains backward compatibility with existing localStorage data structures. The `migrateOldQuests()` function in `state.js` handles any legacy data format conversions.

## Links

- [RewardCalculator Service](/assets/js/services/RewardCalculator.js)
- [Quest Handlers](/assets/js/quest-handlers/)
- [Model Classes](/assets/js/models/)
- [Test Suite](/tests/)
- [Tab System ADR](./ADR-002-tab-navigation-system.md) _(if created separately)_

## Notes

This refactoring was completed in phases to minimize disruption and ensure continuous functionality. All phases were completed with full test coverage before moving to the next phase.

Future phases (not yet implemented):
- Phase 3: Data Strategy (consider extracting game data to JSON files)
- Phase 4: Consider state management library if complexity grows
- Phase 5: Room decorator feature (foundation laid in Environment tab)

