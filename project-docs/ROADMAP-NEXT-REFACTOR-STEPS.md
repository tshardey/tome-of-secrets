# Tome of Secrets — Refactor Roadmap (Post Cloud Save)

This doc is a “pick it back up later” plan for continuing the transition from **Jekyll + localStorage** into a more game-like web app architecture **without** taking on full-time ops.

It assumes you’ll spend a few days/weeks validating Cloud Save in production first.

---

## Current state (what’s already done)

### Persistence
- **Large state moved to IndexedDB** (local-first) via `assets/js/character-sheet/persistence.js`.
- **State load/save became async** (`loadState`, `saveState`) and boot paths were updated accordingly.
- **Legacy localStorage remains** for small/shared keys (form data, monthly books, schema version, etc.).

### Cloud save (Supabase)
- Sidebar **Cloud Save** panel (magic link email auth).
- “Sync now” supports push/pull + conflict prompts.
- **Auto-sync**:
  - Auto-push when safe (no cloud changes since last sync).
  - Auto-pull when safe (local unchanged since last sync) — no forced reload.
- Hashing uses canonical key ordering to avoid “false diffs” from JSON key order.

### UX cleanups
- Removed the old **Data Management** (download/upload) section.

---

## Phase 0 — Production validation checklist (do this first)

### Cloud save correctness
- **First sync**:
  - New account/device: confirm you get the “choose pull vs push” dialog.
- **Conflict**:
  - Two devices make changes without syncing → confirm conflict prompt is accurate and choice is respected.
- **Auto-sync**:
  - Confirm “Last synced” updates.
  - Confirm auto-pull only happens when local is unchanged.

### Failure modes
- Offline behavior: UI messages should be understandable; no data loss.
- Rate limiting: avoid spamming magic-link sends; confirm error copy is understandable.

### Security
- Confirm Supabase table **RLS** policies are enabled and correct (see `SUPABASE-CLOUD-SAVE.md`).

---

## Phase 1 — Make “character info” truly local-first (no Save button required)

Right now, some inputs only persist when the user clicks **Save Character Info**.

### Goal
- Any meaningful edit should persist locally immediately (or with a small debounce).
- Cloud auto-sync then becomes much more intuitive.

### Approach (incremental)
- **Add a debounced “form persistence” layer**:
  - Listen for `input`/`change` events on `#character-sheet`.
  - Maintain an allowlist of persistent form fields (exclude transient inputs like quest creation fields).
  - Save to `STORAGE_KEYS.CHARACTER_SHEET_FORM` with a debounce (e.g., 500ms).

### Notes
- Keep “Save Character Info” button as optional UI affordance at first (or convert it into a “force sync now” button).
- Add a small “Saved” indicator near the form buttons if desired.

### Tests
- Add a focused Jest test: typing into `keeperName` persists without clicking Save.

---

## Phase 2 — Event-driven auto-sync (less polling, more “just works”)

The current auto-sync is a conservative polling loop.

### Goal
- Auto-sync shortly after local data changes, not on a timer.

### Approach
- Emit a lightweight “local state changed” signal from:
  - `setStateKey()` (IndexedDB/localStorage writes)
  - form persistence (Phase 1)
- In `cloudAuth`, debounce and call `syncAuto()` after changes (e.g., 2–5s).

### Guardrails
- Never auto-push if conflict is possible.
- Never auto-pull if local has unsynced changes.

---

## Phase 3 — Make expansions data-driven and painless

The expansion “ordeal” is usually caused by mixing:
- engine rules + UI logic + content data + save state changes

### Goal
- Adding expansions becomes: “add JSON data + optional renderer + optional migrations”.

### Tasks
- **Content manifest**:
  - Add a data file that declares installed expansions and version(s).
  - Use it to conditionally render features and avoid “spooky action at a distance”.
- **Save schema versioning**:
  - You already have schema versioning; continue using it aggressively.
  - Add explicit migration steps for each expansion.
- **IDs everywhere**:
  - Prefer stable IDs for quests/projects/items instead of relying on display strings.

### Optional
- Build a small “data audit” script that validates:
  - required IDs exist
  - no duplicates
  - item references resolve

---

## Phase 4 — UI/UX overhaul (without rewrites)

Once persistence/sync is stable, invest in UX.

### Quick wins
- Replace intrusive alerts with inline toasts/snackbars.
- Make Cloud Save status more “game-like”:
  - “Online”, “Offline”, “Synced”, “Needs attention”.
- Add a dedicated “Settings” panel (email, sign out, sync controls).

### Medium wins
- Reduce “form-like” feel:
  - collapse sections
  - emphasize progression, quests, inventory loops
  - make the character sheet feel like a dashboard

---

## Phase 5 — Optional: move from Jekyll-as-app to “app shell”

You can keep Jekyll for content, but treat the “game” as an app.

### Options
- Keep Jekyll + modernize JS incrementally (current direction).
- Or introduce a minimal SPA “app shell” for the character sheet / library pages only:
  - Jekyll serves content pages
  - App routes handle stateful game pages

This is not required if the current architecture stays maintainable.

---

## Phase 6 — Cloud save evolution (future)

Current model is one snapshot per user. This is correct for “solo game”.

### Potential upgrades
- Multiple save slots per user (e.g., “Main”, “Experimental”, “Season 2”).
- Soft history (keep last N snapshots).
- Better conflict UI (diff-ish, or “what changed” summary).

---

## Suggested “next work session” order

1. Phase 1: Auto-persist character info inputs (debounced).
2. Phase 2: Event-driven auto-sync (debounced on change).
3. Phase 3: Expansion manifest + data validation script.
4. Phase 4: UX improvements (toasts, status indicators).

---

## Notes / reminders

- Jekyll `_config.yml` changes require restarting the server.
- Supabase redirect URLs must include whatever URL is in the browser bar (localhost vs GitHub Pages).
- Keep RLS on for any browser-accessible tables.


