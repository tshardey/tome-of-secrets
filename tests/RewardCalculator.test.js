/**
 * Tests for RewardCalculator service
 */

import { Reward, RewardCalculator } from '../assets/js/services/RewardCalculator.js';

describe('Reward Class', () => {
    test('should create a reward with default values', () => {
        const reward = new Reward();
        
        expect(reward.xp).toBe(0);
        expect(reward.inkDrops).toBe(0);
        expect(reward.paperScraps).toBe(0);
        expect(reward.items).toEqual([]);
        expect(reward.modifiedBy).toEqual([]);
    });

    test('should create a reward with custom values', () => {
        const reward = new Reward({
            xp: 15,
            inkDrops: 20,
            paperScraps: 5,
            items: ['Test Item']
        });
        
        expect(reward.xp).toBe(15);
        expect(reward.inkDrops).toBe(20);
        expect(reward.paperScraps).toBe(5);
        expect(reward.items).toEqual(['Test Item']);
    });

    test('should clone a reward', () => {
        const original = new Reward({ xp: 10, inkDrops: 15 });
        original.modifiedBy = ['Test Modifier'];
        
        const cloned = original.clone();
        
        expect(cloned.xp).toBe(10);
        expect(cloned.inkDrops).toBe(15);
        expect(cloned.modifiedBy).toEqual(['Test Modifier']);
        
        // Verify it's a deep clone
        cloned.xp = 20;
        expect(original.xp).toBe(10);
    });

    test('should convert to JSON', () => {
        const reward = new Reward({ xp: 15, inkDrops: 20, items: ['Item1'] });
        reward.modifiedBy = ['Modifier1'];
        
        const json = reward.toJSON();
        
        expect(json).toEqual({
            xp: 15,
            inkDrops: 20,
            paperScraps: 0,
            items: ['Item1'],
            modifiedBy: ['Modifier1']
        });
    });
});

describe('RewardCalculator - Base Rewards', () => {
    test('should calculate Extra Credit rewards', () => {
        const rewards = RewardCalculator.getBaseRewards('⭐ Extra Credit', '');
        
        expect(rewards.xp).toBe(0);
        expect(rewards.inkDrops).toBe(0);
        expect(rewards.paperScraps).toBe(10);
    });

    test('should calculate Organize the Stacks rewards', () => {
        const rewards = RewardCalculator.getBaseRewards('♥ Organize the Stacks', 'Fantasy');
        
        expect(rewards.xp).toBe(15);
        expect(rewards.inkDrops).toBe(10);
        expect(rewards.paperScraps).toBe(0);
    });

    test('should calculate Side Quest rewards', () => {
        const rewards = RewardCalculator.getBaseRewards('♣ Side Quest', 'The Arcane Grimoire');
        
        // Based on data.js sideQuestsDetailed
        expect(rewards.items).toContain('Long Read Focus');
    });

    test('should calculate Dungeon room rewards', () => {
        const rewards = RewardCalculator.getBaseRewards('♠ Dungeon Crawl', '', {
            isEncounter: false,
            roomNumber: '1'
        });
        
        // Room 1 (The Hall of Whispers) gives 5 paper scraps
        expect(rewards.paperScraps).toBe(5);
    });

    test('should calculate Dungeon monster encounter rewards', () => {
        const rewards = RewardCalculator.getBaseRewards('♠ Dungeon Crawl', '', {
            isEncounter: true,
            roomNumber: '1',
            encounterName: 'Will-o-wisps'
        });
        
        // Monster encounters give 30 XP
        expect(rewards.xp).toBe(30);
    });

    test('should calculate Dungeon friendly creature rewards', () => {
        const rewards = RewardCalculator.getBaseRewards('♠ Dungeon Crawl', '', {
            isEncounter: true,
            roomNumber: '1',
            encounterName: "Librarian's Spirit"
        });
        
        // Friendly creatures give 10 ink drops
        expect(rewards.inkDrops).toBe(10);
    });

    test('should return default rewards for unknown quest type', () => {
        const rewards = RewardCalculator.getBaseRewards('Unknown Type', '');
        
        expect(rewards.inkDrops).toBe(10);
    });
});

