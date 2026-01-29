/**
 * SideQuestDeckService - Handles side quest deck business logic
 * 
 * Determines which side quests are available for drawing
 * based on completion status.
 */

import * as data from '../character-sheet/data.js';
import { STORAGE_KEYS } from '../character-sheet/storageKeys.js';

/**
 * Check if a side quest is completed
 * @param {string} questKey - Side quest key (1-8)
 * @param {Array} completedQuests - Array of completed quest objects
 * @returns {boolean} True if quest is completed
 */
export function isSideQuestCompleted(questKey, completedQuests) {
    const quest = data.sideQuestsDetailed?.[questKey];
    if (!quest) return false;
    
    // Build expected prompt format: "Name: prompt"
    const expectedPrompt = `${quest.name}: ${quest.prompt}`;
    
    for (const completedQuest of completedQuests) {
        if (completedQuest.type !== '♣ Side Quest') continue;
        
        // Match by exact prompt
        if (completedQuest.prompt === expectedPrompt) {
            return true;
        }
        
        // Fallback: match by quest name in prompt
        if (completedQuest.prompt && completedQuest.prompt.includes(quest.name)) {
            return true;
        }
    }
    return false;
}

/**
 * Check if a side quest is active
 * @param {string} questKey - Side quest key (1-8)
 * @param {Array} activeQuests - Array of active quest objects
 * @returns {boolean} True if quest is active
 */
export function isSideQuestActive(questKey, activeQuests) {
    const quest = data.sideQuestsDetailed?.[questKey];
    if (!quest) return false;
    
    // Build expected prompt format: "Name: prompt"
    const expectedPrompt = `${quest.name}: ${quest.prompt}`;
    
    for (const activeQuest of activeQuests) {
        if (activeQuest.type !== '♣ Side Quest') continue;
        
        // Match by exact prompt
        if (activeQuest.prompt === expectedPrompt) {
            return true;
        }
        
        // Fallback: match by quest name in prompt
        if (activeQuest.prompt && activeQuest.prompt.includes(quest.name)) {
            return true;
        }
    }
    return false;
}

/**
 * Get available side quests that can be drawn
 * @param {Object} state - Character state object
 * @returns {Array<Object>} Array of available quest objects with their keys
 */
export function getAvailableSideQuests(state) {
    const completedQuests = state[STORAGE_KEYS.COMPLETED_QUESTS] || [];
    const activeQuests = state[STORAGE_KEYS.ACTIVE_ASSIGNMENTS] || [];
    const availableQuests = [];
    
    if (!data.sideQuestsDetailed) return availableQuests;
    
    // Check each side quest
    for (const questKey in data.sideQuestsDetailed) {
        const quest = data.sideQuestsDetailed[questKey];
        const isCompleted = isSideQuestCompleted(questKey, completedQuests);
        const isActive = isSideQuestActive(questKey, activeQuests);
        
        // Quest is available if not completed and not active
        if (!isCompleted && !isActive) {
            availableQuests.push({
                key: questKey,
                ...quest
            });
        }
    }
    
    return availableQuests;
}

/**
 * Randomly select a side quest from available quests
 * @param {Array<Object>} availableQuests - Array of available quest objects
 * @returns {Object|null} Randomly selected quest object, or null if no quests available
 */
export function drawRandomSideQuest(availableQuests) {
    if (!availableQuests || availableQuests.length === 0) {
        return null;
    }
    
    const randomIndex = Math.floor(Math.random() * availableQuests.length);
    return availableQuests[randomIndex];
}
