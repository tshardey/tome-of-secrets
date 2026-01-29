/**
 * @jest-environment jsdom
 */

// Mock the data module
jest.mock('../../assets/js/character-sheet/data.js', () => ({
    sanctumBenefits: {
        'sanctum1': {
            associatedBuffs: ['Buff1', 'Buff2']
        },
        'sanctum2': {
            associatedBuffs: ['Buff3']
        }
    }
}));

import {
    calculateDailyValue,
    isGroveTenderBuff,
    calculateTotalInkDrops,
    getAssociatedBuffs,
    getBuffState
} from '../../assets/js/services/AtmosphericBuffService.js';
import { STORAGE_KEYS } from '../../assets/js/character-sheet/storageKeys.js';

describe('AtmosphericBuffService', () => {

    describe('calculateDailyValue', () => {
        test('should return 1 for non-associated buff', () => {
            const value = calculateDailyValue('Buff1', []);
            expect(value).toBe(1);
        });

        test('should return 2 for associated buff', () => {
            const value = calculateDailyValue('Buff1', ['Buff1', 'Buff2']);
            expect(value).toBe(2);
        });

        test('should return 1 when associatedBuffs is undefined', () => {
            const value = calculateDailyValue('Buff1', undefined);
            expect(value).toBe(1);
        });
    });

    describe('isGroveTenderBuff', () => {
        test('should return true for Grove Tender with Soaking in Nature', () => {
            const result = isGroveTenderBuff('The Soaking in Nature', 'groveTender');
            expect(result).toBe(true);
        });

        test('should return false for Grove Tender with different buff', () => {
            const result = isGroveTenderBuff('Other Buff', 'groveTender');
            expect(result).toBe(false);
        });

        test('should return false for different background', () => {
            const result = isGroveTenderBuff('The Soaking in Nature', 'otherBackground');
            expect(result).toBe(false);
        });
    });

    describe('calculateTotalInkDrops', () => {
        test('should calculate total correctly', () => {
            expect(calculateTotalInkDrops(5, 1)).toBe(5);
            expect(calculateTotalInkDrops(3, 2)).toBe(6);
            expect(calculateTotalInkDrops(0, 2)).toBe(0);
        });
    });

    describe('getAssociatedBuffs', () => {
        test('should return associated buffs for valid sanctum', () => {
            const buffs = getAssociatedBuffs('sanctum1');
            expect(buffs).toEqual(['Buff1', 'Buff2']);
        });

        test('should return empty array for invalid sanctum', () => {
            const buffs = getAssociatedBuffs('invalidSanctum');
            expect(buffs).toEqual([]);
        });

        test('should return empty array for null sanctum', () => {
            const buffs = getAssociatedBuffs(null);
            expect(buffs).toEqual([]);
        });

        test('should return empty array for empty string', () => {
            const buffs = getAssociatedBuffs('');
            expect(buffs).toEqual([]);
        });
    });

    describe('getBuffState', () => {
        test('should return buff state from character state', () => {
            const state = {
                [STORAGE_KEYS.ATMOSPHERIC_BUFFS]: {
                    'Buff1': {
                        daysUsed: 5,
                        isActive: true
                    }
                }
            };
            
            const buffState = getBuffState(state, 'Buff1');
            expect(buffState.daysUsed).toBe(5);
            expect(buffState.isActive).toBe(true);
        });

        test('should return defaults for missing buff', () => {
            const state = {
                [STORAGE_KEYS.ATMOSPHERIC_BUFFS]: {}
            };
            
            const buffState = getBuffState(state, 'MissingBuff');
            expect(buffState.daysUsed).toBe(0);
            expect(buffState.isActive).toBe(false);
        });

        test('should handle missing atmospheric buffs key', () => {
            const state = {};
            
            const buffState = getBuffState(state, 'AnyBuff');
            expect(buffState.daysUsed).toBe(0);
            expect(buffState.isActive).toBe(false);
        });
    });
});

