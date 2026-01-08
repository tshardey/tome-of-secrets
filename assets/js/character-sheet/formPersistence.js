/**
 * Form Persistence - Auto-save form data with debouncing
 * 
 * Automatically persists character sheet form data as the user types,
 * eliminating the need for manual save button clicks.
 */

import { STORAGE_KEYS } from './storageKeys.js';
import { safeSetJSON } from '../utils/storage.js';
import { debounce } from '../utils/helpers.js';

/**
 * Checks if a form element should be persisted
 * Uses the same exclusion logic as saveState() for consistency
 * @param {HTMLElement} element - The form element to check
 * @returns {boolean} True if the element should be persisted
 */
function shouldPersistElement(element) {
    // Must have an ID
    if (!element.id) {
        return false;
    }
    
    // Exclude buttons
    if (element.type === 'button' || element.type === 'submit') {
        return false;
    }
    
    // Exclude transient fields (quest creation form)
    if (element.id.startsWith('new-quest-')) {
        return false;
    }
    
    // Exclude quest creation dropdowns
    if (element.id === 'genre-quest-select' ||
        element.id === 'side-quest-select' ||
        element.id === 'dungeon-room-select' ||
        element.id === 'dungeon-encounter-select' ||
        element.id === 'dungeon-action-toggle' ||
        element.id === 'restoration-wing-select' ||
        element.id === 'restoration-project-select') {
        return false;
    }
    
    // Exclude other transient fields
    if (element.id === 'item-select' || 
        element.id === 'ability-select' || 
        element.id === 'xp-needed') {
        return false;
    }
    
    return true;
}

/**
 * Saves form data to localStorage
 * Only saves form fields, not character state arrays
 * @param {HTMLFormElement} form - The form element
 */
function saveFormData(form) {
    const characterData = {};
    
    // Collect all form elements that should be persisted
    for (const element of form.elements) {
        if (shouldPersistElement(element)) {
            characterData[element.id] = element.value;
        }
    }
    
    // Explicitly save keeperBackground to ensure it persists (same as saveState)
    const keeperBackgroundElement = document.getElementById('keeperBackground');
    if (keeperBackgroundElement) {
        characterData.keeperBackground = keeperBackgroundElement.value;
    }
    
    // Save to localStorage (same storage key as saveState uses for form data)
    // Suppress events from safeSetJSON so we can emit with the correct source
    const saved = safeSetJSON(STORAGE_KEYS.CHARACTER_SHEET_FORM, characterData, true);
    if (!saved) {
        console.warn('Form persistence: Failed to save form data to localStorage');
        return;
    }
    
    // Show save indicator
    showSaveIndicator();
    
    // Emit local state changed event with source: 'form' (more descriptive than 'localStorage')
    window.dispatchEvent(new CustomEvent('tos:localStateChanged', { 
        detail: { source: 'form' } 
    }));
}

// Store timeout ID so we can clear it if showSaveIndicator is called multiple times
let saveIndicatorTimeout = null;

/**
 * Shows the save indicator briefly
 * Exported so it can be used by the save button handler
 */
export function showSaveIndicator() {
    const indicator = document.getElementById('save-indicator');
    if (!indicator) {
        return;
    }
    
    // Clear any existing timeout to extend visibility
    if (saveIndicatorTimeout !== null) {
        clearTimeout(saveIndicatorTimeout);
        saveIndicatorTimeout = null;
    }
    
    // Remove hidden class to show
    indicator.classList.remove('hidden');
    
    // Hide after 2 seconds
    saveIndicatorTimeout = setTimeout(() => {
        indicator.classList.add('hidden');
        saveIndicatorTimeout = null;
    }, 2000);
}

/**
 * Initializes form persistence with debounced auto-save
 * @param {HTMLFormElement} form - The form element to watch
 * @param {number} debounceMs - Debounce delay in milliseconds (default: 500)
 */
export function initializeFormPersistence(form, debounceMs = 500) {
    if (!form) {
        console.warn('Form persistence: No form element provided');
        return;
    }
    
    // Create debounced save function
    const debouncedSave = debounce(() => {
        saveFormData(form);
    }, debounceMs);
    
    // Listen for input and change events on the form
    // Using capture phase to catch events from all form elements
    form.addEventListener('input', (e) => {
        // Only persist if this element should be persisted
        if (shouldPersistElement(e.target)) {
            debouncedSave();
        }
    }, true);
    
    form.addEventListener('change', (e) => {
        // Only persist if this element should be persisted
        if (shouldPersistElement(e.target)) {
            debouncedSave();
        }
    }, true);
    
    console.log('Form persistence initialized for form', form.id);
}
