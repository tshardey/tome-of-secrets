# s0r: Migrate Remaining Drawers to DrawerManager — Design Spec

**Bead:** tome-of-secrets-s0r — Extract reusable drawer/overlay UI infrastructure
**Date:** 2026-04-12
**Scope:** Migrate 5 remaining manual drawer/overlay systems to use the existing `DrawerManager` class

## Problem

After k8j created `DrawerManager` and migrated the quest info drawers, 5 other drawer systems still manually duplicate the same open/close/backdrop/Escape pattern. Each independently implements backdrop toggling, scroll lock, Escape key handling, backdrop click, and close button wiring.

## Drawers to Migrate

| Drawer | File | Open method | Close method |
|--------|------|------------|-------------|
| Table Overlay | `assets/js/character-sheet.js` (lines 905-1276) | `openTableOverlay(tableId)` | `closeTableOverlay()` |
| Quest Edit | `assets/js/controllers/QuestController.js` | `openQuestEditDrawer(quest)` | `closeQuestEditDrawer()` |
| Book Edit | `assets/js/controllers/LibraryController.js` | `handleEditBook(bookId)` | `_closeBookEditDrawer()` |
| Leveling Rewards | `assets/js/controllers/CharacterController.js` (lines 298-367) | `openLevelingRewardsDrawer()` | `closeLevelingRewardsDrawer()` |
| School Mastery | `assets/js/controllers/AbilityController.js` (lines 101-159) | `openSchoolMasteryDrawer()` | `closeSchoolMasteryDrawer()` |

## DrawerManager Change

Add an optional `displayStyle` config property:

```
displayStyle: string — CSS display value on open (default: 'flex')
```

The `open()` method changes from hardcoded `'flex'` to `cfg.displayStyle || 'flex'`. This supports the Table Overlay which uses `display: 'block'`.

## Migration Pattern

Each drawer follows the same migration:

1. Create a `DrawerManager` instance with config specifying `backdrop`, `drawer`, `closeBtn`, and lifecycle hooks
2. Replace the manual `open*()` method body with `this.drawerManager.open(id)` (plus any pre-open domain logic that must run before the hook)
3. Replace the manual `close*()` method body with `this.drawerManager.close(id)`
4. Delete: manual `style.display` toggling, `classList.add/remove('active')`, `body.style.overflow`, Escape listener, backdrop click listener, close button listener

## Per-Drawer Details

### Table Overlay (character-sheet.js)

- **Config:** `displayStyle: 'block'`, backdrop: `table-overlay-backdrop`, drawer: `table-overlay-panel`, closeBtn: `close-table-overlay`
- **onBeforeOpen:** Renders the selected table content (genre quests, atmospheric buffs, side quests, or dungeon rooms) into `#table-overlay-content`
- **onAfterClose:** None
- **Delete:** `closeTableOverlay()` function, backdrop/close/Escape listeners (lines 1253-1275), outer panel click handler (lines 1264-1268)
- **Note:** The overlay panel has an extra "click outside content" handler (`overlayPanel.addEventListener('click', ...)` that closes when clicking the panel but not its children). This is functionally identical to the backdrop click since the panel covers the viewport — removing it is safe.

### Quest Edit (QuestController.js)

- **Config:** backdrop: `quest-edit-backdrop`, drawer: `quest-edit-drawer`, closeBtn: `close-quest-edit`
- **onBeforeOpen:** None (form is populated by `openQuestEditDrawer(quest)` before calling `open()`)
- **onAfterClose:** Destroy book selector (`this._editDrawerBookSelector`), clear `this.editingQuestInfo`
- **Extra:** Cancel button (`cancel-quest-edit-btn`) wired as a regular click handler calling `this.drawerManager.close('quest-edit')`
- **Delete:** Manual backdrop/close/cancel/Escape listeners (lines 158-189), manual display/backdrop/overflow toggling in `openQuestEditDrawer` and `closeQuestEditDrawer`

### Book Edit (LibraryController.js)

- **Config:** backdrop: `book-edit-backdrop`, drawer: `book-edit-drawer`, closeBtn: `close-book-edit`
- **onBeforeOpen:** None (form is populated by `handleEditBook(bookId)` before calling `open()`)
- **onAfterClose:** Clear `this._editingBookId`
- **Extra:** Cancel button (`cancel-book-edit-btn`) wired as a regular click handler calling `this.drawerManager.close('book-edit')`
- **Delete:** Manual backdrop/close/cancel/Escape listeners (lines 72-92), manual display/backdrop/overflow toggling in `handleEditBook` and `_closeBookEditDrawer`

### Leveling Rewards (CharacterController.js)

- **Config:** backdrop: `leveling-rewards-backdrop`, drawer: `leveling-rewards-drawer`, closeBtn: `close-leveling-rewards`
- **onBeforeOpen:** Render leveling rewards table and permanent bonuses table
- **onAfterClose:** None
- **Delete:** Entire `openLevelingRewardsDrawer()` method body (replaced by `onBeforeOpen` hook + `this.drawerManager.open()`), entire `closeLevelingRewardsDrawer()` method body (replaced by `this.drawerManager.close()`), temporary event listeners (close button, backdrop, Escape) that were added/removed on each open/close cycle

### School Mastery (AbilityController.js)

- **Config:** backdrop: `school-mastery-backdrop`, drawer: `school-mastery-drawer`, closeBtn: `close-school-mastery`
- **onBeforeOpen:** Render school mastery abilities into content container
- **onAfterClose:** None
- **Delete:** Entire `openSchoolMasteryDrawer()` method body (replaced by `onBeforeOpen` hook + `this.drawerManager.open()`), entire `closeSchoolMasteryDrawer()` method body (replaced by `this.drawerManager.close()`), temporary event listeners

## What Does NOT Change

- HTML structure — no markup changes
- Domain-specific rendering logic — stays in each controller, moves into `onBeforeOpen`/`onAfterClose` hooks
- Public API of controllers — `openXDrawer()`/`closeXDrawer()` methods still exist, they just delegate to DrawerManager internally
- CSS — no changes
- Quest info drawers — already migrated in k8j

## Testing

- Add unit test for `displayStyle` config option in `DrawerManager.test.js`
- Manual verification: all 5 drawers open/close correctly, domain logic (form population, table rendering, book selector cleanup) still works
