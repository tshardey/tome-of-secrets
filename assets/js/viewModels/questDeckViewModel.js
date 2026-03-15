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
    getQuestCardbackImage,
    getExtraCreditCardImage,
    getExtraCreditCardbackImage,
    getRestorationWingCardbackImage,
    getRestorationProjectCardFaceImage
} from '../utils/questCardImage.js';
import { isWingReadyForRestoration } from '../restoration/wingProgress.js';

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

/**
 * Create view model for a single drawn Extra Credit card (for rendering)
 * @returns {Object} View model with cardImage for the extra credit card
 */
export function createExtraCreditViewModel() {
    return {
        cardImage: getExtraCreditCardImage()
    };
}

/**
 * Create view model for Extra Credit deck UI (cardback + drawn cards list)
 * @param {Array<{cardImage: string}>} drawnCards - Array of drawn card data (each has cardImage)
 * @returns {Object} View model: { deck: { available, cardbackImage }, drawnCards }
 */
export function createExtraCreditDeckViewModel(drawnCards = []) {
    const list = Array.isArray(drawnCards) ? drawnCards : [];
    return {
        deck: {
            available: true,
            availableCount: 1,
            cardbackImage: getExtraCreditCardbackImage()
        },
        drawnCards: list.map((item) => ({
            cardImage: item && item.cardImage != null ? item.cardImage : getExtraCreditCardImage()
        }))
    };
}

/**
 * Create view model for Restoration Projects: wings (card backs) and projects for selected wing (card faces)
 * @param {Object} state - Character state object
 * @param {string|null} selectedWingId - Numeric wing key (e.g. '1', '6') when a wing is selected
 * @returns {Object} View model: { wings: Array<{wingId, name, cardbackImage, unlocked}>, projects: Array<{projectId, name, description, cardImage, project, wing}> }
 */
export function createRestorationDeckViewModel(state, selectedWingId = null) {
    const wingsData = data.wings || {};
    const projectsData = data.restorationProjects || {};
    const completedProjects = (state && state.completedRestorationProjects) || [];
    const dustyBlueprints = (state && typeof state.dustyBlueprints === 'number') ? state.dustyBlueprints : 0;

    const wings = [];
    for (const numericId in wingsData) {
        const wing = wingsData[numericId];
        const unlocked = wing.alwaysAccessible === true || isWingReadyForRestoration(numericId);
        wings.push({
            wingId: numericId,
            numericId,
            name: wing.name,
            id: wing.id,
            cardbackImage: getRestorationWingCardbackImage(wing.id),
            unlocked
        });
    }

    let projects = [];
    if (selectedWingId && wingsData[selectedWingId]) {
        const wing = wingsData[selectedWingId];
        for (const projectId in projectsData) {
            const project = projectsData[projectId];
            if (project.wingId !== selectedWingId) continue;
            if (completedProjects.includes(projectId)) continue;
            const cost = project.cost || 0;
            if (dustyBlueprints < cost) continue;
            projects.push({
                projectId,
                name: project.name,
                description: project.description,
                completionPrompt: project.completionPrompt,
                cost: project.cost,
                cardImage: getRestorationProjectCardFaceImage(projectId),
                project,
                wing
            });
        }
    }

    return { wings, projects, selectedWingId };
}