describe('RewardCalculator - Apply Modifiers', () => {
    test('should return unmodified rewards when no buffs applied', () => {
        const base = new Reward({ xp: 10, inkDrops: 15 });
        const modified = RewardCalculator.applyModifiers(base, []);
        
        expect(modified.xp).toBe(10);
        expect(modified.inkDrops).toBe(15);
        expect(modified.modifiedBy).toEqual([]);
    });

    test('should apply additive ink drop bonuses', () => {
        const base = new Reward({ inkDrops: 10 });
        const modified = RewardCalculator.applyModifiers(base, [
            '[Item] Librarian\'s Compass' // +20 ink drops
        ]);
        
        expect(modified.inkDrops).toBe(30);
        expect(modified.modifiedBy).toContain('Librarian\'s Compass');
    });

    test('should apply multiplier bonuses', () => {
        const base = new Reward({ inkDrops: 10 });
        const modified = RewardCalculator.applyModifiers(base, [
            '[Item] Scatter Brain Scarab' // x3 multiplier
        ]);
        
        expect(modified.inkDrops).toBe(30);
        expect(modified.modifiedBy).toContain('Scatter Brain Scarab');
    });

    test('should apply additive bonuses before multipliers', () => {
        const base = new Reward({ inkDrops: 10 });
        const modified = RewardCalculator.applyModifiers(base, [
            '[Item] Librarian\'s Compass', // +20 = 30 total
            '[Item] Scatter Brain Scarab'  // x3 = 90 total
        ]);
        
        expect(modified.inkDrops).toBe(90); // (10 + 20) * 3
    });

    test('should apply background bonuses', () => {
        const base = new Reward({ inkDrops: 10 });
        const modified = RewardCalculator.applyModifiers(base, [
            '[Background] Archivist Bonus'
        ]);
        
        expect(modified.inkDrops).toBe(20);
        expect(modified.modifiedBy).toContain('Archivist Bonus');
    });

    test('should apply paper scrap bonuses', () => {
        const base = new Reward({ paperScraps: 0 });
        const modified = RewardCalculator.applyModifiers(base, [
            '[Item] Librarian\'s Quill' // +2 paper scraps
        ]);
        
        expect(modified.paperScraps).toBe(2);
        expect(modified.modifiedBy).toContain('Librarian\'s Quill');
    });

    test('should handle multiple modifiers', () => {
        const base = new Reward({ xp: 10, inkDrops: 10, paperScraps: 5 });
        const modified = RewardCalculator.applyModifiers(base, [
            '[Item] Librarian\'s Compass',  // +20 ink drops
            '[Item] Librarian\'s Quill',    // +2 paper scraps
            '[Background] Prophet Bonus'    // +10 ink drops
        ]);
        
        expect(modified.xp).toBe(10);
        expect(modified.inkDrops).toBe(40); // 10 + 20 + 10
        expect(modified.paperScraps).toBe(7); // 5 + 2
        expect(modified.modifiedBy).toContain('Librarian\'s Compass');
        expect(modified.modifiedBy).toContain('Librarian\'s Quill');
        expect(modified.modifiedBy).toContain('Prophet Bonus');
    });
});

describe('RewardCalculator - Background Bonuses', () => {
    test('should apply Biblioslinker bonus to dungeon crawls', () => {
        const base = new Reward({ paperScraps: 5 });
        const quest = { type: '♠ Dungeon Crawl' };
        
        const modified = RewardCalculator.applyBackgroundBonuses(base, quest, 'biblioslinker');
        
        expect(modified.paperScraps).toBe(8); // 5 + 3
        expect(modified.modifiedBy).toContain('Biblioslinker');
    });

    test('should not apply Biblioslinker bonus to non-dungeon quests', () => {
        const base = new Reward({ paperScraps: 5 });
        const quest = { type: '♥ Organize the Stacks' };
        
        const modified = RewardCalculator.applyBackgroundBonuses(base, quest, 'biblioslinker');
        
        expect(modified.paperScraps).toBe(5);
        expect(modified.modifiedBy).toEqual([]);
    });

    test('should not apply bonuses when no background selected', () => {
        const base = new Reward({ paperScraps: 5 });
        const quest = { type: '♠ Dungeon Crawl' };
        
        const modified = RewardCalculator.applyBackgroundBonuses(base, quest, '');
        
        expect(modified.paperScraps).toBe(5);
    });
});

describe('RewardCalculator - Calculate Final Rewards', () => {
    test('should calculate final rewards with all modifiers', () => {
        const final = RewardCalculator.calculateFinalRewards(
            '♥ Organize the Stacks',
            'Fantasy: Read a book with magical creatures',
            {
                appliedBuffs: ['[Item] Librarian\'s Compass'],
                background: null,
                quest: { type: '♥ Organize the Stacks' }
            }
        );
        
        expect(final.xp).toBe(15); // Base genre quest XP
        expect(final.inkDrops).toBe(30); // 10 base + 20 from compass
        expect(final.modifiedBy).toContain('Librarian\'s Compass');
    });

    test('should calculate dungeon rewards with background bonus', () => {
        const final = RewardCalculator.calculateFinalRewards(
            '♠ Dungeon Crawl',
            'Room challenge',
            {
                isEncounter: false,
                roomNumber: '1',
                appliedBuffs: [],
                background: 'biblioslinker',
                quest: { type: '♠ Dungeon Crawl' }
            }
        );
        
        expect(final.paperScraps).toBe(8); // 5 from room + 3 from biblioslinker
        expect(final.modifiedBy).toContain('Biblioslinker');
    });

    test('should handle complex reward calculation', () => {
        const final = RewardCalculator.calculateFinalRewards(
            '♠ Dungeon Crawl',
            '',
            {
                isEncounter: true,
                roomNumber: '1',
                encounterName: 'Will-o-wisps',
                appliedBuffs: [
                    '[Item] Pocket Dragon', // +20 ink drops
                    '[Background] Cartographer Bonus' // +10 ink drops
                ],
                background: 'biblioslinker',
                quest: { type: '♠ Dungeon Crawl' }
            }
        );
        
        expect(final.xp).toBe(30); // Monster base XP
        expect(final.inkDrops).toBe(30); // 0 + 20 + 10
        expect(final.modifiedBy.length).toBeGreaterThan(0);
    });
});

