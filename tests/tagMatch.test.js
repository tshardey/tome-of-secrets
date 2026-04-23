import { ModifierPipeline } from '../assets/js/services/ModifierPipeline.js';
import { EffectRegistry } from '../assets/js/services/EffectRegistry.js';
import { TRIGGERS, MODIFIER_TYPES } from '../assets/js/services/effectSchema.js';
import { STORAGE_KEYS } from '../assets/js/character-sheet/storageKeys.js';

describe('tagMatch condition evaluation', () => {
    test('matches a single-tag group', () => {
        const condition = { tagMatch: [['romance']] };
        const payload = { tags: ['romance', 'fantasy'] };
        expect(ModifierPipeline.evaluateCondition(condition, payload)).toBe(true);
    });

    test('rejects when tag is missing', () => {
        const condition = { tagMatch: [['romance']] };
        const payload = { tags: ['fantasy', 'mystery'] };
        expect(ModifierPipeline.evaluateCondition(condition, payload)).toBe(false);
    });

    test('matches AND within a group (all tags required)', () => {
        const condition = { tagMatch: [['contemporary-fiction', 'social']] };
        const payload = { tags: ['contemporary-fiction', 'social', 'drama'] };
        expect(ModifierPipeline.evaluateCondition(condition, payload)).toBe(true);
    });

    test('rejects AND group when one tag is missing', () => {
        const condition = { tagMatch: [['contemporary-fiction', 'social']] };
        const payload = { tags: ['contemporary-fiction', 'drama'] };
        expect(ModifierPipeline.evaluateCondition(condition, payload)).toBe(false);
    });

    test('matches OR across groups (any group sufficient)', () => {
        const condition = { tagMatch: [['romance'], ['contemporary-fiction', 'social']] };
        const payload = { tags: ['romance'] };
        expect(ModifierPipeline.evaluateCondition(condition, payload)).toBe(true);
    });

    test('matches second OR group when first fails', () => {
        const condition = { tagMatch: [['romance'], ['contemporary-fiction', 'social']] };
        const payload = { tags: ['contemporary-fiction', 'social'] };
        expect(ModifierPipeline.evaluateCondition(condition, payload)).toBe(true);
    });

    test('rejects when no OR group matches', () => {
        const condition = { tagMatch: [['romance'], ['contemporary-fiction', 'social']] };
        const payload = { tags: ['fantasy', 'adventure'] };
        expect(ModifierPipeline.evaluateCondition(condition, payload)).toBe(false);
    });

    test('treats empty tags array as no match', () => {
        const condition = { tagMatch: [['romance']] };
        const payload = { tags: [] };
        expect(ModifierPipeline.evaluateCondition(condition, payload)).toBe(false);
    });

    test('treats missing tags as no match', () => {
        const condition = { tagMatch: [['romance']] };
        const payload = {};
        expect(ModifierPipeline.evaluateCondition(condition, payload)).toBe(false);
    });

    test('works alongside other conditions (tagMatch + pageCount)', () => {
        const condition = { tagMatch: [['romance']], pageCount: { min: 200 } };
        const payload = { tags: ['romance'], pageCount: 300 };
        expect(ModifierPipeline.evaluateCondition(condition, payload)).toBe(true);
    });

    test('rejects when tagMatch passes but pageCount fails', () => {
        const condition = { tagMatch: [['romance']], pageCount: { min: 200 } };
        const payload = { tags: ['romance'], pageCount: 100 };
        expect(ModifierPipeline.evaluateCondition(condition, payload)).toBe(false);
    });
});

describe('slot-aware effect filtering', () => {
    const TEST_ITEM_ID = 'slot-test-item';

    const mockDataModule = {
        allItems: {
            [TEST_ITEM_ID]: {
                id: TEST_ITEM_ID,
                name: 'Slot Test Item',
                effects: [
                    {
                        trigger: TRIGGERS.ON_BOOK_COMPLETED,
                        slot: 'equipped',
                        modifier: {
                            type: MODIFIER_TYPES.ADD_FLAT,
                            resource: 'xp',
                            value: 20
                        }
                    },
                    {
                        trigger: TRIGGERS.ON_BOOK_COMPLETED,
                        slot: 'passive',
                        modifier: {
                            type: MODIFIER_TYPES.ADD_FLAT,
                            resource: 'xp',
                            value: 10
                        }
                    }
                ]
            }
        }
    };

    test('returns only equipped-slot effects for equipped items', () => {
        const state = {
            [STORAGE_KEYS.EQUIPPED_ITEMS]: [TEST_ITEM_ID],
            [STORAGE_KEYS.PASSIVE_ITEM_SLOTS]: [],
            [STORAGE_KEYS.PASSIVE_FAMILIAR_SLOTS]: []
        };
        const effects = EffectRegistry.getActiveEffects(TRIGGERS.ON_BOOK_COMPLETED, state, mockDataModule);
        expect(effects).toHaveLength(1);
        expect(effects[0].effect.modifier.value).toBe(20);
        expect(effects[0].effect.slot).toBe('equipped');
    });

    test('returns only passive-slot effects for passive items', () => {
        const state = {
            [STORAGE_KEYS.EQUIPPED_ITEMS]: [],
            [STORAGE_KEYS.PASSIVE_ITEM_SLOTS]: [{ itemName: TEST_ITEM_ID }],
            [STORAGE_KEYS.PASSIVE_FAMILIAR_SLOTS]: []
        };
        const effects = EffectRegistry.getActiveEffects(TRIGGERS.ON_BOOK_COMPLETED, state, mockDataModule);
        expect(effects).toHaveLength(1);
        expect(effects[0].effect.modifier.value).toBe(10);
        expect(effects[0].effect.slot).toBe('passive');
    });

    test('returns effects with no slot field regardless of item position', () => {
        const noSlotDataModule = {
            allItems: {
                'no-slot-item': {
                    id: 'no-slot-item',
                    name: 'No Slot Item',
                    effects: [
                        {
                            trigger: TRIGGERS.ON_BOOK_COMPLETED,
                            modifier: {
                                type: MODIFIER_TYPES.ADD_FLAT,
                                resource: 'xp',
                                value: 5
                            }
                        }
                    ]
                }
            }
        };

        const equippedState = {
            [STORAGE_KEYS.EQUIPPED_ITEMS]: ['no-slot-item'],
            [STORAGE_KEYS.PASSIVE_ITEM_SLOTS]: [],
            [STORAGE_KEYS.PASSIVE_FAMILIAR_SLOTS]: []
        };
        const equippedEffects = EffectRegistry.getActiveEffects(TRIGGERS.ON_BOOK_COMPLETED, equippedState, noSlotDataModule);
        expect(equippedEffects).toHaveLength(1);
        expect(equippedEffects[0].effect.modifier.value).toBe(5);

        const passiveState = {
            [STORAGE_KEYS.EQUIPPED_ITEMS]: [],
            [STORAGE_KEYS.PASSIVE_ITEM_SLOTS]: [{ itemName: 'no-slot-item' }],
            [STORAGE_KEYS.PASSIVE_FAMILIAR_SLOTS]: []
        };
        const passiveEffects = EffectRegistry.getActiveEffects(TRIGGERS.ON_BOOK_COMPLETED, passiveState, noSlotDataModule);
        expect(passiveEffects).toHaveLength(1);
        expect(passiveEffects[0].effect.modifier.value).toBe(5);
    });
});
