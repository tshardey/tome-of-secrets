/**
 * Utilities for safe localStorage operations
 */

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
 * @returns {boolean} True if successful, false otherwise
 * @example
 * safeSetJSON('selectedGenres', ['Fantasy', 'Mystery']);
 */
export const safeSetJSON = (key, value) => {
    try {
        localStorage.setItem(key, JSON.stringify(value));
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

