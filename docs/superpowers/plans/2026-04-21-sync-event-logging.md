# Sync Event Logging Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Bead:** `tome-of-secrets-68n` (child of `tome-of-secrets-lh7`)

**Goal:** Record sync lifecycle events (push, pull, conflict, noop, error) to `tos_sync_events` so sync operations are observable and debuggable.

**Architecture:** Add a fire-and-forget `logSyncEvent()` helper to `cloudSync.js` that inserts a row into the existing `tos_sync_events` table after each sync operation. The helper is called at each return point in `syncNowWithOptions()`. Conflict resolutions are logged as `'conflict_push'`/`'conflict_pull'` to preserve context. Errors thrown during sync are caught and logged as `'error'` events. The logging itself is fire-and-forget — failures are caught and silently ignored so they never break sync.

**Tech Stack:** Vanilla JS (ES modules), Supabase JS client, Jest (jsdom)

**Key constraint:** This is a static Jekyll site. The Supabase client is passed into `syncNow()`/`syncAuto()` from `cloudAuth.js`. The `tos_sync_events` table already exists with RLS policies allowing users to INSERT their own rows.

---

## Table Schema Reference

```sql
CREATE TABLE public.tos_sync_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event_type text NOT NULL,       -- 'push' | 'pull' | 'conflict_push' | 'conflict_pull' | 'noop' | 'error'
  snapshot_hash text,             -- hash of the snapshot involved
  schema_version integer,         -- client schema version at time of event
  detail text,                    -- human-readable detail string from sync result
  created_at timestamptz NOT NULL DEFAULT now()
);
```

RLS: users can SELECT and INSERT their own rows. No UPDATE/DELETE policies.

## Event Type Mapping

| Sync outcome | `event_type` value |
|---|---|
| First push (no remote) | `'push'` |
| Push (local changed, remote unchanged) | `'push'` |
| Pull (remote changed, local unchanged) | `'pull'` |
| First-time conflict resolved → use remote | `'conflict_pull'` |
| First-time conflict resolved → use local | `'conflict_push'` |
| Both-changed conflict resolved → use remote | `'conflict_pull'` |
| Both-changed conflict resolved → use local | `'conflict_push'` |
| Already in sync | `'noop'` |
| Auto-sync deferred (`manual_required`) | No event logged |
| Exception thrown during sync | `'error'` |

## File Structure

| Action | File | Responsibility |
|--------|------|----------------|
| Modify | `assets/js/services/cloudSync.js` | Add `logSyncEvent()` helper, call it from `syncNowWithOptions()` |
| Create | `tests/syncEventLogging.test.js` | Unit tests for event logging behavior |

---

### Task 1: Add logSyncEvent helper and tests

**Files:**
- Test: `tests/syncEventLogging.test.js`
- Modify: `assets/js/services/cloudSync.js:6,215-299`

- [ ] **Step 1: Write the test file with failing tests**

Create `tests/syncEventLogging.test.js`:

```js
/**
 * @jest-environment jsdom
 */
import { syncNow, syncAuto, snapshotHash } from '../assets/js/services/cloudSync.js';
import { STORAGE_KEYS } from '../assets/js/character-sheet/storageKeys.js';
import { safeSetJSON } from '../assets/js/utils/storage.js';

// --- Helpers ---

function makeSnapshot(overrides = {}) {
  return {
    version: 1,
    updatedAt: new Date().toISOString(),
    data: {
      formData: { keeperName: 'Test Keeper', level: '5' },
      characterState: {},
      monthlyCompletedBooks: [],
      ...overrides
    }
  };
}

function createMockSupabase({ remoteRow = null, upsertError = null, insertError = null } = {}) {
  const insertedRows = [];

  const mock = {
    auth: {
      getSession: jest.fn().mockResolvedValue({
        data: { session: { user: { id: 'user-123' } } },
        error: null
      })
    },
    from: jest.fn((table) => {
      if (table === 'tos_saves') {
        return {
          select: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              maybeSingle: jest.fn().mockResolvedValue({ data: remoteRow, error: null })
            })
          }),
          upsert: jest.fn().mockResolvedValue({ error: upsertError })
        };
      }
      if (table === 'tos_sync_events') {
        return {
          insert: jest.fn((row) => {
            insertedRows.push(row);
            return Promise.resolve({ error: insertError });
          })
        };
      }
      throw new Error(`Unexpected table: ${table}`);
    }),
    _insertedSyncEvents: insertedRows
  };

  return mock;
}

// --- Tests ---

describe('Sync Event Logging', () => {
  beforeEach(() => {
    localStorage.clear();
    jest.clearAllMocks();
    // Stub window.confirm for conflict tests
    window.confirm = jest.fn(() => true);
  });

  it('logs a push event when creating first cloud save', async () => {
    safeSetJSON(STORAGE_KEYS.CHARACTER_SHEET_FORM, { keeperName: 'Pusher' });
    localStorage.setItem('tomeOfSecrets_schemaVersion', '3');

    const supabase = createMockSupabase({ remoteRow: null });
    // Set a lastHash so it doesn't trigger first-time manual_required in auto
    localStorage.setItem('tos_cloud_lastSyncedHash', 'something');

    const result = await syncNow(supabase);

    expect(result.action).toBe('push');
    expect(supabase._insertedSyncEvents).toHaveLength(1);
    const event = supabase._insertedSyncEvents[0];
    expect(event.event_type).toBe('push');
    expect(event.user_id).toBe('user-123');
    expect(event.detail).toBe(result.detail);
    expect(typeof event.snapshot_hash).toBe('string');
    expect(event.schema_version).toBe(3);
  });

  it('logs a noop event when already in sync', async () => {
    safeSetJSON(STORAGE_KEYS.CHARACTER_SHEET_FORM, { keeperName: 'Same' });
    localStorage.setItem('tomeOfSecrets_schemaVersion', '1');

    const localSnapshot = makeSnapshot();
    const localHash = snapshotHash(localSnapshot);

    // Remote has same data
    const supabase = createMockSupabase({
      remoteRow: { data: localSnapshot, updated_at: new Date().toISOString() }
    });

    const result = await syncNow(supabase);

    expect(result.action).toBe('noop');
    expect(supabase._insertedSyncEvents).toHaveLength(1);
    expect(supabase._insertedSyncEvents[0].event_type).toBe('noop');
  });

  it('logs conflict_pull when user chooses remote on conflict', async () => {
    safeSetJSON(STORAGE_KEYS.CHARACTER_SHEET_FORM, { keeperName: 'Local' });
    localStorage.setItem('tomeOfSecrets_schemaVersion', '1');

    // Set lastHash to something different from both local and remote
    localStorage.setItem('tos_cloud_lastSyncedHash', 'old-hash');

    const remoteSnapshot = makeSnapshot({ formData: { keeperName: 'Remote' } });
    const supabase = createMockSupabase({
      remoteRow: { data: remoteSnapshot, updated_at: new Date().toISOString() }
    });

    // User picks remote (OK)
    window.confirm = jest.fn(() => true);
    const result = await syncNow(supabase);

    expect(result.action).toBe('pull');
    expect(supabase._insertedSyncEvents).toHaveLength(1);
    expect(supabase._insertedSyncEvents[0].event_type).toBe('conflict_pull');
  });

  it('logs conflict_push when user chooses local on conflict', async () => {
    safeSetJSON(STORAGE_KEYS.CHARACTER_SHEET_FORM, { keeperName: 'Local' });
    localStorage.setItem('tomeOfSecrets_schemaVersion', '1');

    localStorage.setItem('tos_cloud_lastSyncedHash', 'old-hash');

    const remoteSnapshot = makeSnapshot({ formData: { keeperName: 'Remote' } });
    const supabase = createMockSupabase({
      remoteRow: { data: remoteSnapshot, updated_at: new Date().toISOString() }
    });

    // User picks local (Cancel)
    window.confirm = jest.fn(() => false);
    const result = await syncNow(supabase);

    expect(result.action).toBe('push');
    expect(supabase._insertedSyncEvents).toHaveLength(1);
    expect(supabase._insertedSyncEvents[0].event_type).toBe('conflict_push');
  });

  it('does not log an event for manual_required (auto-sync deferred)', async () => {
    safeSetJSON(STORAGE_KEYS.CHARACTER_SHEET_FORM, { keeperName: 'Auto' });
    // No lastHash → first-time auto = manual_required
    const remoteSnapshot = makeSnapshot({ formData: { keeperName: 'Remote' } });
    const supabase = createMockSupabase({
      remoteRow: { data: remoteSnapshot, updated_at: new Date().toISOString() }
    });

    const result = await syncAuto(supabase);

    expect(result.action).toBe('manual_required');
    expect(supabase._insertedSyncEvents).toHaveLength(0);
  });

  it('logs an error event when sync throws', async () => {
    const supabase = createMockSupabase();
    // Make getSession throw
    supabase.auth.getSession = jest.fn().mockRejectedValue(new Error('Auth failed'));

    await expect(syncNow(supabase)).rejects.toThrow('Auth failed');

    // Error event should still be logged
    expect(supabase._insertedSyncEvents).toHaveLength(1);
    expect(supabase._insertedSyncEvents[0].event_type).toBe('error');
    expect(supabase._insertedSyncEvents[0].detail).toContain('Auth failed');
  });

  it('does not break sync if event logging itself fails', async () => {
    safeSetJSON(STORAGE_KEYS.CHARACTER_SHEET_FORM, { keeperName: 'Resilient' });
    localStorage.setItem('tomeOfSecrets_schemaVersion', '1');
    localStorage.setItem('tos_cloud_lastSyncedHash', 'something');

    // Event insert will fail
    const supabase = createMockSupabase({
      remoteRow: null,
      insertError: { message: 'RLS denied' }
    });

    // Sync should still succeed despite logging failure
    const result = await syncNow(supabase);
    expect(result.action).toBe('push');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /workspaces/tome-of-secrets/tests && npx jest syncEventLogging --no-cache 2>&1 | tail -20`

