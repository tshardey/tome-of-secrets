# s0r: Migrate Remaining Drawers to DrawerManager — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate 5 manually-implemented drawer/overlay systems to use the existing `DrawerManager` class, eliminating duplicated open/close/backdrop/Escape code.

**Architecture:** Add a `displayStyle` config option to `DrawerManager`, then migrate each drawer one at a time. Each controller creates its own `DrawerManager` instance. Domain logic stays in the controller via `onBeforeOpen`/`onAfterClose` lifecycle hooks. Public API of each controller (`openXDrawer`/`closeXDrawer`) is preserved as thin wrappers.

**Tech Stack:** JavaScript ES modules, Jest + jsdom for tests

**Spec:** `docs/superpowers/specs/2026-04-12-s0r-drawer-migration-design.md`

---

### Task 1: Add `displayStyle` config option to DrawerManager

**Files:**
- Modify: `assets/js/ui/DrawerManager.js:59`
- Test: `tests/DrawerManager.test.js`

- [ ] **Step 1: Write the failing test**

Add this test inside the `describe('open and close', ...)` block in `tests/DrawerManager.test.js`, after the existing "should do nothing when closing an unknown drawer id" test (after line 71):

```js
it('should use custom displayStyle when configured', () => {
    createDrawerDOM('test');
    manager = new DrawerManager({
        test: { backdrop: 'test-backdrop', drawer: 'test-drawer', closeBtn: 'close-test', displayStyle: 'block' }
    });

    manager.open('test');

    expect(document.getElementById('test-drawer').style.display).toBe('block');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/DrawerManager.test.js --verbose 2>&1 | tail -20`
Expected: FAIL — `Expected: "block"`, `Received: "flex"`

- [ ] **Step 3: Implement displayStyle support**

In `assets/js/ui/DrawerManager.js`, change line 59 from:

```js
        els.drawer.style.display = 'flex';
```

to:

```js
        els.drawer.style.display = cfg.displayStyle || 'flex';
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest tests/DrawerManager.test.js --verbose 2>&1 | tail -30`
Expected: All tests PASS including the new `displayStyle` test

- [ ] **Step 5: Commit**

```
feat: add displayStyle config option to DrawerManager
```

---

### Task 2: Migrate Leveling Rewards drawer (CharacterController)

**Files:**
- Modify: `assets/js/controllers/CharacterController.js:1,298-367`
- Test: manual verification (controller methods are integration-level; DrawerManager unit tests cover mechanics)

This is the simplest migration — no cancel button, no form population before open. The `onBeforeOpen` hook renders the rewards tables.

- [ ] **Step 1: Add DrawerManager import**

At the top of `assets/js/controllers/CharacterController.js`, add after the existing imports (after line 17):

```js
import { DrawerManager } from '../ui/DrawerManager.js';
```

- [ ] **Step 2: Create DrawerManager instance in `initialize()`**

In `CharacterController.initialize()`, find the line where leveling rewards button is wired up. Look for where `openLevelingRewardsDrawer` is called. Add DrawerManager creation near the start of `initialize()`, after the existing element lookups. Add this code:

```js
this.drawerManager = new DrawerManager({
    'leveling-rewards': {
        backdrop: 'leveling-rewards-backdrop',
        drawer: 'leveling-rewards-drawer',
        closeBtn: 'close-leveling-rewards',
        onBeforeOpen: (drawerEl) => {
            const levelingRewardsTable = document.getElementById('leveling-rewards-table');
            if (levelingRewardsTable && (!levelingRewardsTable.innerHTML || levelingRewardsTable.innerHTML.trim() === '')) {
                try {
                    const tableHtml = renderLevelingRewardsTable();
                    levelingRewardsTable.innerHTML = processLinks(tableHtml);
                } catch (err) {
                    console.error('Error rendering leveling rewards table:', err);
                }
            }
            const permanentBonusesTable = document.getElementById('permanent-bonuses-table');
            if (permanentBonusesTable) {
                this.renderPermanentBonusesTable(permanentBonusesTable);
            }
        }
    }
});
```

- [ ] **Step 3: Replace `openLevelingRewardsDrawer()` method body**

Replace the entire `openLevelingRewardsDrawer()` method (lines 298-353) with:

```js
openLevelingRewardsDrawer() {
    this.drawerManager.open('leveling-rewards');
}
```

- [ ] **Step 4: Replace `closeLevelingRewardsDrawer()` method body**

Replace the entire `closeLevelingRewardsDrawer()` method (lines 358-367) with:

```js
closeLevelingRewardsDrawer() {
    this.drawerManager.close('leveling-rewards');
}
```

