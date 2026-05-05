# fwr.9: Link Quest from Book — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow users to link an unlinked active quest to a book, or create an Extra Credit quest for a book, from both the library book card and the book edit drawer.

**Architecture:** Three shared utility functions handle the core operations (get unlinked quests, link quest to book, create Extra Credit for book). The library card gets a "Link Quest" button that opens a popover with quest list + create EC button. The book edit drawer's read-only links section becomes interactive with the same actions plus unlink capability.

**Tech Stack:** Vanilla JS (ES modules), jsdom/Jest tests, CSS matching existing dark-brown RPG theme

**Spec:** `docs/superpowers/specs/2026-04-28-fwr9-link-quest-from-book-design.md`

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `assets/js/utils/questBookLinker.js` | Create | Shared logic: getUnlinkedActiveQuests, linkExistingQuestToBook, createExtraCreditForBook |
| `tests/questBookLinker.test.js` | Create | Unit tests for shared linking logic |
| `assets/js/controllers/LibraryController.js` | Modify | Add Link Quest button to cards, popover rendering, popover actions, drawer links section |
| `tests/libraryQuestLinking.test.js` | Create | UI/integration tests for popover and drawer link section |
| `_includes/character-sheet/drawers/book-edit.html` | Modify | Expand links section HTML for interactive list + action buttons |
| `assets/css/character-sheet.css` | Modify | Styles for popover, quest option rows, drawer links section |

---

### Task 1: Shared Utility — getUnlinkedActiveQuests

**Files:**

- Create: `tests/questBookLinker.test.js`
- Create: `assets/js/utils/questBookLinker.js`

- [ ] **Step 1: Write the failing tests**

In `tests/questBookLinker.test.js`:

```javascript
/**
 * @jest-environment jsdom
 */

import { getUnlinkedActiveQuests } from '../assets/js/utils/questBookLinker.js';

// Mock stateAdapter
function createMockStateAdapter(activeQuests = []) {
    return {
        getActiveAssignments: () => activeQuests,
        getBook: jest.fn((id) => null),
        updateActiveQuest: jest.fn(),
        linkQuestToBook: jest.fn(),
        addActiveQuests: jest.fn(),
    };
}

describe('getUnlinkedActiveQuests', () => {
    test('returns quests with no bookId', () => {
        const sa = createMockStateAdapter([
            { id: 'q1', type: '♥ Organize the Stacks', prompt: 'Fantasy', bookId: null },
            { id: 'q2', type: '⭐ Extra Credit', prompt: 'Book read outside of quest pool', bookId: 'b1' },
            { id: 'q3', type: '♣ Side Quest', prompt: 'Read a classic' },
        ]);
        const result = getUnlinkedActiveQuests(sa);
        expect(result).toHaveLength(2);
        expect(result[0]).toEqual({ id: 'q1', type: '♥ Organize the Stacks', prompt: 'Fantasy', coverUrl: undefined });
        expect(result[1]).toEqual({ id: 'q3', type: '♣ Side Quest', prompt: 'Read a classic', coverUrl: undefined });
    });

    test('returns empty array when all quests have bookId', () => {
        const sa = createMockStateAdapter([
            { id: 'q1', type: '♥ Organize the Stacks', prompt: 'Fantasy', bookId: 'b1' },
        ]);
        expect(getUnlinkedActiveQuests(sa)).toEqual([]);
    });

    test('returns empty array when no active quests', () => {
        const sa = createMockStateAdapter([]);
        expect(getUnlinkedActiveQuests(sa)).toEqual([]);
    });

    test('includes coverUrl when present', () => {
        const sa = createMockStateAdapter([
            { id: 'q1', type: '♥ Organize the Stacks', prompt: 'Fantasy', coverUrl: 'http://example.com/cover.jpg' },
        ]);
        const result = getUnlinkedActiveQuests(sa);
        expect(result[0].coverUrl).toBe('http://example.com/cover.jpg');
    });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest tests/questBookLinker.test.js --no-coverage 2>&1 | tail -20`
Expected: FAIL — module not found

- [ ] **Step 3: Write minimal implementation**

In `assets/js/utils/questBookLinker.js`:

```javascript
/**
 * questBookLinker — Shared logic for linking quests to books from the library/book-edit side.
 */

/**
 * Get all active quests that have no linked book.
 * @param {Object} stateAdapter
 * @returns {Array<{id: string, type: string, prompt: string, coverUrl: string|undefined}>}
 */
export function getUnlinkedActiveQuests(stateAdapter) {
    const quests = stateAdapter.getActiveAssignments() || [];
    return quests
        .filter(q => !q.bookId)
        .map(q => ({ id: q.id, type: q.type, prompt: q.prompt, coverUrl: q.coverUrl }));
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest tests/questBookLinker.test.js --no-coverage 2>&1 | tail -20`
Expected: 4 tests PASS

- [ ] **Step 5: Commit**

```
feat(fwr.9): add getUnlinkedActiveQuests utility
```

---

### Task 2: Shared Utility — linkExistingQuestToBook

**Files:**

- Modify: `tests/questBookLinker.test.js`
- Modify: `assets/js/utils/questBookLinker.js`

- [ ] **Step 1: Write the failing tests**

Append to `tests/questBookLinker.test.js`:

