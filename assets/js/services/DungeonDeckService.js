/**
 * DungeonDeckService - Handles dungeon deck business logic
 * 
 * Determines which rooms and encounters are available for drawing
 * based on completion status.
 */

import * as data from '../character-sheet/data.js';
import { STORAGE_KEYS } from '../character-sheet/storageKeys.js';

/**
 * Check if a dungeon room is fully completed or has active quests
 * A room is fully completed if:
 * - The challenge is completed AND
 * - All encounters are completed (or there are no encounters)
 * A room or encounter is not available if it's already in active quests
 * @param {string} roomNumber - Room number (1-12)
 * @param {Array} completedQuests - Array of completed quest objects
 * @param {Array} activeQuests - Array of active quest objects
 * @returns {Object} { isFullyCompleted: boolean, challengeCompleted: boolean, challengeActive: boolean, completedEncounters: Set<string>, activeEncounters: Set<string>, totalEncounters: number }
 */
export function checkRoomCompletionStatus(roomNumber, completedQuests, activeQuests = []) {
    const room = data.dungeonRooms?.[roomNumber];
    if (!room) {
        return { isFullyCompleted: false, challengeCompleted: false, challengeActive: false, completedEncounters: new Set(), activeEncounters: new Set(), totalEncounters: 0 };
    }
    
    const completedEncounters = new Set();
    const activeEncounters = new Set();
    let challengeCompleted = false;
    let challengeActive = false;
    
    // Count total encounters
    const totalEncounters = room.encountersDetailed?.length || 0;
    
    // Check completed quests
    for (const quest of completedQuests) {
        if (quest.type !== '♠ Dungeon Crawl') continue;
        
        // Primary check: use roomNumber and isEncounter if available
        if (quest.roomNumber === roomNumber) {
            if (quest.isEncounter === false) {
                // This is the room challenge
                challengeCompleted = true;
            } else if (quest.isEncounter === true && quest.encounterName) {
                // This is an encounter
                completedEncounters.add(quest.encounterName);
            }
        }
        
        // Fallback: match by prompt text for older quests
        const canUseFallback = !quest.roomNumber || quest.roomNumber === roomNumber;
        
        if (canUseFallback && !challengeCompleted && quest.prompt === room.challenge) {
            challengeCompleted = true;
        }
        
        // Fallback: match encounters by prompt text
        if (canUseFallback && room.encounters) {
            for (const encounterName in room.encounters) {
                const encounterData = room.encounters[encounterName];
                if (encounterData.defeat && quest.prompt === encounterData.defeat) {
                    completedEncounters.add(encounterName);
                }
                if (encounterData.befriend && quest.prompt === encounterData.befriend) {
                    completedEncounters.add(encounterName);
                }
            }
        }
        
        // Also check encountersDetailed
        if (canUseFallback && room.encountersDetailed) {
            for (const encounter of room.encountersDetailed) {
                if (encounter.defeat && quest.prompt && quest.prompt.includes(encounter.name) && quest.prompt.includes(encounter.defeat)) {
                    completedEncounters.add(encounter.name);
                }
                if (encounter.befriend && quest.prompt && quest.prompt.includes(encounter.name) && quest.prompt.includes(encounter.befriend)) {
                    completedEncounters.add(encounter.name);
                }
            }
        }
    }
    
    // Check active quests
    for (const quest of activeQuests) {
        if (quest.type !== '♠ Dungeon Crawl') continue;
        
        // Primary check: use roomNumber and isEncounter if available
        if (quest.roomNumber === roomNumber) {
            if (quest.isEncounter === false) {
                // This is the room challenge
                challengeActive = true;
            } else if (quest.isEncounter === true && quest.encounterName) {
                // This is an encounter
                activeEncounters.add(quest.encounterName);
            }
        }
        
        // Fallback: match by prompt text for older quests
        const canUseFallback = !quest.roomNumber || quest.roomNumber === roomNumber;
        
        if (canUseFallback && !challengeActive && quest.prompt === room.challenge) {
            challengeActive = true;
        }
        
        // Fallback: match encounters by prompt text
        if (canUseFallback && room.encounters) {
            for (const encounterName in room.encounters) {
                const encounterData = room.encounters[encounterName];
                if (encounterData.defeat && quest.prompt === encounterData.defeat) {
                    activeEncounters.add(encounterName);
                }
                if (encounterData.befriend && quest.prompt === encounterData.befriend) {
                    activeEncounters.add(encounterName);
                }
            }
        }
        
        // Also check encountersDetailed
        if (canUseFallback && room.encountersDetailed) {
            for (const encounter of room.encountersDetailed) {
                if (encounter.defeat && quest.prompt && quest.prompt.includes(encounter.name) && quest.prompt.includes(encounter.defeat)) {
                    activeEncounters.add(encounter.name);
                }
                if (encounter.befriend && quest.prompt && quest.prompt.includes(encounter.name) && quest.prompt.includes(encounter.befriend)) {
                    activeEncounters.add(encounter.name);
                }
            }
        }
    }
    
    // Room is fully completed if challenge is done AND all encounters are done
    // For rooms with 0 encounters, fully completed means challenge is done
    const isFullyCompleted = challengeCompleted && (totalEncounters === 0 || completedEncounters.size === totalEncounters);
    
    return { isFullyCompleted, challengeCompleted, challengeActive, completedEncounters, activeEncounters, totalEncounters };
}