- [ ] **Step 5: Run full test suite**

Run: `npx jest --verbose 2>&1 | tail -20`
Expected: All tests pass (no regressions)

- [ ] **Step 6: Commit**

```
refactor: migrate leveling rewards drawer to DrawerManager
```

---

### Task 3: Migrate School Mastery drawer (AbilityController)

**Files:**
- Modify: `assets/js/controllers/AbilityController.js:1,98-159`

Nearly identical pattern to Task 2. The `onBeforeOpen` hook renders school mastery abilities.

- [ ] **Step 1: Add DrawerManager import**

At the top of `assets/js/controllers/AbilityController.js`, add after the existing imports (after line 13):

```js
import { DrawerManager } from '../ui/DrawerManager.js';
```

- [ ] **Step 2: Create DrawerManager instance in `initialize()`**

In `AbilityController.initialize()`, add DrawerManager creation. Add this after the existing element lookups at the start of `initialize()`:

```js
this.drawerManager = new DrawerManager({
    'school-mastery': {
        backdrop: 'school-mastery-backdrop',
        drawer: 'school-mastery-drawer',
        closeBtn: 'close-school-mastery',
        onBeforeOpen: (drawerEl) => {
            const contentContainer = document.getElementById('school-mastery-abilities-content');
            if (contentContainer) {
                this.renderSchoolMasteryAbilities(contentContainer);
            }
        }
    }
});
```

- [ ] **Step 3: Replace `openSchoolMasteryDrawer()` method body**

Replace the entire `openSchoolMasteryDrawer()` method (lines 101-145) with:

```js
openSchoolMasteryDrawer() {
    this.drawerManager.open('school-mastery');
}
```

- [ ] **Step 4: Replace `closeSchoolMasteryDrawer()` method body**

Replace the entire `closeSchoolMasteryDrawer()` method (lines 150-159) with:

```js
closeSchoolMasteryDrawer() {
    this.drawerManager.close('school-mastery');
}
```

- [ ] **Step 5: Run full test suite**

Run: `npx jest --verbose 2>&1 | tail -20`
Expected: All tests pass

- [ ] **Step 6: Commit**

```
refactor: migrate school mastery drawer to DrawerManager
```

---

### Task 4: Migrate Quest Edit drawer (QuestController)

**Files:**
- Modify: `assets/js/controllers/QuestController.js:1,148-189,1737-1764`

More complex: has a cancel button, and `onAfterClose` must destroy the book selector and clear editing state. The form is populated before `open()` is called (in `handleEditQuest`), so no `onBeforeOpen` hook needed.

- [ ] **Step 1: Add DrawerManager import**

At the top of `assets/js/controllers/QuestController.js`, add after the existing imports (after line 26):

```js
import { DrawerManager } from '../ui/DrawerManager.js';
```

- [ ] **Step 2: Create DrawerManager instance and wire cancel button in `initialize()`**

In `QuestController.initialize()`, find the quest edit drawer setup section (around lines 148-189). Replace the manual drawer wiring code. The goal is to:

1. Remove the manual close/backdrop/cancel/Escape listeners (lines 158-189)
2. Keep the `saveQuestChangesBtn` click handler (lines 178-181) and the `cancelEditQuestButton` handler (lines 142-145)
3. Add DrawerManager creation

Replace lines 148-189 (from `// Quest edit drawer elements` through the Escape key handler) with:

```js
// Quest edit drawer elements
const questEditDrawer = document.getElementById('quest-edit-drawer');
const questEditBackdrop = document.getElementById('quest-edit-backdrop');
const cancelQuestEditBtn = document.getElementById('cancel-quest-edit-btn');
const saveQuestChangesBtn = document.getElementById('save-quest-changes-btn');

this.questEditDrawer = questEditDrawer;
this.questEditBackdrop = questEditBackdrop;

this.drawerManager = new DrawerManager({
    'quest-edit': {
        backdrop: 'quest-edit-backdrop',
        drawer: 'quest-edit-drawer',
        closeBtn: 'close-quest-edit',
        onAfterClose: (drawerEl) => {
            if (this._editDrawerBookSelector) {
                this._editDrawerBookSelector.destroy();
                this._editDrawerBookSelector = null;
            }
            this.editingQuestInfo = null;
        }
    }
});

if (cancelQuestEditBtn) {
    this.addEventListener(cancelQuestEditBtn, 'click', () => {
        this.drawerManager.close('quest-edit');
    });
}

// Save changes handler
if (saveQuestChangesBtn) {
    this.addEventListener(saveQuestChangesBtn, 'click', () => {
        this.handleSaveQuestChanges();
    });
}
```

