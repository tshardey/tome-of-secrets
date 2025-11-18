/**
 * BaseQuestHandler - Abstract base class for quest type handlers
 * 
 * Each quest type (Dungeon, Genre, Side Quest, Extra Credit) should extend this
 * and implement the required methods.
 */

import { RewardCalculator, Reward } from '../services/RewardCalculator.js';
import { Validator, required, selected, conditional } from '../services/Validator.js';

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
     * Get base validator with common rules for all quest types
     * @returns {Validator} Validator instance with common rules
     */
    getBaseValidator() {
        const validator = new Validator();
        validator.addRule('month', required('Month is required'));
        validator.addRule('year', required('Year is required'));
        validator.addRule('book', required('Book title is required'));
        return validator;
    }

    /**
     * Get field map for error display
     * @returns {Object} Object mapping field names to DOM elements
     */
    getFieldMap() {
        return {
            month: this.formElements.monthInput,
            year: this.formElements.yearInput,
            book: this.formElements.bookInput,
            prompt: this.formElements.promptInput || 
                   this.formElements.genreQuestSelect || 
                   this.formElements.sideQuestSelect ||
                   this.formElements.dungeonRoomSelect
        };
    }

    /**
     * Validate form inputs for this quest type
     * @returns {Object} { valid: boolean, error: string, errors: Object }
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

    /**
     * Static helper to complete an active quest (recalculate rewards and finalize)
     * @param {Object} quest - Active quest to complete
     * @param {string} background - Background key
     * @returns {Object} Quest with finalized rewards
     */
    static completeActiveQuest(quest, background) {
        // Convert existing rewards to Reward object
        const baseRewards = new Reward(quest.rewards || { xp: 0, inkDrops: 0, paperScraps: 0, items: [] });
        
        let finalRewards = baseRewards;
        
        // Apply buff modifiers if any buffs are selected
        if (quest.buffs && quest.buffs.length > 0) {
            finalRewards = RewardCalculator.applyModifiers(baseRewards, quest.buffs);
        }
        
        // Always apply background bonuses (independent of buffs)
        finalRewards = RewardCalculator.applyBackgroundBonuses(finalRewards, quest, background);
        
        // Return quest with finalized rewards
        return {
            ...quest,
            rewards: finalRewards.toJSON()
        };
    }

    /**
     * Static helper to determine prompt based on quest type during editing
     * @param {string} type - Quest type
     * @param {Object} originalQuest - Original quest being edited
     * @param {Object} formElements - Form elements for quest input
     * @param {Object} data - Game data
     * @returns {string} The determined prompt
     */
    static determinePromptForEdit(type, originalQuest, formElements, data) {
        const {
            dungeonRoomSelect,
            dungeonEncounterSelect,
            dungeonActionToggle,
            genreQuestSelect,
            sideQuestSelect
        } = formElements;

        // Start with original prompt as default
        let prompt = originalQuest.prompt;

        switch (type) {
            case '♠ Dungeon Crawl':
                if (originalQuest.isEncounter && dungeonEncounterSelect.value) {
                    // It's an encounter quest
                    const roomNumber = dungeonRoomSelect.value;
                    const encounterName = dungeonEncounterSelect.value;
                    const encounterData = data.dungeonRooms[roomNumber].encounters[encounterName];
                    
                    if (encounterData.defeat && encounterData.befriend) {
                        prompt = dungeonActionToggle.checked ? encounterData.befriend : encounterData.defeat;
                    } else {
                        prompt = encounterData.defeat || encounterData.befriend;
                    }
                } else {
                    // It's a room challenge quest
                    const roomNumber = dungeonRoomSelect.value;
                    if (roomNumber) {
                        prompt = data.dungeonRooms[roomNumber].challenge;
                    }
                }
                break;

            case '⭐ Extra Credit':
                prompt = 'Book read outside of quest pool';
                break;

            case '♥ Organize the Stacks':
                prompt = genreQuestSelect.value;
                break;

            case '♣ Side Quest':
                prompt = sideQuestSelect.value;
                break;

            default:
                // For other quest types, use the manual prompt input
                prompt = formElements.promptInput ? formElements.promptInput.value : prompt;
                break;
        }

        return prompt;
    }
}

