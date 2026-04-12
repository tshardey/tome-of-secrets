# DrawerManager Extraction — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract reusable drawer open/close infrastructure from `character-sheet.js` into `assets/js/ui/DrawerManager.js`, then refactor `initializeQuestInfoDrawers()` to use it.

**Architecture:** A `DrawerManager` class owns the generic open/close lifecycle (backdrop, Escape, scroll lock). Domain-specific rendering stays in `character-sheet.js` via `onBeforeOpen`/`onAfterClose` lifecycle hooks passed in config. The table overlay system is not in scope for this plan — it can adopt DrawerManager in a follow-up.

**Tech Stack:** Vanilla JS (ES modules), Jest + jsdom for tests

**Spec:** `docs/superpowers/specs/2026-04-12-drawer-manager-design.md`

---

### Task 1: DrawerManager — Core open/close with tests

**Files:**
- Create: `assets/js/ui/DrawerManager.js`
- Create: `tests/DrawerManager.test.js`

- [ ] **Step 1: Write failing tests for core open/close behavior**

Create `tests/DrawerManager.test.js`:

```js
/**
 * @jest-environment jsdom
 */

import { DrawerManager } from '../assets/js/ui/DrawerManager.js';

function createDrawerDOM(id) {
    const backdrop = document.createElement('div');
    backdrop.id = `${id}-backdrop`;
    document.body.appendChild(backdrop);

    const drawer = document.createElement('div');
    drawer.id = `${id}-drawer`;
    drawer.style.display = 'none';
    document.body.appendChild(drawer);

    const closeBtn = document.createElement('button');
    closeBtn.id = `close-${id}`;
    drawer.appendChild(closeBtn);

    return { backdrop, drawer, closeBtn };
}

describe('DrawerManager', () => {
    let manager;

    afterEach(() => {
        if (manager) manager.destroy();
        document.body.innerHTML = '';
        document.body.style.overflow = '';
    });

    describe('open and close', () => {
        it('should open a drawer by showing it and activating backdrop', () => {
            createDrawerDOM('test');
            manager = new DrawerManager({
                test: { backdrop: 'test-backdrop', drawer: 'test-drawer', closeBtn: 'close-test' }
            });

            manager.open('test');

            expect(document.getElementById('test-drawer').style.display).toBe('flex');
            expect(document.getElementById('test-backdrop').classList.contains('active')).toBe(true);
            expect(document.body.style.overflow).toBe('hidden');
        });

        it('should close a drawer by hiding it and deactivating backdrop', () => {
            createDrawerDOM('test');
            manager = new DrawerManager({
                test: { backdrop: 'test-backdrop', drawer: 'test-drawer', closeBtn: 'close-test' }
            });

            manager.open('test');
            manager.close('test');

            expect(document.getElementById('test-drawer').style.display).toBe('none');
            expect(document.getElementById('test-backdrop').classList.contains('active')).toBe(false);
            expect(document.body.style.overflow).toBe('');
        });

        it('should do nothing when opening an unknown drawer id', () => {
            manager = new DrawerManager({});
            manager.open('nonexistent');
            expect(document.body.style.overflow).toBe('');
        });

        it('should do nothing when closing an unknown drawer id', () => {
            manager = new DrawerManager({});
            manager.close('nonexistent');
            expect(document.body.style.overflow).toBe('');
        });
    });

    describe('isOpen', () => {
        it('should return true when drawer is open', () => {
            createDrawerDOM('test');
            manager = new DrawerManager({
                test: { backdrop: 'test-backdrop', drawer: 'test-drawer', closeBtn: 'close-test' }
            });

            manager.open('test');
            expect(manager.isOpen('test')).toBe(true);
        });

        it('should return false when drawer is closed', () => {
            createDrawerDOM('test');
            manager = new DrawerManager({
                test: { backdrop: 'test-backdrop', drawer: 'test-drawer', closeBtn: 'close-test' }
            });

            expect(manager.isOpen('test')).toBe(false);
        });

        it('should return false for unknown drawer id', () => {
            manager = new DrawerManager({});
            expect(manager.isOpen('nonexistent')).toBe(false);
        });
    });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /workspaces/tome-of-secrets/tests && npx jest DrawerManager.test.js --verbose`

