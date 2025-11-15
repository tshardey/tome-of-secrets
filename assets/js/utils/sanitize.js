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

