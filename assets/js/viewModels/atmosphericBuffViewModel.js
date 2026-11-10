/**
 * AtmosphericBuffViewModel - Creates view models for atmospheric buff rendering
 *
 * Transforms state + services into UI-ready data structure.
 * All calculations and business logic happen here, not in UI functions.
 */

import * as data from '../character-sheet/data.js';
import { STORAGE_KEYS } from '../character-sheet/storageKeys.js';
import {
    calculateDailyValue,
    isForcedAtmosphericBuff,
    calculateBuffTotal,
    getAssociatedBuffs,
    getBuffState,
    getAtmosphericDailyBonus,
    getTrackableAtmosphericItemValues
} from '../services/AtmosphericBuffService.js';

/**
 * Get item names that are equipped or in display (passive) slots and are atmospheric rewards.
 * @param {Object} state - Character state object
 * @returns {Array<{ name: string, bonus: string, trackable: boolean }>} Items with name, bonus, and whether they track days
 */
function getEquippedAtmosphericRewardItems(state) {
    const result = [];
    const seen = new Set();
    const add = (itemName) => {
        if (!itemName || seen.has(itemName)) return;
        const itemData = data.allItems?.[itemName];
        if (!itemData?.atmosphericReward) return;
        seen.add(itemName);
        result.push({
            name: itemName,
            bonus: itemData.bonus || itemData.passiveBonus || '',
            trackable: !!itemData.atmosphericRewardTrackable
        });
    };
    const equipped = state?.[STORAGE_KEYS.EQUIPPED_ITEMS];
    if (Array.isArray(equipped)) {
        equipped.forEach((item) => { add(item?.name); });
    }
    (state?.[STORAGE_KEYS.PASSIVE_ITEM_SLOTS] || []).forEach((slot) => { add(slot?.itemName); });
    (state?.[STORAGE_KEYS.PASSIVE_FAMILIAR_SLOTS] || []).forEach((slot) => { add(slot?.itemName); });
    return result;
}

/**
 * Create view model for atmospheric buffs rendering
 * @param {Object} state - Character state object
 * @param {string} selectedSanctum - Selected sanctum key
 * @param {string} background - Background key
 * @returns {Array<Object>} Array of buff view models (includes rows for atmospheric reward items when equipped/displayed)
 */
export function createAtmosphericBuffViewModel(state, selectedSanctum, background) {
    const associatedBuffs = getAssociatedBuffs(selectedSanctum);
    const atmosphericBuffsState = state.atmosphericBuffs || {};
    const { bonusPerDay } = getAtmosphericDailyBonus(state);
    const trackableItemValues = getTrackableAtmosphericItemValues(state);

    const buffViewModels = [];

    for (const buffName in data.atmosphericBuffs) {
        const buffData = data.atmosphericBuffs[buffName];
        const buffKey = buffData?.id || buffName;
        const buffState = getBuffState(state, buffKey);
        const isAssociated = associatedBuffs.includes(buffKey);
        const effectCtx = {
            state,
            formData: { keeperBackground: background || '', wizardSchool: '' }
        };
        const isGroveBuff = isForcedAtmosphericBuff(buffName, effectCtx, data);

        // Calculate daily value
        const dailyValue = calculateDailyValue(buffKey, associatedBuffs);

        // Determine if buff is active
        let isActive = buffState.isActive;
        if (isGroveBuff) {
            isActive = true; // Always active for Grove Tender
        }

        // Calculate total; an item's flat per-day bonus (e.g. Tome-Bound Cat +$1/day) is added to
        // each paying atmospheric buff day (not trackable setting-item days), matching RewardCalculator.calculateAtmosphericBuffRewards().
        let total = calculateBuffTotal(buffState.daysUsed, dailyValue);
        if (bonusPerDay > 0 && isActive && total > 0) {
            total += calculateBuffTotal(buffState.daysUsed, bonusPerDay);
        }

        // Determine if row should be highlighted
        const isHighlighted = isAssociated || isGroveBuff;

        buffViewModels.push({
            key: buffKey,
            name: buffName,
            dailyValue,
            daysUsed: buffState.daysUsed,
            isActive,
            total,
            isHighlighted,
            isGroveBuff,
            isAssociated,
            isDisabled: isGroveBuff, // Grove buff checkbox is disabled
            // Item per-day bonus (Tome-Bound Cat) the live total adds when days are edited
            dailyBonus: isActive ? bonusPerDay : 0
        });
    }

    // Append rows for equipped/displayed atmospheric reward items
    const atmosphericItems = getEquippedAtmosphericRewardItems(state);
    atmosphericItems.forEach(({ name, bonus, trackable }) => {
        if (trackable) {
            // Trackable items (Gilded Painting, Garden Gnome, Mystical Moth): days used + total like regular buffs.
            // Always active when equipped/displayed (user wants to use the ability).
            const itemState = atmosphericBuffsState[name] || {};
            const daysUsed = typeof itemState.daysUsed === 'number' && !isNaN(itemState.daysUsed) ? Math.max(0, itemState.daysUsed) : 0;
            const dailyValue = trackableItemValues[name] ?? 0;
            // No Cat per-day bonus here: it pays on atmospheric buff days only.
            const total = calculateBuffTotal(daysUsed, dailyValue);
            buffViewModels.push({
                key: name,
                name,
                dailyValue,
                daysUsed,
                isActive: true, // Equipped/displayed implies active
                total,
                isHighlighted: false,
                isGroveBuff: false,
                isAssociated: false,
                isDisabled: true, // Checkbox disabled; can't turn off while item is equipped/displayed
                isTrackableItem: true,
                dailyBonus: 0,
                bonus
            });
        } else {
            // Modifier item (e.g. Tome-Bound Cat): flat per-day bonus from getAtmosphericDailyBonus, no days tracked
            const bonusLabel = bonusPerDay > 0 ? `+$${bonusPerDay}/day` : '—';
            buffViewModels.push({
                key: name,
                name,
                dailyValue: bonusLabel,
                daysUsed: 0,
                isActive: true,
                total: bonusPerDay > 0 ? `+$${bonusPerDay} per paying day` : '—',
                isHighlighted: false,
                isGroveBuff: false,
                isAssociated: false,
                isDisabled: true,
                isModifierItem: true,
                modifierBonusPerDay: bonusPerDay,
                bonus
            });
        }
    });

    return buffViewModels;
}