/**
 * Get available rooms that can be drawn
 * A room is available if it's not fully completed and not already active
 * @param {Object} state - Character state object
 * @returns {Array<string>} Array of available room numbers
 */
export function getAvailableRooms(state) {
    const completedQuests = state[STORAGE_KEYS.COMPLETED_QUESTS] || [];
    const activeQuests = state[STORAGE_KEYS.ACTIVE_ASSIGNMENTS] || [];
    const availableRooms = [];
    
    // Check each room
    if (data.dungeonRooms) {
        for (const roomNumber in data.dungeonRooms) {
            const status = checkRoomCompletionStatus(roomNumber, completedQuests, activeQuests);
            // Room is available if not fully completed and challenge is not active
            if (!status.isFullyCompleted && !status.challengeActive) {
                availableRooms.push(roomNumber);
            }
        }
    }
    
    return availableRooms.sort((a, b) => parseInt(a) - parseInt(b));
}

/**
 * Get available encounters for a specific room
 * Returns encounters that haven't been completed yet and aren't already active
 * @param {string} roomNumber - Room number (1-12)
 * @param {Object} state - Character state object
 * @returns {Array<Object>} Array of available encounter objects from encountersDetailed
 */
export function getAvailableEncounters(roomNumber, state) {
    const room = data.dungeonRooms?.[roomNumber];
    if (!room || !room.encountersDetailed || room.encountersDetailed.length === 0) {
        return [];
    }
    
    const completedQuests = state[STORAGE_KEYS.COMPLETED_QUESTS] || [];
    const activeQuests = state[STORAGE_KEYS.ACTIVE_ASSIGNMENTS] || [];
    const status = checkRoomCompletionStatus(roomNumber, completedQuests, activeQuests);
    
    // Filter encounters to only include those that haven't been completed and aren't active
    const availableEncounters = room.encountersDetailed.filter(encounter => {
        return !status.completedEncounters.has(encounter.name) && !status.activeEncounters.has(encounter.name);
    });
    
    return availableEncounters;
}

/**
 * Randomly select a room from available rooms
 * @param {Array<string>} availableRooms - Array of available room numbers
 * @returns {string|null} Randomly selected room number, or null if no rooms available
 */
export function drawRandomRoom(availableRooms) {
    if (!availableRooms || availableRooms.length === 0) {
        return null;
    }
    
    const randomIndex = Math.floor(Math.random() * availableRooms.length);
    return availableRooms[randomIndex];
}

/**
 * Randomly select an encounter from available encounters
 * @param {Array<Object>} availableEncounters - Array of available encounter objects
 * @returns {Object|null} Randomly selected encounter object, or null if no encounters available
 */
export function drawRandomEncounter(availableEncounters) {
    if (!availableEncounters || availableEncounters.length === 0) {
        return null;
    }
    
    const randomIndex = Math.floor(Math.random() * availableEncounters.length);
    return availableEncounters[randomIndex];
}

/**
 * Check if a room is fully completed
 * @param {string} roomNumber - Room number (1-12)
 * @param {Object} state - Character state object
 * @returns {boolean} True if room is fully completed
 */
export function isRoomFullyCompleted(roomNumber, state) {
    const completedQuests = state[STORAGE_KEYS.COMPLETED_QUESTS] || [];
    const activeQuests = state[STORAGE_KEYS.ACTIVE_ASSIGNMENTS] || [];
    const status = checkRoomCompletionStatus(roomNumber, completedQuests, activeQuests);
    return status.isFullyCompleted;
}