Expected: FAIL — cannot resolve `../assets/js/ui/DrawerManager.js`

- [ ] **Step 3: Implement DrawerManager core**

Create `assets/js/ui/DrawerManager.js`:

```js
/**
 * DrawerManager — Reusable drawer/overlay open-close infrastructure.
 *
 * Manages backdrop, scroll lock, close-button, backdrop-click, and Escape-key
 * behavior for any number of named drawer panels.  Domain-specific rendering
 * is handled by callers via onBeforeOpen / onAfterClose lifecycle hooks.
 *
 * Config shape per drawer:
 *   backdrop      : string  — DOM id of backdrop element
 *   drawer        : string  — DOM id of drawer element
 *   closeBtn      : string  — DOM id of close button (optional)
 *   onBeforeOpen  : (drawerEl: HTMLElement) => void  (optional)
 *   onAfterClose  : (drawerEl: HTMLElement) => void  (optional)
 */
export class DrawerManager {
    /** @param {Object<string, object>} config */
    constructor(config) {
        this._config = config;
        this._activeDrawerId = null;
        // Resolved DOM element cache (lazy, per drawer id)
        this._elements = {};

        // Bound handlers for cleanup
        this._onEscape = (e) => {
            if (e.key === 'Escape' && this._activeDrawerId) {
                this.close(this._activeDrawerId);
            }
        };
        document.addEventListener('keydown', this._onEscape);

        // Wire close-button and backdrop-click for each drawer
        this._backdropHandlers = {};
        this._closeBtnHandlers = {};
        Object.keys(config).forEach((id) => this._wireCloseListeners(id));
    }

    // --- Public API ---

    open(drawerId) {
        const els = this._resolve(drawerId);
        if (!els) return;

        // Close any currently-open drawer first
        if (this._activeDrawerId && this._activeDrawerId !== drawerId) {
            this.close(this._activeDrawerId);
        }

        const cfg = this._config[drawerId];
        if (cfg.onBeforeOpen) cfg.onBeforeOpen(els.drawer);

        els.drawer.style.display = 'flex';
        els.backdrop.classList.add('active');
        document.body.style.overflow = 'hidden';
        this._activeDrawerId = drawerId;
    }

    close(drawerId) {
        const els = this._resolve(drawerId);
        if (!els) return;

        els.drawer.style.display = 'none';
        els.backdrop.classList.remove('active');
        document.body.style.overflow = '';

        if (this._activeDrawerId === drawerId) {
            this._activeDrawerId = null;
        }

        const cfg = this._config[drawerId];
        if (cfg.onAfterClose) cfg.onAfterClose(els.drawer);
    }

    closeAll() {
        if (this._activeDrawerId) {
            this.close(this._activeDrawerId);
        }
    }

    isOpen(drawerId) {
        return this._activeDrawerId === drawerId;
    }

    destroy() {
        document.removeEventListener('keydown', this._onEscape);

        Object.keys(this._config).forEach((id) => {
            const els = this._elements[id];
            if (!els) return;
            if (this._backdropHandlers[id]) {
                els.backdrop.removeEventListener('click', this._backdropHandlers[id]);
            }
            if (this._closeBtnHandlers[id] && els.closeBtn) {
                els.closeBtn.removeEventListener('click', this._closeBtnHandlers[id]);
            }
        });

        this._elements = {};
        this._activeDrawerId = null;
    }

    // --- Internal ---

    _resolve(drawerId) {
        if (this._elements[drawerId]) return this._elements[drawerId];

        const cfg = this._config[drawerId];
        if (!cfg) return null;

        const backdrop = document.getElementById(cfg.backdrop);
        const drawer = document.getElementById(cfg.drawer);
        if (!backdrop || !drawer) return null;

        const closeBtn = cfg.closeBtn ? document.getElementById(cfg.closeBtn) : null;

        this._elements[drawerId] = { backdrop, drawer, closeBtn };
        return this._elements[drawerId];
    }

    _wireCloseListeners(drawerId) {
        // Defer wiring until elements are resolvable.
        // We resolve lazily on first open(), so wire in open() if needed.
        // However, elements may already be in the DOM at construction time.
        const els = this._resolve(drawerId);
        if (!els) return;

        this._backdropHandlers[drawerId] = () => this.close(drawerId);
        els.backdrop.addEventListener('click', this._backdropHandlers[drawerId]);

        if (els.closeBtn) {
            this._closeBtnHandlers[drawerId] = () => this.close(drawerId);
            els.closeBtn.addEventListener('click', this._closeBtnHandlers[drawerId]);
        }
    }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd /workspaces/tome-of-secrets/tests && npx jest DrawerManager.test.js --verbose`

