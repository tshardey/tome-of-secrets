/**
 * Utilities for safe localStorage operations
 */

// Allowlist of cloud-synced localStorage keys.
// These keys should trigger sync events when changed.
// Note: Large state keys (stored in IndexedDB) are handled separately in persistence.js
// This list includes: form data, monthly books, and small character state keys in localStorage
const CLOUD_SYNCED_LOCALSTORAGE_KEYS = new Set([
    'characterSheet', // STORAGE_KEYS.CHARACTER_SHEET_FORM
    'monthlyCompletedBooks', // STORAGE_KEYS.MONTHLY_COMPLETED_BOOKS
    // Small character state keys (not in LARGE_STATE_KEYS, stored in localStorage):
    'selectedGenres', // STORAGE_KEYS.SELECTED_GENRES
    'genreDiceSelection', // STORAGE_KEYS.GENRE_DICE_SELECTION
    'shelfBookColors', // STORAGE_KEYS.SHELF_BOOK_COLORS
    'dustyBlueprints', // STORAGE_KEYS.DUSTY_BLUEPRINTS
    'completedRestorationProjects', // STORAGE_KEYS.COMPLETED_RESTORATION_PROJECTS
    'completedWings', // STORAGE_KEYS.COMPLETED_WINGS
    'passiveItemSlots', // STORAGE_KEYS.PASSIVE_ITEM_SLOTS
    'passiveFamiliarSlots' // STORAGE_KEYS.PASSIVE_FAMILIAR_SLOTS
]);

/**
 * Safely parses JSON from localStorage, returning a default value on error
 * @param {string} key - The localStorage key
 * @param {*} defaultValue - The default value to return if parsing fails or key doesn't exist
 * @returns {*} The parsed value or default value
 * @example
 * const genres = safeGetJSON('selectedGenres', []);
 * const config = safeGetJSON('config', {});
 */
export const safeGetJSON = (key, defaultValue = null) => {
    try {
        const item = localStorage.getItem(key);
        if (item === null) {
            return defaultValue;
        }
        return JSON.parse(item);
    } catch (error) {
        console.warn(`Failed to parse JSON from localStorage key "${key}":`, error);
        return defaultValue;
    }
};

/**
 * Safely sets a value in localStorage as JSON
 * @param {string} key - The localStorage key
 * @param {*} value - The value to store
 * @param {boolean} suppressEvents - If true, do not emit sync events (default: false)
 * @returns {boolean} True if successful, false otherwise
 * @example
 * safeSetJSON('selectedGenres', ['Fantasy', 'Mystery']);
 * safeSetJSON('formData', data, true); // Suppress events (e.g., when applying cloud snapshot)
 */
export const safeSetJSON = (key, value, suppressEvents = false) => {
    try {
        localStorage.setItem(key, JSON.stringify(value));
        
        // Emit event for cloud-synced keys (unless suppressed)
        if (!suppressEvents && CLOUD_SYNCED_LOCALSTORAGE_KEYS.has(key)) {
            window.dispatchEvent(new CustomEvent('tos:localStateChanged', {
                detail: { source: 'localStorage', key }
            }));
        }
        
        return true;
    } catch (error) {
        console.error(`Failed to set JSON in localStorage key "${key}":`, error);
        // Handle quota exceeded or other errors
        if (error.name === 'QuotaExceededError') {
            console.error('localStorage quota exceeded');
        }
        return false;
    }
};

/**
 * Removes an item from localStorage
 * @param {string} key - The localStorage key
 * @returns {boolean} True if the item existed and was removed
 */
export const safeRemoveJSON = (key) => {
    try {
        if (localStorage.getItem(key) !== null) {
            localStorage.removeItem(key);
            return true;
        }
        return false;
    } catch (error) {
        console.error(`Failed to remove localStorage key "${key}":`, error);
        return false;
    }
};

