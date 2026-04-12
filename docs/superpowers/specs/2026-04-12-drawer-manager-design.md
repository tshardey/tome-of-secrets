# DrawerManager Extraction — Design Spec

**Bead:** tome-of-secrets-k8j — Incremental migration to reduce character sheet rework  
**Date:** 2026-04-12  
**Scope:** Extract reusable drawer/overlay open-close infrastructure from `character-sheet.js` into `assets/js/ui/DrawerManager.js`

## Problem

`character-sheet.js` lines 1278-1736 contain `initializeQuestInfoDrawers()`, a 460-line async function that mixes reusable drawer mechanics (open, close, backdrop, Escape) with domain-specific rendering and interaction logic (genre selection UI, dungeon reward draws). The table overlay system (lines 1130-1275) duplicates the same open/close/backdrop/Escape pattern independently.

This coupling blocks downstream beads that need drawer infrastructure without the domain logic.

## Solution

Create `DrawerManager` — a class that owns the open/close lifecycle for drawer panels. Domain-specific content rendering stays in `character-sheet.js` via lifecycle hooks.

## API

```js
// assets/js/ui/DrawerManager.js

class DrawerManager {
  /**
   * @param {Object<string, DrawerConfig>} config
   *
   * DrawerConfig shape:
   *   backdrop: string     — DOM id of backdrop element
   *   drawer: string       — DOM id of drawer element
   *   closeBtn: string     — DOM id of close button (optional, falls back to data-attr query)
   *   onBeforeOpen: (drawerEl: HTMLElement) => void   — optional
   *   onAfterClose: (drawerEl: HTMLElement) => void   — optional
   */
  constructor(config)

  open(drawerId)       // show drawer + backdrop, lock scroll, fire onBeforeOpen
  close(drawerId)      // hide drawer + backdrop, restore scroll, fire onAfterClose
  closeAll()           // close whichever drawer is currently open
  isOpen(drawerId)     // returns boolean
  destroy()            // remove all event listeners (for cleanup/testing)
}
```

## Behavior

- **Single-drawer constraint:** Only one drawer open at a time. Calling `open()` while another is open closes the previous first.
- **Escape key:** Closes the active drawer.
- **Backdrop click:** Closes the active drawer.
- **Scroll lock:** `body.style.overflow` set to `'hidden'` on open, restored to `''` on close.
- **Lazy DOM resolution:** Element references resolved on first `open()` call, not at construction. Supports async-loaded HTML.
- **Open/close buttons:** `DrawerManager` auto-wires `click` listeners on:
  - Elements with `data-drawer` attribute matching a config key (open buttons via `.open-quest-info-drawer-btn` selector)
  - The configured `closeBtn` element

## Integration in character-sheet.js

`initializeQuestInfoDrawers()` changes from implementing open/close mechanics to only:

1. Building the `drawerConfig` with domain-specific `onBeforeOpen` hooks (render tables, set up genre listeners, update dungeon draws UI)
2. Building the `drawerConfig` with domain-specific `onAfterClose` hooks (clean up genre selection UI)
3. Instantiating `new DrawerManager(config)`
4. Wiring domain-specific delegated click handlers on dungeon drawer (claim reward, draw card)

The table overlay system can also adopt `DrawerManager` with its own config entry, eliminating the duplicate open/close/backdrop/Escape code.

## Files Changed

| File | Change |
|------|--------|
| `assets/js/ui/DrawerManager.js` | New — ~120 lines |
| `assets/js/character-sheet.js` | Refactor `initializeQuestInfoDrawers()` to use DrawerManager. Remove open/close/backdrop/Escape implementation. Net reduction ~150 lines |
| `tests/DrawerManager.test.js` | New — unit tests for open/close/Escape/backdrop/lifecycle hooks |

## What Does NOT Change

- HTML structure in `character-sheet.md` — no markup changes
- Domain-specific rendering logic (genre tables, dungeon rewards, atmospheric buffs) — stays in character-sheet.js
- Other controllers — no changes
- CSS — no changes

## Testing

- Unit tests for DrawerManager: open/close state, Escape handling, backdrop click, lifecycle hooks, single-drawer constraint, destroy cleanup
- Manual verification: all 7 existing drawers open/close correctly, genre selection still works, dungeon reward draws still work, table overlay still works
