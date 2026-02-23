/**
 * Tests for Library Restoration Expansion
 * 
 * Tests:
 * - Wing progress calculation
 * - Blueprint economy (earning/spending)
 * - Restoration project completion
 * - Passive slot management
 * - State validation and migration
 */

import { STORAGE_KEYS, createEmptyCharacterState } from '../assets/js/character-sheet/storageKeys.js';
import { validateCharacterState, SCHEMA_VERSION } from '../assets/js/character-sheet/dataValidator.js';
import { migrateState } from '../assets/js/character-sheet/dataMigrator.js';
import { StateAdapter } from '../assets/js/character-sheet/stateAdapter.js';
import { GAME_CONFIG } from '../assets/js/config/gameConfig.js';

describe('Library Restoration - Storage Keys', () => {
    test('should include all restoration-related storage keys', () => {
        expect(STORAGE_KEYS.DUSTY_BLUEPRINTS).toBe('dustyBlueprints');
        expect(STORAGE_KEYS.COMPLETED_RESTORATION_PROJECTS).toBe('completedRestorationProjects');
        expect(STORAGE_KEYS.COMPLETED_WINGS).toBe('completedWings');
        expect(STORAGE_KEYS.PASSIVE_ITEM_SLOTS).toBe('passiveItemSlots');
        expect(STORAGE_KEYS.PASSIVE_FAMILIAR_SLOTS).toBe('passiveFamiliarSlots');
    });

    test('createEmptyCharacterState should include restoration defaults', () => {
        const state = createEmptyCharacterState();
        
        expect(state[STORAGE_KEYS.DUSTY_BLUEPRINTS]).toBe(0);
        expect(state[STORAGE_KEYS.COMPLETED_RESTORATION_PROJECTS]).toEqual([]);
        expect(state[STORAGE_KEYS.COMPLETED_WINGS]).toEqual([]);
        expect(state[STORAGE_KEYS.PASSIVE_ITEM_SLOTS]).toEqual([]);
        expect(state[STORAGE_KEYS.PASSIVE_FAMILIAR_SLOTS]).toEqual([]);
    });
});

describe('Library Restoration - Data Validation', () => {
    test('schema version should be 4', () => {
        expect(SCHEMA_VERSION).toBe(4);
    });

    test('should validate dustyBlueprints as number', () => {
        const state = createEmptyCharacterState();
        state[STORAGE_KEYS.DUSTY_BLUEPRINTS] = 50;
        
        const validated = validateCharacterState(state);
        expect(validated[STORAGE_KEYS.DUSTY_BLUEPRINTS]).toBe(50);
    });

    test('should default invalid dustyBlueprints to 0', () => {
        const state = createEmptyCharacterState();
        state[STORAGE_KEYS.DUSTY_BLUEPRINTS] = 'invalid';
        
        const validated = validateCharacterState(state);
        expect(validated[STORAGE_KEYS.DUSTY_BLUEPRINTS]).toBe(0);
    });

    test('should validate completedRestorationProjects as string array', () => {
        const state = createEmptyCharacterState();
        state[STORAGE_KEYS.COMPLETED_RESTORATION_PROJECTS] = ['project-1', 'project-2'];
        
        const validated = validateCharacterState(state);
        expect(validated[STORAGE_KEYS.COMPLETED_RESTORATION_PROJECTS]).toEqual(['project-1', 'project-2']);
    });

    test('should filter invalid entries from completedRestorationProjects', () => {
        const state = createEmptyCharacterState();
        state[STORAGE_KEYS.COMPLETED_RESTORATION_PROJECTS] = ['valid', 123, null, '', 'also-valid'];
        
        const validated = validateCharacterState(state);
        expect(validated[STORAGE_KEYS.COMPLETED_RESTORATION_PROJECTS]).toEqual(['valid', 'also-valid']);
    });

    test('should validate passive slot objects', () => {
        const state = createEmptyCharacterState();
        state[STORAGE_KEYS.PASSIVE_ITEM_SLOTS] = [
            { slotId: 'slot-1', itemName: 'Test Item', unlockedFrom: 'project-1' },
            { slotId: 'slot-2', itemName: null }
        ];
        
        const validated = validateCharacterState(state);
        expect(validated[STORAGE_KEYS.PASSIVE_ITEM_SLOTS]).toHaveLength(2);
        expect(validated[STORAGE_KEYS.PASSIVE_ITEM_SLOTS][0].slotId).toBe('slot-1');
        expect(validated[STORAGE_KEYS.PASSIVE_ITEM_SLOTS][0].itemName).toBe('Test Item');
    });

    test('should filter invalid passive slots', () => {
        const state = createEmptyCharacterState();
        state[STORAGE_KEYS.PASSIVE_ITEM_SLOTS] = [
            { slotId: 'valid-slot', itemName: 'Item' },
            { itemName: 'Missing slotId' }, // Invalid - no slotId
            null,
            { slotId: '', itemName: 'Empty slotId' } // Invalid - empty slotId
        ];
        
        const validated = validateCharacterState(state);
        expect(validated[STORAGE_KEYS.PASSIVE_ITEM_SLOTS]).toHaveLength(1);
        expect(validated[STORAGE_KEYS.PASSIVE_ITEM_SLOTS][0].slotId).toBe('valid-slot');
    });
});

