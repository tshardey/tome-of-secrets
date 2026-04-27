# fwr.8 — Display Applicable Tags on Reward Items Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show which book tags each item responds to on the item card UI, so players can quickly see tag requirements.

**Architecture:** Extract a pure utility function for tag group extraction from item effects, then call it from `renderItemCard()` to render tag badges with appropriate AND/OR connectors. CSS classes added to `style.scss` after existing item-card styles.

**Tech Stack:** Vanilla JS (DOM createElement), SCSS, Jest

---

### Task 1: Tag extraction utility — tests

**Files:**
- Create: `tests/itemTagDisplay.test.js`

- [ ] **Step 1: Write failing tests for `extractItemTagGroups`**

Create `tests/itemTagDisplay.test.js`:

```javascript
import { extractItemTagGroups } from '../assets/js/character-sheet/renderComponents.js';

describe('extractItemTagGroups', () => {
    test('returns empty array for item with no effects', () => {
        expect(extractItemTagGroups({})).toEqual([]);
        expect(extractItemTagGroups({ effects: [] })).toEqual([]);
    });

    test('returns empty array for item with effects but no tagMatch', () => {
        const item = {
            effects: [
                { trigger: 'ON_QUEST_COMPLETED', modifier: { type: 'ADD_FLAT', resource: 'xp', value: 5 } }
            ]
        };
        expect(extractItemTagGroups(item)).toEqual([]);
    });

    test('extracts single-tag groups', () => {
        const item = {
            effects: [
                {
                    trigger: 'ON_QUEST_COMPLETED',
                    condition: { tagMatch: [['romance']] },
                    modifier: { type: 'ADD_FLAT', resource: 'inkDrops', value: 12 }
                }
            ]
        };
        expect(extractItemTagGroups(item)).toEqual([['romance']]);
    });

    test('extracts AND groups (multi-tag)', () => {
        const item = {
            effects: [
                {
                    trigger: 'ON_QUEST_COMPLETED',
                    condition: { tagMatch: [['fantasy', 'fae']] },
                    modifier: { type: 'ADD_FLAT', resource: 'inkDrops', value: 15 }
                }
            ]
        };
        expect(extractItemTagGroups(item)).toEqual([['fantasy', 'fae']]);
    });

    test('extracts mixed OR/AND groups', () => {
        const item = {
            effects: [
                {
                    trigger: 'ON_QUEST_COMPLETED',
                    condition: { tagMatch: [['horror'], ['fantasy', 'dark']] },
                    modifier: { type: 'ADD_FLAT', resource: 'inkDrops', value: 12 }
                }
            ]
        };
        expect(extractItemTagGroups(item)).toEqual([['horror'], ['fantasy', 'dark']]);
    });

    test('deduplicates groups across equipped and passive slot effects', () => {
        const item = {
            effects: [
                {
                    trigger: 'ON_QUEST_COMPLETED',
                    condition: { tagMatch: [['romance']] },
                    modifier: { type: 'ADD_FLAT', resource: 'inkDrops', value: 20 },
                    slot: 'equipped'
                },
                {
                    trigger: 'ON_QUEST_COMPLETED',
                    condition: { tagMatch: [['romance']] },
                    modifier: { type: 'ADD_FLAT', resource: 'inkDrops', value: 10 },
                    slot: 'passive'
                }
            ]
        };
        expect(extractItemTagGroups(item)).toEqual([['romance']]);
    });

    test('deduplicates complex groups across slots', () => {
        const item = {
            effects: [
                {
                    trigger: 'ON_QUEST_COMPLETED',
                    condition: { tagMatch: [['romance'], ['contemporary-fiction', 'social']] },
                    slot: 'equipped',
                    modifier: { type: 'ADD_FLAT', resource: 'inkDrops', value: 15 }
                },
                {
                    trigger: 'ON_QUEST_COMPLETED',
                    condition: { tagMatch: [['romance'], ['contemporary-fiction', 'social']] },
                    slot: 'passive',
                    modifier: { type: 'ADD_FLAT', resource: 'inkDrops', value: 8 }
                }
            ]
        };
        expect(extractItemTagGroups(item)).toEqual([['romance'], ['contemporary-fiction', 'social']]);
    });

    test('handles null/undefined item gracefully', () => {
        expect(extractItemTagGroups(null)).toEqual([]);
        expect(extractItemTagGroups(undefined)).toEqual([]);
    });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /workspaces/tome-of-secrets/tests && npx jest itemTagDisplay.test.js --verbose 2>&1 | tail -20`
