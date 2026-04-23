# Book Tagging & Item Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Introduce a book tagging system and migrate all eligible items from legacy `rewardModifier` to ADR-003 `effects` arrays with `tagMatch` conditions, then remove legacy modifier code paths.

**Architecture:** Add `tags: string[]` to the book data model with a ~23-tag vocabulary. Extend `ModifierPipeline` with a `tagMatch` DNF condition evaluator and `EffectRegistry` with slot-aware filtering. Migrate 30 items in `allItems.json` to effects arrays. Rewire the quest completion flow to pass book tags through `TriggerPayload` and remove legacy modifier code from RewardCalculator, RestorationController, and BuffController.

**Tech Stack:** Vanilla JS (no framework), Jekyll static site, Jest for tests, IndexedDB + localStorage for persistence

**Spec:** `docs/superpowers/specs/2026-04-21-fwr-book-tagging-item-migration-design.md`

**Beads:**
- fwr.1 — Tag vocabulary data and schema migration
- fwr.2 — tagMatch condition and slot filtering in pipeline
- fwr.3 — Tag picker UI on book add and edit
- fwr.4 — Migrate 30 items from rewardModifier to effects arrays
- fwr.5 — Quest flow rewire and legacy code removal

---

## File Structure

### New Files
- `assets/data/bookTags.json` — Tag vocabulary definition (id, label, category)
- `tests/tagMatch.test.js` — Tests for tagMatch condition evaluation and slot filtering
- `tests/bookTags.test.js` — Tests for tag vocabulary data contract and book tag validation

### Modified Files
- `assets/js/character-sheet/dataValidator.js` — Add `tags` field to book validation
- `assets/js/character-sheet/dataMigrator.js` — Add migration v16 to backfill `tags: []`
- `assets/js/services/effectSchema.js` — Add `tagMatch` to CONDITION_KEYS
- `assets/js/services/ModifierPipeline.js` — Add `tagMatch` DNF evaluation to `evaluateCondition()`
- `assets/js/services/EffectRegistry.js` — Add slot filtering to `_collectEquippedAndPassiveItemEffects()`
- `assets/data/allItems.json` — Add effects arrays, remove rewardModifier from 30 items
- `_includes/character-sheet/tabs/library.html` — Add tag picker to book add form
- `_includes/character-sheet/drawers/book-edit.html` — Add tag picker to book edit form
- `assets/js/controllers/LibraryController.js` — Read tags from UI, pass to addBook/editBook
- `assets/js/character-sheet/stateAdapter.js` — Include book.tags in markBookComplete result
- `assets/js/services/TriggerPayload.js` — Already supports `tags` (no change needed)
- `assets/js/services/RewardCalculator.js` — Remove legacy item modifier paths
- `assets/js/controllers/RestorationController.js` — Remove legacy passive modifier code
- `assets/js/controllers/BuffController.js` — Remove legacy rewardModifier read
- `tests/dataContracts.test.js` — Add tag vocabulary and item effects coverage

---

## Task 1: Tag Vocabulary Data and Schema Migration (bead fwr.1)

### Files
- Create: `assets/data/bookTags.json`
- Create: `tests/bookTags.test.js`
- Modify: `assets/js/character-sheet/dataValidator.js:436-461`
- Modify: `assets/js/character-sheet/dataMigrator.js:15,336-403`
- Modify: `tests/dataContracts.test.js`

---

- [ ] **Step 1: Create the tag vocabulary data file**

Create `assets/data/bookTags.json`:

```json
[
  { "id": "fantasy", "label": "Fantasy", "category": "genre" },
  { "id": "romance", "label": "Romance", "category": "genre" },
  { "id": "sci-fi", "label": "Sci-Fi", "category": "genre" },
  { "id": "mystery", "label": "Mystery", "category": "genre" },
  { "id": "horror", "label": "Horror", "category": "genre" },
  { "id": "literary-fiction", "label": "Literary Fiction", "category": "genre" },
  { "id": "contemporary-fiction", "label": "Contemporary Fiction", "category": "genre" },
  { "id": "non-fiction", "label": "Non-Fiction", "category": "genre" },
  { "id": "classics", "label": "Classics", "category": "genre" },
  { "id": "series", "label": "Part of a Series", "category": "content" },
  { "id": "dragons", "label": "Dragons / Legendary Creatures", "category": "content" },
  { "id": "fae", "label": "Fae / Faerie", "category": "content" },
  { "id": "nature-magic", "label": "Nature Magic / Plants", "category": "content" },
  { "id": "magic-system", "label": "Magic Systems", "category": "content" },
  { "id": "multiple-pov", "label": "Multiple POV / Narrators", "category": "content" },
  { "id": "non-linear-narrative", "label": "Non-Linear Narrative", "category": "content" },
  { "id": "technology", "label": "Robots / AI / Technology", "category": "content" },
  { "id": "social", "label": "Social Gatherings / Events", "category": "content" },
  { "id": "philosophical", "label": "Faith / Philosophy / Spirituality", "category": "content" },
  { "id": "dark", "label": "Dark Themes", "category": "content" },
  { "id": "new-author", "label": "New-to-You Author", "category": "content" },
  { "id": "celestial", "label": "Celestial Motifs", "category": "content" },
  { "id": "unlocked", "label": "Unlocking / Discovery", "category": "content" }
]
```

- [ ] **Step 2: Run `node scripts/generate-data.js`**

Run: `node scripts/generate-data.js`

This regenerates the data exports so `bookTags.json` is available via the data module.

- [ ] **Step 3: Write the tag vocabulary data contract test**

Create `tests/bookTags.test.js`:

```javascript
/**
 * @jest-environment jsdom
 */
import bookTags from '../assets/data/bookTags.json';

describe('bookTags.json contract', () => {
  it('has no duplicate IDs', () => {
    const ids = bookTags.map(t => t.id);
    expect(ids.length).toBe(new Set(ids).size);
  });

  it('every tag has id, label, and category', () => {
    for (const tag of bookTags) {
      expect(typeof tag.id).toBe('string');
      expect(tag.id.length).toBeGreaterThan(0);
      expect(typeof tag.label).toBe('string');
      expect(tag.label.length).toBeGreaterThan(0);
      expect(['genre', 'content']).toContain(tag.category);
    }
  });

  it('IDs use lowercase kebab-case', () => {
    for (const tag of bookTags) {
      expect(tag.id).toMatch(/^[a-z][a-z0-9-]*$/);
    }
  });
});
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx jest tests/bookTags.test.js --verbose`
Expected: 3 tests PASS

