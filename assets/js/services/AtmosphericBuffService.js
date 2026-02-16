/**
 * AtmosphericBuffService - Handles atmospheric buff calculations and logic
 */

import * as data from '../character-sheet/data.js';
import { STORAGE_KEYS } from '../character-sheet/storageKeys.js';

/**
 * Calculate daily value for an atmospheric buff
 * @param {string} buffName - Name of the atmospheric buff
 * @param {Array<string>} associatedBuffs - Array of buff names associated with the current sanctum
 * @returns {number} Daily value (1 or 2)
 */
export function calculateDailyValue(buffName, associatedBuffs = []) {
    return associatedBuffs.includes(buffName) ? 2 : 1;
}

/**
 * Check if a buff is always active due to Grove Tender background
 * @param {string} buffName - Name of the atmospheric buff
 * @param {string} background - Background key
 * @returns {boolean} True if buff is always active
 */
export function isGroveTenderBuff(buffName, background) {
    return background === 'groveTender' && buffName === 'The Soaking in Nature';
}

/**
 * Calculate total ink drops for an atmospheric buff
 * @param {number} daysUsed - Number of days the buff was used
 * @param {number} dailyValue - Daily value (1 or 2)
 * @returns {number} Total ink drops
 */
export function calculateTotalInkDrops(daysUsed, dailyValue) {
    return daysUsed * dailyValue;
}

/**
 * Get associated buffs for a sanctum
 * @param {string} sanctumKey - Sanctum key
 * @returns {Array<string>} Array of associated buff names
 */
export function getAssociatedBuffs(sanctumKey) {
    if (!sanctumKey || !data.sanctumBenefits[sanctumKey]) {
        return [];
    }
    return data.sanctumBenefits[sanctumKey].associatedBuffs || [];
}

/**
 * Get atmospheric buff state data
 * @param {Object} state - Character state object
 * @param {string} buffName - Name of the atmospheric buff
 * @returns {Object} Buff state data { daysUsed, isActive }
 */
export function getBuffState(state, buffName) {
    const atmosphericBuffs = state[STORAGE_KEYS.ATMOSPHERIC_BUFFS] || {};
    const buffState = atmosphericBuffs[buffName] || {};
    
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

