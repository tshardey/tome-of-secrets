/**
 * Tests for RewardCalculator service
 */

import { Reward, RewardCalculator } from '../assets/js/services/RewardCalculator.js';
import { characterState } from '../assets/js/character-sheet/state.js';
import { STORAGE_KEYS } from '../assets/js/character-sheet/storageKeys.js';
import { MODIFIER_TYPES, TRIGGERS } from '../assets/js/services/effectSchema.js';

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
            blueprints: 0,
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
            '[Item] Gilded Painting' // +2 ink drops
        ]);

        expect(modified.inkDrops).toBe(12);
        expect(modified.modifiedBy).toContain('Gilded Painting');
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
            '[Item] Gilded Painting',     // +2 = 12 total
            '[Item] Scatter Brain Scarab' // x3 = 36 total
        ]);

        expect(modified.inkDrops).toBe(36); // (10 + 2) * 3
    });

    test('should apply background bonuses', () => {
        const base = new Reward({ inkDrops: 10 });
        const modified = RewardCalculator.applyModifiers(base, [
            '[Background] Archivist Bonus'
        ]);
        
        expect(modified.inkDrops).toBe(25);
        expect(modified.modifiedBy).toContain('Archivist Bonus');
    });

    test('should apply ink drop bonuses from atmospheric items', () => {
        const base = new Reward({ inkDrops: 0 });
        const modified = RewardCalculator.applyModifiers(base, [
            '[Item] Gilded Painting' // +2 ink drops
        ]);

        expect(modified.inkDrops).toBe(2);
        expect(modified.modifiedBy).toContain('Gilded Painting');
    });

    test('should handle multiple modifiers', () => {
        const base = new Reward({ xp: 10, inkDrops: 10, paperScraps: 5 });
        const modified = RewardCalculator.applyModifiers(base, [
            '[Item] Gilded Painting',      // +2 ink drops
            '[Background] Prophet Bonus'   // +15 ink drops
        ]);

        expect(modified.xp).toBe(10);
        expect(modified.inkDrops).toBe(27); // 10 + 2 + 15
        expect(modified.paperScraps).toBe(5);
        expect(modified.modifiedBy).toContain('Gilded Painting');
        expect(modified.modifiedBy).toContain('Prophet Bonus');
    });
});