- [ ] **Step 5: Write a failing test for book tag validation in dataValidator**

Add to `tests/bookTags.test.js`:

```javascript
import { validateBook } from '../assets/js/character-sheet/dataValidator.js';

// If validateBook is not directly exported, import the module that exposes it.
// The test may need adjustment based on how dataValidator exports work.

describe('book tag validation', () => {
  it('preserves valid tags on a book', () => {
    const book = {
      id: 'test-1',
      title: 'Test Book',
      tags: ['fantasy', 'series']
    };
    const result = validateBook(book);
    expect(result.tags).toEqual(['fantasy', 'series']);
  });

  it('defaults to empty array when tags is missing', () => {
    const book = { id: 'test-2', title: 'No Tags' };
    const result = validateBook(book);
    expect(result.tags).toEqual([]);
  });

  it('filters out non-string values from tags', () => {
    const book = { id: 'test-3', title: 'Bad Tags', tags: ['fantasy', 42, null, 'romance'] };
    const result = validateBook(book);
    expect(result.tags).toEqual(['fantasy', 'romance']);
  });
});
```

- [ ] **Step 6: Run test to verify it fails**

Run: `npx jest tests/bookTags.test.js --verbose`
Expected: FAIL — `validateBook` does not yet return a `tags` field

- [ ] **Step 7: Add tags field to validateBook in dataValidator.js**

In `assets/js/character-sheet/dataValidator.js`, inside the `validateBook` function (around line 458), add the `tags` field to the returned object, after the `links` field:

```javascript
        links: {
            questIds: Array.isArray(links.questIds) ? links.questIds.filter(x => typeof x === 'string') : (typeof links.tomeQuestId === 'string' ? [links.tomeQuestId] : []),
            curriculumPromptIds: Array.isArray(links.curriculumPromptIds) ? links.curriculumPromptIds.filter(x => typeof x === 'string') : []
        },
        tags: Array.isArray(book.tags) ? book.tags.filter(t => typeof t === 'string') : []
```

Note: change the closing of the `links` object from `}` followed by the function's closing `};` — add a comma after the `links` closing brace and add the `tags` line.

- [ ] **Step 8: Run test to verify it passes**

Run: `npx jest tests/bookTags.test.js --verbose`
Expected: All 6 tests PASS

- [ ] **Step 9: Write a failing test for the schema migration**

Add to `tests/bookTags.test.js`:

```javascript
import { migrateState, SCHEMA_VERSION } from '../assets/js/character-sheet/dataMigrator.js';
import { STORAGE_KEYS } from '../assets/js/character-sheet/storageKeys.js';

describe('schema migration v16 - book tags', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('adds tags: [] to existing books without tags', () => {
    const oldState = {
      [STORAGE_KEYS.BOOKS]: {
        'book-1': { id: 'book-1', title: 'Old Book', status: 'completed' },
        'book-2': { id: 'book-2', title: 'Another', status: 'reading', tags: ['fantasy'] }
      }
    };
    localStorage.setItem('tomeOfSecrets_schemaVersion', '15');
    const migrated = migrateState(oldState);
    const books = migrated[STORAGE_KEYS.BOOKS];
    expect(books['book-1'].tags).toEqual([]);
    expect(books['book-2'].tags).toEqual(['fantasy']);
  });

  it('schema version is now 16', () => {
    expect(SCHEMA_VERSION).toBe(16);
  });
});
```

- [ ] **Step 10: Run test to verify it fails**

Run: `npx jest tests/bookTags.test.js --verbose`
Expected: FAIL — SCHEMA_VERSION is still 15, no migration v16 exists

- [ ] **Step 11: Implement schema migration v16**

In `assets/js/character-sheet/dataMigrator.js`:

1. Change `SCHEMA_VERSION` from `15` to `16` (line 15).

2. Add the migration function after `migrateToVersion15`:

```javascript
function migrateToVersion16(state) {
    const migrated = { ...state };
    const books = migrated[STORAGE_KEYS.BOOKS];
    if (books && typeof books === 'object' && !Array.isArray(books)) {
        const updated = {};
        for (const [id, book] of Object.entries(books)) {
            if (!book || typeof book !== 'object') {
                updated[id] = book;
                continue;
            }
            updated[id] = {
                ...book,
                tags: Array.isArray(book.tags) ? book.tags : []
            };
        }
        migrated[STORAGE_KEYS.BOOKS] = updated;
    }
    return migrated;
}
```

3. Add the version 16 case to the migration switch/chain (find the pattern where versions are dispatched — likely a series of `if (version < N)` checks). Add:

```javascript
if (version < 16) {
    state = migrateToVersion16(state);
}
```

- [ ] **Step 12: Run test to verify it passes**

Run: `npx jest tests/bookTags.test.js --verbose`
Expected: All tests PASS

- [ ] **Step 13: Run the full test suite**

Run: `npx jest --verbose`
Expected: All existing tests continue to pass (the `tags` field addition is backwards-compatible)

- [ ] **Step 14: Commit**

```bash
git add assets/data/bookTags.json tests/bookTags.test.js assets/js/character-sheet/dataValidator.js assets/js/character-sheet/dataMigrator.js
git commit -m "feat(fwr.1): add book tag vocabulary and schema migration v16"
```

---

## Task 2: tagMatch Condition and Slot Filtering in Pipeline (bead fwr.2)

### Files
- Create: `tests/tagMatch.test.js`
- Modify: `assets/js/services/effectSchema.js:28-43`
- Modify: `assets/js/services/ModifierPipeline.js:31-73`
- Modify: `assets/js/services/EffectRegistry.js:117-158`

---

- [ ] **Step 1: Write failing tests for tagMatch condition evaluation**

Create `tests/tagMatch.test.js`:

