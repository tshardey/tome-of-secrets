# ADR-002: Cloud Save and Data Architecture

**Date:** 2026-02-02  
**Technical Story:** Cloud save (Supabase), local-first persistence (IndexedDB), and event-driven sync

## Context and Problem Statement

After ADR-001 refactored the character sheet into a modular architecture, state lived in **localStorage** only. That led to:

1. **No cross-device sync** — players could not continue on another device or recover after clearing browser data
2. **localStorage limits** — large state (quests, inventory, completed content) risked hitting ~5MB limits and made serialization/parsing slow
3. **Manual save friction** — some inputs (e.g. character info) only persisted on "Save Character Info", making cloud sync semantics unclear
4. **Polling-heavy sync** — any future cloud sync would need a clear contract for when to push/pull without excessive polling or missed updates

The project needed a **local-first** persistence and optional **cloud save** strategy that:

- Works on static hosting (Jekyll + GitHub Pages) with no custom backend beyond a managed BaaS
- Keeps the game playable offline with no data loss
- Makes sync behavior predictable (when we push, when we pull, how we handle conflicts)
- Avoids requiring a "Save" button for normal edits

## Decision Drivers

* Solo player game; one save per user is sufficient for now
* Static site constraint; no server-side app logic
* Desire to use a managed backend (Supabase) for auth + one table only
* Need to support multiple tabs and devices without silent overwrites
* Must preserve existing saved state format where possible (schema versioning, migrations)
* Testability and debuggability of sync and persistence logic

## Considered Options

### Option 1: Backend-First (Server Authoritative)
**Pros:** Single source of truth; simpler conflict model  
**Cons:** Requires network for every change; contradicts "play offline" goal; more hosting/ops

### Option 2: Local-First + Optional Cloud (Selected)
**Pros:**
- Play fully offline; cloud is an optional sync layer
- Fits Supabase (auth + one `tos_saves` row per user)
- Clear contract: local state is canonical; cloud is a snapshot we push/pull with conflict UI when needed

**Cons:**
- Conflict handling and event-driven sync add complexity
- Must keep local and cloud semantics in sync (hashing, key allowlists)

### Option 3: localStorage Only + Manual Export/Import
**Pros:** No new infrastructure; no auth  
**Cons:** No real cloud save; poor UX for multi-device; same size/speed limits

## Decision Outcome

**Chosen option: "Local-First + Optional Cloud"** — Large state moved to IndexedDB; small/shared keys remain in localStorage; optional Supabase cloud save with event-driven auto-sync and conflict prompts.

### 1. Persistence Architecture

#### 1.1 IndexedDB for Large State (Local-First)
- **Decision:** Store character sheet state (quests, inventory, abilities, etc.) in **IndexedDB** via `assets/js/character-sheet/persistence.js`.
- **Rationale:** Avoids localStorage size limits; async `loadState`/`saveState` scale to large payloads; remains local-first (no network required).
- **Implementation:**
  - Single store (or key-per-domain pattern) for game state keys
  - `setStateKey()` / `getStateKey()` (or equivalent) with async API
  - Schema version and migrations handled in persistence layer
- **Consequences:** Boot path became async; all callers of load/save updated to await.

#### 1.2 localStorage for Small / Shared Keys
- **Decision:** Keep **localStorage** for small, shared keys: form data, monthly books, schema version, and any key that must be visible across tabs via `storage` events.
- **Rationale:** Cross-tab detection relies on localStorage `storage` events; small keys avoid IndexedDB overhead; keeps a single list of "what syncs to cloud" (allowlist) easier.
- **Implementation:** Allowlist in storage/sync layer so only cloud-relevant keys trigger sync; UI-only keys (e.g. last tab) stay local-only.

### 2. Cloud Save (Supabase)

#### 2.1 One Snapshot per User
- **Decision:** One row per user in `public.tos_saves` (user_id, data JSONB, updated_at). Full snapshot push/pull; no delta sync for now.
- **Rationale:** Matches "solo game, one save" model; simple RLS (user can only read/write own row); minimal Supabase usage.
- **Implementation:** See `SUPABASE-CLOUD-SAVE.md` (table, RLS, magic link auth). Client uses Supabase JS: get current row, compare with local, then push or pull with conflict resolution when both changed.

