/**
 * @jest-environment jsdom
 */
import { syncNow, syncAuto, snapshotHash, buildLocalSnapshot } from '../assets/js/services/cloudSync.js';
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
    window.confirm = jest.fn(() => true);
  });

  it('logs a push event when creating first cloud save', async () => {
    safeSetJSON(STORAGE_KEYS.CHARACTER_SHEET_FORM, { keeperName: 'Pusher' });
    localStorage.setItem('tomeOfSecrets_schemaVersion', '3');

    const supabase = createMockSupabase({ remoteRow: null });
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

    // Build the snapshot the same way syncNow will, so hashes match exactly
    const localSnapshot = await buildLocalSnapshot();

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
    localStorage.setItem('tos_cloud_lastSyncedHash', 'old-hash');

    const remoteSnapshot = makeSnapshot({ formData: { keeperName: 'Remote' } });
    const supabase = createMockSupabase({
      remoteRow: { data: remoteSnapshot, updated_at: new Date().toISOString() }
    });

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

    window.confirm = jest.fn(() => false);
    const result = await syncNow(supabase);

    expect(result.action).toBe('push');
    expect(supabase._insertedSyncEvents).toHaveLength(1);
    expect(supabase._insertedSyncEvents[0].event_type).toBe('conflict_push');
  });

  it('does not log an event for manual_required (auto-sync deferred)', async () => {
    safeSetJSON(STORAGE_KEYS.CHARACTER_SHEET_FORM, { keeperName: 'Auto' });
    const remoteSnapshot = makeSnapshot({ formData: { keeperName: 'Remote' } });
    const supabase = createMockSupabase({
      remoteRow: { data: remoteSnapshot, updated_at: new Date().toISOString() }
    });

    const result = await syncAuto(supabase);

    expect(result.action).toBe('manual_required');
    expect(supabase._insertedSyncEvents).toHaveLength(0);
  });

  it('logs an error event when sync throws after session obtained', async () => {
    safeSetJSON(STORAGE_KEYS.CHARACTER_SHEET_FORM, { keeperName: 'Error' });
    localStorage.setItem('tomeOfSecrets_schemaVersion', '1');

    const supabase = createMockSupabase();
    // Make the tos_saves select throw
    supabase.from = jest.fn((table) => {
      if (table === 'tos_saves') {
        return {
          select: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              maybeSingle: jest.fn().mockRejectedValue(new Error('DB connection lost'))
            })
          })
        };
      }
      if (table === 'tos_sync_events') {
        return {
          insert: jest.fn((row) => {
            supabase._insertedSyncEvents.push(row);
            return Promise.resolve({ error: null });
          })
        };
      }
      throw new Error(`Unexpected table: ${table}`);
    });

    await expect(syncNow(supabase)).rejects.toThrow('DB connection lost');

    expect(supabase._insertedSyncEvents).toHaveLength(1);
    expect(supabase._insertedSyncEvents[0].event_type).toBe('error');
    expect(supabase._insertedSyncEvents[0].detail).toContain('DB connection lost');
  });

  it('logs a pull event when remote changed and local unchanged', async () => {
    safeSetJSON(STORAGE_KEYS.CHARACTER_SHEET_FORM, { keeperName: 'Unchanged' });
    localStorage.setItem('tomeOfSecrets_schemaVersion', '1');

    // Build local snapshot, then set lastHash to match it (local unchanged)
    const localSnapshot = await buildLocalSnapshot();
    const localHash = snapshotHash(localSnapshot);
    localStorage.setItem('tos_cloud_lastSyncedHash', localHash);

    // Remote has different data
    const remoteSnapshot = makeSnapshot({ formData: { keeperName: 'Newer Remote' } });
    const supabase = createMockSupabase({
      remoteRow: { data: remoteSnapshot, updated_at: new Date().toISOString() }
    });

    const result = await syncNow(supabase);

    expect(result.action).toBe('pull');
    expect(supabase._insertedSyncEvents).toHaveLength(1);
    expect(supabase._insertedSyncEvents[0].event_type).toBe('pull');
    expect(typeof supabase._insertedSyncEvents[0].snapshot_hash).toBe('string');
  });

  it('does not break sync if event logging itself throws', async () => {
    safeSetJSON(STORAGE_KEYS.CHARACTER_SHEET_FORM, { keeperName: 'Resilient' });
    localStorage.setItem('tomeOfSecrets_schemaVersion', '1');
    localStorage.setItem('tos_cloud_lastSyncedHash', 'something');

    const supabase = createMockSupabase({ remoteRow: null });
    // Override to make insert throw (exercises the catch branch in logSyncEvent)
    const originalFrom = supabase.from;
    supabase.from = jest.fn((table) => {
      if (table === 'tos_sync_events') {
        return {
          insert: jest.fn().mockRejectedValue(new Error('Network down'))
        };
      }
      return originalFrom(table);
    });

    // Sync should still succeed despite logging throwing
    const result = await syncNow(supabase);
    expect(result.action).toBe('push');
  });
});
