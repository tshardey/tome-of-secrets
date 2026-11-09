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

    // TODO(Task 5): re-enable once keeperBackgrounds.json effects use resource "dollars"
    // (Archivist +$2, Cartographer +$3, Prophet +$3, Biblioslinker +$3 per the spec table).
    test.skip('background dollar effects from keeperBackgrounds.json apply', () => {
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

    // TODO(Task 5): re-enable once Silver Tongue pays +$1 per quest.
    test.skip('Silver Tongue from masteryAbilities.json adds +$1', () => {
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

    // TODO(Task 5): re-enable once Archivist pays +$2 (15 base + 2 = 17).
    test.skip('background bonus does not double-stack with legacy background buff cards', () => {
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
