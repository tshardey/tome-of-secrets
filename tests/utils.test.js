/**
 * @jest-environment jsdom
 */
import {
    parseIntOr,
    trimOrEmpty,
    capitalize,
    debounce,
    groupBy
} from '../assets/js/utils/helpers.js';

import {
    safeGetJSON,
    safeSetJSON,
    safeRemoveJSON
} from '../assets/js/utils/storage.js';

import {
    escapeHtml,
    sanitizeString
} from '../assets/js/utils/sanitize.js';

describe('helpers.js', () => {
    describe('parseIntOr', () => {
        it('parses valid integer strings', () => {
            expect(parseIntOr('42', 0)).toBe(42);
            expect(parseIntOr('100', 0)).toBe(100);
            expect(parseIntOr('-5', 0)).toBe(-5);
        });

        it('returns default value for invalid strings', () => {
            expect(parseIntOr('abc', 0)).toBe(0);
            expect(parseIntOr('12.5', 0)).toBe(12); // parseInt truncates decimals
            expect(parseIntOr('not a number', 0)).toBe(0);
        });

        it('returns default value for null/undefined/empty', () => {
            expect(parseIntOr(null, 0)).toBe(0);
            expect(parseIntOr(undefined, 0)).toBe(0);
            expect(parseIntOr('', 0)).toBe(0);
        });

        it('uses custom default values', () => {
            expect(parseIntOr(null, 1)).toBe(1);
            expect(parseIntOr('abc', 100)).toBe(100);
            expect(parseIntOr('', -1)).toBe(-1);
        });

        it('handles numeric input', () => {
            expect(parseIntOr(42, 0)).toBe(42);
            expect(parseIntOr(0, 10)).toBe(0);
        });
    });

    describe('trimOrEmpty', () => {
        it('trims whitespace from strings', () => {
            expect(trimOrEmpty('  hello  ')).toBe('hello');
            expect(trimOrEmpty('  world  ')).toBe('world');
            expect(trimOrEmpty('\t\n  test  \n\t')).toBe('test');
        });

        it('returns empty string for null/undefined', () => {
            expect(trimOrEmpty(null)).toBe('');
            expect(trimOrEmpty(undefined)).toBe('');
        });

        it('uses custom default values', () => {
            expect(trimOrEmpty(null, 'N/A')).toBe('N/A');
            expect(trimOrEmpty(undefined, 'default')).toBe('default');
        });

        it('handles empty strings', () => {
            expect(trimOrEmpty('')).toBe('');
            expect(trimOrEmpty('   ')).toBe('');
        });

        it('handles non-string values', () => {
            expect(trimOrEmpty(123)).toBe('123');
            expect(trimOrEmpty(true)).toBe('true');
        });
    });

    describe('capitalize', () => {
        it('capitalizes first letter', () => {
            expect(capitalize('hello')).toBe('Hello');
            expect(capitalize('world')).toBe('World');
            expect(capitalize('test')).toBe('Test');
        });

        it('handles empty strings', () => {
            expect(capitalize('')).toBe('');
        });

        it('handles null/undefined', () => {
            expect(capitalize(null)).toBe('');
            expect(capitalize(undefined)).toBe('');
        });

        it('handles already capitalized strings', () => {
            expect(capitalize('Hello')).toBe('Hello');
            expect(capitalize('WORLD')).toBe('WORLD');
        });

        it('handles single character strings', () => {
            expect(capitalize('a')).toBe('A');
            expect(capitalize('A')).toBe('A');
        });
    });

    describe('debounce', () => {
        jest.useFakeTimers();

        it('delays function execution', () => {
            const fn = jest.fn();
            const debounced = debounce(fn, 100);

            debounced('arg1', 'arg2');
            expect(fn).not.toHaveBeenCalled();

            jest.advanceTimersByTime(100);
            expect(fn).toHaveBeenCalledWith('arg1', 'arg2');
            expect(fn).toHaveBeenCalledTimes(1);
        });

        it('cancels previous calls on new call', () => {
            const fn = jest.fn();
            const debounced = debounce(fn, 100);

            debounced('first');
            jest.advanceTimersByTime(50);
            debounced('second');
            jest.advanceTimersByTime(50);
            expect(fn).not.toHaveBeenCalled();

            jest.advanceTimersByTime(50);
            expect(fn).toHaveBeenCalledWith('second');
            expect(fn).toHaveBeenCalledTimes(1);
        });

        afterEach(() => {
            jest.clearAllTimers();
        });
    });

    describe('groupBy', () => {
        it('groups array by string key', () => {
            const items = [
                { type: 'A', value: 1 },
                { type: 'B', value: 2 },
                { type: 'A', value: 3 }
            ];
            const result = groupBy(items, 'type');
            expect(result).toEqual({
                A: [{ type: 'A', value: 1 }, { type: 'A', value: 3 }],
                B: [{ type: 'B', value: 2 }]
            });
        });

        it('groups array by function key', () => {
            const items = [1, 2, 3, 4, 5];
            const result = groupBy(items, (n) => n % 2 === 0 ? 'even' : 'odd');
            expect(result).toEqual({
                odd: [1, 3, 5],
                even: [2, 4]
            });
        });

        it('handles empty array', () => {
            expect(groupBy([], 'type')).toEqual({});
        });

        it('handles non-array input', () => {
            expect(groupBy(null, 'type')).toEqual({});
            expect(groupBy(undefined, 'type')).toEqual({});
            expect(groupBy('not an array', 'type')).toEqual({});
        });
    });
});