```javascript
/**
 * @jest-environment jsdom
 */
import { ModifierPipeline } from '../assets/js/services/ModifierPipeline.js';

describe('tagMatch condition evaluation', () => {
  it('matches a single-tag group', () => {
    const condition = { tagMatch: [['fantasy']] };
    const payload = { tags: ['fantasy', 'series'] };
    expect(ModifierPipeline.evaluateCondition(condition, payload)).toBe(true);
  });

  it('rejects when tag is missing', () => {
    const condition = { tagMatch: [['fantasy']] };
    const payload = { tags: ['romance'] };
    expect(ModifierPipeline.evaluateCondition(condition, payload)).toBe(false);
  });

  it('matches AND within a group (all tags required)', () => {
    const condition = { tagMatch: [['fantasy', 'series']] };
    const payload = { tags: ['fantasy', 'series', 'dragons'] };
    expect(ModifierPipeline.evaluateCondition(condition, payload)).toBe(true);
  });

  it('rejects AND group when one tag is missing', () => {
    const condition = { tagMatch: [['fantasy', 'series']] };
    const payload = { tags: ['fantasy'] };
    expect(ModifierPipeline.evaluateCondition(condition, payload)).toBe(false);
  });

  it('matches OR across groups (any group sufficient)', () => {
    const condition = { tagMatch: [['romance'], ['contemporary-fiction', 'social']] };
    const payload = { tags: ['romance'] };
    expect(ModifierPipeline.evaluateCondition(condition, payload)).toBe(true);
  });

  it('matches second OR group when first fails', () => {
    const condition = { tagMatch: [['romance'], ['contemporary-fiction', 'social']] };
    const payload = { tags: ['contemporary-fiction', 'social'] };
    expect(ModifierPipeline.evaluateCondition(condition, payload)).toBe(true);
  });

  it('rejects when no OR group matches', () => {
    const condition = { tagMatch: [['romance'], ['contemporary-fiction', 'social']] };
    const payload = { tags: ['sci-fi'] };
    expect(ModifierPipeline.evaluateCondition(condition, payload)).toBe(false);
  });

  it('treats empty tags array as no match', () => {
    const condition = { tagMatch: [['fantasy']] };
    const payload = { tags: [] };
    expect(ModifierPipeline.evaluateCondition(condition, payload)).toBe(false);
  });

  it('treats missing tags as no match', () => {
    const condition = { tagMatch: [['fantasy']] };
    const payload = {};
    expect(ModifierPipeline.evaluateCondition(condition, payload)).toBe(false);
  });

  it('works alongside other conditions (tagMatch + pageCount)', () => {
    const condition = { tagMatch: [['fantasy']], pageCount: { min: 500 } };
    const payload = { tags: ['fantasy'], pageCount: 600 };
    expect(ModifierPipeline.evaluateCondition(condition, payload)).toBe(true);
  });

  it('rejects when tagMatch passes but pageCount fails', () => {
    const condition = { tagMatch: [['fantasy']], pageCount: { min: 500 } };
    const payload = { tags: ['fantasy'], pageCount: 200 };
    expect(ModifierPipeline.evaluateCondition(condition, payload)).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest tests/tagMatch.test.js --verbose`
Expected: FAIL — `tagMatch` condition is not recognized by `evaluateCondition`

- [ ] **Step 3: Add tagMatch to CONDITION_KEYS in effectSchema.js**

In `assets/js/services/effectSchema.js`, add `'tagMatch'` to the `CONDITION_KEYS` array (around line 38):

```javascript
export const CONDITION_KEYS = Object.freeze([
    'questType',
    'encounterType',
    'encounterAction',
    'genre',
    'pageCount',
    'hasTag',
    'tagMatch',
    'isNewAuthor',
    'hasAtmosphericBuff',
    'hasFamiliarEquipped'
]);
```

- [ ] **Step 4: Implement tagMatch evaluation in ModifierPipeline.evaluateCondition()**

In `assets/js/services/ModifierPipeline.js`, in the `evaluateCondition` method (around line 46, after the `hasTag` block), add:

```javascript
    if (condition.tagMatch != null) {
        const tags = Array.isArray(payload.tags) ? payload.tags : [];
        const groups = Array.isArray(condition.tagMatch) ? condition.tagMatch : [];
        const matched = groups.some(group => {
            if (!Array.isArray(group)) return false;
            return group.every(requiredTag => tags.includes(requiredTag));
        });
        if (!matched) {
            return false;
        }
    }
```

Also add `'tagMatch'` to the skip list in the generic loop (around line 52, where `key === 'pageCount' || key === 'hasTag'`):

```javascript
    if (key === 'pageCount' || key === 'hasTag' || key === 'tagMatch') {
        continue;
    }
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx jest tests/tagMatch.test.js --verbose`
Expected: All 11 tests PASS

- [ ] **Step 6: Write failing tests for slot-aware effect filtering**

Add to `tests/tagMatch.test.js`:

```javascript
import { EffectRegistry } from '../assets/js/services/EffectRegistry.js';
import { STORAGE_KEYS } from '../assets/js/character-sheet/storageKeys.js';

describe('slot-aware effect filtering', () => {
  const mockDataModule = {
    allItems: {
      'test-sword': {
        id: 'test-sword',
        name: 'Test Sword',
        effects: [
          {
            trigger: 'ON_QUEST_COMPLETED',
            modifier: { type: 'ADD_FLAT', resource: 'inkDrops', value: 20 },
            slot: 'equipped'
          },
          {
            trigger: 'ON_QUEST_COMPLETED',
            modifier: { type: 'ADD_FLAT', resource: 'inkDrops', value: 10 },
            slot: 'passive'
          }
        ]
      }
    },
    keeperBackgrounds: {},
    schoolBenefits: {},
    masteryAbilities: {},
    sanctumBenefits: {}
  };

  it('returns only equipped-slot effects for equipped items', () => {
    const state = {
      [STORAGE_KEYS.EQUIPPED_ITEMS]: [{ name: 'Test Sword' }],
      [STORAGE_KEYS.PASSIVE_ITEM_SLOTS]: [],
      [STORAGE_KEYS.PASSIVE_FAMILIAR_SLOTS]: [],
      [STORAGE_KEYS.LEARNED_ABILITIES]: []
    };
    const effects = EffectRegistry.getActiveEffects('ON_QUEST_COMPLETED', state, mockDataModule);
    const itemEffects = effects.filter(e => e.source?.sourceType === 'item');
    expect(itemEffects).toHaveLength(1);
    expect(itemEffects[0].modifier.value).toBe(20);
  });

  it('returns only passive-slot effects for passive items', () => {
    const state = {
      [STORAGE_KEYS.EQUIPPED_ITEMS]: [],
      [STORAGE_KEYS.PASSIVE_ITEM_SLOTS]: [{ itemName: 'Test Sword' }],
      [STORAGE_KEYS.PASSIVE_FAMILIAR_SLOTS]: [],
      [STORAGE_KEYS.LEARNED_ABILITIES]: []
    };
    const effects = EffectRegistry.getActiveEffects('ON_QUEST_COMPLETED', state, mockDataModule);
    const itemEffects = effects.filter(e => e.source?.sourceType === 'item');
    expect(itemEffects).toHaveLength(1);
    expect(itemEffects[0].modifier.value).toBe(10);
  });

  it('returns effects with no slot field regardless of item position', () => {
    const dataWithNoSlot = {
      ...mockDataModule,
      allItems: {
        'slotless-item': {
          id: 'slotless-item',
          name: 'Slotless Item',
          effects: [
            {
              trigger: 'ON_QUEST_COMPLETED',
              modifier: { type: 'ADD_FLAT', resource: 'inkDrops', value: 5 }
            }
          ]
        }
      }
    };
    const state = {
      [STORAGE_KEYS.EQUIPPED_ITEMS]: [{ name: 'Slotless Item' }],
      [STORAGE_KEYS.PASSIVE_ITEM_SLOTS]: [],
      [STORAGE_KEYS.PASSIVE_FAMILIAR_SLOTS]: [],
      [STORAGE_KEYS.LEARNED_ABILITIES]: []
    };
    const effects = EffectRegistry.getActiveEffects('ON_QUEST_COMPLETED', state, dataWithNoSlot);
    const itemEffects = effects.filter(e => e.source?.sourceType === 'item');
    expect(itemEffects).toHaveLength(1);
    expect(itemEffects[0].modifier.value).toBe(5);
  });
});
```

- [ ] **Step 7: Run tests to verify they fail**

Run: `npx jest tests/tagMatch.test.js --verbose`
Expected: FAIL — slot filtering is not implemented; both equipped and passive effects are returned

- [ ] **Step 8: Implement slot-aware filtering in EffectRegistry**

In `assets/js/services/EffectRegistry.js`, modify `_collectEquippedAndPassiveItemEffects` (around line 117). The method needs to track which slot each item is in and filter effects by the `slot` field.

Replace the method with:

```javascript
static _collectEquippedAndPassiveItemEffects(trigger, state, dataModule) {
    const catalog = dataModule.allItems || {};
    const effects = [];
    const seenItemKeys = new Set();

    const pushForItem = (rawName, itemSlot) => {
        if (!rawName || typeof rawName !== 'string') {
            return;
        }
        const item = findByIdOrName(catalog, rawName);
        const id = item?.id || rawName;
        const dedupeKey = `item:${id}:${itemSlot}`;
        if (seenItemKeys.has(dedupeKey)) {
            return;
        }
        seenItemKeys.add(dedupeKey);
        const source = {
            sourceType: 'item',
            id,
            name: item?.name || rawName
        };
        const allEffects = collectEffects(item?.effects, trigger, source);
        for (const effect of allEffects) {
            if (!effect.slot || effect.slot === itemSlot) {
                effects.push(effect);
            }
        }
    };

    const equipped = state[STORAGE_KEYS.EQUIPPED_ITEMS] || [];
    for (const equippedItem of equipped) {
        const name = typeof equippedItem === 'string' ? equippedItem : equippedItem?.name;
        pushForItem(name, 'equipped');
    }

    const passiveItems = state[STORAGE_KEYS.PASSIVE_ITEM_SLOTS] || [];
    for (const slot of passiveItems) {
        pushForItem(slot?.itemName, 'passive');
    }

    const passiveFamiliars = state[STORAGE_KEYS.PASSIVE_FAMILIAR_SLOTS] || [];
    for (const slot of passiveFamiliars) {
        pushForItem(slot?.itemName, 'passive');
    }

    return effects;
}
```

Key changes:
- `pushForItemName` renamed to `pushForItem` and takes an `itemSlot` parameter (`'equipped'` or `'passive'`)
- Dedupe key now includes the slot to allow the same item in different slots (edge case)
- After collecting effects, filters by `effect.slot` — only includes effects where `slot` matches or `slot` is absent
- The `slot` field on effects comes from the raw JSON data and is preserved by `collectEffects`

**Important:** Verify that the `collectEffects` helper (defined earlier in the file) preserves the `slot` field from the raw effect data. Find `collectEffects` and ensure it spreads or copies all fields from the effect. If it constructs a new object and only picks specific fields, add `slot` to the picked fields.

- [ ] **Step 9: Run tests to verify they pass**

Run: `npx jest tests/tagMatch.test.js --verbose`
Expected: All 14 tests PASS

- [ ] **Step 10: Run the full test suite**

Run: `npx jest --verbose`
Expected: All existing tests continue to pass

- [ ] **Step 11: Commit**

```bash
git add tests/tagMatch.test.js assets/js/services/effectSchema.js assets/js/services/ModifierPipeline.js assets/js/services/EffectRegistry.js
git commit -m "feat(fwr.2): add tagMatch DNF condition and slot-aware effect filtering"
```

---

## Task 3: Tag Picker UI on Book Add and Edit (bead fwr.3)

### Files
- Modify: `_includes/character-sheet/tabs/library.html`
- Modify: `_includes/character-sheet/drawers/book-edit.html`
- Modify: `assets/js/controllers/LibraryController.js`

---

- [ ] **Step 1: Add tag picker HTML to the book add form**

In `_includes/character-sheet/tabs/library.html`, after the shelf radio row (around line 70, before the `library-add-actions` div), add:

```html
    <div class="form-row library-tags-row">
        <label><strong>Tags (optional):</strong></label>
        <div id="library-add-tags" class="library-tag-picker" role="group" aria-label="Book tags">
            <!-- Tags are rendered by LibraryController from bookTags.json -->
        </div>
    </div>
```