Expected: PASS — all 7 tests green

- [ ] **Step 5: Commit**

```
feat: add DrawerManager core with open/close/isOpen

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
```

---

### Task 2: DrawerManager — Single-drawer constraint, closeAll, lifecycle hooks

**Files:**
- Modify: `tests/DrawerManager.test.js`
- (No changes to `DrawerManager.js` — these behaviors are already implemented, just need test coverage)

- [ ] **Step 1: Add tests for single-drawer constraint and closeAll**

Append to `tests/DrawerManager.test.js` inside the outer `describe('DrawerManager', ...)`:

```js
    describe('single-drawer constraint', () => {
        it('should close the current drawer when opening a different one', () => {
            createDrawerDOM('alpha');
            createDrawerDOM('beta');
            manager = new DrawerManager({
                alpha: { backdrop: 'alpha-backdrop', drawer: 'alpha-drawer', closeBtn: 'close-alpha' },
                beta: { backdrop: 'beta-backdrop', drawer: 'beta-drawer', closeBtn: 'close-beta' }
            });

            manager.open('alpha');
            manager.open('beta');

            expect(document.getElementById('alpha-drawer').style.display).toBe('none');
            expect(document.getElementById('alpha-backdrop').classList.contains('active')).toBe(false);
            expect(document.getElementById('beta-drawer').style.display).toBe('flex');
            expect(document.getElementById('beta-backdrop').classList.contains('active')).toBe(true);
            expect(manager.isOpen('alpha')).toBe(false);
            expect(manager.isOpen('beta')).toBe(true);
        });

        it('should not re-close when opening the same drawer that is already open', () => {
            const onAfterClose = jest.fn();
            createDrawerDOM('test');
            manager = new DrawerManager({
                test: { backdrop: 'test-backdrop', drawer: 'test-drawer', closeBtn: 'close-test', onAfterClose }
            });

            manager.open('test');
            manager.open('test');

            expect(onAfterClose).not.toHaveBeenCalled();
            expect(manager.isOpen('test')).toBe(true);
        });
    });

    describe('closeAll', () => {
        it('should close the active drawer', () => {
            createDrawerDOM('test');
            manager = new DrawerManager({
                test: { backdrop: 'test-backdrop', drawer: 'test-drawer', closeBtn: 'close-test' }
            });

            manager.open('test');
            manager.closeAll();

            expect(manager.isOpen('test')).toBe(false);
            expect(document.getElementById('test-drawer').style.display).toBe('none');
        });

        it('should do nothing when no drawer is open', () => {
            manager = new DrawerManager({});
            manager.closeAll(); // should not throw
        });
    });

    describe('lifecycle hooks', () => {
        it('should call onBeforeOpen with the drawer element', () => {
            const onBeforeOpen = jest.fn();
            createDrawerDOM('test');
            manager = new DrawerManager({
                test: { backdrop: 'test-backdrop', drawer: 'test-drawer', closeBtn: 'close-test', onBeforeOpen }
            });

            manager.open('test');

            expect(onBeforeOpen).toHaveBeenCalledTimes(1);
            expect(onBeforeOpen).toHaveBeenCalledWith(document.getElementById('test-drawer'));
        });

        it('should call onBeforeOpen before the drawer becomes visible', () => {
            let displayAtCallTime;
            createDrawerDOM('test');
            manager = new DrawerManager({
                test: {
                    backdrop: 'test-backdrop',
                    drawer: 'test-drawer',
                    closeBtn: 'close-test',
                    onBeforeOpen: (el) => { displayAtCallTime = el.style.display; }
                }
            });

            manager.open('test');

            expect(displayAtCallTime).toBe('none');
        });

        it('should call onAfterClose with the drawer element', () => {
            const onAfterClose = jest.fn();
            createDrawerDOM('test');
            manager = new DrawerManager({
                test: { backdrop: 'test-backdrop', drawer: 'test-drawer', closeBtn: 'close-test', onAfterClose }
            });

            manager.open('test');
            manager.close('test');

            expect(onAfterClose).toHaveBeenCalledTimes(1);
            expect(onAfterClose).toHaveBeenCalledWith(document.getElementById('test-drawer'));
        });

        it('should call onAfterClose after the drawer is hidden', () => {
            let displayAtCallTime;
            createDrawerDOM('test');
            manager = new DrawerManager({
                test: {
                    backdrop: 'test-backdrop',
                    drawer: 'test-drawer',
                    closeBtn: 'close-test',
                    onAfterClose: (el) => { displayAtCallTime = el.style.display; }
                }
            });

            manager.open('test');
            manager.close('test');

            expect(displayAtCallTime).toBe('none');
        });
    });
```