```javascript
import { linkExistingQuestToBook } from '../assets/js/utils/questBookLinker.js';

describe('linkExistingQuestToBook', () => {
    function createSA(quests, books) {
        const activeQuests = [...quests];
        return {
            getActiveAssignments: () => activeQuests,
            getBook: (id) => books[id] || null,
            updateActiveQuest: jest.fn((id, updates) => {
                const q = activeQuests.find(q => q.id === id);
                if (q) Object.assign(q, updates);
                return !!q;
            }),
            linkQuestToBook: jest.fn(),
        };
    }

    test('sets bookId, book title, bookAuthor, coverUrl and calls linkQuestToBook', () => {
        const quests = [{ id: 'q1', type: '♥ Organize the Stacks', prompt: 'Fantasy' }];
        const books = { 'b1': { id: 'b1', title: 'Dune', author: 'Frank Herbert', cover: 'dune.jpg' } };
        const sa = createSA(quests, books);

        const result = linkExistingQuestToBook('q1', 'b1', sa);

        expect(result).toBe(true);
        expect(sa.updateActiveQuest).toHaveBeenCalledWith('q1', {
            bookId: 'b1',
            book: 'Dune',
            bookAuthor: 'Frank Herbert',
            coverUrl: 'dune.jpg',
        });
        expect(sa.linkQuestToBook).toHaveBeenCalledWith('b1', 'q1');
    });

    test('returns false if quest not found', () => {
        const sa = createSA([], { 'b1': { id: 'b1', title: 'Dune', author: 'Frank Herbert' } });
        expect(linkExistingQuestToBook('q-missing', 'b1', sa)).toBe(false);
    });

    test('returns false if book not found', () => {
        const quests = [{ id: 'q1', type: '♥ Organize the Stacks', prompt: 'Fantasy' }];
        const sa = createSA(quests, {});
        expect(linkExistingQuestToBook('q1', 'b-missing', sa)).toBe(false);
    });

    test('sets coverUrl to undefined when book has no cover', () => {
        const quests = [{ id: 'q1', type: '♣ Side Quest', prompt: 'Read a classic' }];
        const books = { 'b1': { id: 'b1', title: 'Dune', author: 'Frank Herbert' } };
        const sa = createSA(quests, books);

        linkExistingQuestToBook('q1', 'b1', sa);

        expect(sa.updateActiveQuest).toHaveBeenCalledWith('q1', expect.objectContaining({
            coverUrl: undefined,
        }));
    });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest tests/questBookLinker.test.js --no-coverage 2>&1 | tail -20`
Expected: FAIL — linkExistingQuestToBook is not a function

- [ ] **Step 3: Write minimal implementation**

Add to `assets/js/utils/questBookLinker.js`:

```javascript
/**
 * Link an existing active quest to a book.
 * Sets bookId, book title, author, coverUrl on the quest and creates the bidirectional link.
 * @param {string} questId
 * @param {string} bookId
 * @param {Object} stateAdapter
 * @returns {boolean} true if successful
 */
export function linkExistingQuestToBook(questId, bookId, stateAdapter) {
    const quests = stateAdapter.getActiveAssignments() || [];
    const quest = quests.find(q => q.id === questId);
    if (!quest) return false;

    const book = stateAdapter.getBook(bookId);
    if (!book) return false;

    stateAdapter.updateActiveQuest(questId, {
        bookId: bookId,
        book: book.title || '',
        bookAuthor: book.author || '',
        coverUrl: book.cover || undefined,
    });
    stateAdapter.linkQuestToBook(bookId, questId);
    return true;
}
```

- [ ] **Step 4: Verify stateAdapter has updateActiveQuest**

Check that `stateAdapter.updateActiveQuest` exists. If not, we need to add it. Search for `updateActiveQuest` in `stateAdapter.js`. If missing, add it:

```javascript
/**
 * Update fields on an active quest by ID.
 * @param {string} questId
 * @param {Object} updates — fields to merge into the quest object
 * @returns {boolean} true if quest was found and updated
 */
updateActiveQuest(questId, updates) {
    const quests = this.state[STORAGE_KEYS.ACTIVE_ASSIGNMENTS];
    const quest = quests.find(q => q.id === questId);
    if (!quest) return false;
    Object.assign(quest, updates);
    this._notify(STORAGE_KEYS.ACTIVE_ASSIGNMENTS, quests);
    return true;
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx jest tests/questBookLinker.test.js --no-coverage 2>&1 | tail -20`
Expected: 8 tests PASS

- [ ] **Step 6: Commit**

```
feat(fwr.9): add linkExistingQuestToBook utility
```

---

### Task 3: Shared Utility — createExtraCreditForBook

**Files:**

- Modify: `tests/questBookLinker.test.js`
- Modify: `assets/js/utils/questBookLinker.js`

- [ ] **Step 1: Write the failing tests**

Append to `tests/questBookLinker.test.js`. The function needs to create an Extra Credit quest with the correct structure. We need to mock `RewardCalculator` and `generateQuestId`:

At the top of the file, add the mock:

```javascript
jest.mock('../assets/js/services/RewardCalculator.js', () => ({
    RewardCalculator: {
        getBaseRewards: jest.fn(() => ({
            toJSON: () => ({ xp: 0, inkDrops: 0, paperScraps: 10, blueprints: 0, items: [] })
        }))
    }
}));
```

Then add the test block:

```javascript
import { createExtraCreditForBook } from '../assets/js/utils/questBookLinker.js';

describe('createExtraCreditForBook', () => {
    function createSA(books) {
        const activeQuests = [];
        return {
            getActiveAssignments: () => activeQuests,
            getBook: (id) => books[id] || null,
            addActiveQuests: jest.fn((quests) => { activeQuests.push(...quests); }),
            linkQuestToBook: jest.fn(),
        };
    }

    test('creates an Extra Credit quest linked to the book', () => {
        const books = { 'b1': { id: 'b1', title: 'Dune', author: 'Frank Herbert', cover: 'dune.jpg' } };
        const sa = createSA(books);

        const quest = createExtraCreditForBook('b1', sa);

        expect(quest).not.toBeNull();
        expect(quest.type).toBe('⭐ Extra Credit');
        expect(quest.prompt).toBe('Book read outside of quest pool');
        expect(quest.bookId).toBe('b1');
        expect(quest.book).toBe('Dune');
        expect(quest.bookAuthor).toBe('Frank Herbert');
        expect(quest.coverUrl).toBe('dune.jpg');
        expect(quest.buffs).toEqual([]);
        expect(quest.notes).toBe('');
        expect(quest.month).toBeTruthy();
        expect(quest.year).toBeTruthy();
        expect(quest.id).toBeTruthy();
        expect(quest.dateAdded).toBeTruthy();
        expect(quest.rewards).toEqual({ xp: 0, inkDrops: 0, paperScraps: 10, blueprints: 0, items: [] });
    });

    test('calls addActiveQuests and linkQuestToBook', () => {
        const books = { 'b1': { id: 'b1', title: 'Dune', author: 'Frank Herbert' } };
        const sa = createSA(books);

        const quest = createExtraCreditForBook('b1', sa);

        expect(sa.addActiveQuests).toHaveBeenCalledWith([quest]);
        expect(sa.linkQuestToBook).toHaveBeenCalledWith('b1', quest.id);
    });

    test('returns null if book not found', () => {
        const sa = createSA({});
        expect(createExtraCreditForBook('b-missing', sa)).toBeNull();
    });

    test('uses current month and year', () => {
        const books = { 'b1': { id: 'b1', title: 'Dune', author: 'Frank Herbert' } };
        const sa = createSA(books);
        const now = new Date();
        const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];

        const quest = createExtraCreditForBook('b1', sa);

        expect(quest.month).toBe(months[now.getMonth()]);
        expect(quest.year).toBe(String(now.getFullYear()));
    });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest tests/questBookLinker.test.js --no-coverage 2>&1 | tail -20`
