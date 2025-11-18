/**
 * StandardQuestHandler - Handles standard quest types (Book Review, etc.)
 * 
 * Standard quests use a manual prompt input field.
 */

import { BaseQuestHandler } from './BaseQuestHandler.js';
import { RewardCalculator } from '../services/RewardCalculator.js';
import { required } from '../services/Validator.js';

export class StandardQuestHandler extends BaseQuestHandler {
    constructor(formElements, data) {
        super(formElements, data);
        this.type = formElements.questType || '';
    }

    /**
     * Get field map for error display
     * @returns {Object} Object mapping field names to DOM elements
     */
    getFieldMap() {
        return {
            ...super.getFieldMap(),
            prompt: this.formElements.promptInput
        };
    }

    validate() {
        const validator = this.getBaseValidator();
        
        // Prompt is required for standard quests
        validator.addRule('prompt', required('Please enter a quest prompt.'));
        
        const common = this.getCommonFormData();
        const data = {
            ...common,
            prompt: this.formElements.promptInput ? this.formElements.promptInput.value : ''
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
        const prompt = this.formElements.promptInput ? this.formElements.promptInput.value : '';

        const rewards = RewardCalculator.getBaseRewards(this.type, prompt);

        const quest = {
            month: common.month,
            year: common.year,
            type: this.type,
            prompt: prompt,
            book: common.book,
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
            return this.processCompletedQuests([quest], common.selectedBuffs, common.background);
        }

        return [this.questsToJSON([quest])[0]];
    }
}