- [ ] **Step 2: Run tests to verify they pass**

Run: `cd /workspaces/tome-of-secrets/tests && npx jest DrawerManager.test.js --verbose`

Expected: PASS — all tests green (lifecycle hooks and single-drawer constraint are already implemented)

- [ ] **Step 3: Commit**

```
test: add DrawerManager coverage for closeAll, single-drawer, lifecycle hooks

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
```

---

### Task 3: DrawerManager — Escape key, backdrop click, close button, destroy

**Files:**
- Modify: `tests/DrawerManager.test.js`

- [ ] **Step 1: Add tests for Escape key, backdrop click, close button, and destroy**

Append to `tests/DrawerManager.test.js` inside the outer `describe('DrawerManager', ...)`:

```js
    describe('Escape key', () => {
        it('should close the active drawer on Escape', () => {
            createDrawerDOM('test');
            manager = new DrawerManager({
                test: { backdrop: 'test-backdrop', drawer: 'test-drawer', closeBtn: 'close-test' }
            });

            manager.open('test');
            document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));

            expect(manager.isOpen('test')).toBe(false);
            expect(document.getElementById('test-drawer').style.display).toBe('none');
        });

        it('should do nothing on Escape when no drawer is open', () => {
            createDrawerDOM('test');
            manager = new DrawerManager({
                test: { backdrop: 'test-backdrop', drawer: 'test-drawer', closeBtn: 'close-test' }
            });

            document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
            expect(manager.isOpen('test')).toBe(false);
        });
    });

    describe('backdrop click', () => {
        it('should close the drawer when backdrop is clicked', () => {
            createDrawerDOM('test');
            manager = new DrawerManager({
                test: { backdrop: 'test-backdrop', drawer: 'test-drawer', closeBtn: 'close-test' }
            });

            manager.open('test');
            document.getElementById('test-backdrop').click();

            expect(manager.isOpen('test')).toBe(false);
            expect(document.getElementById('test-drawer').style.display).toBe('none');
        });
    });

    describe('close button', () => {
        it('should close the drawer when close button is clicked', () => {
            createDrawerDOM('test');
            manager = new DrawerManager({
                test: { backdrop: 'test-backdrop', drawer: 'test-drawer', closeBtn: 'close-test' }
            });

            manager.open('test');
            document.getElementById('close-test').click();

            expect(manager.isOpen('test')).toBe(false);
            expect(document.getElementById('test-drawer').style.display).toBe('none');
        });

        it('should work without a closeBtn configured', () => {
            createDrawerDOM('test');
            manager = new DrawerManager({
                test: { backdrop: 'test-backdrop', drawer: 'test-drawer' }
            });

            manager.open('test');
            expect(manager.isOpen('test')).toBe(true);

            manager.close('test');
            expect(manager.isOpen('test')).toBe(false);
        });
    });

    describe('destroy', () => {
        it('should stop responding to Escape after destroy', () => {
            createDrawerDOM('test');
            manager = new DrawerManager({
                test: { backdrop: 'test-backdrop', drawer: 'test-drawer', closeBtn: 'close-test' }
            });

            manager.open('test');
            manager.destroy();

            // Re-open manually to test Escape no longer works
            const drawer = document.getElementById('test-drawer');
            drawer.style.display = 'flex';

            document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
            // Drawer stays visible because manager is destroyed
            expect(drawer.style.display).toBe('flex');
        });

        it('should stop responding to backdrop click after destroy', () => {
            createDrawerDOM('test');
            manager = new DrawerManager({
                test: { backdrop: 'test-backdrop', drawer: 'test-drawer', closeBtn: 'close-test' }
            });

            manager.destroy();

            // Manually show drawer
            const drawer = document.getElementById('test-drawer');
            drawer.style.display = 'flex';

            document.getElementById('test-backdrop').click();
            expect(drawer.style.display).toBe('flex');
        });
    });

    describe('lazy DOM resolution', () => {
        it('should resolve elements lazily on first open', () => {
            // Create manager before DOM elements exist
            manager = new DrawerManager({
                lazy: { backdrop: 'lazy-backdrop', drawer: 'lazy-drawer' }
            });

            // Elements don't exist yet — open should be a no-op
            manager.open('lazy');
            expect(manager.isOpen('lazy')).toBe(false);

            // Now add elements to the DOM
            createDrawerDOM('lazy');

            // Open should work now
            manager.open('lazy');
            expect(manager.isOpen('lazy')).toBe(true);
            expect(document.getElementById('lazy-drawer').style.display).toBe('flex');
        });
    });
```

