# Extending the Codebase

**Last Updated:** 2026-01-12

This guide provides straightforward instructions for adding new features to the Tome of Secrets codebase while maintaining consistency and quality.

## Table of Contents

1. [Adding New Game Content](#adding-new-game-content)
2. [Adding New State/Data](#adding-new-statedata)
3. [Adding New UI Features](#adding-new-ui-features)
4. [Service Extraction Pattern](#service-extraction-pattern)
5. [View Model Pattern](#view-model-pattern)
6. [Pure UI Renderer Pattern](#pure-ui-renderer-pattern)
7. [Following Existing Patterns](#following-existing-patterns)
8. [Testing Requirements](#testing-requirements)

---

## Adding New Game Content

### Items, Rewards, Quests, etc.

**Current Location (JSON source of truth):** `/assets/data/*.json`

`scripts/generate-data.js` converts JSON → JS exports consumed by the site (`assets/js/character-sheet/data.json-exports.js`) and re-exported via `assets/js/character-sheet/data.js`. Use detailed JSON as the single source of truth (e.g., `sideQuestsDetailed.json`, `curseTableDetailed.json`); legacy shapes are derived programmatically inside `data.js` for backward compatibility.

**Steps (JSON-first workflow):**
1. Edit the appropriate JSON file under `assets/data/` (e.g., add an item to `allItems.json`)
   - **Important**: All content must have a stable `id` field (kebab-case format, e.g., `"new-item-name"`)
   - Keep existing `name` field for display purposes
   - See [Stable IDs](#stable-ids) for more details
2. Run the generator:
   ```bash
   node scripts/generate-data.js
   ```
3. Run data validation to catch any issues:
   ```bash
   cd tests && npm run validate-data
   ```
4. If UI needs to render new content, update the relevant renderer:
   - Character Sheet: Use view models and services (see [View Model Pattern](#view-model-pattern))
   - Rewards page: `/assets/js/page-renderers/rewardsRenderer.js`
   - Sanctum page: `/assets/js/page-renderers/sanctumRenderer.js`
   - Keeper page: `/assets/js/page-renderers/keeperRenderer.js`
   - Tables (Dungeons/Quests/Shroud): `/assets/js/table-renderer.js`
5. Add tests in `/tests/*.test.js` as needed

**Example - Adding a New Item:**
```json
// In assets/data/allItems.json
{
  "New Item Name": {
    "id": "new-item-name",
    "name": "New Item Name",
    "type": "Wearable",
    "img": "assets/images/rewards/new-item-name.png",
    "bonus": "Description of the item's bonus."
  }
}
```

Then run:
```bash
node scripts/generate-data.js
cd tests && npm run validate-data
```

### Stable IDs

**All content must have stable kebab-case IDs** for reliable references across expansions and refactoring.

**ID Requirements:**
- **Format**: kebab-case (lowercase, hyphens for spaces, e.g., `"library-restoration"`)
- **Uniqueness**: Must be unique within the content category (e.g., all items, all quests)
- **Stability**: Once assigned, never change (used for saved data references)

**Lookup Pattern:**
- Use `getItem(idOrName)` from `data.js` - supports both ID and name lookup for backward compatibility
- Similar helpers exist: `getGenreQuest()`, `getSideQuest()`, `getCurse()`, `getAbility()`, etc.

**Example:**
```javascript
import * as data from './character-sheet/data.js';

// Both work (backward compatibility):
const item1 = data.getItem('new-item-name');  // By ID (preferred)
const item2 = data.getItem('New Item Name');  // By name (legacy)
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

### Cross-Component Communication with DOM Events

**When StateAdapter events aren't reliable** (e.g., closures, drawer UIs, or separate initialization contexts), use DOM CustomEvents for guaranteed cross-component communication.

**Pattern:**
1. **Controller listens** for a custom event on `document`
2. **UI code dispatches** the event when state changes

**Example - Genre Selection Changes:**
```javascript
// In GenreQuestDeckController.js - Listen for the event
initialize() {
    // ... other initialization ...
    
    // Listen for DOM custom event as a reliable fallback
    document.addEventListener('genre-selection-changed', () => {
        this.renderDeck();
    });
}

// In character-sheet.js - Dispatch when genres change
stateAdapter.setSelectedGenres(selectedGenres);
document.dispatchEvent(new CustomEvent('genre-selection-changed'));
```

**When to use DOM CustomEvents:**
- When StateAdapter events don't propagate reliably (closure/scope issues)
- When UI components are initialized in different contexts
- When you need guaranteed cross-component updates
- For drawer/modal UIs that may not share the same stateAdapter reference

**Existing Custom Events:**
- `genre-selection-changed` - Fired when genres are added/removed/changed in the drawer

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
- `DungeonDeckController` - Dungeon room/encounter card draw
- `AtmosphericBuffDeckController` - Atmospheric buff card draw
- `GenreQuestDeckController` - Genre quest card draw
- `SideQuestDeckController` - Side quest card draw

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

**Location:** `/assets/js/character-sheet/ui.js` and `/assets/js/character-sheet/renderComponents.js`

**Architecture Pattern (Phase 3 Refactor):**

The UI layer follows a **pure renderer pattern** with **view models** and **services**:

```
┌─────────────────┐
│  Character      │
│  State          │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│   Services      │  ← Business logic, calculations
│   (Pure)        │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  View Models    │  ← Transform state + services → UI data
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  UI Renderers   │  ← Pure rendering (DOM manipulation only)
│  (Pure)         │
└─────────────────┘
```

**Pattern:**
- **UI functions are pure renderers** - They accept view models and only manipulate DOM
- **No business logic in UI functions** - All calculations happen in services
- **View models transform data** - They prepare state + services into UI-ready formats
- **Services contain business logic** - Calculations, filtering, formatting

**Prefer dedicated page renderers for content hydration:**
  - `assets/js/page-renderers/rewardsRenderer.js`
  - `assets/js/page-renderers/sanctumRenderer.js`
  - `assets/js/page-renderers/keeperRenderer.js`
  - `assets/js/table-renderer.js` for rules tables across pages

---

## Service Extraction Pattern

**When to create a service:**
- Extract business logic from UI functions or controllers
- Calculations that need to be testable in isolation
- Data transformations or formatting logic
- Reusable logic used by multiple components

**Service Pattern:**
1. Create a service module in `/assets/js/services/`
2. Export pure functions (no side effects, no DOM manipulation)
3. Functions should be easily testable
4. Services can import other services but should not import UI modules

**Example - Creating a Service:**
```javascript
// assets/js/services/NewFeatureService.js
/**
 * NewFeatureService - Handles new feature calculations and logic
 */

/**
 * Calculate something based on state
 * @param {Object} state - Character state
 * @param {Object} options - Calculation options
 * @returns {Object} Calculation result
 */
export function calculateNewFeature(state, options = {}) {
    // Pure calculation logic, no side effects
    const baseValue = state.someValue || 0;
    const multiplier = options.multiplier || 1;
    
    return {
        base: baseValue,
        multiplier: multiplier,
        total: baseValue * multiplier
    };
}

/**
 * Format data for display
 * @param {Object} data - Raw data
 * @returns {string} Formatted string
 */
export function formatNewFeature(data) {
    return `${data.name}: ${data.value}`;
}
```

**Testing Services:**
- Create tests in `/tests/services/[ServiceName].test.js`
- Test all calculation paths
- Test edge cases and error handling
- Services should have 90%+ test coverage

**Existing Services:**
- `RewardCalculator.js` - All reward calculations
- `QuestService.js` - Quest-related calculations and formatting
- `QuestRewardService.js` - Blueprint reward calculations
- `InventoryService.js` - Inventory item hydration and filtering
- `SlotService.js` - Slot limit calculations
- `AbilityService.js` - Ability filtering and formatting
- `AtmosphericBuffService.js` - Atmospheric buff calculations
- `DungeonDeckService.js` - Available dungeon rooms/encounters
- `AtmosphericBuffDeckService.js` - Available atmospheric buffs for card draw
- `GenreQuestDeckService.js` - Available genre quests based on selected genres
- `SideQuestDeckService.js` - Available side quests for card draw

---

## View Model Pattern

**When to create a view model:**
- Transform state + services into UI-ready data structures
- Aggregate data from multiple sources for a single UI component
- Format data for display (dates, numbers, strings)
- Calculate derived values for UI rendering

**View Model Pattern:**
1. Create a view model module in `/assets/js/viewModels/`
2. Export functions that accept state and return view model objects
3. View models should be pure functions (deterministic, no side effects)
4. View models can call services for calculations

**Example - Creating a View Model:**
```javascript
// assets/js/viewModels/newFeatureViewModel.js
/**
 * NewFeatureViewModel - Creates view models for new feature rendering
 */

import { calculateNewFeature, formatNewFeature } from '../services/NewFeatureService.js';
import { STORAGE_KEYS } from '../character-sheet/storageKeys.js';

/**
 * Create view model for new feature rendering
 * @param {Object} state - Character state object
 * @param {Object} options - Optional parameters
 * @returns {Object} View model with all data needed for rendering
 */
export function createNewFeatureViewModel(state, options = {}) {
    // Get data from state using storage keys
    const rawData = state[STORAGE_KEYS.NEW_FEATURE_DATA] || [];
    
    // Use services for calculations
    const calculation = calculateNewFeature(state, options);
    
    // Transform data for UI
    const formattedItems = rawData.map(item => ({
        ...item,
        displayText: formatNewFeature(item),
        isHighlighted: item.value > 100
    }));
    
    // Return view model
    return {
        items: formattedItems,
        calculation,
        summary: {
            total: calculation.total,
            count: formattedItems.length,
            hasItems: formattedItems.length > 0
        }
    };
}
```

**Using View Models in Controllers:**
```javascript
// In controller or character-sheet.js
import { createNewFeatureViewModel } from '../viewModels/newFeatureViewModel.js';

// Create view model
const viewModel = createNewFeatureViewModel(characterState, { multiplier: 2 });

// Pass to UI renderer
uiModule.renderNewFeature(viewModel);
```

**Testing View Models:**
- Create tests in `/tests/viewModels/[ViewModelName].test.js`
- Test view model creation with various state inputs
- Verify calculations are correct
- Test edge cases (empty state, missing fields, etc.)

**Existing View Models:**
- `inventoryViewModel.js` - Inventory and loadout UI data
- `questViewModel.js` - Quest list UI data
- `abilityViewModel.js` - Abilities UI data
- `atmosphericBuffViewModel.js` - Atmospheric buffs UI data
- `curseViewModel.js` - Curses UI data
- `generalInfoViewModel.js` - Character info UI data
- `dungeonDeckViewModel.js` - Dungeon card deck UI data
- `dungeonArchiveCardsViewModel.js` - Archived dungeon quest cards
- `questDeckViewModel.js` - Quest card decks (atmospheric buffs, genre quests, side quests)
- `questArchiveCardsViewModel.js` - Archived quest cards (genre quests, side quests)

---

## Pure UI Renderer Pattern

**UI functions should be pure renderers** - They accept data and render DOM, nothing else.

**Pure Renderer Pattern:**
1. **Accept view models, not raw state** - UI functions receive pre-calculated, UI-ready data
2. **No business logic** - No calculations, filtering, or data transformations
3. **No state mutations** - Never modify character state directly
4. **Only DOM manipulation** - Create, update, or remove DOM elements

**Example - Pure Renderer Function:**
```javascript
// ✅ GOOD: Pure renderer
export function renderNewFeature(viewModel) {
    const container = document.getElementById('new-feature-container');
    clearElement(container);
    
    // Use view model data directly - no calculations here
    viewModel.items.forEach(item => {
        const element = document.createElement('div');
        element.textContent = item.displayText; // Already formatted
        if (item.isHighlighted) {
            element.classList.add('highlight'); // Already calculated
        }
        container.appendChild(element);
    });
    
    // Display summary from view model
    const summaryEl = document.getElementById('new-feature-summary');
    if (summaryEl) {
        summaryEl.textContent = `${viewModel.summary.count} items (Total: ${viewModel.summary.total})`;
    }
}
```

**Backward Compatibility Wrapper:**
When refactoring existing UI functions, create a wrapper for backward compatibility:

```javascript
// Backward-compatible wrapper (creates view model internally)
export function renderNewFeature(stateOrViewModel, options) {
    // Check if first argument is already a view model
    if (stateOrViewModel && stateOrViewModel.items && stateOrViewModel.summary) {
        // It's already a view model, render directly
        renderNewFeaturePure(stateOrViewModel);
    } else {
        // It's raw state, create view model first
        const viewModel = createNewFeatureViewModel(stateOrViewModel, options);
        renderNewFeaturePure(viewModel);
    }
}

// Pure renderer (internal, accepts view model only)
function renderNewFeaturePure(viewModel) {
    // Pure rendering logic (see above)
}
```

**Testing UI Renderers:**
- Focus on DOM structure and content
- Test with various view model inputs
- Verify correct elements are created/updated
- Test edge cases (empty data, missing elements)

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
- **All content must have stable IDs** - See [Stable IDs](#stable-ids) section
- If legacy/flattened shapes are needed by existing code, derive them in `assets/js/character-sheet/data.js` rather than duplicating JSON files.
- Example derivations implemented:
  - `sideQuests`: built from `sideQuestsDetailed` for dropdown labels
  - `curseTable`: built from `curseTableDetailed` with normalized `requirement` values (strips "You must " prefix and trailing period)

### Calculation Receipts

**All reward calculations produce detailed receipts** showing how rewards were calculated.

**Receipt Structure:**
```javascript
{
  base: { xp: 30, inkDrops: 10, paperScraps: 0, blueprints: 0 },
  modifiers: [
    { source: 'Cartographer Bonus', type: 'background', value: 15, description: '+15 Ink Drops', currency: 'inkDrops' },
    { source: 'Page Sprite', type: 'item', value: 15, description: '×2 (+15 Ink Drops)', currency: 'inkDrops' }
  ],
  final: { xp: 30, inkDrops: 40, paperScraps: 0, blueprints: 0 },
  items: ['Item Name'],
  modifiedBy: ['Cartographer Bonus', 'Page Sprite']
}
```

**Using Receipts:**
- Receipts are automatically created by `RewardCalculator`
- Store receipts with completed quests for review
- Display receipts in tooltips and modal dialogs
- Use receipts to debug calculation issues

**When adding new reward sources:**
- Update `RewardCalculator` to populate receipt base values
- Add modifier entries to receipt when applying bonuses
- Update final values in receipt after all calculations

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

### Data Validation

**All game data is validated automatically** via `scripts/validate-data.js`.

**Validation Checks:**
- Unique IDs within each content category
- Kebab-case format for all IDs
- Item references in quest rewards resolve
- Quest references are valid
- Required fields present
- Type validation (numbers, strings, arrays)
- Cross-reference validation
- Duplicate display name detection

**Running Validation:**
```bash
cd tests && npm run validate-data
```

**Validation runs automatically in CI/CD** (GitHub Actions) before tests and build.

**When adding new content:**
- Always run validation after editing JSON files
- Fix any validation errors before committing
- Validation errors will fail the build in CI/CD

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
- [ ] **Extract business logic to services** (if calculations needed)
  - Create service module in `/assets/js/services/`
  - Make functions pure and testable
  - Add tests in `/tests/services/[ServiceName].test.js`
- [ ] **Create view model** (if UI needs complex data transformation)
  - Create view model module in `/assets/js/viewModels/`
  - Transform state + services into UI-ready data
  - Add tests in `/tests/viewModels/[ViewModelName].test.js`
- [ ] **Create pure UI renderer** (for UI changes)
  - Accept view model, not raw state
  - No business logic, only DOM manipulation
  - Add backward-compatible wrapper if needed
- [ ] Create a controller in `/assets/js/controllers/` (if feature has multiple interactions)
  - OR wire up event listeners directly in `character-sheet.js` (for simple features)
- [ ] Register controller in `character-sheet.js` (if using a controller)
- [ ] Add delegated click handler if needed (for dynamically generated elements)
- [ ] Write tests for new functionality (including validation tests, controller tests if applicable)
- [ ] Run data validation: `cd tests && npm run validate-data`
- [ ] Run full test suite: `cd tests && npm test`
- [ ] Verify manual testing in browser

When adding new game content:

- [ ] Add stable `id` field (kebab-case) to content JSON
- [ ] Add `name` field for display purposes
- [ ] Run `node scripts/generate-data.js`
- [ ] Run `cd tests && npm run validate-data` to check for errors
- [ ] Update lookup helpers in `data.js` if needed (usually automatic)

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

### Adding a New Card Deck

The card draw system uses a layered architecture with services, view models, renderers, and controllers.

**Required Files:**

1. **Service** (`/assets/js/services/NewDeckService.js`):
   ```javascript
   export function getAvailableCards(state) {
       // Return array of available cards based on state
       // Filter out completed/active items
   }
   ```

2. **View Model** (`/assets/js/viewModels/newDeckViewModel.js`):
   ```javascript
   export function createNewDeckViewModel(state) {
       const availableCards = getAvailableCards(state);
       return {
           available: availableCards.length > 0,
           count: availableCards.length,
           cards: availableCards,
           cardbackImage: getCardbackImage()
       };
   }
   ```

3. **Image Utility** (if needed, in `/assets/js/utils/`):
   ```javascript
   export function getNewCardImage(cardData) {
       const filename = slugifyName(cardData.name);
       return toCdnImageUrlIfConfigured(`new-cards/${filename}.png`);
   }
   ```

4. **Card Renderer** (add to `/assets/js/character-sheet/cardRenderer.js`):
   ```javascript
   export function renderNewCard(cardData) {
       // Create and return card DOM element
   }
   
   export function renderNewArchiveCard(quest, index, cardImage, title) {
       // Create archive card with book overlay
   }
   ```

5. **Controller** (`/assets/js/controllers/NewDeckController.js`):
   ```javascript
   export class NewDeckController extends BaseController {
       initialize() {
           // Set up deck click handlers
           // Set up action button handlers
           // Listen for state change events
       }
       
       renderDeck() {
           const viewModel = createNewDeckViewModel(this.stateAdapter.getState());
           // Render deck UI
       }
   }
   ```

6. **HTML** (in `character-sheet.md`):
   ```html
   <div class="deck-group">
       <h4 class="deck-title">♦ New Cards</h4>
       <div id="new-deck-container" class="card-deck available"></div>
   </div>
   <div id="new-drawn-card-display" class="drawn-card-area"></div>
   <button id="add-new-card-btn" class="rpg-btn rpg-btn-primary">Add Card</button>
   ```

7. **Register Controller** (in `character-sheet.js`):
   ```javascript
   const newDeckController = new NewDeckController(stateAdapter, form, dependencies);
   newDeckController.initialize();
   ```

**Image Storage:**
- Card images are stored in Supabase at `tome-of-secrets-images/{card-type}/`
- Use `toCdnImageUrlIfConfigured()` to get the correct CDN URL
- Cardback images use naming convention: `tos-cardback-{card-type}.png`

---

## Getting Help

- Review existing similar features for patterns
- Check `/docs/REFACTORING-RECOMMENDATIONS.md` for architectural guidance
- Look at test files to understand expected behavior
- Follow the existing code style and structure

---

## Phase 3 Architecture Summary

**Current Architecture (Post-Phase 3 Refactor):**

The codebase follows a **clean separation of concerns**:

1. **Content Layer** (`assets/data/*.json`)
   - Pure JSON data files with stable IDs
   - Single source of truth for game content
   - Validated via `scripts/validate-data.js`

2. **Domain Logic Layer** (`assets/js/services/*.js`)
   - Pure functions for calculations and business logic
   - No side effects, easily testable
   - Examples: `RewardCalculator`, `QuestService`, `InventoryService`

3. **State Layer** (`assets/js/character-sheet/stateAdapter.js`, `dataValidator.js`)
   - State mutations and persistence
   - Data validation and migrations
   - Invariant enforcement

4. **View Layer** (`assets/js/viewModels/*.js` + `ui.js`)
   - View models transform state + services → UI data
   - UI functions are pure renderers (DOM only)
   - Controllers handle user interactions

**Key Principles:**
- ✅ UI functions contain **zero business logic**
- ✅ All calculations happen in **services** (testable)
- ✅ Data transformation happens in **view models**
- ✅ State mutations only via **StateAdapter**
- ✅ All content has **stable IDs** for reliable references
- ✅ All calculations produce **receipts** for transparency

---

## Remember

- **Keep it simple** - Follow existing patterns rather than inventing new ones
- **Test your changes** - Run the test suite and data validation before committing
- **Extract to services** - Business logic belongs in services, not UI
- **Use view models** - Transform data before rendering, keep UI pure
- **Stable IDs** - All content must have kebab-case IDs
- **Update documentation** - If you add a new pattern, document it here
- **Maintain consistency** - Use the established patterns and conventions

---

## Future Work / Remaining Phase 3 Items

### Completed ✅
- ✅ Expansion manifest system (`expansions.json` + `contentRegistry.js`)
- ✅ Stable IDs added to all content files
- ✅ Data validation script (`scripts/validate-data.js`)
- ✅ Calculation receipt system (full transparency)
- ✅ Service extraction (all business logic in services)
- ✅ Post-load repairs (`postLoadRepair.js`)
- ✅ Invariant enforcement (StateAdapter)
- ✅ UI/logic separation (pure renderers)
- ✅ View model layer (data transformation)
- ✅ Comprehensive test coverage

### Optional Future Enhancements

1. **UI Modernization** (Phase 4)
   - Replace alerts with inline toasts/snackbars
   - Improve Cloud Save status indicators
   - Add dedicated Settings panel

2. **Expansion System Enhancements**
   - Expansion dependencies (e.g., expansion B requires expansion A)
   - Expansion versioning with automatic migrations
   - Expansion feature flags (for testing/development)

3. **Calculation Receipt Enhancements**
   - Visual diff view for receipt comparison
   - Receipt history/audit trail
   - Export receipts for debugging

4. **Documentation**
   - Expand examples in this guide
   - Add video tutorials for common tasks
   - Create architecture decision records (ADRs)

