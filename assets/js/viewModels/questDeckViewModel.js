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
 * @param {Array<Object>} drawnBuffs - Array of drawn buff objects (can accumulate multiple draws)
 * @returns {Object} View model for deck UI rendering
 */
export function createAtmosphericBuffDeckViewModel(state, drawnBuffs = []) {
    const availableBuffs = getAvailableAtmosphericBuffs(state);
    const list = Array.isArray(drawnBuffs) ? drawnBuffs : (drawnBuffs ? [drawnBuffs] : []);

    return {
        deck: {
            available: availableBuffs.length > 0,
            availableCount: availableBuffs.length,
            cardbackImage: getQuestCardbackImage('atmospheric-buffs')
        },
        drawnBuffs: list.map((buff) => ({
            name: buff.name,
            description: buff.description,
            cardImage: getAtmosphericBuffCardImage(buff),
            buffData: buff
        })),
        availableBuffs
    };
}

/**
 * Create view model for genre quest deck UI
 * @param {Object} state - Character state object
 * @param {Array<Object>} drawnQuests - Array of drawn quest objects (can accumulate multiple draws)
 * @returns {Object} View model for deck UI rendering
 */
export function createGenreQuestDeckViewModel(state, drawnQuests = []) {
    const availableQuests = getAvailableGenreQuests(state);
    const list = Array.isArray(drawnQuests) ? drawnQuests : (drawnQuests ? [drawnQuests] : []);

    return {
        deck: {
            available: availableQuests.length > 0,
            availableCount: availableQuests.length,
            cardbackImage: getQuestCardbackImage('genre-quests')
        },
        drawnQuests: list.map((q) => ({
            key: q.key,
            genre: q.genre,
            description: q.description,
            cardImage: getGenreQuestCardImage(q),
            questData: q
        })),
        availableQuests
    };
}

/**
 * Create view model for side quest deck UI
 * @param {Object} state - Character state object
 * @param {Array<Object>} drawnQuests - Array of drawn quest objects (can accumulate multiple draws)
 * @returns {Object} View model for deck UI rendering
 */
export function createSideQuestDeckViewModel(state, drawnQuests = []) {
    const availableQuests = getAvailableSideQuests(state);
    const list = Array.isArray(drawnQuests) ? drawnQuests : (drawnQuests ? [drawnQuests] : []);

    return {
        deck: {
            available: availableQuests.length > 0,
            availableCount: availableQuests.length,
            cardbackImage: getQuestCardbackImage('side-quests')
        },
        drawnQuests: list.map((q) => ({
            key: q.key,
            name: q.name,
            description: q.description,
            prompt: q.prompt,
            cardImage: getSideQuestCardImage(q),
            questData: q
        })),
        availableQuests
    };
}
