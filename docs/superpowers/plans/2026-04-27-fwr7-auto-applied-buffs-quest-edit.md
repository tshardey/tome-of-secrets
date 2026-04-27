# fwr.7: Auto-Applied Buffs on Quest Edit — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Change the quest edit drawer from manual buff/item selection to displaying which buffs and items auto-apply based on the quest's linked book tags.

**Architecture:** Extend `renderBonusCards` and `createBonusCard` in `ui.js` with a `bookTags` parameter. Each bonus is classified as `auto-applied` (tagMatch hit), `unmatched` (tagMatch miss), or `subjective` (no tagMatch). Classification uses `extractItemTagGroups` from `renderComponents.js`. The edit drawer passes book tags from the linked book in `populateQuestEditDrawer`. CSS classes provide the three visual states.

**Tech Stack:** Vanilla JS (DOM), Jest + jsdom, CSS

---

### Task 1: Add `classifyBonusCardState` utility function with tests

**Files:**
- Create: `tests/bonusCardState.test.js`
- Modify: `assets/js/character-sheet/ui.js:1402` (add and export new function)

This function takes a bonus object and an array of book tag IDs, and returns `'auto-applied'`, `'unmatched'`, or `'subjective'`.

- [ ] **Step 1: Write failing tests for `classifyBonusCardState`**

Create `tests/bonusCardState.test.js`:

