/**
 * Form Error Display Utilities
 * 
 * Provides functions for displaying validation errors inline next to form fields
 * instead of using intrusive alert() dialogs.
 */

/**
 * Show an error message next to a form field
 * @param {HTMLElement} field - The form field element
 * @param {string} message - Error message to display
 */
export function showFieldError(field, message) {
    // Remove existing error
    clearFieldError(field);
    
    // Add error class to field
    field.classList.add('field-error');
    
    // Create error element
    const errorElement = document.createElement('div');
    errorElement.className = 'field-error-message';
    errorElement.textContent = message;
    errorElement.setAttribute('role', 'alert');
    errorElement.setAttribute('aria-live', 'polite');
    
    // Insert error message after the field
    field.parentNode.insertBefore(errorElement, field.nextSibling);
    
    // Scroll error into view
    errorElement.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    
    // Focus the field
    field.focus();
}

/**
 * Clear error message from a form field
 * @param {HTMLElement} field - The form field element
 */
export function clearFieldError(field) {
    field.classList.remove('field-error');
    
    // Remove existing error message element
    const existingError = field.parentNode.querySelector('.field-error-message');
    if (existingError) {
        existingError.remove();
    }
}

/**
 * Show validation errors for multiple fields
 * @param {Object} errors - Object mapping field names to error messages
 * @param {Object} fieldMap - Object mapping field names to DOM elements
 */
export function showErrors(errors, fieldMap) {
    // Clear all existing errors first
    Object.values(fieldMap).forEach(field => {
        if (field) clearFieldError(field);
    });
    
    // Show new errors
    Object.entries(errors).forEach(([fieldName, message]) => {
        const field = fieldMap[fieldName];
        if (field) {
            showFieldError(field, message);
        }
    });
}

/**
 * Clear all validation errors from form fields
 * @param {Object} fieldMap - Object mapping field names to DOM elements
 */
export function clearAllErrors(fieldMap) {
    Object.values(fieldMap).forEach(field => {
        if (field) clearFieldError(field);
    });
}

/**
 * Show a form-level error message (not tied to a specific field)
 * @param {HTMLElement} container - Container element to show error in
 * @param {string} message - Error message to display
 * @returns {HTMLElement} - The created error element
 */
export function showFormError(container, message) {
    // Remove existing form error
    clearFormError(container);
    
    // Create error element
    const errorElement = document.createElement('div');
    errorElement.className = 'form-error-message';
    errorElement.textContent = message;
    errorElement.setAttribute('role', 'alert');
    errorElement.setAttribute('aria-live', 'assertive');
    
    // Insert at the top of container
    container.insertBefore(errorElement, container.firstChild);
    
    // Scroll into view
    errorElement.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    
    return errorElement;
}

/**
 * Clear form-level error message
 * @param {HTMLElement} container - Container element
 */
export function clearFormError(container) {
    const existingError = container.querySelector('.form-error-message');
    if (existingError) {
        existingError.remove();
    }
}

