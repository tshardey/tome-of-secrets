/**
 * AtmosphericBuffService - Handles atmospheric buff calculations and logic
 */

import * as data from '../character-sheet/data.js';
import { STORAGE_KEYS } from '../character-sheet/storageKeys.js';
import { EffectRegistry } from './EffectRegistry.js';
import { GAME_CONFIG } from '../config/gameConfig.js';

/**
 * Calculate daily value for an atmospheric buff
 * @param {string} buffName - Name of the atmospheric buff
 * @param {Array<string>} associatedBuffs - Array of buff names associated with the current sanctum
 * @returns {number} Daily value (GAME_CONFIG.atmospheric.baseValue, or sanctumBonus when associated)
 */
export function calculateDailyValue(buffName, associatedBuffs = []) {
    const buff = data.getAtmosphericBuff(buffName);
    const key = buff?.id || buffName;
    return (associatedBuffs.includes(key) || associatedBuffs.includes(buff?.name) || associatedBuffs.includes(buffName))
        ? GAME_CONFIG.atmospheric.sanctumBonus
        : GAME_CONFIG.atmospheric.baseValue;
}

/**
 * Buff is locked on (month-start forced) per EffectRegistry ON_MONTH_START / force_atmospheric_buff.
 * @param {string} buffName
 * @param {{ state?: Object, formData?: { keeperBackground?: string, wizardSchool?: string } }} stateAdapterLike - state + form selections
 * @param {Object} [dataModule]
 * @returns {boolean}
 */
export function isForcedAtmosphericBuff(buffName, stateAdapterLike, dataModule = data) {
    if (!buffName || !stateAdapterLike) return false;
    const names = EffectRegistry.getForcedAtmosphericBuffNames(stateAdapterLike, dataModule);
    return names.includes(buffName);
}

/**
 * @deprecated Use isForcedAtmosphericBuff with { state: {}, formData: { keeperBackground } }.
 */
export function isGroveTenderBuff(buffName, background) {
    return isForcedAtmosphericBuff(buffName, { state: {}, formData: { keeperBackground: background || '' } }, data);
}

/**
 * Calculate the total reward for an atmospheric buff.
 * Currency-agnostic: the resource is GAME_CONFIG.atmospheric.resource.
 * @param {number} daysUsed
 * @param {number} dailyValue
 * @returns {number}
 */
export function calculateBuffTotal(daysUsed, dailyValue) {
    return daysUsed * dailyValue;
}

/**
 * Get the atmospheric buff multiplier from equipped/displayed items (e.g. Tome-Bound Cat).
 * Reads atmosphericBuffMultiplier when item is equipped, passiveAtmosphericMultiplier when adopted (passive slot).
 * Equipped takes precedence if the same item could appear in both.
 * @param {Object} state - Character state object
 * @returns {{ multiplier: number, modifierItemName: string|null }} Multiplier to apply (1 if none) and name of item providing it (for modifier row)
 */
export function getAtmosphericBuffMultiplier(state) {
    let multiplier = 1;
    let modifierItemName = null;
    const allItems = data.allItems || {};

    const checkSlot = (itemName, isEquipped) => {
        const itemData = allItems[itemName];
        if (!itemData?.atmosphericReward) return;
        const value = isEquipped
            ? itemData.atmosphericBuffMultiplier
            : itemData.passiveAtmosphericMultiplier;
        if (typeof value === 'number' && value > 0 && value !== 1) {
            multiplier = value;
            modifierItemName = itemName;
        }
    };

    const equipped = state?.[STORAGE_KEYS.EQUIPPED_ITEMS];
    if (Array.isArray(equipped)) {
        equipped.forEach((item) => { checkSlot(item?.name, true); });
    }
    if (modifierItemName) return { multiplier, modifierItemName };

    const passiveItems = state?.[STORAGE_KEYS.PASSIVE_ITEM_SLOTS] || [];
    passiveItems.forEach((slot) => { checkSlot(slot?.itemName, false); });
    if (modifierItemName) return { multiplier, modifierItemName };

    const passiveFamiliars = state?.[STORAGE_KEYS.PASSIVE_FAMILIAR_SLOTS] || [];
    passiveFamiliars.forEach((slot) => { checkSlot(slot?.itemName, false); });

    return { multiplier, modifierItemName };
}

