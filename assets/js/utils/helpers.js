/**
 * Utility functions for common operations
 */

/**
 * Safely parses an integer, returning a default value if parsing fails
 * @param {string|number} value - The value to parse
 * @param {number} defaultValue - The default value to return if parsing fails (default: 0)
 * @returns {number} The parsed integer or the default value
 * @example
 * parseIntOr('42', 0) // 42
 * parseIntOr('abc', 0) // 0
 * parseIntOr(null, 1) // 1
 */
export const parseIntOr = (value, defaultValue = 0) => {
    if (value === null || value === undefined || value === '') {
        return defaultValue;
    }
    const parsed = parseInt(value, 10);
    return isNaN(parsed) ? defaultValue : parsed;
};

/**
 * Safely trims a string, returning an empty string if the value is null/undefined
 * @param {string|null|undefined} value - The value to trim
 * @param {string} defaultValue - The default value to return if value is null/undefined (default: '')
 * @returns {string} The trimmed string or default value
 * @example
 * trimOrEmpty('  hello  ') // 'hello'
 * trimOrEmpty(null) // ''
 * trimOrEmpty(null, 'N/A') // 'N/A'
 */
export const trimOrEmpty = (value, defaultValue = '') => {
    if (value === null || value === undefined) {
        return defaultValue;
    }
    return String(value).trim() || defaultValue;
};

/**
 * Capitalizes the first letter of a string
 * @param {string} str - The string to capitalize
 * @returns {string} The string with first letter capitalized
 * @example
 * capitalize('hello') // 'Hello'
 * capitalize('') // ''
 */
export const capitalize = (str) => {
    if (!str || typeof str !== 'string') {
        return '';
    }
    return str.charAt(0).toUpperCase() + str.slice(1);
};

/**
 * Creates a debounced version of a function
 * @param {Function} fn - The function to debounce
 * @param {number} delay - The delay in milliseconds
 * @returns {Function} The debounced function
 * @example
 * const debouncedSave = debounce(saveState, 500);
 */
export const debounce = (fn, delay) => {
    let timeoutId;
    return (...args) => {
        clearTimeout(timeoutId);
        timeoutId = setTimeout(() => fn(...args), delay);
    };
};

/**
 * Groups an array of objects by a specified key
 * @param {Array} array - The array to group
 * @param {string|Function} key - The key to group by, or a function that returns the key
 * @returns {Object} An object with keys as group names and values as arrays of items
 * @example
 * groupBy([{type: 'A', val: 1}, {type: 'B', val: 2}], 'type')
 * // { A: [{type: 'A', val: 1}], B: [{type: 'B', val: 2}] }
 */
export const groupBy = (array, key) => {
    if (!Array.isArray(array)) {
        return {};
    }
    
    const getKey = typeof key === 'function' ? key : (item) => item[key];
    
    return array.reduce((acc, item) => {
        const group = getKey(item);
        acc[group] = acc[group] || [];
        acc[group].push(item);
        return acc;
    }, {});
};

