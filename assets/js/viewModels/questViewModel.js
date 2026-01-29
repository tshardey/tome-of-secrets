/**
 * QuestViewModel - Creates view models for quest rendering
 * 
 * Transforms quest state + services into UI-ready data structure.
 * All calculations and business logic happen here, not in UI functions.
 */

import { 
    calculateActiveQuestReceipt, 
    formatBuffsForDisplay, 
    formatQuestPrompt,
    getQuestRewardIndicator 
} from '../services/QuestService.js';
import { STORAGE_KEYS } from '../character-sheet/storageKeys.js';
import { decodeHtmlEntities, escapeHtml } from '../utils/sanitize.js';

/**
 * Create view model for a single quest row
 * @param {Object} quest - Quest object
 * @param {number} index - Quest index
 * @param {string} listType - 'active', 'completed', or 'discarded'
 * @param {string} background - Background key (optional)
 * @param {string} wizardSchool - Wizard school key (optional)
 * @returns {Object} View model for quest row rendering
 */
export function createQuestRowViewModel(quest, index, listType = 'active', background = '', wizardSchool = '') {
    const rewards = quest.rewards || {};
    
    // Calculate receipt if needed
    let receipt = null;
    if (listType === 'active' && quest.buffs && quest.buffs.length > 0) {
        receipt = calculateActiveQuestReceipt(quest, background, wizardSchool);
    } else if (listType === 'completed' && quest.receipt) {
        receipt = quest.receipt;
    }
    
    // Get reward indicator
    const { indicator, tooltip } = getQuestRewardIndicator(quest, listType, receipt);
    
    // Format display values
    const buffsDisplay = formatBuffsForDisplay(quest.buffs);
    const promptDisplay = formatQuestPrompt(quest);
    
    // Format reward values with indicator
    const formatReward = (value) => {
        if (value > 0) {
            const indicatorHtml = indicator 
                ? ` <span style="color: #b89f62; cursor: help;" title="${escapeHtml(tooltip)}">${indicator}</span>`
                : '';
            return `+${value}${indicatorHtml}`;
        }
        return '-';
    };
    
    // Format items
    const itemsDisplay = rewards.items && rewards.items.length > 0
        ? rewards.items.map(item => decodeHtmlEntities(item)).join(', ')
        : '-';
    
    return {
        quest,
        index,
        listType,
        
        // Display values
        month: quest.month || '',
        year: quest.year || '',
        type: quest.type || '',
        prompt: promptDisplay,
        book: quest.book || '',
        notes: quest.notes || '',
        buffs: buffsDisplay,
        
        // Rewards
        xp: formatReward(rewards.xp || 0),
        paperScraps: formatReward(rewards.paperScraps || 0),
        inkDrops: formatReward(rewards.inkDrops || 0),
        items: itemsDisplay,
        
        // Metadata
        receipt,
        indicator,
        tooltip,
        
        // Action buttons
        showComplete: listType === 'active',
        showDiscard: listType === 'active',
        showDelete: true,
        showEdit: true,
        listName: listType === 'active' ? 'activeAssignments' : 
                 listType === 'completed' ? 'completedQuests' : 
                 'discardedQuests'
    };
}

/**
 * Create view model for quest list rendering
 * @param {Array} quests - Array of quest objects
 * @param {string} listType - 'active', 'completed', or 'discarded'
 * @param {string} background - Background key (optional)
 * @param {string} wizardSchool - Wizard school key (optional)
 * @returns {Array} Array of quest row view models
 */
export function createQuestListViewModel(quests = [], listType = 'active', background = '', wizardSchool = '') {
    return quests.map((quest, index) => 
        createQuestRowViewModel(quest, index, listType, background, wizardSchool)
    );
}

/**
 * Create view model for all quest lists
 * @param {Object} state - Character state object
 * @param {string} background - Background key (optional)
 * @param {string} wizardSchool - Wizard school key (optional)
 * @returns {Object} View model with all quest lists
 */
export function createAllQuestsViewModel(state, background = '', wizardSchool = '') {
    const activeQuests = state[STORAGE_KEYS.ACTIVE_ASSIGNMENTS] || [];
    const completedQuests = state[STORAGE_KEYS.COMPLETED_QUESTS] || [];
    const discardedQuests = state[STORAGE_KEYS.DISCARDED_QUESTS] || [];
    
    return {
        active: createQuestListViewModel(activeQuests, 'active', background, wizardSchool),
        completed: createQuestListViewModel(completedQuests, 'completed', background, wizardSchool),
        discarded: createQuestListViewModel(discardedQuests, 'discarded', background, wizardSchool),
        
        // Summary counts
        activeCount: activeQuests.length,
        completedCount: completedQuests.length,
        discardedCount: discardedQuests.length
    };
}

