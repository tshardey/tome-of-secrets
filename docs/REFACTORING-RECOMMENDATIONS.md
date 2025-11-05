# Refactoring Recommendations for Tome of Secrets

**Last Updated:** 2025-11-05  
**Status:** Recommendations for Future Work

This document outlines potential refactoring opportunities for the Tome of Secrets codebase. These are not critical issues but rather opportunities to improve code quality, maintainability, and extensibility.

## Priority Levels

- 🔴 **High Priority:** Should be addressed before major feature additions
- 🟡 **Medium Priority:** Worth addressing when working in related areas
- 🟢 **Low Priority:** Nice-to-have improvements, consider when refactoring nearby code

---

## 🟡 1. Data Management Strategy

### Current State
Game data (items, quests, rewards, etc.) is currently in `/assets/js/character-sheet/data.js` as JavaScript exports. This file is 750+ lines and growing.

### Problem
- Difficult to edit game content (requires JavaScript knowledge)
- Potential for syntax errors when adding content
- Data is tightly coupled with code
- Hard to version control content vs. code changes
- No easy way for non-developers to contribute content

### Recommendation

**Option A: Extract to JSON files** (Recommended)
```
assets/data/
  ├── items.json
  ├── quests.json
  ├── rewards.json
  ├── backgrounds.json
  ├── schools.json
  ├── dungeons.json
  └── curses.json
```

**Benefits:**
- Content editable without JavaScript knowledge
- Schema validation possible
- Easier git diffs for content changes
- Could enable future content editor tool
- Separation of concerns

**Implementation:**
1. Create JSON schema for each data type
2. Extract data from `data.js` to individual JSON files
3. Create a `DataLoader` service to fetch and cache JSON
4. Update tests to use test fixtures

**Effort:** Medium (2-3 hours)

---

## 🟢 2. UI Rendering Refactoring

### Current State
The `ui.js` file contains many rendering functions that directly manipulate the DOM using string concatenation and `innerHTML`.

### Problem
```javascript
// Example from ui.js
html += `<tr>
    <td>${quest.month} ${quest.year}</td>
    <td>${quest.type}</td>
    <td>${quest.prompt}</td>
    ...
</tr>`;
```

- Potential XSS vulnerabilities if user input not sanitized
- Hard to maintain complex HTML structures
- No component reusability
- Difficult to test rendering logic in isolation

### Recommendation

**Option A: Template Literals with Sanitization**
```javascript
import { escapeHtml } from './utils/sanitize.js';

function renderQuestRow(quest) {
    return `
        <tr data-quest-id="${escapeHtml(quest.id)}">
            <td>${escapeHtml(quest.month)} ${escapeHtml(quest.year)}</td>
            <td>${escapeHtml(quest.type)}</td>
            <td>${escapeHtml(quest.prompt)}</td>
            ...
        </tr>
    `;
}
```

**Option B: DOM API with Helper Functions**
```javascript
function createQuestRow(quest) {
    const tr = createElement('tr', { 'data-quest-id': quest.id });
    tr.append(
        createElement('td', {}, `${quest.month} ${quest.year}`),
        createElement('td', {}, quest.type),
        createElement('td', {}, quest.prompt)
    );
    return tr;
}
```

**Benefits:**
- Safer against XSS attacks
- More testable
- Clearer code structure
- Could extract reusable components

**Effort:** Low-Medium (1-2 hours per rendering function)

---

## 🔴 3. State Management Improvements

### Current State
State is managed through the `characterState` object with manual `saveState()` calls scattered throughout the codebase.

### Problem
- Easy to forget `saveState()` after mutations
- No state change tracking
- No undo/redo capability
- No state validation
- Direct mutation can lead to bugs

### Recommendation

**Implement Observable State Pattern**
```javascript
class ObservableState {
    constructor(initialState) {
        this._state = initialState;
        this._listeners = [];
        this._history = [];
    }

    get state() {
        return this._state;
    }

    setState(updates) {
        this._history.push(this._state);
        this._state = { ...this._state, ...updates };
        this._notify();
        this._persist();
    }

    subscribe(listener) {
        this._listeners.push(listener);
    }

    _notify() {
        this._listeners.forEach(fn => fn(this._state));
    }

    _persist() {
        localStorage.setItem('characterState', JSON.stringify(this._state));
    }

    undo() {
        if (this._history.length > 0) {
            this._state = this._history.pop();
            this._notify();
            this._persist();
        }
    }
}

// Usage
const characterState = new ObservableState(loadState());
characterState.subscribe((state) => {
    // Auto-render on state changes
    ui.render(state);
});
```

