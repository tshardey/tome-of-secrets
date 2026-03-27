import { Reward } from '../assets/js/services/RewardCalculator.js';
import { ModifierPipeline } from '../assets/js/services/ModifierPipeline.js';
import { EffectRegistry } from '../assets/js/services/EffectRegistry.js';
import { TRIGGERS, MODIFIER_TYPES, validateEffect } from '../assets/js/services/effectSchema.js';
import { STORAGE_KEYS } from '../assets/js/character-sheet/storageKeys.js';

describe('effectSchema', () => {
    test('validateEffect accepts valid effect', () => {
        const result = validateEffect({
            trigger: TRIGGERS.ON_QUEST_COMPLETED,
            modifier: {
                type: MODIFIER_TYPES.ADD_FLAT,
                resource: 'xp',
                value: 10
            }
        });
        expect(result.valid).toBe(true);
    });

    test('validateEffect rejects invalid modifier type', () => {
        const result = validateEffect({
            trigger: TRIGGERS.ON_QUEST_COMPLETED,
            modifier: {
                type: 'NOT_A_REAL_TYPE'
            }
        });
        expect(result.valid).toBe(false);
    });
});

describe('ModifierPipeline.resolve', () => {
    test('applies ADD_FLAT effects', () => {
        const base = new Reward({ xp: 10 });
        const effects = [
            {
                source: { name: 'Bonus Source' },
                effect: {
                    trigger: TRIGGERS.ON_QUEST_COMPLETED,
                    modifier: {
                        type: MODIFIER_TYPES.ADD_FLAT,
                        resource: 'xp',
                        value: 5
                    }
                }
            }
        ];

        const result = ModifierPipeline.resolve(TRIGGERS.ON_QUEST_COMPLETED, {}, effects, base);
        expect(result.xp).toBe(15);
        expect(result.modifiedBy).toContain('Bonus Source');
    });

    test('applies MULTIPLY effects', () => {
        const base = new Reward({ xp: 10 });
        const effects = [
            {
                source: { name: 'Multiplier Source' },
                effect: {
                    trigger: TRIGGERS.ON_QUEST_COMPLETED,
                    modifier: {
                        type: MODIFIER_TYPES.MULTIPLY,
                        resource: 'xp',
                        value: 1.5
                    }
                }
            }
        ];

        const result = ModifierPipeline.resolve(TRIGGERS.ON_QUEST_COMPLETED, {}, effects, base);
        expect(result.xp).toBe(15);
    });

    test('applies flat before multiplier', () => {
        const base = new Reward({ xp: 10 });
        const effects = [
            {
                source: { name: 'Flat' },
                effect: {
                    trigger: TRIGGERS.ON_QUEST_COMPLETED,
                    modifier: {
                        type: MODIFIER_TYPES.ADD_FLAT,
                        resource: 'xp',
                        value: 10
                    }
                }
            },
            {
                source: { name: 'Multiply' },
                effect: {
                    trigger: TRIGGERS.ON_QUEST_COMPLETED,
                    modifier: {
                        type: MODIFIER_TYPES.MULTIPLY,
                        resource: 'xp',
                        value: 2
                    }
                }
            }
        ];

        const result = ModifierPipeline.resolve(TRIGGERS.ON_QUEST_COMPLETED, {}, effects, base);
        expect(result.xp).toBe(40);
    });

    test('skips effects with unmet condition', () => {
        const base = new Reward({ paperScraps: 10 });
        const effects = [
            {
                source: { name: 'Dungeon Bonus' },
                effect: {
                    trigger: TRIGGERS.ON_QUEST_COMPLETED,
                    condition: { questType: 'dungeon_crawl' },
                    modifier: {
                        type: MODIFIER_TYPES.ADD_FLAT,
                        resource: 'paperScraps',
                        value: 10
                    }
                }
            }
        ];

        const result = ModifierPipeline.resolve(
            TRIGGERS.ON_QUEST_COMPLETED,
            { questType: 'side_quest' },
            effects,
            base
        );
        expect(result.paperScraps).toBe(10);
    });

    test('matches condition keys including genre and pageCount', () => {
        const base = new Reward({ inkDrops: 0 });
        const effects = [
            {
                source: { name: 'Genre and Length' },
                effect: {
                    trigger: TRIGGERS.ON_QUEST_COMPLETED,
                    condition: {
                        genre: ['Non-Fiction', 'Historical Fiction'],
                        pageCount: { min: 250 }
                    },
                    modifier: {
                        type: MODIFIER_TYPES.ADD_FLAT,
                        resource: 'inkDrops',
                        value: 10
                    }
                }
            }
        ];

        const result = ModifierPipeline.resolve(
            TRIGGERS.ON_QUEST_COMPLETED,
            { genre: 'Non-Fiction', pageCount: 300 },
            effects,
            base
        );
        expect(result.inkDrops).toBe(10);
    });

    test('records modifier entries in receipt', () => {
        const base = new Reward({ xp: 10 });
        const effects = [
            {
                source: { name: 'Source One' },
                effect: {
                    trigger: TRIGGERS.ON_QUEST_COMPLETED,
                    modifier: {
                        type: MODIFIER_TYPES.ADD_FLAT,
                        resource: 'xp',
                        value: 2
                    }
                }
            }
        ];

        const result = ModifierPipeline.resolve(TRIGGERS.ON_QUEST_COMPLETED, {}, effects, base);
        expect(result.receipt.modifiers.length).toBe(1);
        expect(result.receipt.modifiers[0].source).toBe('Source One');
        expect(result.receipt.final.xp).toBe(12);
    });
});