```javascript
/**
 * @jest-environment jsdom
 */

jest.mock('../assets/js/character-sheet/data.js', () => {
    const originalModule = jest.requireActual('../assets/js/character-sheet/data.js');
    return {
        ...originalModule,
        allItems: {
            "Librarian's Compass": {
                name: "Librarian's Compass",
                bonus: '+5 Ink Drops for new authors',
                effects: [{
                    trigger: 'ON_QUEST_COMPLETED',
                    condition: { tagMatch: [['new-author']] },
                    modifier: { type: 'ADD_FLAT', resource: 'inkDrops', value: 5 }
                }]
            },
            'Scatter Brain Scarab': {
                name: 'Scatter Brain Scarab',
                bonus: 'Bonus for reading multiple books',
                rewardModifier: { type: 'ADD_FLAT', resource: 'inkDrops', value: 5 }
            },
            'Cloak of Story-Weaver': {
                name: 'Cloak of Story-Weaver',
                bonus: '+5 Ink Drops for series books',
                effects: [{
                    trigger: 'ON_QUEST_COMPLETED',
                    condition: { tagMatch: [['series']] },
                    modifier: { type: 'ADD_FLAT', resource: 'inkDrops', value: 5 }
                }]
            }
        },
        keeperBackgrounds: {
            '': { name: 'None' },
            archivist: {
                name: "The Archivist's Apprentice",
                effects: [{
                    trigger: 'ON_QUEST_COMPLETED',
                    condition: { tagMatch: [['non-fiction'], ['historical-fiction']] },
                    modifier: { type: 'ADD_FLAT', resource: 'inkDrops', value: 10 }
                }]
            },
            cartographer: {
                name: "The Cartographer's Guild",
                effects: [{
                    trigger: 'ON_QUEST_DRAFTED',
                    condition: { questType: 'dungeon_crawl' },
                    modifier: { type: 'GRANT_RESOURCE', resource: 'inkDrops', value: 15 }
                }]
            }
        }
    };
});

import { classifyBonusCardState } from '../assets/js/character-sheet/ui.js';

describe('classifyBonusCardState', () => {
    it('returns "auto-applied" when item has tagMatch and book tags match', () => {
        const bonus = {
            type: 'item',
            itemData: {
                effects: [{
                    trigger: 'ON_QUEST_COMPLETED',
                    condition: { tagMatch: [['new-author']] },
                    modifier: { type: 'ADD_FLAT', resource: 'inkDrops', value: 5 }
                }]
            }
        };
        expect(classifyBonusCardState(bonus, ['new-author', 'fantasy'])).toBe('auto-applied');
    });

    it('returns "unmatched" when item has tagMatch but book tags do not match', () => {
        const bonus = {
            type: 'item',
            itemData: {
                effects: [{
                    trigger: 'ON_QUEST_COMPLETED',
                    condition: { tagMatch: [['series']] },
                    modifier: { type: 'ADD_FLAT', resource: 'inkDrops', value: 5 }
                }]
            }
        };
        expect(classifyBonusCardState(bonus, ['new-author', 'fantasy'])).toBe('unmatched');
    });

    it('returns "subjective" when item has no tagMatch (legacy rewardModifier)', () => {
        const bonus = {
            type: 'item',
            itemData: {
                rewardModifier: { type: 'ADD_FLAT', resource: 'inkDrops', value: 5 }
            }
        };
        expect(classifyBonusCardState(bonus, ['fantasy'])).toBe('subjective');
    });

    it('returns "subjective" for temp buffs (no itemData)', () => {
        const bonus = { type: 'buff' };
        expect(classifyBonusCardState(bonus, ['fantasy'])).toBe('subjective');
    });

    it('returns "subjective" when bookTags is null (no book linked)', () => {
        const bonus = {
            type: 'item',
            itemData: {
                effects: [{
                    trigger: 'ON_QUEST_COMPLETED',
                    condition: { tagMatch: [['new-author']] },
                    modifier: { type: 'ADD_FLAT', resource: 'inkDrops', value: 5 }
                }]
            }
        };
        expect(classifyBonusCardState(bonus, null)).toBe('subjective');
    });

    it('returns "unmatched" when bookTags is empty array and item has tagMatch', () => {
        const bonus = {
            type: 'item',
            itemData: {
                effects: [{
                    trigger: 'ON_QUEST_COMPLETED',
                    condition: { tagMatch: [['new-author']] },
                    modifier: { type: 'ADD_FLAT', resource: 'inkDrops', value: 5 }
                }]
            }
        };
        expect(classifyBonusCardState(bonus, [])).toBe('unmatched');
    });

    it('returns "auto-applied" for background with matching tagMatch', () => {
        const bonus = {
            type: 'background',
            backgroundData: {
                effects: [{
                    trigger: 'ON_QUEST_COMPLETED',
                    condition: { tagMatch: [['non-fiction'], ['historical-fiction']] },
                    modifier: { type: 'ADD_FLAT', resource: 'inkDrops', value: 10 }
                }]
            }
        };
        expect(classifyBonusCardState(bonus, ['non-fiction'])).toBe('auto-applied');
    });

    it('returns "unmatched" for background with non-matching tagMatch', () => {
        const bonus = {
            type: 'background',
            backgroundData: {
                effects: [{
                    trigger: 'ON_QUEST_COMPLETED',
                    condition: { tagMatch: [['non-fiction'], ['historical-fiction']] },
                    modifier: { type: 'ADD_FLAT', resource: 'inkDrops', value: 10 }
                }]
            }
        };
        expect(classifyBonusCardState(bonus, ['fantasy'])).toBe('unmatched');
    });

    it('returns "subjective" for background without tagMatch (cartographer)', () => {
        const bonus = {
            type: 'background',
            backgroundData: {
                effects: [{
                    trigger: 'ON_QUEST_DRAFTED',
                    condition: { questType: 'dungeon_crawl' },
                    modifier: { type: 'GRANT_RESOURCE', resource: 'inkDrops', value: 15 }
                }]
            }
        };
        expect(classifyBonusCardState(bonus, ['fantasy'])).toBe('subjective');
    });

    it('handles OR groups in tagMatch (matches second group)', () => {
        const bonus = {
            type: 'item',
            itemData: {
                effects: [{
                    trigger: 'ON_QUEST_COMPLETED',
                    condition: { tagMatch: [['horror'], ['fantasy', 'dark']] },
                    modifier: { type: 'ADD_FLAT', resource: 'inkDrops', value: 5 }
                }]
            }
        };
        expect(classifyBonusCardState(bonus, ['fantasy', 'dark'])).toBe('auto-applied');
    });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /workspaces/tome-of-secrets/tests && npx jest bonusCardState.test.js --verbose 2>&1 | head -30`

Expected: FAIL — `classifyBonusCardState` is not exported from `ui.js`

- [ ] **Step 3: Implement `classifyBonusCardState` in `ui.js`**

Add this import at the top of `assets/js/character-sheet/ui.js` (after line 20, the existing renderComponents import):

```javascript
import { extractItemTagGroups } from './renderComponents.js';
```

Update the existing import on lines 9-20 to include `extractItemTagGroups`:

```javascript
import { 
    renderQuestRow,
    renderQuestCard, 
    renderItemCard, 
    renderEmptySlot, 
    renderCurseRow, 
    renderCurseHelperRow,
    renderCurseHelpersEmptyRow,
    renderQuestDrawHelpersEmptyRow,
    renderTemporaryBuffRow,
    renderAbilityCard,
    extractItemTagGroups,
    renderItemTagBadges
} from './renderComponents.js';
```

Add the function before `createBonusCard` (before line 1325):

