/**
 * @jest-environment jsdom
 */
import {
    computeQuestDeckDrawCount,
    resolveQuestDrawCardBoost,
    QUEST_DECK_GENRE,
    QUEST_DECK_DUNGEON_ROOM,
    QUEST_DECK_SIDE,
    QUEST_DECK_EXTRA_CREDIT
} from '../assets/js/services/QuestDrawBoost.js';
import { StateAdapter } from '../assets/js/character-sheet/stateAdapter.js';
import { createEmptyCharacterState, STORAGE_KEYS } from '../assets/js/character-sheet/storageKeys.js';
import { TRIGGERS } from '../assets/js/services/effectSchema.js';

const emptyCatalogSlice = {
    allItems: {},
    temporaryBuffs: {},
    schoolBenefits: {},
    seriesExpedition: {},
    permanentBonuses: {}
};

describe('QuestDrawBoost', () => {
    describe('resolveQuestDrawCardBoost', () => {
        it('maps Divination school reroll_quest_die to all pool decks (die helper, no extra draws)', () => {
            const catalogs = {
                ...emptyCatalogSlice,
                schoolBenefits: {
                    Divination: {
                        effects: [
                            { trigger: TRIGGERS.ON_MONTH_START, modifier: { action: 'reroll_quest_die' } }
                        ]
                    }
                }
            };
            const row = {
                sourceType: 'school',
                name: 'Divination',
                effectPlain: 'Once per month, roll 2 dice instead of 1 for a Monthly Quest.',
                effect: 'Once per month, roll 2 dice instead of 1 for a Monthly Quest.'
            };
            const b = resolveQuestDrawCardBoost(row, catalogs);
            expect(b.kind).toBe('divination_pool_die');
            expect(b.decks.has(QUEST_DECK_GENRE)).toBe(true);
            expect(b.decks.has(QUEST_DECK_DUNGEON_ROOM)).toBe(true);
            expect(b.decks.has(QUEST_DECK_SIDE)).toBe(true);
        });

        it('maps pull_extra_genre_quest on ability to genre flicker boost', () => {
            const catalogs = {
                ...emptyCatalogSlice,
                masteryAbilities: {
                    'Flicker of Prophecy': {
                        name: 'Flicker of Prophecy',
                        effects: [
                            {
                                trigger: TRIGGERS.ON_MONTH_START,
                                modifier: { action: 'pull_extra_genre_quest' }
                            }
                        ]
                    }
                }
            };
            const row = { sourceType: 'ability', name: 'Flicker of Prophecy', effect: '', effectPlain: '' };
            const b = resolveQuestDrawCardBoost(row, catalogs);
            expect(b.kind).toBe('flicker_genre');
            expect(b.totalDraws).toBe(3);
            expect(b.decks.has(QUEST_DECK_GENRE)).toBe(true);
        });
    });

    describe('computeQuestDeckDrawCount', () => {
        function flickerCatalog() {
            return {
                ...emptyCatalogSlice,
                masteryAbilities: {
                    'Flicker of Prophecy': {
                        name: 'Flicker of Prophecy',
                        benefit:
                            'When rolling a d6 for a Genre Quest, you may choose to treat the result as one number higher or lower.',
                        effects: [
                            {
                                trigger: TRIGGERS.ON_MONTH_START,
                                modifier: { action: 'pull_extra_genre_quest' }
                            }
                        ]
                    }
                }
            };
        }

        it('draws one card when auto-apply is off', () => {
            const state = createEmptyCharacterState();
            state[STORAGE_KEYS.LEARNED_ABILITIES] = ['Flicker of Prophecy'];
            state[STORAGE_KEYS.QUEST_DRAW_HELPER_SETTINGS] = { autoApplyOnDraw: false };
            const adapter = new StateAdapter(state);
            const r = computeQuestDeckDrawCount(adapter, QUEST_DECK_GENRE, {
                school: '',
                level: 1,
                catalogs: flickerCatalog()
            });
            expect(r.drawCount).toBe(1);
            expect(r.consumedHelper).toBeNull();
        });

        it('consumes one monthly helper per genre click when auto-apply is on', () => {
            const state = createEmptyCharacterState();
            state[STORAGE_KEYS.LEARNED_ABILITIES] = ['Flicker of Prophecy'];
            state[STORAGE_KEYS.QUEST_DRAW_HELPER_SETTINGS] = { autoApplyOnDraw: true };
            const adapter = new StateAdapter(state);
            const first = computeQuestDeckDrawCount(adapter, QUEST_DECK_GENRE, {
                school: '',
                level: 1,
                catalogs: flickerCatalog()
            });
            expect(first.drawCount).toBe(3);
            expect(first.consumedHelper?.name).toBe('Flicker of Prophecy');
            const sid = first.consumedHelper.sourceId;
            expect(adapter.state[STORAGE_KEYS.QUEST_DRAW_HELPER_STATE][sid].used).toBe(true);

            const second = computeQuestDeckDrawCount(adapter, QUEST_DECK_GENRE, {
                school: '',
                level: 1,
                catalogs: flickerCatalog()
            });
            expect(second.drawCount).toBe(1);
            expect(second.consumedHelper).toBeNull();
        });

        it('draws 3 cards (2 extra) for Master of Fates on dungeon deck when auto-apply is on', () => {
            const state = createEmptyCharacterState();
            state[STORAGE_KEYS.LEARNED_ABILITIES] = ['Master of Fates'];
            state[STORAGE_KEYS.QUEST_DRAW_HELPER_SETTINGS] = { autoApplyOnDraw: true };
            const catalogs = {
                ...emptyCatalogSlice,
                masteryAbilities: {
                    'Master of Fates': {
                        name: 'Master of Fates',
                        benefit:
                            'Once per month, when establishing your Monthly Quest Pool, you may draw two additional cards.',
                        effects: [
                            {
                                trigger: TRIGGERS.ON_MONTH_START,
                                modifier: { action: 'draw_extra_from_each_category' }
                            }
                        ]
                    }
                }
            };
            const adapter = new StateAdapter(state);
            const r = computeQuestDeckDrawCount(adapter, QUEST_DECK_DUNGEON_ROOM, {
                school: '',
                level: 1,
                catalogs
            });
            expect(r.drawCount).toBe(3);
            expect(r.consumedHelper?.name).toBe('Master of Fates');
        });

        it('uses Master then Flicker on genre when learned order is reversed (pool-wide first)', () => {
            const state = createEmptyCharacterState();
            state[STORAGE_KEYS.LEARNED_ABILITIES] = ['Flicker of Prophecy', 'Master of Fates'];
            state[STORAGE_KEYS.QUEST_DRAW_HELPER_SETTINGS] = { autoApplyOnDraw: true };
            const catalogs = {
                ...emptyCatalogSlice,
                masteryAbilities: {
                    'Flicker of Prophecy': {
                        name: 'Flicker of Prophecy',
                        benefit:
                            'When rolling a d6 for a Genre Quest, you may choose to treat the result as one number higher or lower.',
                        effects: [
                            {
                                trigger: TRIGGERS.ON_MONTH_START,
                                modifier: { action: 'pull_extra_genre_quest' }
                            }
                        ]
                    },
                    'Master of Fates': {
                        name: 'Master of Fates',
                        benefit:
                            'Once per month, when establishing your Monthly Quest Pool, you may draw two additional cards.',
                        effects: [
                            {
                                trigger: TRIGGERS.ON_MONTH_START,
                                modifier: { action: 'draw_extra_from_each_category' }
                            }
                        ]
                    }
                }
            };
            const adapter = new StateAdapter(state);
            const first = computeQuestDeckDrawCount(adapter, QUEST_DECK_GENRE, {
                school: '',
                level: 1,
                catalogs
            });
            expect(first.consumedHelper?.name).toBe('Master of Fates');
            expect(first.drawCount).toBe(3);

            const second = computeQuestDeckDrawCount(adapter, QUEST_DECK_GENRE, {
                school: '',
                level: 1,
                catalogs
            });
            expect(second.consumedHelper?.name).toBe('Flicker of Prophecy');
            expect(second.drawCount).toBe(3);
        });

        it('consumes Divination on genre, side, or dungeon deck with auto on (1 draw, die helper marked)', () => {
            const state = createEmptyCharacterState();
            state[STORAGE_KEYS.QUEST_DRAW_HELPER_SETTINGS] = { autoApplyOnDraw: true };
            const catalogs = {
                ...emptyCatalogSlice,
                schoolBenefits: {
                    Divination: {
                        benefit:
                            'Once per month, you may roll 2 dice instead of 1 for a Monthly Quest, and choose which result you want to use.',
                        effects: [
                            { trigger: TRIGGERS.ON_MONTH_START, modifier: { action: 'reroll_quest_die' } }
                        ]
                    }
                }
            };
            const adapter = new StateAdapter(state);
            const opts = { school: 'Divination', level: 1, catalogs };
            for (const deck of [QUEST_DECK_GENRE, QUEST_DECK_SIDE, QUEST_DECK_DUNGEON_ROOM, QUEST_DECK_EXTRA_CREDIT]) {
                const next = new StateAdapter(createEmptyCharacterState());
                next.state[STORAGE_KEYS.QUEST_DRAW_HELPER_SETTINGS] = { autoApplyOnDraw: true };
                const r = computeQuestDeckDrawCount(next, deck, opts);
                expect(r.drawCount).toBe(1);
                expect(r.consumedHelper?.name).toBe('Divination');
            }
        });

        it('treats lowercase ON_MONTH_START trigger as monthly pool draw for Flicker', () => {
            const state = createEmptyCharacterState();
            state[STORAGE_KEYS.LEARNED_ABILITIES] = ['Flicker of Prophecy'];
            state[STORAGE_KEYS.QUEST_DRAW_HELPER_SETTINGS] = { autoApplyOnDraw: true };
            const catalogs = {
                ...emptyCatalogSlice,
                masteryAbilities: {
                    'Flicker of Prophecy': {
                        name: 'Flicker of Prophecy',
                        benefit:
                            'When rolling a d6 for a Genre Quest, you may choose to treat the result as one number higher or lower.',
                        effects: [
                            {
                                trigger: 'on_month_start',
                                modifier: { action: 'pull_extra_genre_quest' }
                            }
                        ]
                    }
                }
            };
            const adapter = new StateAdapter(state);
            const r = computeQuestDeckDrawCount(adapter, QUEST_DECK_GENRE, {
                school: '',
                level: 1,
                catalogs
            });
            expect(r.drawCount).toBe(3);
            expect(r.consumedHelper?.name).toBe('Flicker of Prophecy');
        });
    });
});
