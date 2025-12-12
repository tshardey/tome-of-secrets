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

`scripts/generate-data.js` converts JSON → JS exports consumed by the site (`assets/js/character-sheet/data.json-exports.js`) and re-exported via `assets/js/character-sheet/data.js`. Use detailed JSON as the single source of truth (e.g., `sideQuestsDetailed.json`, `curseTableDetailed.json`); legacy shapes are derived programmatically inside `data.js` for backward compatibility.

**Steps (JSON-first workflow):**
1. Edit the appropriate JSON file under `assets/data/` (e.g., add an item to `allItems.json`)
2. Run the generator:
   ```bash
   node scripts/generate-data.js
   ```
3. If UI needs to render new content, update the relevant renderer:
   - Character Sheet: `/assets/js/character-sheet/ui.js` and `/assets/js/character-sheet.js`
     - Example: curses dropdown is populated from `curseTableDetailed` at runtime (no hardcoded options)
   - Rewards page: `/assets/js/page-renderers/rewardsRenderer.js`
   - Sanctum page: `/assets/js/page-renderers/sanctumRenderer.js`
   - Keeper page: `/assets/js/page-renderers/keeperRenderer.js`
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
4. **Add validation for the new state** in `/assets/js/character-sheet/dataValidator.js` (see [Data Validation](#data-validation))
5. Update `loadState()` and `saveState()` in `/assets/js/character-sheet/state.js` if needed (validation is automatic)
6. Add StateAdapter methods if the state needs mutations (see [StateAdapter Pattern](#stateadapter-pattern))

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

**Then add validation in dataValidator.js:**
```javascript
// In validateCharacterState() function
validated[STORAGE_KEYS.NEW_FEATURE_DATA] = validateStringArray(
    state[STORAGE_KEYS.NEW_FEATURE_DATA],
    STORAGE_KEYS.NEW_FEATURE_DATA
);
// Or use validateItemArray(), validateQuestArray(), etc. depending on data type
```

### Data Validation

**All persistent state is automatically validated on load.** The validation system ensures data consistency and handles corrupted data gracefully.

**Validation happens automatically:**
- When `loadState()` is called, data is validated via `validateCharacterState()`
- Invalid data is fixed or uses safe defaults (never lost)
- Validated data is saved back to localStorage for consistency

**When adding new state, you must add a validator:**

1. **For arrays of strings** (e.g., learned abilities, selected genres):
   ```javascript
   // In dataValidator.js, validateCharacterState() function
   validated[STORAGE_KEYS.NEW_STRING_ARRAY] = validateStringArray(
       state[STORAGE_KEYS.NEW_STRING_ARRAY],
       STORAGE_KEYS.NEW_STRING_ARRAY
   );
   ```

2. **For arrays of objects** (e.g., quests, items, curses):
   ```javascript
   // Use existing validators or create new ones
   validated[STORAGE_KEYS.NEW_QUEST_ARRAY] = validateQuestArray(
       state[STORAGE_KEYS.NEW_QUEST_ARRAY],
       STORAGE_KEYS.NEW_QUEST_ARRAY
   );
   
   validated[STORAGE_KEYS.NEW_ITEM_ARRAY] = validateItemArray(
       state[STORAGE_KEYS.NEW_ITEM_ARRAY],
       STORAGE_KEYS.NEW_ITEM_ARRAY
   );
   ```

3. **For objects** (e.g., atmospheric buffs):
   ```javascript
   validated[STORAGE_KEYS.NEW_OBJECT] = validateAtmosphericBuffs(
       state[STORAGE_KEYS.NEW_OBJECT]
   );
   // Or create a custom validator function
   ```

4. **For numbers**:
   ```javascript
   validated[STORAGE_KEYS.NEW_NUMBER] = validateNumber(
       state[STORAGE_KEYS.NEW_NUMBER],
       0, // default value
       STORAGE_KEYS.NEW_NUMBER
   );
   ```

**Creating custom validators:**
- Follow the pattern of existing validators in `dataValidator.js`
- Always return safe defaults for invalid data
- Log warnings for invalid data (use `console.warn`)
- Never throw errors or lose player data

### Schema Versioning and Migrations

**When the data structure changes, you need to create a migration:**

1. **Increment schema version** in `dataValidator.js`:
   ```javascript
   export const SCHEMA_VERSION = 2; // Increment from current version
   ```

2. **Create migration function** in `dataMigrator.js`:
   ```javascript
   function migrateToVersion2(state) {
       const migrated = { ...state };
       
       // Example: Add new field to all quests
       const questKeys = [
           STORAGE_KEYS.ACTIVE_ASSIGNMENTS,
           STORAGE_KEYS.COMPLETED_QUESTS,
           STORAGE_KEYS.DISCARDED_QUESTS
       ];
       
       questKeys.forEach(key => {
           if (Array.isArray(migrated[key])) {
               migrated[key] = migrated[key].map(quest => ({
                   ...quest,
                   newField: quest.newField || 'defaultValue' // Add new field
               }));
           }
       });
       
       return migrated;
   }
   ```

3. **Add migration case** in `migrateState()` function:
   ```javascript
   switch (nextVersion) {
       case 1:
           migratedState = migrateToVersion1(migratedState);
           break;
       case 2:
           migratedState = migrateToVersion2(migratedState); // Add new case
           break;
       // ... future migrations
   }
   ```

**Migration principles:**
- Migrations are incremental (version N → N+1 → N+2)
- Always preserve existing data
- Add missing fields with safe defaults
- Never remove data (mark as deprecated instead)
- Test migrations with real save data

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

### Character Sheet Features (Controller-Based Architecture)

**Architecture Overview:**

The character sheet now uses a **controller-based architecture** for better maintainability and separation of concerns. All feature-specific event handling is handled by dedicated controllers in `/assets/js/controllers/`.

**Existing Controllers:**
- `CharacterController` - Character info changes (level, background, school, sanctum)
- `AbilityController` - Ability learning/forgetting
- `InventoryController` - Inventory/equipment management
- `QuestController` - Quest management (adding, editing, completing, discarding)
- `CurseController` - Curse functionality
- `BuffController` - Temporary and atmospheric buffs
- `EndOfMonthController` - End of month processing

**Adding a New Feature Controller:**

1. **Create a new controller** extending `BaseController`:
   ```javascript
   // In assets/js/controllers/NewFeatureController.js
   import { BaseController } from './BaseController.js';
   
   export class NewFeatureController extends BaseController {
       initialize() {
           const { stateAdapter } = this;
           const { ui: uiModule } = this.dependencies;
           
           if (!uiModule) return;
           
           // Get DOM elements
           const newFeatureButton = document.getElementById('new-feature-button');
           
           if (!newFeatureButton) return;
           
           // Set up event listeners
           this.addEventListener(newFeatureButton, 'click', () => {
               // Use StateAdapter for state changes
               stateAdapter.setNewFeatureData(newData);
               
               // Update UI
               uiModule.renderNewFeature();
               
               // Persist form data (inherited from BaseController)
               this.saveState();
           });
       }
       
       // Optional: Handle delegated clicks from main handler
       handleClick(target) {
           if (target.classList.contains('new-feature-action')) {
               // Handle click
               return true; // Return true if handled
           }
           return false;
       }
   }
   ```

2. **Register the controller** in `character-sheet.js`:
   ```javascript
   // Import the controller
   import { NewFeatureController } from './controllers/NewFeatureController.js';
   
   // Create and initialize the controller
   const newFeatureController = new NewFeatureController(stateAdapter, form, dependencies);
   newFeatureController.initialize();
   
   // Add to delegated click handler (if needed)
   form.addEventListener('click', (e) => {
       const target = e.target;
       // ... existing handlers ...
       if (newFeatureController.handleClick && newFeatureController.handleClick(target)) {
           return;
       }
   });
   ```

3. **Add tests** in `/tests/controllers.test.js`:
   ```javascript
   describe('NewFeatureController', () => {
       it('should initialize and set up event listeners', () => {
           const controller = new NewFeatureController(stateAdapter, form, dependencies);
           controller.initialize();
           
           const button = document.getElementById('new-feature-button');
           expect(button).toBeTruthy();
       });
   });
   ```

**BaseController Features:**
- `addEventListener(element, event, handler, options)` - Registers event listeners with automatic cleanup
- `saveState()` - Helper method that calls the saveState dependency
- `destroy()` - Cleans up all registered event listeners
- `stateAdapter` - Reference to the StateAdapter instance
- `form` - Reference to the form element
- `dependencies` - Shared dependencies (ui, data, saveState)

**Pattern for Simple Features (without controllers):**

For very simple features that don't warrant a full controller, you can still add them directly to `initializeCharacterSheet()`:

```javascript
// In initializeCharacterSheet()
const simpleFeatureButton = document.getElementById('simple-feature-button');
if (simpleFeatureButton) {
    simpleFeatureButton.addEventListener('click', () => {
        // Use StateAdapter for state changes
        stateAdapter.setSimpleFeatureData(newData);
        
        // Update UI
        ui.renderSimpleFeature();
        
        // Persist form data
        saveState(form);
    });
}
```

**Best Practices:**
- **Use controllers** for feature areas with multiple related interactions
- **Use direct event listeners** in main init for very simple one-off features
- **Always use StateAdapter** for state mutations (never modify `characterState` directly)
- **Always call `this.saveState()`** or `saveState(form)` after mutations
- **Populate dynamic dropdowns/tables** from JSON data (avoid hardcoding options)
- **Add delegated click handlers** to the main form click handler if you need to handle clicks on dynamically generated elements

### UI Rendering

**Location:** `/assets/js/character-sheet/ui.js`

**Pattern:**
- Export functions that render specific UI sections
- Use template literals for HTML generation
- Access state through `characterState` or StateAdapter
- Keep rendering logic separate from business logic
- Prefer dedicated page renderers for content hydration:
  - `assets/js/page-renderers/rewardsRenderer.js`
  - `assets/js/page-renderers/sanctumRenderer.js`
  - `assets/js/page-renderers/keeperRenderer.js`
  - `assets/js/table-renderer.js` for rules tables across pages

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

### Data Shapes and Derivations

- Keep detailed JSON as the source of truth (e.g., `sideQuestsDetailed.json`, `curseTableDetailed.json`).
- If legacy/flattened shapes are needed by existing code, derive them in `assets/js/character-sheet/data.js` rather than duplicating JSON files.
- Example derivations implemented:
  - `sideQuests`: built from `sideQuestsDetailed` for dropdown labels
  - `curseTable`: built from `curseTableDetailed` with normalized `requirement` values (strips “You must ” prefix and trailing period)

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
- [ ] Add default value to `createEmptyCharacterState()` (if persistent state)
- [ ] **Add validation in `dataValidator.js`** (if persistent state - REQUIRED)
- [ ] Add StateAdapter methods (if state mutations needed)
- [ ] Update `loadState()`/`saveState()` (if new persistent state - validation is automatic)
- [ ] Add UI rendering functions to `ui.js` (if UI changes)
- [ ] Create a controller in `/assets/js/controllers/` (if feature has multiple interactions)
  - OR wire up event listeners directly in `character-sheet.js` (for simple features)
- [ ] Register controller in `character-sheet.js` (if using a controller)
- [ ] Add delegated click handler if needed (for dynamically generated elements)
- [ ] Write tests for new functionality (including validation tests, controller tests if applicable)
- [ ] Run full test suite: `cd tests && npm test`
- [ ] Verify manual testing in browser

When changing data structure (schema change):

- [ ] Increment `SCHEMA_VERSION` in `dataValidator.js`
- [ ] Create migration function in `dataMigrator.js`
- [ ] Add migration case to `migrateState()` function
- [ ] Test migration with existing save data
- [ ] Update validation if structure changed

---

## Common Patterns

### Adding a New Quest Type

1. Add quest data to `data.js` (or future JSON file)
2. Create a quest handler in `/assets/js/quest-handlers/`
3. Register handler in `QuestHandlerFactory.js`
4. Add reward values to `gameConfig.js` if needed
5. Update `QuestController` in `/assets/js/controllers/QuestController.js` if the new quest type requires special handling
6. Update UI to handle new quest type

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