Expected: FAIL — createExtraCreditForBook is not a function

- [ ] **Step 3: Write minimal implementation**

Add to `assets/js/utils/questBookLinker.js`:

```javascript
import { RewardCalculator } from '../services/RewardCalculator.js';

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];

function generateQuestId() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0;
        const v = c === 'x' ? r : (r & 0x3) | 0x8;
        return v.toString(16);
    });
}

/**
 * Create an Extra Credit quest linked to a book.
 * @param {string} bookId
 * @param {Object} stateAdapter
 * @returns {Object|null} The created quest, or null if book not found
 */
export function createExtraCreditForBook(bookId, stateAdapter) {
    const book = stateAdapter.getBook(bookId);
    if (!book) return null;

    const now = new Date();
    const type = '⭐ Extra Credit';
    const prompt = 'Book read outside of quest pool';
    const rewards = RewardCalculator.getBaseRewards(type, prompt);

    const quest = {
        id: generateQuestId(),
        type,
        prompt,
        bookId,
        book: book.title || '',
        bookAuthor: book.author || '',
        coverUrl: book.cover || undefined,
        month: MONTHS[now.getMonth()],
        year: String(now.getFullYear()),
        notes: '',
        buffs: [],
        rewards: rewards.toJSON(),
        dateAdded: now.toISOString(),
    };

    stateAdapter.addActiveQuests([quest]);
    stateAdapter.linkQuestToBook(bookId, quest.id);
    return quest;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest tests/questBookLinker.test.js --no-coverage 2>&1 | tail -20`
Expected: 12 tests PASS

- [ ] **Step 5: Commit**

```
feat(fwr.9): add createExtraCreditForBook utility
```

---

### Task 4: Book Edit Drawer HTML — Interactive Links Section

**Files:**

- Modify: `_includes/character-sheet/drawers/book-edit.html`

- [ ] **Step 1: Replace the read-only links section with interactive HTML**

In `_includes/character-sheet/drawers/book-edit.html`, replace the existing links section (lines 81-84):

Old:

```html
            <div id="book-edit-links-section" class="form-row book-edit-links" style="display: none;">
                <label><strong>Linked:</strong></label>
                <div id="book-edit-links-display" class="book-edit-links-display"></div>
            </div>
```

New:

```html
            <div id="book-edit-links-section" class="form-row book-edit-links">
                <label><strong>Linked Quests:</strong></label>
                <div id="book-edit-links-list" class="book-edit-links-list"></div>
                <div class="book-edit-links-actions">
                    <button type="button" id="book-edit-link-quest-btn" class="rpg-btn rpg-btn-secondary book-edit-link-action-btn">Link Active Quest</button>
                    <button type="button" id="book-edit-create-ec-btn" class="rpg-btn rpg-btn-secondary book-edit-link-action-btn">Create Extra Credit Quest</button>
                </div>
                <div id="book-edit-link-quest-dropdown" class="book-edit-link-quest-dropdown" style="display: none;"></div>
            </div>
```

- [ ] **Step 2: Commit**

```
feat(fwr.9): add interactive links section HTML to book edit drawer
```

---

### Task 5: CSS — Popover, Quest Option Rows, Drawer Links Section

**Files:**

- Modify: `assets/css/character-sheet.css`

- [ ] **Step 1: Add styles for the link quest popover (used on library card)**

Append to `assets/css/character-sheet.css` after the existing book-selector styles:

```css
/* --- fwr.9: Link Quest popover & drawer links --- */

.library-link-quest-popover {
    position: absolute;
    z-index: 1001;
    display: flex;
    flex-direction: column;
    max-height: 360px;
    min-width: 280px;
    max-width: 340px;
    background: #2a231d;
    border: 2px solid #54483b;
    border-radius: 6px;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
    padding: 8px;
}

.library-link-quest-popover-header {
    font-size: 0.85em;
    color: #8a7a61;
    padding: 2px 4px 6px;
    border-bottom: 1px solid #54483b;
    margin-bottom: 6px;
}

.link-quest-list {
    overflow-y: auto;
    max-height: 220px;
    margin-bottom: 8px;
}

.link-quest-option {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    padding: 6px 8px;
    background: transparent;
    border: 1px solid transparent;
    border-radius: 4px;
    color: #d4c8b0;
    font-family: inherit;
    font-size: 0.9rem;
    cursor: pointer;
    text-align: left;
    transition: background 0.15s, border-color 0.15s;
}

.link-quest-option:hover {
    background: rgba(184, 159, 98, 0.12);
    border-color: #54483b;
}

.link-quest-option-cover {
    width: 32px;
    height: 44px;
    object-fit: cover;
    border-radius: 3px;
    flex-shrink: 0;
    background: rgba(62, 53, 47, 0.6);
}

.link-quest-option-cover-placeholder {
    width: 32px;
    height: 44px;
    flex-shrink: 0;
    background: rgba(62, 53, 47, 0.6);
    border-radius: 3px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 0.7em;
    color: #8a7a61;
}

.link-quest-option-text {
    flex: 1;
    min-width: 0;
}

.link-quest-option-type {
    font-size: 0.8em;
    margin-right: 4px;
}

.link-quest-option-prompt {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    display: block;
}

.link-quest-empty {
    color: #8a7a61;
    font-style: italic;
    padding: 8px;
    font-size: 0.9em;
}

.link-quest-create-ec-btn {
    width: 100%;
    padding: 8px;
    background: rgba(184, 159, 98, 0.15);
    border: 1px solid #54483b;
    border-radius: 4px;
    color: #d4c8b0;
    font-family: inherit;
    font-size: 0.9rem;
    cursor: pointer;
    transition: background 0.15s;
}

.link-quest-create-ec-btn:hover {
    background: rgba(184, 159, 98, 0.25);
}

/* Book edit drawer: linked quests list */

.book-edit-links-list {
    margin-bottom: 8px;
}

.book-edit-linked-quest-row {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 4px 0;
    color: #d4c8b0;
    font-size: 0.9rem;
}

.book-edit-linked-quest-row + .book-edit-linked-quest-row {
    border-top: 1px solid rgba(84, 72, 59, 0.4);
}

.book-edit-linked-quest-text {
    flex: 1;
    min-width: 0;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}

.book-edit-unlink-btn {
    flex-shrink: 0;
    background: transparent;
    border: 1px solid transparent;
    color: #8a7a61;
    cursor: pointer;
    font-size: 1rem;
    padding: 2px 6px;
    border-radius: 3px;
    transition: color 0.15s, border-color 0.15s;
}

.book-edit-unlink-btn:hover {
    color: #d4c8b0;
    border-color: #54483b;
}

.book-edit-links-empty {
    color: #8a7a61;
    font-style: italic;
    font-size: 0.9em;
}

.book-edit-links-actions {
    display: flex;
    gap: 8px;
    margin-top: 4px;
}

.book-edit-link-action-btn {
    font-size: 0.85rem;
    padding: 4px 10px;
}

.book-edit-link-quest-dropdown {
    margin-top: 6px;
    max-height: 220px;
    overflow-y: auto;
    background: rgba(42, 35, 29, 0.9);
    border: 1px solid #54483b;
    border-radius: 4px;
    padding: 4px;
}
```

- [ ] **Step 2: Commit**

```
feat(fwr.9): add CSS for quest linking popover and drawer links section
```

---

### Task 6: Library Card — Link Quest Button & Popover

**Files:**

- Create: `tests/libraryQuestLinking.test.js`
- Modify: `assets/js/controllers/LibraryController.js`

- [ ] **Step 1: Write the failing tests for the library card popover**

Create `tests/libraryQuestLinking.test.js`:

```javascript
/**
 * @jest-environment jsdom
 */

import { LibraryController } from '../assets/js/controllers/LibraryController.js';
import { StateAdapter } from '../assets/js/character-sheet/stateAdapter.js';
import { characterState } from '../assets/js/character-sheet/state.js';
import * as ui from '../assets/js/character-sheet/ui.js';
import * as data from '../assets/js/character-sheet/data.js';

jest.mock('../assets/js/services/BookMetadataService.js', () => ({
    searchBooks: jest.fn(() => Promise.resolve([]))
}));

jest.mock('../assets/js/services/RewardCalculator.js', () => ({
    RewardCalculator: {
        getBaseRewards: jest.fn(() => ({
            toJSON: () => ({ xp: 0, inkDrops: 0, paperScraps: 10, blueprints: 0, items: [] })
        }))
    }
}));

jest.mock('../assets/js/ui/toast.js', () => ({
    toast: { success: jest.fn(), error: jest.fn(), info: jest.fn(), warning: jest.fn() }
}));

function setupDOM() {
    document.body.innerHTML = `
        <form id="character-sheet">
            <div id="library-cards-reading"></div>
            <div id="library-cards-completed"></div>
            <div id="library-cards-other"></div>
            <div id="book-edit-drawer" style="display: none;"></div>
            <div id="book-edit-backdrop"></div>
            <button type="button" id="close-book-edit">Close</button>
            <button type="button" id="cancel-book-edit-btn">Cancel</button>
            <button type="button" id="save-book-edit-btn">Save</button>
            <input type="hidden" id="book-edit-id" />
            <div class="form-row">
                <label for="book-edit-search-query">Look up book:</label>
                <div class="library-search-input-and-results">
                    <div class="library-search-wrap">
                        <input type="text" id="book-edit-search-query" />
                        <button type="button" id="book-edit-search-btn">Look up</button>
                    </div>
                    <div id="book-edit-search-results" style="display:none;"></div>
                </div>
            </div>
            <input type="text" id="book-edit-title" />
            <input type="text" id="book-edit-author" />
            <input type="number" id="book-edit-page-count" />
            <select id="book-edit-status"><option value="reading">Reading</option><option value="completed">Completed</option><option value="other">Other</option></select>
            <input type="hidden" id="book-edit-cover-value" />
            <input type="url" id="book-edit-cover-url" />
            <input type="file" id="book-edit-cover-upload" accept="image/*" />
            <img id="book-edit-cover-preview" style="display: none;" />
            <span id="book-edit-cover-placeholder">No cover</span>
            <div id="book-edit-links-section"></div>
            <div id="book-edit-links-list"></div>
            <button type="button" id="book-edit-link-quest-btn">Link Active Quest</button>
            <button type="button" id="book-edit-create-ec-btn">Create Extra Credit Quest</button>
            <div id="book-edit-link-quest-dropdown" style="display: none;"></div>
        </form>
        <form id="library-add-book-form">
            <input type="text" id="library-book-title" />
            <input type="text" id="library-book-author" />
            <input type="number" id="library-add-page-count" />
            <input type="hidden" id="library-add-cover-value" />
            <input type="url" id="library-add-cover-url" />
            <input type="file" id="library-add-cover-upload" accept="image/*" />
            <img id="library-add-cover-preview" style="display: none;" />
            <span id="library-add-cover-placeholder">No cover</span>
            <select id="library-add-status"><option value="reading">Reading</option></select>
            <select id="library-add-shelf-category"><option value="general">General</option></select>
            <button type="submit" id="library-add-btn">Add Book</button>
        </form>
    `;
}

function createStateAdapterWithBooks(books = {}, activeQuests = []) {
    const state = { ...characterState };
    state.books = books;
    state.activeAssignments = activeQuests;
    const sa = new StateAdapter(state);
    sa.saveState = jest.fn();
    return sa;
}

describe('Library Card — Link Quest Button', () => {
    let controller, stateAdapter;

    beforeEach(() => {
        setupDOM();
        stateAdapter = createStateAdapterWithBooks(
            {
                'b1': { id: 'b1', title: 'Dune', author: 'Frank Herbert', cover: 'dune.jpg', status: 'reading', links: { questIds: [], curriculumPromptIds: [] } },
            },
            [
                { id: 'q1', type: '♥ Organize the Stacks', prompt: 'Fantasy', bookId: null },
                { id: 'q2', type: '⭐ Extra Credit', prompt: 'Book read outside of quest pool', bookId: 'b2' },
            ]
        );
        const form = document.getElementById('character-sheet');
        controller = new LibraryController(stateAdapter, form, { ui, data });
        controller.renderBooks();
    });

    test('renders a Link Quest button on each book card', () => {
        const btn = document.querySelector('.library-link-quest-btn[data-book-id="b1"]');
        expect(btn).not.toBeNull();
        expect(btn.getAttribute('aria-label')).toBe('Link quest');
    });

    test('clicking Link Quest button opens popover', () => {
        const btn = document.querySelector('.library-link-quest-btn[data-book-id="b1"]');
        btn.click();
        const popover = document.querySelector('.library-link-quest-popover');
        expect(popover).not.toBeNull();
    });

    test('popover shows unlinked quests', () => {
        const btn = document.querySelector('.library-link-quest-btn[data-book-id="b1"]');
        btn.click();
        const options = document.querySelectorAll('.link-quest-option');
        expect(options).toHaveLength(1);
        expect(options[0].textContent).toContain('Fantasy');
    });

    test('popover shows Create Extra Credit button', () => {
        const btn = document.querySelector('.library-link-quest-btn[data-book-id="b1"]');
        btn.click();
        const ecBtn = document.querySelector('.link-quest-create-ec-btn');
        expect(ecBtn).not.toBeNull();
    });

    test('clicking a quest option links it and closes popover', () => {
        const btn = document.querySelector('.library-link-quest-btn[data-book-id="b1"]');
        btn.click();
        const option = document.querySelector('.link-quest-option');
        option.click();
        // Popover should be removed
        expect(document.querySelector('.library-link-quest-popover')).toBeNull();
        // Quest should now have bookId
        const q = stateAdapter.getActiveAssignments().find(q => q.id === 'q1');
        expect(q.bookId).toBe('b1');
    });

    test('clicking Create Extra Credit creates quest and closes popover', () => {
        const btn = document.querySelector('.library-link-quest-btn[data-book-id="b1"]');
        btn.click();
        const ecBtn = document.querySelector('.link-quest-create-ec-btn');
        ecBtn.click();
        expect(document.querySelector('.library-link-quest-popover')).toBeNull();
        const quests = stateAdapter.getActiveAssignments();
        const ec = quests.find(q => q.type === '⭐ Extra Credit' && q.bookId === 'b1');
        expect(ec).toBeTruthy();
    });

    test('popover shows empty message when no unlinked quests', () => {
        // Link the only unlinked quest first
        const quests = stateAdapter.getActiveAssignments();
        quests[0].bookId = 'b-other';

        const btn = document.querySelector('.library-link-quest-btn[data-book-id="b1"]');
        btn.click();
        const empty = document.querySelector('.link-quest-empty');
        expect(empty).not.toBeNull();
    });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest tests/libraryQuestLinking.test.js --no-coverage 2>&1 | tail -30`
Expected: FAIL — no `.library-link-quest-btn` in rendered cards

- [ ] **Step 3: Add the Link Quest button to `_renderCardList()` in LibraryController.js**

In `assets/js/controllers/LibraryController.js`, in `_renderCardList()`, add the link quest button after `editBtn`:

```javascript
const linkQuestBtn = `<button type="button" class="rpg-btn rpg-btn-secondary library-card-action-btn library-link-quest-btn" data-book-id="${this._escapeAttr(book.id)}" aria-label="Link quest" title="Link quest">🔗</button>`;
```

And include it in the actions div:

```html
<div class="library-card-actions">
    ${markCompleteBtn}
    ${editBtn}
    ${linkQuestBtn}
    ${shelfBadge}
</div>
```

- [ ] **Step 4: Add the click handler delegation for the Link Quest button**

In the `form.addEventListener('click', ...)` handler (around line 94), add:

```javascript
const linkQuestBtn = e.target.closest('.library-link-quest-btn');
if (linkQuestBtn && linkQuestBtn.dataset.bookId) {
    e.preventDefault();
    this._openLinkQuestPopover(linkQuestBtn, linkQuestBtn.dataset.bookId);
    return;
}
```

- [ ] **Step 5: Add imports for the shared utilities and toast**

At the top of `LibraryController.js`, add:

```javascript
import { getUnlinkedActiveQuests, linkExistingQuestToBook, createExtraCreditForBook } from '../utils/questBookLinker.js';
import { toast } from '../ui/toast.js';
```

- [ ] **Step 6: Implement `_openLinkQuestPopover()` method**

Add to `LibraryController`:

```javascript
    _openLinkQuestPopover(anchorEl, bookId) {
        // Close any existing popover
        this._closeLinkQuestPopover();

        const book = this.stateAdapter.getBook(bookId);
        if (!book) return;

        const unlinked = getUnlinkedActiveQuests(this.stateAdapter);

        const popover = document.createElement('div');
        popover.className = 'library-link-quest-popover';

        // Header
        const header = document.createElement('div');
        header.className = 'library-link-quest-popover-header';
        header.textContent = `Link quest to "${book.title || 'Untitled'}"`;
        popover.appendChild(header);

        // Quest list
        const list = document.createElement('div');
        list.className = 'link-quest-list';

        if (unlinked.length === 0) {
            const empty = document.createElement('div');
            empty.className = 'link-quest-empty';
            empty.textContent = 'No unlinked quests';
            list.appendChild(empty);
        } else {
            unlinked.forEach(q => {
                const btn = document.createElement('button');
                btn.type = 'button';
                btn.className = 'link-quest-option';
                btn.dataset.questId = q.id;

                if (q.coverUrl) {
                    const img = document.createElement('img');
                    img.className = 'link-quest-option-cover';
                    img.src = q.coverUrl;
                    img.alt = '';
                    img.onerror = function() { this.style.display = 'none'; };
                    btn.appendChild(img);
                } else {
                    const ph = document.createElement('span');
                    ph.className = 'link-quest-option-cover-placeholder';
                    btn.appendChild(ph);
                }

                const textWrap = document.createElement('span');
                textWrap.className = 'link-quest-option-text';
                const typeSpan = document.createElement('span');
                typeSpan.className = 'link-quest-option-type';
                typeSpan.textContent = q.type.split(' ')[0]; // emoji only
                textWrap.appendChild(typeSpan);
                const promptSpan = document.createElement('span');
                promptSpan.className = 'link-quest-option-prompt';
                promptSpan.textContent = q.prompt || '(no prompt)';
                textWrap.appendChild(promptSpan);
                btn.appendChild(textWrap);

                btn.addEventListener('click', () => {
                    const success = linkExistingQuestToBook(q.id, bookId, this.stateAdapter);
                    if (success) {
                        this.stateAdapter.saveState();
                        toast.success(`Quest linked to "${book.title}"`);
                        this.renderBooks();
                    } else {
                        toast.error('Failed to link quest');
                    }
                    this._closeLinkQuestPopover();
                });

                list.appendChild(btn);
            });
        }
        popover.appendChild(list);

        // Create Extra Credit button
        const ecBtn = document.createElement('button');
        ecBtn.type = 'button';
        ecBtn.className = 'link-quest-create-ec-btn';
        ecBtn.textContent = '⭐ Create Extra Credit Quest';
        ecBtn.addEventListener('click', () => {
            const quest = createExtraCreditForBook(bookId, this.stateAdapter);
            if (quest) {
                this.stateAdapter.saveState();
                toast.success(`Extra Credit quest created for "${book.title}"`);
                this.renderBooks();
            } else {
                toast.error('Failed to create quest');
            }
            this._closeLinkQuestPopover();
        });
        popover.appendChild(ecBtn);

        // Position popover below anchor
        const card = anchorEl.closest('.library-card');
        if (card) {
            card.style.position = 'relative';
            popover.style.top = '100%';
            popover.style.right = '0';
            card.appendChild(popover);
        } else {
            document.body.appendChild(popover);
        }

        // Close on outside click
        this._popoverCloseHandler = (e) => {
            if (!popover.contains(e.target) && e.target !== anchorEl) {
                this._closeLinkQuestPopover();
            }
        };
        setTimeout(() => document.addEventListener('click', this._popoverCloseHandler), 0);

        // Close on Escape
        this._popoverEscHandler = (e) => {
            if (e.key === 'Escape') this._closeLinkQuestPopover();
        };
        document.addEventListener('keydown', this._popoverEscHandler);

        this._activePopover = popover;
    }

    _closeLinkQuestPopover() {
        if (this._activePopover) {
            this._activePopover.remove();
            this._activePopover = null;
        }
        if (this._popoverCloseHandler) {
            document.removeEventListener('click', this._popoverCloseHandler);
            this._popoverCloseHandler = null;
        }
        if (this._popoverEscHandler) {
            document.removeEventListener('keydown', this._popoverEscHandler);
            this._popoverEscHandler = null;
        }
    }
```

- [ ] **Step 7: Run tests to verify they pass**

Run: `npx jest tests/libraryQuestLinking.test.js --no-coverage 2>&1 | tail -30`
Expected: 7 tests PASS

- [ ] **Step 8: Run all existing library tests to verify no regressions**

Run: `npx jest tests/libraryController.test.js --no-coverage 2>&1 | tail -20`
Expected: All existing tests PASS

- [ ] **Step 9: Commit**

```
feat(fwr.9): add Link Quest button and popover on library book cards
```

---

### Task 7: Book Edit Drawer — Interactive Links Section

**Files:**

- Modify: `tests/libraryQuestLinking.test.js`
- Modify: `assets/js/controllers/LibraryController.js`

- [ ] **Step 1: Write the failing tests for the drawer links section**

Append to `tests/libraryQuestLinking.test.js`:

```javascript
describe('Book Edit Drawer — Links Section', () => {
    let controller, stateAdapter;

    beforeEach(() => {
        setupDOM();
        stateAdapter = createStateAdapterWithBooks(
            {
                'b1': {
                    id: 'b1', title: 'Dune', author: 'Frank Herbert', cover: 'dune.jpg',
                    status: 'reading', tags: [],
                    links: { questIds: ['q-linked'], curriculumPromptIds: [] }
                },
            },
            [
                { id: 'q-linked', type: '♥ Organize the Stacks', prompt: 'Fantasy', bookId: 'b1' },
                { id: 'q-unlinked', type: '♣ Side Quest', prompt: 'Read a classic', bookId: null },
            ]
        );
        const form = document.getElementById('character-sheet');
        controller = new LibraryController(stateAdapter, form, { ui, data });
    });

    test('shows linked quests with unlink button', () => {
        controller.handleEditBook('b1');
        const rows = document.querySelectorAll('.book-edit-linked-quest-row');
        expect(rows).toHaveLength(1);
        expect(rows[0].textContent).toContain('Fantasy');
        expect(rows[0].querySelector('.book-edit-unlink-btn')).not.toBeNull();
    });

    test('shows empty message when no linked quests', () => {
        // Remove the link
        const book = stateAdapter.getBook('b1');
        book.links.questIds = [];
        controller.handleEditBook('b1');
        const empty = document.querySelector('.book-edit-links-empty');
        expect(empty).not.toBeNull();
    });

    test('unlink button removes quest from book', () => {
        controller.handleEditBook('b1');
        const unlinkBtn = document.querySelector('.book-edit-unlink-btn');
        unlinkBtn.click();
        const q = stateAdapter.getActiveAssignments().find(q => q.id === 'q-linked');
        expect(q.bookId).toBeFalsy();
        // Links list should now show empty
        const empty = document.querySelector('.book-edit-links-empty');
        expect(empty).not.toBeNull();
    });

    test('Link Active Quest button opens dropdown with unlinked quests', () => {
        controller.handleEditBook('b1');
        const linkBtn = document.getElementById('book-edit-link-quest-btn');
        linkBtn.click();
        const dropdown = document.getElementById('book-edit-link-quest-dropdown');
        expect(dropdown.style.display).not.toBe('none');
        const options = dropdown.querySelectorAll('.link-quest-option');
        expect(options).toHaveLength(1);
        expect(options[0].textContent).toContain('Read a classic');
    });

    test('selecting a quest from dropdown links it and refreshes', () => {
        controller.handleEditBook('b1');
        const linkBtn = document.getElementById('book-edit-link-quest-btn');
        linkBtn.click();
        const option = document.querySelector('#book-edit-link-quest-dropdown .link-quest-option');
        option.click();
        const rows = document.querySelectorAll('.book-edit-linked-quest-row');
        expect(rows).toHaveLength(2);
    });

    test('Create Extra Credit Quest button creates quest and refreshes', () => {
        controller.handleEditBook('b1');
        const ecBtn = document.getElementById('book-edit-create-ec-btn');
        ecBtn.click();
        const quests = stateAdapter.getActiveAssignments();
        const ec = quests.find(q => q.type === '⭐ Extra Credit' && q.bookId === 'b1');
        expect(ec).toBeTruthy();
        // Links list should show 2 now (original + new EC)
        const rows = document.querySelectorAll('.book-edit-linked-quest-row');
        expect(rows).toHaveLength(2);
    });

    test('links section is always visible', () => {
        const book = stateAdapter.getBook('b1');
        book.links.questIds = [];
        controller.handleEditBook('b1');
        const section = document.getElementById('book-edit-links-section');
        expect(section.style.display).not.toBe('none');
    });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest tests/libraryQuestLinking.test.js --no-coverage 2>&1 | tail -30`
Expected: FAIL — new tests fail (links section not interactive yet)

- [ ] **Step 3: Modify `handleEditBook()` to render interactive links**

In `LibraryController.js`, replace the links display section in `handleEditBook()` (around lines 543-551). Replace:

```javascript
        const links = book.links || { questIds: [], curriculumPromptIds: [] };
        const hasLinks = (links.questIds && links.questIds.length > 0) || (links.curriculumPromptIds && links.curriculumPromptIds.length > 0);
        if (linksSection) linksSection.style.display = hasLinks ? 'block' : 'none';
        if (linksDisplay) {
            const parts = [];
            if (links.questIds && links.questIds.length) parts.push(`${links.questIds.length} quest(s)`);
            if (links.curriculumPromptIds && links.curriculumPromptIds.length) parts.push(`${links.curriculumPromptIds.length} prompt(s)`);
            linksDisplay.textContent = parts.join(', ') || '—';
        }
```

With:

```javascript
        if (linksSection) linksSection.style.display = 'block';
        this._renderDrawerLinksSection(bookId);
```

- [ ] **Step 4: Implement `_renderDrawerLinksSection()` and wire up action buttons**

Add to `LibraryController`:

```javascript
    _renderDrawerLinksSection(bookId) {
        const book = this.stateAdapter.getBook(bookId);
        if (!book) return;

        const listEl = document.getElementById('book-edit-links-list');
        const dropdown = document.getElementById('book-edit-link-quest-dropdown');
        if (dropdown) dropdown.style.display = 'none';

        if (!listEl) return;
        listEl.innerHTML = '';

        const links = book.links || { questIds: [], curriculumPromptIds: [] };
        const questIds = links.questIds || [];
        const activeQuests = this.stateAdapter.getActiveAssignments() || [];

        if (questIds.length === 0) {
            const empty = document.createElement('div');
            empty.className = 'book-edit-links-empty';
            empty.textContent = 'No linked quests';
            listEl.appendChild(empty);
        } else {
            questIds.forEach(qid => {
                const quest = activeQuests.find(q => q.id === qid);
                if (!quest) return;

                const row = document.createElement('div');
                row.className = 'book-edit-linked-quest-row';

                const text = document.createElement('span');
                text.className = 'book-edit-linked-quest-text';
                text.textContent = `${quest.type.split(' ')[0]} ${quest.prompt || '(no prompt)'}`;
                row.appendChild(text);

                const unlinkBtn = document.createElement('button');
                unlinkBtn.type = 'button';
                unlinkBtn.className = 'book-edit-unlink-btn';
                unlinkBtn.textContent = '✕';
                unlinkBtn.title = 'Unlink quest';
                unlinkBtn.addEventListener('click', () => {
                    this.stateAdapter.unlinkQuestFromBook(bookId, qid);
                    // Clear bookId on the quest
                    const q = activeQuests.find(q => q.id === qid);
                    if (q) {
                        q.bookId = null;
                        q.book = '';
                        q.bookAuthor = '';
                        q.coverUrl = undefined;
                    }
                    this.stateAdapter.saveState();
                    toast.success('Quest unlinked');
                    this._renderDrawerLinksSection(bookId);
                    this.renderBooks();
                });
                row.appendChild(unlinkBtn);

                listEl.appendChild(row);
            });
        }

        // Wire up Link Active Quest button
        const linkBtn = document.getElementById('book-edit-link-quest-btn');
        if (linkBtn) {
            const newLinkBtn = linkBtn.cloneNode(true);
            linkBtn.parentNode.replaceChild(newLinkBtn, linkBtn);
            newLinkBtn.addEventListener('click', () => {
                this._renderDrawerLinkQuestDropdown(bookId);
            });
        }

        // Wire up Create Extra Credit button
        const ecBtn = document.getElementById('book-edit-create-ec-btn');
        if (ecBtn) {
            const newEcBtn = ecBtn.cloneNode(true);
            ecBtn.parentNode.replaceChild(newEcBtn, ecBtn);
            newEcBtn.addEventListener('click', () => {
                const quest = createExtraCreditForBook(bookId, this.stateAdapter);
                if (quest) {
                    this.stateAdapter.saveState();
                    toast.success(`Extra Credit quest created for "${book.title}"`);
                    this._renderDrawerLinksSection(bookId);
                    this.renderBooks();
                } else {
                    toast.error('Failed to create quest');
                }
            });
        }
    }

    _renderDrawerLinkQuestDropdown(bookId) {
        const dropdown = document.getElementById('book-edit-link-quest-dropdown');
        if (!dropdown) return;

        const unlinked = getUnlinkedActiveQuests(this.stateAdapter);
        dropdown.innerHTML = '';

        if (unlinked.length === 0) {
            const empty = document.createElement('div');
            empty.className = 'link-quest-empty';
            empty.textContent = 'No unlinked quests';
            dropdown.appendChild(empty);
        } else {
            unlinked.forEach(q => {
                const btn = document.createElement('button');
                btn.type = 'button';
                btn.className = 'link-quest-option';
                btn.dataset.questId = q.id;

                if (q.coverUrl) {
                    const img = document.createElement('img');
                    img.className = 'link-quest-option-cover';
                    img.src = q.coverUrl;
                    img.alt = '';
                    btn.appendChild(img);
                } else {
                    const ph = document.createElement('span');
                    ph.className = 'link-quest-option-cover-placeholder';
                    btn.appendChild(ph);
                }

                const textWrap = document.createElement('span');
                textWrap.className = 'link-quest-option-text';
                const typeSpan = document.createElement('span');
                typeSpan.className = 'link-quest-option-type';
                typeSpan.textContent = q.type.split(' ')[0];
                textWrap.appendChild(typeSpan);
                const promptSpan = document.createElement('span');
                promptSpan.className = 'link-quest-option-prompt';
                promptSpan.textContent = q.prompt || '(no prompt)';
                textWrap.appendChild(promptSpan);
                btn.appendChild(textWrap);

                btn.addEventListener('click', () => {
                    const book = this.stateAdapter.getBook(bookId);
                    const success = linkExistingQuestToBook(q.id, bookId, this.stateAdapter);
                    if (success) {
                        this.stateAdapter.saveState();
                        toast.success(`Quest linked to "${book?.title}"`);
                        this._renderDrawerLinksSection(bookId);
                        this.renderBooks();
                    } else {
                        toast.error('Failed to link quest');
                    }
                });

                dropdown.appendChild(btn);
            });
        }

        dropdown.style.display = 'block';
    }
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx jest tests/libraryQuestLinking.test.js --no-coverage 2>&1 | tail -30`
Expected: All tests PASS (both card popover and drawer tests)

