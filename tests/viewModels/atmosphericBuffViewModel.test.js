/**
 * @jest-environment jsdom
 */

import { createAtmosphericBuffViewModel } from '../../assets/js/viewModels/atmosphericBuffViewModel.js';

// Mock the service
jest.mock('../../assets/js/services/AtmosphericBuffService.js', () => ({
    calculateDailyValue: jest.fn((name, associatedBuffs) => associatedBuffs.includes(name) ? 2 : 1),
    isGroveTenderBuff: jest.fn((name, background) => background === 'groveTender' && name === 'The Soaking in Nature'),
    isForcedAtmosphericBuff: jest.fn(
        (name, ctx) => ctx?.formData?.keeperBackground === 'groveTender' && name === 'The Soaking in Nature'
    ),
    calculateBuffTotal: jest.fn((daysUsed, dailyValue) => daysUsed * dailyValue),
    // Real rule shared with RewardCalculator, so these tests pin display to what pays.
    atmosphericBuffCountsForReward: jest.requireActual('../../assets/js/services/AtmosphericBuffService.js')
        .atmosphericBuffCountsForReward,
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
    }),
    getAtmosphericDailyBonus: jest.fn((state) => {
        const equipped = state?.equippedItems || [];
        if (equipped.some((i) => i?.name === 'Tome-Bound Cat')) {
            return { bonusPerDay: 1, modifierItemName: 'Tome-Bound Cat' };
        }
        const passiveFamiliars = state?.passiveFamiliarSlots || [];
        if (passiveFamiliars.some((s) => s?.itemName === 'Tome-Bound Cat')) {
            return { bonusPerDay: 2, modifierItemName: 'Tome-Bound Cat' };
        }
        return { bonusPerDay: 0, modifierItemName: null };
    }),
    // Real per-day source rules (shared with End of Month payout) over the mocked data module below.
    getAtmosphericDailyBonusSources: jest.requireActual('../../assets/js/services/AtmosphericBuffService.js')
        .getAtmosphericDailyBonusSources,
    getLevelAtmosphericDailyBonus: jest.requireActual('../../assets/js/services/AtmosphericBuffService.js')
        .getLevelAtmosphericDailyBonus,
    sumAtmosphericDailyBonuses: jest.requireActual('../../assets/js/services/AtmosphericBuffService.js')
        .sumAtmosphericDailyBonuses,
    getTrackableAtmosphericItemValues: jest.fn((state) => {
        const equipped = state?.equippedItems || [];
        if (equipped.some((i) => i?.name === 'Garden Gnome')) {
            return { 'Garden Gnome': 2 };
        }
        const passiveItems = state?.passiveItemSlots || [];
        const passiveFamiliars = state?.passiveFamiliarSlots || [];
        const isPassive =
            passiveItems.some((s) => s?.itemName === 'Garden Gnome') ||
            passiveFamiliars.some((s) => s?.itemName === 'Garden Gnome');
        return isPassive ? { 'Garden Gnome': 1 } : {};
    }),
}));

