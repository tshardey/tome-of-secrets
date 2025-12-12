/**
 * DOM Helper Utilities
 * 
 * Provides safe, reusable functions for DOM manipulation and rendering.
 * All user-generated content is automatically sanitized.
 */

import { escapeHtml } from './sanitize.js';

/**
 * Safely sets innerHTML with sanitized content
 * @param {HTMLElement} element - The element to set content for
 * @param {string} html - The HTML content (will be sanitized if needed)
 * @param {boolean} isTrusted - If true, content is trusted and won't be escaped
 */
export function setInnerHTML(element, html, isTrusted = false) {
    if (!element) return;
    element.innerHTML = isTrusted ? html : escapeHtml(html);
}

/**
 * Safely appends HTML content to an element
 * @param {HTMLElement} element - The element to append to
 * @param {string} html - The HTML content (will be sanitized)
 * @param {boolean} isTrusted - If true, content is trusted and won't be escaped
 */
export function appendHTML(element, html, isTrusted = false) {
    if (!element) return;
    const sanitized = isTrusted ? html : escapeHtml(html);
    element.insertAdjacentHTML('beforeend', sanitized);
}

/**
 * Creates a text node with sanitized content
 * @param {string} text - The text content
 * @returns {Text} A text node
 */
export function createTextNode(text) {
    return document.createTextNode(String(text || ''));
}

/**
 * Creates an element with attributes
 * @param {string} tagName - The HTML tag name
 * @param {Object} attributes - Object of attribute key-value pairs
 * @param {string|HTMLElement} content - Text content or child element
 * @returns {HTMLElement} The created element
 */
export function createElement(tagName, attributes = {}, content = '') {
    const element = document.createElement(tagName);
    
    // Set attributes
    Object.entries(attributes).forEach(([key, value]) => {
        if (key === 'innerHTML' || key === 'textContent') {
            element[key] = value;
        } else if (key === 'data') {
            // Handle data attributes object
            Object.entries(value).forEach(([dataKey, dataValue]) => {
                element.dataset[dataKey] = String(dataValue);
            });
        } else if (value !== null && value !== undefined) {
            element.setAttribute(key, String(value));
        }
    });
    
    // Set content
    if (content) {
        if (typeof content === 'string') {
            element.textContent = content;
        } else if (content instanceof HTMLElement) {
            element.appendChild(content);
        }
    }
    
    return element;
}

/**
 * Clears an element's content
 * @param {HTMLElement} element - The element to clear
 */
export function clearElement(element) {
    if (element) {
        element.innerHTML = '';
    }
}

/**
 * Safely builds HTML string with escaped values
 * Use template literals for trusted content, this function for user content
 * @param {string} template - Template string with ${} placeholders
 * @param {Object} values - Object with values to interpolate (will be escaped)
 * @returns {string} The built HTML string
 * @example
 * buildHTML('<div>${name}</div>', { name: '<script>alert("xss")</script>' })
 * // Returns: '<div>&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;</div>'
 */
export function buildHTML(template, values = {}) {
    let result = template;
    Object.entries(values).forEach(([key, value]) => {
        const placeholder = new RegExp(`\\$\\{${key}\\}`, 'g');
        result = result.replace(placeholder, escapeHtml(String(value || '')));
    });
    return result;
}

