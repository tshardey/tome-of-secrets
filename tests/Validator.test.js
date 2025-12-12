/**
 * Tests for Validator service
 */

import { Validator, required, minLength, maxLength, selected, min, allRequired, conditional, custom } from '../assets/js/services/Validator.js';

describe('Validator', () => {
    let validator;

    beforeEach(() => {
        validator = new Validator();
    });

    describe('required', () => {
        it('should validate required fields correctly', () => {
            validator.addRule('name', required('Name is required'));

            expect(validator.validate({ name: 'Test' })).toEqual({ valid: true, errors: {} });
            expect(validator.validate({ name: '' })).toEqual({ 
                valid: false, 
                errors: { name: 'Name is required' } 
            });
            expect(validator.validate({ name: null })).toEqual({ 
                valid: false, 
                errors: { name: 'Name is required' } 
            });
            expect(validator.validate({ name: undefined })).toEqual({ 
                valid: false, 
                errors: { name: 'Name is required' } 
            });
            expect(validator.validate({ name: '   ' })).toEqual({ 
                valid: false, 
                errors: { name: 'Name is required' } 
            });
        });

        it('should use default message if none provided', () => {
            validator.addRule('field', required());
            const result = validator.validate({ field: '' });
            expect(result.valid).toBe(false);
            expect(result.errors.field).toBe('This field is required');
        });
    });

    describe('minLength', () => {
        it('should validate minimum length correctly', () => {
            validator.addRule('name', minLength(3, 'Name must be at least 3 characters'));

            expect(validator.validate({ name: 'Test' })).toEqual({ valid: true, errors: {} });
            expect(validator.validate({ name: 'Te' })).toEqual({ 
                valid: false, 
                errors: { name: 'Name must be at least 3 characters' } 
            });
            expect(validator.validate({ name: '' })).toEqual({ valid: true, errors: {} }); // Empty passes, use required for that
        });

        it('should use default message if none provided', () => {
            validator.addRule('name', minLength(5));
            const result = validator.validate({ name: 'Test' });
            expect(result.valid).toBe(false);
            expect(result.errors.name).toBe('Must be at least 5 characters');
        });
    });

    describe('maxLength', () => {
        it('should validate maximum length correctly', () => {
            validator.addRule('name', maxLength(5, 'Name must be no more than 5 characters'));

            expect(validator.validate({ name: 'Test' })).toEqual({ valid: true, errors: {} });
            expect(validator.validate({ name: 'Testing' })).toEqual({ 
                valid: false, 
                errors: { name: 'Name must be no more than 5 characters' } 
            });
        });
    });

    describe('selected', () => {
        it('should validate dropdown selections correctly', () => {
            validator.addRule('option', selected('Please select an option'));

            expect(validator.validate({ option: 'value1' })).toEqual({ valid: true, errors: {} });
            expect(validator.validate({ option: '' })).toEqual({ 
                valid: false, 
                errors: { option: 'Please select an option' } 
            });
        });
    });

    describe('min', () => {
        it('should validate minimum numeric value correctly', () => {
            validator.addRule('age', min(18, 'Must be at least 18'));

            expect(validator.validate({ age: 18 })).toEqual({ valid: true, errors: {} });
            expect(validator.validate({ age: 25 })).toEqual({ valid: true, errors: {} });
            expect(validator.validate({ age: 17 })).toEqual({ 
                valid: false, 
                errors: { age: 'Must be at least 18' } 
            });
            expect(validator.validate({ age: 'not a number' })).toEqual({ 
                valid: false, 
                errors: { age: 'Must be at least 18' } 
            });
        });
    });

    describe('allRequired', () => {
        it('should validate all fields are required together', () => {
            validator.addRule('both', allRequired(['name', 'description'], 'Both name and description are required'));

            expect(validator.validate({ name: 'Test', description: 'Desc' })).toEqual({ valid: true, errors: {} });
            expect(validator.validate({ name: '', description: 'Desc' })).toEqual({ 
                valid: false, 
                errors: { both: 'Both name and description are required' } 
            });
            expect(validator.validate({ name: 'Test', description: '' })).toEqual({ 
                valid: false, 
                errors: { both: 'Both name and description are required' } 
            });
        });
    });

    describe('conditional', () => {
        it('should apply rule conditionally', () => {
            validator.addRule('optional', conditional(
                (data) => data.requireOptional === true,
                required('Optional field is required when requireOptional is true')
            ));

            expect(validator.validate({ optional: '', requireOptional: false })).toEqual({ valid: true, errors: {} });
            expect(validator.validate({ optional: '', requireOptional: true })).toEqual({ 
                valid: false, 
                errors: { optional: 'Optional field is required when requireOptional is true' } 
            });
        });
    });

    describe('custom', () => {
        it('should validate with custom predicate', () => {
            validator.addRule('email', custom(
                (value) => value.includes('@'),
                'Must be a valid email'
            ));

            expect(validator.validate({ email: 'test@example.com' })).toEqual({ valid: true, errors: {} });
            expect(validator.validate({ email: 'notanemail' })).toEqual({ 
                valid: false, 
                errors: { email: 'Must be a valid email' } 
            });
        });
    });

    describe('multiple rules', () => {
        it('should apply multiple rules to same field', () => {
            validator.addRule('name', required('Name is required'));
            validator.addRule('name', minLength(3, 'Name must be at least 3 characters'));

            expect(validator.validate({ name: 'Test' })).toEqual({ valid: true, errors: {} });
            expect(validator.validate({ name: '' })).toEqual({ 
                valid: false, 
                errors: { name: 'Name is required' } // First error stops
            });
            expect(validator.validate({ name: 'Te' })).toEqual({ 
                valid: false, 
                errors: { name: 'Name must be at least 3 characters' } 
            });
        });

        it('should validate multiple fields', () => {
            validator.addRule('name', required('Name is required'));
            validator.addRule('email', required('Email is required'));

            expect(validator.validate({ name: '', email: '' })).toEqual({ 
                valid: false, 
                errors: { name: 'Name is required', email: 'Email is required' } 
            });
            expect(validator.validate({ name: 'Test', email: 'test@example.com' })).toEqual({ 
                valid: true, 
                errors: {} 
            });
        });
    });

    describe('validateField', () => {
        it('should validate a single field', () => {
            validator.addRule('name', required('Name is required'));
            validator.addRule('name', minLength(3, 'Name must be at least 3 characters'));

            expect(validator.validateField('name', 'Test', {})).toBeNull();
            expect(validator.validateField('name', '', {})).toBe('Name is required');
            expect(validator.validateField('name', 'Te', {})).toBe('Name must be at least 3 characters');
        });

        it('should return null for fields without rules', () => {
            expect(validator.validateField('unvalidated', 'value', {})).toBeNull();
        });
    });

    describe('chaining', () => {
        it('should support method chaining', () => {
            const result = validator
                .addRule('name', required('Name is required'))
                .addRule('email', required('Email is required'))
                .validate({ name: '', email: '' });

            expect(result.valid).toBe(false);
            expect(result.errors.name).toBe('Name is required');
            expect(result.errors.email).toBe('Email is required');
        });
    });
});

