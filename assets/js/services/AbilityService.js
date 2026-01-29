/**
 * AbilityService - Handles ability-related calculations and data filtering
 */

import * as data from '../character-sheet/data.js';

/**
 * Get all learned abilities with their data
 * @param {Array<string>} learnedAbilityNames - Array of learned ability names
 * @returns {Array<{name: string, ability: Object}>} Array of learned abilities with data
 */
export function getLearnedAbilities(learnedAbilityNames = []) {
    return learnedAbilityNames
        .map(name => {
            const ability = data.masteryAbilities[name];
            return ability ? { name, ability } : null;
        })
        .filter(Boolean);
}

/**
 * Get all unlearned abilities (not in the learned list)
 * @param {Array<string>} learnedAbilityNames - Array of learned ability names
 * @returns {Array<{name: string, ability: Object}>} Array of unlearned abilities with data
 */
export function getUnlearnedAbilities(learnedAbilityNames = []) {
    const learnedSet = new Set(learnedAbilityNames);
    const unlearned = [];
    
    for (const name in data.masteryAbilities) {
        if (!learnedSet.has(name)) {
            const ability = data.masteryAbilities[name];
            if (ability) {
                unlearned.push({ name, ability });
            }
        }
    }
    
    return unlearned;
}

/**
 * Format ability option text for dropdown
 * @param {string} name - Ability name
 * @param {Object} ability - Ability data object
 * @returns {string} Formatted option text
 */
export function formatAbilityOptionText(name, ability) {
    return `${name} (${ability.school}, ${ability.cost} SMP)`;
}

