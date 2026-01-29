/**
 * SlotService - Handles slot limit calculations and slot-related logic
 */

import * as data from '../character-sheet/data.js';
import { parseIntOr } from '../utils/helpers.js';

/**
 * Calculate slot limits from form input values
 * @param {HTMLInputElement} wearableSlotsInput - Wearable slots input element
 * @param {HTMLInputElement} nonWearableSlotsInput - Non-wearable slots input element
 * @param {HTMLInputElement} familiarSlotsInput - Familiar slots input element
 * @returns {Object} Slot limits object with Wearable, Non-Wearable, Familiar, and total
 */
export function getSlotLimits(wearableSlotsInput, nonWearableSlotsInput, familiarSlotsInput) {
    const wearable = parseIntOr(wearableSlotsInput?.value, 0);
    const nonWearable = parseIntOr(nonWearableSlotsInput?.value, 0);
    const familiar = parseIntOr(familiarSlotsInput?.value, 0);
    return { 
        'Wearable': wearable, 
        'Non-Wearable': nonWearable, 
        'Familiar': familiar, 
        'total': wearable + nonWearable + familiar 
    };
}

/**
 * Calculate expected total slots from level
 * @param {number} level - Current character level
 * @returns {number} Expected total slots (base 3 at level 1, plus level rewards)
 */
export function calculateExpectedTotalSlots(level) {
    let expectedTotalSlots = 3; // Starting slots at level 1
    if (data.levelRewards && level > 1) {
        for (let levelNum = 2; levelNum <= level; levelNum++) {
            const levelStr = String(levelNum);
            const rewards = data.levelRewards[levelStr];
            if (rewards && rewards.inventorySlot) {
                expectedTotalSlots += rewards.inventorySlot;
            }
        }
    }
    return expectedTotalSlots;
}

/**
 * Calculate unallocated slots
 * @param {number} currentTotalSlots - Current total slots from form
 * @param {number} expectedTotalSlots - Expected total slots from level
 * @returns {number} Number of unallocated slots
 */
export function calculateUnallocatedSlots(currentTotalSlots, expectedTotalSlots) {
    return Math.max(0, expectedTotalSlots - currentTotalSlots);
}

