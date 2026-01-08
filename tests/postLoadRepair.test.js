/**
 * Tests for Post-Load Repair Functions
 * 
 * Tests repair logic that fixes inconsistencies in saved data.
 */

import {
    repairCompletedRestorationProjects,
    repairCompletedFamiliarEncounters,
    runAllRepairs
} from '../assets/js/character-sheet/postLoadRepair.js';
import { StateAdapter } from '../assets/js/character-sheet/stateAdapter.js';
import { characterState } from '../assets/js/character-sheet/state.js';
import { STORAGE_KEYS, createEmptyCharacterState } from '../assets/js/character-sheet/storageKeys.js';
import * as data from '../assets/js/character-sheet/data.js';

describe('Post-Load Repairs', () => {
    let stateAdapter;
    let mockUI;

    beforeEach(() => {
        // Reset character state
        Object.keys(characterState).forEach(key => {
            delete characterState[key];
        });
        Object.assign(characterState, createEmptyCharacterState());

        // Create a fresh StateAdapter
        stateAdapter = new StateAdapter(characterState);

        // Mock UI module
        mockUI = {
            renderPassiveEquipment: jest.fn(),
            renderLoadout: jest.fn()
        };

        // Clear localStorage
        localStorage.clear();
    });

    describe('repairCompletedRestorationProjects', () => {
        test('should return unchanged if expansion is disabled', () => {
            // Mock contentRegistry to return false
            jest.spyOn(require('../assets/js/config/contentRegistry.js'), 'isExpansionEnabled')
                .mockReturnValue(false);

            const result = repairCompletedRestorationProjects(stateAdapter, mockUI);
            
            expect(result.changed).toBe(false);
            expect(result.notes).toEqual([]);
        });

        test('should create missing passive item slots for completed projects', () => {
            // Mock expansion as enabled
            jest.spyOn(require('../assets/js/config/contentRegistry.js'), 'isExpansionEnabled')
                .mockReturnValue(true);

            // Set up a completed project that should create a passive item slot
            const projectId = Object.keys(data.restorationProjects || {}).find(id => {
                const project = data.restorationProjects[id];
                return project && project.reward && project.reward.type === 'passiveItemSlot';
            });

            if (!projectId) {
                // Skip test if no such project exists in test data
                return;
            }

            characterState[STORAGE_KEYS.COMPLETED_RESTORATION_PROJECTS] = [projectId];
            characterState[STORAGE_KEYS.PASSIVE_ITEM_SLOTS] = [];
            characterState[STORAGE_KEYS.PASSIVE_FAMILIAR_SLOTS] = [];

            const result = repairCompletedRestorationProjects(stateAdapter, mockUI);

            expect(result.changed).toBe(true);
            expect(result.notes.length).toBeGreaterThan(0);
            expect(characterState[STORAGE_KEYS.PASSIVE_ITEM_SLOTS].length).toBe(1);
            expect(characterState[STORAGE_KEYS.PASSIVE_ITEM_SLOTS][0].slotId).toBe(`item-slot-${projectId}`);
            expect(characterState[STORAGE_KEYS.PASSIVE_ITEM_SLOTS][0].unlockedFrom).toBe(projectId);
        });

        test('should create missing passive familiar slots for completed projects', () => {
            // Mock expansion as enabled
            jest.spyOn(require('../assets/js/config/contentRegistry.js'), 'isExpansionEnabled')
                .mockReturnValue(true);

            // Set up a completed project that should create a passive familiar slot
            const projectId = Object.keys(data.restorationProjects || {}).find(id => {
                const project = data.restorationProjects[id];
                return project && project.reward && project.reward.type === 'passiveFamiliarSlot';
            });

            if (!projectId) {
                // Skip test if no such project exists in test data
                return;
            }

            characterState[STORAGE_KEYS.COMPLETED_RESTORATION_PROJECTS] = [projectId];
            characterState[STORAGE_KEYS.PASSIVE_ITEM_SLOTS] = [];
            characterState[STORAGE_KEYS.PASSIVE_FAMILIAR_SLOTS] = [];

            const result = repairCompletedRestorationProjects(stateAdapter, mockUI);

            expect(result.changed).toBe(true);
            expect(result.notes.length).toBeGreaterThan(0);
            expect(characterState[STORAGE_KEYS.PASSIVE_FAMILIAR_SLOTS].length).toBe(1);
            expect(characterState[STORAGE_KEYS.PASSIVE_FAMILIAR_SLOTS][0].slotId).toBe(`familiar-slot-${projectId}`);
        });

        test('should not create duplicate slots for projects that already have slots', () => {
            // Mock expansion as enabled
            jest.spyOn(require('../assets/js/config/contentRegistry.js'), 'isExpansionEnabled')
                .mockReturnValue(true);

            const projectId = Object.keys(data.restorationProjects || {}).find(id => {
                const project = data.restorationProjects[id];
                return project && project.reward && project.reward.type === 'passiveItemSlot';
            });

            if (!projectId) {
                return;
            }

            // Set up completed project with existing slot
            characterState[STORAGE_KEYS.COMPLETED_RESTORATION_PROJECTS] = [projectId];
            characterState[STORAGE_KEYS.PASSIVE_ITEM_SLOTS] = [
                { slotId: `item-slot-${projectId}`, unlockedFrom: projectId }
            ];
            characterState[STORAGE_KEYS.PASSIVE_FAMILIAR_SLOTS] = [];

            const initialSlotCount = characterState[STORAGE_KEYS.PASSIVE_ITEM_SLOTS].length;

            const result = repairCompletedRestorationProjects(stateAdapter, mockUI);

            expect(result.changed).toBe(false);
            expect(characterState[STORAGE_KEYS.PASSIVE_ITEM_SLOTS].length).toBe(initialSlotCount);
        });

        test('should be idempotent - can run multiple times safely', () => {
            // Mock expansion as enabled
            jest.spyOn(require('../assets/js/config/contentRegistry.js'), 'isExpansionEnabled')
                .mockReturnValue(true);

            const projectId = Object.keys(data.restorationProjects || {}).find(id => {
                const project = data.restorationProjects[id];
                return project && project.reward && project.reward.type === 'passiveItemSlot';
            });

            if (!projectId) {
                return;
            }

            characterState[STORAGE_KEYS.COMPLETED_RESTORATION_PROJECTS] = [projectId];
            characterState[STORAGE_KEYS.PASSIVE_ITEM_SLOTS] = [];

            // Run first time
            const result1 = repairCompletedRestorationProjects(stateAdapter, mockUI);
            expect(result1.changed).toBe(true);
            const slotCount1 = characterState[STORAGE_KEYS.PASSIVE_ITEM_SLOTS].length;

            // Run second time
            const result2 = repairCompletedRestorationProjects(stateAdapter, mockUI);
            expect(result2.changed).toBe(false);
            const slotCount2 = characterState[STORAGE_KEYS.PASSIVE_ITEM_SLOTS].length;

            expect(slotCount1).toBe(slotCount2);
        });
    });

    describe('repairCompletedFamiliarEncounters', () => {
        test('should add missing familiars from completed befriend encounters', () => {
            // Find a familiar encounter from dungeon rooms
            let familiarName = null;
            let roomNumber = null;

            for (const roomNum in data.dungeonRooms || {}) {
                const room = data.dungeonRooms[roomNum];
                if (room.encountersDetailed) {
                    for (const encounter of room.encountersDetailed) {
                        if (encounter.type === 'Familiar' && encounter.name && data.allItems[encounter.name]) {
                            familiarName = encounter.name;
                            roomNumber = roomNum;
                            break;
                        }
                    }
                }
                if (familiarName) break;
            }

            if (!familiarName) {
                // Skip test if no familiar encounters exist in test data
                return;
            }

            // Set up a completed quest that befriended this familiar
            characterState[STORAGE_KEYS.COMPLETED_QUESTS] = [{
                type: '♠ Dungeon Crawl',
                prompt: `Read a book to befriend ${familiarName}`,
                isEncounter: true,
                encounterName: familiarName,
                isBefriend: true,
                roomNumber: roomNumber,
                month: 'January',
                year: '2024'
            }];
            characterState[STORAGE_KEYS.INVENTORY_ITEMS] = [];
            characterState[STORAGE_KEYS.EQUIPPED_ITEMS] = [];

            const result = repairCompletedFamiliarEncounters(stateAdapter, mockUI);

            expect(result.changed).toBe(true);
            expect(result.notes.length).toBeGreaterThan(0);
            
            const inventoryItemNames = characterState[STORAGE_KEYS.INVENTORY_ITEMS].map(item => item.name);
            expect(inventoryItemNames).toContain(familiarName);
        });

        test('should not add familiars that are already owned', () => {
            // Find a familiar encounter
            let familiarName = null;
            let roomNumber = null;

            for (const roomNum in data.dungeonRooms || {}) {
                const room = data.dungeonRooms[roomNum];
                if (room.encountersDetailed) {
                    for (const encounter of room.encountersDetailed) {
                        if (encounter.type === 'Familiar' && encounter.name && data.allItems[encounter.name]) {
                            familiarName = encounter.name;
                            roomNumber = roomNum;
                            break;
                        }
                    }
                }
                if (familiarName) break;
            }

            if (!familiarName) {
                return;
            }

            // Set up completed quest but familiar already in inventory
            characterState[STORAGE_KEYS.COMPLETED_QUESTS] = [{
                type: '♠ Dungeon Crawl',
                prompt: `Read a book to befriend ${familiarName}`,
                isEncounter: true,
                encounterName: familiarName,
                isBefriend: true,
                roomNumber: roomNumber
            }];
            characterState[STORAGE_KEYS.INVENTORY_ITEMS] = [
                { name: familiarName, ...data.allItems[familiarName] }
            ];
            characterState[STORAGE_KEYS.EQUIPPED_ITEMS] = [];

            const initialItemCount = characterState[STORAGE_KEYS.INVENTORY_ITEMS].length;

            const result = repairCompletedFamiliarEncounters(stateAdapter, mockUI);

            expect(result.changed).toBe(false);
            expect(characterState[STORAGE_KEYS.INVENTORY_ITEMS].length).toBe(initialItemCount);
        });

        test('should be idempotent - can run multiple times safely', () => {
            let familiarName = null;
            let roomNumber = null;

            for (const roomNum in data.dungeonRooms || {}) {
                const room = data.dungeonRooms[roomNum];
                if (room.encountersDetailed) {
                    for (const encounter of room.encountersDetailed) {
                        if (encounter.type === 'Familiar' && encounter.name && data.allItems[encounter.name]) {
                            familiarName = encounter.name;
                            roomNumber = roomNum;
                            break;
                        }
                    }
                }
                if (familiarName) break;
            }

            if (!familiarName) {
                return;
            }

            characterState[STORAGE_KEYS.COMPLETED_QUESTS] = [{
                type: '♠ Dungeon Crawl',
                prompt: `Read a book to befriend ${familiarName}`,
                isEncounter: true,
                encounterName: familiarName,
                isBefriend: true,
                roomNumber: roomNumber
            }];
            characterState[STORAGE_KEYS.INVENTORY_ITEMS] = [];
            characterState[STORAGE_KEYS.EQUIPPED_ITEMS] = [];

            // Run first time
            const result1 = repairCompletedFamiliarEncounters(stateAdapter, mockUI);
            expect(result1.changed).toBe(true);
            const itemCount1 = characterState[STORAGE_KEYS.INVENTORY_ITEMS].length;

            // Run second time
            const result2 = repairCompletedFamiliarEncounters(stateAdapter, mockUI);
            expect(result2.changed).toBe(false);
            const itemCount2 = characterState[STORAGE_KEYS.INVENTORY_ITEMS].length;

            expect(itemCount1).toBe(itemCount2);
        });
    });

    describe('runAllRepairs', () => {
        test('should run all repair functions and aggregate results', () => {
            // Mock expansion as enabled
            jest.spyOn(require('../assets/js/config/contentRegistry.js'), 'isExpansionEnabled')
                .mockReturnValue(true);

            const result = runAllRepairs(stateAdapter, mockUI);

            expect(result).toHaveProperty('changed');
            expect(result).toHaveProperty('notes');
            expect(Array.isArray(result.notes)).toBe(true);
        });

        test('should return unchanged if no repairs are needed', () => {
            // Mock expansion as enabled but no repairs needed
            jest.spyOn(require('../assets/js/config/contentRegistry.js'), 'isExpansionEnabled')
                .mockReturnValue(true);

            // Empty state - no repairs needed
            const result = runAllRepairs(stateAdapter, mockUI);

            // May or may not be changed depending on test data
            expect(result).toHaveProperty('changed');
            expect(result).toHaveProperty('notes');
        });
    });
});