**Benefits:**
- Centralized state mutations
- Automatic persistence
- Undo/redo capability
- Easier debugging (state change history)
- Foundation for future features

**Effort:** Medium-High (4-5 hours)

---

## 🟡 4. Form Validation Extraction

### Current State
Form validation is scattered throughout event handlers with inline validation logic.

### Problem
```javascript
if (!roomNumber) {
    alert('Please select a dungeon room');
    return;
}
if (!month || !year) {
    alert('Please fill in month and year');
    return;
}
```

- Inconsistent error messaging
- Hard to test validation logic
- Duplication across different quest types
- User experience could be better (alerts are intrusive)

### Recommendation

**Create Validation Service**
```javascript
// /assets/js/services/Validator.js
class Validator {
    constructor() {
        this.errors = [];
    }

    required(value, fieldName) {
        if (!value || value.trim() === '') {
            this.errors.push(`${fieldName} is required`);
        }
        return this;
    }

    minLength(value, length, fieldName) {
        if (value && value.length < length) {
            this.errors.push(`${fieldName} must be at least ${length} characters`);
        }
        return this;
    }

    isValid() {
        return this.errors.length === 0;
    }

    showErrors() {
        if (this.errors.length > 0) {
            // Show in a nicer UI element instead of alert()
            const errorDiv = document.getElementById('validation-errors');
            errorDiv.innerHTML = this.errors.map(e => `<p>${e}</p>`).join('');
            errorDiv.style.display = 'block';
        }
    }

    clear() {
        this.errors = [];
        const errorDiv = document.getElementById('validation-errors');
        if (errorDiv) errorDiv.style.display = 'none';
    }
}

// Usage
const validator = new Validator();
validator
    .required(month, 'Month')
    .required(year, 'Year')
    .required(roomNumber, 'Dungeon Room');

if (!validator.isValid()) {
    validator.showErrors();
    return;
}
```

**Benefits:**
- Reusable validation logic
- Consistent error handling
- Better UX (can show errors inline)
- Testable in isolation

**Effort:** Low-Medium (2-3 hours)

---

## 🟢 5. Event Handler Refactoring

### Current State
The main `character-sheet.js` file has many event listeners attached directly in the initialization function.

### Problem
- ~1000 line initialization function
- Event handlers mixed with business logic
- Hard to test event handling separately
- Callback hell in some areas

### Recommendation

**Extract Event Handlers to Controller Classes**
```javascript
// /assets/js/controllers/QuestController.js
class QuestController {
    constructor(state, ui, handlers) {
        this.state = state;
        this.ui = ui;
        this.handlers = handlers;
    }

    handleAddQuest(event) {
        event.preventDefault();
        const formData = this.getFormData();
        const handler = this.handlers.getHandler(formData.type);
        
        if (!handler.validate()) {
            return;
        }

        const quests = handler.createQuests();
        this.state.addQuests(quests);
        this.ui.render();
    }

    handleCompleteQuest(index) {
        const quest = this.state.completeQuest(index);
        this.ui.showNotification(`Completed: ${quest.book}`);
    }

    attachEventListeners() {
        document.getElementById('add-quest-button')
            .addEventListener('click', (e) => this.handleAddQuest(e));
        // ... more listeners
    }
}

// Usage in main file
const questController = new QuestController(characterState, ui, questHandlers);
questController.attachEventListeners();
```

**Benefits:**
- Separation of concerns
- Easier to test
- More maintainable
- Clear responsibility boundaries

**Effort:** Medium (3-4 hours)

---

## 🟢 6. Utility Functions Library

### Current State
Helper functions are scattered throughout various files or duplicated.

### Problem
- Code duplication (e.g., `parseInt` with fallback appears many times)
- No centralized utilities
- Reinventing the wheel

### Recommendation

**Create Utility Library**
```javascript
// /assets/js/utils/helpers.js
export const parseIntOr = (value, defaultValue = 0) => {
    const parsed = parseInt(value, 10);
    return isNaN(parsed) ? defaultValue : parsed;
};

export const capitalize = (str) => {
    return str.charAt(0).toUpperCase() + str.slice(1);
};

export const debounce = (fn, delay) => {
    let timeoutId;
    return (...args) => {
        clearTimeout(timeoutId);
        timeoutId = setTimeout(() => fn(...args), delay);
    };
};

export const groupBy = (array, key) => {
    return array.reduce((acc, item) => {
        const group = item[key];
        acc[group] = acc[group] || [];
        acc[group].push(item);
        return acc;
    }, {});
};

// /assets/js/utils/sanitize.js
export const escapeHtml = (unsafe) => {
    return unsafe
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
};

// /assets/js/utils/currency.js
export const formatCurrency = (amount, type) => {
    const symbols = {
        inkDrops: '💧',
        paperScraps: '📄',
        xp: '⭐'
    };
    return `${symbols[type]} ${amount}`;
};
```