- [ ] **Step 3: Replace `openQuestEditDrawer()` method body**

Replace the `openQuestEditDrawer(quest)` method (lines 1737-1746) with:

```js
openQuestEditDrawer(quest) {
    this.drawerManager.open('quest-edit');
}
```

Note: the `quest` parameter is no longer used in this method — the form is populated by `populateQuestEditDrawer(quest)` which is called before this method. The parameter stays for API compatibility.

- [ ] **Step 4: Replace `closeQuestEditDrawer()` method body**

Replace the `closeQuestEditDrawer()` method (lines 1748-1765) with:

```js
closeQuestEditDrawer() {
    this.drawerManager.close('quest-edit');
}
```

The book selector cleanup and `editingQuestInfo = null` logic moved to `onAfterClose`.

- [ ] **Step 5: Run full test suite**

Run: `npx jest --verbose 2>&1 | tail -20`
Expected: All tests pass

- [ ] **Step 6: Commit**

```
refactor: migrate quest edit drawer to DrawerManager
```

---

### Task 5: Migrate Book Edit drawer (LibraryController)

**Files:**
- Modify: `assets/js/controllers/LibraryController.js:1,38-92,567-581`

Similar to Quest Edit: cancel button, `onAfterClose` clears `_editingBookId`. Form populated before open.

- [ ] **Step 1: Add DrawerManager import**

At the top of `assets/js/controllers/LibraryController.js`, add after the existing imports (after line 12):

```js
import { DrawerManager } from '../ui/DrawerManager.js';
```

- [ ] **Step 2: Create DrawerManager instance and wire cancel button in `initialize()`**

In `LibraryController.initialize()`, find the book edit drawer setup (around lines 38-92). Replace the manual drawer wiring. Keep the `saveBookEditBtn` handler (line 82) and the book edit cover/search handlers (lines 85-86).

Replace lines 38-92 (from `const bookEditDrawer` through the Escape key handler) with:

```js
const saveBookEditBtn = document.getElementById('save-book-edit-btn');
const cancelBookEditBtn = document.getElementById('cancel-book-edit-btn');

this.drawerManager = new DrawerManager({
    'book-edit': {
        backdrop: 'book-edit-backdrop',
        drawer: 'book-edit-drawer',
        closeBtn: 'close-book-edit',
        onAfterClose: (drawerEl) => {
            this._editingBookId = null;
        }
    }
});

if (cancelBookEditBtn) {
    this.addEventListener(cancelBookEditBtn, 'click', () => this.drawerManager.close('book-edit'));
}
if (saveBookEditBtn) {
    this.addEventListener(saveBookEditBtn, 'click', () => this.handleSaveBookEdit());
}

this._setupBookEditCoverHandlers();
this._setupBookEditSearch();
```

- [ ] **Step 3: Replace open logic in `handleEditBook()`**

In `handleEditBook()`, find the lines at the end that manually show the drawer (around lines 567-571). Replace:

```js
const drawer = document.getElementById('book-edit-drawer');
const backdrop = document.getElementById('book-edit-backdrop');
if (drawer) drawer.style.display = 'flex';
if (backdrop) backdrop.classList.add('active');
document.body.style.overflow = 'hidden';
```

with:

```js
this.drawerManager.open('book-edit');
```

- [ ] **Step 4: Replace `_closeBookEditDrawer()` method body**

Replace the `_closeBookEditDrawer()` method (lines 574-581) with:

```js
_closeBookEditDrawer() {
    this.drawerManager.close('book-edit');
}
```

The `_editingBookId = null` logic moved to `onAfterClose`.

- [ ] **Step 5: Run full test suite**

Run: `npx jest --verbose 2>&1 | tail -20`
Expected: All tests pass

- [ ] **Step 6: Commit**

```
refactor: migrate book edit drawer to DrawerManager
```

---

### Task 6: Migrate Table Overlay (character-sheet.js)

**Files:**
- Modify: `assets/js/character-sheet.js:905-1276`

This is the most complex migration. The Table Overlay uses `displayStyle: 'block'` and has substantial domain logic in `openTableOverlay(tableId)` that becomes the `onBeforeOpen` hook. It also has an extra "click outside content" handler on `overlayPanel` that is functionally redundant with backdrop click — we drop it.

The tricky part: `openTableOverlay(tableId)` takes a `tableId` parameter but DrawerManager's `onBeforeOpen` only receives the drawer element. We solve this by storing the current `tableId` in a closure variable before calling `open()`.

