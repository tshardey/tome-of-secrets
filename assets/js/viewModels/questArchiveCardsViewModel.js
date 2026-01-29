/**
 * questArchiveCardsViewModel - Creates view models for archived quest cards
 * 
 * Transforms completed side quests and genre quests into card gallery format.
 */

import * as data from '../character-sheet/data.js';
import { getGenreQuestCardImage, getSideQuestCardImage } from '../utils/questCardImage.js';

/**
 * Extract the quest name from a prompt string
 * e.g., "The Arcane Grimoire: Read..." -> "The Arcane Grimoire"
 * e.g., "Fantasy: Read..." -> "Fantasy"
 * @param {string} prompt - Quest prompt
 * @returns {string|null} Extracted name or null
 */
function extractNameFromPrompt(prompt) {
    if (!prompt || typeof prompt !== 'string') return null;
    const colonIndex = prompt.indexOf(':');
    if (colonIndex > 0) {
        return prompt.substring(0, colonIndex).trim();
    }
    return null;
}

/**
 * Create view model for archived genre quest cards
 * @param {Array} completedQuests - Array of completed quest objects
 * @returns {Array} Array of view model objects for genre quest cards
 */
export function createGenreQuestArchiveCardsViewModel(completedQuests) {
    const genreQuests = completedQuests.filter(quest => quest.type === '♥ Organize the Stacks');
    
    return genreQuests.map((quest, index) => {
        // Extract genre name from prompt (format: "Genre: description")
        const genreName = extractNameFromPrompt(quest.prompt);
        
        // Find matching genre quest data
        let questData = null;
        if (genreName && data.genreQuests) {
            for (const key in data.genreQuests) {
                const genreQuest = data.genreQuests[key];
                if (genreQuest.genre === genreName) {
                    questData = genreQuest;
                    break;
                }
            }
        }
        
        const cardImage = getGenreQuestCardImage(genreName || questData);
        const title = genreName || quest.prompt || 'Genre Quest';
        
        return {
            quest,
            index,
            cardImage,
            title,
            questData
        };
    });
}

/**
 * Create view model for archived side quest cards
 * @param {Array} completedQuests - Array of completed quest objects
 * @returns {Array} Array of view model objects for side quest cards
 */
export function createSideQuestArchiveCardsViewModel(completedQuests) {
    const sideQuests = completedQuests.filter(quest => quest.type === '♣ Side Quest');
    
    return sideQuests.map((quest, index) => {
        // Extract quest name from prompt (format: "Name: prompt")
        const questName = extractNameFromPrompt(quest.prompt);
        
        // Find matching side quest data
        let questData = null;
        if (questName && data.sideQuestsDetailed) {
            for (const key in data.sideQuestsDetailed) {
                const sideQuest = data.sideQuestsDetailed[key];
                if (sideQuest.name === questName) {
                    questData = sideQuest;
                    break;
                }
            }
        }
        
        const cardImage = getSideQuestCardImage(questName || questData);
        const title = questName || quest.prompt || 'Side Quest';
        
        return {
            quest,
            index,
            cardImage,
            title,
            questData
        };
    });
}