describe('RewardCalculator - Background bonuses via ModifierPipeline', () => {
    test('should not double-apply Archivist when legacy background card is selected', () => {
        const base = new Reward({ inkDrops: 10 });
        const modified = RewardCalculator.calculateFinalRewards('♥ Organize the Stacks', 'Non-Fiction: Archive work', {
            baseRewardOverride: base,
            appliedBuffs: ['[Background] Archivist Bonus'],
            background: 'archivist',
            quest: { type: '♥ Organize the Stacks', genre: 'Non-Fiction', tags: ['non-fiction'] }
        });

        expect(modified.inkDrops).toBe(20);
        expect(modified.modifiedBy).toContain("The Archivist's Apprentice");
        expect(modified.modifiedBy).not.toContain('Archivist Bonus');
    });

    test('should still apply non-background buff cards with pipeline backgrounds', () => {
        characterState[STORAGE_KEYS.EQUIPPED_ITEMS] = [{ name: 'Coffee Elemental', type: 'Familiar' }];
        const base = new Reward({ inkDrops: 10 });
        const modified = RewardCalculator.calculateFinalRewards('♥ Organize the Stacks', 'Non-Fiction: Archive work', {
            baseRewardOverride: base,
            appliedBuffs: ['[Background] Archivist Bonus', '[Item] Coffee Elemental'],
            background: 'archivist',
            quest: { type: '♥ Organize the Stacks', genre: 'Non-Fiction', tags: ['non-fiction', 'cozy'] }
        });
        characterState[STORAGE_KEYS.EQUIPPED_ITEMS] = [];

        expect(modified.inkDrops).toBe(30); // 10 base + 10 Archivist pipeline + 10 Coffee pipeline
        expect(modified.modifiedBy).toContain("The Archivist's Apprentice");
        expect(modified.modifiedBy).toContain("Coffee Elemental");
        expect(modified.modifiedBy).not.toContain('Archivist Bonus');
    });

    test('should apply Biblioslinker bonus to dungeon crawls', () => {
        const base = new Reward({ paperScraps: 5 });
        const modified = RewardCalculator.calculateFinalRewards('♠ Dungeon Crawl', '', {
            baseRewardOverride: base,
            background: 'biblioslinker',
            quest: { type: '♠ Dungeon Crawl' }
        });

        expect(modified.paperScraps).toBe(15);
        expect(modified.modifiedBy).toContain('The Biblioslinker');
    });

    test('should not apply Biblioslinker bonus to non-dungeon quests', () => {
        const base = new Reward({ paperScraps: 5 });
        const modified = RewardCalculator.calculateFinalRewards('♥ Organize the Stacks', 'Fantasy', {
            baseRewardOverride: base,
            background: 'biblioslinker',
            quest: { type: '♥ Organize the Stacks' }
        });

        expect(modified.paperScraps).toBe(5);
        expect(modified.modifiedBy).toEqual([]);
    });

    test('should not apply background effects when no background selected', () => {
        const base = new Reward({ paperScraps: 5 });
        const modified = RewardCalculator.calculateFinalRewards('♠ Dungeon Crawl', '', {
            baseRewardOverride: base,
            background: '',
            quest: { type: '♠ Dungeon Crawl' }
        });

        expect(modified.paperScraps).toBe(5);
    });
});

