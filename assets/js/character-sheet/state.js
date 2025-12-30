import { STORAGE_KEYS, CHARACTER_STATE_KEYS, createEmptyCharacterState } from './storageKeys.js';
import { safeGetJSON, safeSetJSON } from '../utils/storage.js';
import { validateCharacterState, validateFormDataSafe, saveSchemaVersion } from './dataValidator.js';
import { loadAndMigrateState } from './dataMigrator.js';

export const characterState = createEmptyCharacterState();

/**
 * Load state from localStorage with validation and migration
 * This ensures data consistency and handles old save formats gracefully
 * 
 * **CRITICAL:** Never loses player data. Invalid data is fixed or uses safe defaults.
 */
export function loadState(form = null) {
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
    
    // Load, migrate, and validate state
    const loadedState = loadAndMigrateState();
    const validatedState = validateCharacterState(loadedState);
    
    // Copy validated state to characterState
    Object.keys(validatedState).forEach(key => {
        characterState[key] = validatedState[key];
    });
    
    // If state was migrated or validated, save it back to ensure consistency
    // This is safe because we only save validated data
    const needsSave = Object.keys(validatedState).some(key => {
        const original = loadedState[key];
        const validated = validatedState[key];
        return JSON.stringify(original) !== JSON.stringify(validated);
    });
    
    if (needsSave) {
        // Silently save validated state back to localStorage
        // This ensures future loads are faster and data is consistent
        CHARACTER_STATE_KEYS.forEach(key => {
            safeSetJSON(key, characterState[key]);
        });
    }
}

export function saveState(form) {
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
    CHARACTER_STATE_KEYS.forEach(key => {
        safeSetJSON(key, characterState[key]);
    });
    // Save schema version to ensure future loads know the data format
    saveSchemaVersion();
}