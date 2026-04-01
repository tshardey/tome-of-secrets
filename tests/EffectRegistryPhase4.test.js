/**
 * @jest-environment jsdom
 */
import { EffectRegistry } from '../assets/js/services/EffectRegistry.js';

describe('EffectRegistry Phase 4 helpers', () => {
    const dataModule = {
        keeperBackgrounds: {
            groveTender: {
                effects: [
                    {
                        trigger: 'ON_MONTH_START',
                        modifier: {
                            type: 'ACTIVATE',
                            action: 'force_atmospheric_buff',
                            buffName: 'The Soaking in Nature'
                        }
                    }
                ]
            }
        },
        schoolBenefits: {},
        sanctumBenefits: {
            'The Spire of Whispers': {
                id: 'the-spire-of-whispers',
                effects: [
                    {
                        trigger: 'ON_MONTH_END',
                        condition: { hasAtmosphericBuff: 'The Candlight Study' },
                        modifier: { type: 'MULTIPLY', resource: 'inkDrops', value: 2 }
                    },
                    {
                        trigger: 'ON_MONTH_END',
                        condition: { hasAtmosphericBuff: 'The Cozy Hearth' },
                        modifier: { type: 'MULTIPLY', resource: 'inkDrops', value: 2 }
                    }
                ],
                associatedBuffs: ['The Candlight Study', 'The Cozy Hearth']
            },
            legacyOnly: {
                id: 'legacy-only',
                associatedBuffs: ['Head in the Clouds']
            }
        },
        atmosphericBuffs: {
            'The Candlight Study': { id: 'the-candlight-study', name: 'The Candlight Study' },
            'The Cozy Hearth': { id: 'the-cozy-hearth', name: 'The Cozy Hearth' },
            'Head in the Clouds': { id: 'head-in-the-clouds', name: 'Head in the Clouds' }
        },
        masteryAbilities: {},
        allItems: {},
        temporaryBuffs: {},
        temporaryBuffsFromRewards: {}
    };

    test('getForcedAtmosphericBuffNames reads ON_MONTH_START force_atmospheric_buff', () => {
        const ctx = {
            state: {},
            formData: { keeperBackground: 'groveTender', wizardSchool: '' }
        };
        expect(EffectRegistry.getForcedAtmosphericBuffNames(ctx, dataModule)).toEqual([
            'The Soaking in Nature'
        ]);
    });

    test('getSanctumAssociatedBuffIds reads structured sanctum effects', () => {
        expect(EffectRegistry.getSanctumAssociatedBuffIds('the-spire-of-whispers', dataModule)).toEqual([
            'the-candlight-study',
            'the-cozy-hearth'
        ]);
    });

    test('getSanctumAssociatedBuffIds falls back to legacy associatedBuffs', () => {
        expect(EffectRegistry.getSanctumAssociatedBuffIds('legacy-only', dataModule)).toEqual([
            'head-in-the-clouds'
        ]);
    });
});
