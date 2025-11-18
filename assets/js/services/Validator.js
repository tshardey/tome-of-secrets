/**
 * Validator - Centralized form validation service
 * 
 * Provides reusable validation rules and consistent error messaging
 * for all forms in the character sheet.
 * 
 * Usage:
 *   const validator = new Validator();
 *   validator.addRule('book', required('Book title is required'));
 *   validator.addRule('month', required('Month is required'));
 *   validator.addRule('year', required('Year is required'));
 *   
 *   const result = validator.validate({ book: '', month: '01', year: '2025' });
 *   if (!result.valid) {
 *     showErrors(result.errors); // { book: 'Book title is required' }
 *   }
 */

/**
 * Validation rule function
 * @callback ValidationRule
 * @param {*} value - The value to validate
 * @param {Object} data - Optional additional data for validation context
 * @returns {string|null} - Error message if invalid, null if valid
 */

export class Validator {
    constructor() {
        this.rules = {};
    }

    /**
     * Add a validation rule for a field
     * @param {string} field - Field name
     * @param {ValidationRule|ValidationRule[]} rule - Validation rule(s)
     * @returns {Validator} - Returns this for chaining
     */
    addRule(field, rule) {
        if (!this.rules[field]) {
            this.rules[field] = [];
        }
        if (Array.isArray(rule)) {
            this.rules[field].push(...rule);
        } else {
            this.rules[field].push(rule);
        }
        return this;
    }

    /**
     * Validate data against all rules
     * @param {Object} data - Data object to validate
     * @returns {Object} - { valid: boolean, errors: Object }
     */
    validate(data) {
        const errors = {};
        
        for (const field in this.rules) {
            const value = data[field];
            const fieldRules = this.rules[field];
            
            for (const rule of fieldRules) {
                const error = rule(value, data);
                if (error) {
                    errors[field] = error;
                    break; // Stop at first error for this field
                }
            }
        }

        return {
            valid: Object.keys(errors).length === 0,
            errors
        };
    }

    /**
     * Validate a single field
     * @param {string} field - Field name
     * @param {*} value - Field value
     * @param {Object} data - Optional additional data for context
     * @returns {string|null} - Error message if invalid, null if valid
     */
    validateField(field, value, data = {}) {
        if (!this.rules[field]) {
            return null;
        }

        const fieldData = { ...data, [field]: value };
        for (const rule of this.rules[field]) {
            const error = rule(value, fieldData);
            if (error) {
                return error;
            }
        }
        return null;
    }
}

/**
 * Required field validation rule
 * @param {string} message - Error message
 * @returns {ValidationRule}
 */
export function required(message = 'This field is required') {
    return (value) => {
        if (value === null || value === undefined || value === '' || 
            (typeof value === 'string' && value.trim() === '')) {
            return message;
        }
        return null;
    };
}

/**
 * Minimum length validation rule
 * @param {number} minLength - Minimum length
 * @param {string} message - Error message
 * @returns {ValidationRule}
 */
export function minLength(minLength, message) {
    const msg = message || `Must be at least ${minLength} characters`;
    return (value) => {
        if (value && String(value).length < minLength) {
            return msg;
        }
        return null;
    };
}

/**
 * Maximum length validation rule
 * @param {number} maxLength - Maximum length
 * @param {string} message - Error message
 * @returns {ValidationRule}
 */
export function maxLength(maxLength, message) {
    const msg = message || `Must be no more than ${maxLength} characters`;
    return (value) => {
        if (value && String(value).length > maxLength) {
            return msg;
        }
        return null;
    };
}

/**
 * Custom validation rule
 * @param {Function} predicate - Function that returns true if valid
 * @param {string} message - Error message
 * @returns {ValidationRule}
 */
export function custom(predicate, message) {
    return (value, data) => {
        if (!predicate(value, data)) {
            return message;
        }
        return null;
    };
}

/**
 * Validate that a select dropdown has a value
 * @param {string} message - Error message
 * @returns {ValidationRule}
 */
export function selected(message = 'Please select an option') {
    return required(message);
}

/**
 * Validate that a number is at least a minimum value
 * @param {number} min - Minimum value
 * @param {string} message - Error message
 * @returns {ValidationRule}
 */
export function min(min, message) {
    const msg = message || `Must be at least ${min}`;
    return (value) => {
        const num = Number(value);
        if (isNaN(num) || num < min) {
            return msg;
        }
        return null;
    };
}

/**
 * Validate that multiple fields are all required together
 * @param {string[]} fields - Array of field names that must all be present
 * @param {string} message - Error message
 * @returns {ValidationRule}
 */
export function allRequired(fields, message) {
    return (value, data) => {
        const missing = fields.filter(field => {
            const val = data[field];
            return val === null || val === undefined || val === '' ||
                   (typeof val === 'string' && val.trim() === '');
        });
        
        if (missing.length > 0) {
            return message || `All fields are required: ${fields.join(', ')}`;
        }
        return null;
    };
}

/**
 * Validate based on a condition
 * @param {Function} condition - Function that returns true if validation should run
 * @param {ValidationRule} rule - Validation rule to apply conditionally
 * @returns {ValidationRule}
 */
export function conditional(condition, rule) {
    return (value, data) => {
        if (condition(data)) {
            return rule(value, data);
        }
        return null;
    };
}

