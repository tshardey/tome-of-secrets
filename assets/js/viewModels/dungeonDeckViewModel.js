/**
 * dungeonDeckViewModel - Creates view models for dungeon deck UI rendering
 * 
 * Transforms deck state + services into UI-ready data structure.
 * All calculations and business logic happen here, not in UI functions.
 */

import * as data from '../character-sheet/data.js';
import { 
    getAvailableRooms, 
    getAvailableEncounters,
    drawRandomRoom,
    drawRandomEncounter
} from '../services/DungeonDeckService.js';
import { getEncounterImageFilename } from '../utils/encounterImageMap.js';
import { getDungeonRoomCardImage } from '../utils/dungeonRoomCardImage.js';
import { toCdnImageUrlIfConfigured } from '../utils/imageCdn.js';

/**
 * Derive card image path from encounter data
 * @param {Object} encounterData - Encounter data object
 * @returns {string} Card image path
 */
function getEncounterCardImage(encounterData) {
    if (!encounterData || !encounterData.name) return null;
    
    // Use image map to get correct filename
    const filename = getEncounterImageFilename(encounterData.name);
    return toCdnImageUrlIfConfigured(`assets/images/encounters/${filename}`);
}

/**
 * Create view model for dungeon deck UI
 * @param {Object} state - Character state object
 * @param {string|null} drawnRoomNumber - Currently drawn room number (if any)
 * @returns {Object} View model for deck UI rendering
 */
export function createDungeonDeckViewModel(state, drawnRoomNumber = null) {
    const availableRooms = getAvailableRooms(state);
    const drawnRoom = drawnRoomNumber ? data.dungeonRooms?.[drawnRoomNumber] : null;
    const availableEncounters = drawnRoomNumber 
        ? getAvailableEncounters(drawnRoomNumber, state)
        : [];
    
    return {
        // Room deck state
        roomDeck: {
            available: availableRooms.length > 0,
            availableCount: availableRooms.length,
            cardbackImage: toCdnImageUrlIfConfigured('assets/images/dungeons/tos-cardback-dungeon-rooms.png')
        },
        
        // Encounter deck state
        encounterDeck: {
            available: availableEncounters.length > 0 && drawnRoomNumber !== null,
            availableCount: availableEncounters.length,
            cardbackImage: toCdnImageUrlIfConfigured('assets/images/encounters/tos-cardback-encounters.png')
        },
        
        // Drawn cards
        drawnRoom: drawnRoom ? {
            roomNumber: drawnRoomNumber,
            name: drawnRoom.name,
            description: drawnRoom.description,
            challenge: drawnRoom.challenge,
            cardImage: getDungeonRoomCardImage(drawnRoom),
            roomData: drawnRoom
        } : null,
        
        drawnEncounter: null, // Will be set when encounter is drawn
        
        // Available data for drawing
        availableRooms,
        availableEncounters
    };
}

/**
 * Create view model for drawn cards
 * @param {string} roomNumber - Room number
 * @param {Object|null} encounterData - Encounter data object (if drawn)
 * @returns {Object} View model for drawn cards rendering
 */
export function createDrawnCardViewModel(roomNumber, encounterData = null) {
    const roomData = data.dungeonRooms?.[roomNumber];
    if (!roomData) {
        return { room: null, encounter: null };
    }
    
    const roomCard = {
        roomNumber,
        name: roomData.name,
        description: roomData.description,
        challenge: roomData.challenge,
        cardImage: getDungeonRoomCardImage(roomData),
        roomData
    };
    
    const encounterCard = encounterData ? {
        name: encounterData.name,
        type: encounterData.type,
        description: encounterData.description,
        befriend: encounterData.befriend,
        defeat: encounterData.defeat,
        cardImage: getEncounterCardImage(encounterData),
        encounterData
    } : null;
    
    return {
        room: roomCard,
        encounter: encounterCard
    };
}
