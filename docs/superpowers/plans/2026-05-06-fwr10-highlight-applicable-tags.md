# FWR.10: Highlight Applicable Tags Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Visually highlight tags in the book add/edit tag picker that would trigger bonuses from the player's current loadout (equipped items, background, school, abilities, buffs).

**Architecture:** A new utility function extracts all tag IDs referenced in `tagMatch`/`hasTag` conditions from active effects (via `EffectRegistry.getActiveEffects`). The tag picker receives this set and applies a CSS class to matching labels.

**Tech Stack:** Vanilla JS, CSS, Jest (jsdom)

---

### Task 1: Extract applicable tag IDs utility

**Files:**
- Create: `assets/js/utils/applicableTagIds.js`
- Test: `tests/applicableTagIds.test.js`

- [ ] **Step 1: Write the failing test**

Create `tests/applicableTagIds.test.js`:

```javascript
import { getApplicableTagIds } from '../assets/js/utils/applicableTagIds.js';
import { STORAGE_KEYS } from '../assets/js/character-sheet/storageKeys.js';

describe('getApplicableTagIds', () => {
    test('returns tag IDs from equipped item tagMatch conditions', () => {
        const stateAdapter = {
            state: {
                [STORAGE_KEYS.EQUIPPED_ITEMS]: ['Cloak of the Story-Weaver'],
                [STORAGE_KEYS.PASSIVE_ITEM_SLOTS]: [],
                [STORAGE_KEYS.PASSIVE_FAMILIAR_SLOTS]: [],
                [STORAGE_KEYS.TEMPORARY_BUFFS]: [],
                [STORAGE_KEYS.LEARNED_ABILITIES]: []
            }
        };
        const dataModule = {
            allItems: {
                'Cloak of the Story-Weaver': {
                    id: 'cloak-of-the-story-weaver',
                    name: 'Cloak of the Story-Weaver',
                    effects: [
                        {
                            trigger: 'ON_QUEST_COMPLETED',
                            condition: { tagMatch: [['series']] },
                            modifier: { type: 'ADD_FLAT', resource: 'inkDrops', value: 10 },
                            slot: 'equipped'
                        }
                    ]
                }
            },
            keeperBackgrounds: {},
            schoolBenefits: {},
            masteryAbilities: {},
            temporaryBuffsFromRewards: {},
            temporaryBuffs: {}
        };

        const result = getApplicableTagIds(stateAdapter, dataModule);
        expect(result).toBeInstanceOf(Set);
        expect(result.has('series')).toBe(true);
    });

    test('returns tag IDs from background tagMatch conditions', () => {
        const stateAdapter = {
            state: {
                keeperBackground: 'archivist',
                [STORAGE_KEYS.EQUIPPED_ITEMS]: [],
                [STORAGE_KEYS.PASSIVE_ITEM_SLOTS]: [],
                [STORAGE_KEYS.PASSIVE_FAMILIAR_SLOTS]: [],
                [STORAGE_KEYS.TEMPORARY_BUFFS]: [],
                [STORAGE_KEYS.LEARNED_ABILITIES]: []
            }
        };
        const dataModule = {
            allItems: {},
            keeperBackgrounds: {
                archivist: {
                    name: 'The Archivist\'s Apprentice',
                    effects: [
                        {
                            trigger: 'ON_QUEST_COMPLETED',
                            condition: { tagMatch: [['non-fiction'], ['historical-fiction']] },
                            modifier: { type: 'ADD_FLAT', resource: 'inkDrops', value: 10 }
                        }
                    ]
                }
            },
            schoolBenefits: {},
            masteryAbilities: {},
            temporaryBuffsFromRewards: {},
            temporaryBuffs: {}
        };

        const result = getApplicableTagIds(stateAdapter, dataModule);
        expect(result.has('non-fiction')).toBe(true);
        expect(result.has('historical-fiction')).toBe(true);
    });

    test('returns tag IDs from hasTag conditions', () => {
        const stateAdapter = {
            state: {
                [STORAGE_KEYS.EQUIPPED_ITEMS]: ['Test Item'],
                [STORAGE_KEYS.PASSIVE_ITEM_SLOTS]: [],
                [STORAGE_KEYS.PASSIVE_FAMILIAR_SLOTS]: [],
                [STORAGE_KEYS.TEMPORARY_BUFFS]: [],
                [STORAGE_KEYS.LEARNED_ABILITIES]: []
            }
        };
        const dataModule = {
            allItems: {
                'Test Item': {
                    id: 'test-item',
                    name: 'Test Item',
                    effects: [
                        {
                            trigger: 'ON_QUEST_COMPLETED',
                            condition: { hasTag: ['dragons', 'fae'] },
                            modifier: { type: 'ADD_FLAT', resource: 'inkDrops', value: 5 },
                            slot: 'equipped'
                        }
                    ]
                }
            },
            keeperBackgrounds: {},
            schoolBenefits: {},
            masteryAbilities: {},
            temporaryBuffsFromRewards: {},
            temporaryBuffs: {}
        };

        const result = getApplicableTagIds(stateAdapter, dataModule);
        expect(result.has('dragons')).toBe(true);
        expect(result.has('fae')).toBe(true);
    });

    test('returns empty set when no tag conditions exist', () => {
        const stateAdapter = {
            state: {
                [STORAGE_KEYS.EQUIPPED_ITEMS]: ['Scatter Brain Scarab'],
                [STORAGE_KEYS.PASSIVE_ITEM_SLOTS]: [],
                [STORAGE_KEYS.PASSIVE_FAMILIAR_SLOTS]: [],
                [STORAGE_KEYS.TEMPORARY_BUFFS]: [],
                [STORAGE_KEYS.LEARNED_ABILITIES]: []
            }
        };
        const dataModule = {
            allItems: {
                'Scatter Brain Scarab': {
                    id: 'scatter-brain-scarab',
                    name: 'Scatter Brain Scarab',
                    effects: []
                }
            },
            keeperBackgrounds: {},
            schoolBenefits: {},
            masteryAbilities: {},
            temporaryBuffsFromRewards: {},
            temporaryBuffs: {}
        };

        const result = getApplicableTagIds(stateAdapter, dataModule);
        expect(result.size).toBe(0);
    });

    test('deduplicates tags across multiple sources', () => {
        const stateAdapter = {
            state: {
                keeperBackground: 'prophet',
                [STORAGE_KEYS.EQUIPPED_ITEMS]: ['Test Item'],
                [STORAGE_KEYS.PASSIVE_ITEM_SLOTS]: [],
                [STORAGE_KEYS.PASSIVE_FAMILIAR_SLOTS]: [],
                [STORAGE_KEYS.TEMPORARY_BUFFS]: [],
                [STORAGE_KEYS.LEARNED_ABILITIES]: []
            }
        };
        const dataModule = {
            allItems: {
                'Test Item': {
                    id: 'test-item',
                    name: 'Test Item',
                    effects: [
                        {
                            trigger: 'ON_QUEST_COMPLETED',
                            condition: { tagMatch: [['philosophical']] },
                            modifier: { type: 'ADD_FLAT', resource: 'inkDrops', value: 5 },
                            slot: 'equipped'
                        }
                    ]
                }
            },
            keeperBackgrounds: {
                prophet: {
                    name: 'The Cloistered Prophet',
                    effects: [
                        {
                            trigger: 'ON_QUEST_COMPLETED',
                            condition: { tagMatch: [['philosophical'], ['mythology'], ['celestial']] },
                            modifier: { type: 'ADD_FLAT', resource: 'inkDrops', value: 15 }
                        }
                    ]
                }
            },
            schoolBenefits: {},
            masteryAbilities: {},
            temporaryBuffsFromRewards: {},
            temporaryBuffs: {}
        };

        const result = getApplicableTagIds(stateAdapter, dataModule);
        expect(result.has('philosophical')).toBe(true);
        expect(result.has('mythology')).toBe(true);
        expect(result.has('celestial')).toBe(true);
        expect(result.size).toBe(3);
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd tests && npx jest applicableTagIds.test.js --no-coverage`
Expected: FAIL — module not found

