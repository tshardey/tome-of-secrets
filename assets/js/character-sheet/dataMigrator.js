/**
 * Data Migration System
 * 
 * Handles migration of old save formats to current schema version.
 * Migrations are incremental - each version migrates from the previous one.
 * 
 * **CRITICAL:** Migrations should preserve all player data. Never lose progress.
 */

import { STORAGE_KEYS } from './storageKeys.js';
import { GAME_CONFIG } from '../config/gameConfig.js';
import { getStoredSchemaVersion, SCHEMA_VERSION, saveSchemaVersion } from './dataValidator.js';
import { safeGetJSON } from '../utils/storage.js';

/**
 * Migrate quest rewards from legacy format
 * This handles quests that don't have rewards objects
 */
function migrateQuestRewards(quest) {
    if (!quest || typeof quest !== 'object') {
        return quest;
    }

    // If quest already has rewards, ensure it's valid
    if (quest.rewards && typeof quest.rewards === 'object') {
        return quest;
    }

    // Generate default rewards based on quest type
    const defaultRewards = {
        xp: 0,
        inkDrops: 0,
        paperScraps: 0,
        items: [],
        modifiedBy: []
    };

    if (quest.type === '♥ Organize the Stacks') {
        defaultRewards.xp = GAME_CONFIG.rewards.organizeTheStacks.xp;
        defaultRewards.inkDrops = GAME_CONFIG.rewards.organizeTheStacks.inkDrops;
    } else if (quest.type === '⭐ Extra Credit') {
        defaultRewards.paperScraps = GAME_CONFIG.rewards.extraCredit.paperScraps;
    } else if (quest.type === '♠ Dungeon Crawl' && quest.isEncounter) {
        // Default encounter rewards
        defaultRewards.xp = GAME_CONFIG.rewards.encounter.monster.xp;
    } else {
        // Default quest completion rewards
        defaultRewards.xp = GAME_CONFIG.rewards.defaultQuestCompletion.xp;
        defaultRewards.inkDrops = GAME_CONFIG.rewards.defaultQuestCompletion.inkDrops;
    }

    return {
        ...quest,
        rewards: defaultRewards
    };
}

/**
 * Migration from schema version 0 (no version) to version 1
 * - Adds rewards objects to quests that don't have them
 * - Ensures all quests have required fields
 */
function migrateToVersion1(state) {
    const migrated = { ...state };

    // Migrate quest arrays
    const questKeys = [
        STORAGE_KEYS.ACTIVE_ASSIGNMENTS,
        STORAGE_KEYS.COMPLETED_QUESTS,
        STORAGE_KEYS.DISCARDED_QUESTS
    ];

    questKeys.forEach(key => {
        if (Array.isArray(migrated[key])) {
            migrated[key] = migrated[key].map(migrateQuestRewards);
        }
    });

    // Ensure all state keys exist with defaults
    const defaultState = {
        [STORAGE_KEYS.ACTIVE_ASSIGNMENTS]: [],
        [STORAGE_KEYS.COMPLETED_QUESTS]: [],
        [STORAGE_KEYS.DISCARDED_QUESTS]: [],
        [STORAGE_KEYS.EQUIPPED_ITEMS]: [],
        [STORAGE_KEYS.INVENTORY_ITEMS]: [],
        [STORAGE_KEYS.LEARNED_ABILITIES]: [],
        [STORAGE_KEYS.ATMOSPHERIC_BUFFS]: {},
        [STORAGE_KEYS.ACTIVE_CURSES]: [],
        [STORAGE_KEYS.COMPLETED_CURSES]: [],
        [STORAGE_KEYS.TEMPORARY_BUFFS]: [],
        [STORAGE_KEYS.BUFF_MONTH_COUNTER]: 0,
        [STORAGE_KEYS.SELECTED_GENRES]: [],
        [STORAGE_KEYS.GENRE_DICE_SELECTION]: 'd6'
    };

    // Merge defaults with existing state
    Object.keys(defaultState).forEach(key => {
        if (!(key in migrated)) {
            migrated[key] = defaultState[key];
        }
    });

    return migrated;
}

/**
 * Run all necessary migrations to bring data to current schema version
 * @param {Object} state - Current state object
 * @returns {Object} - Migrated state object
 */
export function migrateState(state) {
    const storedVersion = getStoredSchemaVersion();
    
    // If already at current version, no migration needed
    if (storedVersion === SCHEMA_VERSION) {
        return state;
    }

    // If no version stored, assume version 0 (pre-versioning)
    let currentVersion = storedVersion !== null ? storedVersion : 0;
    let migratedState = { ...state };

    console.log(`Migrating data from schema version ${currentVersion} to ${SCHEMA_VERSION}`);

    // Apply migrations incrementally
    while (currentVersion < SCHEMA_VERSION) {
        const nextVersion = currentVersion + 1;
        
        switch (nextVersion) {
            case 1:
                migratedState = migrateToVersion1(migratedState);
                break;
            // Add future migrations here:
            // case 2:
            //     migratedState = migrateToVersion2(migratedState);
            //     break;
            default:
                console.warn(`No migration defined for version ${nextVersion}`);
                break;
        }
        
        currentVersion = nextVersion;
    }

    // Save new schema version
    saveSchemaVersion();

    console.log(`Migration complete. Data is now at schema version ${SCHEMA_VERSION}`);
    return migratedState;
}

/**
 * Load and migrate all state from localStorage
 * This is the main entry point for loading state with migration support
 * @returns {Object} - Migrated and validated state object
 */
export function loadAndMigrateState() {
    const state = {};
    
    // Load all state keys from localStorage
    const stateKeys = [
        STORAGE_KEYS.ACTIVE_ASSIGNMENTS,
        STORAGE_KEYS.COMPLETED_QUESTS,
        STORAGE_KEYS.DISCARDED_QUESTS,
        STORAGE_KEYS.EQUIPPED_ITEMS,
        STORAGE_KEYS.INVENTORY_ITEMS,
        STORAGE_KEYS.LEARNED_ABILITIES,
        STORAGE_KEYS.ATMOSPHERIC_BUFFS,
        STORAGE_KEYS.ACTIVE_CURSES,
        STORAGE_KEYS.COMPLETED_CURSES,
        STORAGE_KEYS.TEMPORARY_BUFFS,
        STORAGE_KEYS.BUFF_MONTH_COUNTER,
        STORAGE_KEYS.SELECTED_GENRES,
        STORAGE_KEYS.GENRE_DICE_SELECTION
    ];

    stateKeys.forEach(key => {
        let defaultValue;
        if (key === STORAGE_KEYS.ATMOSPHERIC_BUFFS) {
            defaultValue = {};
        } else if (key === STORAGE_KEYS.BUFF_MONTH_COUNTER) {
            defaultValue = 0;
        } else if (key === STORAGE_KEYS.GENRE_DICE_SELECTION) {
            defaultValue = 'd6';
        } else {
            defaultValue = [];
        }
        state[key] = safeGetJSON(key, defaultValue);
    });

    // Migrate state to current schema version
    return migrateState(state);
}