Expected: Tests fail because `syncNowWithOptions()` doesn't call `logSyncEvent()` yet (no rows inserted into `tos_sync_events`).

- [ ] **Step 3: Add logSyncEvent helper to cloudSync.js**

Add this constant after line 6 (`const SYNC_TABLE = 'tos_saves';`):

```js
const SYNC_EVENTS_TABLE = 'tos_sync_events';
```

Add this helper function after the `setLastSynced()` function (after line 187):

```js
/**
 * Fire-and-forget: log a sync event to tos_sync_events.
 * Failures are silently ignored so they never break sync.
 */
async function logSyncEvent(supabase, userId, eventType, { snapshotHash: hash, schemaVersion, detail } = {}) {
  try {
    await supabase.from(SYNC_EVENTS_TABLE).insert({
      user_id: userId,
      event_type: eventType,
      snapshot_hash: hash ?? null,
      schema_version: schemaVersion ?? null,
      detail: detail ?? null
    });
  } catch (_e) {
    // Intentionally swallowed — logging must never break sync
  }
}
```

- [ ] **Step 4: Modify syncNowWithOptions to log events**

Replace the `syncNowWithOptions` function body (lines 215–299) with the version that calls `logSyncEvent()` at each return point. The key changes:

1. Extract `userId` early (from session) so it's available for logging
2. At each return point that represents an actual sync action, call `logSyncEvent()` before returning
3. For conflict resolutions, use `'conflict_push'`/`'conflict_pull'` as the event type
4. Skip logging for `'manual_required'` results (nothing happened)
5. Wrap the entire function in try/catch — on error, log an `'error'` event then re-throw

