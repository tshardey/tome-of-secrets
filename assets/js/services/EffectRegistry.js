import { STORAGE_KEYS } from '../character-sheet/storageKeys.js';
import { validateEffect, MODIFIER_TYPES, TRIGGERS } from './effectSchema.js';

function normalizeStateAdapter(stateAdapter) {
    if (!stateAdapter) {
        return {};
    }
    return stateAdapter.state || stateAdapter;
}

function normalizeFormData(stateAdapter = {}, normalizedState = {}) {
    // Support both wrapper ({ state, formData }) and plain-state callers.
    return stateAdapter.formData || normalizedState.formData || {};
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
        const formData = normalizeFormData(stateAdapter, state);

        const allEffects = [];

        allEffects.push(...this._collectBackgroundEffects(trigger, state, stateAdapter, formData, dataModule));
        allEffects.push(...this._collectSchoolEffects(trigger, state, stateAdapter, formData, dataModule));
        allEffects.push(...this._collectAbilityEffects(trigger, state, dataModule));
        allEffects.push(...this._collectEquippedAndPassiveItemEffects(trigger, state, dataModule));
        allEffects.push(...this._collectTemporaryBuffEffects(trigger, state, dataModule));

        return allEffects;
    }

    static _collectBackgroundEffects(trigger, state, stateAdapter, formData, dataModule) {
        const background =
            state?.background ||
            state?.keeperBackground ||
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

    static _collectSchoolEffects(trigger, state, stateAdapter, formData, dataModule) {
        const school =
            state?.wizardSchool ||
            state?.school ||
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

    static _collectEquippedAndPassiveItemEffects(trigger, state, dataModule) {
        const catalog = dataModule.allItems || {};
        const effects = [];
        const seenItemKeys = new Set();

        const pushForItem = (rawName, itemSlot) => {
            if (!rawName || typeof rawName !== 'string') {
                return;
            }
            const item = findByIdOrName(catalog, rawName);
            const id = item?.id || rawName;
            const dedupeKey = `item:${id}:${itemSlot}`;
            if (seenItemKeys.has(dedupeKey)) {
                return;
            }
            seenItemKeys.add(dedupeKey);
            const source = {
                sourceType: 'item',
                id,
                name: item?.name || rawName
            };
            const collected = collectEffects(item?.effects, trigger, source);
            for (const entry of collected) {
                if (!entry.effect.slot || entry.effect.slot === itemSlot) {
                    effects.push(entry);
                }
            }
        };

        const equipped = state[STORAGE_KEYS.EQUIPPED_ITEMS] || [];
        for (const equippedItem of equipped) {
            const name = typeof equippedItem === 'string' ? equippedItem : equippedItem?.name;
            pushForItem(name, 'equipped');
        }

        const passiveItems = state[STORAGE_KEYS.PASSIVE_ITEM_SLOTS] || [];
        for (const slot of passiveItems) {
            pushForItem(slot?.itemName, 'passive');
        }

        const passiveFamiliars = state[STORAGE_KEYS.PASSIVE_FAMILIAR_SLOTS] || [];
        for (const slot of passiveFamiliars) {
            pushForItem(slot?.itemName, 'passive');
        }

        return effects;
    }

    static _collectTemporaryBuffEffects(trigger, state, dataModule) {
        const activeBuffs = state[STORAGE_KEYS.TEMPORARY_BUFFS] || [];
        const catalog = {
            ...(dataModule.temporaryBuffsFromRewards || {}),
            ...(dataModule.temporaryBuffs || {})
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

    /**
     * Atmospheric buffs that must stay active at month start (e.g. Grove Tender).
     * @param {Object} stateAdapter
     * @param {Object} dataModule
     * @returns {string[]}
     */
    static getForcedAtmosphericBuffNames(stateAdapter, dataModule = {}) {
        const entries = this.getActiveEffects(TRIGGERS.ON_MONTH_START, stateAdapter, dataModule);
        const names = [];
        for (const { effect } of entries) {
            const mod = effect?.modifier;
            if (
                mod?.type === MODIFIER_TYPES.ACTIVATE &&
                mod.action === 'force_atmospheric_buff' &&
                typeof mod.buffName === 'string' &&
                mod.buffName.length
            ) {
                names.push(mod.buffName);
            }
        }
        return names;
    }

    /**
     * Resolve the atmospheric buff IDs/names that receive a sanctum ON_MONTH_END multiplier.
     * Prefers structured sanctum effects and falls back to legacy associatedBuffs.
     * @param {string} sanctumIdOrName
     * @param {Object} dataModule
     * @returns {string[]}
     */
    static getSanctumAssociatedBuffIds(sanctumIdOrName, dataModule = {}) {
        if (!sanctumIdOrName) {
            return [];
        }

        const sanctumCatalog = dataModule.sanctumBenefits || {};
        const atmosphericCatalog = dataModule.atmosphericBuffs || {};
        const sanctum = findByIdOrName(sanctumCatalog, sanctumIdOrName);
        if (!sanctum) {
            return [];
        }

        const normalizeBuff = (buffNameOrId) => {
            const buff = findByIdOrName(atmosphericCatalog, buffNameOrId);
            return buff?.id || buffNameOrId;
        };

        const fromEffects = (sanctum.effects || [])
            .filter((effect) => effect?.trigger === TRIGGERS.ON_MONTH_END)
            .filter((effect) => effect?.modifier?.type === MODIFIER_TYPES.MULTIPLY)
            .filter((effect) => effect?.modifier?.resource === 'inkDrops')
            .filter((effect) => Number(effect?.modifier?.value) > 1)
            .map((effect) => effect?.condition?.hasAtmosphericBuff)
            .filter((buffNameOrId) => typeof buffNameOrId === 'string' && buffNameOrId.length)
            .map(normalizeBuff);

        if (fromEffects.length > 0) {
            return Array.from(new Set(fromEffects));
        }

        const legacy = (sanctum.associatedBuffs || [])
            .map(normalizeBuff)
            .filter(Boolean);
        return Array.from(new Set(legacy));
    }
}