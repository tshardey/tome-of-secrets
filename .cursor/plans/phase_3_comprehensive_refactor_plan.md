---
name: Phase 3: Comprehensive Refactor Plan
overview: A unified plan for separating UI/logic/content, enabling data-driven expansions, and building trust in reward calculations through comprehensive testing and transparency.
todos:
  - id: expansion-manifest
    content: Create expansion manifest system (expansions.json + contentRegistry.js)
    status: pending
  - id: stable-ids
    content: Add stable IDs to all content JSON files with backward-compatible lookups
    status: pending
  - id: data-validation-script
    content: Create comprehensive data validation script (validate-data.js)
    status: pending
    dependencies:
      - stable-ids
  - id: calculation-transparency
    content: Add calculation breakdown/receipt system to RewardCalculator
    status: pending
  - id: calculation-tests
    content: Create exhaustive test suite for all reward calculation scenarios
    status: pending
    dependencies:
      - calculation-transparency
  - id: extract-reward-services
    content: Extract reward calculation logic from controllers into dedicated services
    status: pending
    dependencies:
      - calculation-transparency
  - id: post-load-repairs
    content: Move repair logic from character-sheet.js to postLoadRepair.js module
    status: pending
    dependencies:
      - expansion-manifest
  - id: invariant-enforcement
    content: Enforce state invariants in StateAdapter/domain services, not UI
    status: pending
    dependencies:
      - extract-reward-services
  - id: ui-logic-separation
    content: Refactor UI functions to be pure renderers (accept state, no calculations)
    status: pending
    dependencies:
      - extract-reward-services
      - invariant-enforcement
  - id: view-models
    content: Create view model layer to transform state+logic into UI-ready data
    status: pending
    dependencies:
      - extract-reward-services
      - ui-logic-separation
---

# Phase 3: Comprehensive Refactor Plan

## Vision

Create a maintainable, testable, and extensible codebase where:
1. **Developers** can confidently add expansions by editing JSON + optional code
2. **Players** can trust reward calculations are correct without manual edits
3. **Calculation logic** is transparent, testable, and verifiable
4. **Expansions** are enabled by default and seamlessly integrated

## Core Principles

### 1. Calculation Trust & Transparency
- Every reward calculation produces a **receipt/breakdown** showing:
  - Base rewards
  - Applied modifiers (items, buffs, backgrounds)
  - Final totals
  - Source of each bonus
- Comprehensive test coverage for all calculation paths
- UI displays calculation breakdowns when rewards are applied
- Calculation logic centralized in `RewardCalculator` service

### 2. Expansion System
- All expansions enabled by default
- Manifest declares what content/features are available
- Expansions add content via JSON (simple) or mechanics via services (complex)
- Migration system handles new expansion data gracefully

### 3. Separation of Concerns
- **Content**: JSON files → pure data
- **Domain Logic**: Services → business rules, calculations
- **State**: StateAdapter → persistence, validation, migrations
- **UI**: View functions → pure rendering (no calculations, no state mutations)