// Mock data (allItems: empty for most tests; with Tome-Bound Cat / Garden Gnome for modifier and trackable tests)
jest.mock('../../assets/js/character-sheet/data.js', () => ({
    atmosphericBuffs: {
        'Buff1': {},
        'Buff2': {},
        'The Soaking in Nature': {}
    },
    allItems: {
        'Tome-Bound Cat': { atmosphericReward: true, atmosphericBonusPerDay: 1, passiveAtmosphericBonusPerDay: 2 },
        'Garden Gnome': {
            atmosphericReward: true,
            atmosphericRewardTrackable: true,
            rewardModifier: { dollars: 2 },
            passiveRewardModifier: { dollars: 1 }
        }
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
            expect(buff2.total).toBe(0); // inactive: End of Month pays nothing (#170)
        });

        test('inactive buff with days shows a 0 total but keeps the entered days (#170)', () => {
            const viewModels = createAtmosphericBuffViewModel(mockState, '', '');
            const buff2 = viewModels.find(vm => vm.name === 'Buff2');
            expect(buff2.isActive).toBe(false);
            expect(buff2.daysUsed).toBe(2);
            expect(buff2.isCounted).toBe(false);
            expect(buff2.total).toBe(0);

            const buff1 = viewModels.find(vm => vm.name === 'Buff1');
            expect(buff1.isCounted).toBe(true);
        });

        test('toggling Active on an inactive buff with days changes its total (#170)', () => {
            const before = createAtmosphericBuffViewModel(mockState, '', '');
            expect(before.find(vm => vm.name === 'Buff2').total).toBe(0);

            mockState.atmosphericBuffs.Buff2.isActive = true;
            const after = createAtmosphericBuffViewModel(mockState, '', '');
            expect(after.find(vm => vm.name === 'Buff2').total).toBe(2);
        });

        test("Grove Tender's forced buff counts even when its stored isActive is false (#170)", () => {
            const state = { atmosphericBuffs: { 'The Soaking in Nature': { daysUsed: 3, isActive: false } } };
            const viewModels = createAtmosphericBuffViewModel(state, '', 'groveTender');
            const groveBuff = viewModels.find(vm => vm.name === 'The Soaking in Nature');
            expect(groveBuff.isCounted).toBe(true);
            expect(groveBuff.total).toBe(3);
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

        test('should add +$1 per day to active buff totals when Tome-Bound Cat is equipped', () => {
            const stateWithCat = {
                ...mockState,
                equippedItems: [{ name: 'Tome-Bound Cat' }]
            };
            const viewModels = createAtmosphericBuffViewModel(stateWithCat, '', '');
            const buff1 = viewModels.find(vm => vm.name === 'Buff1');
            expect(buff1.isActive).toBe(true);
            expect(buff1.total).toBe(6); // 3 days × ($1 + $1 Cat)
            const buff2 = viewModels.find(vm => vm.name === 'Buff2');
            expect(buff2.isActive).toBe(false);
            expect(buff2.total).toBe(0); // not active: neither base nor Cat bonus pays
        });

        test('trackable item rows always count, whatever their stored isActive (#170)', () => {
            const state = {
                atmosphericBuffs: { 'Garden Gnome': { daysUsed: 3, isActive: false } },
                equippedItems: [{ name: 'Garden Gnome' }]
            };
            const gnomeRow = createAtmosphericBuffViewModel(state, '', '').find(vm => vm.name === 'Garden Gnome');
            expect(gnomeRow.isCounted).toBe(true);
            expect(gnomeRow.total).toBe(6); // 3 days × $2
        });

        test('should add trackable item row with days/total when Garden Gnome equipped', () => {
            const stateWithGnome = {
                atmosphericBuffs: {
                    ...mockState.atmosphericBuffs,
                    'Garden Gnome': { daysUsed: 4, isActive: true }
                },
                equippedItems: [{ name: 'Garden Gnome' }]
            };
            const viewModels = createAtmosphericBuffViewModel(stateWithGnome, '', '');
            const gnomeRow = viewModels.find(vm => vm.name === 'Garden Gnome');
            expect(gnomeRow).toBeDefined();
            expect(gnomeRow.isTrackableItem).toBe(true);
            expect(gnomeRow.isActive).toBe(true); // Always active when equipped/displayed
            expect(gnomeRow.isDisabled).toBe(true); // Checkbox disabled
            expect(gnomeRow.dailyValue).toBe(2); // Equipped Garden Gnome's own rewardModifier.dollars
            expect(gnomeRow.daysUsed).toBe(4);
            expect(gnomeRow.total).toBe(8); // 4 days * 2/day
        });

        test('Cat per-day bonus applies to atmospheric buff days but not trackable item days', () => {
            const stateWithBoth = {
                atmosphericBuffs: {
                    ...mockState.atmosphericBuffs,
                    'Garden Gnome': { daysUsed: 5, isActive: true }
                },
                equippedItems: [{ name: 'Garden Gnome' }, { name: 'Tome-Bound Cat' }]
            };
            const viewModels = createAtmosphericBuffViewModel(stateWithBoth, '', '');
            const gnomeRow = viewModels.find(vm => vm.name === 'Garden Gnome');
            expect(gnomeRow.total).toBe(10); // 5 days × $2 item, no Cat bonus
            const buff1 = viewModels.find(vm => vm.name === 'Buff1');
            expect(buff1.total).toBe(6); // 3 days × ($1 + $1 Cat)
        });

        test('trackable item row uses the item per-day value, not a hardcoded 1', () => {
            const state = {
                atmosphericBuffs: { 'Garden Gnome': { daysUsed: 4, isActive: false } },
                equippedItems: [{ name: 'Garden Gnome' }]
            };

            const viewModels = createAtmosphericBuffViewModel(state, '', '');
            const gnomeRow = viewModels.find((vm) => vm.name === 'Garden Gnome');

            expect(gnomeRow.dailyValue).toBe(2);
            expect(gnomeRow.total).toBe(8); // 4 days × 2
        });

        test('should add modifier row for Tome-Bound Cat when equipped (+$1/day from item data)', () => {
            const stateWithCat = {
                atmosphericBuffs: {},
                equippedItems: [{ name: 'Tome-Bound Cat' }]
            };
            const viewModels = createAtmosphericBuffViewModel(stateWithCat, '', '');
            const catRow = viewModels.find(vm => vm.name === 'Tome-Bound Cat');
            expect(catRow).toBeDefined();
            expect(catRow.isModifierItem).toBe(true);
            expect(catRow.dailyValue).toBe('+$1/day');
            expect(catRow.modifierBonusPerDay).toBe(1);
            expect(catRow.total).toBe('+$1 per paying day');
            expect(catRow.isDisabled).toBe(true);
        });

        test('should use the passive per-day bonus when Tome-Bound Cat is adopted (passive slot)', () => {
            const stateWithCatAdopted = {
                atmosphericBuffs: {
                    'Buff1': { daysUsed: 4, isActive: true }
                },
                passiveFamiliarSlots: [{ itemName: 'Tome-Bound Cat' }]
            };
            const viewModels = createAtmosphericBuffViewModel(stateWithCatAdopted, '', '');
            const buff1 = viewModels.find(vm => vm.name === 'Buff1');
            expect(buff1.total).toBe(12); // 4 days × ($1 + $2 mocked passive bonus)
            const catRow = viewModels.find(vm => vm.name === 'Tome-Bound Cat');
            expect(catRow.dailyValue).toBe('+$2/day');
            expect(catRow.modifierBonusPerDay).toBe(2);
        });

        describe('Focused Atmosphere (level 7, #173)', () => {
            const levelRowName = 'Focused Atmosphere (Level 7)';

            test('below level 7: no bonus and no modifier row', () => {
                const viewModels = createAtmosphericBuffViewModel(mockState, '', '', 6);
                expect(viewModels.find(vm => vm.name === 'Buff1').total).toBe(3); // 3 × $1
                expect(viewModels.find(vm => vm.name === levelRowName)).toBeUndefined();
            });

            test('level 7 alone adds +$1 per paying day and shows a named modifier row', () => {
                const viewModels = createAtmosphericBuffViewModel(mockState, '', '', 7);
                expect(viewModels.find(vm => vm.name === 'Buff1').total).toBe(6); // 3 × ($1 + $1)
                const levelRow = viewModels.find(vm => vm.name === levelRowName);
                expect(levelRow).toMatchObject({
                    isModifierItem: true,
                    isLevelBonus: true,
                    modifierBonusPerDay: 1,
                    dailyValue: '+$1/day',
                    total: '+$1 per paying day',
                    isDisabled: true
                });
            });

            test('level above 7 still gets the bonus', () => {
                const viewModels = createAtmosphericBuffViewModel(mockState, '', '', 10);
                expect(viewModels.find(vm => vm.name === 'Buff1').total).toBe(6);
            });

            test('inactive rows keep showing 0 at level 7 (#170)', () => {
                const viewModels = createAtmosphericBuffViewModel(mockState, '', '', 7);
                const buff2 = viewModels.find(vm => vm.name === 'Buff2');
                expect(buff2.isCounted).toBe(false);
                expect(buff2.total).toBe(0);
            });

            test("Grove Tender's forced buff earns the bonus", () => {
                const state = { atmosphericBuffs: { 'The Soaking in Nature': { daysUsed: 3, isActive: false } } };
                const groveBuff = createAtmosphericBuffViewModel(state, '', 'groveTender', 7)
                    .find(vm => vm.name === 'The Soaking in Nature');
                expect(groveBuff.total).toBe(6); // 3 × ($1 + $1)
            });

            test('trackable item days do not earn the bonus', () => {
                const state = {
                    atmosphericBuffs: { 'Garden Gnome': { daysUsed: 4, isActive: false } },
                    equippedItems: [{ name: 'Garden Gnome' }]
                };
                const gnomeRow = createAtmosphericBuffViewModel(state, '', '', 7).find(vm => vm.name === 'Garden Gnome');
                expect(gnomeRow.total).toBe(8); // 4 × $2 item value only
            });

            test('level 7 plus Tome-Bound Cat stack (+$2/day) with each source on its own row', () => {
                const state = { ...mockState, equippedItems: [{ name: 'Tome-Bound Cat' }] };
                const viewModels = createAtmosphericBuffViewModel(state, '', '', 7);
                expect(viewModels.find(vm => vm.name === 'Buff1').total).toBe(9); // 3 × ($1 + $1 Cat + $1 level)
                expect(viewModels.find(vm => vm.name === 'Tome-Bound Cat').modifierBonusPerDay).toBe(1);
                expect(viewModels.find(vm => vm.name === levelRowName).modifierBonusPerDay).toBe(1);
            });

            test('sanctum-associated buff adds the bonus on top of the sanctum rate', () => {
                const viewModels = createAtmosphericBuffViewModel(mockState, 'sanctum1', '', 7);
                expect(viewModels.find(vm => vm.name === 'Buff1').total).toBe(9); // 3 × ($2 sanctum + $1)
            });
        });
    });
});

