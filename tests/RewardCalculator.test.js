/**
 * Tests for RewardCalculator service
 */

import { Reward, RewardCalculator } from '../assets/js/services/RewardCalculator.js';
import { characterState } from '../assets/js/character-sheet/state.js';
import { STORAGE_KEYS } from '../assets/js/character-sheet/storageKeys.js';
import { TRIGGERS, MODIFIER_TYPES } from '../assets/js/services/effectSchema.js';
import * as data from '../assets/js/character-sheet/data.js';
import { EffectRegistry } from '../assets/js/services/EffectRegistry.js';
import { ModifierPipeline } from '../assets/js/services/ModifierPipeline.js';
import { classifyBonusCardState } from '../assets/js/character-sheet/ui.js';
import { effectiveBookTags } from '../assets/js/utils/bookTagRules.js';

describe('Reward Class', () => {
    test('should create a reward with default values', () => {
        const reward = new Reward();

        expect(reward.xp).toBe(0);
        expect(reward.dollars).toBe(0);
        expect(reward.blueprints).toBe(0);
        expect(reward.items).toEqual([]);
        expect(reward.modifiedBy).toEqual([]);
        expect(reward.receipt.base).toEqual({ xp: 0, dollars: 0, blueprints: 0 });
    });

    test('should create a reward with custom values', () => {
        const reward = new Reward({
            xp: 15,
            dollars: 20,
            blueprints: 5,
            items: ['Test Item']
        });

        expect(reward.xp).toBe(15);
        expect(reward.dollars).toBe(20);
        expect(reward.blueprints).toBe(5);
        expect(reward.items).toEqual(['Test Item']);
    });

    test('has no inkDrops/paperScraps fields, even when given them', () => {
        const reward = new Reward({ xp: 1, inkDrops: 20, paperScraps: 5 });
        expect(reward).not.toHaveProperty('inkDrops');
        expect(reward).not.toHaveProperty('paperScraps');
        expect(reward.toJSON()).not.toHaveProperty('inkDrops');
    });

    test('fromAuthored keeps XP, blueprints and items and ignores legacy currency', () => {
        const reward = Reward.fromAuthored({ xp: 30, inkDrops: 10, paperScraps: 5, blueprints: 4, items: ['A'] });
        expect(reward.xp).toBe(30);
        expect(reward.blueprints).toBe(4);
        expect(reward.items).toEqual(['A']);
        expect(reward.dollars).toBe(0);
    });

    test('should clone a reward', () => {
        const original = new Reward({ xp: 10, dollars: 15 });
        original.modifiedBy = ['Test Modifier'];

        const cloned = original.clone();

        expect(cloned.xp).toBe(10);
        expect(cloned.dollars).toBe(15);
        expect(cloned.modifiedBy).toEqual(['Test Modifier']);

        // Verify it's a deep clone
        cloned.xp = 20;
        expect(original.xp).toBe(10);
    });

    test('should convert to JSON', () => {
        const reward = new Reward({ xp: 15, dollars: 20, items: ['Item1'] });
        reward.modifiedBy = ['Modifier1'];

        expect(reward.toJSON()).toEqual({
            xp: 15,
            dollars: 20,
            blueprints: 0,
            items: ['Item1'],
            modifiedBy: ['Modifier1']
        });
    });
});

