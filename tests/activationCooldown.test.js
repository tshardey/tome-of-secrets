import fs from 'node:fs';
import path from 'node:path';
import { ModifierPipeline } from '../assets/js/services/ModifierPipeline.js';
import { EffectRegistry } from '../assets/js/services/EffectRegistry.js';
import { Reward } from '../assets/js/services/RewardCalculator.js';
import { TRIGGERS } from '../assets/js/services/effectSchema.js';
import { STORAGE_KEYS, createEmptyCharacterState } from '../assets/js/character-sheet/storageKeys.js';
import { StateAdapter } from '../assets/js/character-sheet/stateAdapter.js';

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

function resolveActivations({ state, formData = {}, month, year, payload = {} }) {
    const stateAdapter = new StateAdapter(state);
    const data = buildDataModule();
    const effects = EffectRegistry.getActiveEffects(
        TRIGGERS.ON_ACTIVATE,
        { state, formData },
        data
    );
    const result = ModifierPipeline.resolve(
        TRIGGERS.ON_ACTIVATE,
        { month, year, stateAdapter, ...payload },
        effects,
        new Reward()
    );
    const activationMods = (result.receipt?.modifiers || []).filter(
        mod => mod?.type === 'effect:activate'
    );
    return { stateAdapter, activationMods };
}

function getActivationByAction(modifiers, action) {
    return modifiers.find(mod => mod.action === action);
}

function consumeActivation(stateAdapter, activation, month, year) {
    const cadence = activation?.cooldown || 'monthly';
    const key = activation?.cooldownKey || '';
    if (!key) {
        return false;
    }
    return stateAdapter.consumeEffectCooldown(key, cadence, { month, year });
}