**Benefits:**
- DRY code
- Consistent implementations
- Easy to test
- Reusable across project

**Effort:** Low (1-2 hours)

---

## 🟡 7. Error Handling Strategy

### Current State
Errors are handled inconsistently with `alert()` or `console.error()`.

### Problem
- Poor user experience with alerts
- No error logging
- Hard to debug production issues
- No graceful degradation

### Recommendation

**Implement Error Handling Service**
```javascript
// /assets/js/services/ErrorHandler.js
class ErrorHandler {
    constructor() {
        this.errors = [];
    }

    handle(error, context = {}) {
        const errorInfo = {
            message: error.message,
            stack: error.stack,
            context,
            timestamp: new Date().toISOString()
        };

        this.errors.push(errorInfo);
        this.log(errorInfo);
        this.notify(errorInfo);
    }

    log(errorInfo) {
        console.error('Error:', errorInfo);
        // Could send to analytics service in production
    }

    notify(errorInfo) {
        // Show user-friendly message
        const notification = document.createElement('div');
        notification.className = 'error-notification';
        notification.textContent = 'Something went wrong. Your progress has been saved.';
        document.body.appendChild(notification);
        
        setTimeout(() => notification.remove(), 5000);
    }

    getRecentErrors() {
        return this.errors.slice(-10);
    }
}

// Global error handler
window.addEventListener('error', (event) => {
    errorHandler.handle(event.error, { type: 'uncaught' });
});

// Usage
try {
    processQuest(quest);
} catch (error) {
    errorHandler.handle(error, { 
        action: 'processQuest',
        questId: quest.id 
    });
}
```

**Benefits:**
- Better user experience
- Debugging information
- Graceful error recovery
- Foundation for error analytics

**Effort:** Medium (2-3 hours)

---

## 🟢 8. Test Coverage Improvements

### Current State
Good test coverage (168 tests) but some areas could be expanded.

### Recommendations

**Add Missing Test Coverage:**

1. **Edge Cases**
   - Empty state handling
   - LocalStorage full scenarios
   - Invalid data formats
   - Concurrent state changes

2. **UI Tests**
   - Tab persistence after refresh
   - Form reset functionality
   - Dropdown population
   - Button states (enabled/disabled)

3. **Integration Tests**
   - Complete quest workflows
   - End-to-end user journeys
   - State persistence cycles

4. **Performance Tests**
   - Large inventory handling
   - Many completed quests
   - Rendering performance

**Effort:** Low-Medium (1-2 hours per test suite)

---

## 🟡 9. Configuration Management

### Current State
"Magic numbers" and configuration values are scattered throughout the code.

### Problem
```javascript
const bookCompletionXP = booksCompleted * 15;  // Why 15?
const papersPerEntry = 5;  // Why 5?
if (background === 'scribe') {
    papersPerEntry += 3;  // Why 3?
}
```

### Recommendation

**Create Configuration File**
```javascript
// /assets/js/config/gameConfig.js
export const GAME_CONFIG = {
    rewards: {
        bookCompletionXP: 15,
        journalEntryPaperScraps: 5,
        scribeBonus: 3
    },
    storage: {
        stateKey: 'characterState',
        maxHistorySize: 50
    },
    ui: {
        tabPersistenceKey: 'activeTab',
        notificationDuration: 5000
    },
    atmospheric: {
        baseValue: 1,
        sanctumBonus: 2
    }
};

// Usage
const bookCompletionXP = booksCompleted * GAME_CONFIG.rewards.bookCompletionXP;
```

**Benefits:**
- Easy to adjust game balance
- Self-documenting code
- Centralized tuning
- Easier for non-developers to modify

**Effort:** Low (1 hour)

---

## 🟢 10. Documentation Improvements

### Current State
Good JSDoc comments on new classes, but older code lacks documentation.

### Recommendations

1. **Add JSDoc to all public functions**
   ```javascript
   /**
    * Calculates modified rewards for a quest
    * @param {Object} quest - The quest object
    * @param {string} background - Keeper background key
    * @returns {Reward} Modified reward object
    * @throws {Error} If quest is invalid
    * @example
    * const reward = calculateRewards(quest, 'biblioslinker');
    */
   ```

