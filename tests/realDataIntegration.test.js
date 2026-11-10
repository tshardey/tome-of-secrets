import fs from 'node:fs';
import path from 'node:path';
import { Reward, RewardCalculator } from '../assets/js/services/RewardCalculator.js';
import { ModifierPipeline } from '../assets/js/services/ModifierPipeline.js';
import { EffectRegistry } from '../assets/js/services/EffectRegistry.js';
import { TriggerPayload } from '../assets/js/services/TriggerPayload.js';
import { TRIGGERS } from '../assets/js/services/effectSchema.js';
import { STORAGE_KEYS } from '../assets/js/character-sheet/storageKeys.js';

function loadJson(filename) {
    const repoRoot = path.resolve(process.cwd(), '..');
    const fullPath = path.join(repoRoot, 'assets', 'data', filename);
    return JSON.parse(fs.readFileSync(fullPath, 'utf8'));
}

function buildDataModule() {
    return {
        keeperBackgrounds: loadJson('keeperBackgrounds.json'),
        schoolBenefits: loadJson('schoolBenefits.json'),
        masteryAbilities: loadJson('masteryAbilities.json'),
        allItems: loadJson('allItems.json'),
        temporaryBuffs: loadJson('temporaryBuffs.json'),
        temporaryBuffsFromRewards: loadJson('temporaryBuffsFromRewards.json')
    };
}

function emptyState() {
    return {
        [STORAGE_KEYS.LEARNED_ABILITIES]: [],
        [STORAGE_KEYS.EQUIPPED_ITEMS]: [],
        [STORAGE_KEYS.PASSIVE_ITEM_SLOTS]: [],
        [STORAGE_KEYS.PASSIVE_FAMILIAR_SLOTS]: [],
        [STORAGE_KEYS.TEMPORARY_BUFFS]: []
    };
}

function resolveWithRealData({ trigger, payload, baseReward, state, formData = {} }) {
    const dataModule = buildDataModule();
    const stateAdapter = { state, formData };
    const activeEffects = EffectRegistry.getActiveEffects(trigger, stateAdapter, dataModule);
    return ModifierPipeline.resolve(trigger, payload, activeEffects, baseReward);
}

