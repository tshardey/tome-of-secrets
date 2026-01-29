/**
 * AtmosphericBuffViewModel - Creates view models for atmospheric buff rendering
 * 
 * Transforms state + services into UI-ready data structure.
 * All calculations and business logic happen here, not in UI functions.
 */

import * as data from '../character-sheet/data.js';
import {
    calculateDailyValue,
    isGroveTenderBuff,
    calculateTotalInkDrops,
    getAssociatedBuffs,
    getBuffState
} from '../services/AtmosphericBuffService.js';

/**
 * Create view model for atmospheric buffs rendering
 * @param {Object} state - Character state object
 * @param {string} selectedSanctum - Selected sanctum key
 * @param {string} background - Background key
 * @returns {Array<Object>} Array of buff view models
 */
export function createAtmosphericBuffViewModel(state, selectedSanctum, background) {
    const associatedBuffs = getAssociatedBuffs(selectedSanctum);
    const atmosphericBuffs = state.atmosphericBuffs || {};
    
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
        
        // Calculate total
        const total = calculateTotalInkDrops(buffState.daysUsed, dailyValue);
        
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
    
    return buffViewModels;
}