```javascript
/**
 * Classify a bonus card as 'auto-applied', 'unmatched', or 'subjective'.
 * - auto-applied: has tagMatch conditions and they match the book's tags
 * - unmatched: has tagMatch conditions but they don't match
 * - subjective: no tagMatch conditions (player toggles)
 * @param {Object} bonus - bonus object with type, itemData, or backgroundData
 * @param {string[]|null} bookTags - array of tag IDs from the linked book, or null if no book
 * @returns {'auto-applied'|'unmatched'|'subjective'}
 */
export function classifyBonusCardState(bonus, bookTags) {
    if (bookTags == null) return 'subjective';

    const effectSource = bonus.type === 'background' ? bonus.backgroundData : bonus.itemData;
    const tagGroups = extractItemTagGroups(effectSource);

    if (tagGroups.length === 0) return 'subjective';

    const matched = tagGroups.some(group =>
        group.every(tag => bookTags.includes(tag))
    );
    return matched ? 'auto-applied' : 'unmatched';
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd /workspaces/tome-of-secrets/tests && npx jest bonusCardState.test.js --verbose 2>&1 | tail -20`

Expected: All 10 tests PASS

- [ ] **Step 5: Commit**

```
feat(fwr.7): add classifyBonusCardState utility for tag-aware bonus card classification
```

---

### Task 2: Add CSS styles for the three card states

**Files:**
- Modify: `assets/css/character-sheet.css:3573` (add after existing `.quest-bonus-card` styles)

- [ ] **Step 1: Add CSS for auto-applied, unmatched, and subjective states**

Insert after line 3573 (after `.quest-bonus-card.no-image .quest-bonus-card-image`) in `assets/css/character-sheet.css`:

```css
/* Auto-applied: tagMatch hit — green border, locked on */
.quest-bonus-card.auto-applied {
    border-color: #4a8a4a;
    background: linear-gradient(135deg, rgba(74, 138, 74, 0.15) 0%, rgba(42, 80, 42, 0.1) 100%);
    cursor: default;
    pointer-events: none;
}

.quest-bonus-card.auto-applied::after {
    content: '✓ Auto';
    position: absolute;
    top: 8px;
    right: 8px;
    padding: 2px 10px;
    background: #4a8a4a;
    color: #fff;
    border-radius: 12px;
    font-size: 0.75em;
    font-weight: bold;
    display: flex;
    align-items: center;
    justify-content: center;
}

.quest-bonus-card.auto-applied:hover {
    transform: none;
    box-shadow: none;
    border-color: #4a8a4a;
}

/* Unmatched: tagMatch miss — grayed out, shows needed tags */
.quest-bonus-card.unmatched {
    opacity: 0.5;
    cursor: default;
    pointer-events: none;
    border-color: #3a3a4a;
}

.quest-bonus-card.unmatched:hover {
    transform: none;
    box-shadow: none;
    border-color: #3a3a4a;
}

/* Subjective: no tagMatch — player toggle */
.quest-bonus-card.subjective {
    border-color: #6a5a8a;
}

.quest-bonus-card.subjective:hover {
    border-color: #8a7aaa;
    box-shadow: 0 4px 12px rgba(106, 90, 138, 0.2);
}

.quest-bonus-card.subjective.selected {
    border-color: #8a7aaa;
    background: linear-gradient(135deg, rgba(106, 90, 138, 0.2) 0%, rgba(80, 65, 110, 0.15) 100%);
    box-shadow: 0 0 0 3px rgba(106, 90, 138, 0.3);
}

/* "Your Choice" badge for subjective cards */
.quest-bonus-card-badge {
    position: absolute;
    top: 8px;
    right: 8px;
    padding: 2px 10px;
    border-radius: 12px;
    font-size: 0.75em;
    font-weight: bold;
}

.quest-bonus-card-badge.badge-subjective {
    background: #6a5a8a;
    color: #d0c0e0;
}

/* "Needs:" tag section on unmatched cards */
.quest-bonus-card-needs {
    margin-top: 4px;
    font-size: 0.8em;
}

.quest-bonus-card-needs-label {
    color: #888;
    font-size: 0.85em;
    margin-right: 4px;
}
```

- [ ] **Step 2: Verify CSS parses without errors**

Run: `cd /workspaces/tome-of-secrets && node -e "const fs = require('fs'); const css = fs.readFileSync('assets/css/character-sheet.css', 'utf8'); console.log('CSS length:', css.length, 'bytes — OK')"`

Expected: Prints CSS length — OK (no parse needed for CSS, just verify file is intact)

- [ ] **Step 3: Commit**

```
feat(fwr.7): add CSS styles for auto-applied, unmatched, and subjective bonus card states
```

---

### Task 3: Update `createBonusCard` to render card states

**Files:**
- Modify: `assets/js/character-sheet/ui.js:1327-1379` (`createBonusCard` function)
- Test: `tests/bonusCardState.test.js` (add rendering tests)

- [ ] **Step 1: Write failing tests for card state rendering**

Add these tests to the bottom of the `describe` block in `tests/bonusCardState.test.js`:

```javascript
import { characterState } from '../assets/js/character-sheet/state.js';
import { STORAGE_KEYS } from '../assets/js/character-sheet/storageKeys.js';
import { createEmptyCharacterState } from '../assets/js/character-sheet/storageKeys.js';
import * as ui from '../assets/js/character-sheet/ui.js';
```

Wait — these imports need to go at the top of the file. Update the imports section at the top of `tests/bonusCardState.test.js` to include:

```javascript
import { classifyBonusCardState } from '../assets/js/character-sheet/ui.js';
import { characterState } from '../assets/js/character-sheet/state.js';
import { STORAGE_KEYS } from '../assets/js/character-sheet/storageKeys.js';
import { createEmptyCharacterState } from '../assets/js/character-sheet/storageKeys.js';
import * as ui from '../assets/js/character-sheet/ui.js';
import { bookTags } from '../assets/js/character-sheet/data.js';
```

Add a new `describe` block after the existing `classifyBonusCardState` tests:

```javascript
describe('renderBonusCards with bookTags', () => {
    beforeEach(() => {
        Object.assign(characterState, createEmptyCharacterState());
        localStorage.clear();

        document.body.innerHTML = `
            <div id="edit-quest-bonus-selection-container"></div>
            <input id="edit-quest-buffs-select" type="hidden" />
            <select id="keeperBackground">
                <option value="">Select Background</option>
                <option value="archivist">Archivist</option>
                <option value="cartographer">Cartographer</option>
            </select>
        `;
    });

    it('renders auto-applied card with auto-applied class when tags match', () => {
        characterState.equippedItems = [{ name: "Librarian's Compass" }];
        document.getElementById('keeperBackground').value = '';

        ui.updateEditQuestBuffsDropdown([], ['new-author']);

        const container = document.getElementById('edit-quest-bonus-selection-container');
        const cards = container.querySelectorAll('.quest-bonus-card');
        expect(cards.length).toBe(1);
        expect(cards[0].classList.contains('auto-applied')).toBe(true);
        expect(cards[0].textContent).toContain("Librarian's Compass");
    });

    it('renders unmatched card with unmatched class when tags do not match', () => {
        characterState.equippedItems = [{ name: 'Cloak of Story-Weaver' }];
        document.getElementById('keeperBackground').value = '';

        ui.updateEditQuestBuffsDropdown([], ['fantasy']);

        const container = document.getElementById('edit-quest-bonus-selection-container');
        const cards = container.querySelectorAll('.quest-bonus-card');
        expect(cards.length).toBe(1);
        expect(cards[0].classList.contains('unmatched')).toBe(true);
    });

    it('renders subjective card with subjective class for legacy items', () => {
        characterState.equippedItems = [{ name: 'Scatter Brain Scarab' }];
        document.getElementById('keeperBackground').value = '';

        ui.updateEditQuestBuffsDropdown([], ['fantasy']);

        const container = document.getElementById('edit-quest-bonus-selection-container');
        const cards = container.querySelectorAll('.quest-bonus-card');
        expect(cards.length).toBe(1);
        expect(cards[0].classList.contains('subjective')).toBe(true);
    });

    it('auto-applied cards are included in hidden input value', () => {
        characterState.equippedItems = [{ name: "Librarian's Compass" }];
        document.getElementById('keeperBackground').value = '';

        ui.updateEditQuestBuffsDropdown([], ['new-author']);

        const hiddenInput = document.getElementById('edit-quest-buffs-select');
        const selectedValues = JSON.parse(hiddenInput.value);
        expect(selectedValues).toContain("[Item] Librarian's Compass");
    });

    it('unmatched cards are NOT included in hidden input value', () => {
        characterState.equippedItems = [{ name: 'Cloak of Story-Weaver' }];
        document.getElementById('keeperBackground').value = '';

        ui.updateEditQuestBuffsDropdown([], ['fantasy']);

        const hiddenInput = document.getElementById('edit-quest-buffs-select');
        const selectedValues = JSON.parse(hiddenInput.value);
        expect(selectedValues).not.toContain('[Item] Cloak of Story-Weaver');
    });

    it('falls back to all-manual when bookTags is not provided', () => {
        characterState.equippedItems = [{ name: "Librarian's Compass" }];
        document.getElementById('keeperBackground').value = '';

        // No bookTags argument — legacy behavior
        ui.updateEditQuestBuffsDropdown([]);

        const container = document.getElementById('edit-quest-bonus-selection-container');
        const cards = container.querySelectorAll('.quest-bonus-card');
        expect(cards.length).toBe(1);
        // Should NOT have any state class — plain selectable card
        expect(cards[0].classList.contains('auto-applied')).toBe(false);
        expect(cards[0].classList.contains('unmatched')).toBe(false);
        expect(cards[0].classList.contains('subjective')).toBe(false);
    });

    it('renders background bonus as auto-applied when tags match', () => {
        characterState.equippedItems = [];
        document.getElementById('keeperBackground').value = 'archivist';

        ui.updateEditQuestBuffsDropdown([], ['non-fiction']);

        const container = document.getElementById('edit-quest-bonus-selection-container');
        const cards = container.querySelectorAll('.quest-bonus-card');
        expect(cards.length).toBe(1);
        expect(cards[0].classList.contains('auto-applied')).toBe(true);
    });

    it('renders cartographer background as subjective (no tagMatch)', () => {
        characterState.equippedItems = [];
        document.getElementById('keeperBackground').value = 'cartographer';

        ui.updateEditQuestBuffsDropdown([], ['fantasy']);

        const container = document.getElementById('edit-quest-bonus-selection-container');
        const cards = container.querySelectorAll('.quest-bonus-card');
        expect(cards.length).toBe(1);
        expect(cards[0].classList.contains('subjective')).toBe(true);
    });
});
```

