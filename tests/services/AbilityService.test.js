/**
 * @jest-environment jsdom
 */

// Mock the data module
jest.mock('../../assets/js/character-sheet/data.js', () => ({
    masteryAbilities: {
        'Fireball': { school: 'Evocation', cost: 5 },
        'Shield': { school: 'Abjuration', cost: 3 },
        'Heal': { school: 'Restoration', cost: 4 },
        'Invisibility': { school: 'Illusion', cost: 6 }
    }
}));

import {
    getLearnedAbilities,
    getUnlearnedAbilities,
    formatAbilityOptionText
} from '../../assets/js/services/AbilityService.js';

describe('AbilityService', () => {

    describe('getLearnedAbilities', () => {
        test('should return empty array when no abilities learned', () => {
            const result = getLearnedAbilities([]);
            expect(result).toEqual([]);
        });

        test('should return learned abilities with data', () => {
            const learnedNames = ['Fireball', 'Shield'];
            const result = getLearnedAbilities(learnedNames);
            
            expect(result).toHaveLength(2);
            expect(result[0]).toEqual({ name: 'Fireball', ability: { school: 'Evocation', cost: 5 } });
            expect(result[1]).toEqual({ name: 'Shield', ability: { school: 'Abjuration', cost: 3 } });
        });

        test('should filter out invalid ability names', () => {
            const learnedNames = ['Fireball', 'InvalidAbility', 'Shield'];
            const result = getLearnedAbilities(learnedNames);
            
            expect(result).toHaveLength(2);
            expect(result.map(a => a.name)).toEqual(['Fireball', 'Shield']);
        });
    });

    describe('getUnlearnedAbilities', () => {
        test('should return all abilities when none are learned', () => {
            const result = getUnlearnedAbilities([]);
            
            expect(result.length).toBe(4);
            expect(result.map(a => a.name).sort()).toEqual(['Fireball', 'Heal', 'Invisibility', 'Shield']);
        });

        test('should return only unlearned abilities', () => {
            const learnedNames = ['Fireball', 'Shield'];
            const result = getUnlearnedAbilities(learnedNames);
            
            expect(result.length).toBe(2);
            expect(result.map(a => a.name).sort()).toEqual(['Heal', 'Invisibility']);
        });

        test('should return empty array when all abilities learned', () => {
            const learnedNames = ['Fireball', 'Shield', 'Heal', 'Invisibility'];
            const result = getUnlearnedAbilities(learnedNames);
            
            expect(result).toEqual([]);
        });
    });

    describe('formatAbilityOptionText', () => {
        test('should format ability option text correctly', () => {
            const text = formatAbilityOptionText('Fireball', { school: 'Evocation', cost: 5 });
            expect(text).toBe('Fireball (Evocation, 5 SMP)');
        });

        test('should handle different schools and costs', () => {
            const text = formatAbilityOptionText('Shield', { school: 'Abjuration', cost: 3 });
            expect(text).toBe('Shield (Abjuration, 3 SMP)');
        });
    });
});