- [ ] **Step 2: Add tag picker HTML to the book edit form**

In `_includes/character-sheet/drawers/book-edit.html`, after the series selector row (around line 71, before `book-edit-links-section`), add:

```html
    <div class="form-row">
        <label><strong>Tags:</strong></label>
        <div id="book-edit-tags" class="library-tag-picker" role="group" aria-label="Book tags">
            <!-- Tags are rendered by LibraryController from bookTags.json -->
        </div>
    </div>
```

- [ ] **Step 3: Add tag picker rendering and reading to LibraryController**

In `assets/js/controllers/LibraryController.js`, add a helper method to render tag checkboxes and a method to read selected tags. Find the class definition and add these methods:

```javascript
/**
 * Render tag checkboxes into a container element.
 * @param {HTMLElement} container - The element to render into
 * @param {string[]} selectedTags - Tags to pre-check
 */
_renderTagPicker(container, selectedTags = []) {
    if (!container) return;
    const tags = this.dataModule?.bookTags || [];
    container.innerHTML = '';
    let currentCategory = '';
    for (const tag of tags) {
        if (tag.category !== currentCategory) {
            currentCategory = tag.category;
            const heading = document.createElement('div');
            heading.className = 'library-tag-category';
            heading.textContent = currentCategory === 'genre' ? 'Genre' : 'Content';
            container.appendChild(heading);
        }
        const label = document.createElement('label');
        label.className = 'library-tag-option';
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.name = container.id + '-tag';
        checkbox.value = tag.id;
        checkbox.checked = selectedTags.includes(tag.id);
        label.appendChild(checkbox);
        label.appendChild(document.createTextNode(' ' + tag.label));
        container.appendChild(label);
    }
}

/**
 * Read checked tags from a tag picker container.
 * @param {HTMLElement} container
 * @returns {string[]}
 */
_readTagPicker(container) {
    if (!container) return [];
    const checked = container.querySelectorAll('input[type="checkbox"]:checked');
    return Array.from(checked).map(cb => cb.value);
}
```

- [ ] **Step 4: Wire tag picker into the add book flow**

In `LibraryController.js`, find the `init` or constructor method where the add form is set up. After the form is ready, add a call to render the tag picker:

```javascript
this._renderTagPicker(document.getElementById('library-add-tags'));
```

In `handleAddBook()` (around line 433), before the `this.stateAdapter.addBook()` call, read the tags:

```javascript
    const tags = this._readTagPicker(document.getElementById('library-add-tags'));
```

Then pass `tags` to `addBook`:

```javascript
    const book = this.stateAdapter.addBook({
        title,
        author,
        cover,
        pageCount: pageCountNum,
        status,
        shelfCategory,
        tags
    });
```

Also in `_clearAddForm()`, reset the tag checkboxes:

```javascript
    this._renderTagPicker(document.getElementById('library-add-tags'));
```

- [ ] **Step 5: Wire tag picker into the book edit flow**

Find the method that populates the edit drawer when a book is opened for editing (look for where `book-edit-title`, `book-edit-author` etc. are set). Add:

```javascript
this._renderTagPicker(document.getElementById('book-edit-tags'), book.tags || []);
```

In the save handler for the edit form, read the tags and include them in the update:

```javascript
const tags = this._readTagPicker(document.getElementById('book-edit-tags'));
```

Pass `tags` to whichever method saves the edited book (likely `stateAdapter.updateBook()` or similar).

- [ ] **Step 6: Ensure stateAdapter.addBook passes tags through**

In `assets/js/character-sheet/stateAdapter.js`, find the `addBook` method. It likely constructs the book object from the parameters. Ensure `tags` is included:

```javascript
const book = {
    id: this._generateId(),
    title,
    author,
    cover,
    pageCount,
    status,
    shelfCategory,
    dateAdded: new Date().toISOString(),
    dateCompleted: status === 'completed' ? new Date().toISOString() : null,
    links: { questIds: [], curriculumPromptIds: [] },
    tags: Array.isArray(tags) ? tags : []
};
```

Do the same for the update/edit method.

- [ ] **Step 7: Add basic CSS for the tag picker**

Find the existing CSS file that styles the library (likely `assets/css/character-sheet.css` or a library-specific file). Add minimal styles:

```css
.library-tag-picker {
    display: flex;
    flex-wrap: wrap;
    gap: 4px 12px;
}
.library-tag-category {
    width: 100%;
    font-size: 0.85em;
    font-weight: bold;
    margin-top: 6px;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    opacity: 0.7;
}
.library-tag-option {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font-size: 0.9em;
    cursor: pointer;
}
```

- [ ] **Step 8: Manual testing**

Open the character sheet in a browser. Verify:
1. Tag picker appears on the "Add Book" form with genre and content sections
2. Tags can be checked/unchecked
3. Adding a book preserves the selected tags (check via browser devtools / localStorage)
4. Opening the book edit drawer shows the tag picker pre-populated with the book's tags
5. Saving edits updates the tags

- [ ] **Step 9: Commit**

```bash
git add _includes/character-sheet/tabs/library.html _includes/character-sheet/drawers/book-edit.html assets/js/controllers/LibraryController.js assets/js/character-sheet/stateAdapter.js
git commit -m "feat(fwr.3): add tag picker UI to book add form and edit drawer"
```

---

## Task 4: Migrate 30 Items from rewardModifier to Effects Arrays (bead fwr.4)

### Files
- Modify: `assets/data/allItems.json`
- Modify: `tests/dataContracts.test.js`

---

- [ ] **Step 1: Write a failing data contract test for migrated items**

Add to `tests/dataContracts.test.js`, in the `allItems.json contract` test or as a new describe block:

