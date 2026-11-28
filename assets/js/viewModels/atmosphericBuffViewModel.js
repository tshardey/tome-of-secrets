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
    atmosphericBuffCountsForReward,
    getAssociatedBuffs,
    getBuffState,
    getAtmosphericDailyBonus,
    getAtmosphericDailyBonusSources,
    getLevelAtmosphericDailyBonus,
    sumAtmosphericDailyBonuses,
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
 * @param {number} [level=1] - Character's current level (Focused Atmosphere)
 * @returns {Array<Object>} Array of buff view models (includes rows for atmospheric reward items when equipped/displayed,
 *   and a modifier row for Focused Atmosphere at the required level)
 */
export function createAtmosphericBuffViewModel(state, selectedSanctum, background, level = 1) {
    const associatedBuffs = getAssociatedBuffs(selectedSanctum);
    const atmosphericBuffsState = state.atmosphericBuffs || {};
    // Same per-day sources End of Month pays (Tome-Bound Cat, Focused Atmosphere); they stack.
    const dailyBonusPerDay = sumAtmosphericDailyBonuses(getAtmosphericDailyBonusSources(state, { level }));
    const { bonusPerDay } = getAtmosphericDailyBonus(state);
    const levelBonus = getLevelAtmosphericDailyBonus(level);
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

        // Total shows only what End of Month pays (same rule as RewardCalculator.calculateAtmosphericBuffRewards()):
        // an inactive row keeps its entered days but totals 0. Flat per-day bonuses
        // (Tome-Bound Cat, Focused Atmosphere) are added to each paying atmospheric buff day.
        const isCounted = atmosphericBuffCountsForReward({
            daysUsed: buffState.daysUsed,
            isActive: buffState.isActive,
            isForced: isGroveBuff
        });
        let total = 0;
        if (isCounted) {
            total = calculateBuffTotal(buffState.daysUsed, dailyValue);
            if (dailyBonusPerDay > 0 && total > 0) {
                total += calculateBuffTotal(buffState.daysUsed, dailyBonusPerDay);
            }
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
            isCounted
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
            // No per-day bonuses here (Cat, Focused Atmosphere): they pay on atmospheric buff days only.
            const isCounted = atmosphericBuffCountsForReward({ daysUsed, isTrackableItem: true });
            const total = isCounted ? calculateBuffTotal(daysUsed, dailyValue) : 0;
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
                isCounted,
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

    // Focused Atmosphere (level permanent bonus): its own named modifier row, rendered like the Cat's.
    if (levelBonus) {
        buffViewModels.push({
            key: levelBonus.source,
            name: levelBonus.source,
            dailyValue: `+$${levelBonus.bonusPerDay}/day`,
            daysUsed: 0,
            isActive: true,
            total: `+$${levelBonus.bonusPerDay} per paying day`,
            isHighlighted: false,
            isGroveBuff: false,
            isAssociated: false,
            isDisabled: true,
            isModifierItem: true,
            isLevelBonus: true,
            modifierBonusPerDay: levelBonus.bonusPerDay,
            bonus: 'Permanent level bonus'
        });
    }

    return buffViewModels;
}

