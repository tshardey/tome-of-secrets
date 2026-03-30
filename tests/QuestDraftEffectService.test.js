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

    test('Cartographer grants only once per calendar month when cooldown is tracked', () => {
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
        expect(updateCurrency).toHaveBeenCalledTimes(1);
    });

    test('Cartographer monthly cooldown: only first dungeon in a batch grants ink', () => {
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

        expect(updateCurrency).toHaveBeenCalledTimes(1);
        expect(updateCurrency).toHaveBeenCalledWith(
            expect.objectContaining({ inkDrops: 15, xp: 0, paperScraps: 0 })
        );
    });
});