describe('Activation and cooldown behavior', () => {
    test('basic activation + cooldown enforcement for Evocation', () => {
        const state = createEmptyCharacterState();
        const formData = { keeperBackground: '', wizardSchool: 'Evocation' };
        const month = 'March';
        const year = '2026';

        const first = resolveActivations({ state, formData, month, year });
        const evocationFirst = getActivationByAction(
            first.activationMods,
            'complete_two_quests_one_book'
        );
        expect(evocationFirst).toBeDefined();
        expect(evocationFirst.eligible).toBe(true);

        const consumed = consumeActivation(first.stateAdapter, evocationFirst, month, year);
        expect(consumed).toBe(true);

        const second = resolveActivations({ state, formData, month, year });
        const evocationSecond = getActivationByAction(
            second.activationMods,
            'complete_two_quests_one_book'
        );
        expect(evocationSecond.eligible).toBe(false);
        expect(evocationSecond.reason).toBe('Already used for March 2026');
    });

    test('monthly cooldown resets at month boundary', () => {
        const state = createEmptyCharacterState();
        const formData = { keeperBackground: '', wizardSchool: 'Transmutation' };

        const march = resolveActivations({
            state,
            formData,
            month: 'March',
            year: '2026'
        });
        const transmuteMarch = getActivationByAction(
            march.activationMods,
            'transmute_currency'
        );
        expect(transmuteMarch.eligible).toBe(true);
        consumeActivation(march.stateAdapter, transmuteMarch, 'March', '2026');

        const april = resolveActivations({
            state,
            formData,
            month: 'April',
            year: '2026'
        });
        const transmuteApril = getActivationByAction(
            april.activationMods,
            'transmute_currency'
        );
        expect(transmuteApril.eligible).toBe(true);
    });

    test('cooldown state persists across save/load', () => {
        const state = createEmptyCharacterState();
        state[STORAGE_KEYS.EQUIPPED_ITEMS] = [{ name: 'The Scepter of Knowledge' }];
        const month = 'March';
        const year = '2026';

        const beforeSave = resolveActivations({ state, month, year });
        const scepterBeforeSave = getActivationByAction(
            beforeSave.activationMods,
            'ignore_prompt_read_nonfiction'
        );
        expect(scepterBeforeSave.eligible).toBe(true);
        consumeActivation(beforeSave.stateAdapter, scepterBeforeSave, month, year);

        const saved = JSON.parse(JSON.stringify(state));
        const reloadedState = JSON.parse(JSON.stringify(saved));
        const afterReload = resolveActivations({
            state: reloadedState,
            month,
            year
        });
        const scepterAfterReload = getActivationByAction(
            afterReload.activationMods,
            'ignore_prompt_read_nonfiction'
        );
        expect(scepterAfterReload.eligible).toBe(false);
        expect(scepterAfterReload.reason).toBe('Already used for March 2026');
    });

    test('multiple activated effects maintain independent cooldowns', () => {
        const state = createEmptyCharacterState();
        state[STORAGE_KEYS.EQUIPPED_ITEMS] = [{ name: 'The Scepter of Knowledge' }];
        const formData = { keeperBackground: '', wizardSchool: 'Evocation' };
        const month = 'March';
        const year = '2026';

        const initial = resolveActivations({ state, formData, month, year });
        const evocation = getActivationByAction(
            initial.activationMods,
            'complete_two_quests_one_book'
        );
        const scepter = getActivationByAction(
            initial.activationMods,
            'ignore_prompt_read_nonfiction'
        );
        expect(evocation.eligible).toBe(true);
        expect(scepter.eligible).toBe(true);

        consumeActivation(initial.stateAdapter, evocation, month, year);
        const afterEvocation = resolveActivations({ state, formData, month, year });
        const evocationAfter = getActivationByAction(
            afterEvocation.activationMods,
            'complete_two_quests_one_book'
        );
        const scepterAfterEvocation = getActivationByAction(
            afterEvocation.activationMods,
            'ignore_prompt_read_nonfiction'
        );
        expect(evocationAfter.eligible).toBe(false);
        expect(scepterAfterEvocation.eligible).toBe(true);

        consumeActivation(afterEvocation.stateAdapter, scepterAfterEvocation, month, year);
        const afterBoth = resolveActivations({ state, formData, month, year });
        const evocationAfterBoth = getActivationByAction(
            afterBoth.activationMods,
            'complete_two_quests_one_book'
        );
        const scepterAfterBoth = getActivationByAction(
            afterBoth.activationMods,
            'ignore_prompt_read_nonfiction'
        );
        expect(evocationAfterBoth.eligible).toBe(false);
        expect(scepterAfterBoth.eligible).toBe(false);
    });

    test('mastery ON_ACTIVATE abilities are discoverable and honor cooldowns', () => {
        const state = createEmptyCharacterState();
        state[STORAGE_KEYS.LEARNED_ABILITIES] = [
            'Quick Shot',
            'Concussive Blast',
            'Irresistible Charm'
        ];
        const month = 'March';
        const year = '2026';

        const first = resolveActivations({
            state,
            month,
            year,
            payload: { questType: 'dungeon_crawl' }
        });
        const quickShot = getActivationByAction(
            first.activationMods,
            'same_book_room_and_encounter'
        );
        const concussiveBlast = getActivationByAction(
            first.activationMods,
            'complete_adjacent_quest'
        );
        const irresistibleCharm = getActivationByAction(
            first.activationMods,
            'auto_complete_encounter'
        );

        expect(quickShot).toBeDefined();
        expect(concussiveBlast).toBeDefined();
        expect(irresistibleCharm).toBeDefined();
        expect(quickShot.eligible).toBe(true);
        expect(concussiveBlast.eligible).toBe(true);
        expect(irresistibleCharm.eligible).toBe(true);

        consumeActivation(first.stateAdapter, quickShot, month, year);

        const second = resolveActivations({
            state,
            month,
            year,
            payload: { questType: 'dungeon_crawl' }
        });
        const quickShotSecond = getActivationByAction(
            second.activationMods,
            'same_book_room_and_encounter'
        );
        const concussiveBlastSecond = getActivationByAction(
            second.activationMods,
            'complete_adjacent_quest'
        );
        const irresistibleCharmSecond = getActivationByAction(
            second.activationMods,
            'auto_complete_encounter'
        );

        expect(quickShotSecond.eligible).toBe(false);
        expect(concussiveBlastSecond.eligible).toBe(true);
        expect(irresistibleCharmSecond.eligible).toBe(true);
    });
});
