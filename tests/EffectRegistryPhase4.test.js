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
});
