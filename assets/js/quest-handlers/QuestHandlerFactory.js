/**
 * QuestHandlerFactory - Factory for creating quest type handlers
 */

import { DungeonQuestHandler } from './DungeonQuestHandler.js';
import { GenreQuestHandler } from './GenreQuestHandler.js';
import { SideQuestHandler } from './SideQuestHandler.js';
import { ExtraCreditHandler } from './ExtraCreditHandler.js';
import { RestorationQuestHandler } from './RestorationQuestHandler.js';
import { StandardQuestHandler } from './StandardQuestHandler.js';

export class QuestHandlerFactory {
    /**
     * Get the appropriate handler for a quest type
     * @param {string} questType - Quest type symbol (♠, ♣, ♥, ⭐, 🔨)
     * @param {Object} formElements - Form element references
     * @param {Object} data - Game data
     * @returns {BaseQuestHandler} Handler instance
     */
    static getHandler(questType, formElements, data) {
        switch (questType) {
            case '♠ Dungeon Crawl':
                return new DungeonQuestHandler(formElements, data);
            
            case '♥ Organize the Stacks':
                return new GenreQuestHandler(formElements, data);
            
            case '♣ Side Quest':
                return new SideQuestHandler(formElements, data);
            
            case '⭐ Extra Credit':
                return new ExtraCreditHandler(formElements, data);
            
            case '🔨 Restoration Project':
                return new RestorationQuestHandler(formElements, data);
            
            default:
                // Handle standard quest types (Book Review, etc.)
                formElements.questType = questType;
                return new StandardQuestHandler(formElements, data);
        }
    }
}

