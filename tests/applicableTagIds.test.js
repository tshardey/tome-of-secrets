import { getApplicableTagIds } from '../assets/js/utils/applicableTagIds.js';
import { STORAGE_KEYS } from '../assets/js/character-sheet/storageKeys.js';

describe('getApplicableTagIds', () => {
    test('returns tag IDs from equipped item tagMatch conditions', () => {
        const stateAdapter = {
            state: {
                [STORAGE_KEYS.EQUIPPED_ITEMS]: ['Cloak of the Story-Weaver'],
                [STORAGE_KEYS.PASSIVE_ITEM_SLOTS]: [],
                [STORAGE_KEYS.PASSIVE_FAMILIAR_SLOTS]: [],
                [STORAGE_KEYS.TEMPORARY_BUFFS]: [],
                [STORAGE_KEYS.LEARNED_ABILITIES]: []
            }
        };
        const dataModule = {
            allItems: {
                'Cloak of the Story-Weaver': {
                    id: 'cloak-of-the-story-weaver',
                    name: 'Cloak of the Story-Weaver',
                    effects: [
                        {
                            trigger: 'ON_QUEST_COMPLETED',
                            condition: { tagMatch: [['series']] },
                            modifier: { type: 'ADD_FLAT', resource: 'inkDrops', value: 10 },
                            slot: 'equipped'
                        }
                    ]
                }
            },
            keeperBackgrounds: {},
            schoolBenefits: {},
            masteryAbilities: {},
            temporaryBuffsFromRewards: {},
            temporaryBuffs: {}
        };

        const result = getApplicableTagIds(stateAdapter, dataModule);
        expect(result).toBeInstanceOf(Set);
        expect(result.has('series')).toBe(true);
    });

    test('returns tag IDs from background tagMatch conditions', () => {
        const stateAdapter = {
            state: {
                keeperBackground: 'archivist',
                [STORAGE_KEYS.EQUIPPED_ITEMS]: [],
                [STORAGE_KEYS.PASSIVE_ITEM_SLOTS]: [],
                [STORAGE_KEYS.PASSIVE_FAMILIAR_SLOTS]: [],
                [STORAGE_KEYS.TEMPORARY_BUFFS]: [],
                [STORAGE_KEYS.LEARNED_ABILITIES]: []
            }
        };
        const dataModule = {
            allItems: {},
            keeperBackgrounds: {
                archivist: {
                    name: 'The Archivist\'s Apprentice',
                    effects: [
                        {
                            trigger: 'ON_QUEST_COMPLETED',
                            condition: { tagMatch: [['non-fiction'], ['historical-fiction']] },
                            modifier: { type: 'ADD_FLAT', resource: 'inkDrops', value: 10 }
                        }
                    ]
                }
            },
            schoolBenefits: {},
            masteryAbilities: {},
            temporaryBuffsFromRewards: {},
            temporaryBuffs: {}
        };

        const result = getApplicableTagIds(stateAdapter, dataModule);
        expect(result.has('non-fiction')).toBe(true);
        expect(result.has('historical-fiction')).toBe(true);
    });

    test('returns tag IDs from hasTag conditions', () => {
        const stateAdapter = {
            state: {
                [STORAGE_KEYS.EQUIPPED_ITEMS]: ['Test Item'],
                [STORAGE_KEYS.PASSIVE_ITEM_SLOTS]: [],
                [STORAGE_KEYS.PASSIVE_FAMILIAR_SLOTS]: [],
                [STORAGE_KEYS.TEMPORARY_BUFFS]: [],
                [STORAGE_KEYS.LEARNED_ABILITIES]: []
            }
        };
        const dataModule = {
            allItems: {
                'Test Item': {
                    id: 'test-item',
                    name: 'Test Item',
                    effects: [
                        {
                            trigger: 'ON_QUEST_COMPLETED',
                            condition: { hasTag: ['dragons', 'fae'] },
                            modifier: { type: 'ADD_FLAT', resource: 'inkDrops', value: 5 },
                            slot: 'equipped'
                        }
                    ]
                }
            },
            keeperBackgrounds: {},
            schoolBenefits: {},
            masteryAbilities: {},
            temporaryBuffsFromRewards: {},
            temporaryBuffs: {}
        };

        const result = getApplicableTagIds(stateAdapter, dataModule);
        expect(result.has('dragons')).toBe(true);
        expect(result.has('fae')).toBe(true);
    });

    test('returns empty set when no tag conditions exist', () => {
        const stateAdapter = {
            state: {
                [STORAGE_KEYS.EQUIPPED_ITEMS]: ['Scatter Brain Scarab'],
                [STORAGE_KEYS.PASSIVE_ITEM_SLOTS]: [],
                [STORAGE_KEYS.PASSIVE_FAMILIAR_SLOTS]: [],
                [STORAGE_KEYS.TEMPORARY_BUFFS]: [],
                [STORAGE_KEYS.LEARNED_ABILITIES]: []
            }
        };
        const dataModule = {
            allItems: {
                'Scatter Brain Scarab': {
                    id: 'scatter-brain-scarab',
                    name: 'Scatter Brain Scarab',
                    effects: []
                }
            },
            keeperBackgrounds: {},
            schoolBenefits: {},
            masteryAbilities: {},
            temporaryBuffsFromRewards: {},
            temporaryBuffs: {}
        };

        const result = getApplicableTagIds(stateAdapter, dataModule);
        expect(result.size).toBe(0);
    });

    test('deduplicates tags across multiple sources', () => {
        const stateAdapter = {
            state: {
                keeperBackground: 'prophet',
                [STORAGE_KEYS.EQUIPPED_ITEMS]: ['Test Item'],
                [STORAGE_KEYS.PASSIVE_ITEM_SLOTS]: [],
                [STORAGE_KEYS.PASSIVE_FAMILIAR_SLOTS]: [],
                [STORAGE_KEYS.TEMPORARY_BUFFS]: [],
                [STORAGE_KEYS.LEARNED_ABILITIES]: []
            }
        };
        const dataModule = {
            allItems: {
                'Test Item': {
                    id: 'test-item',
                    name: 'Test Item',
                    effects: [
                        {
                            trigger: 'ON_QUEST_COMPLETED',
                            condition: { tagMatch: [['philosophical']] },
                            modifier: { type: 'ADD_FLAT', resource: 'inkDrops', value: 5 },
                            slot: 'equipped'
                        }
                    ]
                }
            },
            keeperBackgrounds: {
                prophet: {
                    name: 'The Cloistered Prophet',
                    effects: [
                        {
                            trigger: 'ON_QUEST_COMPLETED',
                            condition: { tagMatch: [['philosophical'], ['mythology'], ['celestial']] },
                            modifier: { type: 'ADD_FLAT', resource: 'inkDrops', value: 15 }
                        }
                    ]
                }
            },
            schoolBenefits: {},
            masteryAbilities: {},
            temporaryBuffsFromRewards: {},
            temporaryBuffs: {}
        };

        const result = getApplicableTagIds(stateAdapter, dataModule);
        expect(result.has('philosophical')).toBe(true);
        expect(result.has('mythology')).toBe(true);
        expect(result.has('celestial')).toBe(true);
        expect(result.size).toBe(3);
    });
});
