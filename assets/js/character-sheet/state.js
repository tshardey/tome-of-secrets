import { STORAGE_KEYS, CHARACTER_STATE_KEYS, createEmptyCharacterState } from './storageKeys.js';
import { safeGetJSON, safeSetJSON } from '../utils/storage.js';
import { validateCharacterState, validateFormDataSafe, saveSchemaVersion } from './dataValidator.js';
import { migrateState } from './dataMigrator.js';
import { LARGE_STATE_KEYS, getStateKey, setStateKey } from './persistence.js';

export const characterState = createEmptyCharacterState();
export let isStateLoaded = false;

/**
 * Load state from localStorage with validation and migration
 * This ensures data consistency and handles old save formats gracefully
 * 
 * **CRITICAL:** Never loses player data. Invalid data is fixed or uses safe defaults.
 */
export async function loadState(form = null) {
    // Load and validate form data only if a form is provided
    if (form) {
        const characterData = safeGetJSON(STORAGE_KEYS.CHARACTER_SHEET_FORM, null);
        if (characterData) {
            const validatedFormData = validateFormDataSafe(characterData);
            for (const key in validatedFormData) {
                if (form.elements[key]) {
                    form.elements[key].value = validatedFormData[key];
                }
            }
        }
    }
    
    // Load state, then migrate/validate (migration is synchronous but our storage reads may not be)
    const empty = createEmptyCharacterState();
    const loadedState = {};

    // Load all state keys (some from IndexedDB, some from localStorage fallback)
    for (const key of CHARACTER_STATE_KEYS) {
        const defaultValue = empty[key];
        loadedState[key] = await getStateKey(key, defaultValue);
    }

    const migratedState = migrateState(loadedState);
    const validatedState = validateCharacterState(migratedState);
    
    // Copy validated state to characterState
    Object.keys(validatedState).forEach(key => {
        characterState[key] = validatedState[key];
    });

    isStateLoaded = true;
    
    // If state was migrated or validated, save it back to ensure consistency
    // This is safe because we only save validated data
    const needsSave = Object.keys(validatedState).some(key => {
        const original = migratedState[key];
        const validated = validatedState[key];
        return JSON.stringify(original) !== JSON.stringify(validated);
    });
    
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
    const characterData = {};
    for (const element of form.elements) {
        if (element.id && element.type !== 'button' && !element.id.startsWith('new-quest-') && element.id !== 'item-select' && element.id !== 'ability-select' && element.id !== 'xp-needed') {
            characterData[element.id] = element.value;
        }
    }
    // Explicitly save keeperBackground to ensure it persists
    const keeperBackgroundElement = document.getElementById('keeperBackground');
    if (keeperBackgroundElement) {
        characterData.keeperBackground = keeperBackgroundElement.value;
    }
    safeSetJSON(STORAGE_KEYS.CHARACTER_SHEET_FORM, characterData);
    for (const key of CHARACTER_STATE_KEYS) {
        await setStateKey(key, characterState[key]);
    }
    // Save schema version to ensure future loads know the data format
    saveSchemaVersion();
}