describe('RewardCalculator - Base Rewards', () => {
    const QUEST_TYPES = {
        genre: ['♥ Organize the Stacks', 'Fantasy', {}],
        side: ['♣ Side Quest', 'The Arcane Grimoire', {}],
        dungeonRoom: ['♠ Dungeon Crawl', '', { isEncounter: false, roomNumber: '1' }],
        dungeonEncounter: ['♠ Dungeon Crawl', '', { isEncounter: true, roomNumber: '1', encounterName: 'Will-o-wisps' }],
        extraCredit: ['⭐ Extra Credit', '', {}],
        restoration: ['🔨 Restoration Project', 'Some project: restore it', {}]
    };

    test.each(['genre', 'side', 'dungeonRoom', 'dungeonEncounter', 'extraCredit', 'restoration'])(
        '%s quest pays $15 base',
        (key) => {
            const [type, prompt, options] = QUEST_TYPES[key];
            const reward = RewardCalculator.calculateFinalRewards(type, prompt, {
                ...options,
                quest: { type }
            });
            expect(reward.dollars).toBe(15);
            expect(reward.receipt.base.dollars).toBe(15);
            expect(reward.receipt.final.dollars).toBe(15);
        }
    );

    test('should calculate Extra Credit rewards', () => {
        const rewards = RewardCalculator.getBaseRewards('⭐ Extra Credit', '');

        expect(rewards.xp).toBe(0);
        expect(rewards.dollars).toBe(15);
    });

    test('should calculate Organize the Stacks rewards', () => {
        const rewards = RewardCalculator.getBaseRewards('♥ Organize the Stacks', 'Fantasy');

        expect(rewards.xp).toBe(15);
        expect(rewards.dollars).toBe(15);
    });

    test('should calculate Side Quest rewards', () => {
        const rewards = RewardCalculator.getBaseRewards('♣ Side Quest', 'The Arcane Grimoire');

        // Based on data.js sideQuestsDetailed
        expect(rewards.items).toContain('Long Read Focus');
        expect(rewards.dollars).toBe(15);
    });

    test('should ignore authored room Ink/Paper and pay the flat dollar base', () => {
        const rewards = RewardCalculator.getBaseRewards('♠ Dungeon Crawl', '', {
            isEncounter: false,
            roomNumber: '1'
        });

        expect(rewards.dollars).toBe(15);
        expect(rewards.xp).toBe(0);
    });

    test('should calculate Dungeon monster encounter rewards', () => {
        const rewards = RewardCalculator.getBaseRewards('♠ Dungeon Crawl', '', {
            isEncounter: true,
            roomNumber: '1',
            encounterName: 'Will-o-wisps'
        });

        // Monster encounters give 30 XP
        expect(rewards.xp).toBe(30);
        expect(rewards.dollars).toBe(15);
    });

    test('should pay the dollar base for a friendly creature encounter', () => {
        const rewards = RewardCalculator.getBaseRewards('♠ Dungeon Crawl', '', {
            isEncounter: true,
            roomNumber: '1',
            encounterName: "Librarian's Spirit"
        });

        expect(rewards.dollars).toBe(15);
        expect(rewards.xp).toBe(0);
    });

    test('should return the dollar base for unknown quest type', () => {
        const rewards = RewardCalculator.getBaseRewards('Unknown Type', '');

        expect(rewards.dollars).toBe(15);
        expect(rewards.xp).toBe(0);
    });
});

