/**
 * @jest-environment jsdom
 */

import {
    getPeriodForDate,
    getPeriodBoundaries,
    assignQuestToPeriod,
    groupQuestsByPeriod,
    getPeriodFromQuest,
    isValidMonthName,
    normalizeQuestPeriod,
    PERIOD_TYPES
} from '../../assets/js/services/PeriodService.js';

describe('PeriodService', () => {
    describe('getPeriodForDate', () => {
        test('should return correct monthly period for date object', () => {
            const date = new Date(2026, 1, 15); // February 15, 2026
            const period = getPeriodForDate(date, PERIOD_TYPES.MONTHLY);
            expect(period).toBe('2026-02');
        });

        test('should return correct monthly period for ISO date string', () => {
            const dateString = '2026-02-15T10:30:00Z';
            const period = getPeriodForDate(dateString, PERIOD_TYPES.MONTHLY);
            expect(period).toBe('2026-02');
        });

        test('should handle January correctly', () => {
            const date = new Date(2026, 0, 1); // January 1, 2026
            const period = getPeriodForDate(date, PERIOD_TYPES.MONTHLY);
            expect(period).toBe('2026-01');
        });

        test('should handle December correctly', () => {
            const date = new Date(2026, 11, 31); // December 31, 2026
            const period = getPeriodForDate(date, PERIOD_TYPES.MONTHLY);
            expect(period).toBe('2026-12');
        });

        test('should return null for invalid date', () => {
            const period = getPeriodForDate('invalid-date', PERIOD_TYPES.MONTHLY);
            expect(period).toBeNull();
        });

        test('should default to monthly when period type not specified', () => {
            const date = new Date(2026, 1, 15);
            const period = getPeriodForDate(date);
            expect(period).toBe('2026-02');
        });

        test('should warn and use monthly for unimplemented period types', () => {
            const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();
            const date = new Date(2026, 1, 15);
            const period = getPeriodForDate(date, PERIOD_TYPES.WEEKLY);
            expect(period).toBe('2026-02'); // Falls back to monthly
            expect(consoleSpy).toHaveBeenCalled();
            consoleSpy.mockRestore();
        });
    });

    describe('getPeriodBoundaries', () => {
        test('should return correct boundaries for monthly period', () => {
            const date = new Date(2026, 1, 15); // February 15, 2026
            const boundaries = getPeriodBoundaries(date, PERIOD_TYPES.MONTHLY);
            
            expect(boundaries.startDate).toBeInstanceOf(Date);
            expect(boundaries.endDate).toBeInstanceOf(Date);
            
            // Start should be first day of month at 00:00:00
            expect(boundaries.startDate.getFullYear()).toBe(2026);
            expect(boundaries.startDate.getMonth()).toBe(1); // February (0-indexed)
            expect(boundaries.startDate.getDate()).toBe(1);
            expect(boundaries.startDate.getHours()).toBe(0);
            expect(boundaries.startDate.getMinutes()).toBe(0);
            
            // End should be last day of month at 23:59:59.999
            expect(boundaries.endDate.getFullYear()).toBe(2026);
            expect(boundaries.endDate.getMonth()).toBe(1); // February
            expect(boundaries.endDate.getDate()).toBe(28); // Last day of February 2026
            expect(boundaries.endDate.getHours()).toBe(23);
            expect(boundaries.endDate.getMinutes()).toBe(59);
        });

        test('should handle leap year February correctly', () => {
            const date = new Date(2024, 1, 15); // February 15, 2024 (leap year)
            const boundaries = getPeriodBoundaries(date, PERIOD_TYPES.MONTHLY);
            expect(boundaries.endDate.getDate()).toBe(29); // February has 29 days in leap year
        });

        test('should return null boundaries for invalid date', () => {
            const boundaries = getPeriodBoundaries('invalid-date', PERIOD_TYPES.MONTHLY);
            expect(boundaries.startDate).toBeNull();
            expect(boundaries.endDate).toBeNull();
        });
    });

    describe('assignQuestToPeriod', () => {
        test('should assign active quest to period based on dateAdded', () => {
            const quest = {
                type: 'Test Quest',
                prompt: 'Test',
                month: 'January',
                year: '2025',
                book: 'Test Book',
                dateAdded: '2026-02-15T10:30:00Z',
                dateCompleted: null
            };
            
            const assigned = assignQuestToPeriod(quest, PERIOD_TYPES.MONTHLY);
            
            expect(assigned.month).toBe('February');
            expect(assigned.year).toBe('2026');
        });

        test('should assign completed quest to period based on dateCompleted', () => {
            const quest = {
                type: 'Test Quest',
                prompt: 'Test',
                month: 'January',
                year: '2025',
                book: 'Test Book',
                dateAdded: '2026-01-15T10:30:00Z',
                dateCompleted: '2026-03-20T10:30:00Z'
            };
            
            const assigned = assignQuestToPeriod(quest, PERIOD_TYPES.MONTHLY);
            
            // Should use dateCompleted for period assignment
            expect(assigned.month).toBe('March');
            expect(assigned.year).toBe('2026');
        });

        test('should use dateAdded if dateCompleted is not set', () => {
            const quest = {
                type: 'Test Quest',
                prompt: 'Test',
                month: 'January',
                year: '2025',
                book: 'Test Book',
                dateAdded: '2026-02-15T10:30:00Z'
            };
            
            const assigned = assignQuestToPeriod(quest, PERIOD_TYPES.MONTHLY);
            
            expect(assigned.month).toBe('February');
            expect(assigned.year).toBe('2026');
        });

        test('should use current date if no dates are set', () => {
            const quest = {
                type: 'Test Quest',
                prompt: 'Test',
                month: 'January',
                year: '2025',
                book: 'Test Book'
            };
            
            const assigned = assignQuestToPeriod(quest, PERIOD_TYPES.MONTHLY);
            
            // Should have month and year set (to current month/year)
            expect(assigned.month).toBeTruthy();
            expect(assigned.year).toBeTruthy();
        });

        test('should handle invalid quest gracefully', () => {
            const assigned = assignQuestToPeriod(null, PERIOD_TYPES.MONTHLY);
            expect(assigned).toBeNull();
        });

        test('should preserve all quest properties', () => {
            const quest = {
                type: 'Test Quest',
                prompt: 'Test Prompt',
                month: 'January',
                year: '2025',
                book: 'Test Book',
                bookAuthor: 'Test Author',
                notes: 'Test Notes',
                buffs: ['Buff1'],
                dateAdded: '2026-02-15T10:30:00Z'
            };
            
            const assigned = assignQuestToPeriod(quest, PERIOD_TYPES.MONTHLY);
            
            expect(assigned.type).toBe('Test Quest');
            expect(assigned.prompt).toBe('Test Prompt');
            expect(assigned.book).toBe('Test Book');
            expect(assigned.bookAuthor).toBe('Test Author');
            expect(assigned.notes).toBe('Test Notes');
            expect(assigned.buffs).toEqual(['Buff1']);
        });
    });

    describe('groupQuestsByPeriod', () => {
        test('should group quests by period', () => {
            const quests = [
                {
                    type: 'Quest 1',
                    prompt: 'Test',
                    month: 'January',
                    year: '2026',
                    book: 'Book 1',
                    dateAdded: '2026-01-15T10:30:00Z'
                },
                {
                    type: 'Quest 2',
                    prompt: 'Test',
                    month: 'February',
                    year: '2026',
                    book: 'Book 2',
                    dateAdded: '2026-02-15T10:30:00Z'
                },
                {
                    type: 'Quest 3',
                    prompt: 'Test',
                    month: 'January',
                    year: '2026',
                    book: 'Book 3',
                    dateAdded: '2026-01-20T10:30:00Z'
                }
            ];
            
            const grouped = groupQuestsByPeriod(quests, PERIOD_TYPES.MONTHLY);
            
            expect(Object.keys(grouped)).toHaveLength(2);
            expect(grouped['2026-January']).toHaveLength(2);
            expect(grouped['2026-February']).toHaveLength(1);
        });

        test('should handle empty array', () => {
            const grouped = groupQuestsByPeriod([], PERIOD_TYPES.MONTHLY);
            expect(Object.keys(grouped)).toHaveLength(0);
        });

        test('should update quest month/year when grouping', () => {
            const quest = {
                type: 'Quest 1',
                prompt: 'Test',
                month: 'January',
                year: '2025',
                book: 'Book 1',
                dateAdded: '2026-02-15T10:30:00Z'
            };
            
            const grouped = groupQuestsByPeriod([quest], PERIOD_TYPES.MONTHLY);
            
            const groupedQuest = grouped['2026-February'][0];
            expect(groupedQuest.month).toBe('February');
            expect(groupedQuest.year).toBe('2026');
        });
    });

    describe('getPeriodFromQuest', () => {
        test('should extract period from quest month/year', () => {
            const quest = {
                month: 'February',
                year: '2026'
            };
            
            const period = getPeriodFromQuest(quest);
            expect(period).toBe('2026-02');
        });

        test('should handle January', () => {
            const quest = {
                month: 'January',
                year: '2026'
            };
            
            const period = getPeriodFromQuest(quest);
            expect(period).toBe('2026-01');
        });

        test('should handle December', () => {
            const quest = {
                month: 'December',
                year: '2026'
            };
            
            const period = getPeriodFromQuest(quest);
            expect(period).toBe('2026-12');
        });

        test('should return null for missing month', () => {
            const quest = {
                year: '2026'
            };
            
            const period = getPeriodFromQuest(quest);
            expect(period).toBeNull();
        });

        test('should return null for missing year', () => {
            const quest = {
                month: 'February'
            };
            
            const period = getPeriodFromQuest(quest);
            expect(period).toBeNull();
        });

        test('should return null for invalid month name', () => {
            const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();
            const quest = {
                month: 'InvalidMonth',
                year: '2026'
            };
            
            const period = getPeriodFromQuest(quest);
            expect(period).toBeNull();
            expect(consoleSpy).toHaveBeenCalled();
            consoleSpy.mockRestore();
        });
    });

    describe('isValidMonthName', () => {
        test('should return true for valid month names', () => {
            expect(isValidMonthName('January')).toBe(true);
            expect(isValidMonthName('February')).toBe(true);
            expect(isValidMonthName('December')).toBe(true);
        });

        test('should return false for invalid month names', () => {
            // Note: Common abbreviations like "Jan", "Oct" are now valid
            expect(isValidMonthName('Febuary')).toBe(false); // Typo
            expect(isValidMonthName('InvalidMonth')).toBe(false);
            expect(isValidMonthName('')).toBe(false);
            expect(isValidMonthName(null)).toBe(false);
            expect(isValidMonthName(undefined)).toBe(false);
        });

        test('should return true for common month abbreviations', () => {
            expect(isValidMonthName('Jan')).toBe(true);
            expect(isValidMonthName('Oct')).toBe(true);
            expect(isValidMonthName('Dec')).toBe(true);
            expect(isValidMonthName('jan')).toBe(true); // Case insensitive
            expect(isValidMonthName('OCT')).toBe(true);
        });
    });

    describe('normalizeQuestPeriod', () => {
        test('should convert numeric month to month name', () => {
            const quest = {
                type: 'Test Quest',
                prompt: 'Test',
                month: '12', // Numeric month
                year: '2025',
                book: 'Test Book'
            };
            
            const normalized = normalizeQuestPeriod(quest, PERIOD_TYPES.MONTHLY);
            
            expect(normalized.month).toBe('December');
            expect(normalized.year).toBe('2025');
        });

        test('should normalize 2-digit year to 4-digit', () => {
            const quest = {
                type: 'Test Quest',
                prompt: 'Test',
                month: 'February',
                year: '25', // 2-digit year
                book: 'Test Book'
            };
            
            const normalized = normalizeQuestPeriod(quest, PERIOD_TYPES.MONTHLY);
            
            expect(normalized.month).toBe('February');
            expect(normalized.year).toBe('2025');
        });

        test('should handle both numeric month and 2-digit year', () => {
            const quest = {
                type: 'Test Quest',
                prompt: 'Test',
                month: '12', // Numeric month
                year: '25', // 2-digit year
                book: 'Test Book'
            };
            
            const normalized = normalizeQuestPeriod(quest, PERIOD_TYPES.MONTHLY);
            
            expect(normalized.month).toBe('December');
            expect(normalized.year).toBe('2025');
        });

        test('should not warn for empty month/year (expected for card-drawn quests)', () => {
            const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();
            const quest = {
                type: 'Test Quest',
                prompt: 'Test',
                month: '', // Empty - expected for unassigned quests
                year: '', // Empty - expected for unassigned quests
                book: 'Test Book'
            };
            
            const normalized = normalizeQuestPeriod(quest, PERIOD_TYPES.MONTHLY);
            
            // Should return as-is without warnings
            expect(normalized.month).toBe('');
            expect(normalized.year).toBe('');
            expect(consoleSpy).not.toHaveBeenCalled();
            consoleSpy.mockRestore();
        });

        test('should fix invalid month when dateAdded is available', () => {
            const quest = {
                type: 'Test Quest',
                prompt: 'Test',
                month: 'Febuary', // Invalid typo (not a valid abbreviation)
                year: '2025',
                book: 'Test Book',
                dateAdded: '2026-02-15T10:30:00Z'
            };
            
            const normalized = normalizeQuestPeriod(quest, PERIOD_TYPES.MONTHLY);
            
            // Should use dateAdded to fix invalid month
            expect(normalized.month).toBe('February');
            expect(normalized.year).toBe('2026');
        });

        test('should normalize abbreviations even when dates are available (if month is valid)', () => {
            const quest = {
                type: 'Test Quest',
                prompt: 'Test',
                month: 'Jan', // Valid abbreviation
                year: '2025',
                book: 'Test Book',
                dateAdded: '2026-01-15T10:30:00Z' // Same month
            };
            
            const normalized = normalizeQuestPeriod(quest, PERIOD_TYPES.MONTHLY);
            
            // Should normalize abbreviation to full name, but keep year from date if different
            expect(normalized.month).toBe('January');
            // Year should match the date (2026) not the original (2025)
            expect(normalized.year).toBe('2026');
        });

        test('should fix invalid month when dateCompleted is available', () => {
            const quest = {
                type: 'Test Quest',
                prompt: 'Test',
                month: 'Febuary', // Typo
                year: '2025',
                book: 'Test Book',
                dateCompleted: '2026-03-20T10:30:00Z'
            };
            
            const normalized = normalizeQuestPeriod(quest, PERIOD_TYPES.MONTHLY);
            
            expect(normalized.month).toBe('March');
            expect(normalized.year).toBe('2026');
        });

        test('should prefer dateCompleted over dateAdded for completed quests', () => {
            const quest = {
                type: 'Test Quest',
                prompt: 'Test',
                month: 'Febuary', // Invalid typo
                year: '2025',
                book: 'Test Book',
                dateAdded: '2026-01-15T10:30:00Z',
                dateCompleted: '2026-03-20T10:30:00Z'
            };
            
            const normalized = normalizeQuestPeriod(quest, PERIOD_TYPES.MONTHLY);
            
            // Should use dateCompleted for period assignment
            expect(normalized.month).toBe('March');
            expect(normalized.year).toBe('2026');
        });

        test('should not change valid month/year', () => {
            const quest = {
                type: 'Test Quest',
                prompt: 'Test',
                month: 'February',
                year: '2026',
                book: 'Test Book',
                dateAdded: '2026-02-15T10:30:00Z'
            };
            
            const normalized = normalizeQuestPeriod(quest, PERIOD_TYPES.MONTHLY);
            
            expect(normalized.month).toBe('February');
            expect(normalized.year).toBe('2026');
        });

        test('should not warn for numeric months without dates (can be normalized)', () => {
            const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();
            const quest = {
                type: 'Test Quest',
                prompt: 'Test',
                month: '12', // Numeric - can be normalized
                year: '2025',
                book: 'Test Book'
            };
            
            const normalized = normalizeQuestPeriod(quest, PERIOD_TYPES.MONTHLY);
            
            // Should be normalized to December
            expect(normalized.month).toBe('December');
            expect(normalized.year).toBe('2025');
            // Should not warn for numeric values
            expect(consoleSpy).not.toHaveBeenCalled();
            consoleSpy.mockRestore();
        });

        test('should warn for truly invalid values (typos) without dates', () => {
            const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();
            const quest = {
                type: 'Test Quest',
                prompt: 'Test',
                month: 'Febuary', // Typo - can't be normalized without dates
                year: '2025',
                book: 'Test Book'
            };
            
            const normalized = normalizeQuestPeriod(quest, PERIOD_TYPES.MONTHLY);
            
            // Should remain unchanged (can't fix without dates)
            expect(normalized.month).toBe('Febuary');
            expect(normalized.year).toBe('2025');
            // Should warn for truly invalid values
            expect(consoleSpy).toHaveBeenCalled();
            consoleSpy.mockRestore();
        });

        test('should fix invalid year format', () => {
            const quest = {
                type: 'Test Quest',
                prompt: 'Test',
                month: 'February',
                year: '26', // Invalid format (should be 2026)
                book: 'Test Book',
                dateAdded: '2026-02-15T10:30:00Z'
            };
            
            const normalized = normalizeQuestPeriod(quest, PERIOD_TYPES.MONTHLY);
            
            expect(normalized.year).toBe('2026');
        });

        test('should preserve all quest properties', () => {
            const quest = {
                type: 'Test Quest',
                prompt: 'Test Prompt',
                month: 'Jan',
                year: '2025',
                book: 'Test Book',
                bookAuthor: 'Test Author',
                notes: 'Test Notes',
                buffs: ['Buff1'],
                dateAdded: '2026-02-15T10:30:00Z'
            };
            
            const normalized = normalizeQuestPeriod(quest, PERIOD_TYPES.MONTHLY);
            
            expect(normalized.type).toBe('Test Quest');
            expect(normalized.prompt).toBe('Test Prompt');
            expect(normalized.book).toBe('Test Book');
            expect(normalized.bookAuthor).toBe('Test Author');
            expect(normalized.notes).toBe('Test Notes');
            expect(normalized.buffs).toEqual(['Buff1']);
        });

        test('should handle numeric month values (legacy data)', () => {
            const quest = {
                type: 'Test Quest',
                prompt: 'Test',
                month: 12, // Numeric month (legacy data)
                year: '2025',
                book: 'Test Book'
            };
            
            // Should not throw TypeError
            expect(() => normalizeQuestPeriod(quest, PERIOD_TYPES.MONTHLY)).not.toThrow();
            
            const normalized = normalizeQuestPeriod(quest, PERIOD_TYPES.MONTHLY);
            
            // Should convert numeric month to month name
            expect(normalized.month).toBe('December');
            expect(normalized.year).toBe('2025');
        });

        test('should handle numeric year values (legacy data)', () => {
            const quest = {
                type: 'Test Quest',
                prompt: 'Test',
                month: 'February',
                year: 2025, // Numeric year (legacy data)
                book: 'Test Book'
            };
            
            // Should not throw TypeError
            expect(() => normalizeQuestPeriod(quest, PERIOD_TYPES.MONTHLY)).not.toThrow();
            
            const normalized = normalizeQuestPeriod(quest, PERIOD_TYPES.MONTHLY);
            
            // Should convert numeric year to string
            expect(normalized.month).toBe('February');
            expect(normalized.year).toBe('2025');
        });

        test('should handle both numeric month and year (legacy data)', () => {
            const quest = {
                type: 'Test Quest',
                prompt: 'Test',
                month: 3, // Numeric month
                year: 2024, // Numeric year
                book: 'Test Book'
            };
            
            // Should not throw TypeError
            expect(() => normalizeQuestPeriod(quest, PERIOD_TYPES.MONTHLY)).not.toThrow();
            
            const normalized = normalizeQuestPeriod(quest, PERIOD_TYPES.MONTHLY);
            
            // Should convert both to strings and normalize month
            expect(normalized.month).toBe('March');
            expect(normalized.year).toBe('2024');
        });

        test('should handle null/undefined month/year gracefully', () => {
            const quest1 = {
                type: 'Test Quest',
                prompt: 'Test',
                month: null,
                year: '2025',
                book: 'Test Book'
            };
            
            const quest2 = {
                type: 'Test Quest',
                prompt: 'Test',
                month: 'February',
                year: undefined,
                book: 'Test Book'
            };
            
            // Should not throw TypeError
            expect(() => normalizeQuestPeriod(quest1, PERIOD_TYPES.MONTHLY)).not.toThrow();
            expect(() => normalizeQuestPeriod(quest2, PERIOD_TYPES.MONTHLY)).not.toThrow();
            
            const normalized1 = normalizeQuestPeriod(quest1, PERIOD_TYPES.MONTHLY);
            const normalized2 = normalizeQuestPeriod(quest2, PERIOD_TYPES.MONTHLY);
            
            // Should handle null/undefined as empty strings
            expect(normalized1.month).toBe('');
            expect(normalized2.year).toBe('');
        });
    });
});
