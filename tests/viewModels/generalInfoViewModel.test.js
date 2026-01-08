/**
 * @jest-environment jsdom
 */

// Mock the data module
jest.mock('../../assets/js/character-sheet/data.js', () => ({
    permanentBonuses: {
        3: '<p>Level 3 bonus</p>',
        6: '<p>Level 6 bonus</p>',
        7: '<p>Level 7 bonus</p>',
        9: '<p>Level 9 bonus</p>'
    },
    keeperBackgrounds: {
        'background1': {
            description: 'Background 1 description',
            benefit: 'Background 1 benefit'
        }
    },
    schoolBenefits: {
        'school1': {
            description: 'School 1 description',
            benefit: 'School 1 benefit'
        }
    },
    sanctumBenefits: {
        'sanctum1': {
            description: 'Sanctum 1 description',
            benefit: 'Sanctum 1 benefit'
        }
    }
}));

import { createPermanentBonusesViewModel, createBenefitsViewModel } from '../../assets/js/viewModels/generalInfoViewModel.js';

describe('GeneralInfoViewModel', () => {

    describe('createPermanentBonusesViewModel', () => {
        test('should return empty bonuses for level below minimum', () => {
            const viewModel = createPermanentBonusesViewModel(1);
            
            expect(viewModel.bonuses).toEqual([]);
            expect(viewModel.hasBonuses).toBe(false);
            expect(viewModel.currentLevel).toBe(1);
        });

        test('should return bonuses up to current level', () => {
            const viewModel = createPermanentBonusesViewModel(5);
            
            expect(viewModel.bonuses).toHaveLength(1);
            expect(viewModel.bonuses[0].level).toBe(3);
            expect(viewModel.bonuses[0].content).toBe('<p>Level 3 bonus</p>');
            expect(viewModel.hasBonuses).toBe(true);
        });

        test('should return multiple bonuses for higher levels', () => {
            const viewModel = createPermanentBonusesViewModel(8);
            
            expect(viewModel.bonuses.length).toBeGreaterThan(1);
            expect(viewModel.bonuses.every(b => b.level <= 8)).toBe(true);
            expect(viewModel.hasBonuses).toBe(true);
        });

        test('should return all bonuses for max level', () => {
            const viewModel = createPermanentBonusesViewModel(20);
            
            expect(viewModel.bonuses.length).toBe(4);
            expect(viewModel.hasBonuses).toBe(true);
        });

        test('should handle exact level matches', () => {
            const viewModel = createPermanentBonusesViewModel(3);
            
            expect(viewModel.bonuses).toHaveLength(1);
            expect(viewModel.bonuses[0].level).toBe(3);
        });
    });

    describe('createBenefitsViewModel', () => {
        test('should create view model with no selections', () => {
            const viewModel = createBenefitsViewModel('', '', '');
            
            expect(viewModel.background.hasSelection).toBe(false);
            expect(viewModel.background.description).toBe('-- Select a background to see its description --');
            expect(viewModel.school.hasSelection).toBe(false);
            expect(viewModel.sanctum.hasSelection).toBe(false);
        });

        test('should create view model with background selected', () => {
            const viewModel = createBenefitsViewModel('background1', '', '');
            
            expect(viewModel.background.hasSelection).toBe(true);
            expect(viewModel.background.description).toBe('Background 1 description');
            expect(viewModel.background.benefit).toBe('Background 1 benefit');
            expect(viewModel.school.hasSelection).toBe(false);
            expect(viewModel.sanctum.hasSelection).toBe(false);
        });

        test('should create view model with school selected', () => {
            const viewModel = createBenefitsViewModel('', 'school1', '');
            
            expect(viewModel.school.hasSelection).toBe(true);
            expect(viewModel.school.description).toBe('School 1 description');
            expect(viewModel.school.benefit).toBe('School 1 benefit');
            expect(viewModel.background.hasSelection).toBe(false);
            expect(viewModel.sanctum.hasSelection).toBe(false);
        });

        test('should create view model with sanctum selected', () => {
            const viewModel = createBenefitsViewModel('', '', 'sanctum1');
            
            expect(viewModel.sanctum.hasSelection).toBe(true);
            expect(viewModel.sanctum.description).toBe('Sanctum 1 description');
            expect(viewModel.sanctum.benefit).toBe('Sanctum 1 benefit');
            expect(viewModel.background.hasSelection).toBe(false);
            expect(viewModel.school.hasSelection).toBe(false);
        });

        test('should handle invalid selections', () => {
            const viewModel = createBenefitsViewModel('invalid', 'invalid', 'invalid');
            
            expect(viewModel.background.hasSelection).toBe(false);
            expect(viewModel.school.hasSelection).toBe(false);
            expect(viewModel.sanctum.hasSelection).toBe(false);
        });

        test('should create view model with all selections', () => {
            const viewModel = createBenefitsViewModel('background1', 'school1', 'sanctum1');
            
            expect(viewModel.background.hasSelection).toBe(true);
            expect(viewModel.school.hasSelection).toBe(true);
            expect(viewModel.sanctum.hasSelection).toBe(true);
        });
    });
});