describe('RewardCalculator - buff card modifiers', () => {
    afterEach(() => {
        characterState[STORAGE_KEYS.PASSIVE_ITEM_SLOTS] = [];
        characterState[STORAGE_KEYS.EQUIPPED_ITEMS] = [];
    });

    test('legacy rewardModifier dollars/xp/blueprints become flat ADD_FLAT pipeline effects', () => {
        const effects = RewardCalculator._modifierToBuffCardEffects({ dollars: 3, xp: 5, blueprints: 0 }, 'Test Buff');
        expect(effects.map(e => e.effect.modifier)).toEqual([
            { type: MODIFIER_TYPES.ADD_FLAT, resource: 'xp', value: 5 },
            { type: MODIFIER_TYPES.ADD_FLAT, resource: 'dollars', value: 3 }
        ]);
        expect(effects.every(e => e.effect.trigger === TRIGGERS.ON_QUEST_COMPLETED)).toBe(true);
    });

    test('legacy Ink/Paper rewardModifier keys produce no pipeline effects', () => {
        const effects = RewardCalculator._modifierToBuffCardEffects(
            { inkDrops: 10, paperScraps: 2, inkDropsMultiplier: 3 },
            'Legacy Buff'
        );
        expect(effects).toEqual([]);
    });

    test('background cards contribute no legacy modifier (EffectRegistry owns backgrounds)', () => {
        expect(RewardCalculator._getModifier('Archivist Bonus', false, true)).toEqual({ modifier: null });
    });

    test('should check both temporaryBuffs and temporaryBuffsFromRewards', () => {
        const result = RewardCalculator._getModifier('Long Read Focus', false, false);
        expect(result.modifier).toBeDefined();
    });

    test('should use passiveRewardModifier for items in passive slots', () => {
        characterState[STORAGE_KEYS.PASSIVE_ITEM_SLOTS] = [{ itemName: 'Gilded Painting' }];
        characterState[STORAGE_KEYS.EQUIPPED_ITEMS] = [];

        const { modifier } = RewardCalculator._getModifier('Gilded Painting', true, false);
        expect(modifier).toEqual(data.allItems['Gilded Painting'].passiveRewardModifier);
    });

    test('should use active rewardModifier for equipped items, even if also in passive slot', () => {
        characterState[STORAGE_KEYS.PASSIVE_ITEM_SLOTS] = [{ itemName: 'Gilded Painting' }];
        characterState[STORAGE_KEYS.EQUIPPED_ITEMS] = [{ name: 'Gilded Painting' }];

        const { modifier } = RewardCalculator._getModifier('Gilded Painting', true, false);
        expect(modifier).toEqual(data.allItems['Gilded Painting'].rewardModifier);
    });

    test('should use active modifier for items not in passive slots', () => {
        characterState[STORAGE_KEYS.EQUIPPED_ITEMS] = [{ name: 'Gilded Painting' }];

        const { modifier } = RewardCalculator._getModifier('Gilded Painting', true, false);
        expect(modifier).toEqual(data.allItems['Gilded Painting'].rewardModifier);
    });

    test('a dollar buff card adds a flat dollar line on top of the $15 base', () => {
        const spy = jest.spyOn(RewardCalculator, '_getModifier').mockReturnValue({ modifier: { dollars: 3 } });
        try {
            const final = RewardCalculator.calculateFinalRewards('♥ Organize the Stacks', 'Fantasy', {
                appliedBuffs: ['[Buff] Test Dollar Buff'],
                quest: { type: '♥ Organize the Stacks' }
            });
            expect(final.dollars).toBe(18);
            expect(final.modifiedBy).toContain('Test Dollar Buff');
            const line = final.receipt.modifiers.find(m => m.source === 'Test Dollar Buff');
            expect(line).toMatchObject({ currency: 'dollars', value: 3, description: '+$3' });
        } finally {
            spy.mockRestore();
        }
    });
});