#### 2.2 Conflict Handling
- **Decision:** When local and cloud both changed since last sync, prompt user: **Overwrite cloud**, **Overwrite local**, or **Cancel**.
- **Rationale:** Avoids silent overwrites; keeps implementation simple; acceptable for solo play.
- **Implementation:** Hash or timestamp comparison; conflict UI in Cloud Save panel; apply user choice then re-sync.

#### 2.3 Hashing and Canonical Key Order
- **Decision:** Use **canonical key ordering** when hashing/serializing state for comparison, so JSON key order does not cause false "diffs".
- **Rationale:** Prevents unnecessary conflict prompts and redundant syncs when only key order differs.
- **Implementation:** Serialize with stable key order (e.g. alphabetical or defined schema order) before hashing or sending to cloud.

### 3. Event-Driven Auto-Sync (Less Polling)

#### 3.1 Sync Triggers
- **Decision:** Trigger sync from **events**, not a fixed timer: local state changes (debounced), cross-tab localStorage changes, and visibility change (tab focused).
- **Rationale:** Syncs shortly after edits (e.g. 3–5 seconds) without constant polling; visibility change catches stale sessions when user returns to tab.
- **Implementation:**
  - `tos:localStateChanged` emitted from persistence layer and storage layer (allowlisted keys only) after writes.
  - `autoSyncScheduler.js`: debounce (e.g. 3 s), concurrency guard so manual and auto sync do not run simultaneously.
  - Listeners: `tos:localStateChanged`, `storage`, `visibilitychange`.
  - Polling fallback at 3 minutes as safety net only.

#### 3.2 Loop Prevention
- **Decision:** When applying a **cloud snapshot** to local state, write with **suppressEvents: true** (or equivalent) so that applying cloud data does not emit `tos:localStateChanged` and trigger an immediate push.
- **Rationale:** Prevents infinite sync loops (cloud → local → "changed" → push → cloud → local → …).
- **Implementation:** `applySnapshot()` in cloud sync layer passes a flag to persistence/storage so those writes do not emit the event.

### 4. Form Persistence (No Save Button Required)

#### 4.1 Debounced Auto-Persist for Character Info
- **Decision:** Persist character info (and other allowlisted form fields) on **input/change** with a short debounce (e.g. 500 ms); do **not** require "Save Character Info" for normal edits.
- **Rationale:** Any meaningful edit is saved locally quickly; cloud auto-sync then reflects changes without user having to remember to click Save.
- **Implementation:** `formPersistence.js` listens to `input`/`change` on `#character-sheet` with an allowlist; excludes transient fields (e.g. quest creation, dropdown selects); writes to localStorage (or appropriate key); emits `tos:localStateChanged` for sync.
- **UX:** "Save Character Info" button remains for manual save; optional brief "Saved" indicator after auto-save.

### 5. Cross-Tab and Concurrency

- **Decision:** Use localStorage `storage` events for cross-tab visibility of changes; use a single **sync-in-progress** (or equivalent) guard so manual "Sync now" and auto-sync never run concurrently.
- **Rationale:** Prevents duplicate syncs and race conditions; other tabs can react to sync results or local changes via existing events.

## Positive Consequences

1. **Offline play:** Full game works without network; cloud is optional.
2. **Scalable state:** IndexedDB avoids localStorage size limits and keeps large state fast.
3. **Predictable sync:** Event-driven sync with debounce and loop prevention; clear conflict UX.
4. **Better UX:** No mandatory Save button for character info; sync "just works" after edits.
5. **Static hosting preserved:** Only Supabase (BaaS) added; Jekyll + GitHub Pages unchanged.
6. **Testability:** Persistence, cloud sync, and event emission can be unit/integration tested (e.g. `eventEmission.test.js`, `autoSyncScheduler.test.js`, `eventDrivenSync.test.js`, `cloudSync.test.js`, `formPersistence.test.js`).

## Negative Consequences

