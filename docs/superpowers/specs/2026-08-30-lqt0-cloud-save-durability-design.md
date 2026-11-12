# Cloud save durability — design (lqt0)

**Date:** 2026-08-30
**Bead:** tome-of-secrets-lqt0
**Incident:** [project-docs/CLOUD-SAVE-RECOVERY.md](../../../project-docs/CLOUD-SAVE-RECOVERY.md)
**Amends:** [ADR-002](../../../project-docs/ADR-002-cloud-save-and-data-architecture.md)

## Context

On 2026-08-30 a returning player lost his library. His browser's IndexedDB had been evicted; `getStateKey` turned the failed reads into empty defaults; `loadState` wrote those empties back over the originals; and sync pushed the result over a good cloud save. The projection trigger then rebuilt `tos_quests` and `tos_inventory` to match. Recovery depended on his row happening to be four months stale, so that any retained backup would do — luck that will not repeat with an actively-syncing player.

ADR-002 chose local-first with **local state canonical**. That is sound while a browser holds the data. It stops being sound the moment the browser silently doesn't, and this is a **monthly** TBR game: a month or more away is the expected lifecycle, and month-scale absence is precisely the condition for browser LRU eviction of IndexedDB. The failure is not an edge case here; it is the shape of every returning player's session.

Three properties were missing, and all three are needed — no one of them covers the others:

- **An explicit choice** when a returning player's two sides genuinely disagree.
- **Guards** making the destructive write unreachable rather than merely unlikely.
- **Reversibility**, so a wrong outcome from any cause is undoable.

## Decisions

| Decision | Choice |
|---|---|
| Enforcement location | Client guards **and** a server backstop (approach B) |
| Restore surface | Automatic self-heal only; no player-facing version browser |
| Stale-sync prompt | Fires on **gap + real divergence**, not on gap alone |
| Sync authority | Local stays canonical during a session; the collapsed-local case is arbitrated by the guard, not by a prompt |

Rejected: server-authoritative sync (a rewrite of ADR-002 for three players), and client-only enforcement (every guard would live in the layer that already failed).

## Design

### 1. Read integrity — `getStateKey`

The root defect is a return type that cannot express failure. `getStateKey` catches IndexedDB errors, falls through to `safeGetJSON(key, defaultValue)`, and — because `setStateKey` deletes the localStorage copy after migrating a key — returns the empty default. A failed read and a genuinely empty save are indistinguishable to every caller.

New contract:

```js
{ status: 'found',  value }   // read succeeded, key present
{ status: 'absent'  }         // read succeeded, key not present
{ status: 'error',  error }   // read failed
```

The localStorage fallback applies to `absent` only — that path exists for pre-migration saves — and never to `error`. A `getStateKeyOrDefault(key, default)` wrapper serves call sites that legitimately want a default for an absent key; it throws on `error`.

### 2. Non-destructive load — `loadState`

`state.js` currently writes **every** `LARGE_STATE_KEY` back to IndexedDB on every load, unconditionally. Whatever ends up in memory after read/migrate/validate immediately overwrites the stored original — which is why the incident left empty *arrays* rather than missing keys, and why the recovery window closed before the player acted.

- The writeback's real purpose is the one-time localStorage→IndexedDB migration. Gate it behind a `tos_idbMigrationComplete` flag: run once, set the flag, never again.
- Afterwards, write a key back only when migration or validation changed **that key**. The existing `needsSave` is global; make the comparison per-key.
- Enforce at the write site: `setStateKeySafe(key, value)` refuses to write an empty value over a stored non-empty one without an explicit override.
- If any key returned `error` this session, abort the writeback entirely and mark the session degraded.

### 3. Degraded-state detection

New module `assets/js/services/saveIntegrity.js`.

```
collapsed       = every COLLECTION_KEY is empty or absent
hasSyncBaseline = tos_cloud_lastSyncedHash is non-empty
readErrors      = any getStateKey returned status 'error' this session

isDegraded = readErrors || (collapsed && hasSyncBaseline)
```

`COLLECTION_KEY` is the 15 collection-valued members of `LARGE_STATE_KEYS`. Two members need care and the definition must be shared verbatim by the client and by `tos_snapshot_is_collapsed` (§6), because a mismatch between them means the client and the database disagree about what a collapsed save is:

- **`buffMonthCounter` is excluded.** It is a number, and "empty" is not defined for it.
- **`exchangeProgram` is empty when `curriculums` has no keys**, not when the object itself has none. Its empty default is `{"curriculums": {}}` — one key, zero data. A naive key count reads it as populated, which is exactly the trap that made the incident's collapsed row look partly intact on first inspection.

The second clause is the load-bearing one. A sync baseline means a non-empty save was pushed from *this browser*. Collapsing to nothing with no intervening write is not reachable through normal play — it is an impossible state, and impossible states are the only ones you can act on without guessing.

A player who genuinely deletes everything will trip it. That is handled in the self-heal dialog (§7), not by weakening the signal.

State is per-session, surfaced in the cloud panel, and gates sync.

### 4. Sync guards — `cloudSync.js`

- `buildLocalSnapshot` throws when any key read errored. No snapshot is ever assembled from a partial read.
- `syncAuto` never pushes a snapshot that shrinks any tracked collection. Auto-sync pushes when growing or unchanged; anything else escalates to manual. The incident's second push was an auto-sync.
- `syncNow` is blocked entirely while degraded and routes to self-heal.
- `confirmChoice` / `window.confirm` is replaced by an in-page `ConfirmDialog`. This is not cosmetic: `window.confirm` returns `false` when the browser declines to render it — backgrounded tab, repeated dialogs — and `false` is the branch that overwrites the cloud. The destructive option is the silent default of the current design. The replacement must:
  - render in-page and be unsuppressable;
  - state counts on both sides with deltas ("cloud: 23 books, 20 quests → local: 0, 0");
  - have **no** default action — Escape and backdrop dismissal cancel the sync rather than choosing;
  - label the destructive button with what it destroys.