- [ ] **Step 3: Write the implementation**

Create `assets/js/utils/applicableTagIds.js`:

```javascript
import { EffectRegistry } from '../services/EffectRegistry.js';
import { TRIGGERS } from '../services/effectSchema.js';

/**
 * Collect all tag IDs referenced in tagMatch/hasTag conditions
 * from all active effect sources for the ON_QUEST_COMPLETED trigger.
 *
 * @param {{ state: Object }} stateAdapter
 * @param {Object} dataModule - Data catalogs (allItems, keeperBackgrounds, etc.)
 * @returns {Set<string>}
 */
export function getApplicableTagIds(stateAdapter, dataModule) {
    const tagIds = new Set();

    const allEffects = EffectRegistry.getActiveEffects(
        TRIGGERS.ON_QUEST_COMPLETED,
        stateAdapter,
        dataModule
    );

    for (const { effect } of allEffects) {
        const condition = effect?.condition;
        if (!condition) continue;

        if (condition.tagMatch != null) {
            const groups = Array.isArray(condition.tagMatch) ? condition.tagMatch : [];
            for (const group of groups) {
                if (!Array.isArray(group)) continue;
                for (const tag of group) {
                    tagIds.add(tag);
                }
            }
        }

        if (condition.hasTag != null) {
            const tags = Array.isArray(condition.hasTag) ? condition.hasTag : [condition.hasTag];
            for (const tag of tags) {
                tagIds.add(tag);
            }
        }
    }

    return tagIds;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd tests && npx jest applicableTagIds.test.js --no-coverage`