### 4. Developer Ergonomics
- Data validation catches errors early
- Clear patterns for adding features
- Tests run fast and catch regressions
- Calculation receipts make debugging easy

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                     CONTENT LAYER                            │
│  JSON files (assets/data/*.json)                            │
│  + Expansion Manifest (expansions.json)                     │
│  → Generated exports (data.json-exports.js)                 │
│  → Content Registry (contentRegistry.js)                    │
└───────────────────────┬─────────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────────┐
│                    DOMAIN LOGIC LAYER                        │
│  RewardCalculator (calculations + receipts)                 │
│  QuestService, InventoryService, RestorationService         │
│  → Pure functions, testable, no side effects                │
└───────────────────────┬─────────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────────┐
│                     STATE LAYER                              │
│  StateAdapter (mutations)                                   │
│  DataValidator (validation)                                 │
│  DataMigrator (schema migrations)                           │
│  PostLoadRepair (data fixes)                                │
└───────────────────────┬─────────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────────┐
│                      VIEW LAYER                              │
│  View Models (state + logic → UI data)                      │
│  UI Renderers (pure functions)                              │
│  Controllers (user interactions → domain actions)           │
└─────────────────────────────────────────────────────────────┘
```

---

## Implementation Plan

### Phase 3.1: Foundation - Expansion System & Stable IDs

**Goal**: Enable data-driven expansions with stable references

#### Task 3.1.1: Create Expansion Manifest System

**Files to create:**
- `assets/data/expansions.json` - Declares installed expansions
- `assets/js/config/contentRegistry.js` - Runtime registry for expansion queries

**Expansion manifest structure:**
```json
{
  "core": {
    "version": "1.0.0",
    "enabled": true,
    "features": ["quests", "items", "dungeons", "curses"]
  },
  "expansions": {
    "libraryRestoration": {
      "version": "1.0.0",
      "enabled": true,
      "requires": ["core"],
      "features": ["restorationProjects", "passiveSlots", "wings", "blueprints"],
      "dataFiles": ["wings.json", "restorationProjects.json"],
      "services": ["restorationService.js"]
    }
  }
}
```

**ContentRegistry API:**
```javascript
// assets/js/config/contentRegistry.js
export const contentRegistry = {
  isExpansionEnabled(id) { ... },
  getExpansionVersion(id) { ... },
  getEnabledFeatures() { ... },
  getExpansionDataFiles(id) { ... }
};
```

**Integration:**
- Export via `scripts/generate-data.js`
- Use in controllers/renderers to conditionally show features
- Gate migrations/repairs by expansion availability

#### Task 3.1.2: Add Stable IDs to All Content

**Files to update:**
- `assets/data/allItems.json` - Add `id` field to each item
- `assets/data/sideQuestsDetailed.json` - Convert numeric keys to stable IDs
- `assets/data/curseTableDetailed.json` - Add `id` fields
- `assets/data/masteryAbilities.json` - Add `id` fields
- `assets/data/atmosphericBuffs.json` - Add `id` fields
- `assets/data/temporaryBuffs.json` - Add `id` fields
- `assets/data/genreQuests.json` - Add `id` fields

**ID format:** kebab-case, descriptive (e.g., `"librarians-compass"`, `"hall-of-whispers"`)

**Backward compatibility:**
- Update `assets/js/character-sheet/data.js` to provide:
  ```javascript
  export const itemsById = new Map(Object.entries(allItems));
  export const itemsByName = buildNameIndex(allItems);
  
  export function getItem(idOrName) {
    return itemsById.get(idOrName) || itemsByName.get(idOrName);
  }
  ```

**Migration strategy:**
- Add IDs alongside existing name-based lookups (non-breaking)
- Keep name-based lookups for saved data compatibility
- Gradually migrate internal code to use IDs

---

### Phase 3.2: Calculation Trust & Transparency

**Goal**: Make reward calculations verifiable and trustworthy

#### Task 3.2.1: Add Calculation Receipts to RewardCalculator

**Enhance `Reward` class:**
```javascript
export class Reward {
  constructor({ xp = 0, inkDrops = 0, paperScraps = 0, blueprints = 0, items = [], modifiedBy = [] } = {}) {
    this.xp = xp;
    this.inkDrops = inkDrops;
    this.paperScraps = paperScraps;
    this.blueprints = blueprints;
    this.items = Array.isArray(items) ? items : [];
    this.modifiedBy = Array.isArray(modifiedBy) ? modifiedBy : [];
    
    // NEW: Calculation receipt/breakdown
    this.receipt = {
      base: { xp: 0, inkDrops: 0, paperScraps: 0, blueprints: 0 },
      modifiers: [], // Array of { source, type, value, description }
      final: { xp: 0, inkDrops: 0, paperScraps: 0, blueprints: 0 }
    };
  }
  
  getReceipt() {
    return {
      base: { ...this.receipt.base },
      modifiers: [...this.receipt.modifiers],
      final: { ...this.receipt.final },
      items: [...this.items],
      modifiedBy: [...this.modifiedBy]
    };
  }
}
```

**Update `RewardCalculator.applyModifiers()`:**
- Track each modifier application in `receipt.modifiers`
- Include source name, type (additive/multiplicative), value, and description

**Update `RewardCalculator.calculateFinalRewards()`:**
- Initialize receipt with base rewards
- Track all modifier applications
- Set final totals in receipt

#### Task 3.2.2: Display Calculation Breakdowns in UI

**When quest is completed:**
- Show calculation receipt in a collapsible section
- Display: "Base: +10 Ink Drops" → "+5 from [Item Name]" → "Final: +15 Ink Drops"
- Make it visible but not intrusive (collapsible by default)

**Implementation:**
- Add `displayCalculationReceipt(receipt)` function in UI module
- Call after quest completion, before currency update
- Store receipt in quest object for later review

#### Task 3.2.3: Comprehensive Test Suite

**Create `tests/RewardCalculator.test.js` expansion:**
- Test all quest types (dungeon, genre, side, organize)
- Test all modifier types (items, buffs, backgrounds, schools)
- Test passive slot modifiers vs active modifiers
- Test wing completion bonuses
- Test edge cases (multiple modifiers, multipliers, etc.)
- Test calculation receipts are accurate

**Test structure:**
```javascript
describe('RewardCalculator', () => {
  describe('Base rewards', () => {
    // Test each quest type
  });
  
  describe('Item modifiers', () => {
    // Test active vs passive slots
    // Test all item types
  });
  
  describe('Background bonuses', () => {
    // Test all backgrounds
  });
  
  describe('Calculation receipts', () => {
    // Verify receipts match calculations
  });
});
```

---

### Phase 3.3: Extract Business Logic from Controllers/UI

**Goal**: Separate domain logic from UI/presentation

#### Task 3.3.1: Extract Reward Calculation Services

**Create `assets/js/services/QuestRewardService.js`:**
- Move quest reward calculation logic from `QuestController`
- Use `RewardCalculator` for all calculations
- Return rewards with receipts

**Create `assets/js/services/InventoryService.js`:**
- Extract inventory validation logic from `ui.js`
- Slot limit calculations
- Item hydration logic
- Equipment/unequipment rules

**Create `assets/js/services/RestorationService.js`:**
- Restoration project logic
- Wing progress tracking
- Passive slot management
- Blueprint economy

**Create `assets/js/services/SlotService.js`:**
- Slot limit calculations (currently in `ui.js`)
- Slot validation
- Passive slot vs active slot logic

#### Task 3.3.2: Move Repair Logic to Post-Load Repairs

**Create `assets/js/character-sheet/postLoadRepair.js`:**
- Move `fixCompletedRestorationProjects()` from `character-sheet.js`
- Add other repair functions as needed
- All repairs are idempotent and deterministic
- Gate by expansion manifest where applicable

**Repair function pattern:**
```javascript
export function repairCompletedRestorationProjects(stateAdapter, contentRegistry) {
  if (!contentRegistry.isExpansionEnabled('libraryRestoration')) {
    return { changed: false, notes: [] };
  }
  
  // Repair logic...
  return { changed: true, notes: ['Fixed 3 restoration projects'] };
}
```

**Call from `loadState()` after validation:**
```javascript
import { repairCompletedRestorationProjects } from './postLoadRepair.js';

export async function loadState() {
  let state = await loadAndMigrateState();
  state = validateCharacterState(state);
  
  // Apply repairs
  const repairs = [
    repairCompletedRestorationProjects(stateAdapter, contentRegistry),
    // ... other repairs
  ];
  
  repairs.forEach(repair => {
    if (repair.changed) {
      console.log('Repairs applied:', repair.notes);
    }
  });
  
  return state;
}
```

#### Task 3.3.3: Enforce Invariants in StateAdapter

**Move invariant enforcement from UI to StateAdapter:**
- Item cannot be equipped AND in passive slot
- Slot limits cannot be exceeded
- Quest state consistency

**Pattern:**
```javascript
// StateAdapter methods enforce invariants
moveItemToPassiveSlot(itemName, slotIndex) {
  // Check if item is equipped
  if (this.isEquipped(itemName)) {
    // Automatically unequip first
    this.unequipItem(itemName);
  }
  
  // Then move to passive slot
  // ...
}
```

---

### Phase 3.4: Clean UI Layer

**Goal**: Make UI functions pure renderers

#### Task 3.4.1: Create View Model Layer

**Create `assets/js/viewModels/inventoryViewModel.js`:**
```javascript
export function createInventoryViewModel(state, services) {
  const slotLimits = slotService.calculateSlotLimits(
    state.level,
    state.wearableSlots,
    state.nonWearableSlots,
    state.familiarSlots
  );
  
  const validation = inventoryService.validateInventory(state);
  
  return {
    equippedItems: state.equippedItems.map(item => inventoryService.hydrateItem(item)),
    inventoryItems: state.inventoryItems.filter(item => !item.equipped),
    passiveItemSlots: state.passiveItemSlots,
    passiveFamiliarSlots: state.passiveFamiliarSlots,
    slotLimits,
    warnings: validation.warnings,
    errors: validation.errors
  };
}
```

**Create similar view models for:**
- `questViewModel.js`
- `characterViewModel.js`
- `restorationViewModel.js`

#### Task 3.4.2: Refactor UI Functions to Accept View Models

**Before:**
```javascript
export function renderLoadout(wearableSlotsInput, nonWearableSlotsInput, familiarSlotsInput) {
  // 50+ lines of calculations
  const slotLimits = getSlotLimits(...);
  // Cleanup logic...
  // Validation...
  // Render...
}
```

**After:**
```javascript
export function renderLoadout(viewModel) {
  // Pure rendering only
  viewModel.equippedItems.forEach(item => {
    equippedList.appendChild(renderItemCard(item));
  });
  
  renderSlotSummary(viewModel.slotLimits);
  renderWarnings(viewModel.warnings);
}
```

**Update controllers:**
```javascript
// Controller creates view model, passes to UI
const viewModel = createInventoryViewModel(stateAdapter.state, services);
uiModule.renderLoadout(viewModel);
```

---

### Phase 3.5: Data Validation & Developer Tools

**Goal**: Catch errors early and make development easier

#### Task 3.5.1: Create Comprehensive Data Validation Script

**Create `scripts/validate-data.js`:**
```javascript
// Validates:
// 1. All IDs are unique within their category
// 2. All IDs are kebab-case format
// 3. All item references in rewards resolve
// 4. All quest references to rooms/dungeons are valid
// 5. Required fields present
// 6. Type validation (numbers, strings, arrays)
// 7. Cross-reference validation (expansion features reference valid data)
// 8. No duplicate display names that could cause confusion
```

**Output format:**
```
✓ Items: 45 items validated
✓ Quests: 120 quests validated
✗ Error: Item "librarians-compass" referenced in quest "genre-quest-1" but not found
✗ Warning: Duplicate display name "Library Card" found in items "library-card" and "library-card-alt"
```

**Add to package.json:**
```json
{
  "scripts": {
    "validate-data": "node scripts/validate-data.js",
    "precommit": "npm run validate-data && npm test"
  }
}
```

#### Task 3.5.2: Update Documentation

**Update `project-docs/EXTENDING-THE-CODEBASE.md`:**
- Document expansion manifest system
- Document stable ID requirements
- Document calculation receipt system
- Document view model pattern
- Document service extraction guidelines

**Add expansion guide:**
```markdown
## Adding a New Expansion

1. Create expansion data files in `assets/data/`
2. Add expansion to `expansions.json` manifest
3. Create service module if expansion has mechanics (optional)
4. Add migration if expansion changes schema (optional)
5. Run `npm run validate-data` to check references
6. Add tests for expansion-specific features
```

---

## Testing Strategy

### Unit Tests
- **RewardCalculator**: All calculation paths with receipts
- **Services**: QuestRewardService, InventoryService, etc.
- **View Models**: Transformations are correct
- **Post-Load Repairs**: Repairs are idempotent

### Integration Tests
- Quest completion → reward calculation → currency update
- Item equipping → modifier application → quest reward calculation
- Expansion enablement → features appear correctly

### Regression Tests
- Existing saved data loads correctly
- Existing calculations produce same results
- UI renders correctly after refactoring

---

## Migration & Backward Compatibility

### Saved Data Compatibility
- All migrations preserve existing data
- New fields added with safe defaults
- Old data continues to work
- Gradual migration to IDs (keep name fallbacks)

### Expansion Rollout
- All expansions enabled by default
- No feature flags needed
- Expansions can be disabled in manifest for testing
- Migration system handles new expansion data gracefully

---

## Success Criteria

### Developer Experience
- ✅ Adding new expansion content: Edit JSON + run generator
- ✅ Adding new expansion mechanics: Create service + add to manifest
- ✅ Data validation catches errors before runtime
- ✅ Clear patterns for all common tasks

### Calculation Trust
- ✅ All calculations produce receipts/breakdowns
- ✅ UI displays calculation breakdowns
- ✅ Comprehensive test coverage (90%+ for RewardCalculator)
- ✅ Players can verify calculations without manual edits

### Code Quality
- ✅ UI functions contain only rendering logic
- ✅ Business logic in services (testable)
- ✅ State invariants enforced in StateAdapter
- ✅ Clear separation: Content → Logic → State → UI

### Maintainability
- ✅ Expansion system supports simple (JSON) and complex (services) additions
- ✅ Stable IDs prevent display name issues
- ✅ Calculation receipts make debugging easy
- ✅ Tests catch regressions

---

## Implementation Order

1. **Foundation** (3.1): Expansion manifest + stable IDs
2. **Calculation Trust** (3.2): Receipts + comprehensive tests
3. **Logic Extraction** (3.3): Services + repairs + invariants
4. **UI Cleanup** (3.4): View models + pure renderers
5. **Developer Tools** (3.5): Validation + documentation

**Why this order:**
- Foundation enables everything else
- Calculation trust is critical for player confidence
- Logic extraction makes UI cleanup easier
- Developer tools come last when patterns are stable

---

## Risks & Mitigations

### Risk: Breaking existing saves
**Mitigation**: All changes are backward compatible, migrations handle upgrades

### Risk: Calculation bugs in production
**Mitigation**: Comprehensive test suite + calculation receipts for debugging

### Risk: Over-engineering
**Mitigation**: Start simple, add complexity only when needed, keep patterns consistent

### Risk: Performance impact from receipts
**Mitigation**: Receipts are small objects, only created on quest completion (infrequent)

---

## Future Considerations

### Phase 4: UI Modernization
- Consider component framework (Preact) for complex UI
- Improve calculation receipt display (tooltips, animations)
- Better visual feedback for reward calculations

### Phase 5: Advanced Expansion System
- Expansion dependencies
- Expansion versioning with migrations
- Expansion marketplace/ecosystem

---

## Notes

- All expansions enabled by default (no feature flags for players)
- Calculation receipts stored in quest objects for review
- Validation script runs in CI/pre-commit hooks
- Keep backward compatibility during transition period
- Documentation updated as patterns emerge

