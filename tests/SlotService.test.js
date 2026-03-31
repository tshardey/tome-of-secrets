import { getSlotLimits } from '../assets/js/services/SlotService.js';
import { EffectRegistry } from '../assets/js/services/EffectRegistry.js';
import { STORAGE_KEYS } from '../assets/js/character-sheet/storageKeys.js';

describe('SlotService', () => {
    test('adds one familiar slot for Conjuration on state load', () => {
        const state = {
            [STORAGE_KEYS.LEARNED_ABILITIES]: [],
            [STORAGE_KEYS.EQUIPPED_ITEMS]: [],
            [STORAGE_KEYS.PASSIVE_ITEM_SLOTS]: [],
            [STORAGE_KEYS.PASSIVE_FAMILIAR_SLOTS]: [],
            [STORAGE_KEYS.TEMPORARY_BUFFS]: []
        };

        const limits = getSlotLimits(
            { value: '2' },
            { value: '1' },
            { value: '1' },
            {
                state,
                formData: { wizardSchool: 'Conjuration', keeperBackground: '' }
            }
        );

        expect(limits).toEqual({
            Wearable: 2,
            'Non-Wearable': 1,
            Familiar: 2,
            total: 5
        });
    });

    test('applies UNLOCK_SLOT entries returned by EffectRegistry', () => {
        const getActiveEffectsSpy = jest.spyOn(EffectRegistry, 'getActiveEffects').mockReturnValue([
            {
                source: { sourceType: 'school', name: 'School of Conjuration' },
                effect: { modifier: { type: 'UNLOCK_SLOT', slotType: 'familiar' } }
            },
            {
                source: { sourceType: 'ability', name: 'Echo Chamber' },
                effect: { modifier: { type: 'UNLOCK_SLOT', slotType: 'familiar' } }
            },
            {
                source: { sourceType: 'ability', name: 'Transmutation UI Upgrade' },
                effect: { modifier: { type: 'UNLOCK_SLOT', slotType: 'transmutation_ui' } }
            },
            {
                source: { sourceType: 'item', name: 'Not A Slot Unlock' },
                effect: { modifier: { type: 'ADD_FLAT', resource: 'xp', value: 5 } }
            }
        ]);

        const limits = getSlotLimits(
            { value: '2' },
            { value: '1' },
            { value: '1' },
            {
                state: {},
                formData: { wizardSchool: '', keeperBackground: '' }
            }
        );

        expect(limits).toEqual({
            Wearable: 2,
            'Non-Wearable': 1,
            Familiar: 3,
            total: 6
        });

        getActiveEffectsSpy.mockRestore();
    });
});