```javascript
describe('allItems.json — migrated items have effects', () => {
  // Items that are atmospheric/context-based and intentionally NOT migrated
  const ATMOSPHERIC_EXCLUSIONS = new Set([
    'gilded-painting',
    'garden-gnome',
    'mystical-moth',
    'coffee-elemental',
    'scatter-brain-scarab',
    'tome-bound-cat'
  ]);

  it('every non-atmospheric item has an effects array', () => {
    const missing = [];
    Object.values(allItems).forEach((item) => {
      if (ATMOSPHERIC_EXCLUSIONS.has(item.id)) return;
      if (!Array.isArray(item.effects) || item.effects.length === 0) {
        missing.push(item.name || item.id);
      }
    });
    expect(missing).toEqual([]);
  });

  it('no migrated item retains rewardModifier with values', () => {
    const retained = [];
    Object.values(allItems).forEach((item) => {
      if (ATMOSPHERIC_EXCLUSIONS.has(item.id)) return;
      const rm = item.rewardModifier;
      const prm = item.passiveRewardModifier;
      const hasActiveValues = rm && typeof rm === 'object' && Object.keys(rm).length > 0;
      const hasPassiveValues = prm && typeof prm === 'object' && Object.keys(prm).length > 0;
      if (hasActiveValues || hasPassiveValues) {
        retained.push(item.name || item.id);
      }
    });
    expect(retained).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/dataContracts.test.js --verbose`
Expected: FAIL — many items still have rewardModifier and lack effects

- [ ] **Step 3: Migrate all 30 items in allItems.json**

For each item, replace `rewardModifier`/`passiveRewardModifier` (and `pageCondition`/`passivePageCondition` where present) with an `effects` array containing equipped and passive variants.

**Pattern for a simple tag-based item** (e.g., Pocket Dragon):

Before:
```json
"Pocket Dragon": {
    "id": "pocket-dragon",
    "name": "Pocket Dragon",
    "type": "Familiar",
    "img": "assets/images/rewards/pocket-dragon.png",
    "bonus": "Earn a +20 Ink Drop bonus for books in a fantasy series.",
    "passiveBonus": "Fantasy series books grant +10 Ink Drops (passive).",
    "rewardModifier": { "inkDrops": 20 },
    "passiveRewardModifier": { "inkDrops": 10 }
}
```

After:
```json
"Pocket Dragon": {
    "id": "pocket-dragon",
    "name": "Pocket Dragon",
    "type": "Familiar",
    "img": "assets/images/rewards/pocket-dragon.png",
    "bonus": "Earn a +20 Ink Drop bonus for books in a fantasy series.",
    "passiveBonus": "Fantasy series books grant +10 Ink Drops (passive).",
    "rewardModifier": {},
    "passiveRewardModifier": {},
    "effects": [
        {
            "trigger": "ON_QUEST_COMPLETED",
            "condition": { "tagMatch": [["fantasy", "series"]] },
            "modifier": { "type": "ADD_FLAT", "resource": "inkDrops", "value": 20 },
            "slot": "equipped"
        },
        {
            "trigger": "ON_QUEST_COMPLETED",
            "condition": { "tagMatch": [["fantasy", "series"]] },
            "modifier": { "type": "ADD_FLAT", "resource": "inkDrops", "value": 10 },
            "slot": "passive"
        }
    ]
}
```

**Pattern for a multiplier item** (e.g., Scatter Brain Scarab is atmospheric/excluded, but Tome of Potential):

```json
"effects": [
    {
        "trigger": "ON_QUEST_COMPLETED",
        "condition": { "pageCount": { "min": 400 } },
        "modifier": { "type": "MULTIPLY", "resource": "inkDrops", "value": 3 },
        "slot": "equipped"
    },
    {
        "trigger": "ON_QUEST_COMPLETED",
        "condition": { "pageCount": { "min": 400 } },
        "modifier": { "type": "MULTIPLY", "resource": "inkDrops", "value": 1.5 },
        "slot": "passive"
    }
]
```

**Pattern for multi-resource item** (e.g., Dancing Shoes):

```json
"effects": [
    {
        "trigger": "ON_QUEST_COMPLETED",
        "condition": { "tagMatch": [["romance"], ["contemporary-fiction", "social"]] },
        "modifier": { "type": "ADD_FLAT", "resource": "inkDrops", "value": 10 },
        "slot": "equipped"
    },
    {
        "trigger": "ON_QUEST_COMPLETED",
        "condition": { "tagMatch": [["romance"], ["contemporary-fiction", "social"]] },
        "modifier": { "type": "ADD_FLAT", "resource": "paperScraps", "value": 5 },
        "slot": "equipped"
    },
    {
        "trigger": "ON_QUEST_COMPLETED",
        "condition": { "tagMatch": [["romance"], ["contemporary-fiction", "social"]] },
        "modifier": { "type": "ADD_FLAT", "resource": "inkDrops", "value": 5 },
        "slot": "passive"
    }
]
```

**Complete mapping — apply these to each item:**