describe('Library Restoration - State Migration', () => {
    test('should migrate v1 state to v2 with restoration fields', () => {
        // Simulate a v1 state (no restoration fields)
        const v1State = {
            [STORAGE_KEYS.LEARNED_ABILITIES]: ['ability1'],
            [STORAGE_KEYS.EQUIPPED_ITEMS]: [],
            [STORAGE_KEYS.INVENTORY_ITEMS]: [],
            [STORAGE_KEYS.ACTIVE_ASSIGNMENTS]: [],
            [STORAGE_KEYS.COMPLETED_QUESTS]: [],
            [STORAGE_KEYS.DISCARDED_QUESTS]: [],
            [STORAGE_KEYS.ATMOSPHERIC_BUFFS]: {},
            [STORAGE_KEYS.ACTIVE_CURSES]: [],
            [STORAGE_KEYS.COMPLETED_CURSES]: [],
            [STORAGE_KEYS.TEMPORARY_BUFFS]: [],
            [STORAGE_KEYS.BUFF_MONTH_COUNTER]: 0,
            [STORAGE_KEYS.SELECTED_GENRES]: [],
            [STORAGE_KEYS.GENRE_DICE_SELECTION]: 'd6'
        };

        // Mock localStorage to return version 1
        const originalGetItem = localStorage.getItem;
        localStorage.getItem = jest.fn((key) => {
            if (key === 'tomeOfSecrets_schemaVersion') return '1';
            return null;
        });

        const migrated = migrateState(v1State);

        // Restore localStorage
        localStorage.getItem = originalGetItem;

        // Check that restoration fields were added
        expect(migrated[STORAGE_KEYS.DUSTY_BLUEPRINTS]).toBe(0);
        expect(migrated[STORAGE_KEYS.COMPLETED_RESTORATION_PROJECTS]).toEqual([]);
        expect(migrated[STORAGE_KEYS.COMPLETED_WINGS]).toEqual([]);
        expect(migrated[STORAGE_KEYS.PASSIVE_ITEM_SLOTS]).toEqual([]);
        expect(migrated[STORAGE_KEYS.PASSIVE_FAMILIAR_SLOTS]).toEqual([]);

        // Check that existing data is preserved
        expect(migrated[STORAGE_KEYS.LEARNED_ABILITIES]).toEqual(['ability1']);
    });
});