Expected: All 5 tests PASS

- [ ] **Step 5: Commit**

```bash
git add assets/js/utils/applicableTagIds.js tests/applicableTagIds.test.js
git commit -m "feat(fwr.10): add getApplicableTagIds utility for tag picker highlighting"
```

---

### Task 2: Add CSS class for applicable tag highlighting

**Files:**
- Modify: `assets/css/character-sheet.css` (after line ~999, the `.library-tag-option:hover` block)

- [ ] **Step 1: Add the `.tag--applicable` CSS class**

Add after the `.library-tag-option:hover` rule (line ~999):

```css
.library-tag-option.tag--applicable {
    border-left: 3px solid #c8a44e;
    padding-left: 5px;
    background: rgba(200, 164, 78, 0.08);
}
```

- [ ] **Step 2: Visually verify** (manual — open the app, confirm no regressions to tag picker layout)

- [ ] **Step 3: Commit**

```bash
git add assets/css/character-sheet.css
git commit -m "style(fwr.10): add gold accent class for applicable tags"
```

---

### Task 3: Integrate highlighting into `_renderTagPicker`

**Files:**
- Modify: `assets/js/controllers/LibraryController.js` (imports, `_renderTagPicker`, call sites at lines ~85 and ~564)

- [ ] **Step 1: Add import for `getApplicableTagIds` and data dependencies**

At the top of `LibraryController.js`, after existing imports (line 16):

```javascript
import { getApplicableTagIds } from '../utils/applicableTagIds.js';
import { allItems, keeperBackgrounds, schoolBenefits, masteryAbilities, temporaryBuffsFromRewards, temporaryBuffs } from '../character-sheet/data.js';
```

- [ ] **Step 2: Add `_getApplicableTagIds()` helper method**

Add before `_renderTagPicker` (around line 1111):

```javascript
_getApplicableTagIds() {
    const dataModule = {
        allItems,
        keeperBackgrounds,
        schoolBenefits,
        masteryAbilities,
        temporaryBuffsFromRewards,
        temporaryBuffs
    };
    return getApplicableTagIds(this.stateAdapter, dataModule);
}
```