- [ ] **Step 2: Run tests to verify they pass**

Run: `cd /workspaces/tome-of-secrets/tests && npx jest DrawerManager.test.js --verbose`

Expected: PASS — all tests green

- [ ] **Step 3: Commit**

```
test: add DrawerManager coverage for Escape, backdrop, close button, destroy, lazy resolution

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
```

---

### Task 4: Refactor character-sheet.js to use DrawerManager

**Files:**
- Modify: `assets/js/character-sheet.js` (lines 1277-1736)

This is the integration step. The `initializeQuestInfoDrawers()` function keeps all its domain logic (genre selection UI, dungeon reward draws, table rendering) but delegates open/close mechanics to DrawerManager.

- [ ] **Step 1: Run the existing test suite to establish a green baseline**

Run: `cd /workspaces/tome-of-secrets/tests && npx jest --verbose 2>&1 | tail -20`

Expected: All existing tests pass. Record the count.

- [ ] **Step 2: Add DrawerManager import to character-sheet.js**

At the top of `character-sheet.js`, after the existing UI import (line 21, `import { toast } ...`), add:

```js
import { DrawerManager } from './ui/DrawerManager.js';
```

- [ ] **Step 3: Replace drawer open/close implementation with DrawerManager**

Replace the `initializeQuestInfoDrawers` function (lines 1278-1736) with a version that:
1. Keeps all the existing imports, helper functions (`processLinksHelper`, `renderSelectedGenresTable`, `renderGenreSelectionUI`, `setupGenreSelectionListenersDrawer`)
2. Keeps the existing `drawerConfig` object
3. Replaces the manual `openDrawer`/`closeDrawer` functions with a `DrawerManager` instance
4. Moves domain-specific rendering into `onBeforeOpen` hooks
5. Moves genre UI cleanup into `onAfterClose` hook for genre-quests
6. Removes the manual open-button wiring, close-button wiring, backdrop-click wiring, and Escape-key handler (DrawerManager handles all of these)
7. Keeps the dungeon delegated click handler as-is (it's domain logic, not drawer mechanics)

The refactored function body after the existing helper functions and `drawerConfig` definition:

```js
    // Build DrawerManager config from drawerConfig
    const managerConfig = {};
    Object.keys(drawerConfig).forEach(drawerId => {
        const cfg = drawerConfig[drawerId];
        managerConfig[drawerId] = {
            backdrop: cfg.backdrop,
            drawer: cfg.drawer,
            closeBtn: cfg.closeBtn,
            onBeforeOpen: (drawerEl) => {
                if (cfg.preRendered) {
                    // Content already in the HTML
                } else if (drawerId === 'dungeons') {
                    const tables = cfg.renderTables();
                    const rewardsContainer = document.getElementById(cfg.containers.rewards);
                    const roomsContainer = document.getElementById(cfg.containers.rooms);
                    const completionContainer = document.getElementById(cfg.containers.completion);
                    if (rewardsContainer) rewardsContainer.innerHTML = tables.rewards;
                    if (roomsContainer) roomsContainer.innerHTML = tables.rooms;
                    if (completionContainer) completionContainer.innerHTML = tables.completion;
                    if (cfg.updateDrawsUI) cfg.updateDrawsUI(drawerEl);
                } else if (drawerId === 'genre-quests') {
                    const container = document.getElementById(cfg.container);
                    if (container) {
                        container.innerHTML = cfg.renderTable();
                        const existingGenreUI = drawerEl.querySelector('.genre-selection-overlay-section');
                        if (existingGenreUI) existingGenreUI.remove();
                        if (cfg.renderGenreUI) {
                            container.insertAdjacentHTML('afterend', cfg.renderGenreUI());
                        }
                        if (cfg.setupGenreListeners) {
                            const drawerBody = drawerEl.querySelector('.info-drawer-body');
                            if (drawerBody) cfg.setupGenreListeners(drawerBody);
                        }
                    }
                } else {
                    const container = document.getElementById(cfg.container);
                    if (container) container.innerHTML = cfg.renderTable();
                }
            },
            onAfterClose: drawerId === 'genre-quests'
                ? (drawerEl) => {
                    const genreUI = drawerEl.querySelector('.genre-selection-overlay-section');
                    if (genreUI) genreUI.remove();
                }
                : undefined
        };
    });

    const drawerManager = new DrawerManager(managerConfig);

    // Wire open buttons (data-drawer attribute maps to drawer id)
    const openButtons = document.querySelectorAll('.open-quest-info-drawer-btn');
    openButtons.forEach(button => {
        button.addEventListener('click', () => {
            const drawerId = button.dataset.drawer;
            if (drawerId) drawerManager.open(drawerId);
        });
    });

    // Dungeons drawer: domain-specific delegated click handler (claim reward + draw card)
    // ... (keep existing dungeonsDrawer click handler unchanged, lines 1632-1723)
```

The key deletions from the old code:
- The manual `openDrawer(drawerId)` function (lines 1529-1583)
- The manual `closeDrawer(drawerId)` function (lines 1585-1604)
- The close-button/backdrop wiring loop (lines 1618-1630)
- The Escape key handler (lines 1726-1735)

- [ ] **Step 4: Run the full test suite**

Run: `cd /workspaces/tome-of-secrets/tests && npx jest --verbose 2>&1 | tail -30`

Expected: PASS — same count as baseline. No regressions.

- [ ] **Step 5: Commit**

```
refactor: use DrawerManager in initializeQuestInfoDrawers

Replace manual open/close/backdrop/Escape implementation with
DrawerManager instance. Domain-specific rendering logic preserved
via onBeforeOpen/onAfterClose lifecycle hooks.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
```

---

### Task 5: Manual verification

**Files:** None — browser testing only

- [ ] **Step 1: Serve the site locally**

Run: `cd /workspaces/tome-of-secrets && bundle exec jekyll serve` (or whatever the local dev server command is)

- [ ] **Step 2: Verify all 7 drawers open and close correctly**

Open the character sheet page and test each drawer:
1. Genre Quests — open, verify table renders, add/remove genres, close via close button
2. Atmospheric Buffs — open, verify table renders, close via backdrop click
3. Side Quests — open, verify table renders, close via Escape key
4. Keeper Backgrounds — open (pre-rendered content), close
5. Wizard Schools — open (pre-rendered content), close
6. Library Sanctums — open (pre-rendered content), close
7. Dungeons — open, verify rooms/rewards/completion tables, test claim reward button, test draw card button, close

- [ ] **Step 3: Verify single-drawer constraint**

Open Genre Quests drawer, then click open on Atmospheric Buffs — Genre Quests should close automatically.

- [ ] **Step 4: Verify Escape key works**

Open any drawer, press Escape — should close.

- [ ] **Step 5: Verify scroll lock**

Open any drawer — page body should not scroll. Close — scrolling should restore.
