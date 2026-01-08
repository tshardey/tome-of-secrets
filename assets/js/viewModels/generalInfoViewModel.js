/**
 * GeneralInfoViewModel - Creates view models for general info rendering
 * 
 * Simple view models for benefit displays (background, school, sanctum) and permanent bonuses.
 */

import * as data from '../character-sheet/data.js';
import { keeperBackgrounds } from '../character-sheet/data.js';

/**
 * Create view model for permanent bonuses based on level
 * @param {number} currentLevel - Current character level
 * @returns {Object} View model for permanent bonuses
 */
export function createPermanentBonusesViewModel(currentLevel) {
    const bonuses = [];
    
    for (const level in data.permanentBonuses) {
        if (currentLevel >= parseInt(level, 10)) {
            bonuses.push({
                level: parseInt(level, 10),
                content: data.permanentBonuses[level]
            });
        }
    }
    
    return {
        bonuses,
        hasBonuses: bonuses.length > 0,
        currentLevel
    };
}

/**
 * Create view model for benefits (background, school, sanctum)
 * @param {string} selectedBackground - Selected background key
 * @param {string} selectedSchool - Selected wizard school key
 * @param {string} selectedSanctum - Selected sanctum key
 * @returns {Object} View model for benefits display
 */
export function createBenefitsViewModel(selectedBackground, selectedSchool, selectedSanctum) {
    const background = selectedBackground && keeperBackgrounds[selectedBackground] 
        ? keeperBackgrounds[selectedBackground] 
        : null;
    
    const school = selectedSchool && data.schoolBenefits[selectedSchool] 
        ? data.schoolBenefits[selectedSchool] 
        : null;
    
    const sanctum = selectedSanctum && data.sanctumBenefits[selectedSanctum] 
        ? data.sanctumBenefits[selectedSanctum] 
        : null;
    
    return {
        background: {
            hasSelection: !!background,
            description: background?.description || '-- Select a background to see its description --',
            benefit: background?.benefit || '-- Select a background to see its benefit --'
        },
        school: {
            hasSelection: !!school,
            description: school?.description || '-- Select a school to see its description --',
            benefit: school?.benefit || '-- Select a school to see its benefit --'
        },
        sanctum: {
            hasSelection: !!sanctum,
            description: sanctum?.description || '-- Select a sanctum to see its description --',
            benefit: sanctum?.benefit || '-- Select a sanctum to see its benefit --'
        }
    };
}

