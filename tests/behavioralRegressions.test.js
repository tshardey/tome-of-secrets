/**
 * @jest-environment jsdom
 *
 * Behavioral regression baselines for named entities flagged in TCG audit notes.
 * These tests intentionally lock current behavior, including known text-only gaps.
 */

import {
    applyDungeonCompletionReward,
    getDungeonCompletionRewardByRoll
} from '../assets/js/services/DungeonRewardService.js';
import {
    getSeriesExpedition,
    applyTypedReward
} from '../assets/js/services/SeriesCompletionService.js';
import { buildQuestDrawHelperList } from '../assets/js/character-sheet/questDrawHelperDiscovery.js';
import { RewardCalculator } from '../assets/js/services/RewardCalculator.js';
import { StateAdapter } from '../assets/js/character-sheet/stateAdapter.js';
import { STORAGE_KEYS, createEmptyCharacterState } from '../assets/js/character-sheet/storageKeys.js';
import * as data from '../assets/js/character-sheet/data.js';

const DUNGEON_ROLLS_WITH_TMP_BUFF = new Map([
    [1, { name: "The Librarian's Hoard", duration: 'one-time' }],
    [3, { name: "Librarian's Blessing", duration: 'one-time' }],
    [5, { name: 'Enchanted Focus', duration: 'one-time' }],
    [7, { name: 'Unwavering Resolve', duration: 'until-end-month', monthsRemaining: 1 }],
    [9, { name: "The Archivist's Favor", duration: 'one-time' }]
]);

const DUNGEON_ROLLS_WITH_CURRENCY = new Map([
    [15, { xp: 200 }]
]);

