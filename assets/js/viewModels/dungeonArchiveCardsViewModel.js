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
 * Extract the room/encounter name from a prompt string
 * e.g., "The Archivist's Riddle: Read a book..." -> "The Archivist's Riddle"
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
 * Get room data for a quest
 * @param {Object} quest - Quest object
 * @returns {{roomData: Object|null, roomNumber: string|null}} Room data and room number
 */
function getRoomDataForQuest(quest) {
    // Primary: use roomNumber if available
    if (quest.roomNumber) {
        const roomData = data.dungeonRooms?.[quest.roomNumber] || null;
        return { roomData, roomNumber: quest.roomNumber };
    }
    
    // Fallback: search all rooms by matching prompt text (for legacy quests)
    if (quest.prompt && data.dungeonRooms) {
        const extractedName = extractNameFromPrompt(quest.prompt);
        
        for (const roomNumber in data.dungeonRooms) {
            const room = data.dungeonRooms[roomNumber];
            
            // Check if prompt matches room challenge exactly
            if (room.challenge === quest.prompt) {
                return { roomData: room, roomNumber };
            }
            
            // Check if extracted name matches room name (handles reward value changes)
            if (extractedName && room.name === extractedName) {
                return { roomData: room, roomNumber };
            }
            
            // Check if prompt matches any encounter in this room
            if (room.encounters) {
                for (const encounterName in room.encounters) {
                    const encounter = room.encounters[encounterName];
                    if (encounter.befriend === quest.prompt || encounter.defeat === quest.prompt) {
                        return { roomData: room, roomNumber };
                    }
                    // Also check by extracted encounter name
                    if (extractedName && encounterName === extractedName) {
                        return { roomData: room, roomNumber };
                    }
                }
            }
        }
    }
    
    return { roomData: null, roomNumber: null };
}

/**
 * Get encounter data for a quest
 * @param {Object} quest - Quest object
 * @param {Object} roomData - Room data object
 * @returns {{encounterData: Object|null, encounterName: string|null}} Encounter data and name
 */
function getEncounterDataForQuest(quest, roomData) {
    // Primary: use encounterName if available
    if (quest.isEncounter && quest.encounterName && roomData) {
        const encountersDetailed = roomData.encountersDetailed || [];
        const encounterData = encountersDetailed.find(enc => enc.name === quest.encounterName) || null;
        return { encounterData, encounterName: quest.encounterName };
    }
    
    // Fallback: search by prompt text or extracted name (for legacy quests)
    if (quest.prompt && roomData && roomData.encounters) {
        const extractedName = extractNameFromPrompt(quest.prompt);
        
        for (const encounterName in roomData.encounters) {
            const encounter = roomData.encounters[encounterName];
            // Exact prompt match
            if (encounter.befriend === quest.prompt || encounter.defeat === quest.prompt) {
                const encountersDetailed = roomData.encountersDetailed || [];
                const encounterData = encountersDetailed.find(enc => enc.name === encounterName) || null;
                return { encounterData, encounterName };
            }
            // Match by extracted name (handles reward value changes in prompts)
            if (extractedName && encounterName === extractedName) {
                const encountersDetailed = roomData.encountersDetailed || [];
                const encounterData = encountersDetailed.find(enc => enc.name === encounterName) || null;
                return { encounterData, encounterName };
            }
        }
    }
    
    return { encounterData: null, encounterName: null };
}

/**
 * Create view model for archived dungeon quest cards
 * @param {Array} completedQuests - Array of completed quest objects
 * @returns {Array} Array of view model objects for dungeon quest cards
 */
export function createDungeonArchiveCardsViewModel(completedQuests) {
    const dungeonQuests = completedQuests.filter(quest => quest.type === '♠ Dungeon Crawl');
    
    return dungeonQuests.map((quest, index) => {
        const { roomData, roomNumber } = getRoomDataForQuest(quest);
        const { encounterData, encounterName } = getEncounterDataForQuest(quest, roomData);
        
        let cardImage = null;
        let title = '';
        
        // Determine if this is an encounter quest
        // Primary: explicit isEncounter field from quest
        // Fallback: encounterName was found by prompt matching
        const isEncounter = quest.isEncounter === true || (encounterName && !quest.hasOwnProperty('isEncounter'));
        
        if (isEncounter) {
            // Encounter card - use encounterName from quest or from fallback lookup
            const effectiveEncounterName = quest.encounterName || encounterName;
            if (effectiveEncounterName) {
                cardImage = getEncounterCardImage(effectiveEncounterName);
                title = effectiveEncounterName;
            } else {
                // No encounter name available - use prompt as title
                title = quest.prompt || '';
            }
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
            encounterData,
            isEncounter
        };
    });
}
