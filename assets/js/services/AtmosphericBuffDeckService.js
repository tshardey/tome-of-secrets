/**
 * AtmosphericBuffDeckService - Handles atmospheric buff deck business logic
 * 
 * Determines which atmospheric buffs are available for drawing
 * based on whether they're currently active.
 */

import * as data from '../character-sheet/data.js';
import { STORAGE_KEYS } from '../character-sheet/storageKeys.js';

/**
 * Check if an atmospheric buff is currently active
 * @param {string} buffName - Atmospheric buff name
 * @param {Object} atmosphericBuffs - Atmospheric buffs state object
 * @returns {boolean} True if buff is active
 */
export function isAtmosphericBuffActive(buffName, atmosphericBuffs) {
    if (!atmosphericBuffs || typeof atmosphericBuffs !== 'object') {
        return false;
    }
    
    const buff = atmosphericBuffs[buffName];
    return buff && buff.isActive === true;
}

/**
 * Get available atmospheric buffs that can be drawn
 * A buff is available if it's not currently active
 * @param {Object} state - Character state object
 * @returns {Array<Object>} Array of available buff objects
 */
export function getAvailableAtmosphericBuffs(state) {
    const atmosphericBuffs = state[STORAGE_KEYS.ATMOSPHERIC_BUFFS] || {};
    const availableBuffs = [];
    
    if (!data.atmosphericBuffs) return availableBuffs;
    
    // Check each atmospheric buff
    for (const buffName in data.atmosphericBuffs) {
        const buff = data.atmosphericBuffs[buffName];
        const isActive = isAtmosphericBuffActive(buffName, atmosphericBuffs);
        
        // Buff is available if not currently active
        if (!isActive) {
            availableBuffs.push({
                name: buffName,
                ...buff
            });
        }
    }
    
    return availableBuffs;
}

/**
 * Randomly select an atmospheric buff from available buffs
 * @param {Array<Object>} availableBuffs - Array of available buff objects
 * @returns {Object|null} Randomly selected buff object, or null if no buffs available
 */
export function drawRandomAtmosphericBuff(availableBuffs) {
    if (!availableBuffs || availableBuffs.length === 0) {
        return null;
    }
    
    const randomIndex = Math.floor(Math.random() * availableBuffs.length);
    return availableBuffs[randomIndex];
}
