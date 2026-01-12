/**
 * GenreQuestDeckService - Handles genre quest deck business logic
 * 
 * Determines which genre quests are available for drawing
 * based on completion status.
 */

import * as data from '../character-sheet/data.js';
import { STORAGE_KEYS } from '../character-sheet/storageKeys.js';

/**
 * Check if a genre quest is completed
 * @param {string} questKey - Genre quest key (1-20)
 * @param {Array} completedQuests - Array of completed quest objects
 * @returns {boolean} True if quest is completed
 */
export function isGenreQuestCompleted(questKey, completedQuests) {
    const quest = data.genreQuests?.[questKey];
    if (!quest) return false;
    
    // Build expected prompt format: "Genre: description"
    const expectedPrompt = `${quest.genre}: ${quest.description}`;
    
    for (const completedQuest of completedQuests) {
        if (completedQuest.type !== '♥ Organize the Stacks') continue;
        
        // Match by exact prompt
        if (completedQuest.prompt === expectedPrompt) {
            return true;
        }
        
        // Fallback: match by genre name in prompt
        if (completedQuest.prompt && completedQuest.prompt.includes(quest.genre)) {
            return true;
        }
    }
    return false;
}

/**
 * Check if a genre quest is active
 * @param {string} questKey - Genre quest key (1-20)
 * @param {Array} activeQuests - Array of active quest objects
 * @returns {boolean} True if quest is active
 */
export function isGenreQuestActive(questKey, activeQuests) {
    const quest = data.genreQuests?.[questKey];
    if (!quest) return false;
    
    // Build expected prompt format: "Genre: description"
    const expectedPrompt = `${quest.genre}: ${quest.description}`;
    
    for (const activeQuest of activeQuests) {
        if (activeQuest.type !== '♥ Organize the Stacks') continue;
        
        // Match by exact prompt
        if (activeQuest.prompt === expectedPrompt) {
            return true;
        }
        
        // Fallback: match by genre name in prompt
        if (activeQuest.prompt && activeQuest.prompt.includes(quest.genre)) {
            return true;
        }
    }
    return false;
}

/**
 * Get available genre quests that can be drawn
 * Only includes quests for selected genres, and excludes currently active quests.
 * Unlike dungeon rooms and side quests, genre quests are REPEATABLE - they can be
 * done multiple times, so we don't filter out completed quests.
 * @param {Object} state - Character state object
 * @returns {Array<Object>} Array of available quest objects with their keys
 */
export function getAvailableGenreQuests(state) {
    const activeQuests = state[STORAGE_KEYS.ACTIVE_ASSIGNMENTS] || [];
    const selectedGenres = state[STORAGE_KEYS.SELECTED_GENRES] || [];
    const availableQuests = [];
    
    if (!data.genreQuests) return availableQuests;
    
    // If no genres are selected, no quests are available
    if (selectedGenres.length === 0) {
        return availableQuests;
    }
    
    // Check each genre quest
    for (const questKey in data.genreQuests) {
        const quest = data.genreQuests[questKey];
        
        // Only include quests for selected genres
        if (!selectedGenres.includes(quest.genre)) {
            continue;
        }
        
        const isActive = isGenreQuestActive(questKey, activeQuests);
        
        // Genre quests are repeatable - only exclude if currently active
        // (to prevent having the same quest twice in active queue)
        if (!isActive) {
            availableQuests.push({
                key: questKey,
                ...quest
            });
        }
    }
    
    return availableQuests;
}

/**
 * Randomly select a genre quest from available quests
 * @param {Array<Object>} availableQuests - Array of available quest objects
 * @returns {Object|null} Randomly selected quest object, or null if no quests available
 */
export function drawRandomGenreQuest(availableQuests) {
    if (!availableQuests || availableQuests.length === 0) {
        return null;
    }
    
    const randomIndex = Math.floor(Math.random() * availableQuests.length);
    return availableQuests[randomIndex];
}
