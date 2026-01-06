import { safeGetJSON, safeSetJSON } from '../utils/storage.js';
import { STORAGE_KEYS, CHARACTER_STATE_KEYS, createEmptyCharacterState } from '../character-sheet/storageKeys.js';
import { getStateKey, setStateKey } from '../character-sheet/persistence.js';

const SYNC_TABLE = 'tos_saves';
const SYNC_KEY_LAST_HASH = 'tos_cloud_lastSyncedHash';
const SYNC_KEY_LAST_AT = 'tos_cloud_lastSyncedAt';
const SYNC_KEY_LAST_SOURCE = 'tos_cloud_lastSyncedSource';

function stableStringify(value) {
  // Canonical JSON stringify: recursively sort object keys so hashing is stable
  // across environments (e.g., Postgres jsonb may return keys in a different order).
  const canonicalize = (v) => {
    if (v === null || v === undefined) return v;
    if (Array.isArray(v)) return v.map(canonicalize);
    if (typeof v === 'object') {
      const out = {};
      Object.keys(v).sort().forEach((k) => {
        out[k] = canonicalize(v[k]);
      });
      return out;
    }
    return v;
  };

  return JSON.stringify(canonicalize(value));
}

function hashString(str) {
  // djb2
  let hash = 5381;
  for (let i = 0; i < str.length; i += 1) {
    hash = ((hash << 5) + hash) ^ str.charCodeAt(i);
  }
  // Convert to unsigned base36
  return (hash >>> 0).toString(36);
}

export async function buildLocalSnapshot() {
  const empty = createEmptyCharacterState();

  const stateData = {};
  for (const key of CHARACTER_STATE_KEYS) {
    stateData[key] = await getStateKey(key, empty[key]);
  }

  // Form data is still in localStorage (small and used by many pages)
  const formData = safeGetJSON(STORAGE_KEYS.CHARACTER_SHEET_FORM, {});
  const monthlyCompletedBooks = safeGetJSON(STORAGE_KEYS.MONTHLY_COMPLETED_BOOKS, []);
  const schemaVersion = localStorage.getItem('tomeOfSecrets_schemaVersion') || null;
  // Note: we intentionally do NOT sync activeCharacterTab. It's UI-only state and can cause
  // confusing "cloud has newer changes" prompts when multiple windows are open.

  return {
    version: schemaVersion ? parseInt(schemaVersion, 10) : null,
    updatedAt: new Date().toISOString(),
    data: {
      formData,
      characterState: stateData,
      monthlyCompletedBooks
    }
  };
}

export function snapshotHash(snapshot) {
  return hashString(stableStringify(snapshot.data));
}

export async function applySnapshot(snapshot) {
  if (!snapshot || !snapshot.data) {
    throw new Error('Invalid snapshot.');
  }

  const { data } = snapshot;

  if (snapshot.version !== null && snapshot.version !== undefined) {
    localStorage.setItem('tomeOfSecrets_schemaVersion', String(snapshot.version));
  }

  // Back-compat: older cloud saves may include activeCharacterTab; ignore it.

  // Suppress events when applying cloud snapshots to prevent sync loops
  safeSetJSON(STORAGE_KEYS.CHARACTER_SHEET_FORM, data.formData || {}, true);
  safeSetJSON(STORAGE_KEYS.MONTHLY_COMPLETED_BOOKS, Array.isArray(data.monthlyCompletedBooks) ? data.monthlyCompletedBooks : [], true);

  const state = data.characterState || {};
  for (const key of CHARACTER_STATE_KEYS) {
    if (key in state) {
      await setStateKey(key, state[key], true); // suppressEvents = true
    }
  }
}

async function getRemoteSave(supabase) {
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) throw sessionError;
  const session = sessionData?.session;
  if (!session) {
    throw new Error('Not signed in.');
  }
  const userId = session.user.id;

  const { data, error } = await supabase
    .from(SYNC_TABLE)
    .select('data, updated_at')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) throw error;
  return data || null;
}

async function upsertRemoteSave(supabase, snapshot) {
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) throw sessionError;
  const session = sessionData?.session;
  if (!session) {
    throw new Error('Not signed in.');
  }
  const userId = session.user.id;

  const { error } = await supabase
    .from(SYNC_TABLE)
    .upsert({ user_id: userId, data: snapshot }, { onConflict: 'user_id' });

  if (error) throw error;
}

function getLastSyncedHash() {
  return localStorage.getItem(SYNC_KEY_LAST_HASH) || '';
}

export function getLastSyncedAt() {
  return localStorage.getItem(SYNC_KEY_LAST_AT) || '';
}

export function getLastSyncedSource() {
  return localStorage.getItem(SYNC_KEY_LAST_SOURCE) || '';
}

