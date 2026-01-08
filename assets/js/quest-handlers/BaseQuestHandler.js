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
            bookAuthor: this.formElements.bookAuthorInput ? this.formElements.bookAuthorInput.value : '',
            notes: this.formElements.notesInput.value,
            status: this.formElements.statusSelect.value,
            selectedBuffs: Array.from(this.formElements.buffsSelect.selectedOptions).map(o => o.value),
            background: this.formElements.backgroundSelect ? this.formElements.backgroundSelect.value : '',
            wizardSchool: this.formElements.wizardSchoolSelect ? this.formElements.wizardSchoolSelect.value : ''
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
     * @param {string} wizardSchool - Wizard school key
     * @returns {Reward} Final rewards with all modifiers applied
     */
    calculateFinalRewards(baseRewards, quest, selectedBuffs, background, wizardSchool = null) {
        let finalRewards = baseRewards;

        // Apply buff modifiers if any buffs are selected
        if (selectedBuffs && selectedBuffs.length > 0) {
            finalRewards = RewardCalculator.applyModifiers(baseRewards, selectedBuffs);
        }

        // Always apply background bonuses (independent of buffs)
        finalRewards = RewardCalculator.applyBackgroundBonuses(finalRewards, quest, background);

        // Apply school bonuses
        if (wizardSchool) {
            finalRewards = RewardCalculator.applySchoolBonuses(finalRewards, quest, wizardSchool);
        }

        return finalRewards;
    }

    /**
     * Process quests for completion (apply modifiers and convert to JSON)
     * @param {Array} quests - Array of quest objects with base rewards
     * @param {Array} selectedBuffs - Selected buff/item names
     * @param {string} background - Background key
     * @param {string} wizardSchool - Wizard school key
     * @returns {Array} Quests with finalized rewards
     */
    processCompletedQuests(quests, selectedBuffs, background, wizardSchool = null) {
        return quests.map(quest => {
            const finalRewards = this.calculateFinalRewards(
                quest.rewards,
                quest,
                selectedBuffs,
                background,
                wizardSchool
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
     * @param {string} wizardSchool - Wizard school key
     * @returns {Object} Quest with finalized rewards
     */
    static completeActiveQuest(quest, background, wizardSchool = null) {
        // Recalculate base rewards from scratch to ensure receipt base values are correct
        // This is important because stored rewards are plain JSON objects that don't have receipt info
        let baseRewards = RewardCalculator.getBaseRewards(
            quest.type,
            quest.prompt || '',
            {
                isEncounter: quest.isEncounter || false,
                roomNumber: quest.roomNumber || null,
                encounterName: quest.encounterName || null,
                isBefriend: quest.isBefriend !== undefined ? quest.isBefriend : true
            }
        );
        
        // If recalculation resulted in a fallback reward (e.g., dungeon quest without roomNumber)
        // and we have stored rewards that look more complete, use stored rewards as base instead
        // This handles legacy quests and test cases that don't have full quest metadata
        if (quest.rewards && quest.type === '♠ Dungeon Crawl' && !quest.roomNumber) {
            // Check if we got a fallback reward (only default inkDrops, no XP/paperScraps)
            const isFallbackReward = baseRewards.inkDrops === 10 && 
                                     baseRewards.xp === 0 && 
                                     baseRewards.paperScraps === 0 &&
                                     baseRewards.blueprints === 0;
            
            // Check if stored rewards look like actual quest rewards (not just defaults)
            const storedHasContent = (quest.rewards.xp > 0 || quest.rewards.inkDrops > 0 || 
                                     quest.rewards.paperScraps > 0 || quest.rewards.blueprints > 0);
            
            if (isFallbackReward && storedHasContent) {
                // Use stored rewards as base, but create a proper Reward object with receipt
                baseRewards = new Reward({
                    xp: quest.rewards.xp || 0,
                    inkDrops: quest.rewards.inkDrops || 0,
                    paperScraps: quest.rewards.paperScraps || 0,
                    blueprints: quest.rewards.blueprints || 0,
                    items: quest.rewards.items || []
                });
                // Set receipt base values from the stored rewards
                baseRewards.receipt.base.xp = baseRewards.xp;
                baseRewards.receipt.base.inkDrops = baseRewards.inkDrops;
                baseRewards.receipt.base.paperScraps = baseRewards.paperScraps;
                baseRewards.receipt.base.blueprints = baseRewards.blueprints;
                baseRewards.receipt.final = { ...baseRewards.receipt.base };
            }
        }
        
        // Preserve any items that were already in the quest (e.g., from side quests)
        if (quest.rewards?.items && Array.isArray(quest.rewards.items)) {
            baseRewards.items = [...baseRewards.items, ...quest.rewards.items];
            // Remove duplicates while preserving order
            baseRewards.items = [...new Set(baseRewards.items)];
        }
        
        let finalRewards = baseRewards;
        
        // Apply buff modifiers if any buffs are selected
        if (quest.buffs && quest.buffs.length > 0) {
            finalRewards = RewardCalculator.applyModifiers(baseRewards, quest.buffs);
            // Preserve items after applying modifiers
            if (quest.rewards?.items && Array.isArray(quest.rewards.items)) {
                finalRewards.items = [...finalRewards.items, ...quest.rewards.items];
                finalRewards.items = [...new Set(finalRewards.items)];
            }
        }
        
        // Always apply background bonuses (independent of buffs)
        finalRewards = RewardCalculator.applyBackgroundBonuses(finalRewards, quest, background);
        
        // Apply school bonuses
        if (wizardSchool) {
            finalRewards = RewardCalculator.applySchoolBonuses(finalRewards, quest, wizardSchool);
        }
        
        // Get receipt before converting to JSON
        const receipt = finalRewards.getReceipt();
        
        // Return quest with finalized rewards and receipt
        return {
            ...quest,
            rewards: finalRewards.toJSON(),
            receipt: receipt // Store receipt for UI display
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

