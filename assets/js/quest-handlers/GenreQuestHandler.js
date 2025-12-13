/**
 * GenreQuestHandler - Handles "Organize the Stacks" genre quests (♥)
 */

import { BaseQuestHandler } from './BaseQuestHandler.js';
import { RewardCalculator } from '../services/RewardCalculator.js';
import { selected } from '../services/Validator.js';

export class GenreQuestHandler extends BaseQuestHandler {
    constructor(formElements, data) {
        super(formElements, data);
        this.type = '♥ Organize the Stacks';
    }

    /**
     * Get field map for error display
     * @returns {Object} Object mapping field names to DOM elements
     */
    getFieldMap() {
        return {
            ...super.getFieldMap(),
            prompt: this.formElements.genreQuestSelect
        };
    }

    validate() {
        const validator = this.getBaseValidator();
        const common = this.getCommonFormData();
        
        // Genre quest prompt is required
        validator.addRule('prompt', selected('Please select a Genre Quest'));
        
        const data = {
            ...common,
            prompt: this.formElements.genreQuestSelect.value
        };

        const result = validator.validate(data);
        
        // For backwards compatibility, include error message
        if (!result.valid) {
            const firstError = Object.values(result.errors)[0];
            return {
                ...result,
                error: firstError
            };
        }

        return { ...result, error: null };
    }

    createQuests() {
        const common = this.getCommonFormData();
        const prompt = this.formElements.genreQuestSelect.value;

        const rewards = RewardCalculator.getBaseRewards(this.type, prompt);

        const quest = {
            month: common.month,
            year: common.year,
            type: this.type,
            prompt: prompt,
            book: common.book,
            bookAuthor: common.bookAuthor,
            notes: common.notes,
            rewards: rewards,
            buffs: common.selectedBuffs
        };

        // For active quests, just convert to JSON
        if (common.status === 'active') {
            return [this.questsToJSON([quest])[0]];
        }

        // For completed quests, apply modifiers
        if (common.status === 'completed') {
            return this.processCompletedQuests([quest], common.selectedBuffs, common.background, common.wizardSchool);
        }

        return [this.questsToJSON([quest])[0]];
    }
}

