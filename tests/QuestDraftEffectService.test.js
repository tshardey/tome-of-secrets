/**
 * @jest-environment jsdom
 */
import { applyQuestDraftedEffects } from '../assets/js/services/QuestDraftEffectService.js';
import * as data from '../assets/js/character-sheet/data.js';

describe('QuestDraftEffectService', () => {
    test('Cartographer background grants 15 ink when dungeon quest is drafted', () => {
        const updateCurrency = jest.fn();
        const state = {};
        const adapter = { state };
        const cartographerBackground = (data.keeperBackgrounds && data.keeperBackgrounds.cartographer) || {
            effects: [
                {
                    trigger: 'ON_QUEST_DRAFTED',
                    condition: { questType: 'dungeon_crawl' },
                    modifier: { type: 'GRANT_RESOURCE', resource: 'inkDrops', value: 15 }
                }
            ]
        };
        const dataModule = {
            keeperBackgrounds: { cartographer: cartographerBackground },
            schoolBenefits: data.schoolBenefits || {},
            masteryAbilities: data.masteryAbilities || {},
            allItems: {},
            temporaryBuffs: {},
            temporaryBuffsFromRewards: {}
        };
        const quest = { type: '♠ Dungeon Crawl', roomNumber: '1', prompt: 'Test' };

        applyQuestDraftedEffects(adapter, [quest], {
            updateCurrency,
            dataModule,
            formData: { keeperBackground: 'cartographer', wizardSchool: '' }
        });

        expect(updateCurrency).toHaveBeenCalledWith(
            expect.objectContaining({ inkDrops: 15, xp: 0, paperScraps: 0 })
        );
    });

    test('non-dungeon quest does not grant Cartographer ink', () => {
        const updateCurrency = jest.fn();
        const adapter = { state: {} };
        const cartographerBackground = (data.keeperBackgrounds && data.keeperBackgrounds.cartographer) || {
            effects: [
                {
                    trigger: 'ON_QUEST_DRAFTED',
                    condition: { questType: 'dungeon_crawl' },
                    modifier: { type: 'GRANT_RESOURCE', resource: 'inkDrops', value: 15 }
                }
            ]
        };
        const dataModule = {
            keeperBackgrounds: { cartographer: cartographerBackground },
            schoolBenefits: {},
            masteryAbilities: {},
            allItems: {},
            temporaryBuffs: {},
            temporaryBuffsFromRewards: {}
        };

        applyQuestDraftedEffects(
            adapter,
            [{ type: '♥ Organize the Stacks', prompt: 'x' }],
            {
                updateCurrency,
                dataModule,
                formData: { keeperBackground: 'cartographer', wizardSchool: '' }
            }
        );

        expect(updateCurrency).not.toHaveBeenCalled();
    });

    test('non-Cartographer does not grant ink on dungeon draft', () => {
        const updateCurrency = jest.fn();
        const adapter = { state: {} };
        const dataModule = {
            keeperBackgrounds: data.keeperBackgrounds || {},
            schoolBenefits: {},
            masteryAbilities: {},
            allItems: {},
            temporaryBuffs: {},
            temporaryBuffsFromRewards: {}
        };

        applyQuestDraftedEffects(adapter, [{ type: '♠ Dungeon Crawl', prompt: 'x' }], {
            updateCurrency,
            dataModule,
            formData: { keeperBackground: 'scribe', wizardSchool: '' }
        });

        expect(updateCurrency).not.toHaveBeenCalled();
    });

    test('Cartographer grants per dungeon draft even when cooldown adapter exists', () => {
        const updateCurrency = jest.fn();
        const state = { effectCooldowns: {} };
        const adapter = {
            state,
            isEffectCooldownAvailable(key, _cadence, { month, year }) {
                const prev = state.effectCooldowns[key];
                if (!prev || typeof prev !== 'object') return true;
                return prev.month !== month || prev.year !== year;
            },
            consumeEffectCooldown(key, _cadence, { month, year }) {
                state.effectCooldowns[key] = { month, year };
                return true;
            }
        };
        const cartographerBackground = (data.keeperBackgrounds && data.keeperBackgrounds.cartographer) || {
            effects: [
                {
                    trigger: 'ON_QUEST_DRAFTED',
                    condition: { questType: 'dungeon_crawl' },
                    modifier: { type: 'GRANT_RESOURCE', resource: 'inkDrops', value: 15 },
                    cooldown: 'monthly'
                }
            ]
        };
        const dataModule = {
            keeperBackgrounds: { cartographer: cartographerBackground },
            schoolBenefits: {},
            masteryAbilities: {},
            allItems: {},
            temporaryBuffs: {},
            temporaryBuffsFromRewards: {}
        };
        const quest = { type: '♠ Dungeon Crawl', roomNumber: '1', prompt: 'Test' };
        const opts = {
            updateCurrency,
            dataModule,
            formData: { keeperBackground: 'cartographer', wizardSchool: '' },
            month: 'March',
            year: '2026'
        };

        applyQuestDraftedEffects(adapter, [quest], opts);
        expect(updateCurrency).toHaveBeenCalledTimes(1);
        expect(updateCurrency).toHaveBeenCalledWith(
            expect.objectContaining({ inkDrops: 15, xp: 0, paperScraps: 0 })
        );

        applyQuestDraftedEffects(adapter, [quest], opts);
        expect(updateCurrency).toHaveBeenCalledTimes(2);
    });

    test('Cartographer grants for each dungeon in a batch', () => {
        const updateCurrency = jest.fn();
        const state = { effectCooldowns: {} };
        const adapter = {
            state,
            isEffectCooldownAvailable(key, _cadence, { month, year }) {
                const prev = state.effectCooldowns[key];
                if (!prev || typeof prev !== 'object') return true;
                return prev.month !== month || prev.year !== year;
            },
            consumeEffectCooldown(key, _cadence, { month, year }) {
                state.effectCooldowns[key] = { month, year };
                return true;
            }
        };
        const cartographerBackground = (data.keeperBackgrounds && data.keeperBackgrounds.cartographer) || {
            effects: [
                {
                    trigger: 'ON_QUEST_DRAFTED',
                    condition: { questType: 'dungeon_crawl' },
                    modifier: { type: 'GRANT_RESOURCE', resource: 'inkDrops', value: 15 },
                    cooldown: 'monthly'
                }
            ]
        };
        const dataModule = {
            keeperBackgrounds: { cartographer: cartographerBackground },
            schoolBenefits: {},
            masteryAbilities: {},
            allItems: {},
            temporaryBuffs: {},
            temporaryBuffsFromRewards: {}
        };
        const q1 = { type: '♠ Dungeon Crawl', roomNumber: '1', prompt: 'A' };
        const q2 = { type: '♠ Dungeon Crawl', roomNumber: '2', prompt: 'B' };

        applyQuestDraftedEffects(adapter, [q1, q2], {
            updateCurrency,
            dataModule,
            formData: { keeperBackground: 'cartographer', wizardSchool: '' },
            month: 'April',
            year: '2026'
        });

        expect(updateCurrency).toHaveBeenCalledTimes(2);
        expect(updateCurrency).toHaveBeenCalledWith(
            expect.objectContaining({ inkDrops: 15, xp: 0, paperScraps: 0 })
        );
    });

    test('uses drafted quest month/year over stale options period for cooldown checks', () => {
        const updateCurrency = jest.fn();
        const state = { effectCooldowns: { 'background:cartographer': { month: 'March', year: '2026' } } };
        const adapter = {
            state,
            isEffectCooldownAvailable(key, _cadence, { month, year }) {
                const prev = state.effectCooldowns[key];
                if (!prev || typeof prev !== 'object') return true;
                return prev.month !== month || prev.year !== year;
            },
            consumeEffectCooldown(key, _cadence, { month, year }) {
                state.effectCooldowns[key] = { month, year };
                return true;
            }
        };
        const dataModule = {
            keeperBackgrounds: {
                cartographer: {
                    name: "The Cartographer's Guild",
                    effects: [
                        {
                            trigger: 'ON_QUEST_DRAFTED',
                            condition: { questType: 'dungeon_crawl' },
                            modifier: { type: 'GRANT_RESOURCE', resource: 'inkDrops', value: 15 },
                            cooldown: 'monthly'
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

        applyQuestDraftedEffects(adapter, [{ type: '♠ Dungeon Crawl', month: 'April', year: '2026' }], {
            updateCurrency,
            dataModule,
            // Simulate stale DOM period from previous month.
            month: 'March',
            year: '2026',
            formData: { keeperBackground: 'cartographer', wizardSchool: '' }
        });

        expect(updateCurrency).toHaveBeenCalledTimes(1);
        expect(updateCurrency).toHaveBeenCalledWith(
            expect.objectContaining({ inkDrops: 15, xp: 0, paperScraps: 0 })
        );
    });
});