function setLastSynced(hash, source = '') {
  localStorage.setItem(SYNC_KEY_LAST_HASH, hash);
  localStorage.setItem(SYNC_KEY_LAST_AT, new Date().toISOString());
  if (source) {
    localStorage.setItem(SYNC_KEY_LAST_SOURCE, source);
  }
}

function confirmChoice(message) {
  // Keep this dead-simple for now (solo-dev UX). We can replace with a modal later.
  return window.confirm(message);
}

/**
 * Sync algorithm (simple + safe for solo use):
 * - If this device hasn't changed since last sync (hash matches), and remote differs -> pull remote.
 * - If remote matches last sync and local differs -> push local.
 * - If both differ (conflict) -> prompt user.
 * - On first sync -> prompt user.
 */
export async function syncNow(supabase) {
  return await syncNowWithOptions(supabase, { mode: 'manual' });
}

/**
 * Auto-sync is intentionally conservative:
 * - It will auto-push only when remote has not changed since last sync.
 * - It will NOT auto-pull (to avoid surprising overwrites / reloads).
 * - It will NOT prompt; instead it returns a "manual required" result.
 */
export async function syncAuto(supabase) {
  return await syncNowWithOptions(supabase, { mode: 'auto' });
}

async function syncNowWithOptions(supabase, { mode }) {
  const localSnapshot = await buildLocalSnapshot();
  const localHash = snapshotHash(localSnapshot);
  const lastHash = getLastSyncedHash();

  const remoteRow = await getRemoteSave(supabase);
  const remoteSnapshot = remoteRow?.data || null;
  const remoteHash = remoteSnapshot ? snapshotHash(remoteSnapshot) : '';

  // No remote save yet
  if (!remoteSnapshot) {
    if (mode === 'auto' && !lastHash) {
      // First time: require manual user choice.
      return { action: 'manual_required', detail: 'Auto-sync needs an initial manual sync to establish a baseline.' };
    }
    await upsertRemoteSave(supabase, localSnapshot);
    setLastSynced(localHash, mode);
    return { action: 'push', detail: 'Created cloud save from local data.' };
  }

  // Exact match
  if (localHash === remoteHash) {
    setLastSynced(localHash, mode);
    return { action: 'noop', detail: 'Already in sync.' };
  }

  // First-time sync (no lastHash) -> ask
  if (!lastHash) {
    if (mode === 'auto') {
      return { action: 'manual_required', detail: 'Cloud save exists. Click “Sync now” once to choose whether to pull or push.' };
    }
    const useRemote = confirmChoice(
      'A cloud save exists, but this device has never synced before.\n\n' +
      'Click OK to REPLACE local data with the cloud save.\n' +
      'Click Cancel to UPLOAD local data and overwrite the cloud save.'
    );

    if (useRemote) {
      await applySnapshot(remoteSnapshot);
      setLastSynced(remoteHash, mode);
      return { action: 'pull', detail: 'Replaced local data with cloud save (reload recommended).' };
    }

    await upsertRemoteSave(supabase, localSnapshot);
    setLastSynced(localHash, mode);
    return { action: 'push', detail: 'Overwrote cloud save with local data.' };
  }

  const localUnchangedSinceLastSync = localHash === lastHash;
  const remoteUnchangedSinceLastSync = remoteHash === lastHash;

  // Local unchanged, remote changed -> pull
  if (localUnchangedSinceLastSync && !remoteUnchangedSinceLastSync) {
    await applySnapshot(remoteSnapshot);
    setLastSynced(remoteHash, mode);
    return { action: 'pull', detail: 'Pulled newer cloud save (reload recommended).' };
  }

  // Remote unchanged, local changed -> push
  if (!localUnchangedSinceLastSync && remoteUnchangedSinceLastSync) {
    await upsertRemoteSave(supabase, localSnapshot);
    setLastSynced(localHash, mode);
    return { action: 'push', detail: 'Uploaded local changes to cloud save.' };
  }

  // Conflict -> prompt
  if (mode === 'auto') {
    return { action: 'manual_required', detail: 'Both local and cloud changed. Click “Sync now” to resolve.' };
  }
  const useRemote = confirmChoice(
    'Both local and cloud data have changed since the last sync.\n\n' +
    'Click OK to KEEP the cloud save (replace local).\n' +
    'Click Cancel to KEEP local data (overwrite cloud).'
  );

  if (useRemote) {
    await applySnapshot(remoteSnapshot);
    setLastSynced(remoteHash, mode);
    return { action: 'pull', detail: 'Conflict resolved in favor of cloud (reload recommended).' };
  }

  await upsertRemoteSave(supabase, localSnapshot);
  setLastSynced(localHash, mode);
  return { action: 'push', detail: 'Conflict resolved in favor of local (cloud overwritten).' };
}


