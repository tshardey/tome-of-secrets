/**
 * AbilityViewModel - Creates view models for ability rendering
 * 
 * Transforms state + services into UI-ready data structure.
 * All calculations and business logic happen here, not in UI functions.
 */

import { 
    getLearnedAbilities, 
    getUnlearnedAbilities, 
    formatAbilityOptionText 
} from '../services/AbilityService.js';
import { STORAGE_KEYS } from '../character-sheet/storageKeys.js';

/**
 * Create view model for abilities rendering
 * @param {Object} state - Character state object
 * @param {number} currentSmp - Current School Mastery Points
 * @returns {Object} View model for abilities rendering
 */
export function createAbilityViewModel(state, currentSmp) {
    const learnedAbilityNames = state[STORAGE_KEYS.LEARNED_ABILITIES] || [];
    
    // Get learned and unlearned abilities
    const learnedAbilities = getLearnedAbilities(learnedAbilityNames);
    const unlearnedAbilities = getUnlearnedAbilities(learnedAbilityNames);
    
    // Format unlearned abilities for dropdown
    const unlearnedOptions = unlearnedAbilities.map(({ name, ability }) => ({
        value: name,
        text: formatAbilityOptionText(name, ability),
        cost: ability.cost,
        school: ability.school
    }));
    
    return {
        currentSmp,
        learnedAbilities: learnedAbilities.map(({ name, ability }, index) => ({
            name,
            ability,
            index
        })),
        unlearnedOptions,
        hasLearnedAbilities: learnedAbilities.length > 0,
        hasUnlearnedAbilities: unlearnedAbilities.length > 0
    };
}