| Item | tagMatch | pageCount | Equipped Effects | Passive Effects |
|------|----------|-----------|-----------------|-----------------|
| Librarian's Compass | `[["new-author"]]` | — | ADD_FLAT inkDrops 20 | ADD_FLAT inkDrops 10 |
| Amulet of Duality | `[["multiple-pov"]]` | — | ADD_FLAT inkDrops 15 | ADD_FLAT inkDrops 7 |
| Cloak of the Story-Weaver | `[["series"]]` | — | ADD_FLAT inkDrops 10 | ADD_FLAT inkDrops 5 |
| Blood Fury Tattoo | `[["series"]]` | — | ADD_FLAT inkDrops 15 | ADD_FLAT inkDrops 7 |
| The Bookwyrm's Scale | — | min: 500 | ADD_FLAT inkDrops 10 | ADD_FLAT inkDrops 5 |
| Key of the Archive | `[["unlocked"]]` | — | ADD_FLAT inkDrops 15 | ADD_FLAT inkDrops 7 |
| Tome of Potential | — | min: 400 | MULTIPLY inkDrops 3 | MULTIPLY inkDrops 1.5 |
| Pocket Dragon | `[["fantasy", "series"]]` | — | ADD_FLAT inkDrops 20 | ADD_FLAT inkDrops 10 |
| Page Sprite | — | max: 299 | MULTIPLY inkDrops 2 | MULTIPLY inkDrops 1.5 |
| Crystal Sprite | `[["literary-fiction"]]` | — | ADD_FLAT paperScraps 15 | ADD_FLAT paperScraps 7 |
| Reading Glasses | `[["non-fiction"]]` | — | ADD_FLAT xp 20 | ADD_FLAT xp 10 |
| Baby Hollyphant | `[["philosophical"]]` | — | ADD_FLAT xp 15 + ADD_FLAT paperScraps 5 | ADD_FLAT xp 7 |
| Lab Assistant Automaton | `[["technology"]]` | — | ADD_FLAT inkDrops 15 | ADD_FLAT inkDrops 7 |
| Temporal Sprite | `[["non-linear-narrative"]]` | — | ADD_FLAT inkDrops 20 | ADD_FLAT inkDrops 10 |
| Ingredient Sprite | `[["magic-system"]]` | — | ADD_FLAT inkDrops 15 | ADD_FLAT inkDrops 7 |
| Herb Dragon | `[["nature-magic"]]` | — | ADD_FLAT inkDrops 15 | ADD_FLAT inkDrops 7 |
| Dancing Shoes | `[["romance"], ["contemporary-fiction", "social"]]` | — | ADD_FLAT inkDrops 10 + ADD_FLAT paperScraps 5 | ADD_FLAT inkDrops 5 |
| Dragon Fang | `[["dragons"]]` | — | ADD_FLAT inkDrops 20 | ADD_FLAT inkDrops 10 |
| Romance Reader's Ribbon | `[["romance"]]` | — | ADD_FLAT inkDrops 15 | ADD_FLAT inkDrops 7 |
| Star Navigator's Chart | `[["sci-fi"]]` | — | ADD_FLAT inkDrops 15 | ADD_FLAT inkDrops 7 |
| Fae-Touched Crystal | `[["fantasy", "fae"]]` | — | ADD_FLAT inkDrops 15 | ADD_FLAT inkDrops 7 |
| Warding Candle | `[["horror"], ["fantasy", "dark"]]` | — | ADD_FLAT inkDrops 15 | ADD_FLAT inkDrops 7 |
| Literary Medallion | `[["classics"], ["literary-fiction"]]` | — | ADD_FLAT xp 20 | ADD_FLAT xp 10 |
| Detective's Magnifying Glass | `[["mystery"]]` | — | ADD_FLAT inkDrops 15 | ADD_FLAT inkDrops 7 |

**Hybrid items — remove rewardModifier, keep existing effects:**

| Item | Action |
|------|--------|
| Librarian's Quill | Already has ON_JOURNAL_ENTRY effects. Set `rewardModifier: {}`, `passiveRewardModifier: {}`. Add `"slot": "equipped"` to existing effect. Add passive variant with value 1. |
| Golden Pen | Already has ON_JOURNAL_ENTRY effects. Set `rewardModifier: {}`, `passiveRewardModifier: {}`. Add `"slot": "equipped"` to existing effect. Add passive variant with value 5. |
| Celestial Koi Fish | Already has ON_QUEST_COMPLETED effect with hasTag. Set `rewardModifier: {}`, `passiveRewardModifier: {}`. Add `"slot": "equipped"` to existing effect. Add passive variant with value 5. |

**Page-condition items — remove pageCondition/passivePageCondition fields** since the condition is now in the effects array.

- [ ] **Step 4: Run `node scripts/generate-data.js`**

Run: `node scripts/generate-data.js`

- [ ] **Step 5: Run the data contract tests**

Run: `npx jest tests/dataContracts.test.js --verbose`
Expected: All tests PASS including the new migration assertions

- [ ] **Step 6: Run the full test suite**

Run: `npx jest --verbose`
Expected: All tests pass. Some existing tests in `realDataIntegration.test.js` may need updates if they reference specific items by their old modifier structure.

- [ ] **Step 7: Commit**

```bash
git add assets/data/allItems.json tests/dataContracts.test.js
git commit -m "feat(fwr.4): migrate 30 items from rewardModifier to effects arrays"
```

---

## Task 5: Quest Flow Rewire and Legacy Code Removal (bead fwr.5)

### Files
- Modify: `assets/js/character-sheet/stateAdapter.js`
- Modify: `assets/js/controllers/QuestController.js` (or `assets/js/quest-handlers/BaseQuestHandler.js`)
- Modify: `assets/js/services/RewardCalculator.js`
- Modify: `assets/js/controllers/RestorationController.js`
- Modify: `assets/js/controllers/BuffController.js`

**Note:** This is the most complex task. It requires careful attention to the existing reward calculation flow. Read the quest completion flow in `BaseQuestHandler.completeActiveQuest()` and `RewardCalculator.calculateFinalRewards()` before making changes.

---

- [ ] **Step 1: Wire book tags into TriggerPayload at quest completion**

In `assets/js/character-sheet/stateAdapter.js`, the `markBookComplete` method (line 1944) returns `{ book, movedQuests, synergyRewards }`. The `book` object already contains `tags` (added in Task 1). The caller (`onBookMarkedComplete` in character-sheet.js) passes each moved quest to `questController.completeMovedQuestFromBook(quest)`.

Find where `TriggerPayload.questCompleted()` is called during quest completion. It's likely in `BaseQuestHandler.completeActiveQuest()` or `RewardCalculator.calculateFinalRewards()`. The `tags` parameter already exists on `TriggerPayload.questCompleted()` — it just needs to be populated from the book.

Trace the flow:
1. `stateAdapter.markBookComplete(bookId)` returns `{ book, movedQuests, synergyRewards }`
2. `onBookMarkedComplete` calls `questController.completeMovedQuestFromBook(quest)` for each moved quest
3. This eventually reaches `RewardCalculator.calculateFinalRewards()` which builds the trigger payload

Find where the trigger payload is built and add `tags: book.tags || []`. The book object is available via `quest.bookId` — look up the book to get its tags, or pass tags through the completion chain.

The simplest approach: in `completeMovedQuestFromBook`, look up the book by `quest.bookId` and attach tags to the quest object before passing to reward calculation:

```javascript
// In the method that prepares the quest for reward calculation
const book = this.stateAdapter.getBook(quest.bookId);
const bookTags = book?.tags || [];
```

Then pass `bookTags` through to wherever `TriggerPayload.questCompleted()` is called:

```javascript
tags: bookTags,
```

- [ ] **Step 2: Verify the pipeline now auto-applies item effects**

Write a test that verifies the full chain: book with tags -> quest completion -> pipeline resolves item effects.

Add to `tests/tagMatch.test.js` or create a new integration test:

```javascript
describe('pipeline integration with tagged books', () => {
  it('resolves item effects based on book tags', () => {
    const activeEffects = [
      {
        trigger: 'ON_QUEST_COMPLETED',
        condition: { tagMatch: [['fantasy']] },
        modifier: { type: 'ADD_FLAT', resource: 'inkDrops', value: 20 },
        source: { sourceType: 'item', id: 'pocket-dragon', name: 'Pocket Dragon' }
      }
    ];
    const payload = {
      questType: 'genre_quest',
      tags: ['fantasy', 'series'],
      pageCount: 350
    };
    const result = ModifierPipeline.resolve('ON_QUEST_COMPLETED', payload, activeEffects, {
      xp: 100, inkDrops: 50, paperScraps: 10
    });
    expect(result.inkDrops).toBe(70); // 50 base + 20 from Pocket Dragon
  });

  it('does not apply item effects when tags do not match', () => {
    const activeEffects = [
      {
        trigger: 'ON_QUEST_COMPLETED',
        condition: { tagMatch: [['fantasy']] },
        modifier: { type: 'ADD_FLAT', resource: 'inkDrops', value: 20 },
        source: { sourceType: 'item', id: 'pocket-dragon', name: 'Pocket Dragon' }
      }
    ];
    const payload = {
      questType: 'genre_quest',
      tags: ['romance'],
      pageCount: 350
    };
    const result = ModifierPipeline.resolve('ON_QUEST_COMPLETED', payload, activeEffects, {
      xp: 100, inkDrops: 50, paperScraps: 10
    });
    expect(result.inkDrops).toBe(50); // No bonus — tags don't match
  });
});
```

- [ ] **Step 3: Run the integration test**

Run: `npx jest tests/tagMatch.test.js --verbose`
Expected: PASS — the pipeline already supports this; this test validates the chain works

- [ ] **Step 4: Remove legacy item modifier reading from RewardCalculator**

In `assets/js/services/RewardCalculator.js`:

1. **Remove or simplify `_getModifier()`** — The item branch (where it reads `rewardModifier`/`passiveRewardModifier` and checks `pageCondition`) is no longer needed for migrated items. The atmospheric/context items still use `rewardModifier`, so check if any non-migrated items still need this path. If all remaining `rewardModifier` usage is empty `{}`, the method can return `{ modifier: null }` for all items.

2. **Remove `_collectBuffCardPipelineEffects()`** item processing — The background skip fence (lines 594-596) can be removed entirely since backgrounds are already on the pipeline. The rest of the method converts legacy modifiers to buff card effects — this is no longer needed since items now go through the pipeline directly.

3. **Remove `_modifierToBuffCardEffects()`** — No longer called.

4. **Remove `_applyFamiliarStateLoadModifiers()`** — Familiar bonuses now come from effects arrays.

**Be careful:** Search for all callers of these methods before removing them. Verify nothing else in the codebase depends on them.

- [ ] **Step 5: Remove legacy passive modifier code from RestorationController**

In `assets/js/controllers/RestorationController.js`:

1. **Remove `calculatePassiveBonuses()` manual iteration** — The method currently loops over passive item/familiar slots and reads `passiveRewardModifier`. Replace with a pipeline call or remove if passive bonuses are now handled elsewhere via the pipeline.

2. **Remove `applyPassiveModifier()`** — The per-resource-field application logic (`if (modifier.inkDrops)...`) is replaced by the pipeline.

**Note:** Passive bonuses may be displayed somewhere in the UI (e.g., a tooltip showing "+10 inkDrops passive"). Find where `calculatePassiveBonuses` is called and update the caller to use pipeline results instead.

- [ ] **Step 6: Remove legacy rewardModifier read from BuffController**

In `assets/js/controllers/BuffController.js` (lines 176-192):

The block that reads `rewardModifier` from temporary buffs when marking a one-time buff as used — check if any non-atmospheric temporary buffs still use `rewardModifier`. If all temporary buff `rewardModifier` values are either empty `{}` or belong to atmospheric buffs (out of scope), this code can be left as-is (it won't fire for empty modifiers).

If temporary buffs are out of scope for this migration, leave this code untouched. Only remove if it's dead code.

- [ ] **Step 7: Remove manual item selection from quest completion UI (if applicable)**

Search for any UI code that prompts the player to select items when completing a quest. Based on the research, items are currently auto-applied from `quest.buffs` — if this is populated automatically (not by player selection), no UI change is needed.

If there IS a manual selection step, remove it and let the pipeline handle item application automatically.

- [ ] **Step 8: Run the full test suite**

Run: `npx jest --verbose`
Expected: All tests pass. Fix any test failures caused by the removal of legacy code paths. Some tests may reference `rewardModifier` directly — update them to use effects instead.

- [ ] **Step 9: Manual testing**

Test the full flow end-to-end:
1. Add a book with tags (e.g., "fantasy" + "series")
2. Create a quest linked to that book
3. Complete the book (triggers quest completion)
4. Verify the receipt shows item bonuses (e.g., Pocket Dragon +20 inkDrops)
5. Verify passive items apply the passive rate (e.g., Pocket Dragon in passive slot = +10)
6. Verify untagged books don't trigger tag-based effects
7. Check archived quests still display correctly with old receipt data

- [ ] **Step 10: Commit**

```bash
git add assets/js/services/RewardCalculator.js assets/js/controllers/RestorationController.js assets/js/controllers/BuffController.js assets/js/controllers/QuestController.js assets/js/quest-handlers/BaseQuestHandler.js assets/js/character-sheet/stateAdapter.js
git commit -m "feat(fwr.5): rewire quest completion to use pipeline, remove legacy modifier code"
```

---

## Post-Implementation Checklist

- [ ] Run `node scripts/generate-data.js` to ensure data exports are current
- [ ] Run `npx jest --verbose` — all tests pass
- [ ] Manual smoke test: add a book with tags, complete it, verify rewards
- [ ] Manual smoke test: open an archived quest from before the migration, verify it displays correctly
- [ ] Manual smoke test: verify atmospheric/context items (Gilded Painting, etc.) still work unchanged
- [ ] Verify cloud sync still works (tags are part of the book object in characterState, which is already synced)