/**
 * Get associated buffs for a sanctum
 * @param {string} sanctumKey - Sanctum key
 * @returns {Array<string>} Array of associated buff names
 */
export function getAssociatedBuffs(sanctumKey) {
    if (!sanctumKey) {
        return [];
    }
    return EffectRegistry.getSanctumAssociatedBuffIds(sanctumKey, data);
}

/**
 * Get atmospheric buff state data
 * @param {Object} state - Character state object
 * @param {string} buffName - Name of the atmospheric buff
 * @returns {Object} Buff state data { daysUsed, isActive }
 */
export function getBuffState(state, buffName) {
    const atmosphericBuffs = state[STORAGE_KEYS.ATMOSPHERIC_BUFFS] || {};
    const buff = data.getAtmosphericBuff(buffName);
    const buffKey = buff?.id || buffName;
    const buffState = atmosphericBuffs[buffKey] || atmosphericBuffs[buffName] || {};
    
    return {
        daysUsed: buffState.daysUsed || 0,
        isActive: buffState.isActive || false
    };
}

/**
 * Check if an item should be excluded from quest bonus cards
 * Items that modify atmospheric buffs (atmosphericReward) or are marked for exclusion
 * should not appear in the monthly quest tracker / quest creation and edit menus.
 * @param {Object} itemData - Item data object from allItems
 * @returns {boolean} True if item should be excluded from quest bonuses
 */
export function shouldExcludeFromQuestBonuses(itemData) {
    if (!itemData) return false;

    // Atmospheric rewards are environment/atmosphere only, not quest buffs
    if (itemData.atmosphericReward === true) {
        return true;
    }

    // Check explicit exclusion flag (if explicitly false, don't exclude)
    if (itemData.excludeFromQuestBonuses === true) {
        return true;
    }
    if (itemData.excludeFromQuestBonuses === false) {
        return false;
    }

    // Check if item type is "Quest" (like The Grand Key)
    if (itemData.type === 'Quest') {
        return true;
    }

    // Check if bonus or passiveBonus mentions atmospheric buffs (backward compatibility)
    // Only check if excludeFromQuestBonuses is not explicitly set
    const bonus = (itemData.bonus || '').toLowerCase();
    const passiveBonus = (itemData.passiveBonus || '').toLowerCase();

    return bonus.includes('atmospheric') || passiveBonus.includes('atmospheric');
}

/**
 * Per-day reward value for each equipped or displayed trackable atmospheric item
 * (Gilded Painting, Garden Gnome, Mystical Moth).
 *
 * Equipped items use `rewardModifier`, display/adoption slots use `passiveRewardModifier`,
 * both keyed by GAME_CONFIG.atmospheric.resource. Equipped wins when an item appears in both.
 *
 * @param {Object} state - Character state object
 * @param {Object} [dataModule]
 * @returns {Object<string, number>} Map of item name to per-day value
 */
export function getTrackableAtmosphericItemValues(state, dataModule = data) {
    const values = {};
    const allItems = dataModule.allItems || {};
    const resource = GAME_CONFIG.atmospheric.resource;

    const add = (itemName, isEquipped) => {
        if (!itemName || values[itemName] !== undefined) return;
        const itemData = allItems[itemName];
        if (!itemData?.atmosphericReward || !itemData?.atmosphericRewardTrackable) return;
        const modifier = isEquipped ? itemData.rewardModifier : itemData.passiveRewardModifier;
        const value = modifier?.[resource];
        if (typeof value === 'number' && value > 0) {
            values[itemName] = value;
        }
    };

    const equipped = state?.[STORAGE_KEYS.EQUIPPED_ITEMS];
    if (Array.isArray(equipped)) {
        equipped.forEach((item) => { add(item?.name, true); });
    }
    (state?.[STORAGE_KEYS.PASSIVE_ITEM_SLOTS] || []).forEach((slot) => { add(slot?.itemName, false); });
    (state?.[STORAGE_KEYS.PASSIVE_FAMILIAR_SLOTS] || []).forEach((slot) => { add(slot?.itemName, false); });

    return values;
}
