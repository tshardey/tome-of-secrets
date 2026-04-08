/**
 * @jest-environment jsdom
 */
import { buildLocalSnapshot, snapshotHash } from '../assets/js/services/cloudSync.js';
import { STORAGE_KEYS } from '../assets/js/character-sheet/storageKeys.js';
import { safeSetJSON } from '../assets/js/utils/storage.js';

// We test buildUpsertPayload (new export) which wraps snapshot + metadata
// into the shape sent to Supabase.
import { buildUpsertPayload } from '../assets/js/services/cloudSync.js';

describe('Cloud Sync - Upsert Metadata', () => {
  beforeEach(() => {
    localStorage.clear();
    jest.clearAllMocks();
  });

  it('buildUpsertPayload includes snapshot_hash, schema_version, and saved_at', async () => {
    localStorage.setItem('tomeOfSecrets_schemaVersion', '15');
    safeSetJSON(STORAGE_KEYS.CHARACTER_SHEET_FORM, { keeperName: 'Test' });

    const userId = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
    const payload = await buildUpsertPayload(userId);

    // Must include user_id
    expect(payload.user_id).toBe(userId);

    // Must include data (the full snapshot)
    expect(payload.data).toBeDefined();
    expect(payload.data.data.formData.keeperName).toBe('Test');

    // Must include promoted metadata columns
    expect(payload.snapshot_hash).toBe(snapshotHash(payload.data));
    expect(payload.schema_version).toBe(15);
    expect(payload.saved_at).toBeDefined();
    // saved_at should be a valid ISO string
    expect(new Date(payload.saved_at).toISOString()).toBe(payload.saved_at);
  });

  it('buildUpsertPayload handles null schema version', async () => {
    // No schemaVersion set in localStorage
    safeSetJSON(STORAGE_KEYS.CHARACTER_SHEET_FORM, { keeperName: 'NoVersion' });

    const userId = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
    const payload = await buildUpsertPayload(userId);

    expect(payload.schema_version).toBeNull();
    expect(payload.snapshot_hash).toBeDefined();
    expect(typeof payload.snapshot_hash).toBe('string');
  });

  it('buildUpsertPayload snapshot_hash is stable for same data', async () => {
    localStorage.setItem('tomeOfSecrets_schemaVersion', '15');
    safeSetJSON(STORAGE_KEYS.CHARACTER_SHEET_FORM, { keeperName: 'Stable' });

    const userId = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
    const payload1 = await buildUpsertPayload(userId);
    const payload2 = await buildUpsertPayload(userId);

    // Hash should be identical for same underlying data
    // (saved_at and updatedAt will differ, but hash is computed from data only)
    expect(payload1.snapshot_hash).toBe(payload2.snapshot_hash);
  });
});
