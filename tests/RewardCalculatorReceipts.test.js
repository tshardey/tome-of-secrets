/**
 * Tests for RewardCalculator Receipt System
 * Verifies that calculation receipts accurately track all reward calculations
 */

import { Reward, RewardCalculator } from '../assets/js/services/RewardCalculator.js';
import { EffectRegistry } from '../assets/js/services/EffectRegistry.js';
import { TRIGGERS, MODIFIER_TYPES } from '../assets/js/services/effectSchema.js';
import { characterState } from '../assets/js/character-sheet/state.js';
import { STORAGE_KEYS } from '../assets/js/character-sheet/storageKeys.js';

const dollarEffect = (name, value) => ({
    effect: {
        trigger: TRIGGERS.ON_QUEST_COMPLETED,
        modifier: { type: MODIFIER_TYPES.ADD_FLAT, resource: 'dollars', value }
    },
    source: { name }
});

describe('RewardCalculator Receipt System', () => {
    beforeEach(() => {
        // Reset character state
        characterState[STORAGE_KEYS.EQUIPPED_ITEMS] = [];
        characterState[STORAGE_KEYS.PASSIVE_ITEM_SLOTS] = [];
        characterState[STORAGE_KEYS.PASSIVE_FAMILIAR_SLOTS] = [];
    });

    describe('Receipt Structure', () => {
        test('should have receipt property with correct structure', () => {
            const reward = new Reward({ xp: 10, dollars: 20 });
            const receipt = reward.getReceipt();

            expect(receipt).toHaveProperty('base');
            expect(receipt).toHaveProperty('modifiers');
            expect(receipt).toHaveProperty('final');
            expect(receipt).toHaveProperty('items');
            expect(receipt).toHaveProperty('modifiedBy');

            expect(Object.keys(receipt.base).sort()).toEqual(['blueprints', 'dollars', 'xp']);
            expect(Object.keys(receipt.final).sort()).toEqual(['blueprints', 'dollars', 'xp']);
        });

        test('should clone receipt correctly', () => {
            const original = new Reward({ xp: 10, dollars: 20 });
            original.syncReceiptBase();
            original.receipt.modifiers.push({ source: 'Test', type: 'item', value: 5 });

            const cloned = original.clone();
            expect(cloned.receipt.base.xp).toBe(10);
            expect(cloned.receipt.base.dollars).toBe(20);
            expect(cloned.receipt.modifiers).toHaveLength(1);

            // Verify deep clone
            cloned.receipt.base.xp = 20;
            expect(original.receipt.base.xp).toBe(10);
        });
    });

    describe('Base Rewards Receipt Tracking', () => {
        test('should track base rewards for Organize the Stacks', () => {
            const receipt = RewardCalculator.getBaseRewards('♥ Organize the Stacks', 'Fantasy').getReceipt();

            expect(receipt.base).toEqual({ xp: 15, dollars: 15, blueprints: 0 });
            expect(receipt.final).toEqual({ xp: 15, dollars: 15, blueprints: 0 });
        });

        test('should track base rewards for Extra Credit', () => {
            const receipt = RewardCalculator.getBaseRewards('⭐ Extra Credit', '').getReceipt();

            expect(receipt.base.dollars).toBe(15);
            expect(receipt.final.dollars).toBe(15);
        });

        test('should track base rewards for dungeon room challenge', () => {
            const receipt = RewardCalculator.getBaseRewards('♠ Dungeon Crawl', '', {
                isEncounter: false,
                roomNumber: '1'
            }).getReceipt();

            expect(receipt.base.dollars).toBe(15);
            expect(receipt.final.dollars).toBe(15);
        });

        test('should track base rewards for dungeon monster encounter', () => {
            const receipt = RewardCalculator.getBaseRewards('♠ Dungeon Crawl', '', {
                isEncounter: true,
                roomNumber: '1',
                encounterName: 'Will-o-wisps'
            }).getReceipt();

            expect(receipt.base.xp).toBe(30);
            expect(receipt.final.xp).toBe(30);
            expect(receipt.base.dollars).toBe(15);
        });
    });

    describe('Modifier Receipt Tracking', () => {
        test('receipt lists base $15 and each flat dollar line', () => {
            const spy = jest.spyOn(EffectRegistry, 'getActiveEffects').mockReturnValue([
                dollarEffect('Librarian\'s Compass', 4),
                dollarEffect('The Archivist\'s Apprentice', 2)
            ]);
            try {
                const reward = RewardCalculator.calculateFinalRewards('♥ Organize the Stacks', 'Fantasy', {
                    quest: { type: '♥ Organize the Stacks' }
                });
                const receipt = reward.getReceipt();

                expect(receipt.base.dollars).toBe(15);
                const dollarLines = receipt.modifiers.filter(m => m.currency === 'dollars');
                expect(dollarLines.map(m => [m.source, m.value, m.description])).toEqual([
                    ['Librarian\'s Compass', 4, '+$4'],
                    ['The Archivist\'s Apprentice', 2, '+$2']
                ]);
                expect(receipt.final.dollars).toBe(21);
                expect(reward.dollars).toBe(21);
            } finally {
                spy.mockRestore();
            }
        });

        test('should track school bonus in receipt', () => {
            const baseReward = RewardCalculator.getBaseRewards('♠ Dungeon Crawl', '', {
                isEncounter: true,
                roomNumber: '1',
                encounterName: 'Will-o-wisps'
            });
            const modified = RewardCalculator.calculateFinalRewards('♠ Dungeon Crawl', '', {
                baseRewardOverride: baseReward,
                wizardSchool: 'Enchantment',
                quest: {
                    type: '♠ Dungeon Crawl',
                    isEncounter: true,
                    isBefriend: true
                },
                isEncounter: true,
                roomNumber: '1',
                encounterName: 'Will-o-wisps',
                isBefriend: true
            });
            const receipt = modified.getReceipt();

            expect(receipt.modifiers).toHaveLength(1);
            expect(receipt.modifiers[0].source).toBe('School of Enchantment');
            expect(receipt.modifiers[0].type).toBe('effect:multiply');
            expect(receipt.modifiers[0].value).toBe(15);
            expect(receipt.final.xp).toBe(45);
        });

        // TODO(Task 5): re-enable once Biblioslinker pays +$3 on dungeon crawls (final dollars 18).
        test.skip('should track background bonus in receipt', () => {
            const modified = RewardCalculator.calculateFinalRewards('♠ Dungeon Crawl', '', {
                background: 'biblioslinker',
                quest: { type: '♠ Dungeon Crawl' },
                isEncounter: false,
                roomNumber: '1'
            });
            const receipt = modified.getReceipt();

            expect(receipt.modifiers).toHaveLength(1);
            expect(receipt.modifiers[0].source).toBe('The Biblioslinker');
            expect(receipt.modifiers[0].type).toBe('effect:add_flat');
            expect(receipt.modifiers[0].value).toBe(3);
            expect(receipt.modifiers[0].currency).toBe('dollars');
            expect(receipt.final.dollars).toBe(18);
        });
    });

    describe('Complete Calculation Receipt Tracking', () => {
        // TODO(Task 5): re-enable once Coffee Elemental pays +$2 equipped (final dollars 17).
        test.skip('should track complete calculation with all modifiers', () => {
            characterState[STORAGE_KEYS.EQUIPPED_ITEMS] = [
                { name: 'Coffee Elemental', type: 'Familiar' }
            ];

            const reward = RewardCalculator.calculateFinalRewards('♥ Organize the Stacks', 'Fantasy', {
                appliedBuffs: ['[Item] Coffee Elemental'],
                background: 'biblioslinker',
                quest: { type: '♥ Organize the Stacks', tags: ['cozy'] }
            });
            const receipt = reward.getReceipt();

            expect(receipt.base.xp).toBe(15);
            expect(receipt.base.dollars).toBe(15);
            expect(receipt.modifiers.find(m => m.source === 'Coffee Elemental')).toBeDefined();
            expect(receipt.final.xp).toBe(15);
            expect(receipt.final.dollars).toBe(17);
        });
    });

    describe('End of Month Receipt Tracking', () => {
        test('should track book completion rewards in receipt', () => {
            const receipt = RewardCalculator.calculateBookCompletionRewards(5).getReceipt();

            expect(receipt.base.xp).toBe(75); // 5 × 15
            expect(receipt.final.xp).toBe(75);
            expect(receipt.final.dollars).toBe(0);
            expect(receipt.modifiers).toHaveLength(1);
            expect(receipt.modifiers[0].source).toBe('End of Month - Book Completion');
            expect(receipt.modifiers[0].description).toContain('5 books');
        });

        test('should track atmospheric buff rewards in receipt', () => {
            const atmosphericBuffs = {
                'The Candlight Study': { daysUsed: 5, isActive: true },
                'The Herbalist\'s Nook': { daysUsed: 3, isActive: true }
            };
            const associatedBuffs = ['The Herbalist\'s Nook'];

            const receipt = RewardCalculator.calculateAtmosphericBuffRewards(atmosphericBuffs, associatedBuffs).getReceipt();

            expect(receipt.modifiers.length).toBe(2);
            expect(receipt.final.dollars).toBe(11); // 5 × $1 + 3 × $2
            expect(receipt.modifiers.every(m => m.currency === 'dollars')).toBe(true);

            const nookModifier = receipt.modifiers.find(m => m.source === 'The Herbalist\'s Nook');
            expect(nookModifier.description).toContain('Sanctum bonus');
        });
    });

    describe('Receipt Accuracy Verification', () => {
        test('receipt final values should match actual reward values', () => {
            characterState[STORAGE_KEYS.EQUIPPED_ITEMS] = [
                { name: 'Coffee Elemental', type: 'Familiar' }
            ];

            const reward = RewardCalculator.calculateFinalRewards('♥ Organize the Stacks', 'Fantasy', {
                appliedBuffs: ['[Item] Coffee Elemental']
            });
            const receipt = reward.getReceipt();

            expect(receipt.final).toEqual({ xp: reward.xp, dollars: reward.dollars, blueprints: reward.blueprints });
        });

        test('receipt should handle zero values correctly', () => {
            const receipt = RewardCalculator.getBaseRewards('⭐ Extra Credit', '').getReceipt();

            expect(receipt.base.xp).toBe(0);
            expect(receipt.base.blueprints).toBe(0);
            expect(receipt.base.dollars).toBe(15);
        });
    });
});
