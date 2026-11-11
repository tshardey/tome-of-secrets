import { STORAGE_KEYS, CHARACTER_STATE_KEYS, createEmptyCharacterState } from './storageKeys.js';
import { safeGetJSON, safeSetJSON } from '../utils/storage.js';
import {
    validateCharacterState,
    validateFormDataSafe,
    saveSchemaVersion,
    getStoredSchemaVersion,
    rememberLoadedSchemaVersion,
    isSchemaWriteSafe,
    announceSchemaChangedElsewhere,
    SCHEMA_VERSION
} from './dataValidator.js';
import { migrateState, stripRetiredFormFields, purgeRetiredStateKeys, RETIREMENT_SCHEMA_VERSION } from './dataMigrator.js';
import { LARGE_STATE_KEYS, getStateKey, setStateKey } from './persistence.js';
import { healTidyStatus } from '../services/LibraryTidyService.js';

export const characterState = createEmptyCharacterState();
export let isStateLoaded = false;

/** For tests: reset so the next loadState() will run again. */
export function resetStateLoadedForTests() {
    isStateLoaded = false;
}

/**
 * Load state from localStorage with validation and migration
 * This ensures data consistency and handles old save formats gracefully
 * 
 * **CRITICAL:** Never loses player data. Invalid data is fixed or uses safe defaults.
 */
export async function loadState(form = null) {
    // Record the save's version first: the write gate compares against it before every write.
    rememberLoadedSchemaVersion();

    // Load and validate form data only if a form is provided
    if (form) {
        const storedFormData = safeGetJSON(STORAGE_KEYS.CHARACTER_SHEET_FORM, null);
        if (storedFormData) {
            // Drop retired fields (Ink Drops, Paper Scraps, journaling) and write the cleaned blob back
            const characterData = stripRetiredFormFields(storedFormData);
            if (Object.keys(characterData).length !== Object.keys(storedFormData).length && isSchemaWriteSafe()) {
                safeSetJSON(STORAGE_KEYS.CHARACTER_SHEET_FORM, characterData);
            }
            const validatedFormData = validateFormDataSafe(characterData);
            for (const key in validatedFormData) {
                const el = form.elements[key];
                if (el && el.type !== 'file') {
                    el.value = validatedFormData[key];
                }
            }
        }
    }
    
    // Load state, then migrate/validate (migration is synchronous but our storage reads may not be)
    const empty = createEmptyCharacterState();
    const loadedState = {};

    // Load all state keys (some from IndexedDB, some from localStorage fallback)
    for (const key of CHARACTER_STATE_KEYS) {
        // bookTidy has no default here: when a pre-v20 save has none, the v20 migration
        // decides whether the review starts pending (validation fills the default after).
        const defaultValue = key === STORAGE_KEYS.BOOK_TIDY ? null : empty[key];
        loadedState[key] = await getStateKey(key, defaultValue);
    }

    // Read before migrateState(), which bumps the stored version
    const storedVersion = getStoredSchemaVersion();
    const migratedState = migrateState(loadedState);
    if (storedVersion === null || storedVersion < RETIREMENT_SCHEMA_VERSION) {
        // v18 retired some keys; they are not in CHARACTER_STATE_KEYS so they were never loaded,
        // but old copies may still sit in localStorage or IndexedDB.
        await purgeRetiredStateKeys();
    }
    // The review can never be hidden for good (D9): an Unsorted book keeps it pending. Same
    // object when nothing changed, so a healthy save writes nothing extra.
    const validatedState = healTidyStatus(validateCharacterState(migratedState));
    
    // Copy validated state to characterState
    // This ensures all keys are properly set, including ACTIVE_ASSIGNMENTS
    Object.keys(validatedState).forEach(key => {
        characterState[key] = validatedState[key];
    });
    
    // Ensure ACTIVE_ASSIGNMENTS is always an array (safety check)
    if (!Array.isArray(characterState[STORAGE_KEYS.ACTIVE_ASSIGNMENTS])) {
        console.warn('ACTIVE_ASSIGNMENTS was not an array after loadState, fixing...');
        characterState[STORAGE_KEYS.ACTIVE_ASSIGNMENTS] = [];
    } else {
        console.log(`loadState: Loaded ${characterState[STORAGE_KEYS.ACTIVE_ASSIGNMENTS].length} active assignments`);
    }

    isStateLoaded = true;
    
    // If state was migrated or validated, save it back to ensure consistency
    // This is safe because we only save validated data
    // A run that migrated has already stored the new schema version, so whatever the migration
    // added (e.g. v20's pending bookTidy) must be written now even when it already equals the
    // validated state: the next load no longer migrates and would fall back to the default.
    const didMigrate = storedVersion === null || storedVersion < SCHEMA_VERSION;
    const needsSave = didMigrate || Object.keys(validatedState).some(key => {
        const original = migratedState[key];
        const validated = validatedState[key];
        return JSON.stringify(original) !== JSON.stringify(validated);
    });
    
    // A save from a newer build (or one another tab changed while this tab loaded) stays as it
    // is on disk: RAM is populated for display, but nothing is written back.
    if (!isSchemaWriteSafe()) {
        announceSchemaChangedElsewhere();
        return;
    }

    // Persist:
    // - Always persist LARGE_STATE_KEYS (this performs the one-time migration localStorage -> IndexedDB)
    // - Persist small keys only if we had to fix/migrate/validate them
    for (const key of CHARACTER_STATE_KEYS) {
        if (LARGE_STATE_KEYS.has(key) || needsSave) {
            await setStateKey(key, characterState[key]);
        }
    }
}

export async function saveState(form) {
    // Never overwrite or relabel a save written by a newer build or changed by another tab.
    if (!isSchemaWriteSafe()) {
        announceSchemaChangedElsewhere();
        return;
    }
    const characterData = {};
    for (const element of form.elements) {
        if (element.id && element.type !== 'button' && element.type !== 'file' && !element.id.startsWith('new-quest-') && !element.id.startsWith('fund-') && element.id !== 'item-select' && element.id !== 'ability-select' && element.id !== 'xp-needed') {
            characterData[element.id] = element.value;
        }
    }
    // Explicitly save keeperBackground to ensure it persists
    const keeperBackgroundElement = document.getElementById('keeperBackground');
    if (keeperBackgroundElement) {
        characterData.keeperBackground = keeperBackgroundElement.value;
    }
    safeSetJSON(STORAGE_KEYS.CHARACTER_SHEET_FORM, stripRetiredFormFields(characterData));
    for (const key of CHARACTER_STATE_KEYS) {
        await setStateKey(key, characterState[key]);
    }
    // Save schema version to ensure future loads know the data format
    saveSchemaVersion();
}