Expected: FAIL — `extractItemTagGroups` is not exported

---

### Task 2: Tag extraction utility — implementation

**Files:**
- Modify: `assets/js/character-sheet/renderComponents.js`

- [ ] **Step 1: Add `extractItemTagGroups` function**

Add this exported function before the `renderItemCard` function (before line 161) in `assets/js/character-sheet/renderComponents.js`:

```javascript
/**
 * Extract deduplicated tagMatch groups from an item's effects.
 * Returns array of groups, where each group is an array of tag IDs.
 * E.g. [['romance'], ['fantasy', 'fae']] means "romance" OR "fantasy AND fae".
 */
export function extractItemTagGroups(item) {
    if (!item || !Array.isArray(item.effects)) return [];
    const seen = new Set();
    const groups = [];
    for (const effect of item.effects) {
        const tagMatch = effect?.condition?.tagMatch;
        if (!Array.isArray(tagMatch)) continue;
        for (const group of tagMatch) {
            if (!Array.isArray(group) || group.length === 0) continue;
            const key = group.slice().sort().join('\0');
            if (seen.has(key)) continue;
            seen.add(key);
            groups.push(group);
        }
    }
    return groups;
}
```

- [ ] **Step 2: Run tests to verify they pass**

Run: `cd /workspaces/tome-of-secrets/tests && npx jest itemTagDisplay.test.js --verbose 2>&1 | tail -20`
Expected: ALL PASS (8 tests)

- [ ] **Step 3: Commit**

```
feat(fwr.8): add extractItemTagGroups utility for tag extraction from item effects
```

---

### Task 3: Tag badge rendering — tests

**Files:**
- Modify: `tests/itemTagDisplay.test.js`

- [ ] **Step 1: Add tests for `renderItemTagBadges`**

Append to `tests/itemTagDisplay.test.js`:

```javascript
// Add renderItemTagBadges to the existing import at the top of the file:
// import { extractItemTagGroups, renderItemTagBadges } from '../assets/js/character-sheet/renderComponents.js';

describe('renderItemTagBadges', () => {
    const mockBookTags = [
        { id: 'romance', label: 'Romance', category: 'genre' },
        { id: 'fantasy', label: 'Fantasy', category: 'genre' },
        { id: 'fae', label: 'Fae / Faerie', category: 'content' },
        { id: 'horror', label: 'Horror', category: 'genre' },
        { id: 'dark', label: 'Dark Themes', category: 'content' },
        { id: 'contemporary-fiction', label: 'Contemporary Fiction', category: 'genre' },
        { id: 'social', label: 'Social Gatherings / Events', category: 'content' },
        { id: 'new-author', label: 'New-to-You Author', category: 'content' }
    ];

    test('returns null for empty groups', () => {
        expect(renderItemTagBadges([], mockBookTags)).toBeNull();
    });

    test('renders single-tag group without connectors', () => {
        const el = renderItemTagBadges([['romance']], mockBookTags);
        expect(el.querySelector('.item-tag-label').textContent).toBe('Responds to:');
        const badges = el.querySelectorAll('.item-tag-badge');
        expect(badges).toHaveLength(1);
        expect(badges[0].textContent).toBe('Romance');
        expect(el.querySelector('.item-tag-connector')).toBeNull();
    });

    test('renders multiple single-tag groups without connectors', () => {
        const el = renderItemTagBadges([['romance'], ['fantasy']], mockBookTags);
        const badges = el.querySelectorAll('.item-tag-badge');
        expect(badges).toHaveLength(2);
        expect(badges[0].textContent).toBe('Romance');
        expect(badges[1].textContent).toBe('Fantasy');
        expect(el.querySelector('.item-tag-connector')).toBeNull();
    });

    test('renders AND group with + connector', () => {
        const el = renderItemTagBadges([['fantasy', 'fae']], mockBookTags);
        const badges = el.querySelectorAll('.item-tag-badge');
        expect(badges).toHaveLength(2);
        expect(badges[0].textContent).toBe('Fantasy');
        expect(badges[1].textContent).toBe('Fae / Faerie');
        const connectors = el.querySelectorAll('.item-tag-connector');
        expect(connectors).toHaveLength(1);
        expect(connectors[0].textContent).toBe('+');
    });

    test('renders mixed groups with or and + connectors', () => {
        const el = renderItemTagBadges([['horror'], ['fantasy', 'dark']], mockBookTags);
        const badges = el.querySelectorAll('.item-tag-badge');
        expect(badges).toHaveLength(3);
        expect(badges[0].textContent).toBe('Horror');
        expect(badges[1].textContent).toBe('Fantasy');
        expect(badges[2].textContent).toBe('Dark Themes');
        const connectors = el.querySelectorAll('.item-tag-connector');
        expect(connectors).toHaveLength(2);
        expect(connectors[0].textContent).toBe('or');
        expect(connectors[1].textContent).toBe('+');
    });

    test('falls back to tag ID when tag not found in bookTags', () => {
        const el = renderItemTagBadges([['unknown-tag']], mockBookTags);
        const badges = el.querySelectorAll('.item-tag-badge');
        expect(badges).toHaveLength(1);
        expect(badges[0].textContent).toBe('unknown-tag');
    });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /workspaces/tome-of-secrets/tests && npx jest itemTagDisplay.test.js --verbose 2>&1 | tail -20`