describe('Library Restoration - StateAdapter', () => {
    let stateAdapter;

    beforeEach(() => {
        const state = createEmptyCharacterState();
        stateAdapter = new StateAdapter(state);
        
        // Mock localStorage
        const storage = {};
        global.localStorage = {
            getItem: jest.fn((key) => storage[key] || null),
            setItem: jest.fn((key, value) => { storage[key] = value; }),
            removeItem: jest.fn((key) => { delete storage[key]; })
        };
    });

    describe('Dusty Blueprints', () => {
        test('should get initial blueprints as 0', () => {
            expect(stateAdapter.getDustyBlueprints()).toBe(0);
        });

        test('should add blueprints', () => {
            stateAdapter.addDustyBlueprints(25);
            expect(stateAdapter.getDustyBlueprints()).toBe(25);
            
            stateAdapter.addDustyBlueprints(10);
            expect(stateAdapter.getDustyBlueprints()).toBe(35);
        });

        test('should not add negative or zero blueprints', () => {
            stateAdapter.addDustyBlueprints(0);
            expect(stateAdapter.getDustyBlueprints()).toBe(0);
            
            stateAdapter.addDustyBlueprints(-5);
            expect(stateAdapter.getDustyBlueprints()).toBe(0);
        });

        test('should spend blueprints when sufficient', () => {
            stateAdapter.addDustyBlueprints(50);
            
            const result = stateAdapter.spendDustyBlueprints(25);
            expect(result).toBe(true);
            expect(stateAdapter.getDustyBlueprints()).toBe(25);
        });

        test('should not spend blueprints when insufficient', () => {
            stateAdapter.addDustyBlueprints(20);
            
            const result = stateAdapter.spendDustyBlueprints(30);
            expect(result).toBe(false);
            expect(stateAdapter.getDustyBlueprints()).toBe(20);
        });
    });

    describe('Completed Restoration Projects', () => {
        test('should complete a restoration project', () => {
            stateAdapter.completeRestorationProject('restore-card-catalog');
            
            const completed = stateAdapter.getCompletedRestorationProjects();
            expect(completed).toContain('restore-card-catalog');
        });

        test('should not duplicate completed projects', () => {
            stateAdapter.completeRestorationProject('restore-card-catalog');
            stateAdapter.completeRestorationProject('restore-card-catalog');
            
            const completed = stateAdapter.getCompletedRestorationProjects();
            expect(completed).toHaveLength(1);
        });

        test('should check if project is completed', () => {
            stateAdapter.completeRestorationProject('restore-card-catalog');
            
            expect(stateAdapter.isRestorationProjectCompleted('restore-card-catalog')).toBe(true);
            expect(stateAdapter.isRestorationProjectCompleted('other-project')).toBe(false);
        });
    });

    describe('Completed Wings', () => {
        test('should complete a wing', () => {
            stateAdapter.completeWing('1');
            
            const completed = stateAdapter.getCompletedWings();
            expect(completed).toContain('1');
        });

        test('should check if wing is completed', () => {
            stateAdapter.completeWing('1');
            
            expect(stateAdapter.isWingCompleted('1')).toBe(true);
            expect(stateAdapter.isWingCompleted('2')).toBe(false);
        });
    });

    describe('Passive Item Slots', () => {
        test('should add a passive item slot', () => {
            const slot = stateAdapter.addPassiveItemSlot('slot-1', 'restore-card-catalog');
            
            expect(slot).not.toBeNull();
            expect(slot.slotId).toBe('slot-1');
            expect(slot.itemName).toBeNull();
            expect(slot.unlockedFrom).toBe('restore-card-catalog');
        });

        test('should not add duplicate slot IDs', () => {
            stateAdapter.addPassiveItemSlot('slot-1');
            stateAdapter.addPassiveItemSlot('slot-1');
            
            const slots = stateAdapter.getPassiveItemSlots();
            expect(slots).toHaveLength(1);
        });

        test('should assign item to passive slot', () => {
            stateAdapter.addPassiveItemSlot('slot-1');
            
            const updated = stateAdapter.setPassiveSlotItem('slot-1', 'Librarian\'s Compass');
            
            expect(updated).not.toBeNull();
            expect(updated.itemName).toBe('Librarian\'s Compass');
        });

        test('should clear item from passive slot', () => {
            stateAdapter.addPassiveItemSlot('slot-1');
            stateAdapter.setPassiveSlotItem('slot-1', 'Librarian\'s Compass');
            stateAdapter.setPassiveSlotItem('slot-1', null);
            
            const slots = stateAdapter.getPassiveItemSlots();
            expect(slots[0].itemName).toBeNull();
        });
    });

    describe('Passive Familiar Slots', () => {
        test('should add a passive familiar slot', () => {
            const slot = stateAdapter.addPassiveFamiliarSlot('familiar-slot-1', 'repair-reading-lamps');
            
            expect(slot).not.toBeNull();
            expect(slot.slotId).toBe('familiar-slot-1');
        });

        test('should assign familiar to passive slot', () => {
            stateAdapter.addPassiveFamiliarSlot('familiar-slot-1');
            
            const updated = stateAdapter.setPassiveFamiliarSlotItem('familiar-slot-1', 'Tome-Bound Cat');
            
            expect(updated).not.toBeNull();
            expect(updated.itemName).toBe('Tome-Bound Cat');
        });
    });
});

describe('Library Restoration - Game Config', () => {
    test('should have restoration configuration', () => {
        expect(GAME_CONFIG.restoration).toBeDefined();
    });

    test('should have wing completion rewards', () => {
        expect(GAME_CONFIG.restoration.wingCompletionRewards).toBeDefined();
        expect(GAME_CONFIG.restoration.wingCompletionRewards.inkDrops).toBe(100);
        expect(GAME_CONFIG.restoration.wingCompletionRewards.paperScraps).toBe(40);
        expect(GAME_CONFIG.restoration.wingCompletionRewards.xp).toBe(75);
    });

    test('should have blueprint reward values', () => {
        // Extra credit completions grant 10 blueprints per the plan
        expect(GAME_CONFIG.restoration.extraCreditBlueprintReward).toBe(10);
    });

    test('should have wing passive bonus', () => {
        // +4 Ink Drops for matching genre books per wing completion
        expect(GAME_CONFIG.restoration.wingPassiveBonus).toBe(4);
    });
});

