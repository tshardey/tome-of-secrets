/**
 * Wing Progress Tracker
 * 
 * Calculates room completion per wing, checks if wings are ready for restoration,
 * and tracks overall library restoration progress.
 */

import { wings, dungeonRooms, restorationProjects } from '../character-sheet/data.js';
import { STORAGE_KEYS } from '../character-sheet/storageKeys.js';
import { characterState } from '../character-sheet/state.js';

/**
 * Get all completed quests from in-memory state
 * @returns {Array} Array of completed quest objects
 */
function getCompletedQuests() {
    return characterState[STORAGE_KEYS.COMPLETED_QUESTS] || [];
}

/**
 * Check if a specific dungeon room has been completed
 * A room is completed if the challenge is done and at least one encounter is done
 * @param {string} roomNumber - Room number (as string)
 * @returns {Object} { isCompleted: boolean, challengeCompleted: boolean, encountersCompleted: number }
 */
export function checkRoomCompletion(roomNumber) {
    const completedQuests = getCompletedQuests();
    const room = dungeonRooms[roomNumber];
    
    if (!room) {
        return { isCompleted: false, challengeCompleted: false, encountersCompleted: 0 };
    }

    let challengeCompleted = false;
    let encountersCompleted = 0;
    const completedEncounterNames = new Set();

    for (const quest of completedQuests) {
        if (quest.type !== '♠ Dungeon Crawl') continue;

        // Primary check: use roomNumber and isEncounter if available
        if (quest.roomNumber === roomNumber) {
            if (quest.isEncounter === false) {
                challengeCompleted = true;
            } else if (quest.isEncounter === true && quest.encounterName) {
                completedEncounterNames.add(quest.encounterName);
            }
        }

        // Fallback: match by prompt text for older quests
        const canUseFallback = !quest.roomNumber || quest.roomNumber === roomNumber;
        
        if (canUseFallback && !challengeCompleted && quest.prompt === room.challenge) {
            challengeCompleted = true;
        }

        if (canUseFallback && room.encounters) {
            for (const encounterName in room.encounters) {
                const encounterData = room.encounters[encounterName];
                if (encounterData.defeat && quest.prompt === encounterData.defeat) {
                    completedEncounterNames.add(encounterName);
                }
                if (encounterData.befriend && quest.prompt === encounterData.befriend) {
                    completedEncounterNames.add(encounterName);
                }
            }
        }
    }

    encountersCompleted = completedEncounterNames.size;
    const hasEncounters = room.encountersDetailed && room.encountersDetailed.length > 0;
    const isCompleted = challengeCompleted && (!hasEncounters || encountersCompleted > 0);

    return { isCompleted, challengeCompleted, encountersCompleted };
}

/**
 * Get the completion status of all rooms in a wing
 * @param {string} wingId - Wing ID (1-6)
 * @returns {Object} { wingData, rooms: Array<{roomNumber, roomData, completion}>, completedCount, totalRooms, isWingComplete }
 */
export function getWingProgress(wingId) {
    const wingData = wings[wingId];
    if (!wingData) {
        return { wingData: null, rooms: [], completedCount: 0, totalRooms: 0, isWingComplete: false };
    }

    const rooms = [];
    let completedCount = 0;

    for (const roomNumber of wingData.rooms) {
        const roomData = dungeonRooms[roomNumber];
        const completion = checkRoomCompletion(roomNumber);
        
        rooms.push({
            roomNumber,
            roomData,
            completion
        });

        if (completion.isCompleted) {
            completedCount++;
        }
    }

    const totalRooms = wingData.rooms.length;
    const isWingComplete = (completedCount === totalRooms && totalRooms > 0) || wingData.alwaysAccessible;

    return {
        wingData,
        rooms,
        completedCount,
        totalRooms,
        isWingComplete
    };
}

/**
 * Get progress for all wings
 * @returns {Object} Map of wingId -> wingProgress
 */
export function getAllWingsProgress() {
    const progress = {};
    for (const wingId in wings) {
        progress[wingId] = getWingProgress(wingId);
    }
    return progress;
}

/**
 * Get restoration projects for a specific wing
 * @param {string} wingId - Wing ID (1-6)
 * @param {Array} completedProjects - Array of completed project IDs
 * @returns {Array} Array of project objects with completion status
 */
export function getWingRestorationProjects(wingId, completedProjects = []) {
    const projects = [];
    
    for (const projectId in restorationProjects) {
        const project = restorationProjects[projectId];
        if (project.wingId === wingId) {
            projects.push({
                id: projectId,
                ...project,
                isCompleted: completedProjects.includes(projectId)
            });
        }
    }

    return projects;
}

/**
 * Check if a wing is ready for restoration (all rooms completed)
 * @param {string} wingId - Wing ID (1-6)
 * @returns {boolean} True if wing rooms are all completed
 */
export function isWingReadyForRestoration(wingId) {
    const progress = getWingProgress(wingId);
    return progress.isWingComplete;
}

/**
 * Calculate overall library restoration progress
 * @param {Array} completedProjects - Array of completed project IDs
 * @param {Array} completedWings - Array of completed wing IDs
 * @returns {Object} { totalProjects, completedProjectCount, totalWings, completedWingCount, percentComplete }
 */
export function getOverallProgress(completedProjects = [], completedWings = []) {
    const totalProjects = Object.keys(restorationProjects).length;
    const completedProjectCount = completedProjects.length;
    
    const totalWings = Object.keys(wings).length;
    const completedWingCount = completedWings.length;
    
    // Calculate percentage based on projects (main progress indicator)
    const percentComplete = totalProjects > 0 
        ? Math.round((completedProjectCount / totalProjects) * 100) 
        : 0;

    return {
        totalProjects,
        completedProjectCount,
        totalWings,
        completedWingCount,
        percentComplete
    };
}

/**
 * Get available restoration projects (in wings where rooms are complete)
 * @param {Array} completedProjects - Array of completed project IDs
 * @returns {Array} Array of available project objects
 */
export function getAvailableProjects(completedProjects = []) {
    const available = [];
    
    for (const projectId in restorationProjects) {
        const project = restorationProjects[projectId];
        
        // Skip if already completed
        if (completedProjects.includes(projectId)) continue;
        
        // Check if the wing's rooms are all completed or if it's always accessible
        const wing = wings[project.wingId];
        const isAccessible = wing?.alwaysAccessible || isWingReadyForRestoration(project.wingId);
        
        if (isAccessible) {
            available.push({
                id: projectId,
                ...project
            });
        }
    }

    return available;
}

/**
 * Get wing by room number
 * @param {string} roomNumber - Room number (as string)
 * @returns {Object|null} Wing data or null if not found
 */
export function getWingByRoom(roomNumber) {
    for (const wingId in wings) {
        const wing = wings[wingId];
        if (wing.rooms.includes(roomNumber)) {
            return { wingId, ...wing };
        }
    }
    return null;
}

