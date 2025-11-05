/**
 * GenreQuestHandler - Handles "Organize the Stacks" genre quests (♥)
 */

import { BaseQuestHandler } from './BaseQuestHandler.js';
import { RewardCalculator } from '../services/RewardCalculator.js';

export class GenreQuestHandler extends BaseQuestHandler {
    constructor(formElements, data) {
        super(formElements, data);
        this.type = '♥ Organize the Stacks';
    }

    validate() {
        const common = this.getCommonFormData();
        const prompt = this.formElements.genreQuestSelect.value;

        if (!prompt || !common.book || !common.month || !common.year) {
            return {
                valid: false,
                error: 'Please fill in the Month, Year, Prompt, and Book Title.'
            };
        }

        return { valid: true };
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