describe('RewardCalculator - Background bonuses via ModifierPipeline', () => {
    test('should not double-apply Archivist when legacy background card is selected', () => {
        const modified = RewardCalculator.calculateFinalRewards('♥ Organize the Stacks', 'Non-Fiction: Archive work', {
            appliedBuffs: ['[Background] Archivist Bonus'],
            background: 'archivist',
            quest: { type: '♥ Organize the Stacks', genre: 'Non-Fiction', tags: ['non-fiction'] }
        });

        expect(modified.dollars).toBe(17);
        expect(modified.modifiedBy).toContain("The Archivist's Apprentice");
        expect(modified.modifiedBy).not.toContain('Archivist Bonus');
    });

    test('should still apply non-background buff cards with pipeline backgrounds', () => {
        characterState[STORAGE_KEYS.EQUIPPED_ITEMS] = [{ name: 'Coffee Elemental', type: 'Familiar' }];
        const modified = RewardCalculator.calculateFinalRewards('♥ Organize the Stacks', 'Non-Fiction: Archive work', {
            appliedBuffs: ['[Background] Archivist Bonus', '[Item] Coffee Elemental'],
            background: 'archivist',
            quest: { type: '♥ Organize the Stacks', genre: 'Non-Fiction', tags: ['non-fiction', 'cozy'] }
        });
        characterState[STORAGE_KEYS.EQUIPPED_ITEMS] = [];

        expect(modified.dollars).toBe(19);
        expect(modified.modifiedBy).toContain("The Archivist's Apprentice");
        expect(modified.modifiedBy).toContain('Coffee Elemental');
        expect(modified.modifiedBy).not.toContain('Archivist Bonus');
    });

    test('should apply Biblioslinker bonus to dungeon crawls', () => {
        const modified = RewardCalculator.calculateFinalRewards('♠ Dungeon Crawl', '', {
            background: 'biblioslinker',
            quest: { type: '♠ Dungeon Crawl' }
        });

        expect(modified.dollars).toBe(18);
        expect(modified.modifiedBy).toContain('The Biblioslinker');
    });

    test('should not apply Biblioslinker bonus to non-dungeon quests', () => {
        const modified = RewardCalculator.calculateFinalRewards('♥ Organize the Stacks', 'Fantasy', {
            background: 'biblioslinker',
            quest: { type: '♥ Organize the Stacks' }
        });

        expect(modified.dollars).toBe(15);
        expect(modified.modifiedBy).toEqual([]);
    });

    test('should not apply background effects when no background selected', () => {
        const modified = RewardCalculator.calculateFinalRewards('♠ Dungeon Crawl', '', {
            background: '',
            quest: { type: '♠ Dungeon Crawl' }
        });

        expect(modified.dollars).toBe(15);
        expect(modified.modifiedBy).toEqual([]);
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

        expect(final.xp).toBe(15);
        expect(final.dollars).toBe(17);
        expect(final.modifiedBy).toContain('Coffee Elemental');
    });

    test('should handle a monster encounter calculation', () => {
        const final = RewardCalculator.calculateFinalRewards('♠ Dungeon Crawl', '', {
            isEncounter: true,
            roomNumber: '1',
            encounterName: 'Will-o-wisps',
            appliedBuffs: ['[Background] Cartographer Bonus'], // legacy card, intentionally skipped
            quest: { type: '♠ Dungeon Crawl' }
        });

        expect(final.xp).toBe(30); // Monster base XP
        expect(final.dollars).toBe(15);
        expect(final.modifiedBy).not.toContain('Cartographer Bonus');
    });

    test('flat dollar effects from the registry stack on the $15 base', () => {
        const effects = [
            { effect: { trigger: TRIGGERS.ON_QUEST_COMPLETED, modifier: { type: MODIFIER_TYPES.ADD_FLAT, resource: 'dollars', value: 3 } }, source: { name: 'A' } },
            { effect: { trigger: TRIGGERS.ON_QUEST_COMPLETED, modifier: { type: MODIFIER_TYPES.ADD_FLAT, resource: 'dollars', value: 2 } }, source: { name: 'B' } }
        ];
        const { EffectRegistry } = jest.requireActual('../assets/js/services/EffectRegistry.js');
        const spy = jest.spyOn(EffectRegistry, 'getActiveEffects').mockReturnValue(effects);
        try {
            const final = RewardCalculator.calculateFinalRewards('♣ Side Quest', 'The Arcane Grimoire', {
                quest: { type: '♣ Side Quest' }
            });
            expect(final.dollars).toBe(20);
            expect(final.receipt.final.dollars).toBe(20);
        } finally {
            spy.mockRestore();
        }
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

        test('School of Enchantment adds a flat +10 XP on monster dungeon encounters without buff cards', () => {
            const final = RewardCalculator.calculateFinalRewards('♠ Dungeon Crawl', '', {
                appliedBuffs: [],
                wizardSchool: 'Enchantment',
                quest: { type: '♠ Dungeon Crawl', isEncounter: true, isBefriend: false },
                isEncounter: true,
                roomNumber: '1',
                encounterName: 'Will-o-wisps',
                isBefriend: false
            });

            expect(final.xp).toBe(40); // 30 monster base + 10 flat (no multiplier)
            expect(final.modifiedBy).toContain('School of Enchantment');
        });

        test('Silver Tongue adds dollars on any quest type when learned', () => {
            characterState[STORAGE_KEYS.LEARNED_ABILITIES] = ['Silver Tongue'];
            const genre = RewardCalculator.calculateFinalRewards('♥ Organize the Stacks', 'Fantasy', {
                quest: { type: '♥ Organize the Stacks' }
            });
            expect(genre.dollars).toBe(16);
            expect(genre.modifiedBy).toContain('Silver Tongue');

            const side = RewardCalculator.calculateFinalRewards('♣ Side Quest', 'The Arcane Grimoire', {
                quest: { type: '♣ Side Quest' }
            });
            expect(side.dollars).toBeGreaterThanOrEqual(16);
            expect(side.modifiedBy).toContain('Silver Tongue');
        });

        test('Alchemic Focus adds XP on extra credit when learned', () => {
            characterState[STORAGE_KEYS.LEARNED_ABILITIES] = ['Alchemic Focus'];
            const final = RewardCalculator.calculateFinalRewards('⭐ Extra Credit', '', {
                quest: { type: '⭐ Extra Credit' }
            });
            expect(final.xp).toBe(5);
            expect(final.dollars).toBe(15);
            expect(final.modifiedBy).toContain('Alchemic Focus');
        });

        test('Conjuration does not add quest rewards when a familiar is equipped', () => {
            characterState[STORAGE_KEYS.EQUIPPED_ITEMS] = [{ name: 'Coffee Elemental', type: 'Familiar' }];
            const final = RewardCalculator.calculateFinalRewards('♥ Organize the Stacks', 'Fantasy', {
                wizardSchool: 'Conjuration',
                quest: { type: '♥ Organize the Stacks' }
            });
            expect(final.dollars).toBe(15);
            expect(final.modifiedBy).not.toContain('School of Conjuration');
            characterState[STORAGE_KEYS.EQUIPPED_ITEMS] = [];
        });
    });
});