describe('Real data integration: EffectRegistry + ModifierPipeline', () => {
    test('Lantern of Foresight exposes an ON_ACTIVATE action from allItems.json', () => {
        const state = emptyState();
        state[STORAGE_KEYS.EQUIPPED_ITEMS] = [{ name: 'Lantern of Foresight' }];
        const dataModule = buildDataModule();
        const active = EffectRegistry.getActiveEffects(
            TRIGGERS.ON_ACTIVATE,
            { state, formData: { keeperBackground: '', wizardSchool: '' } },
            dataModule
        );

        expect(active).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    source: expect.objectContaining({ name: 'Lantern of Foresight' }),
                    effect: expect.objectContaining({
                        trigger: TRIGGERS.ON_ACTIVATE,
                        modifier: expect.objectContaining({
                            type: 'ACTIVATE',
                            action: 'reroll_prompt_or_die'
                        })
                    })
                })
            ])
        );
    });

    test('Celestial Koi Fish auto-applies +10 XP on celestial-tagged quest completion', () => {
        const state = emptyState();
        state[STORAGE_KEYS.EQUIPPED_ITEMS] = [{ name: 'Celestial Koi Fish', type: 'Familiar' }];
        const withCelestialTag = resolveWithRealData({
            trigger: TRIGGERS.ON_QUEST_COMPLETED,
            payload: TriggerPayload.questCompleted({ questType: 'genre_quest', tags: ['celestial'] }),
            baseReward: new Reward({ xp: 15 }),
            state
        });
        expect(withCelestialTag.xp).toBe(25);
        expect(withCelestialTag.modifiedBy).toContain('Celestial Koi Fish');

        const withoutCelestialTag = resolveWithRealData({
            trigger: TRIGGERS.ON_QUEST_COMPLETED,
            payload: TriggerPayload.questCompleted({ questType: 'genre_quest', tags: ['mythological'] }),
            baseReward: new Reward({ xp: 15 }),
            state
        });
        expect(withoutCelestialTag.xp).toBe(15);
        expect(withoutCelestialTag.modifiedBy).not.toContain('Celestial Koi Fish');
    });

    test('background dollar effects from keeperBackgrounds.json apply', () => {
        const scenarios = [
            ['archivist', TRIGGERS.ON_QUEST_COMPLETED, TriggerPayload.questCompleted({ questType: 'genre_quest', tags: ['non-fiction'] }), 2, "The Archivist's Apprentice"],
            ['cartographer', TRIGGERS.ON_QUEST_DRAFTED, TriggerPayload.questDrafted({ questType: 'dungeon_crawl' }), 3, "The Cartographer's Guild"],
            ['prophet', TRIGGERS.ON_QUEST_COMPLETED, TriggerPayload.questCompleted({ questType: 'genre_quest', tags: ['mythology'] }), 3, 'The Cloistered Prophet'],
            ['biblioslinker', TRIGGERS.ON_QUEST_COMPLETED, TriggerPayload.questCompleted({ questType: 'dungeon_crawl' }), 3, 'The Biblioslinker']
        ];
        scenarios.forEach(([id, trigger, payload, dollars, sourceName]) => {
            const result = resolveWithRealData({
                trigger,
                payload,
                baseReward: new Reward(),
                state: emptyState(),
                formData: { keeperBackground: id, wizardSchool: '' }
            });
            expect({ id, dollars: result.dollars }).toEqual({ id, dollars });
            expect(result.modifiedBy).toContain(sourceName);
        });
    });

    test('background activation effects from keeperBackgrounds.json apply', () => {
        const scenarios = [
            {
                id: 'groveTender',
                trigger: TRIGGERS.ON_MONTH_START,
                payload: TriggerPayload.monthStart({ questPoolSize: 4 }),
                baseReward: new Reward(),
                assert: (result) => {
                    expect(result.dollars).toBe(0);
                    expect(result.receipt.modifiers).toContainEqual(
                        expect.objectContaining({
                            type: 'effect:activate',
                            action: 'force_atmospheric_buff',
                            source: 'The Grove Tender',
                            eligible: true
                        })
                    );
                },
                sourceName: 'The Grove Tender'
            }
        ];

        scenarios.forEach(({ id, trigger, payload, baseReward, assert, sourceName }) => {
            const state = emptyState();
            const result = resolveWithRealData({
                trigger,
                payload,
                baseReward,
                state,
                formData: { keeperBackground: id, wizardSchool: '' }
            });
            assert(result);
            if (trigger !== TRIGGERS.ON_MONTH_START) {
                expect(result.modifiedBy).toContain(sourceName);
            }
        });
    });

    test('school ON_QUEST_COMPLETED effects from schoolBenefits.json apply', () => {
        const schoolBenefits = buildDataModule().schoolBenefits;
        const schoolsWithQuestEffects = Object.entries(schoolBenefits).filter(([, school]) =>
            Array.isArray(school?.effects) &&
            school.effects.some(effect => effect?.trigger === TRIGGERS.ON_QUEST_COMPLETED)
        );

        expect(schoolsWithQuestEffects.map(([name]) => name)).toContain('Enchantment');

        const state = emptyState();
        const result = resolveWithRealData({
            trigger: TRIGGERS.ON_QUEST_COMPLETED,
            payload: TriggerPayload.questCompleted({
                questType: 'dungeon_crawl',
                encounterType: 'Monster'
            }),
            baseReward: new Reward({ xp: 30 }),
            state,
            formData: { keeperBackground: '', wizardSchool: 'Enchantment' }
        });

        expect(result.xp).toBe(40); // flat +10 XP, no multiplier
        expect(result.modifiedBy).toContain('School of Enchantment');
    });

    test('mastery ON_QUEST_COMPLETED effects from masteryAbilities.json apply', () => {
        const masteryAbilities = buildDataModule().masteryAbilities;
        const abilitiesWithQuestEffects = Object.entries(masteryAbilities).filter(([, ability]) =>
            Array.isArray(ability?.effects) &&
            ability.effects.some(effect => effect?.trigger === TRIGGERS.ON_QUEST_COMPLETED)
        );

        expect(abilitiesWithQuestEffects.map(([name]) => name)).toEqual(
            expect.arrayContaining(['Silver Tongue', 'Alchemic Focus'])
        );

        const alchemicState = emptyState();
        alchemicState[STORAGE_KEYS.LEARNED_ABILITIES] = ['Alchemic Focus'];
        const alchemicResult = resolveWithRealData({
            trigger: TRIGGERS.ON_QUEST_COMPLETED,
            payload: TriggerPayload.questCompleted({ questType: 'extra_credit' }),
            baseReward: new Reward({ xp: 0 }),
            state: alchemicState
        });
        expect(alchemicResult.xp).toBe(5);
        expect(alchemicResult.modifiedBy).toContain('Alchemic Focus');
    });

    test('Silver Tongue from masteryAbilities.json adds +$1', () => {
        const silverState = emptyState();
        silverState[STORAGE_KEYS.LEARNED_ABILITIES] = ['Silver Tongue'];
        const silverResult = resolveWithRealData({
            trigger: TRIGGERS.ON_QUEST_COMPLETED,
            payload: TriggerPayload.questCompleted({ questType: 'genre_quest' }),
            baseReward: new Reward(),
            state: silverState
        });
        expect(silverResult.dollars).toBe(1);
        expect(silverResult.modifiedBy).toContain('Silver Tongue');
    });

    test('legacy background buff cards never add their own bonus', () => {
        const result = RewardCalculator.calculateFinalRewards('♥ Organize the Stacks', 'Non-Fiction: archive study', {
            appliedBuffs: ['[Background] Archivist Bonus'],
            background: 'archivist',
            quest: { type: '♥ Organize the Stacks', genre: 'Non-Fiction', tags: ['non-fiction'] }
        });

        expect(result.modifiedBy).not.toContain('Archivist Bonus');
        expect(result.receipt.modifiers.map(m => m.source)).not.toContain('Archivist Bonus');
    });

    test('background bonus does not double-stack with legacy background buff cards', () => {
        const result = RewardCalculator.calculateFinalRewards('♥ Organize the Stacks', 'Non-Fiction: archive study', {
            appliedBuffs: ['[Background] Archivist Bonus'],
            background: 'archivist',
            quest: { type: '♥ Organize the Stacks', genre: 'Non-Fiction', tags: ['non-fiction'] }
        });

        expect(result.dollars).toBe(17);
        expect(result.modifiedBy).toContain("The Archivist's Apprentice");
        expect(result.modifiedBy).not.toContain('Archivist Bonus');
    });
});

