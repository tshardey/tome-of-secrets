/**
 * dungeonArchiveCardsViewModel - Creates view models for archived dungeon quest cards
 * 
 * Transforms completed dungeon quests into card gallery format.
 */

import * as data from '../character-sheet/data.js';
import { STORAGE_KEYS } from '../character-sheet/storageKeys.js';
import { getEncounterImageFilename } from '../utils/encounterImageMap.js';
import { getDungeonRoomCardImage } from '../utils/dungeonRoomCardImage.js';
import { toCdnImageUrlIfConfigured } from '../utils/imageCdn.js';

/**
 * Derive card image path from encounter data
 * @param {string} encounterName - Encounter name
 * @returns {string} Card image path
 */
function getEncounterCardImage(encounterName) {
    if (!encounterName) return null;
    
    // Use image map to get correct filename
    const filename = getEncounterImageFilename(encounterName);
    return toCdnImageUrlIfConfigured(`assets/images/encounters/${filename}`);
}

/**
 * Get room data for a quest
 * @param {Object} quest - Quest object
 * @returns {Object|null} Room data object
 */
function getRoomDataForQuest(quest) {
    if (!quest.roomNumber) return null;
    return data.dungeonRooms?.[quest.roomNumber] || null;
}

/**
 * Get encounter data for a quest
 * @param {Object} quest - Quest object
 * @param {Object} roomData - Room data object
 * @returns {Object|null} Encounter data from encountersDetailed array
 */
function getEncounterDataForQuest(quest, roomData) {
    if (!quest.isEncounter || !quest.encounterName || !roomData) return null;
    
    const encountersDetailed = roomData.encountersDetailed || [];
    return encountersDetailed.find(enc => enc.name === quest.encounterName) || null;
}

/**
 * Create view model for archived dungeon quest cards
 * @param {Array} completedQuests - Array of completed quest objects
 * @returns {Array} Array of view model objects for dungeon quest cards
 */
export function createDungeonArchiveCardsViewModel(completedQuests) {
    const dungeonQuests = completedQuests.filter(quest => quest.type === '♠ Dungeon Crawl');
    
    return dungeonQuests.map((quest, index) => {
        const roomData = getRoomDataForQuest(quest);
        const encounterData = getEncounterDataForQuest(quest, roomData);
        
        let cardImage = null;
        let title = '';
        
        if (quest.isEncounter && encounterData) {
            // Encounter card
            cardImage = getEncounterCardImage(quest.encounterName);
            title = quest.encounterName || '';
        } else if (roomData) {
            // Room card
            cardImage = getDungeonRoomCardImage(roomData);
            title = roomData.name || '';
        } else {
            // Fallback: use quest prompt or type
            title = quest.prompt || quest.type || '';
        }
        
        return {
            quest,
            index,
            cardImage,
            title,
            roomData,
            encounterData
        };
    });
}