describe('storage.js', () => {
    beforeEach(() => {
        localStorage.clear();
    });

    describe('safeGetJSON', () => {
        it('parses valid JSON from localStorage', () => {
            localStorage.setItem('test', JSON.stringify({ key: 'value' }));
            expect(safeGetJSON('test', null)).toEqual({ key: 'value' });
        });

        it('returns default for missing key', () => {
            expect(safeGetJSON('missing', [])).toEqual([]);
            expect(safeGetJSON('missing', {})).toEqual({});
            expect(safeGetJSON('missing', null)).toBeNull();
        });

        it('handles invalid JSON gracefully', () => {
            localStorage.setItem('invalid', 'not valid json');
            expect(safeGetJSON('invalid', {})).toEqual({});
        });

        it('handles array defaults', () => {
            expect(safeGetJSON('missing', [])).toEqual([]);
            localStorage.setItem('array', JSON.stringify([1, 2, 3]));
            expect(safeGetJSON('array', [])).toEqual([1, 2, 3]);
        });

        it('handles null values in storage', () => {
            localStorage.setItem('null', 'null');
            expect(safeGetJSON('null', 'default')).toBeNull();
        });
    });

    describe('safeSetJSON', () => {
        it('stores values as JSON', () => {
            expect(safeSetJSON('test', { key: 'value' })).toBe(true);
            expect(localStorage.getItem('test')).toBe(JSON.stringify({ key: 'value' }));
        });

        it('stores arrays as JSON', () => {
            expect(safeSetJSON('array', [1, 2, 3])).toBe(true);
            expect(JSON.parse(localStorage.getItem('array'))).toEqual([1, 2, 3]);
        });

        it('handles storage errors gracefully', () => {
            // Mock localStorage.setItem to throw an error
            const originalSetItem = Storage.prototype.setItem;
            Storage.prototype.setItem = jest.fn(() => {
                throw new Error('QuotaExceededError');
            });

            expect(safeSetJSON('test', { key: 'value' })).toBe(false);

            // Restore
            Storage.prototype.setItem = originalSetItem;
        });
    });

    describe('safeRemoveJSON', () => {
        it('removes existing items', () => {
            localStorage.setItem('test', 'value');
            expect(safeRemoveJSON('test')).toBe(true);
            expect(localStorage.getItem('test')).toBeNull();
        });

        it('returns false for non-existent items', () => {
            expect(safeRemoveJSON('missing')).toBe(false);
        });

        it('handles removal errors gracefully', () => {
            const originalRemoveItem = Storage.prototype.removeItem;
            Storage.prototype.removeItem = jest.fn(() => {
                throw new Error('Storage error');
            });

            expect(safeRemoveJSON('test')).toBe(false);

            // Restore
            Storage.prototype.removeItem = originalRemoveItem;
        });
    });
});

describe('sanitize.js', () => {
    describe('escapeHtml', () => {
        it('escapes HTML special characters', () => {
            expect(escapeHtml('<script>alert("xss")</script>')).toBe('&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;');
            expect(escapeHtml('<div>content</div>')).toBe('&lt;div&gt;content&lt;/div&gt;');
            expect(escapeHtml('text & more')).toBe('text &amp; more');
        });

        it('handles null/undefined', () => {
            expect(escapeHtml(null)).toBe('');
            expect(escapeHtml(undefined)).toBe('');
        });

        it('handles single quotes', () => {
            expect(escapeHtml("it's working")).toBe('it&#039;s working');
        });

        it('handles double quotes', () => {
            expect(escapeHtml('say "hello"')).toBe('say &quot;hello&quot;');
        });

        it('handles plain text without changes', () => {
            expect(escapeHtml('plain text')).toBe('plain text');
            expect(escapeHtml('Hello World')).toBe('Hello World');
        });
    });

    describe('sanitizeString', () => {
        it('trims and escapes HTML', () => {
            expect(sanitizeString('  <script>alert("xss")</script>  ')).toBe('&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;');
            expect(sanitizeString('  hello world  ')).toBe('hello world');
        });

        it('handles null/undefined', () => {
            expect(sanitizeString(null)).toBe('');
            expect(sanitizeString(undefined)).toBe('');
        });

        it('handles non-string values', () => {
            expect(sanitizeString(123)).toBe('123');
            expect(sanitizeString(true)).toBe('true');
        });
    });
});