- [ ] **Step 2: Run tests to verify new rendering tests fail**

Run: `cd /workspaces/tome-of-secrets/tests && npx jest bonusCardState.test.js --verbose 2>&1 | tail -30`

Expected: `classifyBonusCardState` tests still PASS; new `renderBonusCards with bookTags` tests FAIL (cards don't have state classes yet)

- [ ] **Step 3: Update `renderBonusCards` signature and background bonus data**

In `assets/js/character-sheet/ui.js`, modify `renderBonusCards` (line 1402) to accept `bookTags`:

Change the function signature from:
```javascript
function renderBonusCards(containerId, hiddenInputId, selectedValues = []) {
```

To:
```javascript
function renderBonusCards(containerId, hiddenInputId, selectedValues = [], bookTags = undefined) {
```

In the background bonus section (lines 1416-1445), add `backgroundData` to each bonus object. Change the archivist block from:

```javascript
        if (background === 'archivist') {
            bonuses.push({
                value: '[Background] Archivist Bonus',
                name: 'Archivist Bonus',
                description: '+10 Ink Drops (Non-Fiction/Historical Fiction)',
                type: 'background',
                typeLabel: 'Background Bonus'
            });
        }
```

To:

```javascript
        if (background === 'archivist') {
            bonuses.push({
                value: '[Background] Archivist Bonus',
                name: 'Archivist Bonus',
                description: '+10 Ink Drops (Non-Fiction/Historical Fiction)',
                type: 'background',
                typeLabel: 'Background Bonus',
                backgroundData: keeperBackgrounds.archivist
            });
        }
```

Apply the same pattern to prophet:

```javascript
        if (background === 'prophet') {
            bonuses.push({
                value: '[Background] Prophet Bonus',
                name: 'Prophet Bonus',
                description: '+10 Ink Drops (Religious/Spiritual/Mythological)',
                type: 'background',
                typeLabel: 'Background Bonus',
                backgroundData: keeperBackgrounds.prophet
            });
        }
```

And cartographer:

```javascript
        if (background === 'cartographer') {
            bonuses.push({
                value: '[Background] Cartographer Bonus',
                name: 'Cartographer Bonus',
                description: '+10 Ink Drops (First Dungeon Crawl this month)',
                type: 'background',
                typeLabel: 'Background Bonus',
                backgroundData: keeperBackgrounds.cartographer
            });
        }
```

- [ ] **Step 4: Update the card rendering loop to classify and style cards**

In `renderBonusCards`, replace the rendering loop (lines 1528-1541):

```javascript
    // Render bonus cards
    bonuses.forEach(bonus => {
        const card = createBonusCard(bonus, bonus.value, containerId);
        
        // Restore selection state
        if (selectedValues.includes(bonus.value)) {
            card.classList.add('selected');
        }
        
        container.appendChild(card);
    });
    
    // Update hidden input with current selection
    updateBonusSelection(containerId);
```

With:

```javascript
    // Render bonus cards
    bonuses.forEach(bonus => {
        const state = bookTags !== undefined ? classifyBonusCardState(bonus, bookTags) : null;
        const card = createBonusCard(bonus, bonus.value, containerId, state, bookTags);

        if (state === 'auto-applied') {
            card.classList.add('auto-applied');
        } else if (state === 'unmatched') {
            card.classList.add('unmatched');
        } else if (state === 'subjective') {
            card.classList.add('subjective');
            // Restore selection state for subjective cards
            if (selectedValues.includes(bonus.value)) {
                card.classList.add('selected');
            }
        } else {
            // Legacy mode (no bookTags) — restore selection state
            if (selectedValues.includes(bonus.value)) {
                card.classList.add('selected');
            }
        }

        container.appendChild(card);
    });

    // Update hidden input: auto-applied cards are always included
    updateBonusSelection(containerId);
```

- [ ] **Step 5: Update `createBonusCard` to handle card states**

Modify `createBonusCard` (line 1327) signature from:

```javascript
function createBonusCard(bonus, value, containerId) {
```

To:

```javascript
function createBonusCard(bonus, value, containerId, state = null, bookTags = undefined) {
```

Replace the click handler section (lines 1374-1378):

```javascript
    // Handle click to toggle selection
    card.addEventListener('click', () => {
        card.classList.toggle('selected');
        updateBonusSelection(containerId);
    });
```

With:

```javascript
    // State-specific rendering
    if (state === 'subjective') {
        // "Your Choice" badge
        const badge = document.createElement('span');
        badge.className = 'quest-bonus-card-badge badge-subjective';
        badge.textContent = 'Your Choice';
        card.appendChild(badge);

        // Clickable toggle
        card.addEventListener('click', () => {
            card.classList.toggle('selected');
            updateBonusSelection(containerId);
        });
    } else if (state === 'unmatched') {
        // Show "Needs:" tag badges for unmatched cards
        const effectSource = bonus.type === 'background' ? bonus.backgroundData : bonus.itemData;
        const tagGroups = extractItemTagGroups(effectSource);
        if (tagGroups.length > 0) {
            const needsDiv = document.createElement('div');
            needsDiv.className = 'quest-bonus-card-needs';
            const needsLabel = document.createElement('span');
            needsLabel.className = 'quest-bonus-card-needs-label';
            needsLabel.textContent = 'Needs:';
            needsDiv.appendChild(needsLabel);

            const badgesEl = renderItemTagBadges(tagGroups, bookTags);
            if (badgesEl) {
                needsDiv.appendChild(badgesEl);
            }
            card.appendChild(needsDiv);
        }
        // No click handler — non-interactive
    } else if (state === 'auto-applied') {
        // No click handler — ::after pseudo-element shows "✓ Auto" badge via CSS
    } else {
        // Legacy mode (no state) — clickable toggle
        card.addEventListener('click', () => {
            card.classList.toggle('selected');
            updateBonusSelection(containerId);
        });
    }
```

- [ ] **Step 6: Update `updateBonusSelection` to include auto-applied cards**

Find the `updateBonusSelection` function in `ui.js` (search for `function updateBonusSelection`). It currently collects `.selected` cards. Update it to also include `.auto-applied` cards:

Change:
```javascript
    const selectedCards = container.querySelectorAll('.quest-bonus-card.selected');
    const selectedValues = Array.from(selectedCards).map(card => card.dataset.value);
```

To:
```javascript
    const selectedCards = container.querySelectorAll('.quest-bonus-card.selected');
    const autoAppliedCards = container.querySelectorAll('.quest-bonus-card.auto-applied');
    const selectedValues = [
        ...Array.from(autoAppliedCards).map(card => card.dataset.value),
        ...Array.from(selectedCards).map(card => card.dataset.value)
    ];
```

- [ ] **Step 7: Update `updateEditQuestBuffsDropdown` to accept and pass bookTags**

Change `updateEditQuestBuffsDropdown` (line 1556) from:

```javascript
export function updateEditQuestBuffsDropdown(selectedValues = []) {
    renderBonusCards('edit-quest-bonus-selection-container', 'edit-quest-buffs-select', selectedValues);
}
```

To:

```javascript
export function updateEditQuestBuffsDropdown(selectedValues = [], bookTags = undefined) {
    renderBonusCards('edit-quest-bonus-selection-container', 'edit-quest-buffs-select', selectedValues, bookTags);
}
```

- [ ] **Step 8: Run all tests**

Run: `cd /workspaces/tome-of-secrets/tests && npx jest bonusCardState.test.js --verbose 2>&1 | tail -30`

Expected: All tests PASS (both classification and rendering tests)

- [ ] **Step 9: Run existing bonus card filter tests to verify no regression**

Run: `cd /workspaces/tome-of-secrets/tests && npx jest uiBonusCardsFilter.test.js --verbose 2>&1 | tail -20`

Expected: All existing tests PASS (legacy path with no bookTags is unchanged)

- [ ] **Step 10: Commit**

```
feat(fwr.7): update createBonusCard and renderBonusCards with tag-aware card states
```

---

### Task 4: Wire up `populateQuestEditDrawer` to pass book tags

**Files:**
- Modify: `assets/js/controllers/QuestController.js:1618-1723` (`populateQuestEditDrawer`)
- Test: `tests/bonusCardState.test.js` (add integration-style test)

- [ ] **Step 1: Write failing test for edit drawer passing book tags**

Add to the `renderBonusCards with bookTags` describe block in `tests/bonusCardState.test.js`:

```javascript
    it('shows no-tags message when bookTags is empty array', () => {
        characterState.equippedItems = [{ name: "Librarian's Compass" }];
        document.getElementById('keeperBackground').value = '';

        ui.updateEditQuestBuffsDropdown([], []);

        const container = document.getElementById('edit-quest-bonus-selection-container');
        const cards = container.querySelectorAll('.quest-bonus-card');
        // Item has tagMatch, empty tags → unmatched
        expect(cards.length).toBe(1);
        expect(cards[0].classList.contains('unmatched')).toBe(true);
    });
```

- [ ] **Step 2: Run test to confirm it passes (should already work from Task 3)**

Run: `cd /workspaces/tome-of-secrets/tests && npx jest bonusCardState.test.js --testNamePattern="no-tags message" --verbose 2>&1 | tail -10`

Expected: PASS

- [ ] **Step 3: Update `populateQuestEditDrawer` to look up and pass book tags**

In `assets/js/controllers/QuestController.js`, find `populateQuestEditDrawer` (line 1618). At the bottom of the function (lines 1719-1723), change:

```javascript
        // Populate buffs selection (card-based)
        const { ui: uiModule } = this.dependencies;
        if (uiModule && uiModule.updateEditQuestBuffsDropdown) {
            uiModule.updateEditQuestBuffsDropdown(quest.buffs || []);
        }
```

To:

```javascript
        // Populate buffs selection (card-based) with book tag awareness
        const { ui: uiModule } = this.dependencies;
        if (uiModule && uiModule.updateEditQuestBuffsDropdown) {
            let bookTags;
            if (quest.bookId) {
                const books = characterState[STORAGE_KEYS.BOOKS];
                const linkedBook = books && books[quest.bookId];
                bookTags = Array.isArray(linkedBook?.tags) ? linkedBook.tags : [];
            }
            uiModule.updateEditQuestBuffsDropdown(quest.buffs || [], bookTags);
        }
```

Note: When `quest.bookId` is falsy, `bookTags` is `undefined` → falls back to legacy all-manual mode. When `quest.bookId` exists but book has no tags, `bookTags` is `[]` → shows tagMatch items as unmatched.

- [ ] **Step 4: Run full test suite**

Run: `cd /workspaces/tome-of-secrets/tests && npx jest --verbose 2>&1 | tail -30`

Expected: All tests PASS

- [ ] **Step 5: Commit**

```
feat(fwr.7): wire populateQuestEditDrawer to pass linked book tags to bonus card renderer
```

---

### Task 5: Handle `renderItemTagBadges` bookTags format conversion

**Files:**
- Modify: `assets/js/character-sheet/ui.js` (in `createBonusCard`)

The `renderItemTagBadges` function expects `bookTags` as an array of `{id, label}` objects (from `data.bookTags`), but `populateQuestEditDrawer` passes raw tag ID strings from the book. We need to pass the full `bookTags` definitions to `renderItemTagBadges`.

- [ ] **Step 1: Write failing test for tag badge rendering on unmatched cards**

Add to the `renderBonusCards with bookTags` describe block in `tests/bonusCardState.test.js`:

```javascript
    it('renders tag badges on unmatched cards showing needed tags', () => {
        characterState.equippedItems = [{ name: 'Cloak of Story-Weaver' }];
        document.getElementById('keeperBackground').value = '';

        ui.updateEditQuestBuffsDropdown([], ['fantasy']);

        const container = document.getElementById('edit-quest-bonus-selection-container');
        const card = container.querySelector('.quest-bonus-card.unmatched');
        expect(card).not.toBeNull();

        const needsSection = card.querySelector('.quest-bonus-card-needs');
        expect(needsSection).not.toBeNull();
        expect(needsSection.textContent).toContain('Needs:');
        // Should show the tag label for 'series'
        expect(needsSection.textContent).toMatch(/series/i);
    });
```

- [ ] **Step 2: Run test to check if it passes or fails**

Run: `cd /workspaces/tome-of-secrets/tests && npx jest bonusCardState.test.js --testNamePattern="tag badges on unmatched" --verbose 2>&1 | tail -15`

If it passes already (because `renderItemTagBadges` falls back to showing tag IDs when no label found), this step is done. If it fails, proceed to Step 3.

- [ ] **Step 3: Pass full bookTags data to renderItemTagBadges (if needed)**

In `createBonusCard` in `ui.js`, the `renderItemTagBadges` call uses the `bookTags` parameter. Currently this is the array of tag ID strings from the book. But `renderItemTagBadges` needs the `bookTags` definition array from `data.js` for label lookup.

Import `bookTags` data at the top of `ui.js` — it's already available via `data.js`. Update the import on line 1:

```javascript
import * as data from './data.js';
```

`data.bookTags` is already accessible. In the `createBonusCard` unmatched section, change:

```javascript
            const badgesEl = renderItemTagBadges(tagGroups, bookTags);
```

To:

```javascript
            const badgesEl = renderItemTagBadges(tagGroups, data.bookTags);
```

This passes the full `[{id, label, category}]` definitions instead of the book's tag ID array.

- [ ] **Step 4: Run test to verify**

Run: `cd /workspaces/tome-of-secrets/tests && npx jest bonusCardState.test.js --verbose 2>&1 | tail -20`

Expected: All tests PASS

- [ ] **Step 5: Commit**

```
feat(fwr.7): render tag badges on unmatched bonus cards showing needed tags
```

---

### Task 6: Full integration test and regression check

**Files:**
- Test: `tests/bonusCardState.test.js` (final integration tests)
- Test: existing test files (regression)

- [ ] **Step 1: Add integration test mixing auto-applied, unmatched, and subjective cards**

Add to the `renderBonusCards with bookTags` describe block in `tests/bonusCardState.test.js`:

```javascript
    it('renders mixed card states correctly in one drawer', () => {
        // Set up: one matching item, one non-matching, one subjective
        characterState.equippedItems = [
            { name: "Librarian's Compass" },    // tagMatch: new-author → will match
            { name: 'Cloak of Story-Weaver' },  // tagMatch: series → won't match
            { name: 'Scatter Brain Scarab' }     // no tagMatch → subjective
        ];
        document.getElementById('keeperBackground').value = 'archivist'; // tagMatch: non-fiction/historical-fiction → will match

        ui.updateEditQuestBuffsDropdown([], ['new-author', 'non-fiction']);

        const container = document.getElementById('edit-quest-bonus-selection-container');
        const autoApplied = container.querySelectorAll('.quest-bonus-card.auto-applied');
        const unmatched = container.querySelectorAll('.quest-bonus-card.unmatched');
        const subjective = container.querySelectorAll('.quest-bonus-card.subjective');

        expect(autoApplied.length).toBe(2); // Compass + Archivist
        expect(unmatched.length).toBe(1);   // Cloak
        expect(subjective.length).toBe(1);  // Scarab

        // Check hidden input includes auto-applied and not unmatched
        const hiddenInput = document.getElementById('edit-quest-buffs-select');
        const selectedValues = JSON.parse(hiddenInput.value);
        expect(selectedValues).toContain("[Item] Librarian's Compass");
        expect(selectedValues).toContain('[Background] Archivist Bonus');
        expect(selectedValues).not.toContain('[Item] Cloak of Story-Weaver');
        expect(selectedValues).not.toContain('[Item] Scatter Brain Scarab');
    });

    it('subjective card can be toggled and appears in hidden input when selected', () => {
        characterState.equippedItems = [{ name: 'Scatter Brain Scarab' }];
        document.getElementById('keeperBackground').value = '';

        ui.updateEditQuestBuffsDropdown([], ['fantasy']);

        const container = document.getElementById('edit-quest-bonus-selection-container');
        const card = container.querySelector('.quest-bonus-card.subjective');
        expect(card).not.toBeNull();

        // Click to select
        card.click();
        expect(card.classList.contains('selected')).toBe(true);

        const hiddenInput = document.getElementById('edit-quest-buffs-select');
        const selectedValues = JSON.parse(hiddenInput.value);
        expect(selectedValues).toContain('[Item] Scatter Brain Scarab');

        // Click again to deselect
        card.click();
        expect(card.classList.contains('selected')).toBe(false);
        const updatedValues = JSON.parse(hiddenInput.value);
        expect(updatedValues).not.toContain('[Item] Scatter Brain Scarab');
    });
```

- [ ] **Step 2: Run all new tests**

Run: `cd /workspaces/tome-of-secrets/tests && npx jest bonusCardState.test.js --verbose 2>&1 | tail -40`

Expected: All tests PASS

- [ ] **Step 3: Run full test suite for regression**

Run: `cd /workspaces/tome-of-secrets/tests && npx jest --verbose 2>&1 | tail -40`

Expected: All tests PASS (including questEditDrawer.test.js, uiBonusCardsFilter.test.js, itemTagDisplay.test.js, tagMatch.test.js)

- [ ] **Step 4: Commit**

```
feat(fwr.7): add integration tests for mixed card states in quest edit drawer
```

---

### Task 7: Close bead

- [ ] **Step 1: Close the fwr.7 bead**

Run: `bd close tome-of-secrets-fwr.7`

- [ ] **Step 2: Export beads**

Run: `bd export --no-memories -o /workspaces/tome-of-secrets/.beads/issues.jsonl`
