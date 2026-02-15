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
 * @param {Array<{roomNumber: string, encounterData: Object|null}>} drawnSlots - Drawn room+encounter slots (can accumulate)
 * @returns {Object} View model for deck UI rendering
 */
export function createDungeonDeckViewModel(state, drawnSlots = []) {
    const availableRooms = getAvailableRooms(state);
    const slots = Array.isArray(drawnSlots) ? drawnSlots : [];

    // Encounter deck is available if any slot has no encounter and that room has encounters
    let encounterDeckAvailable = false;
    let lastSlotWithoutEncounter = null;
    for (let i = slots.length - 1; i >= 0; i--) {
        const slot = slots[i];
        if (slot.encounterData) continue;
        const encs = getAvailableEncounters(slot.roomNumber, state);
        if (encs.length > 0) {
            encounterDeckAvailable = true;
            if (lastSlotWithoutEncounter === null) lastSlotWithoutEncounter = i;
        }
    }

    return {
        roomDeck: {
            available: availableRooms.length > 0,
            availableCount: availableRooms.length,
            cardbackImage: toCdnImageUrlIfConfigured('assets/images/dungeons/tos-cardback-dungeon-rooms.png')
        },
        encounterDeck: {
            available: encounterDeckAvailable,
            availableCount: encounterDeckAvailable ? 1 : 0,
            cardbackImage: toCdnImageUrlIfConfigured('assets/images/encounters/tos-cardback-encounters.png')
        },
        drawnSlots: slots.map((slot) => createDrawnCardViewModel(slot.roomNumber, slot.encounterData)),
        lastSlotIndexForEncounter: lastSlotWithoutEncounter,
        availableRooms
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