```js
async function syncNowWithOptions(supabase, { mode }) {
  // Extract userId early for event logging
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) throw sessionError;
  const session = sessionData?.session;
  if (!session) {
    throw new Error('Not signed in.');
  }
  const userId = session.user.id;

  let localSnapshot;
  try {
    localSnapshot = await buildLocalSnapshot();
  } catch (err) {
    await logSyncEvent(supabase, userId, 'error', { detail: `buildLocalSnapshot failed: ${err.message}` });
    throw err;
  }

  const localHash = snapshotHash(localSnapshot);
  const lastHash = getLastSyncedHash();
  const schemaVersion = localSnapshot.version ?? null;

  let remoteRow, remoteSnapshot, remoteHash;
  try {
    remoteRow = await getRemoteSave(supabase);
    remoteSnapshot = remoteRow?.data || null;
    remoteHash = remoteSnapshot ? snapshotHash(remoteSnapshot) : '';
  } catch (err) {
    await logSyncEvent(supabase, userId, 'error', {
      snapshotHash: localHash, schemaVersion, detail: `getRemoteSave failed: ${err.message}`
    });
    throw err;
  }

  // No remote save yet
  if (!remoteSnapshot) {
    if (mode === 'auto' && !lastHash) {
      // First time: require manual user choice. No event — nothing happened.
      return { action: 'manual_required', detail: 'Auto-sync needs an initial manual sync to establish a baseline.' };
    }
    await upsertRemoteSave(supabase, localSnapshot);
    setLastSynced(localHash, mode);
    const result = { action: 'push', detail: 'Created cloud save from local data.' };
    await logSyncEvent(supabase, userId, 'push', { snapshotHash: localHash, schemaVersion, detail: result.detail });
    return result;
  }

  // Exact match
  if (localHash === remoteHash) {
    setLastSynced(localHash, mode);
    const result = { action: 'noop', detail: 'Already in sync.' };
    await logSyncEvent(supabase, userId, 'noop', { snapshotHash: localHash, schemaVersion, detail: result.detail });
    return result;
  }

  // First-time sync (no lastHash) -> ask
  if (!lastHash) {
    if (mode === 'auto') {
      return { action: 'manual_required', detail: 'Cloud save exists. Click "Sync now" once to choose whether to pull or push.' };
    }
    const useRemote = confirmChoice(
      'A cloud save exists, but this device has never synced before.\n\n' +
      'Click OK to REPLACE local data with the cloud save.\n' +
      'Click Cancel to UPLOAD local data and overwrite the cloud save.'
    );

    if (useRemote) {
      await applySnapshot(remoteSnapshot);
      setLastSynced(remoteHash, mode);
      const result = { action: 'pull', detail: 'Replaced local data with cloud save (reload recommended).' };
      await logSyncEvent(supabase, userId, 'conflict_pull', { snapshotHash: remoteHash, schemaVersion, detail: result.detail });
      return result;
    }

    await upsertRemoteSave(supabase, localSnapshot);
    setLastSynced(localHash, mode);
    const result = { action: 'push', detail: 'Overwrote cloud save with local data.' };
    await logSyncEvent(supabase, userId, 'conflict_push', { snapshotHash: localHash, schemaVersion, detail: result.detail });
    return result;
  }

  const localUnchangedSinceLastSync = localHash === lastHash;
  const remoteUnchangedSinceLastSync = remoteHash === lastHash;

  // Local unchanged, remote changed -> pull
  if (localUnchangedSinceLastSync && !remoteUnchangedSinceLastSync) {
    await applySnapshot(remoteSnapshot);
    setLastSynced(remoteHash, mode);
    const result = { action: 'pull', detail: 'Pulled newer cloud save (reload recommended).' };
    await logSyncEvent(supabase, userId, 'pull', { snapshotHash: remoteHash, schemaVersion, detail: result.detail });
    return result;
  }

  // Remote unchanged, local changed -> push
  if (!localUnchangedSinceLastSync && remoteUnchangedSinceLastSync) {
    await upsertRemoteSave(supabase, localSnapshot);
    setLastSynced(localHash, mode);
    const result = { action: 'push', detail: 'Uploaded local changes to cloud save.' };
    await logSyncEvent(supabase, userId, 'push', { snapshotHash: localHash, schemaVersion, detail: result.detail });
    return result;
  }

  // Conflict -> prompt
  if (mode === 'auto') {
    return { action: 'manual_required', detail: 'Both local and cloud changed. Click "Sync now" to resolve.' };
  }
  const useRemote = confirmChoice(
    'Both local and cloud data have changed since the last sync.\n\n' +
    'Click OK to KEEP the cloud save (replace local).\n' +
    'Click Cancel to KEEP local data (overwrite cloud).'
  );

  if (useRemote) {
    await applySnapshot(remoteSnapshot);
    setLastSynced(remoteHash, mode);
    const result = { action: 'pull', detail: 'Conflict resolved in favor of cloud (reload recommended).' };
    await logSyncEvent(supabase, userId, 'conflict_pull', { snapshotHash: remoteHash, schemaVersion, detail: result.detail });
    return result;
  }

  await upsertRemoteSave(supabase, localSnapshot);
  setLastSynced(localHash, mode);
  const result = { action: 'push', detail: 'Conflict resolved in favor of local (cloud overwritten).' };
  await logSyncEvent(supabase, userId, 'conflict_push', { snapshotHash: localHash, schemaVersion, detail: result.detail });
  return result;
}
```

Note: `getRemoteSave()` internally calls `supabase.auth.getSession()` again. This is a minor redundancy but avoids changing its signature. The session is cached by the Supabase client so there's no extra network call.

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd /workspaces/tome-of-secrets/tests && npx jest syncEventLogging --no-cache 2>&1 | tail -20`

Expected: All 7 tests pass.

- [ ] **Step 6: Run full test suite to verify no regressions**

Run: `cd /workspaces/tome-of-secrets/tests && npx jest --no-cache 2>&1 | tail -15`

Expected: All existing tests still pass (the return value shape `{ action, detail }` is unchanged).

---

### Task 2: Close beads

- [ ] **Step 1: Close bead 68n**

```bash
bd close 68n --comment "Added logSyncEvent() to cloudSync.js. All sync operations (push/pull/noop/conflict/error) now insert a row into tos_sync_events. Fire-and-forget — logging failures never break sync."
```

- [ ] **Step 2: Check if lh7 can be closed**

```bash
bd show lh7
```

If all children except 2yb are closed, and the user wants to close lh7, close it with `--force`:

```bash
bd close lh7 --force --comment "Hybrid cloud-save projections and observability complete: projection functions (hhc/ujb/fhb), sync event logging (68n), and snapshot metadata (bak/f5u) all implemented. Only troubleshooting docs (2yb) remain as follow-up."
```
