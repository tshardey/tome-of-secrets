/**
 * Utilities for sanitizing user input and HTML content
 */

/**
 * Escapes HTML special characters to prevent XSS attacks
 * @param {string} unsafe - The string to escape
 * @returns {string} The escaped string
 * @example
 * escapeHtml('<script>alert("xss")</script>')
 * // "&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;"
 */
export const escapeHtml = (unsafe) => {
    if (unsafe === null || unsafe === undefined) {
        return '';
    }
    const str = String(unsafe);
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
};

/**
 * Decodes HTML entities in a string
 * @param {string} str - The string to decode
 * @returns {string} The decoded string
 * @example
 * decodeHtmlEntities('Carl&#039;s')
 * // "Carl's"
 */
export const decodeHtmlEntities = (str) => {
    if (!str || typeof str !== 'string') {
        return '';
    }
    // Create a temporary textarea element to decode HTML entities
    const textarea = document.createElement('textarea');
    textarea.innerHTML = str;
    return textarea.value;
};

/**
 * Sanitizes a string by trimming and escaping HTML
 * @param {string} value - The value to sanitize
 * @returns {string} The sanitized string
 */
export const sanitizeString = (value) => {
    if (value === null || value === undefined) {
        return '';
    }
    return escapeHtml(String(value).trim());
};