describe('RewardCalculator - secondary quest base (one book, two quests)', () => {
    const book = { id: 'book-2q', title: 'Two Quest Book', links: { questIds: ['q-first', 'q-second'], curriculumPromptIds: [] } };
    const getBook = (id) => (id === book.id ? book : null);

    afterEach(() => {
        characterState[STORAGE_KEYS.EQUIPPED_ITEMS] = [];
    });

    test('secondary quest for a book pays $10 base, item bonuses still apply', () => {
        characterState[STORAGE_KEYS.EQUIPPED_ITEMS] = [{ name: 'Coffee Elemental', type: 'Familiar' }];
        const quest = { id: 'q-second', bookId: book.id, type: '♥ Organize the Stacks', tags: ['cozy'] };
        const final = RewardCalculator.calculateFinalRewards('♥ Organize the Stacks', 'Fantasy', {
            appliedBuffs: ['[Item] Coffee Elemental'],
            quest,
            getBook
        });

        expect(final.receipt.base.dollars).toBe(10);
        expect(final.dollars).toBe(12); // $10 secondary base + Coffee Elemental $2
        expect(final.receipt.final.dollars).toBe(12);
        expect(final.modifiedBy).toContain('Coffee Elemental');
    });

    test('the first quest on the same book keeps the $15 base', () => {
        const final = RewardCalculator.calculateFinalRewards('⭐ Extra Credit', '', {
            quest: { id: 'q-first', bookId: book.id, type: '⭐ Extra Credit' },
            getBook
        });
        expect(final.dollars).toBe(15);
        expect(final.receipt.base.dollars).toBe(15);
    });

    test('quest without bookId pays $15', () => {
        const final = RewardCalculator.calculateFinalRewards('⭐ Extra Credit', '', {
            quest: { id: 'q-second', type: '⭐ Extra Credit' },
            getBook
        });
        expect(final.dollars).toBe(15);
    });

    test('prefers the state adapter verdict (which ignores stale links) over raw book links', () => {
        const stateAdapter = { state: characterState, formData: {}, isSecondaryQuestForBook: jest.fn(() => false) };
        const final = RewardCalculator.calculateFinalRewards('⭐ Extra Credit', '', {
            quest: { id: 'q-second', bookId: book.id, type: '⭐ Extra Credit' },
            getBook,
            stateAdapter
        });
        expect(stateAdapter.isSecondaryQuestForBook).toHaveBeenCalledWith(book.id, 'q-second');
        expect(final.dollars).toBe(15);
    });

    test('an explicit isSecondaryQuest verdict overrides the stored links', () => {
        const final = RewardCalculator.calculateFinalRewards('⭐ Extra Credit', '', {
            quest: { bookId: 'unknown-book', type: '⭐ Extra Credit' },
            isSecondaryQuest: true
        });
        expect(final.dollars).toBe(10);
    });
});

