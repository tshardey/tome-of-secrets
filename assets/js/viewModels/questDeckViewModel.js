/**
 * questDeckViewModel - Creates view models for quest deck UI rendering
 * 
 * Transforms deck state + services into UI-ready data structure.
 * All calculations and business logic happen here, not in UI functions.
 */

import * as data from '../character-sheet/data.js';
import {
    getAvailableAtmosphericBuffs,
    drawRandomAtmosphericBuff
} from '../services/AtmosphericBuffDeckService.js';
import {
    getAvailableGenreQuests,
    drawRandomGenreQuest
} from '../services/GenreQuestDeckService.js';
import {
    getAvailableSideQuests,
    drawRandomSideQuest
} from '../services/SideQuestDeckService.js';
import {
    getAtmosphericBuffCardImage,
    getGenreQuestCardImage,
    getSideQuestCardImage,
    getQuestCardbackImage
} from '../utils/questCardImage.js';

/**
 * Create view model for atmospheric buff deck UI
 * @param {Object} state - Character state object
 * @param {Object|null} drawnBuff - Currently drawn buff object (if any)
 * @returns {Object} View model for deck UI rendering
 */
export function createAtmosphericBuffDeckViewModel(state, drawnBuff = null) {
    const availableBuffs = getAvailableAtmosphericBuffs(state);
    
    return {
        // Deck state
        deck: {
            available: availableBuffs.length > 0,
            availableCount: availableBuffs.length,
            cardbackImage: getQuestCardbackImage('atmospheric-buffs')
        },
        
        // Drawn card
        drawnBuff: drawnBuff ? {
            name: drawnBuff.name,
            description: drawnBuff.description,
            cardImage: getAtmosphericBuffCardImage(drawnBuff),
            buffData: drawnBuff
        } : null,
        
        // Available data for drawing
        availableBuffs
    };
}

/**
 * Create view model for genre quest deck UI
 * @param {Object} state - Character state object
 * @param {Object|null} drawnQuest - Currently drawn quest object (if any)
 * @returns {Object} View model for deck UI rendering
 */
export function createGenreQuestDeckViewModel(state, drawnQuest = null) {
    const availableQuests = getAvailableGenreQuests(state);
    
    return {
        // Deck state
        deck: {
            available: availableQuests.length > 0,
            availableCount: availableQuests.length,
            cardbackImage: getQuestCardbackImage('genre-quests')
        },
        
        // Drawn card
        drawnQuest: drawnQuest ? {
            key: drawnQuest.key,
            genre: drawnQuest.genre,
            description: drawnQuest.description,
            cardImage: getGenreQuestCardImage(drawnQuest),
            questData: drawnQuest
        } : null,
        
        // Available data for drawing
        availableQuests
    };
}

/**
 * Create view model for side quest deck UI
 * @param {Object} state - Character state object
 * @param {Object|null} drawnQuest - Currently drawn quest object (if any)
 * @returns {Object} View model for deck UI rendering
 */
export function createSideQuestDeckViewModel(state, drawnQuest = null) {
    const availableQuests = getAvailableSideQuests(state);
    
    return {
        // Deck state
        deck: {
            available: availableQuests.length > 0,
            availableCount: availableQuests.length,
            cardbackImage: getQuestCardbackImage('side-quests')
        },
        
        // Drawn card
        drawnQuest: drawnQuest ? {
            key: drawnQuest.key,
            name: drawnQuest.name,
            description: drawnQuest.description,
            prompt: drawnQuest.prompt,
            cardImage: getSideQuestCardImage(drawnQuest),
            questData: drawnQuest
        } : null,
        
        // Available data for drawing
        availableQuests
    };
}
