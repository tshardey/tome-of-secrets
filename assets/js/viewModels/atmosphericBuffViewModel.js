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
    isGroveTenderBuff,
    calculateTotalInkDrops,
    getAssociatedBuffs,
    getBuffState
} from '../services/AtmosphericBuffService.js';

/**
 * Get the atmospheric buff multiplier from equipped/displayed items (e.g. Tome-Bound Cat).
 * Reads atmosphericBuffMultiplier when item is equipped, passiveAtmosphericMultiplier when adopted (passive slot).
 * Equipped takes precedence if the same item could appear in both.
 * @param {Object} state - Character state object
 * @returns {{ multiplier: number, modifierItemName: string|null }} Multiplier to apply (1 if none) and name of item providing it (for modifier row)
 */
function getAtmosphericBuffMultiplier(state) {
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
    const { multiplier: atmosphericMultiplier } = getAtmosphericBuffMultiplier(state);

    const buffViewModels = [];

    for (const buffName in data.atmosphericBuffs) {
        const buffState = getBuffState(state, buffName);
        const isAssociated = associatedBuffs.includes(buffName);
        const isGroveBuff = isGroveTenderBuff(buffName, background);

        // Calculate daily value
        const dailyValue = calculateDailyValue(buffName, associatedBuffs);

        // Determine if buff is active
        let isActive = buffState.isActive;
        if (isGroveBuff) {
            isActive = true; // Always active for Grove Tender
        }

        // Calculate total; apply multiplier from item data (e.g. Tome-Bound Cat x2 equipped or x1.5 adopted)
        let total = calculateTotalInkDrops(buffState.daysUsed, dailyValue);
        if (atmosphericMultiplier !== 1 && isActive && total > 0) {
            total = Math.floor(total * atmosphericMultiplier);
        }

        // Determine if row should be highlighted
        const isHighlighted = isAssociated || isGroveBuff;

        buffViewModels.push({
            name: buffName,
            dailyValue,
            daysUsed: buffState.daysUsed,
            isActive,
            total,
            isHighlighted,
            isGroveBuff,
            isAssociated,
            isDisabled: isGroveBuff // Grove buff checkbox is disabled
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
            const dailyValue = 1;
            let total = calculateTotalInkDrops(daysUsed, dailyValue);
            if (atmosphericMultiplier !== 1 && total > 0) {
                total = Math.floor(total * atmosphericMultiplier);
            }
            buffViewModels.push({
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
                bonus
            });
        } else {
            // Modifier item (e.g. Tome-Bound Cat): multiplier from getAtmosphericBuffMultiplier, no days tracked
            const multLabel = atmosphericMultiplier !== 1 ? `x${atmosphericMultiplier}` : '—';
            buffViewModels.push({
                name,
                dailyValue: multLabel,
                daysUsed: 0,
                isActive: true,
                total: atmosphericMultiplier !== 1 ? `x${atmosphericMultiplier} to active buffs` : '—',
                isHighlighted: false,
                isGroveBuff: false,
                isAssociated: false,
                isDisabled: true,
                isModifierItem: true,
                modifierMultiplier: atmosphericMultiplier,
                bonus
            });
        }
    });

    return buffViewModels;
}