describe('RewardCalculator - Calculate Final Rewards', () => {
    test('should calculate final rewards with all modifiers', () => {
        characterState[STORAGE_KEYS.EQUIPPED_ITEMS] = [{ name: 'Coffee Elemental', type: 'Familiar' }];
        const final = RewardCalculator.calculateFinalRewards(
            '♥ Organize the Stacks',
            'Fantasy: Read a book with magical creatures',
            {
                appliedBuffs: ['[Item] Coffee Elemental'],
                background: null,
                quest: { type: '♥ Organize the Stacks', tags: ['cozy'] }
            }
        );
        characterState[STORAGE_KEYS.EQUIPPED_ITEMS] = [];

        expect(final.xp).toBe(15); // Base genre quest XP
        expect(final.inkDrops).toBe(20); // 10 base + 10 from Coffee Elemental pipeline
        expect(final.modifiedBy).toContain('Coffee Elemental');
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
        
        expect(final.paperScraps).toBe(15); // 5 from room + 10 from biblioslinker
        expect(final.modifiedBy).toContain('The Biblioslinker');
    });

    test('should handle complex reward calculation', () => {
        characterState[STORAGE_KEYS.EQUIPPED_ITEMS] = [{ name: 'Coffee Elemental', type: 'Familiar' }];
        const final = RewardCalculator.calculateFinalRewards(
            '♠ Dungeon Crawl',
            '',
            {
                isEncounter: true,
                roomNumber: '1',
                encounterName: 'Will-o-wisps',
                appliedBuffs: [
                    '[Item] Coffee Elemental', // +10 ink drops (pipeline, needs cozy tag)
                    '[Background] Cartographer Bonus' // +10 ink drops (legacy, intentionally skipped)
                ],
                background: 'biblioslinker',
                quest: { type: '♠ Dungeon Crawl', tags: ['cozy'] }
            }
        );
        characterState[STORAGE_KEYS.EQUIPPED_ITEMS] = [];

        expect(final.xp).toBe(30); // Monster base XP
        expect(final.inkDrops).toBe(10); // 0 + 10 from Coffee Elemental pipeline
        expect(final.modifiedBy.length).toBeGreaterThan(0);
    });

    describe('ON_QUEST_COMPLETED auto-apply (EffectRegistry)', () => {
        const prevLearned = [];

        beforeEach(() => {
            prevLearned.splice(0, prevLearned.length, ...(characterState[STORAGE_KEYS.LEARNED_ABILITIES] || []));
            characterState[STORAGE_KEYS.LEARNED_ABILITIES] = [];
        });

        afterEach(() => {
            characterState[STORAGE_KEYS.LEARNED_ABILITIES] = [...prevLearned];
        });

        test('School of Enchantment multiplies XP on monster dungeon encounters without buff cards', () => {
            const final = RewardCalculator.calculateFinalRewards('♠ Dungeon Crawl', '', {
                appliedBuffs: [],
                wizardSchool: 'Enchantment',
                quest: { type: '♠ Dungeon Crawl', isEncounter: true, isBefriend: false },
                isEncounter: true,
                roomNumber: '1',
                encounterName: 'Will-o-wisps',
                isBefriend: false
            });

            expect(final.xp).toBe(45);
            expect(final.modifiedBy).toContain('School of Enchantment');
        });

        test('Silver Tongue adds paper scraps on any quest type when learned', () => {
            characterState[STORAGE_KEYS.LEARNED_ABILITIES] = ['Silver Tongue'];
            const genre = RewardCalculator.calculateFinalRewards('♥ Organize the Stacks', 'Fantasy', {
                quest: { type: '♥ Organize the Stacks' }
            });
            expect(genre.paperScraps).toBe(5);
            expect(genre.modifiedBy).toContain('Silver Tongue');

            const side = RewardCalculator.calculateFinalRewards('♣ Side Quest', 'The Arcane Grimoire', {
                quest: { type: '♣ Side Quest' }
            });
            expect(side.paperScraps).toBeGreaterThanOrEqual(5);
            expect(side.modifiedBy).toContain('Silver Tongue');
        });

        test('Alchemic Focus adds XP on extra credit when learned', () => {
            characterState[STORAGE_KEYS.LEARNED_ABILITIES] = ['Alchemic Focus'];
            const final = RewardCalculator.calculateFinalRewards('⭐ Extra Credit', '', {
                quest: { type: '⭐ Extra Credit' }
            });
            expect(final.xp).toBe(5);
            expect(final.modifiedBy).toContain('Alchemic Focus');
        });

        test('Conjuration does not add quest rewards when a familiar is equipped', () => {
            characterState[STORAGE_KEYS.EQUIPPED_ITEMS] = [{ name: 'Coffee Elemental', type: 'Familiar' }];
            const final = RewardCalculator.calculateFinalRewards('♥ Organize the Stacks', 'Fantasy', {
                wizardSchool: 'Conjuration',
                quest: { type: '♥ Organize the Stacks' }
            });
            expect(final.inkDrops).toBe(10);
            expect(final.modifiedBy).not.toContain('School of Conjuration');
            characterState[STORAGE_KEYS.EQUIPPED_ITEMS] = [];
        });
    });

    test('should check both temporaryBuffs and temporaryBuffsFromRewards', () => {
        // This test verifies that the RewardCalculator checks both sources
        const result = RewardCalculator._getModifier('Long Read Focus', false, false);
        
        // Long Read Focus should exist in temporaryBuffsFromRewards (legacy)
        // or temporaryBuffs (new)
        expect(result.modifier).toBeDefined();
    });

    test('should use passiveRewardModifier for items in passive slots', () => {
        // Setup: Add an atmospheric item to a passive slot
        characterState[STORAGE_KEYS.PASSIVE_ITEM_SLOTS] = [
            { itemName: "Gilded Painting" }
        ];
        characterState[STORAGE_KEYS.EQUIPPED_ITEMS] = [];

        const base = new Reward({ inkDrops: 10 });
        // Gilded Painting in passive slot should give +1 ink drop (passive), not +2 (active)
        const modified = RewardCalculator.applyModifiers(base, [
            '[Item] Gilded Painting'
        ]);

        expect(modified.inkDrops).toBe(11); // 10 base + 1 passive bonus
        expect(modified.modifiedBy).toContain("Gilded Painting");

        // Cleanup
        characterState[STORAGE_KEYS.PASSIVE_ITEM_SLOTS] = [];
    });

    test('should use active rewardModifier for equipped items, even if also in passive slot', () => {
        // Setup: Item in both passive slot AND equipped
        characterState[STORAGE_KEYS.PASSIVE_ITEM_SLOTS] = [
            { itemName: "Gilded Painting" }
        ];
        characterState[STORAGE_KEYS.EQUIPPED_ITEMS] = [
            { name: "Gilded Painting" }
        ];

        const base = new Reward({ inkDrops: 10 });
        // When equipped, should use active modifier (+2), not passive (+1)
        const modified = RewardCalculator.applyModifiers(base, [
            '[Item] Gilded Painting'
        ]);

        expect(modified.inkDrops).toBe(12); // 10 base + 2 active bonus
        expect(modified.modifiedBy).toContain("Gilded Painting");

        // Cleanup
        characterState[STORAGE_KEYS.PASSIVE_ITEM_SLOTS] = [];
        characterState[STORAGE_KEYS.EQUIPPED_ITEMS] = [];
    });

    test('should use passiveRewardModifier for items in passive item slots (via PASSIVE_ITEM_SLOTS)', () => {
        // Setup: Add an item to a passive item slot
        characterState[STORAGE_KEYS.PASSIVE_ITEM_SLOTS] = [
            { itemName: "Gilded Painting" }
        ];
        characterState[STORAGE_KEYS.EQUIPPED_ITEMS] = [];

        const base = new Reward({ inkDrops: 10 });
        // Gilded Painting in passive slot should give +1 ink drop (passive), not +2 (active)
        const modified = RewardCalculator.applyModifiers(base, [
            '[Item] Gilded Painting'
        ]);

        expect(modified.inkDrops).toBe(11); // 10 base + 1 passive bonus
        expect(modified.modifiedBy).toContain('Gilded Painting');

        // Cleanup
        characterState[STORAGE_KEYS.PASSIVE_ITEM_SLOTS] = [];
    });

    test('should use active modifier for items not in passive slots', () => {
        // Setup: No passive slots, item is just equipped
        characterState[STORAGE_KEYS.PASSIVE_ITEM_SLOTS] = [];
        characterState[STORAGE_KEYS.EQUIPPED_ITEMS] = [
            { name: "Gilded Painting" }
        ];

        const base = new Reward({ inkDrops: 10 });
        // Should use active modifier (+2)
        const modified = RewardCalculator.applyModifiers(base, [
            '[Item] Gilded Painting'
        ]);

        expect(modified.inkDrops).toBe(12); // 10 base + 2 active bonus
        expect(modified.modifiedBy).toContain("Gilded Painting");

        // Cleanup
        characterState[STORAGE_KEYS.EQUIPPED_ITEMS] = [];
    });

    test('should handle passive multiplier modifiers correctly', () => {
        // Setup: Add an item with a passive multiplier to a passive slot
        characterState[STORAGE_KEYS.PASSIVE_ITEM_SLOTS] = [
            { itemName: 'Scatter Brain Scarab' }
        ];
        characterState[STORAGE_KEYS.EQUIPPED_ITEMS] = [];

        const base = new Reward({ inkDrops: 10 });
        // Scatter Brain Scarab passive: x1.5 multiplier (active is x3)
        const modified = RewardCalculator.applyModifiers(base, [
            '[Item] Scatter Brain Scarab'
        ]);

        expect(modified.inkDrops).toBe(15); // 10 * 1.5 = 15
        expect(modified.modifiedBy).toContain('Scatter Brain Scarab');

        // Cleanup
        characterState[STORAGE_KEYS.PASSIVE_ITEM_SLOTS] = [];
    });

    // Note: page-count-aware item modifier tests removed during effects migration (Task 4).
    // Items like Bookwyrm's Scale, Tome of Potential, and Page Sprite now use the effects
    // pipeline with pageCount conditions instead of legacy rewardModifier + pageCondition.
    // Effects-based page-count tests are covered in the ModifierPipeline test suite.
});