1. **Complexity:** More modules (persistence, cloud sync, auto-sync scheduler, form persistence) and event contracts to maintain.
2. **Async boot:** Entire load path is async; all dependent UI must wait for `loadState()`.
3. **Supabase dependency:** Cloud save requires Supabase project and secrets for production (e.g. GitHub Actions); magic link auth and RLS must be kept correct.
4. **Conflict UX:** Single snapshot model means conflicts are "choose one side" only; no diff or multi-slot history yet (deferred to Phase 6 in roadmap).

## Compliance

- ✅ Static site architecture (Jekyll + GitHub Pages) preserved  
- ✅ Local-first: game playable without cloud  
- ✅ One snapshot per user; RLS and auth as per `SUPABASE-CLOUD-SAVE.md`  
- ✅ No breaking change to existing saved state schema where possible; migrations and schema versioning in place  
- ✅ Event-driven auto-sync with loop prevention and concurrency guard  
- ✅ Form persistence and Save button behavior documented and tested  

## Technical Details

### Key Files and Roles

| Area            | Location | Role |
|-----------------|----------|------|
| Persistence     | `assets/js/character-sheet/persistence.js` | IndexedDB load/save; schema; `setStateKey` / events |
| Storage (small) | `assets/js/utils/storage.js` | localStorage; `safeSetJSON`; event emission for allowlisted keys |
| Cloud sync      | `assets/js/services/cloudSync.js` | Push/pull; conflict detection; `applySnapshot` with event suppression |
| Auto-sync       | `assets/js/auth/autoSyncScheduler.js` | Debounce; concurrency guard; immediate/flush triggers |
| Auth / UI       | `assets/js/auth/cloudAuth.js` | Magic link; "Sync now"; listeners for events, storage, visibility |
| Form persist    | `assets/js/character-sheet/formPersistence.js` | Debounced form writes; allowlist; `tos:localStateChanged` |

### Sync and Event Flow (Summary)

1. User (or another tab) changes state → persistence or storage writes with allowlist → emits `tos:localStateChanged`.
2. Auto-sync scheduler debounces → when ready, runs push/pull with concurrency guard.
3. If cloud newer and local unchanged → optional auto-pull (e.g. apply snapshot with `suppressEvents`).
4. If both changed → show conflict UI; user chooses overwrite direction.
5. Visibility change → trigger immediate sync check; polling fallback at 3 minutes.

### Production Validation (Phase 0)

Before relying on cloud save in production:

- **First sync:** New device/account sees "choose pull vs push" where appropriate.
- **Conflict:** Two devices edit without syncing → conflict prompt accurate and choice respected.
- **Auto-sync:** "Last synced" updates; auto-pull only when local unchanged.
- **Security:** RLS enabled and correct on `tos_saves` (see `SUPABASE-CLOUD-SAVE.md`).
- **Offline/errors:** Clear UI messages; no silent data loss.

### Future Evolution (Roadmap Phase 6)

- Multiple save slots per user (e.g. "Main", "Experimental").
- Soft history (last N snapshots).
- Richer conflict UI (e.g. diff or "what changed" summary).

## Links

- [ROADMAP-NEXT-REFACTOR-STEPS.md](./ROADMAP-NEXT-REFACTOR-STEPS.md) — Phases 0–6 and implementation checklist
- [SUPABASE-CLOUD-SAVE.md](./SUPABASE-CLOUD-SAVE.md) — Supabase setup, table, RLS, and GitHub Actions
- [ADR-001: Character Sheet Architecture Refactoring](./ADR-001-character-sheet-refactoring.md) — Predecessor; modular character sheet and services
- Persistence: `assets/js/character-sheet/persistence.js`
- Cloud sync: `assets/js/services/cloudSync.js`
- Auto-sync: `assets/js/auth/autoSyncScheduler.js`
- Form persistence: `assets/js/character-sheet/formPersistence.js`
- Tests: `tests/formPersistence.test.js`, `tests/eventEmission.test.js`, `tests/autoSyncScheduler.test.js`, `tests/eventDrivenSync.test.js`, `tests/cloudSync.test.js`

## Notes

This ADR captures the cloud save and data architecture as implemented and described in the roadmap. Phases 1–3 (form persistence, event-driven auto-sync, expansions/data) are complete; Phase 4 (UX overhaul) and Phase 6 (cloud save evolution) are future work. All design choices aim to keep the app static-hosted, local-first, and operable without a custom backend except Supabase for auth and one table.
