import { STORAGE_KEYS } from '../character-sheet/storageKeys.js';
import { validateEffect } from './effectSchema.js';

function normalizeStateAdapter(stateAdapter) {
    if (!stateAdapter) {
        return {};
    }
    return stateAdapter.state || stateAdapter;
}

function normalizeFormData(stateAdapter = {}) {
    return stateAdapter.formData || {};
}

function findByIdOrName(collection = {}, idOrName) {
    if (!idOrName) {
        return null;
    }
    if (collection[idOrName]) {
        return collection[idOrName];
    }
    for (const value of Object.values(collection)) {
        if (value?.id === idOrName || value?.name === idOrName) {
            return value;
        }
    }
    return null;
}

function collectEffects(effects, trigger, source) {
    if (!Array.isArray(effects)) {
        return [];
    }

    return effects
        .filter(effect => effect?.trigger === trigger)
        .filter(effect => validateEffect(effect).valid)
        .map(effect => ({ effect, source }));
}

export class EffectRegistry {
    static getActiveEffects(trigger, stateAdapter, dataModule = {}) {
        const state = normalizeStateAdapter(stateAdapter);
        const formData = normalizeFormData(stateAdapter);

        const allEffects = [];

        allEffects.push(...this._collectBackgroundEffects(trigger, stateAdapter, formData, dataModule));
        allEffects.push(...this._collectSchoolEffects(trigger, stateAdapter, formData, dataModule));
        allEffects.push(...this._collectAbilityEffects(trigger, state, dataModule));
        allEffects.push(...this._collectItemEffects(trigger, state, dataModule));
        allEffects.push(...this._collectTemporaryBuffEffects(trigger, state, dataModule));

        return allEffects;
    }

    static _collectBackgroundEffects(trigger, stateAdapter, formData, dataModule) {
        const background =
            stateAdapter?.background ||
            formData.keeperBackground ||
            stateAdapter?.keeperBackground ||
            '';
        if (!background) {
            return [];
        }
        const catalog = dataModule.keeperBackgrounds || {};
        const sourceData = findByIdOrName(catalog, background);
        return collectEffects(sourceData?.effects, trigger, {
            sourceType: 'background',
            id: background,
            name: sourceData?.name || background
        });
    }

    static _collectSchoolEffects(trigger, stateAdapter, formData, dataModule) {
        const school =
            stateAdapter?.wizardSchool ||
            formData.wizardSchool ||
            stateAdapter?.school ||
            '';
        if (!school) {
            return [];
        }
        const catalog = dataModule.schoolBenefits || {};
        const sourceData = findByIdOrName(catalog, school);
        return collectEffects(sourceData?.effects, trigger, {
            sourceType: 'school',
            id: school,
            name: `School of ${school}`
        });
    }

    static _collectAbilityEffects(trigger, state, dataModule) {
        const learnedAbilities = state[STORAGE_KEYS.LEARNED_ABILITIES] || [];
        const catalog = dataModule.masteryAbilities || {};
        const effects = [];

        for (const abilityName of learnedAbilities) {
            const ability = findByIdOrName(catalog, abilityName);
            effects.push(
                ...collectEffects(ability?.effects, trigger, {
                    sourceType: 'ability',
                    id: ability?.id || abilityName,
                    name: ability?.name || abilityName
                })
            );
        }

        return effects;
    }

    static _collectItemEffects(trigger, state, dataModule) {
        const equipped = state[STORAGE_KEYS.EQUIPPED_ITEMS] || [];
        const catalog = dataModule.allItems || {};
        const effects = [];

        for (const equippedItem of equipped) {
            const name = typeof equippedItem === 'string' ? equippedItem : equippedItem?.name;
            const item = findByIdOrName(catalog, name);
            effects.push(
                ...collectEffects(item?.effects, trigger, {
                    sourceType: 'item',
                    id: item?.id || name,
                    name: item?.name || name
                })
            );
        }

        return effects;
    }

    static _collectTemporaryBuffEffects(trigger, state, dataModule) {
        const activeBuffs = state[STORAGE_KEYS.TEMPORARY_BUFFS] || [];
        const catalog = {
            ...(dataModule.temporaryBuffs || {}),
            ...(dataModule.temporaryBuffsFromRewards || {})
        };
        const effects = [];

        for (const buffEntry of activeBuffs) {
            if (buffEntry?.status && buffEntry.status !== 'active') {
                continue;
            }
            const name = typeof buffEntry === 'string' ? buffEntry : buffEntry?.name;
            const buff = findByIdOrName(catalog, name);
            effects.push(
                ...collectEffects(buff?.effects, trigger, {
                    sourceType: 'temporary_buff',
                    id: buff?.id || name,
                    name: buff?.name || name
                })
            );
        }

        return effects;
    }
}