describe('RewardCalculator - Book tags in TriggerPayload', () => {
    test('should include book tags in pipeline payload via getBook', () => {
        const quest = { bookId: 'book-123', type: '♥ Organize the Stacks' };
        const getBook = (id) => {
            if (id === 'book-123') return { title: 'Test Book', tags: ['fantasy', 'dragons'], genre: 'Fantasy' };
            return null;
        };
        // Use the internal method to verify tags reach the payload
        const payload = RewardCalculator._buildQuestCompletedPayload(
            '♥ Organize the Stacks', 'Fantasy', quest,
            { isEncounter: false, roomNumber: null, encounterName: null, isBefriend: true, getBook, state: {} }
        );
        expect(payload.tags).toEqual(expect.arrayContaining(['fantasy', 'dragons']));
        expect(payload.tags).toHaveLength(2);
    });

    test('should merge quest.tags with book.tags deduplicating', () => {
        const quest = { bookId: 'book-123', tags: ['fantasy', 'magic'] };
        const getBook = (id) => {
            if (id === 'book-123') return { title: 'Test Book', tags: ['fantasy', 'dragons'] };
            return null;
        };
        const payload = RewardCalculator._buildQuestCompletedPayload(
            '♥ Organize the Stacks', 'Fantasy', quest,
            { isEncounter: false, roomNumber: null, encounterName: null, isBefriend: true, getBook, state: {} }
        );
        expect(payload.tags).toEqual(expect.arrayContaining(['fantasy', 'magic', 'dragons']));
        expect(payload.tags).toHaveLength(3);
    });

    test('should return empty tags when book has no tags', () => {
        const quest = { bookId: 'book-123' };
        const getBook = (id) => {
            if (id === 'book-123') return { title: 'Test Book' };
            return null;
        };
        const payload = RewardCalculator._buildQuestCompletedPayload(
            '♥ Organize the Stacks', 'Fantasy', quest,
            { isEncounter: false, roomNumber: null, encounterName: null, isBefriend: true, getBook, state: {} }
        );
        expect(payload.tags).toEqual([]);
    });

    test('should return empty tags when no getBook function', () => {
        const quest = { bookId: 'book-123' };
        const payload = RewardCalculator._buildQuestCompletedPayload(
            '♥ Organize the Stacks', 'Fantasy', quest,
            { isEncounter: false, roomNumber: null, encounterName: null, isBefriend: true, getBook: null, state: {} }
        );
        expect(payload.tags).toEqual([]);
    });
});