describe('Behavioral regressions - named game entities', () => {
    describe('Dungeon completion rewards (all 20 roll outcomes)', () => {
        for (let roll = 1; roll <= 20; roll += 1) {
            const reward = getDungeonCompletionRewardByRoll(roll);
            const label = `roll ${roll}: ${reward?.name || 'unknown reward'}`;

            if (reward?.hasLink) {
                test(`${label} grants linked item when not owned`, () => {
                    const addInventoryItem = jest.fn();
                    const stateAdapter = {
                        getOwnedItemNames: () => new Set(),
                        addInventoryItem,
                        addTemporaryBuff: jest.fn(),
                        addDustyBlueprints: jest.fn()
                    };
                    const updateCurrency = jest.fn();

                    const result = applyDungeonCompletionReward(roll, { stateAdapter, updateCurrency });
                    expect(result.applied).toBe(true);
                    expect(addInventoryItem).toHaveBeenCalledTimes(1);
                    expect(addInventoryItem).toHaveBeenCalledWith(
                        expect.objectContaining({ name: reward.link.text })
                    );
                    expect(updateCurrency).not.toHaveBeenCalled();
                });
            } else if (DUNGEON_ROLLS_WITH_TMP_BUFF.has(roll)) {
                test(`${label} adds temporary buff state`, () => {
                    const addTemporaryBuff = jest.fn();
                    const stateAdapter = {
                        getOwnedItemNames: () => new Set(),
                        addInventoryItem: jest.fn(),
                        addTemporaryBuff,
                        addDustyBlueprints: jest.fn()
                    };
                    const updateCurrency = jest.fn();

                    const result = applyDungeonCompletionReward(roll, { stateAdapter, updateCurrency });
                    const expected = DUNGEON_ROLLS_WITH_TMP_BUFF.get(roll);

                    expect(result.applied).toBe(true);
                    expect(addTemporaryBuff).toHaveBeenCalledWith(
                        expect.objectContaining({
                            name: expected.name,
                            duration: expected.duration,
                            status: 'active',
                            monthsRemaining: expected.monthsRemaining || 0
                        })
                    );
                    expect(updateCurrency).not.toHaveBeenCalled();
                });
            } else if (DUNGEON_ROLLS_WITH_CURRENCY.has(roll)) {
                test(`${label} applies direct currency change`, () => {
                    const stateAdapter = {
                        getOwnedItemNames: () => new Set(),
                        addInventoryItem: jest.fn(),
                        addTemporaryBuff: jest.fn(),
                        addDustyBlueprints: jest.fn()
                    };
                    const updateCurrency = jest.fn();

                    const result = applyDungeonCompletionReward(roll, { stateAdapter, updateCurrency });
                    const expected = DUNGEON_ROLLS_WITH_CURRENCY.get(roll);

                    expect(result.applied).toBe(true);
                    expect(updateCurrency).toHaveBeenCalledWith(expect.objectContaining(expected));
                });
            } else {
                test.skip(
                    `${label} is currently text-only (no concrete state mutation wired)`,
                    () => {}
                );
            }
        }
    });

    describe('Series completion stops 2, 5, 7, 10', () => {
        const getStopByOrder = (order) => getSeriesExpedition().stops.find((s) => s.order === order);

        test('stop 2 is a passive-rule-modifier (no direct state mutation)', () => {
            const stop2 = getStopByOrder(2);
            const updateCurrency = jest.fn();
            const result = applyTypedReward(stop2.reward, {
                stateAdapter: { addPassiveItemSlot: jest.fn(), addPassiveFamiliarSlot: jest.fn() },
                updateCurrency
            });

            expect(stop2.reward.type).toBe('passive-rule-modifier');
            expect(result.applied).toBe(true);
            expect(updateCurrency).not.toHaveBeenCalled();
        });

        test('stop 5 is a passive-rule-modifier (no direct state mutation)', () => {
            const stop5 = getStopByOrder(5);
            const updateCurrency = jest.fn();
            const result = applyTypedReward(stop5.reward, {
                stateAdapter: { addPassiveItemSlot: jest.fn(), addPassiveFamiliarSlot: jest.fn() },
                updateCurrency
            });

            expect(stop5.reward.type).toBe('passive-rule-modifier');
            expect(result.applied).toBe(true);
            expect(updateCurrency).not.toHaveBeenCalled();
        });

        test('stop 7 is a passive-rule-modifier (no direct state mutation)', () => {
            const stop7 = getStopByOrder(7);
            const updateCurrency = jest.fn();
            const result = applyTypedReward(stop7.reward, {
                stateAdapter: { addPassiveItemSlot: jest.fn(), addPassiveFamiliarSlot: jest.fn() },
                updateCurrency
            });

            expect(stop7.reward.type).toBe('passive-rule-modifier');
            expect(result.applied).toBe(true);
            expect(updateCurrency).not.toHaveBeenCalled();
        });

        test('stop 10 grants familiar slot; +10 dungeon XP text is not auto-applied here', () => {
            const stop10 = getStopByOrder(10);
            const addPassiveFamiliarSlot = jest.fn();
            const updateCurrency = jest.fn();

            const result = applyTypedReward(stop10.reward, {
                stateAdapter: { addPassiveFamiliarSlot },
                updateCurrency
            });

            expect(stop10.reward.type).toBe('familiar-slot-bonus');
            expect(result.applied).toBe(true);
            expect(addPassiveFamiliarSlot).toHaveBeenCalledWith('expedition-adoption-slot', 'series-expedition');
            expect(updateCurrency).not.toHaveBeenCalled();
        });
    });

    describe('Temporary buff behavior baselines', () => {
        test('Unwavering Resolve expires at end of month while one-time buffs remain', () => {
            const state = createEmptyCharacterState();
            state[STORAGE_KEYS.TEMPORARY_BUFFS] = [
                { name: 'Unwavering Resolve', duration: 'until-end-month', monthsRemaining: 1, status: 'active' },
                { name: 'Enchanted Focus', duration: 'one-time', status: 'active' }
            ];
            const adapter = new StateAdapter(state);

            const changed = adapter.expireTemporaryBuffsAtEndOfMonth();
            const namesAfter = adapter.getTemporaryBuffs().map((b) => b.name);

            expect(changed).toBe(true);
            expect(namesAfter).not.toContain('Unwavering Resolve');
            expect(namesAfter).toContain('Enchanted Focus');
        });

        test.skip(
            "The Archivist's Favor choice handling (reroll / +100 XP / 50% off) is not yet encoded in state",
            () => {}
        );

        test('Enchanted Focus usesLeft decrements on book complete and removes after 3 books', () => {
            const state = createEmptyCharacterState();
            state[STORAGE_KEYS.TEMPORARY_BUFFS] = [
                { name: 'Enchanted Focus', duration: 'one-time', status: 'active', usesLeft: 3 }
            ];
            const adapter = new StateAdapter(state);

            adapter.decrementUseCountBuffsOnBookComplete();
            expect(adapter.getTemporaryBuffs()[0].usesLeft).toBe(2);

            adapter.decrementUseCountBuffsOnBookComplete();
            expect(adapter.getTemporaryBuffs()[0].usesLeft).toBe(1);

            const { expired } = adapter.decrementUseCountBuffsOnBookComplete();
            expect(adapter.getTemporaryBuffs()).toHaveLength(0);
            expect(expired).toContain('Enchanted Focus');
        });
    });

    describe('Permanent bonuses enforcement vs display-only', () => {
        test('Level 9 Insightful Draw appears as an always-on quest-draw helper', () => {
            const helpers = buildQuestDrawHelperList(
                createEmptyCharacterState(),
                {
                    allItems: data.allItems || {},
                    temporaryBuffs: { ...(data.temporaryBuffsFromRewards || {}), ...(data.temporaryBuffs || {}) },
                    masteryAbilities: data.masteryAbilities || {},
                    schoolBenefits: data.schoolBenefits || {},
                    seriesExpedition: data.seriesCompletionRewards || {},
                    permanentBonuses: data.permanentBonuses || {}
                },
                { school: '', level: 9 }
            );

            const insightful = helpers.find((h) => (
                h.sourceType === 'permanentBonus' &&
                (h.effectPlain || h.effect || '').includes('draw one extra quest card')
            ));
            expect(insightful).toBeDefined();
            expect(insightful.cadence).toBe('always');
        });

        test('Level 6 Novice Focus text does not currently alter base book completion XP in RewardCalculator', () => {
            const rewards = RewardCalculator.calculateBookCompletionRewards(1);
            expect(rewards.xp).toBe(15);
        });

        test.skip(
            'Level 7 Focused Atmosphere (+1 to atmospheric bonuses) is currently display-text only in reward flow',
            () => {}
        );
    });
});