- [ ] **Step 1: Identify the integration point**

The `initializeRollingTables()` function (line 907) is an `async function` that imports modules and sets up the overlay. The DrawerManager instance will be created inside this function after the existing element lookups (around line 934).

- [ ] **Step 2: Add DrawerManager import**

At the top of `assets/js/character-sheet.js`, there should already be an import for DrawerManager (added in k8j). Verify this line exists:

```js
import { DrawerManager } from './ui/DrawerManager.js';
```

If it exists, no change needed. If not, add it.

- [ ] **Step 3: Create DrawerManager instance inside `initializeRollingTables()`**

After line 934 (`if (!overlayPanel || !overlayContent) return;`), add a closure variable and the DrawerManager instance:

```js
let pendingTableId = null;

const tableOverlayManager = new DrawerManager({
    'table-overlay': {
        backdrop: 'table-overlay-backdrop',
        drawer: 'table-overlay-panel',
        closeBtn: 'close-table-overlay',
        displayStyle: 'block',
        onBeforeOpen: (drawerEl) => {
            const tableId = pendingTableId;
            if (!tableId) return;

            let tableHtml = '';
            let title = tableTitles[tableId] || 'Rolling Table';
            let showGenreSelection = false;

            switch (tableId) {
                case 'genre-quests':
                    tableHtml = processLinks(renderSelectedGenresTable());
                    showGenreSelection = true;
                    break;
                case 'atmospheric-buffs':
                    tableHtml = processLinks(renderAtmosphericBuffsTable());
                    break;
                case 'side-quests':
                    tableHtml = processLinks(renderSideQuestsTable());
                    break;
                case 'dungeon-rooms':
                    tableHtml = processLinks(renderDungeonRoomsTable());
                    break;
                default:
                    return;
            }

            let contentHtml = `
                <div class="table-overlay-header">
                    <h2>${title}</h2>
                </div>
                <div class="table-overlay-body">
                    ${tableHtml}
                </div>
            `;

            if (showGenreSelection) {
                contentHtml += renderGenreSelectionUI();
            }

            overlayContent.innerHTML = contentHtml;

            if (showGenreSelection) {
                setupGenreSelectionListeners();
            }
        }
    }
});
```

- [ ] **Step 4: Replace `openTableOverlay()` function**

Replace the entire `openTableOverlay(tableId)` function (lines 1022-1073) with:

```js
function openTableOverlay(tableId) {
    pendingTableId = tableId;
    tableOverlayManager.open('table-overlay');
}
```

- [ ] **Step 5: Delete `closeTableOverlay()` and manual event listeners**

Delete the following code (lines 1233-1275):
- The `closeTableOverlay()` function (lines 1233-1240)
- The close button listener setup (lines 1253-1256)
- The backdrop click listener (lines 1259-1261)
- The outer panel click handler (lines 1264-1268)
- The Escape key handler (lines 1271-1275)

Keep the open button wiring (lines 1242-1251) — those call `openTableOverlay(tableId)` which still exists.

- [ ] **Step 6: Update close references**

Search for any remaining references to `closeTableOverlay` in `initializeRollingTables()`. If any exist (e.g., in genre selection listeners), replace them with:

```js
tableOverlayManager.close('table-overlay')
```

- [ ] **Step 7: Run full test suite**

Run: `npx jest --verbose 2>&1 | tail -20`
Expected: All tests pass

- [ ] **Step 8: Commit**

```
refactor: migrate table overlay to DrawerManager
```

---

### Task 7: Final verification

- [ ] **Step 1: Run full test suite**

Run: `npx jest --verbose 2>&1 | tail -10`
Expected: All tests pass, no regressions

- [ ] **Step 2: Manual browser verification**

Open the character sheet in a browser and verify each drawer:

1. **Leveling Rewards**: Click the leveling rewards button. Drawer opens with rewards table. Escape closes it. Backdrop click closes it. Close button closes it.
2. **School Mastery**: Click school mastery button. Drawer opens with abilities. All close methods work.
3. **Quest Edit**: Click edit on a quest. Drawer opens with populated form. Cancel button closes it. Close button closes it. Escape closes it. Verify book selector is cleaned up on close.
4. **Book Edit**: Click edit on a book. Drawer opens with populated form. Cancel button closes it. All close methods work.
5. **Table Overlay**: Click a rolling table button. Overlay opens with `display: block`. Genre selection works (add/remove genres). All close methods work.
6. **Quest Info Drawers** (regression check): Open any quest info drawer. Verify it still works correctly.

- [ ] **Step 3: Commit any fixes if needed**
