import fs from 'node:fs';
import path from 'node:path';
import { Reward, RewardCalculator } from '../assets/js/services/RewardCalculator.js';
import { ModifierPipeline } from '../assets/js/services/ModifierPipeline.js';
import { EffectRegistry } from '../assets/js/services/EffectRegistry.js';
import { TriggerPayload } from '../assets/js/services/TriggerPayload.js';
import { TRIGGERS } from '../assets/js/services/effectSchema.js';
import { tryPreventWornPage } from '../assets/js/services/WornPagePrevention.js';
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
    test('ON_JOURNAL_ENTRY applies Librarian\'s Quill and Golden Pen from allItems.json', () => {
        const quillState = emptyState();
        quillState[STORAGE_KEYS.EQUIPPED_ITEMS] = [{ name: "Librarian's Quill" }];
        const quillResult = resolveWithRealData({
            trigger: TRIGGERS.ON_JOURNAL_ENTRY,
            payload: TriggerPayload.journalEntry({ entryCount: 3 }),
            baseReward: new Reward({ paperScraps: 0 }),
            state: quillState
        });
        expect(quillResult.paperScraps).toBe(6);
        expect(quillResult.modifiedBy).toContain("Librarian's Quill");

        const penState = emptyState();
        penState[STORAGE_KEYS.EQUIPPED_ITEMS] = [{ name: 'Golden Pen' }];
        const penResult = resolveWithRealData({
            trigger: TRIGGERS.ON_JOURNAL_ENTRY,
            payload: TriggerPayload.journalEntry({ entryCount: 2 }),
            baseReward: new Reward({ paperScraps: 0 }),
            state: penState
        });
        expect(penResult.paperScraps).toBe(20);
        expect(penResult.modifiedBy).toContain('Golden Pen');
    });

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

    test('background effects from keeperBackgrounds.json apply across all 6 backgrounds', () => {
        const scenarios = [
            {
                id: 'scribe',
                trigger: TRIGGERS.ON_JOURNAL_ENTRY,
                payload: TriggerPayload.journalEntry({ entryCount: 2 }),
                baseReward: new Reward({ paperScraps: 0 }),
                assert: (result) => expect(result.paperScraps).toBe(6),
                sourceName: "The Scribe's Acolyte"
            },
            {
                id: 'archivist',
                trigger: TRIGGERS.ON_QUEST_COMPLETED,
                payload: TriggerPayload.questCompleted({ questType: 'genre_quest', genre: 'Non-Fiction' }),
                baseReward: new Reward({ inkDrops: 0 }),
                assert: (result) => expect(result.inkDrops).toBe(10),
                sourceName: "The Archivist's Apprentice"
            },
            {
                id: 'cartographer',
                trigger: TRIGGERS.ON_QUEST_DRAFTED,
                payload: TriggerPayload.questDrafted({ questType: 'dungeon_crawl' }),
                baseReward: new Reward({ inkDrops: 0 }),
                assert: (result) => expect(result.inkDrops).toBe(15),
                sourceName: "The Cartographer's Guild"
            },
            {
                id: 'prophet',
                trigger: TRIGGERS.ON_QUEST_COMPLETED,
                payload: TriggerPayload.questCompleted({ questType: 'genre_quest', tags: ['mythological'] }),
                baseReward: new Reward({ inkDrops: 0 }),
                assert: (result) => expect(result.inkDrops).toBe(15),
                sourceName: 'The Cloistered Prophet'
            },
            {
                id: 'biblioslinker',
                trigger: TRIGGERS.ON_QUEST_COMPLETED,
                payload: TriggerPayload.questCompleted({ questType: 'dungeon_crawl' }),
                baseReward: new Reward({ paperScraps: 0 }),
                assert: (result) => expect(result.paperScraps).toBe(10),
                sourceName: 'The Biblioslinker'
            },
            {
                id: 'groveTender',
                trigger: TRIGGERS.ON_MONTH_START,
                payload: TriggerPayload.monthStart({ questPoolSize: 4 }),
                baseReward: new Reward({ inkDrops: 0 }),
                assert: (result) => {
                    expect(result.inkDrops).toBe(0);
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

        expect(result.xp).toBe(45);
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

        const silverState = emptyState();
        silverState[STORAGE_KEYS.LEARNED_ABILITIES] = ['Silver Tongue'];
        const silverResult = resolveWithRealData({
            trigger: TRIGGERS.ON_QUEST_COMPLETED,
            payload: TriggerPayload.questCompleted({ questType: 'genre_quest' }),
            baseReward: new Reward({ paperScraps: 0 }),
            state: silverState
        });
        expect(silverResult.paperScraps).toBe(5);
        expect(silverResult.modifiedBy).toContain('Silver Tongue');

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

    test('worn page prevention works with real school/ability/item data', () => {
        const dataModule = buildDataModule();
        const createStateAdapter = ({ wizardSchool = '', learnedAbilities = [], equippedItems = [] } = {}) => {
            const cooldowns = {};
            return {
                state: {
                    ...emptyState(),
                    [STORAGE_KEYS.LEARNED_ABILITIES]: learnedAbilities,
                    [STORAGE_KEYS.EQUIPPED_ITEMS]: equippedItems
                },
                formData: { keeperBackground: '', wizardSchool },
                isEffectCooldownAvailable(key, cadence, period) {
                    const entry = cooldowns[key];
                    if (!entry) return true;
                    return entry.month !== period.month || entry.year !== period.year;
                },
                consumeEffectCooldown(key, cadence, period) {
                    cooldowns[key] = { month: period.month, year: period.year };
                }
            };
        };

        const school = tryPreventWornPage({
            stateAdapter: createStateAdapter({ wizardSchool: 'Abjuration' }),
            dataModule,
            month: 'March',
            year: '2026'
        });
        expect(school.prevented).toBe(true);
        expect(school.sourceLabel).toBe('School of Abjuration');

        const ability = tryPreventWornPage({
            stateAdapter: createStateAdapter({ learnedAbilities: ['Ward Against the Shroud'] }),
            dataModule,
            month: 'March',
            year: '2026'
        });
        expect(ability.prevented).toBe(true);
        expect(ability.sourceLabel).toBe('Ward Against the Shroud');

        const raven = tryPreventWornPage({
            stateAdapter: createStateAdapter({ equippedItems: [{ name: 'Raven Familiar', type: 'Familiar' }] }),
            dataModule,
            month: 'March',
            year: '2026'
        });
        expect(raven.prevented).toBe(true);
        expect(raven.sourceLabel).toBe('Raven Familiar');

        const chalice = tryPreventWornPage({
            stateAdapter: createStateAdapter({ equippedItems: [{ name: 'Chalice of Restoration', type: 'Non-Wearable' }] }),
            dataModule,
            month: 'March',
            year: '2026'
        });
        expect(chalice.prevented).toBe(true);
        expect(chalice.sourceLabel).toBe('Chalice of Restoration');
    });

    test('background bonus does not double-stack with legacy background buff cards', () => {
        const result = RewardCalculator.calculateFinalRewards('♥ Organize the Stacks', 'Non-Fiction: archive study', {
            baseRewardOverride: new Reward({ inkDrops: 10 }),
            appliedBuffs: ['[Background] Archivist Bonus'],
            background: 'archivist',
            quest: { type: '♥ Organize the Stacks', genre: 'Non-Fiction' }
        });

        expect(result.inkDrops).toBe(20);
        expect(result.modifiedBy).toContain("The Archivist's Apprentice");
        expect(result.modifiedBy).not.toContain('Archivist Bonus');
    });
});
