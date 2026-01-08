/**
 * Post-Load Repair Functions
 * 
 * These functions fix inconsistencies in saved data that may have occurred
 * due to code changes, missing migrations, or edge cases in older saves.
 * 
 * All repair functions are:
 * - Idempotent (safe to run multiple times)
 * - Deterministic (same input always produces same output)
 * - Gated by expansion manifest where applicable
 */

import * as data from './data.js';
import { STORAGE_KEYS } from './storageKeys.js';
import { characterState } from './state.js';
import { isExpansionEnabled } from '../config/contentRegistry.js';

/**
 * Repair completed restoration projects that don't have passive slots created yet
 * This handles cases where projects were completed before the slot creation logic was added
 * 
 * @param {Object} stateAdapter - StateAdapter instance for state mutations
 * @param {Object} uiModule - UI module for refreshing displays (optional)
 * @returns {Object} { changed: boolean, notes: string[] }
 */
export function repairCompletedRestorationProjects(stateAdapter, uiModule = null) {
    // Check if library restoration expansion is enabled
    if (!isExpansionEnabled('library-restoration')) {
        return { changed: false, notes: [] };
    }

    const completedProjects = characterState[STORAGE_KEYS.COMPLETED_RESTORATION_PROJECTS] || [];
    const passiveItemSlots = characterState[STORAGE_KEYS.PASSIVE_ITEM_SLOTS] || [];
    const passiveFamiliarSlots = characterState[STORAGE_KEYS.PASSIVE_FAMILIAR_SLOTS] || [];
    
    // Track which projects already have slots
    const projectsWithSlots = new Set();
    [...passiveItemSlots, ...passiveFamiliarSlots].forEach(slot => {
        if (slot.unlockedFrom) {
            projectsWithSlots.add(slot.unlockedFrom);
        }
    });

    // Check each completed project
    let fixedCount = 0;
    const notes = [];
    
    for (const projectId of completedProjects) {
        // Skip if already has a slot
        if (projectsWithSlots.has(projectId)) continue;

        // Get project data
        const project = data.restorationProjects?.[projectId];
        if (!project || !project.reward) continue;

        // Create the slot based on reward type
        if (project.reward.type === 'passiveItemSlot') {
            const slotId = `item-slot-${projectId}`;
            stateAdapter.addPassiveItemSlot(slotId, projectId);
            fixedCount++;
            notes.push(`Created missing passive item slot for project: ${projectId}`);
        } else if (project.reward.type === 'passiveFamiliarSlot') {
            const slotId = `familiar-slot-${projectId}`;
            stateAdapter.addPassiveFamiliarSlot(slotId, projectId);
            fixedCount++;
            notes.push(`Created missing passive familiar slot for project: ${projectId}`);
        }
    }

    if (fixedCount > 0) {
        // Refresh passive equipment display if available
        if (uiModule && uiModule.renderPassiveEquipment) {
            uiModule.renderPassiveEquipment();
        }
    }

    return {
        changed: fixedCount > 0,
        notes: fixedCount > 0 ? [`Fixed ${fixedCount} completed restoration project(s) by creating missing passive slots.`] : []
    };
}

/**
 * Repair completed familiar encounters that don't have familiars in rewards
 * This handles cases where familiars were befriended before the fix was applied
 * 
 * @param {Object} stateAdapter - StateAdapter instance for state mutations
 * @param {Object} uiModule - UI module for refreshing displays (optional)
 * @returns {Object} { changed: boolean, notes: string[] }
 */
export function repairCompletedFamiliarEncounters(stateAdapter, uiModule = null) {
    const completedQuests = characterState[STORAGE_KEYS.COMPLETED_QUESTS] || [];
    const inventoryItems = characterState[STORAGE_KEYS.INVENTORY_ITEMS] || [];
    const equippedItems = characterState[STORAGE_KEYS.EQUIPPED_ITEMS] || [];
    const ownedItemNames = new Set([...inventoryItems, ...equippedItems].map(item => item.name));
    
    let fixedCount = 0;
    const notes = [];
    
    // Check all rooms for familiar encounters
    for (const roomNumber in data.dungeonRooms) {
        const room = data.dungeonRooms[roomNumber];
        if (!room.encountersDetailed) continue;
        
        for (const encounter of room.encountersDetailed) {
            if (encounter.type !== 'Familiar') continue;
            
            const encounterName = encounter.name;
            if (!encounterName || !data.allItems[encounterName]) continue;
            
            // Skip if already owned
            if (ownedItemNames.has(encounterName)) continue;
            
            // Try to find a completed quest for this encounter
            // Check both by encounterName and by prompt (for older quests)
            let foundQuest = false;
            for (const quest of completedQuests) {
                if (quest.type !== '♠ Dungeon Crawl') continue;
                
                const isEncounter = quest.isEncounter === true || quest.isEncounter === 'true';
                
                // Check if this quest matches the encounter
                const matchesByName = isEncounter && quest.encounterName === encounterName;
                // Relaxed prompt matching - just check if the encounter name is in the prompt
                const matchesByPrompt = quest.prompt && quest.prompt.includes(encounterName);
                
                if (matchesByName || matchesByPrompt) {
                    // Check if it was a befriend action (default true if not specified, for familiars)
                    const isBefriend = quest.isBefriend !== false;
                    
                    if (isBefriend) {
                        foundQuest = true;
                        // Add the familiar to inventory
                        stateAdapter.addInventoryItem({ 
                            name: encounterName, 
                            ...data.allItems[encounterName] 
                        });
                        ownedItemNames.add(encounterName);
                        fixedCount++;
                        notes.push(`Added missing familiar "${encounterName}" from completed encounter quest`);
                        break;
                    }
                }
            }
        }
    }

    if (fixedCount > 0 && uiModule) {
        // Refresh loadout if available
        const wearableSlotsInput = document.getElementById('wearable-slots');
        const nonWearableSlotsInput = document.getElementById('non-wearable-slots');
        const familiarSlotsInput = document.getElementById('familiar-slots');
        if (wearableSlotsInput && nonWearableSlotsInput && familiarSlotsInput && uiModule.renderLoadout) {
            uiModule.renderLoadout(wearableSlotsInput, nonWearableSlotsInput, familiarSlotsInput);
        }
    }

    return {
        changed: fixedCount > 0,
        notes: fixedCount > 0 ? [`Fixed ${fixedCount} completed familiar encounter(s) by adding missing familiars.`] : []
    };
}

/**
 * Run all post-load repairs
 * @param {Object} stateAdapter - StateAdapter instance for state mutations
 * @param {Object} uiModule - UI module for refreshing displays (optional)
 * @returns {Object} Summary of all repairs applied
 */
export function runAllRepairs(stateAdapter, uiModule = null) {
    const results = {
        changed: false,
        notes: []
    };

    // Run all repair functions
    const repairs = [
        repairCompletedRestorationProjects(stateAdapter, uiModule),
        repairCompletedFamiliarEncounters(stateAdapter, uiModule)
    ];

    // Aggregate results
    repairs.forEach(repair => {
        if (repair.changed) {
            results.changed = true;
            results.notes.push(...repair.notes);
        }
    });

    if (results.changed) {
        console.log('Post-load repairs applied:', results.notes);
    }

    return results;
}

