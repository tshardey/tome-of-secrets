/**
 * ExtraCreditHandler - Handles Extra Credit quests (⭐)
 * 
 * Extra Credit quests are unique because they don't require a prompt
 */

import { BaseQuestHandler } from './BaseQuestHandler.js';
import { RewardCalculator } from '../services/RewardCalculator.js';

export class ExtraCreditHandler extends BaseQuestHandler {
    constructor(formElements, data) {
        super(formElements, data);
        this.type = '⭐ Extra Credit';
    }

    validate() {
        const common = this.getCommonFormData();

        // Extra Credit doesn't require a prompt, just book, month, year
        if (!common.book || !common.month || !common.year) {
            return {
                valid: false,
                error: 'Please fill in the Month, Year, and Book Title.'
            };
        }

        return { valid: true };
    }

    createQuests() {
        const common = this.getCommonFormData();
        const prompt = 'Book read outside of quest pool';

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

