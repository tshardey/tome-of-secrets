/**
 * @jest-environment jsdom
 */

import {
    stripSimpleHtml,
    isQuestDrawHelperText,
    classifyQuestDrawCadence,
    buildQuestDrawHelperList
} from '../assets/js/character-sheet/questDrawHelperDiscovery.js';
import { STORAGE_KEYS } from '../assets/js/character-sheet/storageKeys.js';

describe('questDrawHelperDiscovery', () => {
    describe('stripSimpleHtml', () => {
        it('removes tags and collapses whitespace', () => {
            const html = '<strong>Title:</strong> Before drawing your <em>Monthly</em> Quest Pool, roll.';
            expect(stripSimpleHtml(html)).toBe('Title: Before drawing your Monthly Quest Pool, roll.');
        });

        it('returns empty string for non-string', () => {
            expect(stripSimpleHtml(null)).toBe('');
            expect(stripSimpleHtml(undefined)).toBe('');
        });
    });

    describe('isQuestDrawHelperText', () => {
        it('matches monthly pool establishment phrases', () => {
            expect(isQuestDrawHelperText('When establishing your Monthly Quest Pool, draw extra.')).toBe(true);
            expect(isQuestDrawHelperText('Before drawing your Monthly Quest Pool, choose one.')).toBe(true);
        });

        it('matches Divination-style dice and extra-card wording', () => {
            expect(
                isQuestDrawHelperText('Once per month, you may roll 2 dice instead of 1 for a Monthly Quest.')
            ).toBe(true);
            expect(
                isQuestDrawHelperText(
                    'Once per month, when establishing your Monthly Quest Pool, you may draw two additional cards.'
                )
            ).toBe(true);
        });

        it('matches genre d6 and reroll / genre-switch phrases', () => {
            expect(
                isQuestDrawHelperText(
                    'When rolling a d6 for a Genre Quest, you may nudge the result by one.'
                )
            ).toBe(true);
            expect(isQuestDrawHelperText('Once per month, re-roll a prompt or a die roll.')).toBe(true);
            expect(isQuestDrawHelperText('Choose one: reroll a prompt, or gain XP.')).toBe(true);
            expect(
                isQuestDrawHelperText('Once per month, switch the genre of any quest you roll.')
            ).toBe(true);
        });

        it('excludes Abjuration worn-page alternate draw (curse mitigation)', () => {
            const abjuration =
                'Once per month, when you would gain a Worn Page penalty, you may instead draw a card from the deck and choose a quest from that draw to complete.';
            expect(isQuestDrawHelperText(abjuration)).toBe(false);
        });

        it('returns false for unrelated monthly wording', () => {
            expect(isQuestDrawHelperText('Once per month, transmute your currency.')).toBe(false);
            expect(isQuestDrawHelperText('')).toBe(false);
        });
    });

    describe('classifyQuestDrawCadence', () => {
        it('classifies Flicker-style d6 nudge as always', () => {
            const t = 'When rolling a d6 for a Genre Quest, adjust by one.';
            expect(classifyQuestDrawCadence(t)).toBe('always');
        });

        it('classifies Insightful Draw style as always', () => {
            const t =
                'When drawing your Monthly Quest Pool, you draw one extra quest card and then discard one card of your choice.';
            expect(classifyQuestDrawCadence(t, { sourceType: 'permanentBonus' })).toBe('always');
        });

        it('classifies Forecaster-style permanent bonus as monthly', () => {
            const t =
                'Before drawing your Monthly Quest Pool, you may roll for one additional Atmospheric Bonus.';
            expect(classifyQuestDrawCadence(t, { sourceType: 'permanentBonus' })).toBe('monthly');
        });

        it('uses getCadenceFromText for explicit once per month', () => {
            expect(
                classifyQuestDrawCadence('Once per month, roll 2 dice instead of 1 for a Monthly Quest.')
            ).toBe('monthly');
        });
    });

    describe('buildQuestDrawHelperList', () => {
        const baseCatalogs = {
            allItems: {},
            temporaryBuffs: {},
            masteryAbilities: {},
            schoolBenefits: {},
            seriesExpedition: { stops: [] },
            permanentBonuses: {}
        };

        const emptyState = {
            [STORAGE_KEYS.EQUIPPED_ITEMS]: [],
            [STORAGE_KEYS.INVENTORY_ITEMS]: [],
            [STORAGE_KEYS.PASSIVE_ITEM_SLOTS]: [],
            [STORAGE_KEYS.PASSIVE_FAMILIAR_SLOTS]: [],
            [STORAGE_KEYS.TEMPORARY_BUFFS]: [],
            [STORAGE_KEYS.LEARNED_ABILITIES]: [],
            [STORAGE_KEYS.SERIES_EXPEDITION_PROGRESS]: []
        };

        it('includes Divination school benefit and excludes Abjuration alternate draw', () => {
            const catalogs = {
                ...baseCatalogs,
                schoolBenefits: {
                    Divination: {
                        benefit:
                            'Once per month, you may roll 2 dice instead of 1 for a Monthly Quest, and choose which result you want to use.'
                    },
                    Abjuration: {
                        benefit:
                            'Once per month, when you would gain a Worn Page penalty, you may instead draw a card from the deck and choose a quest from that draw to complete.'
                    }
                }
            };
            const div = buildQuestDrawHelperList(emptyState, catalogs, { school: 'Divination' });
            expect(div).toHaveLength(1);
            expect(div[0].sourceType).toBe('school');
            expect(div[0].cadence).toBe('monthly');

            const abj = buildQuestDrawHelperList(emptyState, catalogs, { school: 'Abjuration' });
            expect(abj).toHaveLength(0);
        });

        it('discovers permanent level bonuses after stripping HTML with correct cadence', () => {
            const catalogs = {
                ...baseCatalogs,
                permanentBonuses: {
                    3: '<strong>Atmospheric Forecaster:</strong> Before drawing your Monthly Quest Pool, you may roll for one additional Atmospheric Bonus.',
                    9: '<strong>Insightful Draw:</strong> When drawing your Monthly Quest Pool, you draw one extra quest card and then discard one card of your choice.'
                }
            };
            const helpers = buildQuestDrawHelperList(emptyState, catalogs, { level: 10 });
            const byLevel = Object.fromEntries(helpers.map(h => [h.name, h]));
            expect(byLevel['Level 3 bonus'].cadence).toBe('monthly');
            expect(byLevel['Level 9 bonus'].cadence).toBe('always');
            expect(byLevel['Level 3 bonus'].sourceId).toMatch(/permanentBonus.*level-3/);
        });

        it('discovers learned abilities with quest-draw phrases and cadence', () => {
            const state = {
                ...emptyState,
                [STORAGE_KEYS.LEARNED_ABILITIES]: ['Flicker of Prophecy', 'Master of Fates']
            };
            const catalogs = {
                ...baseCatalogs,
                masteryAbilities: {
                    'Flicker of Prophecy': {
                        name: 'Flicker of Prophecy',
                        benefit:
                            'When rolling a d6 for a Genre Quest, you may choose to treat the result as one number higher or lower.'
                    },
                    'Master of Fates': {
                        name: 'Master of Fates',
                        benefit:
                            'Once per month, when establishing your Monthly Quest Pool, you may draw two additional cards. You then choose which to keep.'
                    }
                }
            };
            const helpers = buildQuestDrawHelperList(state, catalogs, {});
            const flicker = helpers.find(h => h.name === 'Flicker of Prophecy');
            const master = helpers.find(h => h.name === 'Master of Fates');
            expect(flicker.cadence).toBe('always');
            expect(master.cadence).toBe('monthly');
        });

        it('discovers equipped item matching allowlist', () => {
            const state = {
                ...emptyState,
                [STORAGE_KEYS.EQUIPPED_ITEMS]: [{ name: 'Test Lantern' }]
            };
            const catalogs = {
                ...baseCatalogs,
                allItems: {
                    'Test Lantern': {
                        name: 'Test Lantern',
                        bonus: 'Once per month, re-roll a prompt or a die roll when drawing quests.',
                        img: 'assets/images/rewards/test-lantern.png'
                    }
                }
            };
            const helpers = buildQuestDrawHelperList(state, catalogs, {});
            expect(helpers).toHaveLength(1);
            expect(helpers[0].sourceType).toBe('item');
            expect(helpers[0].slotMode).toBe('equipped');
            expect(helpers[0].cadence).toBe('monthly');
            expect(helpers[0].img).toBe('assets/images/rewards/test-lantern.png');
        });

        it('does not list inventory-only items', () => {
            const state = {
                ...emptyState,
                [STORAGE_KEYS.EQUIPPED_ITEMS]: [],
                [STORAGE_KEYS.INVENTORY_ITEMS]: [{ name: 'Inventory Only Lantern' }]
            };
            const catalogs = {
                ...baseCatalogs,
                allItems: {
                    'Inventory Only Lantern': {
                        name: 'Inventory Only Lantern',
                        bonus: 'Once per month, re-roll a prompt or a die roll when drawing quests.',
                        img: 'assets/images/rewards/foo.png'
                    }
                }
            };
            expect(buildQuestDrawHelperList(state, catalogs, {})).toHaveLength(0);
        });
    });
});