- [ ] **Step 3: Modify `_renderTagPicker` to accept and apply `applicableTags`**

Change the method signature and the label creation loop:

```javascript
_renderTagPicker(container, selectedTags = [], applicableTags = new Set()) {
    if (!container) return;
    const tags = bookTags || [];
    container.innerHTML = '';

    const categories = { genre: [], content: [] };
    for (const tag of tags) {
        if (categories[tag.category]) {
            categories[tag.category].push(tag);
        }
    }

    for (const [category, categoryTags] of Object.entries(categories)) {
        const column = document.createElement('div');
        column.className = 'library-tag-column';

        const heading = document.createElement('div');
        heading.className = 'library-tag-category';
        heading.textContent = category === 'genre' ? 'Genre' : 'Content';
        column.appendChild(heading);

        for (const tag of categoryTags) {
            const label = document.createElement('label');
            label.className = 'library-tag-option' + (applicableTags.has(tag.id) ? ' tag--applicable' : '');
            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.name = container.id + '-tag';
            checkbox.value = tag.id;
            checkbox.checked = selectedTags.includes(tag.id);
            label.appendChild(checkbox);
            label.appendChild(document.createTextNode(' ' + tag.label));
            column.appendChild(label);
        }

        container.appendChild(column);
    }
}
```

- [ ] **Step 4: Update call sites to pass applicable tags**

Line ~85 (add form):
```javascript
this._renderTagPicker(document.getElementById('library-add-tags'), [], this._getApplicableTagIds());
```

Line ~564 (edit form):
```javascript
this._renderTagPicker(document.getElementById('book-edit-tags'), book.tags || [], this._getApplicableTagIds());
```

- [ ] **Step 5: Run full test suite**

Run: `cd tests && npx jest --no-coverage`
Expected: All tests pass (no regressions)

- [ ] **Step 6: Commit**

```bash
git add assets/js/controllers/LibraryController.js
git commit -m "feat(fwr.10): highlight applicable tags in book add/edit tag picker"
```

---

### Task 4: Integration test for tag picker highlighting

**Files:**
- Modify: `tests/libraryController.test.js`

- [ ] **Step 1: Write integration test**

Add to `tests/libraryController.test.js`:

```javascript
describe('tag picker applicable highlighting', () => {
    test('tags with active item bonuses get tag--applicable class', () => {
        // Setup: equip an item with a tagMatch condition
        const state = { ...characterState };
        state.equippedItems = ['Cloak of the Story-Weaver'];
        state.passiveItemSlots = [];
        state.passiveFamiliarSlots = [];
        state.temporaryBuffs = [];
        state.learnedAbilities = [];
        const stateAdapter = new StateAdapter(state);

        document.body.innerHTML = createLibraryFormHTML();
        const form = document.getElementById('character-sheet');
        const controller = new LibraryController(stateAdapter, form, {});
        controller.initialize();

        const tagContainer = document.getElementById('library-add-tags');
        const labels = tagContainer.querySelectorAll('.library-tag-option');
        const seriesLabel = Array.from(labels).find(
            l => l.querySelector('input')?.value === 'series'
        );
        const fantasyLabel = Array.from(labels).find(
            l => l.querySelector('input')?.value === 'fantasy'
        );

        expect(seriesLabel.classList.contains('tag--applicable')).toBe(true);
        expect(fantasyLabel.classList.contains('tag--applicable')).toBe(false);
    });
});
```

- [ ] **Step 2: Run the test**

Run: `cd tests && npx jest libraryController.test.js --no-coverage`
Expected: PASS

- [ ] **Step 3: Run full test suite**

Run: `cd tests && npx jest --no-coverage`
Expected: All tests pass

- [ ] **Step 4: Commit**

```bash
git add tests/libraryController.test.js
git commit -m "test(fwr.10): integration test for applicable tag highlighting"
```