describe('RewardCalculator - Book tags in TriggerPayload', () => {
    test('should include book tags in pipeline payload via getBook', () => {
        const quest = { bookId: 'book-123', type: '♥ Organize the Stacks' };
        const getBook = (id) => {
            if (id === 'book-123') return { title: 'Test Book', tags: ['fantasy', 'dragons'], genre: 'Fantasy' };
            return null;
        };
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
        test('library book completion grants 15 XP and 0 dollars', () => {
            const rewards = RewardCalculator.calculateBookCompletionRewards(1);

            expect(rewards.xp).toBe(15);
            expect(rewards.dollars).toBe(0);
            expect(rewards.receipt.final.dollars).toBe(0);
        });

        test('should calculate XP for completed books', () => {
            const rewards = RewardCalculator.calculateBookCompletionRewards(3);

            expect(rewards.xp).toBe(45); // 3 × 15
            expect(rewards.dollars).toBe(0);
            expect(rewards.items).toEqual([]);
        });

        test('should return zero XP for zero books', () => {
            const rewards = RewardCalculator.calculateBookCompletionRewards(0);

            expect(rewards.xp).toBe(0);
            expect(rewards.dollars).toBe(0);
        });

        test('should handle negative input gracefully', () => {
            const rewards = RewardCalculator.calculateBookCompletionRewards(-5);

            expect(rewards.xp).toBe(0); // Math.max(0, -5) × 15 = 0
            expect(rewards.dollars).toBe(0);
        });

        test('should handle large numbers', () => {
            const rewards = RewardCalculator.calculateBookCompletionRewards(100);

            expect(rewards.xp).toBe(1500); // 100 × 15
        });
    });

    describe('calculateAtmosphericBuffRewards', () => {
        test('atmospheric pays $1/day and sanctum-associated $2/day', () => {
            const atmosphericBuffs = {
                'The Candlight Study': { daysUsed: 3, isActive: true },
                'The Soaking in Nature': { daysUsed: 2, isActive: true }
            };

            const rewards = RewardCalculator.calculateAtmosphericBuffRewards(atmosphericBuffs, ['The Soaking in Nature']);

            expect(rewards.dollars).toBe(7); // 3 × $1 + 2 × $2
            expect(rewards.receipt.final.dollars).toBe(7);
            const lines = rewards.getReceipt().modifiers.map(m => m.description);
            expect(lines).toEqual(['3 days × $1', '2 days × $2 (Sanctum bonus)']);
        });

        test('should calculate dollars for active atmospheric buffs', () => {
            const atmosphericBuffs = {
                'The Candlight Study': { daysUsed: 10, isActive: true },
                'The Soaking in Nature': { daysUsed: 5, isActive: true },
                'Inactive Buff': { daysUsed: 7, isActive: false }
            };

            const rewards = RewardCalculator.calculateAtmosphericBuffRewards(atmosphericBuffs, []);

            expect(rewards.xp).toBe(0);
            expect(rewards.dollars).toBe(15); // (10 + 5) × $1
            expect(rewards.modifiedBy).toContain('The Candlight Study');
            expect(rewards.modifiedBy).toContain('The Soaking in Nature');
            expect(rewards.modifiedBy).not.toContain('Inactive Buff');
        });

        test('should apply sanctum bonus to associated buffs', () => {
            const atmosphericBuffs = {
                'The Candlight Study': { daysUsed: 10, isActive: true },
                'The Soaking in Nature': { daysUsed: 5, isActive: true }
            };

            const rewards = RewardCalculator.calculateAtmosphericBuffRewards(atmosphericBuffs, ['The Candlight Study']);

            expect(rewards.dollars).toBe(25); // (10 × 2) + (5 × 1)
        });

        test('should ignore buffs with zero days used', () => {
            const atmosphericBuffs = {
                'The Candlight Study': { daysUsed: 0, isActive: true },
                'The Soaking in Nature': { daysUsed: 5, isActive: true }
            };

            const rewards = RewardCalculator.calculateAtmosphericBuffRewards(atmosphericBuffs, []);

            expect(rewards.dollars).toBe(5);
            expect(rewards.modifiedBy).not.toContain('The Candlight Study');
        });

        test('should handle empty atmospheric buffs object', () => {
            const rewards = RewardCalculator.calculateAtmosphericBuffRewards({}, []);

            expect(rewards.dollars).toBe(0);
            expect(rewards.modifiedBy).toEqual([]);
        });

        test('should handle multiple associated buffs', () => {
            const atmosphericBuffs = {
                'Buff 1': { daysUsed: 3, isActive: true },
                'Buff 2': { daysUsed: 4, isActive: true },
                'Buff 3': { daysUsed: 5, isActive: true }
            };

            const rewards = RewardCalculator.calculateAtmosphericBuffRewards(atmosphericBuffs, ['Buff 1', 'Buff 3']);

            expect(rewards.dollars).toBe(20); // (3 × 2) + (4 × 1) + (5 × 2)
        });

        test('should only process active buffs', () => {
            const atmosphericBuffs = {
                'Active Buff': { daysUsed: 10, isActive: true },
                'Inactive Buff': { daysUsed: 10, isActive: false }
            };

            const rewards = RewardCalculator.calculateAtmosphericBuffRewards(atmosphericBuffs, []);

            expect(rewards.dollars).toBe(10);
            expect(rewards.modifiedBy).toContain('Active Buff');
            expect(rewards.modifiedBy).not.toContain('Inactive Buff');
        });

        test('should count buffs in forcedActiveBuffNames even when isActive is false', () => {
            const rewards = RewardCalculator.calculateAtmosphericBuffRewards(
                { 'The Soaking in Nature': { daysUsed: 7, isActive: false } },
                [],
                ['The Soaking in Nature']
            );
            expect(rewards.dollars).toBe(7);
            expect(rewards.modifiedBy).toContain('The Soaking in Nature');
        });

        test('Tome-Bound Cat adds +$1 per atmospheric buff day (4 days -> +$4)', () => {
            const rewards = RewardCalculator.calculateAtmosphericBuffRewards(
                { 'The Candlight Study': { daysUsed: 4, isActive: true } },
                [],
                [],
                { dailyBonus: 1, dailyBonusSource: 'Tome-Bound Cat' }
            );

            expect(rewards.dollars).toBe(8); // 4 × $1 base + 4 × $1 cat
        });

        test('should record the daily bonus as its own receipt line', () => {
            const rewards = RewardCalculator.calculateAtmosphericBuffRewards(
                { 'The Candlight Study': { daysUsed: 10, isActive: true } },
                [],
                [],
                { dailyBonus: 1, dailyBonusSource: 'Tome-Bound Cat' }
            );
            const receipt = rewards.getReceipt();

            const catLine = receipt.modifiers.find((m) => m.source === 'Tome-Bound Cat');
            expect(catLine).toMatchObject({ type: 'atmospheric-bonus', value: 10, currency: 'dollars' });
            expect(receipt.final.dollars).toBe(20);
        });

        test('the daily bonus pays nothing when no atmospheric day paid out', () => {
            const rewards = RewardCalculator.calculateAtmosphericBuffRewards(
                { 'The Candlight Study': { daysUsed: 5, isActive: false } },
                [],
                [],
                { dailyBonus: 1, dailyBonusSource: 'Tome-Bound Cat' }
            );

            expect(rewards.dollars).toBe(0);
            expect(rewards.getReceipt().modifiers).toEqual([]);
        });

        test('should leave the total alone when there is no daily bonus', () => {
            const rewards = RewardCalculator.calculateAtmosphericBuffRewards(
                { 'The Candlight Study': { daysUsed: 10, isActive: true } },
                [],
                [],
                {}
            );

            expect(rewards.dollars).toBe(10);
            expect(rewards.getReceipt().modifiers.length).toBe(1);
        });

        test('should pay trackable items at their own per-day value even when isActive is false', () => {
            const rewards = RewardCalculator.calculateAtmosphericBuffRewards(
                { 'Garden Gnome': { daysUsed: 10, isActive: false } },
                [],
                [],
                { trackableItemValues: { 'Garden Gnome': 1 } }
            );

            expect(rewards.dollars).toBe(10); // 10 days × the item's own $1/day
            expect(rewards.modifiedBy).toContain('Garden Gnome');
        });

        test('the daily bonus counts atmospheric buff days only, not trackable setting-item days', () => {
            const rewards = RewardCalculator.calculateAtmosphericBuffRewards(
                {
                    'The Candlight Study': { daysUsed: 5, isActive: true },
                    'Garden Gnome': { daysUsed: 3, isActive: false },
                    'Gilded Painting': { daysUsed: 4, isActive: false },
                    'Mystical Moth': { daysUsed: 2, isActive: false }
                },
                [],
                [],
                {
                    dailyBonus: 1,
                    dailyBonusSource: 'Tome-Bound Cat',
                    trackableItemValues: { 'Garden Gnome': 1, 'Gilded Painting': 1, 'Mystical Moth': 1 }
                }
            );

            // (5 buff + 3 gnome + 4 painting + 2 moth) × $1 = $14, plus Cat on the 5 buff days only = $19
            expect(rewards.dollars).toBe(19);
            const catLine = rewards.getReceipt().modifiers.find((m) => m.source === 'Tome-Bound Cat');
            expect(catLine).toMatchObject({ type: 'atmospheric-bonus', value: 5, description: '5 days × +$1' });
        });

        test('the daily bonus pays nothing when only trackable setting-item days are present', () => {
            const rewards = RewardCalculator.calculateAtmosphericBuffRewards(
                { 'Garden Gnome': { daysUsed: 6, isActive: false } },
                [],
                [],
                { dailyBonus: 1, dailyBonusSource: 'Tome-Bound Cat', trackableItemValues: { 'Garden Gnome': 1 } }
            );

            expect(rewards.dollars).toBe(6);
            expect(rewards.getReceipt().modifiers.find((m) => m.source === 'Tome-Bound Cat')).toBeUndefined();
        });

        test('should not pay a trackable item with zero days used', () => {
            const rewards = RewardCalculator.calculateAtmosphericBuffRewards(
                { 'Garden Gnome': { daysUsed: 0, isActive: false } },
                [],
                [],
                { trackableItemValues: { 'Garden Gnome': 1 } }
            );

            expect(rewards.dollars).toBe(0);
            expect(rewards.modifiedBy).not.toContain('Garden Gnome');
        });
    });
});