- Stale-gap prompt: when `now - lastSyncedAt > STALE_AFTER_DAYS` **and** both sides diverge, the same dialog opens with returning-player framing. Not on gap alone (a monthly game would show it most sessions and train people to click through), and not on one-sided change.

### 5. `tos_save_history`

```sql
create table public.tos_save_history (
  id             bigint generated always as identity primary key,
  user_id        uuid not null references auth.users(id) on delete cascade,
  data           jsonb not null,
  snapshot_hash  text,
  schema_version integer,
  is_collapsed   boolean not null,
  saved_at       timestamptz,
  archived_at    timestamptz not null default now()
);
```

A `before update on tos_saves` trigger appends `OLD`. Postgres fires same-timing triggers in name order, so the backstop (§6) must sort first — name them `tos_saves_00_reject_collapsing` and `tos_saves_10_archive` so a rejected write never records history for a save that did not happen. `is_collapsed` is computed at insert by `tos_snapshot_is_collapsed(jsonb)` — true when all 16 IndexedDB-backed keys are empty. RLS grants select on own rows only; no client insert/update/delete (the trigger is `SECURITY DEFINER`).

Retention, enforced in the same trigger: keep the newest `HISTORY_KEEP` rows per user, **except never delete the newest row with `is_collapsed = false`**. That exception is the entire point. A returning player's last good save must survive an arbitrary number of subsequent bad pushes, however long the gap.

The append runs in the same transaction as the save. If it fails, the save fails: losing one save is recoverable, losing the history that would recover it is not.

### 6. Server backstop

```sql
create function public.tos_reject_collapsing_write() returns trigger
```

`before update on tos_saves`: raise when `tos_snapshot_is_collapsed(NEW.data)` and not `tos_snapshot_is_collapsed(OLD.data)` and `NEW.allow_collapse is not true`. A new `allow_collapse boolean default false` column on `tos_saves` is the escape hatch. The same trigger sets `NEW.allow_collapse := false` before returning, so the grant is consumed by the write it authorised and cannot persist as a standing permission. The client sets it only on the explicit "my save really is empty" path.

This is the guarantee that does not depend on the browser being correct: *the database will not accept a save that erases a library*. `cloudSync` catches the rejection and presents the self-heal offer rather than a raw Postgres error.

### 7. Self-heal

While degraded, the cloud panel replaces "Sync now" with "Restore your last good save". It reads the newest `tos_save_history` row with `is_collapsed = false`, falling back to `tos_saves` when that row is itself intact, and shows what will be restored — counts and date — in the same dialog.

**The restore is a merge, not a wholesale replacement.** IndexedDB-backed keys come from history; localStorage-backed keys stay as they are locally. The two halves fail independently, so the surviving half is usually *newer* than the archived one — in the incident, the archived save was four months older on the localStorage side. Both halves are in hand at this point, so the merge is nearly free, and taking the archive wholesale would silently roll back progress the player still had.

The dialog's second option is "No — my save really is empty", which clears the degraded flag and sets `allow_collapse` for exactly one push.

### 8. `navigator.storage.persist()`

Requested once on startup, after sign-in, when engagement is highest. `navigator.storage.persisted()` is surfaced in the cloud panel as "Browser storage: protected / best-effort".

Listed last deliberately. Chrome grants persistence on engagement heuristics — bookmarks, installation, notification permission, visit frequency — and a site visited monthly is unlikely to qualify. It is worth requesting and worth showing, but the honest message when it is denied is "sign in so a cloud copy exists", not "you are safe". The durability guarantee has to come from §§1–7, not from this.

## Data flow

```
load  →  read integrity (§1)  →  degraded? (§3)  ┬─ yes → block writeback, block sync, offer self-heal (§7)
                                                 └─ no  → per-key writeback (§2)

push  →  client guard (§4)  →  server backstop (§6)  →  history append (§5)  →  projections
```

## Error handling

| Failure | Behaviour |
|---|---|
| IndexedDB read error | Never defaulted. Session degraded; writeback and sync both blocked. |
| Snapshot built from partial read | `buildLocalSnapshot` throws; no push attempted. |
| Server rejects collapsing write | Caught; surfaced as the self-heal offer. |
| History append fails | Save fails with it — deliberately. |
| `persist()` denied | Recorded and surfaced; no functional change. |

## Testing

- **Unit:** the three-way `getStateKey` contract; per-key writeback suppression; the `isDegraded` truth table; `buildLocalSnapshot` throwing on read error.
- **Unit:** `syncAuto` refusing a shrinking push; `syncNow` blocked while degraded; dialog dismissal cancelling rather than choosing.
- **Integration (jsdom):** simulate an IndexedDB open failure and assert no writeback occurs, the degraded flag is set, and no push is attempted.
- **SQL:** trigger rejects a collapsing update; permits it under `allow_collapse`; retention keeps the newest non-collapsed row past the keep window.
- **Regression:** reproduce the full 2026-08-30 chain end to end and assert `tos_saves` is unchanged.

## Out of scope

Player-facing version browser; server-authoritative sync; local export/import (worth doing, tracked separately).

## Open decisions for review

1. `HISTORY_KEEP` — proposed **20** per user.
2. `STALE_AFTER_DAYS` — proposed **30**, matching the monthly cadence.
3. "Collapsed" as **all 16 keys empty** (proposed) versus a proportional threshold. All-empty is unambiguous and cannot misfire on a genuinely small save; a threshold would catch partial losses that the strict rule misses.