describe('RewardCalculator - End of Month Calculations', () => {
    describe('calculateBookCompletionRewards', () => {
        test('should calculate XP for completed books', () => {
            const rewards = RewardCalculator.calculateBookCompletionRewards(3);
            
            expect(rewards.xp).toBe(45); // 3 × 15
            expect(rewards.inkDrops).toBe(0);
            expect(rewards.paperScraps).toBe(0);
            expect(rewards.items).toEqual([]);
        });

        test('should return zero XP for zero books', () => {
            const rewards = RewardCalculator.calculateBookCompletionRewards(0);
            
            expect(rewards.xp).toBe(0);
            expect(rewards.inkDrops).toBe(0);
            expect(rewards.paperScraps).toBe(0);
        });

        test('should handle negative input gracefully', () => {
            const rewards = RewardCalculator.calculateBookCompletionRewards(-5);
            
            expect(rewards.xp).toBe(0); // Math.max(0, -5) × 15 = 0
            expect(rewards.inkDrops).toBe(0);
            expect(rewards.paperScraps).toBe(0);
        });

        test('should handle large numbers', () => {
            const rewards = RewardCalculator.calculateBookCompletionRewards(100);
            
            expect(rewards.xp).toBe(1500); // 100 × 15
        });
    });

    describe('calculateJournalEntryRewards', () => {
        const emptyPipelineCtx = {
            stateAdapter: {
                state: {
                    [STORAGE_KEYS.LEARNED_ABILITIES]: [],
                    [STORAGE_KEYS.EQUIPPED_ITEMS]: [],
                    [STORAGE_KEYS.TEMPORARY_BUFFS]: []
                },
                formData: { keeperBackground: '', wizardSchool: '' }
            },
            dataModule: {
                keeperBackgrounds: {},
                schoolBenefits: {},
                masteryAbilities: {},
                allItems: {}
            }
        };

        test('should calculate paper scraps for journal entries without pipeline bonuses', () => {
            const rewards = RewardCalculator.calculateJournalEntryRewards(5, emptyPipelineCtx);

            expect(rewards.xp).toBe(0);
            expect(rewards.inkDrops).toBe(0);
            expect(rewards.paperScraps).toBe(25); // 5 × 5
            expect(rewards.items).toEqual([]);
            expect(rewards.modifiedBy).toEqual([]);
        });

        test('should apply Scribe background via ON_JOURNAL_ENTRY pipeline', () => {
            const ctx = {
                stateAdapter: {
                    state: {
                        [STORAGE_KEYS.LEARNED_ABILITIES]: [],
                        [STORAGE_KEYS.EQUIPPED_ITEMS]: [],
                        [STORAGE_KEYS.TEMPORARY_BUFFS]: []
                    },
                    formData: { keeperBackground: 'scribe', wizardSchool: '' }
                },
                dataModule: {
                    keeperBackgrounds: {
                        scribe: {
                            name: "The Scribe's Acolyte",
                            effects: [
                                {
                                    trigger: TRIGGERS.ON_JOURNAL_ENTRY,
                                    modifier: {
                                        type: MODIFIER_TYPES.ADD_FLAT,
                                        resource: 'paperScraps',
                                        value: 3
                                    }
                                }
                            ]
                        }
                    },
                    schoolBenefits: {},
                    masteryAbilities: {},
                    allItems: {}
                }
            };
            const rewards = RewardCalculator.calculateJournalEntryRewards(5, ctx);

            expect(rewards.xp).toBe(0);
            expect(rewards.inkDrops).toBe(0);
            expect(rewards.paperScraps).toBe(40); // 5 × (5 + 3)
            expect(rewards.modifiedBy).toContain("The Scribe's Acolyte");
        });

        test('should return zero for zero entries', () => {
            const rewards = RewardCalculator.calculateJournalEntryRewards(0, emptyPipelineCtx);

            expect(rewards.paperScraps).toBe(0);
            expect(rewards.modifiedBy).toEqual([]);
        });

        test('should handle negative input gracefully', () => {
            const rewards = RewardCalculator.calculateJournalEntryRewards(-3, emptyPipelineCtx);

            expect(rewards.paperScraps).toBe(0);
            expect(rewards.modifiedBy).toEqual([]);
        });

        test('should not apply Scribe bonus for non-scribe backgrounds', () => {
            const ctx = {
                ...emptyPipelineCtx,
                stateAdapter: {
                    ...emptyPipelineCtx.stateAdapter,
                    formData: { keeperBackground: 'archivist', wizardSchool: '' }
                }
            };
            const rewards = RewardCalculator.calculateJournalEntryRewards(5, ctx);

            expect(rewards.paperScraps).toBe(25);
            expect(rewards.modifiedBy).toEqual([]);
        });
    });

    describe('calculateAtmosphericBuffRewards', () => {
        test('should calculate ink drops for active atmospheric buffs', () => {
            const atmosphericBuffs = {
                'The Candlight Study': { daysUsed: 10, isActive: true },
                'The Soaking in Nature': { daysUsed: 5, isActive: true },
                'Inactive Buff': { daysUsed: 7, isActive: false }
            };
            
            const rewards = RewardCalculator.calculateAtmosphericBuffRewards(atmosphericBuffs, []);
            
            expect(rewards.xp).toBe(0);
            expect(rewards.inkDrops).toBe(15); // (10 + 5) × 1
            expect(rewards.paperScraps).toBe(0);
            expect(rewards.modifiedBy).toContain('The Candlight Study');
            expect(rewards.modifiedBy).toContain('The Soaking in Nature');
            expect(rewards.modifiedBy).not.toContain('Inactive Buff');
        });

        test('should apply sanctum bonus to associated buffs', () => {
            const atmosphericBuffs = {
                'The Candlight Study': { daysUsed: 10, isActive: true },
                'The Soaking in Nature': { daysUsed: 5, isActive: true }
            };
            const associatedBuffs = ['The Candlight Study'];
            
            const rewards = RewardCalculator.calculateAtmosphericBuffRewards(atmosphericBuffs, associatedBuffs);
            
            expect(rewards.inkDrops).toBe(25); // (10 × 2) + (5 × 1) = 25
            expect(rewards.modifiedBy).toContain('The Candlight Study');
            expect(rewards.modifiedBy).toContain('The Soaking in Nature');
        });

        test('should ignore buffs with zero days used', () => {
            const atmosphericBuffs = {
                'The Candlight Study': { daysUsed: 0, isActive: true },
                'The Soaking in Nature': { daysUsed: 5, isActive: true }
            };
            
            const rewards = RewardCalculator.calculateAtmosphericBuffRewards(atmosphericBuffs, []);
            
            expect(rewards.inkDrops).toBe(5); // Only 5 × 1
            expect(rewards.modifiedBy).not.toContain('The Candlight Study');
            expect(rewards.modifiedBy).toContain('The Soaking in Nature');
        });

        test('should handle empty atmospheric buffs object', () => {
            const rewards = RewardCalculator.calculateAtmosphericBuffRewards({}, []);
            
            expect(rewards.inkDrops).toBe(0);
            expect(rewards.modifiedBy).toEqual([]);
        });

        test('should handle multiple associated buffs', () => {
            const atmosphericBuffs = {
                'Buff 1': { daysUsed: 3, isActive: true },
                'Buff 2': { daysUsed: 4, isActive: true },
                'Buff 3': { daysUsed: 5, isActive: true }
            };
            const associatedBuffs = ['Buff 1', 'Buff 3'];
            
            const rewards = RewardCalculator.calculateAtmosphericBuffRewards(atmosphericBuffs, associatedBuffs);
            
            expect(rewards.inkDrops).toBe(20); // (3 × 2) + (4 × 1) + (5 × 2) = 6 + 4 + 10 = 20
        });

        test('should only process active buffs', () => {
            const atmosphericBuffs = {
                'Active Buff': { daysUsed: 10, isActive: true },
                'Inactive Buff': { daysUsed: 10, isActive: false }
            };
            
            const rewards = RewardCalculator.calculateAtmosphericBuffRewards(atmosphericBuffs, []);
            
            expect(rewards.inkDrops).toBe(10); // Only active buff counted
            expect(rewards.modifiedBy).toContain('Active Buff');
            expect(rewards.modifiedBy).not.toContain('Inactive Buff');
        });

        test('should count buffs in forcedActiveBuffNames even when isActive is false', () => {
            const atmosphericBuffs = {
                'The Soaking in Nature': { daysUsed: 7, isActive: false }
            };
            const rewards = RewardCalculator.calculateAtmosphericBuffRewards(
                atmosphericBuffs,
                [],
                ['The Soaking in Nature']
            );
            expect(rewards.inkDrops).toBe(7);
            expect(rewards.modifiedBy).toContain('The Soaking in Nature');
        });
    });
});

