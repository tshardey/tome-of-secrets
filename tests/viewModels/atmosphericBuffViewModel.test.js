/**
 * @jest-environment jsdom
 */

import { createAtmosphericBuffViewModel } from '../../assets/js/viewModels/atmosphericBuffViewModel.js';

// Mock the service
jest.mock('../../assets/js/services/AtmosphericBuffService.js', () => ({
    calculateDailyValue: jest.fn((name, associatedBuffs) => associatedBuffs.includes(name) ? 2 : 1),
    isGroveTenderBuff: jest.fn((name, background) => background === 'groveTender' && name === 'The Soaking in Nature'),
    calculateTotalInkDrops: jest.fn((daysUsed, dailyValue) => daysUsed * dailyValue),
    getAssociatedBuffs: jest.fn((sanctum) => {
        if (sanctum === 'sanctum1') return ['Buff1'];
        return [];
    }),
    getBuffState: jest.fn((state, name) => {
        const buffs = state.atmosphericBuffs || {};
        return {
            daysUsed: buffs[name]?.daysUsed || 0,
            isActive: buffs[name]?.isActive || false
        };
    })
}));

// Mock data
jest.mock('../../assets/js/character-sheet/data.js', () => ({
    atmosphericBuffs: {
        'Buff1': {},
        'Buff2': {},
        'The Soaking in Nature': {}
    }
}));

describe('AtmosphericBuffViewModel', () => {
    let mockState;

    beforeEach(() => {
        mockState = {
            atmosphericBuffs: {
                'Buff1': {
                    daysUsed: 3,
                    isActive: true
                },
                'Buff2': {
                    daysUsed: 2,
                    isActive: false
                }
            }
        };
    });

    describe('createAtmosphericBuffViewModel', () => {
        test('should create view models for all atmospheric buffs', () => {
            const viewModels = createAtmosphericBuffViewModel(mockState, 'sanctum1', '');
            
            expect(viewModels.length).toBe(3);
            expect(viewModels.every(vm => vm.hasOwnProperty('name'))).toBe(true);
            expect(viewModels.every(vm => vm.hasOwnProperty('dailyValue'))).toBe(true);
            expect(viewModels.every(vm => vm.hasOwnProperty('daysUsed'))).toBe(true);
            expect(viewModels.every(vm => vm.hasOwnProperty('isActive'))).toBe(true);
            expect(viewModels.every(vm => vm.hasOwnProperty('total'))).toBe(true);
        });

        test('should calculate daily value based on sanctum association', () => {
            const viewModels = createAtmosphericBuffViewModel(mockState, 'sanctum1', '');
            
            const buff1 = viewModels.find(vm => vm.name === 'Buff1');
            expect(buff1.dailyValue).toBe(2); // Associated buff
            expect(buff1.isAssociated).toBe(true);
            
            const buff2 = viewModels.find(vm => vm.name === 'Buff2');
            expect(buff2.dailyValue).toBe(1); // Not associated
            expect(buff2.isAssociated).toBe(false);
        });

        test('should handle Grove Tender background', () => {
            const viewModels = createAtmosphericBuffViewModel(mockState, '', 'groveTender');
            
            const groveBuff = viewModels.find(vm => vm.name === 'The Soaking in Nature');
            expect(groveBuff.isActive).toBe(true);
            expect(groveBuff.isGroveBuff).toBe(true);
            expect(groveBuff.isDisabled).toBe(true);
            expect(groveBuff.isHighlighted).toBe(true);
        });

        test('should calculate totals correctly', () => {
            const viewModels = createAtmosphericBuffViewModel(mockState, '', '');
            
            const buff1 = viewModels.find(vm => vm.name === 'Buff1');
            expect(buff1.total).toBe(3); // 3 days * 1 daily value
            
            const buff2 = viewModels.find(vm => vm.name === 'Buff2');
            expect(buff2.total).toBe(2); // 2 days * 1 daily value
        });

        test('should preserve buff state from character state', () => {
            const viewModels = createAtmosphericBuffViewModel(mockState, '', '');
            
            const buff1 = viewModels.find(vm => vm.name === 'Buff1');
            expect(buff1.daysUsed).toBe(3);
            expect(buff1.isActive).toBe(true);
            
            const buff2 = viewModels.find(vm => vm.name === 'Buff2');
            expect(buff2.daysUsed).toBe(2);
            expect(buff2.isActive).toBe(false);
        });

        test('should handle missing atmospheric buffs in state', () => {
            const emptyState = {};
            const viewModels = createAtmosphericBuffViewModel(emptyState, '', '');
            
            expect(viewModels.length).toBe(3);
            viewModels.forEach(vm => {
                expect(vm.daysUsed).toBe(0);
                expect(vm.isActive).toBe(false);
                expect(vm.total).toBe(0);
            });
        });
    });
});

