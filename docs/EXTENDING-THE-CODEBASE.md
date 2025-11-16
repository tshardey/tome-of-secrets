# Extending the Codebase

**Last Updated:** 2025-01-27

This guide provides straightforward instructions for adding new features to the Tome of Secrets codebase while maintaining consistency and quality.

## Table of Contents

1. [Adding New Game Content](#adding-new-game-content)
2. [Adding New State/Data](#adding-new-statedata)
3. [Adding New UI Features](#adding-new-ui-features)
4. [Following Existing Patterns](#following-existing-patterns)
5. [Testing Requirements](#testing-requirements)

---

## Adding New Game Content

### Items, Rewards, Quests, etc.

**Current Location (JSON source of truth):** `/assets/data/*.json`  
`scripts/generate-data.js` converts JSON → JS exports consumed by the site (`assets/js/character-sheet/data.json-exports.js`) and re-exported via `assets/js/character-sheet/data.js`.

**Steps (JSON-first workflow):**
1. Edit the appropriate JSON file under `assets/data/` (e.g., add an item to `allItems.json`)
2. Run the generator:
   ```bash
   node scripts/generate-data.js
   ```
3. If UI needs to render new content, update the relevant renderer:
   - Character Sheet: `/assets/js/character-sheet/ui.js` and `/assets/js/character-sheet.js`
   - Rewards page: `/assets/js/page-renderers/rewardsRenderer.js`
   - Tables (Dungeons/Quests/Shroud): `/assets/js/table-renderer.js`
4. Add tests in `/tests/*.test.js` as needed

**Example - Adding a New Item:**
```json
// In assets/data/allItems.json
{
  "New Item Name": {
    "type": "Wearable",
    "img": "assets/images/rewards/new-item-name.png",
    "bonus": "Description of the item's bonus."
  }
}
```

Then run:
```bash
node scripts/generate-data.js
```

---

## Adding New State/Data

### Persistent State (localStorage)

**Required Steps:**
1. Add the storage key to `/assets/js/character-sheet/storageKeys.js`
2. Add the key to `CHARACTER_STATE_KEYS` array if it should be persisted
3. Add default value to `createEmptyCharacterState()` function
4. Update `loadState()` and `saveState()` in `/assets/js/character-sheet/state.js` if needed
5. Add StateAdapter methods if the state needs mutations (see [StateAdapter Pattern](#stateadapter-pattern))

**Example - Adding a New Persistent State:**
```javascript
// In storageKeys.js
export const STORAGE_KEYS = Object.freeze({
    // ... existing keys
    NEW_FEATURE_DATA: 'newFeatureData'
});

export const CHARACTER_STATE_KEYS = Object.freeze([
    // ... existing keys
    STORAGE_KEYS.NEW_FEATURE_DATA
]);

export function createEmptyCharacterState() {
    return {
        // ... existing state
        [STORAGE_KEYS.NEW_FEATURE_DATA]: [] // or {} or default value
    };
}
```

### StateAdapter Pattern

If your new state needs to be mutated (added, removed, updated), add methods to `/assets/js/character-sheet/stateAdapter.js`:

1. Add a change event to the `EVENTS` object
2. Add the key to `LIST_EVENTS` if it's an array
3. Add getter/setter methods following existing patterns
4. Emit change events when state mutates

**Example:**
```javascript
// In stateAdapter.js
import { safeSetJSON } from '../utils/storage.js';

const EVENTS = Object.freeze({
    // ... existing events
    NEW_FEATURE_CHANGED: 'newFeatureChanged'
});

const LIST_EVENTS = Object.freeze({
    // ... existing mappings
    [STORAGE_KEYS.NEW_FEATURE_DATA]: EVENTS.NEW_FEATURE_CHANGED  // If it's an array
});

// For array-based state, use _mutateList pattern:
getNewFeatureData() {
    return this.state[STORAGE_KEYS.NEW_FEATURE_DATA];
}

addNewFeatureData(item) {
    const { value } = this._mutateList(STORAGE_KEYS.NEW_FEATURE_DATA, list => {
        if (!item) return { changed: false };
        list.push(item);
        return { changed: true, value: item };
    });
    return value || null;
}

// For simple object/primitive state:
setNewFeatureData(data) {
    this.state[STORAGE_KEYS.NEW_FEATURE_DATA] = data;
    safeSetJSON(STORAGE_KEYS.NEW_FEATURE_DATA, data);
    this.emit(EVENTS.NEW_FEATURE_CHANGED, data);
    return data;
}
```

---

## Adding New UI Features

### Character Sheet Features

**Location:** `/assets/js/character-sheet.js`

**Pattern:**
1. Get DOM elements in the initialization function
2. Set up event listeners
3. Use StateAdapter for state mutations
4. Call UI rendering functions from `/assets/js/character-sheet/ui.js`
5. Call `saveState(form)` after mutations

**Example:**
```javascript
// In initializeCharacterSheet()
const newFeatureButton = document.getElementById('new-feature-button');
if (newFeatureButton) {
    newFeatureButton.addEventListener('click', () => {
        // Use StateAdapter for state changes
        stateAdapter.setNewFeatureData(newData);
        
        // Update UI
        ui.renderNewFeature();
        
        // Persist form data
        saveState(form);
    });
}
```

### UI Rendering

**Location:** `/assets/js/character-sheet/ui.js`

**Pattern:**
- Export functions that render specific UI sections
- Use template literals for HTML generation
- Access state through `characterState` or StateAdapter
- Keep rendering logic separate from business logic

---

## Following Existing Patterns

### Configuration Values

**Never hardcode magic numbers or configuration values.**

✅ **Do:**
```javascript
import { GAME_CONFIG } from './config/gameConfig.js';
const reward = GAME_CONFIG.rewards.extraCredit.paperScraps;
```

❌ **Don't:**
```javascript
const reward = 10; // Magic number
```

**Adding new config values:**
1. Add to `/assets/js/config/gameConfig.js`
2. Use the config value in your code
3. Add tests in `/tests/gameConfig.test.js`

### State Mutations

**Use StateAdapter for state changes when available.**

✅ **Do:**
```javascript
stateAdapter.addActiveQuests(newQuests);
```

❌ **Don't:**
```javascript
characterState.activeAssignments.push(newQuest);
```

**If StateAdapter doesn't have a method yet:**
1. Add it to StateAdapter following existing patterns (preferred)
2. Use `_mutateList()` for array operations or direct assignment for simple values
3. Always use `safeSetJSON()` for localStorage persistence (never `localStorage.setItem` directly)
4. Emit change events for UI reactivity

### Storage Keys

**Always use STORAGE_KEYS constants and utility functions.**

✅ **Do:**
```javascript
import { STORAGE_KEYS } from './character-sheet/storageKeys.js';
import { safeGetJSON } from './utils/storage.js';

const data = safeGetJSON(STORAGE_KEYS.ACTIVE_ASSIGNMENTS, []);
```

❌ **Don't:**
```javascript
localStorage.getItem('activeAssignments'); // Magic string
JSON.parse(localStorage.getItem('activeAssignments')) || []; // Unsafe parsing
```

### Utility Functions

**Use utility functions from `/assets/js/utils/` instead of inline logic.**

✅ **Do:**
```javascript
import { parseIntOr, trimOrEmpty, safeGetJSON } from './utils/helpers.js';
import { safeGetJSON } from './utils/storage.js';

const value = parseIntOr(input.value, 0);
const name = trimOrEmpty(formInput.value);
const data = safeGetJSON(STORAGE_KEYS.MY_DATA, []);
```

❌ **Don't:**
```javascript
const value = parseInt(input.value, 10) || 0; // Inline parsing
const name = input.value.trim(); // No null check
const data = JSON.parse(localStorage.getItem('myData')) || []; // Unsafe
```

---

## Testing Requirements

### Minimum Testing

1. **Unit tests** for new functions/classes
2. **Integration tests** for new features that interact with existing code
3. **State persistence tests** if adding new persistent state

### Test Locations

- Unit tests: `/tests/[featureName].test.js`
- State tests: `/tests/statePersistence.test.js` or `/tests/stateAdapter.test.js`
- Config tests: `/tests/gameConfig.test.js`

### Running Tests

```bash
cd tests
npm test                    # Run all tests
npm test -- [pattern]       # Run specific tests
```

### Test Requirements

- All tests must pass before committing
- New features should have corresponding tests
- Update existing tests if you change behavior

---

## Quick Reference Checklist

When adding a new feature:

- [ ] Add configuration values to `gameConfig.js` (if applicable)
- [ ] Add storage keys to `storageKeys.js` (if persistent state)
- [ ] Add StateAdapter methods (if state mutations needed)
- [ ] Update `loadState()`/`saveState()` (if new persistent state)
- [ ] Add UI rendering functions to `ui.js` (if UI changes)
- [ ] Wire up event listeners in `character-sheet.js` (if interactive)
- [ ] Write tests for new functionality
- [ ] Run full test suite: `cd tests && npm test`
- [ ] Verify manual testing in browser

---

## Common Patterns

### Adding a New Quest Type

1. Add quest data to `data.js` (or future JSON file)
2. Create a quest handler in `/assets/js/quest-handlers/`
3. Register handler in `QuestHandlerFactory.js`
4. Add reward values to `gameConfig.js` if needed
5. Update UI to handle new quest type

### Adding a New Background/School

1. Add data to `data.js` (or future JSON file)
2. Add any bonus values to `gameConfig.js`
3. Update UI rendering in `ui.js`
4. Add tests

### Adding a New Reward Type

1. Add reward value to `gameConfig.js`
2. Update `RewardCalculator.js` if needed
3. Update UI to display new reward type
4. Add tests

---

## Getting Help

- Review existing similar features for patterns
- Check `/docs/REFACTORING-RECOMMENDATIONS.md` for architectural guidance
- Look at test files to understand expected behavior
- Follow the existing code style and structure

---

## Remember

- **Keep it simple** - Follow existing patterns rather than inventing new ones
- **Test your changes** - Run the test suite before committing
- **Update documentation** - If you add a new pattern, document it here
- **Maintain consistency** - Use the established patterns and conventions