2. **Create API documentation**
   - Generate with JSDoc or TypeDoc
   - Host on GitHub Pages

3. **Add inline comments for complex logic**
   ```javascript
   // Grove Tender's "Soaking in Nature" buff persists across months
   // All other atmospheric buffs reset at end of month
   const isGroveTenderBuff = background === 'groveTender' && 
                              buffName === 'The Soaking in Nature';
   ```

4. **Create developer guide**
   - How to add new quest types
   - How to add new rewards
   - How to add new backgrounds

**Effort:** Low-Medium (2-3 hours)

---

## 🟡 11. TypeScript Migration (Optional)

### Current State
Pure JavaScript with JSDoc comments for type hints.

### Problem
- No compile-time type checking
- Easy to pass wrong types
- Refactoring is riskier

### Recommendation

**Gradual TypeScript Migration**
```typescript
// Start with interfaces/types
interface Quest {
    type: QuestType;
    prompt: string;
    month: string;
    year: string;
    book?: string;
    notes?: string;
    buffs: string[];
    rewards: Reward;
    isEncounter?: boolean;
}

type QuestType = '♠ Dungeon Crawl' | '♥ Organize the Stacks' | 
                 '♣ Side Quest' | '⭐ Extra Credit';

// Migrate one file at a time
class RewardCalculator {
    static getBaseRewards(
        type: QuestType, 
        prompt: string, 
        options: RewardOptions = {}
    ): Reward {
        // ...
    }
}
```

**Benefits:**
- Catch errors at compile time
- Better IDE autocomplete
- Self-documenting code
- Easier refactoring

**Drawbacks:**
- Learning curve
- Build step required
- More tooling complexity

**Effort:** High (8-10 hours for full migration)

**Recommendation:** Only consider if project grows significantly or needs multiple contributors.

---

## 🟢 12. Performance Optimizations

### Current State
Performance is generally good, but could be improved for edge cases.

### Recommendations

1. **Debounce state saves**
   ```javascript
   const debouncedSave = debounce(saveState, 500);
   // Use debouncedSave instead of saveState for frequent updates
   ```

2. **Lazy load game data**
   ```javascript
   // Only load dungeon data when dungeon tab is opened
   ```

3. **Virtual scrolling for large lists**
   ```javascript
   // For completed quests list if it gets very long
   ```

4. **Memoize expensive calculations**
   ```javascript
   const memoizedRewardCalc = memoize(RewardCalculator.getBaseRewards);
   ```

**Effort:** Low-Medium per optimization (1-2 hours each)

---

## Implementation Strategy

### Recommended Order

1. **Phase 1: Low-Hanging Fruit** (1-2 weeks)
   - Configuration management
   - Utility functions library
   - Documentation improvements
   - Validation service

2. **Phase 2: Medium Priority** (2-3 weeks)
   - Data management strategy (JSON extraction)
   - Form validation
   - Error handling
   - UI rendering improvements

3. **Phase 3: Architectural** (3-4 weeks, as needed)
   - State management improvements
   - Event handler refactoring
   - Test coverage expansion

4. **Phase 4: Optional Enhancements**
   - TypeScript migration (if needed)
   - Performance optimizations
   - Advanced features

### When to Refactor

- ✅ **Do refactor when:**
  - Adding a new feature in the same area
  - Fixing a bug caused by unclear code
  - Code is touched for other reasons
  - Technical debt is blocking new features

- ❌ **Don't refactor when:**
  - Code is working and not being changed
  - Just because it "could be better"
  - Under time pressure for feature delivery
  - No tests exist for the area

### Success Metrics

- ✅ All tests continue to pass
- ✅ No regression bugs introduced
- ✅ Code is more readable/maintainable
- ✅ Easier to add new content/features
- ✅ Improved performance (if that was a goal)

---

## Conclusion

These recommendations represent opportunities for improvement rather than critical issues. The codebase is currently in good shape after the Phase 2 refactoring (ADR-001). 

**Priority for immediate work:**
1. Configuration management (quick win)
2. Data extraction to JSON (enables easier content creation)
3. Better error handling (improves UX)

**Consider for later:**
- TypeScript migration (only if team grows)
- Advanced state management (only if complexity increases significantly)

Remember: **Perfect is the enemy of good.** Focus refactoring efforts on areas that are actively causing pain or blocking new features.

