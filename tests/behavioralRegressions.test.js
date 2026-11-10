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
import { RewardCalculator, Reward } from '../assets/js/services/RewardCalculator.js';
import { BaseQuestHandler } from '../assets/js/quest-handlers/BaseQuestHandler.js';
import { QuestController } from '../assets/js/controllers/QuestController.js';
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

        test('stop 5 (Midnight Waystation) pays a flat +$10', () => {
            const stop5 = getStopByOrder(5);
            const updateCurrency = jest.fn();
            const result = applyTypedReward(stop5.reward, {
                stateAdapter: { addPassiveItemSlot: jest.fn(), addPassiveFamiliarSlot: jest.fn() },
                updateCurrency
            });

            expect(stop5.reward.type).toBe('currency');
            expect(result.applied).toBe(true);
            expect(updateCurrency).toHaveBeenCalledWith({ xp: 0, dollars: 10 });
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
    });

    describe('Use-count temporary buffs pay once per completed quest', () => {
        // Completes `count` genre quests that each carry the buff's bonus card, through the same
        // reward path as QuestController (BaseQuestHandler.completeActiveQuest, then
        // QuestController.spendUseCountBuffsForQuest), and returns how many quests the buff paid on.
        function completeQuestsWithBuff(adapter, buffName, count) {
            const controllerLike = { stateAdapter: adapter, dependencies: { ui: {} } };
            let paid = 0;
            const dollars = [];
            for (let i = 0; i < count; i += 1) {
                const quest = {
                    type: '♥ Organize the Stacks',
                    prompt: 'Fantasy',
                    book: `Book ${i}`,
                    month: 'January',
                    year: '2026',
                    buffs: [`[Buff] ${buffName}`],
                    rewards: { xp: 15, dollars: 15, blueprints: 0, items: [], modifiedBy: [] }
                };
                const completed = BaseQuestHandler.completeActiveQuest(quest, '', '', adapter);
                QuestController.prototype.spendUseCountBuffsForQuest.call(controllerLike, completed);
                if (completed.rewards.modifiedBy.includes(buffName)) paid += 1;
                dollars.push(completed.rewards.dollars);
            }
            return { paid, dollars };
        }

        function adapterWithBuff(entry) {
            const state = createEmptyCharacterState();
            state[STORAGE_KEYS.TEMPORARY_BUFFS] = [entry];
            return new StateAdapter(state);
        }

        test('Enchanted Focus pays +$2 on exactly three completed quests, then is marked used', () => {
            const adapter = adapterWithBuff(
                { name: 'Enchanted Focus', duration: 'one-time', status: 'active', usesLeft: 3 }
            );

            const { paid, dollars } = completeQuestsWithBuff(adapter, 'Enchanted Focus', 5);

            expect(paid).toBe(3);
            expect(dollars).toEqual([17, 17, 17, 15, 15]);
            expect(adapter.getTemporaryBuffs()).toEqual([
                expect.objectContaining({ name: 'Enchanted Focus', status: 'used', usesLeft: 0 })
            ]);
        });

        test('Story Surge pays +$2 on exactly five completed quests', () => {
            const adapter = adapterWithBuff(
                { name: 'Story Surge', duration: 'one-time', status: 'active', usesLeft: 5 }
            );

            const { paid, dollars } = completeQuestsWithBuff(adapter, 'Story Surge', 7);

            expect(paid).toBe(5);
            expect(dollars).toEqual([17, 17, 17, 17, 17, 15, 15]);
            expect(adapter.getTemporaryBuffs()[0]).toMatchObject({ status: 'used', usesLeft: 0 });
        });

        test('a buff entry saved without usesLeft counts down from the catalog useCount', () => {
            const adapter = adapterWithBuff(
                { name: "Librarian's Blessing", duration: 'one-time', status: 'active' }
            );

            const { paid, dollars } = completeQuestsWithBuff(adapter, "Librarian's Blessing", 3);

            expect(paid).toBe(2);
            expect(dollars).toEqual([20, 20, 15]);
        });

        test('Long Read Focus pays on one quest only', () => {
            const adapter = adapterWithBuff(
                { name: 'Long Read Focus', duration: 'one-time', status: 'active', usesLeft: 1 }
            );

            const { paid } = completeQuestsWithBuff(adapter, 'Long Read Focus', 2);

            expect(paid).toBe(1);
        });

        test('a batch added as completed pays the last use only once', () => {
            const adapter = adapterWithBuff(
                { name: 'Enchanted Focus', duration: 'one-time', status: 'active', usesLeft: 1 }
            );
            const handler = new BaseQuestHandler({}, { rewardStateAdapter: adapter });
            const buffs = ['[Buff] Enchanted Focus'];
            const makeQuest = (book) => ({
                type: '♥ Organize the Stacks',
                prompt: 'Fantasy',
                book,
                buffs,
                rewards: new Reward({ xp: 15, dollars: 15 })
            });

            const quests = handler.processCompletedQuests([makeQuest('A'), makeQuest('B')], buffs, '', '');

            expect(quests.map(q => q.rewards.dollars)).toEqual([17, 15]);
            // The live state is untouched until QuestController spends the uses after storing the batch.
            expect(adapter.getTemporaryBuffs()[0].usesLeft).toBe(1);
        });

        test('a quest without the bonus card does not spend a use', () => {
            const adapter = adapterWithBuff(
                { name: 'Enchanted Focus', duration: 'one-time', status: 'active', usesLeft: 3 }
            );

            const { changed } = adapter.consumeUseCountBuffsForQuest(
                ["[Item] Librarian's Compass"],
                name => data.getTemporaryBuffData(name)?.useCount || 0
            );

            expect(changed).toBe(false);
            expect(adapter.getTemporaryBuffs()[0].usesLeft).toBe(3);
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
