import { Reward } from '../assets/js/services/RewardCalculator.js';
import { ModifierPipeline } from '../assets/js/services/ModifierPipeline.js';
import { EffectRegistry } from '../assets/js/services/EffectRegistry.js';
import { TRIGGERS, MODIFIER_TYPES, validateEffect } from '../assets/js/services/effectSchema.js';
import { STORAGE_KEYS } from '../assets/js/character-sheet/storageKeys.js';
import { tryPreventWornPage } from '../assets/js/services/WornPagePrevention.js';

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

    test('applies GRANT_RESOURCE like an additive currency grant', () => {
        const base = new Reward({ inkDrops: 3 });
        const effects = [
            {
                source: { name: 'Cartographer' },
                effect: {
                    trigger: TRIGGERS.ON_QUEST_DRAFTED,
                    condition: { questType: 'dungeon_crawl' },
                    modifier: {
                        type: MODIFIER_TYPES.GRANT_RESOURCE,
                        resource: 'inkDrops',
                        value: 15
                    }
                }
            }
        ];

        const result = ModifierPipeline.resolve(
            TRIGGERS.ON_QUEST_DRAFTED,
            { questType: 'dungeon_crawl' },
            effects,
            base
        );
        expect(result.inkDrops).toBe(18);
        expect(result.receipt.modifiers[0].type).toBe('effect:grant_resource');
        expect(result.modifiedBy).toContain('Cartographer');
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

    test('encounterType:any requires encounter context', () => {
        const base = new Reward({ xp: 10 });
        const effects = [
            {
                source: { name: 'Any Encounter Bonus' },
                effect: {
                    trigger: TRIGGERS.ON_QUEST_COMPLETED,
                    condition: { encounterType: 'any' },
                    modifier: {
                        type: MODIFIER_TYPES.ADD_FLAT,
                        resource: 'xp',
                        value: 5
                    }
                }
            }
        ];

        const noEncounter = ModifierPipeline.resolve(
            TRIGGERS.ON_QUEST_COMPLETED,
            {},
            effects,
            base
        );
        expect(noEncounter.xp).toBe(10);

        const withEncounter = ModifierPipeline.resolve(
            TRIGGERS.ON_QUEST_COMPLETED,
            { encounterType: 'Monster' },
            effects,
            base
        );
        expect(withEncounter.xp).toBe(15);
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

    test('scales ON_JOURNAL_ENTRY ADD_FLAT by entryCount', () => {
        const base = new Reward({ paperScraps: 25 });
        base.receipt.base.paperScraps = 25;
        base.receipt.modifiers.push({
            source: 'End of Month - Journal Entry',
            type: 'system',
            value: 25,
            description: '5 entries × 5 Paper Scraps',
            currency: 'paperScraps'
        });
        const effects = [
            {
                source: { name: "The Scribe's Acolyte" },
                effect: {
                    trigger: TRIGGERS.ON_JOURNAL_ENTRY,
                    modifier: {
                        type: MODIFIER_TYPES.ADD_FLAT,
                        resource: 'paperScraps',
                        value: 3
                    }
                }
            }
        ];
        const result = ModifierPipeline.resolve(
            TRIGGERS.ON_JOURNAL_ENTRY,
            { entryCount: 5 },
            effects,
            base
        );
        expect(result.paperScraps).toBe(40);
        const scribeMod = result.receipt.modifiers.find(m => m.type === 'effect:add_flat');
        expect(scribeMod.value).toBe(15);
        expect(scribeMod.description).toContain('5 × 3');
    });
});

describe('WornPagePrevention.tryPreventWornPage', () => {
    test('consumes school effect cooldown and prevents', () => {
        const state = {
            [STORAGE_KEYS.EFFECT_COOLDOWNS]: {},
            [STORAGE_KEYS.LEARNED_ABILITIES]: [],
            [STORAGE_KEYS.EQUIPPED_ITEMS]: [],
            [STORAGE_KEYS.PASSIVE_ITEM_SLOTS]: [],
            [STORAGE_KEYS.PASSIVE_FAMILIAR_SLOTS]: [],
            [STORAGE_KEYS.TEMPORARY_BUFFS]: []
        };
        const stateAdapter = {
            state,
            formData: { keeperBackground: '', wizardSchool: 'Abjuration' },
            isEffectCooldownAvailable(key, cadence, period) {
                const e = state[STORAGE_KEYS.EFFECT_COOLDOWNS][key];
                if (!e) return true;
                return e.month !== period.month || e.year !== period.year;
            },
            consumeEffectCooldown(key, cadence, period) {
                state[STORAGE_KEYS.EFFECT_COOLDOWNS][key] = {
                    month: period.month,
                    year: period.year
                };
            }
        };
        const dataModule = {
            schoolBenefits: {
                Abjuration: {
                    effects: [
                        {
                            trigger: TRIGGERS.ON_MONTH_END,
                            modifier: { type: MODIFIER_TYPES.PREVENT, target: 'worn_page' },
                            cooldown: 'monthly'
                        }
                    ]
                }
            },
            keeperBackgrounds: {},
            masteryAbilities: {},
            allItems: {}
        };
        const first = tryPreventWornPage({
            stateAdapter,
            dataModule,
            month: 'March',
            year: '2026'
        });
        expect(first.prevented).toBe(true);
        const second = tryPreventWornPage({
            stateAdapter,
            dataModule,
            month: 'March',
            year: '2026'
        });
        expect(second.prevented).toBe(false);
        const third = tryPreventWornPage({
            stateAdapter,
            dataModule,
            month: 'April',
            year: '2026'
        });
        expect(third.prevented).toBe(true);
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

    test('resolves background and school from normalized state when formData is missing', () => {
        const mockStateAdapter = {
            state: {
                keeperBackground: 'biblioslinker',
                wizardSchool: 'Enchantment',
                [STORAGE_KEYS.LEARNED_ABILITIES]: [],
                [STORAGE_KEYS.EQUIPPED_ITEMS]: [],
                [STORAGE_KEYS.TEMPORARY_BUFFS]: []
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
            masteryAbilities: {},
            allItems: {},
            temporaryBuffs: {}
        };

        const activeEffects = EffectRegistry.getActiveEffects(
            TRIGGERS.ON_QUEST_COMPLETED,
            mockStateAdapter,
            mockDataModule
        );
        const sourceTypes = activeEffects.map(entry => entry.source.sourceType);
        expect(sourceTypes).toContain('background');
        expect(sourceTypes).toContain('school');
    });

    test('includes effects from passive item slots without duplicating equipped item', () => {
        const mockStateAdapter = {
            state: {
                [STORAGE_KEYS.EQUIPPED_ITEMS]: [{ name: "Librarian's Compass" }],
                [STORAGE_KEYS.PASSIVE_ITEM_SLOTS]: [{ slotId: 'p1', itemName: "Librarian's Quill" }],
                [STORAGE_KEYS.PASSIVE_FAMILIAR_SLOTS]: [],
                [STORAGE_KEYS.LEARNED_ABILITIES]: [],
                [STORAGE_KEYS.TEMPORARY_BUFFS]: []
            },
            formData: {}
        };
        const mockDataModule = {
            allItems: {
                "Librarian's Compass": {
                    effects: [
                        {
                            trigger: TRIGGERS.ON_JOURNAL_ENTRY,
                            modifier: { type: MODIFIER_TYPES.ADD_FLAT, resource: 'paperScraps', value: 1 }
                        }
                    ]
                },
                "Librarian's Quill": {
                    id: 'librarians-quill',
                    effects: [
                        {
                            trigger: TRIGGERS.ON_JOURNAL_ENTRY,
                            modifier: { type: MODIFIER_TYPES.ADD_FLAT, resource: 'paperScraps', value: 2 }
                        }
                    ]
                }
            },
            keeperBackgrounds: {},
            schoolBenefits: {},
            masteryAbilities: {},
            temporaryBuffs: {}
        };
        const activeEffects = EffectRegistry.getActiveEffects(
            TRIGGERS.ON_JOURNAL_ENTRY,
            mockStateAdapter,
            mockDataModule
        );
        expect(activeEffects.length).toBe(2);
    });
});