describe('Dollar economy: catalog values match the spec tables', () => {
    // Build a quest payload that satisfies an effect's condition (first tag group, page bound).
    function payloadFor(condition = {}) {
        const pageCount = condition.pageCount?.min ?? condition.pageCount?.max ?? null;
        return TriggerPayload.questCompleted({
            questType: condition.questType || 'genre_quest',
            tags: condition.tagMatch ? [...condition.tagMatch[0]] : [],
            pageCount
        });
    }

    function itemDollars(itemName, slot) {
        const item = loadJson('allItems.json')[itemName];
        const condition = item.effects.find((e) => e.slot === 'equipped')?.condition;
        const state = emptyState();
        if (slot === 'equipped') {
            state[STORAGE_KEYS.EQUIPPED_ITEMS] = [{ name: itemName }];
        } else {
            state[STORAGE_KEYS.PASSIVE_ITEM_SLOTS] = [{ itemName }];
        }
        return resolveWithRealData({
            trigger: TRIGGERS.ON_QUEST_COMPLETED,
            payload: payloadFor(condition),
            baseReward: new Reward({ dollars: 15 }),
            state
        }).dollars - 15;
    }

    // [item, equipped, passive]: spec "Item conversion rule" and "Former Worn Page and journaling" tables
    test.each([
        ["Librarian's Compass", 4, 2], ['Amulet of Duality', 3, 1], ['Cloak of the Story-Weaver', 2, 1],
        ['Blood Fury Tattoo', 3, 1], ["The Bookwyrm's Scale", 2, 1], ['Key of the Archive', 3, 1],
        ['Tome of Potential', 10, 5], ['Page Sprite', 3, 1], ['Crystal Sprite', 5, 2], ['Pocket Dragon', 4, 2],
        ['Coffee Elemental', 2, 1], ['Lab Assistant Automaton', 3, 1], ['Temporal Sprite', 4, 2],
        ['Ingredient Sprite', 3, 1], ['Herb Dragon', 3, 1], ['Dancing Shoes', 5, 2], ['Dragon Fang', 4, 2],
        ["Romance Reader's Ribbon", 3, 1], ["Star Navigator's Chart", 3, 1], ['Fae-Touched Crystal', 3, 1],
        ['Warding Candle', 3, 1], ["Detective's Magnifying Glass", 3, 1], ['Literary Medallion', 4, 2],
        ['Baby Hollyphant', 3, 1], ["The Reveler's Mask", 5, 2], ["Visiting Scholar's Sigil", 5, 2],
        ['The Crossroads Fox', 5, 2], ['Chalice of Restoration', 3, 1], ['Raven Familiar', 3, 1],
        ["Librarian's Quill", 2, 1], ['Golden Pen', 3, 1]
    ])('%s pays +$%i equipped and +$%i passive', (itemName, equipped, passive) => {
        expect(itemDollars(itemName, 'equipped')).toBe(equipped);
        expect(itemDollars(itemName, 'passive')).toBe(passive);
    });

    test('Tome of Potential pays nothing on a book under 400 pages', () => {
        const state = emptyState();
        state[STORAGE_KEYS.EQUIPPED_ITEMS] = [{ name: 'Tome of Potential' }];
        const result = resolveWithRealData({
            trigger: TRIGGERS.ON_QUEST_COMPLETED,
            payload: TriggerPayload.questCompleted({ questType: 'genre_quest', pageCount: 399 }),
            baseReward: new Reward({ dollars: 15 }),
            state
        });
        expect(result.dollars).toBe(15);
    });

    test('Scatter Brain Scarab (player-judged buff card) pays +$5 equipped / +$2 passive', () => {
        const item = loadJson('allItems.json')['Scatter Brain Scarab'];
        expect(item.rewardModifier).toEqual({ dollars: 5 });
        expect(item.passiveRewardModifier).toEqual({ dollars: 2 });
    });

    test('Gilded Painting, Garden Gnome and Mystical Moth pay $1 per day', () => {
        const items = loadJson('allItems.json');
        for (const name of ['Gilded Painting', 'Garden Gnome', 'Mystical Moth']) {
            expect(items[name].rewardModifier).toEqual({ dollars: 1 });
            expect(items[name].passiveRewardModifier).toEqual({ dollars: 1 });
        }
    });

    test('Tome-Bound Cat with 4 atmospheric days adds +$4', () => {
        const cat = loadJson('allItems.json')['Tome-Bound Cat'];
        expect(cat.atmosphericBonusPerDay).toBe(1);
        const withCat = RewardCalculator.calculateAtmosphericBuffRewards(
            { 'The Candlight Study': { daysUsed: 4, isActive: true } },
            [],
            [],
            { dailyBonus: cat.atmosphericBonusPerDay, dailyBonusSource: 'Tome-Bound Cat' }
        );
        const withoutCat = RewardCalculator.calculateAtmosphericBuffRewards(
            { 'The Candlight Study': { daysUsed: 4, isActive: true } },
            []
        );
        expect(withCat.dollars - withoutCat.dollars).toBe(4);
    });

    // [background key, dollars, condition payload]
    test.each([
        ['archivist', 2, { tags: ['non-fiction'] }],
        ['prophet', 3, { tags: ['mythology'] }],
        ['biblioslinker', 3, { questType: 'dungeon_crawl' }],
        ['scribe', 3, { tags: ['special-edition'] }]
    ])('background %s pays +$%i on its trigger', (background, dollars, payloadFields) => {
        const result = resolveWithRealData({
            trigger: TRIGGERS.ON_QUEST_COMPLETED,
            payload: TriggerPayload.questCompleted({ questType: 'genre_quest', ...payloadFields }),
            baseReward: new Reward({ dollars: 15 }),
            state: emptyState(),
            formData: { keeperBackground: background, wizardSchool: '' }
        });
        expect(result.dollars).toBe(15 + dollars);
    });

    test("Scribe's Acolyte also matches illustrated books and books with maps", () => {
        for (const tag of ['illustrated', 'maps']) {
            const result = resolveWithRealData({
                trigger: TRIGGERS.ON_QUEST_COMPLETED,
                payload: TriggerPayload.questCompleted({ questType: 'genre_quest', tags: [tag] }),
                baseReward: new Reward({ dollars: 15 }),
                state: emptyState(),
                formData: { keeperBackground: 'scribe', wizardSchool: '' }
            });
            expect(result.dollars).toBe(18);
        }
    });

    test("Cartographer's Guild grants +$3 when a dungeon quest is drafted", () => {
        const result = resolveWithRealData({
            trigger: TRIGGERS.ON_QUEST_DRAFTED,
            payload: TriggerPayload.questDrafted({ questType: 'dungeon_crawl' }),
            baseReward: new Reward(),
            state: emptyState(),
            formData: { keeperBackground: 'cartographer', wizardSchool: '' }
        });
        expect(result.dollars).toBe(3);
    });

    test('Abjuration pays +$3 on a book on the TBR for over a year', () => {
        const formData = { keeperBackground: '', wizardSchool: 'Abjuration' };
        const longTbr = resolveWithRealData({
            trigger: TRIGGERS.ON_QUEST_COMPLETED,
            payload: TriggerPayload.questCompleted({ questType: 'genre_quest', tags: ['long-tbr'] }),
            baseReward: new Reward({ dollars: 15 }),
            state: emptyState(),
            formData
        });
        const other = resolveWithRealData({
            trigger: TRIGGERS.ON_QUEST_COMPLETED,
            payload: TriggerPayload.questCompleted({ questType: 'genre_quest', tags: [] }),
            baseReward: new Reward({ dollars: 15 }),
            state: emptyState(),
            formData
        });
        expect(longTbr.dollars).toBe(18);
        expect(other.dollars).toBe(15);
    });

    test('Enchantment grants a flat +10 XP against monsters', () => {
        const result = resolveWithRealData({
            trigger: TRIGGERS.ON_QUEST_COMPLETED,
            payload: TriggerPayload.questCompleted({ questType: 'dungeon_crawl', encounterType: 'Monster' }),
            baseReward: new Reward({ xp: 30, dollars: 15 }),
            state: emptyState(),
            formData: { keeperBackground: '', wizardSchool: 'Enchantment' }
        });
        expect(result.xp).toBe(40);
        expect(result.dollars).toBe(15);
    });

    test.each([
        ['Ward Against the Shroud', 5],
        ['Grand Dispelling', 10]
    ])('%s is a monthly activation that claims +$%i', (abilityName, dollars) => {
        const ability = loadJson('masteryAbilities.json')[abilityName];
        expect(ability.effects).toEqual([
            expect.objectContaining({
                trigger: TRIGGERS.ON_ACTIVATE,
                cooldown: 'monthly',
                modifier: { type: 'ACTIVATE', action: 'claim_dollar_bonus', dollars }
            })
        ]);
    });

    test('Empowered Bond (+$1) and Echo Chamber (+$3) raise an equipped familiar dollar bonus', () => {
        const adapterFor = (abilities) => ({
            state: {
                ...emptyState(),
                [STORAGE_KEYS.LEARNED_ABILITIES]: abilities,
                [STORAGE_KEYS.EQUIPPED_ITEMS]: [{ name: 'Coffee Elemental', type: 'Familiar' }]
            },
            formData: {}
        });
        const dollarsWith = (abilities) => RewardCalculator.calculateFinalRewards('♥ Organize the Stacks', 'Fantasy', {
            stateAdapter: adapterFor(abilities),
            quest: { type: '♥ Organize the Stacks', tags: ['cozy'] }
        }).dollars;

        expect(dollarsWith([])).toBe(17); // $15 + Coffee Elemental $2
        expect(dollarsWith(['Empowered Bond'])).toBe(18);
        expect(dollarsWith(['Echo Chamber'])).toBe(20);
        expect(dollarsWith(['Empowered Bond', 'Echo Chamber'])).toBe(21);
    });

    test('the familiar boost skips a familiar whose bonus did not fire, and non-familiar items', () => {
        const state = {
            ...emptyState(),
            [STORAGE_KEYS.LEARNED_ABILITIES]: ['Echo Chamber'],
            [STORAGE_KEYS.EQUIPPED_ITEMS]: [{ name: 'Coffee Elemental', type: 'Familiar' }, { name: 'Tome of Potential' }]
        };
        const result = RewardCalculator.calculateFinalRewards('♥ Organize the Stacks', 'Fantasy', {
            stateAdapter: { state, formData: {} },
            quest: { type: '♥ Organize the Stacks', tags: [], pageCountEffective: 450 }
        });
        expect(result.dollars).toBe(25); // $15 + Tome of Potential $10, no familiar boost
    });

    test.each([
        ["The Librarian's Hoard", { dollars: 20 }],
        ['Long Read Focus', { dollars: 3 }],
        ['Disjointed Perception', { dollars: 3 }],
        ["Librarian's Blessing", { dollars: 5 }],
        ['Enchanted Focus', { dollars: 2 }],
        ['Story Surge', { dollars: 2 }]
    ])('temporary buff %s pays %p', (buffName, rewardModifier) => {
        expect(loadJson('temporaryBuffs.json')[buffName].rewardModifier).toEqual(rewardModifier);
    });

    test('use-count buffs last for the spec number of quests', () => {
        const buffs = loadJson('temporaryBuffs.json');
        expect(buffs["Librarian's Blessing"].useCount).toBe(2);
        expect(buffs['Enchanted Focus'].useCount).toBe(3);
        expect(buffs['Story Surge'].useCount).toBe(5);
        // One quest card use, so marking it used does not pay its +$3 a second time
        expect(buffs['Long Read Focus'].useCount).toBe(1);
        expect(loadJson('temporaryBuffsFromRewards.json')['Long Read Focus']).toEqual(buffs['Long Read Focus']);
    });

    test('Unwavering Resolve auto-applies +$3 on books over 400 pages while active', () => {
        const state = emptyState();
        state[STORAGE_KEYS.TEMPORARY_BUFFS] = [{ name: 'Unwavering Resolve', status: 'active' }];
        const long = resolveWithRealData({
            trigger: TRIGGERS.ON_QUEST_COMPLETED,
            payload: TriggerPayload.questCompleted({ questType: 'genre_quest', pageCount: 420 }),
            baseReward: new Reward({ dollars: 15 }),
            state
        });
        const short = resolveWithRealData({
            trigger: TRIGGERS.ON_QUEST_COMPLETED,
            payload: TriggerPayload.questCompleted({ questType: 'genre_quest', pageCount: 200 }),
            baseReward: new Reward({ dollars: 15 }),
            state
        });
        expect(long.dollars).toBe(18);
        expect(short.dollars).toBe(15);
    });

    test('series stops pay dollars per the spec (stop 1 $15, stop 6 150 XP + $10)', () => {
        const stops = loadJson('seriesCompletionRewards.json').stops;
        expect(stops[0].reward).toMatchObject({ type: 'currency', xp: 0, dollars: 15 });
        expect(stops[5].reward).toMatchObject({ type: 'currency', xp: 150, dollars: 10 });
        expect(stops[6].reward.text).toContain('+$3');
    });
});