describe('EffectRegistry.getActiveEffects', () => {
    test('gathers active effects for trigger across all sources', () => {
        const mockStateAdapter = {
            state: {
                [STORAGE_KEYS.LEARNED_ABILITIES]: ['Silver Tongue'],
                [STORAGE_KEYS.EQUIPPED_ITEMS]: [{ name: 'Celestial Koi Fish' }],
                [STORAGE_KEYS.TEMPORARY_BUFFS]: [{ name: 'Questing Elixir', status: 'active' }]
            },
            formData: {
                keeperBackground: 'biblioslinker',
                wizardSchool: 'Enchantment'
            }
        };

        const mockDataModule = {
            keeperBackgrounds: {
                biblioslinker: {
                    name: 'The Biblioslinker',
                    effects: [
                        {
                            trigger: TRIGGERS.ON_QUEST_COMPLETED,
                            modifier: {
                                type: MODIFIER_TYPES.ADD_FLAT,
                                resource: 'paperScraps',
                                value: 10
                            }
                        }
                    ]
                }
            },
            schoolBenefits: {
                Enchantment: {
                    effects: [
                        {
                            trigger: TRIGGERS.ON_QUEST_COMPLETED,
                            modifier: {
                                type: MODIFIER_TYPES.MULTIPLY,
                                resource: 'xp',
                                value: 1.5
                            }
                        }
                    ]
                }
            },
            masteryAbilities: {
                'Silver Tongue': {
                    effects: [
                        {
                            trigger: TRIGGERS.ON_QUEST_COMPLETED,
                            modifier: {
                                type: MODIFIER_TYPES.ADD_FLAT,
                                resource: 'paperScraps',
                                value: 5
                            }
                        }
                    ]
                }
            },
            allItems: {
                'Celestial Koi Fish': {
                    effects: [
                        {
                            trigger: TRIGGERS.ON_QUEST_COMPLETED,
                            modifier: {
                                type: MODIFIER_TYPES.ADD_FLAT,
                                resource: 'xp',
                                value: 10
                            }
                        }
                    ]
                }
            },
            temporaryBuffs: {
                'Questing Elixir': {
                    effects: [
                        {
                            trigger: TRIGGERS.ON_QUEST_COMPLETED,
                            modifier: {
                                type: MODIFIER_TYPES.ADD_FLAT,
                                resource: 'inkDrops',
                                value: 3
                            }
                        }
                    ]
                }
            }
        };

        const activeEffects = EffectRegistry.getActiveEffects(
            TRIGGERS.ON_QUEST_COMPLETED,
            mockStateAdapter,
            mockDataModule
        );

        expect(activeEffects.length).toBe(5);
        const sourceTypes = activeEffects.map(entry => entry.source.sourceType);
        expect(sourceTypes).toContain('background');
        expect(sourceTypes).toContain('school');
        expect(sourceTypes).toContain('ability');
        expect(sourceTypes).toContain('item');
        expect(sourceTypes).toContain('temporary_buff');
    });
});
