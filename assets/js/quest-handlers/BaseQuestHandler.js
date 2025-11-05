/**
 * BaseQuestHandler - Abstract base class for quest type handlers
 * 
 * Each quest type (Dungeon, Genre, Side Quest, Extra Credit) should extend this
 * and implement the required methods.
 */

import { RewardCalculator } from '../services/RewardCalculator.js';

export class BaseQuestHandler {
    /**
     * @param {Object} formElements - References to form elements
     * @param {Object} data - Game data (dungeonRooms, sideQuests, etc.)
     */
    constructor(formElements, data) {
        this.formElements = formElements;
        this.data = data;
    }

    /**
     * Get common form values used by all quest types
     * @returns {Object} Common quest data
     */
    getCommonFormData() {
        return {
            month: this.formElements.monthInput.value,
            year: this.formElements.yearInput.value,
            book: this.formElements.bookInput.value,
            notes: this.formElements.notesInput.value,
            status: this.formElements.statusSelect.value,
            selectedBuffs: Array.from(this.formElements.buffsSelect.selectedOptions).map(o => o.value),
            background: this.formElements.backgroundSelect ? this.formElements.backgroundSelect.value : ''
        };
    }

    /**
     * Validate form inputs for this quest type
     * @returns {Object} { valid: boolean, error: string }
     */
    validate() {
        throw new Error('validate() must be implemented by subclass');
    }

    /**
     * Create quest object(s) from form data
     * @returns {Array} Array of quest objects
     */
    createQuests() {
        throw new Error('createQuests() must be implemented by subclass');
    }

    /**
     * Calculate final rewards with modifiers and background bonuses
     * @param {Reward} baseRewards - Base rewards from RewardCalculator
     * @param {Object} quest - Quest object
     * @param {Array} selectedBuffs - Selected buff/item names
     * @param {string} background - Background key
     * @returns {Reward} Final rewards with all modifiers applied
     */
    calculateFinalRewards(baseRewards, quest, selectedBuffs, background) {
        let finalRewards = baseRewards;

        // Apply buff modifiers if any buffs are selected
        if (selectedBuffs && selectedBuffs.length > 0) {
            finalRewards = RewardCalculator.applyModifiers(baseRewards, selectedBuffs);
        }

        // Always apply background bonuses (independent of buffs)
        finalRewards = RewardCalculator.applyBackgroundBonuses(finalRewards, quest, background);

        return finalRewards;
    }

    /**
     * Process quests for completion (apply modifiers and convert to JSON)
     * @param {Array} quests - Array of quest objects with base rewards
     * @param {Array} selectedBuffs - Selected buff/item names
     * @param {string} background - Background key
     * @returns {Array} Quests with finalized rewards
     */
    processCompletedQuests(quests, selectedBuffs, background) {
        return quests.map(quest => {
            const finalRewards = this.calculateFinalRewards(
                quest.rewards,
                quest,
                selectedBuffs,
                background
            );
            return {
                ...quest,
                rewards: finalRewards.toJSON()
            };
        });
    }

    /**
     * Convert quests with Reward objects to plain JSON format
     * @param {Array} quests - Array of quest objects
     * @returns {Array} Quests with rewards converted to JSON
     */
    questsToJSON(quests) {
        return quests.map(quest => ({
            ...quest,
            rewards: quest.rewards.toJSON ? quest.rewards.toJSON() : quest.rewards
        }));
    }
}