- [ ] **Step 6: Run all existing library tests**

Run: `npx jest tests/libraryController.test.js --no-coverage 2>&1 | tail -20`
Expected: All existing tests PASS

- [ ] **Step 7: Run full test suite**

Run: `npx jest --no-coverage 2>&1 | tail -20`
Expected: All tests PASS

- [ ] **Step 8: Commit**

```
feat(fwr.9): add interactive links section in book edit drawer
```

---

### Task 8: Integration — stateAdapter.updateActiveQuest (if missing)

**Files:**

- Modify: `assets/js/character-sheet/stateAdapter.js` (only if `updateActiveQuest` doesn't exist)
- Modify: existing stateAdapter tests (if needed)

- [ ] **Step 1: Check if updateActiveQuest already exists**

Search `stateAdapter.js` for `updateActiveQuest`. If it exists, skip this task entirely.

- [ ] **Step 2: If missing, write the failing test**

In the appropriate stateAdapter test file, add:

```javascript
test('updateActiveQuest updates fields on matching quest', () => {
    const sa = new StateAdapter(state);
    state.activeAssignments = [{ id: 'q1', type: 'test', bookId: null }];
    const result = sa.updateActiveQuest('q1', { bookId: 'b1', book: 'Dune' });
    expect(result).toBe(true);
    expect(state.activeAssignments[0].bookId).toBe('b1');
    expect(state.activeAssignments[0].book).toBe('Dune');
});

test('updateActiveQuest returns false for missing quest', () => {
    const sa = new StateAdapter(state);
    state.activeAssignments = [];
    expect(sa.updateActiveQuest('q-missing', { bookId: 'b1' })).toBe(false);
});
```

- [ ] **Step 3: If missing, implement updateActiveQuest**

Add to `stateAdapter.js` near the other quest helper methods (around line 208):

```javascript
    /**
     * Update fields on an active quest by ID.
     * @param {string} questId
     * @param {Object} updates — fields to merge into the quest object
     * @returns {boolean} true if quest was found and updated
     */
    updateActiveQuest(questId, updates) {
        const quests = this.state[STORAGE_KEYS.ACTIVE_ASSIGNMENTS];
        const quest = quests.find(q => q.id === questId);
        if (!quest) return false;
        Object.assign(quest, updates);
        this._notify(STORAGE_KEYS.ACTIVE_ASSIGNMENTS, quests);
        return true;
    }
```

- [ ] **Step 4: Run tests to verify**

Run: `npx jest --no-coverage 2>&1 | tail -20`
Expected: All tests PASS

- [ ] **Step 5: Commit (if changes were made)**

```
feat(fwr.9): add updateActiveQuest to stateAdapter
```

---

### Task 9: Final Integration & Regression Testing

**Files:**

- No new files

- [ ] **Step 1: Run the full test suite**

Run: `npx jest --no-coverage 2>&1 | tail -30`
Expected: All tests PASS, no regressions

- [ ] **Step 2: Verify the popover closes on Escape and outside click**

This should be covered by the implementation in Task 6. If manual testing reveals issues, add targeted tests.

- [ ] **Step 3: Check that linking from the popover updates the drawer if it's open**

After linking from the popover, if the book edit drawer happens to be open for the same book, the links section should reflect the change on next open. This is handled because `_renderDrawerLinksSection` is called fresh in `handleEditBook()`.

- [ ] **Step 4: Commit any fixes**

```
fix(fwr.9): address integration issues
```