Expected: FAIL — `renderItemTagBadges` is not exported

---

### Task 4: Tag badge rendering — implementation

**Files:**
- Modify: `assets/js/character-sheet/renderComponents.js`

- [ ] **Step 1: Add `renderItemTagBadges` function**

Add this exported function after `extractItemTagGroups` in `assets/js/character-sheet/renderComponents.js`:

```javascript
/**
 * Render tag badges for an item's tagMatch groups.
 * @param {Array<Array<string>>} groups - from extractItemTagGroups
 * @param {Array<{id: string, label: string}>} bookTags - tag definitions
 * @returns {HTMLElement|null} - container element, or null if no groups
 */
export function renderItemTagBadges(groups, bookTags) {
    if (!groups || groups.length === 0) return null;

    const tagLookup = {};
    if (Array.isArray(bookTags)) {
        for (const tag of bookTags) {
            tagLookup[tag.id] = tag.label;
        }
    }

    const hasAndGroup = groups.some(g => g.length > 1);

    const container = createElement('div', { class: 'item-tag-section' });
    const label = createElement('span', { class: 'item-tag-label' });
    label.textContent = 'Responds to:';
    container.appendChild(label);

    const badgeRow = createElement('div', { class: 'item-tag-row' });

    for (let gi = 0; gi < groups.length; gi++) {
        const group = groups[gi];

        // "or" connector between groups (only when AND groups exist)
        if (gi > 0 && hasAndGroup) {
            const orConn = createElement('span', { class: 'item-tag-connector item-tag-or' });
            orConn.textContent = 'or';
            badgeRow.appendChild(orConn);
        }

        for (let ti = 0; ti < group.length; ti++) {
            // "+" connector within AND group
            if (ti > 0) {
                const plusConn = createElement('span', { class: 'item-tag-connector item-tag-plus' });
                plusConn.textContent = '+';
                badgeRow.appendChild(plusConn);
            }

            const badge = createElement('span', { class: 'item-tag-badge' });
            badge.textContent = tagLookup[group[ti]] || group[ti];
            badgeRow.appendChild(badge);
        }
    }

    container.appendChild(badgeRow);
    return container;
}
```

- [ ] **Step 2: Run tests to verify they pass**

Run: `cd /workspaces/tome-of-secrets/tests && npx jest itemTagDisplay.test.js --verbose 2>&1 | tail -20`
Expected: ALL PASS (13 tests)

- [ ] **Step 3: Commit**

```
feat(fwr.8): add renderItemTagBadges for tag badge display with AND/OR connectors
```

