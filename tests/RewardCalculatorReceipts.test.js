/**
 * Tests for RewardCalculator Receipt System
 * Verifies that calculation receipts accurately track all reward calculations
 */

import { Reward, RewardCalculator } from '../assets/js/services/RewardCalculator.js';
import { characterState } from '../assets/js/character-sheet/state.js';
import { STORAGE_KEYS } from '../assets/js/character-sheet/storageKeys.js';

describe('RewardCalculator Receipt System', () => {
    beforeEach(() => {
        // Reset character state
        characterState[STORAGE_KEYS.EQUIPPED_ITEMS] = [];
        characterState[STORAGE_KEYS.PASSIVE_ITEM_SLOTS] = [];
        characterState[STORAGE_KEYS.PASSIVE_FAMILIAR_SLOTS] = [];
    });

    describe('Receipt Structure', () => {
        test('should have receipt property with correct structure', () => {
            const reward = new Reward({ xp: 10, inkDrops: 20 });
            const receipt = reward.getReceipt();

            expect(receipt).toHaveProperty('base');
            expect(receipt).toHaveProperty('modifiers');
            expect(receipt).toHaveProperty('final');
            expect(receipt).toHaveProperty('items');
            expect(receipt).toHaveProperty('modifiedBy');

            expect(receipt.base).toHaveProperty('xp');
            expect(receipt.base).toHaveProperty('inkDrops');
            expect(receipt.base).toHaveProperty('paperScraps');
            expect(receipt.base).toHaveProperty('blueprints');
        });

        test('should clone receipt correctly', () => {
            const original = new Reward({ xp: 10, inkDrops: 20 });
            original.receipt.base.xp = 10;
            original.receipt.base.inkDrops = 20;
            original.receipt.modifiers.push({ source: 'Test', type: 'item', value: 5 });

            const cloned = original.clone();
            expect(cloned.receipt.base.xp).toBe(10);
            expect(cloned.receipt.base.inkDrops).toBe(20);
            expect(cloned.receipt.modifiers).toHaveLength(1);

            // Verify deep clone
            cloned.receipt.base.xp = 20;
            expect(original.receipt.base.xp).toBe(10);
        });
    });

    describe('Base Rewards Receipt Tracking', () => {
        test('should track base rewards for Organize the Stacks', () => {
            const reward = RewardCalculator.getBaseRewards('♥ Organize the Stacks', 'Fantasy');
            const receipt = reward.getReceipt();

            expect(receipt.base.xp).toBe(15);
            expect(receipt.base.inkDrops).toBe(10);
            expect(receipt.final.xp).toBe(15);
            expect(receipt.final.inkDrops).toBe(10);
        });

        test('should track base rewards for Extra Credit', () => {
            const reward = RewardCalculator.getBaseRewards('⭐ Extra Credit', '');
            const receipt = reward.getReceipt();

            expect(receipt.base.paperScraps).toBe(10);
            expect(receipt.final.paperScraps).toBe(10);
        });

        test('should track base rewards for dungeon room challenge', () => {
            const reward = RewardCalculator.getBaseRewards('♠ Dungeon Crawl', '', {
                isEncounter: false,
                roomNumber: '1'
            });
            const receipt = reward.getReceipt();

            expect(receipt.base.paperScraps).toBe(5);
            expect(receipt.final.paperScraps).toBe(5);
        });

        test('should track base rewards for dungeon monster encounter', () => {
            const reward = RewardCalculator.getBaseRewards('♠ Dungeon Crawl', '', {
                isEncounter: true,
                roomNumber: '1',
                encounterName: 'Will-o-wisps'
            });
            const receipt = reward.getReceipt();

            expect(receipt.base.xp).toBe(30);
            expect(receipt.final.xp).toBe(30);
        });
    });

    describe('Modifier Receipt Tracking', () => {
        test('should track item modifier in receipt', () => {
            // Mock item in equipped items
            characterState[STORAGE_KEYS.EQUIPPED_ITEMS] = [
                { name: "Librarian's Compass", type: 'Wearable' }
            ];

            const baseReward = RewardCalculator.getBaseRewards('♥ Organize the Stacks', 'Fantasy');
            const modified = RewardCalculator.applyModifiers(baseReward, ['[Item] Librarian\'s Compass']);
            const receipt = modified.getReceipt();

            expect(receipt.modifiers).toHaveLength(1);
            expect(receipt.modifiers[0].source).toBe("Librarian's Compass");
            expect(receipt.modifiers[0].type).toBe('item');
            expect(receipt.modifiers[0].value).toBe(20);
            expect(receipt.modifiers[0].currency).toBe('inkDrops');
            expect(receipt.final.inkDrops).toBe(30); // 10 base + 20 modifier
        });

        test('should track multiple modifiers in receipt', () => {
            characterState[STORAGE_KEYS.EQUIPPED_ITEMS] = [
                { name: "Librarian's Compass", type: 'Wearable' },
                { name: "Amulet of Duality", type: 'Wearable' }
            ];

            const baseReward = RewardCalculator.getBaseRewards('♥ Organize the Stacks', 'Fantasy');
            const modified = RewardCalculator.applyModifiers(baseReward, [
                '[Item] Librarian\'s Compass',
                '[Item] Amulet of Duality'
            ]);
            const receipt = modified.getReceipt();

            expect(receipt.modifiers).toHaveLength(2);
            expect(receipt.final.inkDrops).toBe(45); // 10 base + 20 (Compass) + 15 (Amulet)
        });

        test('should track multiplier modifiers correctly', () => {
            characterState[STORAGE_KEYS.EQUIPPED_ITEMS] = [
                { name: "Scatter Brain Scarab", type: 'Wearable' }
            ];

            const baseReward = RewardCalculator.getBaseRewards('♥ Organize the Stacks', 'Fantasy');
            const modified = RewardCalculator.applyModifiers(baseReward, ['[Item] Scatter Brain Scarab']);
            const receipt = modified.getReceipt();

            expect(receipt.modifiers).toHaveLength(1);
            expect(receipt.modifiers[0].type).toBe('multiplier');
            expect(receipt.modifiers[0].value).toBeGreaterThan(0); // Actual change after multiplication
            expect(receipt.final.inkDrops).toBe(30); // 10 base × 3 multiplier
        });

        test('should track background bonus in receipt', () => {
            const baseReward = RewardCalculator.getBaseRewards('♠ Dungeon Crawl', '', {
                isEncounter: false,
                roomNumber: '1'
            });
            const modified = RewardCalculator.applyBackgroundBonuses(baseReward, {
                type: '♠ Dungeon Crawl'
            }, 'biblioslinker');
            const receipt = modified.getReceipt();

            expect(receipt.modifiers).toHaveLength(1);
            expect(receipt.modifiers[0].source).toBe('Biblioslinker');
            expect(receipt.modifiers[0].type).toBe('background');
            expect(receipt.modifiers[0].value).toBe(10);
            expect(receipt.modifiers[0].currency).toBe('paperScraps');
            expect(receipt.final.paperScraps).toBe(15); // 5 base + 10 bonus
        });

        test('should track school bonus in receipt', () => {
            const baseReward = RewardCalculator.getBaseRewards('♠ Dungeon Crawl', '', {
                isEncounter: true,
                roomNumber: '1',
                encounterName: 'Will-o-wisps'
            });
            const modified = RewardCalculator.applySchoolBonuses(baseReward, {
                type: '♠ Dungeon Crawl',
                isEncounter: true,
                isBefriend: true
            }, 'Enchantment');
            const receipt = modified.getReceipt();

            expect(receipt.modifiers).toHaveLength(1);
            expect(receipt.modifiers[0].source).toBe('School of Enchantment');
            expect(receipt.modifiers[0].type).toBe('school');
            expect(receipt.modifiers[0].value).toBe(15); // 30 × 1.5 = 45, bonus = 15
            expect(receipt.final.xp).toBe(45);
        });
    });

    describe('Complete Calculation Receipt Tracking', () => {
        test('should track complete calculation with all modifiers', () => {
            characterState[STORAGE_KEYS.EQUIPPED_ITEMS] = [
                { name: "Librarian's Compass", type: 'Wearable' }
            ];

            const reward = RewardCalculator.calculateFinalRewards('♥ Organize the Stacks', 'Fantasy', {
                appliedBuffs: ['[Item] Librarian\'s Compass'],
                background: 'biblioslinker',
                quest: { type: '♥ Organize the Stacks' }
            });
            const receipt = reward.getReceipt();

            // Verify base
            expect(receipt.base.xp).toBe(15);
            expect(receipt.base.inkDrops).toBe(10);

            // Verify modifiers
            expect(receipt.modifiers.length).toBeGreaterThan(0);
            const itemModifier = receipt.modifiers.find(m => m.source === "Librarian's Compass");
            expect(itemModifier).toBeDefined();

            // Verify final
            expect(receipt.final.xp).toBe(15);
            expect(receipt.final.inkDrops).toBe(30); // 10 base + 20 item
        });

        test('should track passive slot modifier correctly', () => {
            // Item in passive slot, not equipped
            characterState[STORAGE_KEYS.PASSIVE_ITEM_SLOTS] = [
                { itemName: "Librarian's Compass", unlockedFrom: 'test-project' }
            ];
            characterState[STORAGE_KEYS.EQUIPPED_ITEMS] = [];

            const baseReward = RewardCalculator.getBaseRewards('♥ Organize the Stacks', 'Fantasy');
            const modified = RewardCalculator.applyModifiers(baseReward, ['[Item] Librarian\'s Compass']);
            const receipt = modified.getReceipt();

            expect(receipt.modifiers).toHaveLength(1);
            expect(receipt.modifiers[0].value).toBe(10); // Passive bonus (half of 20)
            expect(receipt.final.inkDrops).toBe(20); // 10 base + 10 passive
        });

        test('should prioritize active modifier when item is both equipped and in passive slot', () => {
            // Item in both equipped and passive slot
            characterState[STORAGE_KEYS.EQUIPPED_ITEMS] = [
                { name: "Librarian's Compass", type: 'Wearable' }
            ];
            characterState[STORAGE_KEYS.PASSIVE_ITEM_SLOTS] = [
                { itemName: "Librarian's Compass", unlockedFrom: 'test-project' }
            ];

            const baseReward = RewardCalculator.getBaseRewards('♥ Organize the Stacks', 'Fantasy');
            const modified = RewardCalculator.applyModifiers(baseReward, ['[Item] Librarian\'s Compass']);
            const receipt = modified.getReceipt();

            expect(receipt.modifiers[0].value).toBe(20); // Active bonus (not passive)
            expect(receipt.final.inkDrops).toBe(30); // 10 base + 20 active
        });
    });

    describe('End of Month Receipt Tracking', () => {
        test('should track book completion rewards in receipt', () => {
            const reward = RewardCalculator.calculateBookCompletionRewards(5);
            const receipt = reward.getReceipt();

            expect(receipt.base.xp).toBe(75); // 5 × 15
            expect(receipt.final.xp).toBe(75);
            expect(receipt.modifiers).toHaveLength(1);
            expect(receipt.modifiers[0].source).toBe('End of Month - Book Completion');
            expect(receipt.modifiers[0].description).toContain('5 books');
        });

        test('should track journal entry rewards in receipt', () => {
            const reward = RewardCalculator.calculateJournalEntryRewards(3, 'scribe');
            const receipt = reward.getReceipt();

            expect(receipt.base.paperScraps).toBe(15); // 3 × 5 base
            expect(receipt.final.paperScraps).toBe(24); // 3 × (5 + 3) with Scribe bonus
            expect(receipt.modifiers.length).toBeGreaterThanOrEqual(1);
            
            const scribeModifier = receipt.modifiers.find(m => m.source === "Scribe's Acolyte");
            expect(scribeModifier).toBeDefined();
            expect(scribeModifier.value).toBe(9); // 3 × 3 bonus
        });

        test('should track atmospheric buff rewards in receipt', () => {
            const atmosphericBuffs = {
                'The Candlight Study': { daysUsed: 5, isActive: true },
                'The Herbalist\'s Nook': { daysUsed: 3, isActive: true }
            };
            const associatedBuffs = ['The Herbalist\'s Nook'];

            const reward = RewardCalculator.calculateAtmosphericBuffRewards(atmosphericBuffs, associatedBuffs);
            const receipt = reward.getReceipt();

            expect(receipt.modifiers.length).toBe(2);
            expect(receipt.final.inkDrops).toBe(11); // 5 × 1 + 3 × 2
            
            const nookModifier = receipt.modifiers.find(m => m.source === 'The Herbalist\'s Nook');
            expect(nookModifier.description).toContain('Sanctum bonus');
        });
    });

    describe('Receipt Accuracy Verification', () => {
        test('receipt final values should match actual reward values', () => {
            characterState[STORAGE_KEYS.EQUIPPED_ITEMS] = [
                { name: "Librarian's Compass", type: 'Wearable' }
            ];

            const reward = RewardCalculator.calculateFinalRewards('♥ Organize the Stacks', 'Fantasy', {
                appliedBuffs: ['[Item] Librarian\'s Compass']
            });
            const receipt = reward.getReceipt();

            expect(receipt.final.xp).toBe(reward.xp);
            expect(receipt.final.inkDrops).toBe(reward.inkDrops);
            expect(receipt.final.paperScraps).toBe(reward.paperScraps);
            expect(receipt.final.blueprints).toBe(reward.blueprints);
        });

        test('receipt should accurately reflect calculation steps', () => {
            const baseReward = RewardCalculator.getBaseRewards('♥ Organize the Stacks', 'Fantasy');
            expect(baseReward.receipt.base.inkDrops).toBe(10);

            characterState[STORAGE_KEYS.EQUIPPED_ITEMS] = [
                { name: "Librarian's Compass", type: 'Wearable' }
            ];
            const modified = RewardCalculator.applyModifiers(baseReward, ['[Item] Librarian\'s Compass']);
            
            // Verify step-by-step
            expect(modified.receipt.base.inkDrops).toBe(10);
            expect(modified.receipt.modifiers[0].value).toBe(20);
            expect(modified.receipt.final.inkDrops).toBe(30);
        });

        test('receipt should handle zero values correctly', () => {
            const reward = RewardCalculator.getBaseRewards('⭐ Extra Credit', '');
            const receipt = reward.getReceipt();

            expect(receipt.base.xp).toBe(0);
            expect(receipt.base.inkDrops).toBe(0);
            expect(receipt.base.paperScraps).toBe(10);
            expect(receipt.final.paperScraps).toBe(10);
        });
    });
});

