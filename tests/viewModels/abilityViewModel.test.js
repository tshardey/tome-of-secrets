/**
 * @jest-environment jsdom
 */

import { createAbilityViewModel } from '../../assets/js/viewModels/abilityViewModel.js';
import { STORAGE_KEYS } from '../../assets/js/character-sheet/storageKeys.js';

// Mock the AbilityService
jest.mock('../../assets/js/services/AbilityService.js', () => ({
    getLearnedAbilities: jest.fn((names) => 
        names.map(name => ({ name, ability: { school: `${name}School`, cost: 5 } }))
    ),
    getUnlearnedAbilities: jest.fn((names) => {
        const all = ['Ability1', 'Ability2', 'Ability3'];
        const learned = new Set(names);
        return all.filter(a => !learned.has(a)).map(name => ({ 
            name, 
            ability: { school: `${name}School`, cost: 5 } 
        }));
    }),
    formatAbilityOptionText: jest.fn((name, ability) => `${name} (${ability.school}, ${ability.cost} SMP)`)
}));

describe('AbilityViewModel', () => {
    let mockState;

    beforeEach(() => {
        mockState = {
            [STORAGE_KEYS.LEARNED_ABILITIES]: []
        };
    });

    describe('createAbilityViewModel', () => {
        test('should create view model with no learned abilities', () => {
            const viewModel = createAbilityViewModel(mockState, 10);
            
            expect(viewModel.currentSmp).toBe(10);
            expect(viewModel.learnedAbilities).toEqual([]);
            expect(viewModel.unlearnedOptions.length).toBe(3);
            expect(viewModel.hasLearnedAbilities).toBe(false);
            expect(viewModel.hasUnlearnedAbilities).toBe(true);
        });

        test('should create view model with learned abilities', () => {
            mockState[STORAGE_KEYS.LEARNED_ABILITIES] = ['Ability1', 'Ability2'];
            const viewModel = createAbilityViewModel(mockState, 5);
            
            expect(viewModel.currentSmp).toBe(5);
            expect(viewModel.learnedAbilities).toHaveLength(2);
            expect(viewModel.learnedAbilities[0]).toHaveProperty('name');
            expect(viewModel.learnedAbilities[0]).toHaveProperty('ability');
            expect(viewModel.learnedAbilities[0]).toHaveProperty('index');
            expect(viewModel.unlearnedOptions.length).toBe(1);
            expect(viewModel.hasLearnedAbilities).toBe(true);
            expect(viewModel.hasUnlearnedAbilities).toBe(true);
        });

        test('should format unlearned options correctly', () => {
            const viewModel = createAbilityViewModel(mockState, 0);
            
            expect(viewModel.unlearnedOptions[0]).toHaveProperty('value');
            expect(viewModel.unlearnedOptions[0]).toHaveProperty('text');
            expect(viewModel.unlearnedOptions[0]).toHaveProperty('cost');
            expect(viewModel.unlearnedOptions[0]).toHaveProperty('school');
        });

        test('should handle missing learned abilities key', () => {
            const emptyState = {};
            const viewModel = createAbilityViewModel(emptyState, 10);
            
            expect(viewModel.learnedAbilities).toEqual([]);
            expect(viewModel.hasLearnedAbilities).toBe(false);
        });
    });
});

