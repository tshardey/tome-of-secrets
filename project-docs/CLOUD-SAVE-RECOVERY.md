# Cloud save recovery (Tome of Secrets)

How to diagnose and repair a damaged `tos_saves` row. One incident is recorded here (2026-08-30): a returning player's browser lost its IndexedDB, the app treated the resulting empty state as truth, and sync overwrote his good cloud save with it.

> **Read this before telling the affected player to do anything.** Every page load and every sync can destroy evidence, and the sync layer's failure mode is to push local over cloud. See [Never let the player sync first](#never-let-the-player-sync-first).

## Background

- One row per user in `public.tos_saves` (`user_id`, `data` jsonb, `updated_at`, `snapshot_hash`, `schema_version`, `saved_at`). Full-snapshot push/pull; no deltas. See [ADR-002](./ADR-002-cloud-save-and-data-architecture.md).
- `tos_saves_project_on_upsert` fires on every write and rebuilds `tos_save_summary`, `tos_inventory` and `tos_quests`. The quest and inventory projectors **delete all rows for the user, then re-insert** — so a bad push destroys the projections too. They are derived data; never treat them as a backup.
- `tos_sync_events` is an append-only audit log: one row per sync attempt, with `event_type`, `snapshot_hash` and the human-readable `detail`. It stores no snapshot data, but it is the only record of *which branch of the sync algorithm ran*.
- Project ref is `cdhorluhpuchzlnahzlt`. Postgres 17, **physical backups**, **PITR disabled** — so backups are daily only, and cannot be downloaded. Pro plan retains 7 days.
- The snapshot's storage is split. `LARGE_STATE_KEYS` (`assets/js/character-sheet/persistence.js`) live in **IndexedDB**; everything else — form data, `series`, restoration progress, passive slots, genres — lives in **localStorage**. Browsers evict IndexedDB independently of localStorage, so the two halves fail separately. This split governs every recovery decision below.

## Triage

Get the user id and the event history first. Never act on the player's description alone.

```bash
TOKEN=$(cat ~/.supabase/access-token)
q() { curl -s -X POST "https://api.supabase.com/v1/projects/cdhorluhpuchzlnahzlt/database/query" \
      -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
      -d "{\"query\":\"$1\"}"; }
```

Size up every row — a collapsed save is obvious next to healthy ones:

```sql
select user_id, updated_at, snapshot_hash,
       coalesce(jsonb_array_length(data->'data'->'characterState'->'completedQuests'),0) as completed_q,
       (select count(*) from jsonb_object_keys(
          coalesce(data->'data'->'characterState'->'books', jsonb_build_object()))) as books,
       coalesce(jsonb_array_length(data->'data'->'characterState'->'passiveItemSlots'),0) as passive
from public.tos_saves order by updated_at desc;
```

Then read the branch that ran:

```sql
select created_at, event_type, snapshot_hash, detail
from public.tos_sync_events where user_id = '<uuid>'
order by created_at desc limit 30;
```

| `event_type` / `detail` | What ran | Meaning |
|---|---|---|
| `push` — "Uploaded local changes to cloud save." | Remote unchanged since last sync, local changed | **Silent.** No prompt, fires in auto-sync too |
| `conflict_push` — "Conflict resolved in favor of local (cloud overwritten)." | Both changed; user chose Cancel | Cancel is also what a **suppressed** `window.confirm` returns |
| `pull` / `conflict_pull` | Cloud won | Local was replaced |
| `noop` | Hashes matched | Nothing written |

Establish **which half of the save is missing** by comparing the collapsed row's keys against the storage split:

```sql
select e.k, jsonb_typeof(e.v),
       case jsonb_typeof(e.v) when 'array' then jsonb_array_length(e.v)
                              when 'object' then (select count(*)::int from jsonb_object_keys(e.v)) end as size
from public.tos_saves s, lateral jsonb_each(s.data->'data'->'characterState') as e(k,v)
where s.user_id = '<uuid>' order by 3 desc nulls last;
```

All 16 IndexedDB keys empty while the localStorage keys hold data means **browser eviction**, not user action. Note `exchangeProgram` reads as `{"curriculums":{}}` when empty — that is the default, not data.

## Never let the player sync first

Before any recovery, tell the affected player to **close the app and not reopen it**. Two reasons:

1. `loadState` writes every `LARGE_STATE_KEY` back to IndexedDB on *every* load (`assets/js/character-sheet/state.js`). If the in-memory state is degraded, each load recommits the damage.
2. Sync fails toward destruction. The silent-push branch needs no user action, and `confirmChoice` uses `window.confirm`, which returns `false` — "keep local, overwrite cloud" — when the browser declines to render the dialog (backgrounded tab, repeated dialogs).

Also check whether **any other player** has a device holding good state, and keep them out too.

## Preserve what survived — before restoring

The damaged row is usually the **only** server-side copy of the player's surviving localStorage half. Snapshot it first:

```sql
create table if not exists public.tos_saves_incident_YYYYMMDD (like public.tos_saves including all);
insert into public.tos_saves_incident_YYYYMMDD
select * from public.tos_saves where user_id = '<uuid>';
```

**An in-place restore will delete this table** if it was created after the backup point. If you take that route, copy the row out of the database first, or accept that the surviving half comes back only from the player's browser (`copy(JSON.stringify(localStorage))` in their console).

### Find a verification target