---

### Task 5: Integrate tag badges into renderItemCard

**Files:**
- Modify: `assets/js/character-sheet/renderComponents.js:245-247`

- [ ] **Step 1: Add tag badge rendering to renderItemCard**

In `assets/js/character-sheet/renderComponents.js`, in the `renderItemCard` function, insert the following after the bonus text block (after line 245, the closing `}` of the bonus display logic) and before the `// Action buttons` comment (line 247):

```javascript
    // Tag badges from tagMatch conditions
    const tagGroups = extractItemTagGroups(item);
    const tagBadgesEl = renderItemTagBadges(tagGroups, data.bookTags);
    if (tagBadgesEl) {
        info.appendChild(tagBadgesEl);
    }
```

- [ ] **Step 2: Run existing renderItemCard tests to verify nothing breaks**

Run: `cd /workspaces/tome-of-secrets/tests && npx jest renderComponents.test.js --verbose 2>&1 | tail -20`
Expected: ALL PASS

- [ ] **Step 3: Add integration test for renderItemCard with tags**

Add this test to `tests/itemTagDisplay.test.js`:

```javascript
// Add renderItemCard to the existing import at the top of the file:
// import { extractItemTagGroups, renderItemTagBadges, renderItemCard } from '../assets/js/character-sheet/renderComponents.js';

describe('renderItemCard tag integration', () => {
    test('renders tag badges on item card with tagMatch effects', () => {
        const item = {
            name: 'Test Item',
            type: 'Wearable',
            bonus: 'Test bonus text',
            img: '',
            effects: [
                {
                    trigger: 'ON_QUEST_COMPLETED',
                    condition: { tagMatch: [['romance'], ['fantasy']] },
                    modifier: { type: 'ADD_FLAT', resource: 'inkDrops', value: 10 },
                    slot: 'equipped'
                }
            ]
        };
        const card = renderItemCard(item, 0, { showEquip: true });
        const tagSection = card.querySelector('.item-tag-section');
        expect(tagSection).not.toBeNull();
        const badges = tagSection.querySelectorAll('.item-tag-badge');
        expect(badges).toHaveLength(2);
    });

    test('does not render tag section on item without tagMatch', () => {
        const item = {
            name: 'Plain Item',
            type: 'Wearable',
            bonus: 'Some bonus',
            img: ''
        };
        const card = renderItemCard(item, 0, { showEquip: true });
        expect(card.querySelector('.item-tag-section')).toBeNull();
    });
});
```

- [ ] **Step 4: Run all item tag display tests**

Run: `cd /workspaces/tome-of-secrets/tests && npx jest itemTagDisplay.test.js --verbose 2>&1 | tail -20`
Expected: ALL PASS (15 tests)

- [ ] **Step 5: Commit**

```
feat(fwr.8): integrate tag badges into renderItemCard
```

---

### Task 6: Add CSS styles for tag badges

**Files:**
- Modify: `assets/css/style.scss:1635` (after `.item-card .delete-item-btn:hover`)

- [ ] **Step 1: Add tag badge CSS**

Add the following CSS after the `.item-card .delete-item-btn:hover` rule (after line 1635) in `assets/css/style.scss`:

```scss
.item-tag-section {
    margin-top: 8px;
    margin-bottom: 8px;
}

.item-tag-label {
    display: block;
    font-size: 0.7em;
    color: #8a7a61;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    margin-bottom: 4px;
}

.item-tag-row {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    align-items: center;
}

.item-tag-badge {
    background: rgba(184, 159, 98, 0.15);
    border: 1px solid rgba(184, 159, 98, 0.3);
    color: #b89f62;
    padding: 2px 8px;
    border-radius: 10px;
    font-size: 0.7em;
}

.item-tag-connector {
    font-size: 0.65em;
    color: #8a7a61;
}

.item-tag-or {
    font-style: italic;
}
```

- [ ] **Step 2: Run full test suite**

Run: `cd /workspaces/tome-of-secrets/tests && npm test 2>&1 | tail -15`
Expected: ALL PASS

- [ ] **Step 3: Commit**

```
feat(fwr.8): add CSS styles for item tag badges
```
