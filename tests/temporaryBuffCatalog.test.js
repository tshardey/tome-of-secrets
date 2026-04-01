/**
 * @jest-environment jsdom
 */

import { EffectRegistry } from '../assets/js/services/EffectRegistry.js';
import { ModifierPipeline } from '../assets/js/services/ModifierPipeline.js';
import { Reward, RewardCalculator } from '../assets/js/services/RewardCalculator.js';
import { TRIGGERS } from '../assets/js/services/effectSchema.js';
import { EndOfMonthController } from '../assets/js/controllers/EndOfMonthController.js';
import { StateAdapter } from '../assets/js/character-sheet/stateAdapter.js';
import { STORAGE_KEYS, createEmptyCharacterState } from '../assets/js/character-sheet/storageKeys.js';
import * as data from '../assets/js/character-sheet/data.js';

describe('Temporary buff catalog behavior', () => {
    test('overlapping temporary buff definitions remain identical across both catalogs', () => {
        const primary = data.temporaryBuffs || {};
        const legacy = data.temporaryBuffsFromRewards || {};
        const overlappingNames = Object.keys(primary).filter((name) => legacy[name] != null);

        expect(overlappingNames.length).toBeGreaterThan(0);
        overlappingNames.forEach((name) => {
            expect(primary[name]).toEqual(legacy[name]);
        });
    });

    test('EffectRegistry merge precedence prefers temporaryBuffs over temporaryBuffsFromRewards', () => {
        const state = createEmptyCharacterState();
        state[STORAGE_KEYS.TEMPORARY_BUFFS] = [{ name: 'Collision Buff', status: 'active' }];
        const dataModule = {
            keeperBackgrounds: {},
            schoolBenefits: {},
            masteryAbilities: {},
            allItems: {},
            temporaryBuffsFromRewards: {
                'Collision Buff': {
                    id: 'collision-buff',
                    name: 'Collision Buff',
                    effects: [
                        {
                            trigger: TRIGGERS.ON_QUEST_COMPLETED,
                            modifier: { type: 'ADD_FLAT', resource: 'xp', value: 1 }
                        }
                    ]
                }
            },
            temporaryBuffs: {
                'Collision Buff': {
                    id: 'collision-buff',
                    name: 'Collision Buff',
                    effects: [
                        {
                            trigger: TRIGGERS.ON_QUEST_COMPLETED,
                            modifier: { type: 'ADD_FLAT', resource: 'xp', value: 7 }
                        }
                    ]
                }
            }
        };

        const active = EffectRegistry.getActiveEffects(
            TRIGGERS.ON_QUEST_COMPLETED,
            { state, formData: {} },
            dataModule
        );
        const resolved = ModifierPipeline.resolve(
            TRIGGERS.ON_QUEST_COMPLETED,
            {},
            active,
            new Reward({ xp: 0 })
        );
        expect(resolved.xp).toBe(7);
    });

    test('Long Read Focus runtime remains flat +10 Ink Drops', () => {
        const modifier = RewardCalculator._getModifier('Long Read Focus', false, false).modifier;
        expect(modifier).toEqual(expect.objectContaining({ inkDrops: 10 }));
    });
});

describe('Temporary buff end-of-month lifecycle', () => {
    test('End of Month expires until-end-month temporary buffs', () => {
        document.body.innerHTML = `
            <form id="character-sheet">
                <select id="librarySanctum"></select>
                <select id="keeperBackground"></select>
                <select id="wizardSchool"></select>
                <input id="books-completed-month" value="0" />
                <input id="journal-entries-completed" value="0" />
                <input id="wearable-slots" value="0" />
                <input id="non-wearable-slots" value="0" />
                <input id="familiar-slots" value="0" />
                <button type="button" class="end-of-month-button">End Month</button>
            </form>
        `;

        const state = createEmptyCharacterState();
        state[STORAGE_KEYS.TEMPORARY_BUFFS] = [
            {
                name: 'Unwavering Resolve',
                description: 'For the next month, you are immune to Worn Page penalties.',
                duration: 'until-end-month',
                monthsRemaining: 1,
                status: 'active'
            }
        ];
        const stateAdapter = new StateAdapter(state);
        jest.spyOn(stateAdapter, 'getCurseHelpers').mockReturnValue([]);
        jest.spyOn(stateAdapter, 'refreshCurseHelpersAtEndOfMonth').mockReturnValue(false);
        jest.spyOn(stateAdapter, 'removeUsedOneTimeWornPageTempBuffsAtEOM').mockReturnValue(false);
        jest.spyOn(stateAdapter, 'getQuestDrawHelpers').mockReturnValue([]);
        jest.spyOn(stateAdapter, 'refreshQuestDrawHelpersAtEndOfMonth').mockReturnValue(false);
        jest.spyOn(stateAdapter, 'removeUsedOneTimeQuestDrawTempBuffsAtEOM').mockReturnValue(false);

        const dependencies = {
            ui: {
                renderAtmosphericBuffs: jest.fn(),
                renderTemporaryBuffs: jest.fn(),
                updateQuestBuffsDropdown: jest.fn(),
                renderWornPageHelpers: jest.fn(),
                renderQuestDrawHelpers: jest.fn(),
                renderActivatedAbilities: jest.fn(),
                renderShelfBooks: jest.fn()
            },
            saveState: jest.fn()
        };

        const controller = new EndOfMonthController(
            stateAdapter,
            document.getElementById('character-sheet'),
            dependencies
        );
        controller.initialize(new Set(), jest.fn(), jest.fn());

        const confirmSpy = jest.spyOn(window, 'confirm').mockReturnValue(false);
        document.querySelector('.end-of-month-button').click();

        const buffsAfter = stateAdapter.getTemporaryBuffs();
        expect(buffsAfter).toHaveLength(0);
        expect(dependencies.ui.renderTemporaryBuffs).toHaveBeenCalled();

        confirmSpy.mockRestore();
        document.body.innerHTML = '';
    });
});