describe('RewardCalculator - book types at the reward seam (schema 20, D3)', () => {
    // A test-only catalog entry: no real item names the type-derived tag today.
    const testCatalog = {
        allItems: {
            'test-audio-charm': {
                id: 'test-audio-charm',
                name: 'Test Audio Charm',
                effects: [{
                    trigger: TRIGGERS.ON_QUEST_COMPLETED,
                    condition: { tagMatch: [['audio']] },
                    modifier: { type: MODIFIER_TYPES.ADD_FLAT, resource: 'dollars', value: 3 }
                }]
            }
        }
    };
    const audiobook = { id: 'book-audio', title: 'The Salt Road', type: 'audiobook', tags: ['fantasy'] };
    const getBook = (id) => (id === audiobook.id ? audiobook : null);
    const ctx = { isEncounter: false, roomNumber: null, encounterName: null, isBefriend: true, getBook, state: {} };

    test('an audiobook without a stored audio tag has audio in payload.tags', () => {
        const payload = RewardCalculator._buildQuestCompletedPayload(
            '♥ Organize the Stacks', 'Fantasy', { bookId: audiobook.id }, ctx
        );
        expect(new Set(payload.tags)).toEqual(new Set(['fantasy', 'audio']));
    });

    test('an item matching tagMatch [["audio"]] applies to the audiobook', () => {
        const payload = RewardCalculator._buildQuestCompletedPayload(
            '♥ Organize the Stacks', 'Fantasy', { bookId: audiobook.id }, ctx
        );
        const state = {
            [STORAGE_KEYS.EQUIPPED_ITEMS]: ['test-audio-charm'],
            [STORAGE_KEYS.PASSIVE_ITEM_SLOTS]: [],
            [STORAGE_KEYS.PASSIVE_FAMILIAR_SLOTS]: []
        };
        const effects = EffectRegistry.getActiveEffects(TRIGGERS.ON_QUEST_COMPLETED, state, testCatalog);
        expect(effects).toHaveLength(1);
        const reward = ModifierPipeline.resolve(TRIGGERS.ON_QUEST_COMPLETED, payload, effects, new Reward());
        expect(reward.dollars).toBe(3);
        expect(reward.modifiedBy).toContain('Test Audio Charm');
    });

    test('classifyBonusCardState with effectiveBookTags auto-applies the audio bonus', () => {
        const bonus = { type: 'item', itemData: testCatalog.allItems['test-audio-charm'] };
        expect(classifyBonusCardState(bonus, effectiveBookTags(audiobook))).toBe('auto-applied');
        expect(classifyBonusCardState(bonus, audiobook.tags)).toBe('unmatched');
    });
});
