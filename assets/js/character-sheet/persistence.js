import { safeGetJSON, safeRemoveJSON, safeSetJSON } from '../utils/storage.js';
import { STORAGE_KEYS } from './storageKeys.js';

/**
 * IndexedDB-backed persistence for large state keys.
 *
 * Why this exists:
 * - `localStorage` is synchronous and has a small quota.
 * - IndexedDB is async and has a much larger quota.
 *
 * We route the "big" keys (quests, inventory, etc.) to IndexedDB, and keep
 * smaller, cross-page keys in localStorage for now (step-by-step migration).
 */

const DB_NAME = 'tomeOfSecrets';
const DB_VERSION = 1;
const STORE_NAME = 'state';

// These keys tend to grow without bound (especially `completedQuests`).
export const LARGE_STATE_KEYS = new Set([
    STORAGE_KEYS.ACTIVE_ASSIGNMENTS,
    STORAGE_KEYS.COMPLETED_QUESTS,
    STORAGE_KEYS.DISCARDED_QUESTS,
    STORAGE_KEYS.EQUIPPED_ITEMS,
    STORAGE_KEYS.INVENTORY_ITEMS,
    STORAGE_KEYS.LEARNED_ABILITIES,
    STORAGE_KEYS.ATMOSPHERIC_BUFFS,
    STORAGE_KEYS.ACTIVE_CURSES,
    STORAGE_KEYS.COMPLETED_CURSES,
    STORAGE_KEYS.TEMPORARY_BUFFS,
    STORAGE_KEYS.BUFF_MONTH_COUNTER
]);

let dbPromise = null;

function isIndexedDBAvailable() {
    return typeof indexedDB !== 'undefined';
}

function openDB() {
    if (!isIndexedDBAvailable()) {
        return Promise.reject(new Error('IndexedDB is not available in this environment.'));
    }

    if (dbPromise) return dbPromise;

    dbPromise = new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onupgradeneeded = () => {
            const db = request.result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                db.createObjectStore(STORE_NAME);
            }
        };

        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error || new Error('Failed to open IndexedDB.'));
    });

    return dbPromise;
}

async function idbGet(key) {
    const db = await openDB();
    return await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const store = tx.objectStore(STORE_NAME);
        const req = store.get(key);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error || new Error(`IndexedDB get failed for "${key}".`));
    });
}

async function idbSet(key, value) {
    const db = await openDB();
    return await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        const req = store.put(value, key);
        req.onsuccess = () => resolve(true);
        req.onerror = () => reject(req.error || new Error(`IndexedDB put failed for "${key}".`));
    });
}

async function idbDelete(key) {
    const db = await openDB();
    return await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        const req = store.delete(key);
        req.onsuccess = () => resolve(true);
        req.onerror = () => reject(req.error || new Error(`IndexedDB delete failed for "${key}".`));
    });
}

/**
 * Load a persisted key.
 * - For LARGE_STATE_KEYS: prefer IndexedDB, fallback to localStorage (for pre-migration saves)
 * - For others: localStorage only (for now)
 */
export async function getStateKey(key, defaultValue = null) {
    if (LARGE_STATE_KEYS.has(key) && isIndexedDBAvailable()) {
        try {
            const value = await idbGet(key);
            if (value !== undefined) return value;
        } catch (error) {
            console.warn(`Failed to read "${key}" from IndexedDB, falling back to localStorage.`, error);
        }
    }

    return safeGetJSON(key, defaultValue);
}

/**
 * Persist a key.
 * - For LARGE_STATE_KEYS: write to IndexedDB, and remove legacy localStorage copy if successful
 * - For others: localStorage only (for now)
 */
export async function setStateKey(key, value) {
    if (LARGE_STATE_KEYS.has(key) && isIndexedDBAvailable()) {
        try {
            await idbSet(key, value);
            // Keep localStorage from ballooning / hitting quota
            safeRemoveJSON(key);
            return true;
        } catch (error) {
            console.error(`Failed to write "${key}" to IndexedDB, falling back to localStorage.`, error);
            return safeSetJSON(key, value);
        }
    }

    return safeSetJSON(key, value);
}

export async function removeStateKey(key) {
    if (LARGE_STATE_KEYS.has(key) && isIndexedDBAvailable()) {
        try {
            await idbDelete(key);
        } catch (error) {
            console.warn(`Failed to delete "${key}" from IndexedDB.`, error);
        }
    }
    safeRemoveJSON(key);
    return true;
}

/**
 * Best-effort cleanup: after we successfully migrate a "large" key to IndexedDB,
 * we delete its localStorage copy to reclaim quota.
 */
export function cleanupLegacyLargeKeysInLocalStorage() {
    LARGE_STATE_KEYS.forEach(key => safeRemoveJSON(key));
}