Dangling references in the surviving half prove whether a candidate backup is genuinely the right save. `series[].bookIds` point at books that should exist:

```sql
select jsonb_agg(distinct b.value) from public.tos_saves s,
  lateral jsonb_each(s.data->'data'->'characterState'->'series') as e(k,v),
  lateral jsonb_array_elements_text(coalesce(e.v->'bookIds', jsonb_build_array())) as b(value)
where s.user_id = '<uuid>';
```

Every one of those ids must resolve in the restored `books` object. If they don't, you have the wrong backup — stop.

## Choosing a recovery route

Supabase restores the **whole database cluster**. There is no table- or row-level restore, and physical backups cannot be downloaded. That leaves two routes.

Check which rows were written after your candidate backup before choosing:

```sql
select user_id, updated_at from public.tos_saves where updated_at > '<backup timestamp>';
```

### Scenario A — in-place restore

Dashboard → Database → Backups → restore. Fastest, free, and correct **when every other row written since the backup can be reconstructed from its owner's browser**.

It rolls back everything: all `tos_saves` rows, `tos_sync_events`, `auth` (so every session is invalidated and users are signed out), and any table you created since.

After it completes, each affected player is put back by hand — see [Putting players back in sync](#putting-players-back-in-sync).

### Scenario B — restore to a new project

Dashboard → Database → Backups → **Restore to a new project**. Non-destructive to live; costs a mirrored project billed hourly. Use it when a row written after the backup **cannot** be reconstructed, or when you need to merge the two halves rather than take one wholesale.

The Management API cannot do this — `POST /v1/projects/{ref}/restore` and `restore-pitr` are both in-place. It is a dashboard action.

Then copy the row across, staging it rather than writing directly (writing to `tos_saves` fires the projection trigger):

```sql
create table if not exists public.tos_saves_restore (like public.tos_saves);
-- load the row from the clone into tos_saves_restore, verify counts, then:
update public.tos_saves t
set data = jsonb_set(t.data, '{data,characterState}',
      (t.data->'data'->'characterState') || <the 16 IndexedDB keys from the backup>)
where t.user_id = '<uuid>';
```

Grafting only the IndexedDB keys preserves the player's newer localStorage half. Delete the clone as soon as the row is out.

`snapshot_hash` on the row is cosmetic — the client recomputes the remote hash from `data` on every sync — so it need not be correct after a merge.

## Putting players back in sync

An in-place restore leaves each browser holding a `tos_cloud_lastSyncedHash` that no longer describes anything, and the sync algorithm will act on it silently. Decide the direction **per player** and force it.

Whoever's browser holds the newer data must **push**. Set their baseline to the current remote hash so the algorithm sees "remote unchanged, local changed":

```js
localStorage.setItem('tos_cloud_lastSyncedHash', '<snapshot_hash currently in tos_saves>')
```

Then Sync now. Do this **while signed out** — sync throws `Not signed in.` before touching anything, so there is no race against the 3-second auto-sync debounce. Sign-out does not clear the `tos_cloud_*` keys; nothing in the codebase does.

Whoever must **pull** clears the baseline entirely and takes the first-time-sync branch:

```js
['tos_cloud_lastSyncedHash','tos_cloud_lastSyncedAt','tos_cloud_lastSyncedSource']
  .forEach(k => localStorage.removeItem(k))
```

Reload, Sync now, click **OK** ("replace local with cloud"), with the tab focused and in the foreground so the dialog actually renders.

A player pulling a restored save must not touch the sheet before the sync completes. Any edit makes local diverge, turning the next sync into a conflict — and a suppressed dialog resolves that by pushing their empty state back over the recovered row.

Verify from the database, not from the player's screen. The "Last synced" label reads `tos_cloud_lastSyncedAt` out of localStorage and survives a rollback, so it will happily show a fresh time when nothing has synced.

## Incident: 2026-08-30

A player returning after ~4 months found his books, quests and archives gone.

**Chain.** His browser's IndexedDB had been evicted — localStorage survived, as it does under Chrome's LRU eviction. `getStateKey` caught the failed reads and returned empty defaults; the localStorage fallback was useless because `setStateKey` deletes those copies after migrating a key to IndexedDB. `loadState` then wrote the empty arrays back into IndexedDB, closing the recovery window before he had done anything. A manual sync hit the conflict branch, `window.confirm` returned `false` without rendering, and the cloud row was overwritten (`conflict_push`, hash `155ixow`). 18 seconds later auto-sync pushed the fully-empty snapshot on top (`push`, hash `btowfn`). The projection trigger rebuilt `tos_quests` and `tos_inventory` to match.

**Recovery.** All eight retained backups held his intact row — it had not been written since April, so backup choice was unconstrained. Route A (in-place restore to that day's 10:08 UTC backup) was chosen because the only other row written after it belonged to the maintainer, whose browser still held the newer copy. His save came back: 23 books, 20 completed quests, all 11 dangling `series` book ids resolving. He lost 15 genre selections and regained 40 ink drops — his localStorage half had drifted only slightly from April.

**Cost of route A.** The maintainer's row rolled back 14 hours and was re-pushed from their browser using the baseline trick above. `tos_sync_events` lost that day's history. Both users were signed out.

**What made it recoverable.** Luck: his row was four months stale, so any backup would do. With an actively-syncing player the good row would have been gone from every backup within 24 hours.
