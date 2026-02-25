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
import { normalizeQuestPeriod, PERIOD_TYPES } from '../services/PeriodService.js';

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
 * Generate a UUID for book and quest ids (Schema v5)
 */
function generateId() {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        return crypto.randomUUID();
    }
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
        const r = Math.random() * 16 | 0;
        const v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

/**
 * Migration from schema version 4 to version 5 (Book-First Paradigm)
 * - Adds characterState.books and characterState.exchangeProgram (empty objects if missing)
 * - For each quest in activeAssignments, completedQuests, discardedQuests: create a Book
 *   from book/bookAuthor/coverUrl/pageCountRaw/pageCountEffective; set quest.bookId and
 *   quest.id; set book.links.tomeQuestId to quest id
 */
function migrateToVersion5(state) {
    const migrated = { ...state };

    if (!(STORAGE_KEYS.BOOKS in migrated) || typeof migrated[STORAGE_KEYS.BOOKS] !== 'object') {
        migrated[STORAGE_KEYS.BOOKS] = {};
    }
    if (!(STORAGE_KEYS.EXTERNAL_CURRICULUM in migrated) || typeof migrated[STORAGE_KEYS.EXTERNAL_CURRICULUM] !== 'object') {
        migrated[STORAGE_KEYS.EXTERNAL_CURRICULUM] = { curriculums: {} };
    }

    const books = { ...migrated[STORAGE_KEYS.BOOKS] };
    const now = new Date().toISOString();
    /** Dedupe key: normalized "title|author" so multiple quests for the same book share one Book */
    const bookIdByTitleAuthor = new Map();
    const questKeys = [
        STORAGE_KEYS.ACTIVE_ASSIGNMENTS,
        STORAGE_KEYS.COMPLETED_QUESTS,
        STORAGE_KEYS.DISCARDED_QUESTS
    ];

    function titleAuthorKey(quest) {
        const title = (typeof quest.book === 'string' ? quest.book : '').toLowerCase().trim();
        const author = (typeof quest.bookAuthor === 'string' ? quest.bookAuthor : '').toLowerCase().trim();
        return `${title}|${author}`;
    }

    questKeys.forEach(key => {
        if (!Array.isArray(migrated[key])) return;
        const isCompletedList = key === STORAGE_KEYS.COMPLETED_QUESTS;
        migrated[key] = migrated[key].map(quest => {
            if (!quest || typeof quest !== 'object') return quest;
            const hasBookData = quest.book || quest.bookAuthor || quest.coverUrl != null ||
                (typeof quest.pageCountRaw === 'number' && !isNaN(quest.pageCountRaw)) ||
                (typeof quest.pageCountEffective === 'number' && !isNaN(quest.pageCountEffective));
            const questId = quest.id || generateId();
            let bookId = quest.bookId || null;
            if (hasBookData) {
                const keyTA = titleAuthorKey(quest);
                const existingBookId = bookIdByTitleAuthor.get(keyTA);
                if (existingBookId && books[existingBookId]) {
                    bookId = existingBookId;
                    const existingBook = books[bookId];
                    if (existingBook.links && Array.isArray(existingBook.links.questIds) && !existingBook.links.questIds.includes(questId)) {
                        existingBook.links.questIds.push(questId);
                    }
                    if (isCompletedList) {
                        existingBook.status = 'completed';
                        existingBook.dateCompleted = typeof quest.dateCompleted === 'string' ? quest.dateCompleted : now;
                    }
                } else {
                    bookId = bookId || generateId();
                    bookIdByTitleAuthor.set(keyTA, bookId);
                    books[bookId] = {
                        id: bookId,
                        title: typeof quest.book === 'string' ? quest.book : '',
                        author: typeof quest.bookAuthor === 'string' ? quest.bookAuthor : '',
                        cover: typeof quest.coverUrl === 'string' ? quest.coverUrl : (typeof quest.cover === 'string' ? quest.cover : null),
                        pageCount: typeof quest.pageCountRaw === 'number' && !isNaN(quest.pageCountRaw) ? Math.max(0, Math.floor(quest.pageCountRaw)) : (typeof quest.pageCount === 'number' && !isNaN(quest.pageCount) ? Math.max(0, Math.floor(quest.pageCount)) : null),
                        status: isCompletedList ? 'completed' : 'reading',
                        dateAdded: typeof quest.dateAdded === 'string' ? quest.dateAdded : now,
                        dateCompleted: isCompletedList ? (typeof quest.dateCompleted === 'string' ? quest.dateCompleted : now) : null,
                        links: {
                            questIds: [questId],
                            curriculumPromptIds: []
                        }
                    };
                }
            }
            return {
                ...quest,
                id: questId,
                bookId: bookId
            };
        });
    });

    migrated[STORAGE_KEYS.BOOKS] = books;
    return migrated;
}

/**
 * Migration from schema version 3 to version 4
 * - Adds Grimoire Gallery metadata to all quests: coverUrl, pageCountRaw, pageCountEffective
 * - Values are null for existing quests; populated when user selects a book via API or edits
 */
function migrateToVersion4(state) {
    const migrated = { ...state };

    const questKeys = [
        STORAGE_KEYS.ACTIVE_ASSIGNMENTS,
        STORAGE_KEYS.COMPLETED_QUESTS,
        STORAGE_KEYS.DISCARDED_QUESTS
    ];

    questKeys.forEach(key => {
        if (Array.isArray(migrated[key])) {
            migrated[key] = migrated[key].map(quest => {
                if (!quest || typeof quest !== 'object') {
                    return quest;
                }
                return {
                    ...quest,
                    coverUrl: quest.coverUrl ?? null,
                    pageCountRaw: typeof quest.pageCountRaw === 'number' && !isNaN(quest.pageCountRaw) ? quest.pageCountRaw : null,
                    pageCountEffective: typeof quest.pageCountEffective === 'number' && !isNaN(quest.pageCountEffective) ? quest.pageCountEffective : null
                };
            });
        }
    });

    return migrated;
}

/**
 * Migration from schema version 2 to version 3
 * - Adds dateAdded and dateCompleted fields to all quests
 * - Sets dateAdded to null for existing quests (will be set on next creation)
 * - Sets dateCompleted to null for existing quests (will be set on next completion)
 * - Normalizes invalid month/year values based on dates when available (Phase 2.2)
 */
function migrateToVersion3(state) {
    const migrated = { ...state };

    // Migrate quest arrays to add date fields and normalize month/year
    const questKeys = [
        STORAGE_KEYS.ACTIVE_ASSIGNMENTS,
        STORAGE_KEYS.COMPLETED_QUESTS,
        STORAGE_KEYS.DISCARDED_QUESTS
    ];

    questKeys.forEach(key => {
        if (Array.isArray(migrated[key])) {
            migrated[key] = migrated[key].map(quest => {
                if (!quest || typeof quest !== 'object') {
                    return quest;
                }
                // Add date fields if they don't exist
                const questWithDates = {
                    ...quest,
                    dateAdded: quest.dateAdded || null,
                    dateCompleted: quest.dateCompleted || null
                };
                
                // Normalize month/year if invalid but dates are available
                // This fixes quests with typos, abbreviations, or invalid values
                const normalized = normalizeQuestPeriod(questWithDates, PERIOD_TYPES.MONTHLY);
                return normalized;
            });
        }
    });

    return migrated;
}

/**
 * Migration from schema version 1 to version 2
 * - Adds Library Restoration Expansion fields
 * - Adds dustyBlueprints, completedRestorationProjects, completedWings
 * - Adds passiveItemSlots, passiveFamiliarSlots
 */
function migrateToVersion2(state) {
    const migrated = { ...state };

    // Add new restoration-related fields with safe defaults
    if (!(STORAGE_KEYS.DUSTY_BLUEPRINTS in migrated)) {
        migrated[STORAGE_KEYS.DUSTY_BLUEPRINTS] = 0;
    }
    if (!(STORAGE_KEYS.COMPLETED_RESTORATION_PROJECTS in migrated)) {
        migrated[STORAGE_KEYS.COMPLETED_RESTORATION_PROJECTS] = [];
    }
    if (!(STORAGE_KEYS.COMPLETED_WINGS in migrated)) {
        migrated[STORAGE_KEYS.COMPLETED_WINGS] = [];
    }
    if (!(STORAGE_KEYS.PASSIVE_ITEM_SLOTS in migrated)) {
        migrated[STORAGE_KEYS.PASSIVE_ITEM_SLOTS] = [];
    }
    if (!(STORAGE_KEYS.PASSIVE_FAMILIAR_SLOTS in migrated)) {
        migrated[STORAGE_KEYS.PASSIVE_FAMILIAR_SLOTS] = [];
    }

    return migrated;
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
            case 2:
                migratedState = migrateToVersion2(migratedState);
                break;
            case 3:
                migratedState = migrateToVersion3(migratedState);
                break;
            case 4:
                migratedState = migrateToVersion4(migratedState);
                break;
            case 5:
                migratedState = migrateToVersion5(migratedState);
                break;
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
        STORAGE_KEYS.GENRE_DICE_SELECTION,
        // Library Restoration Expansion
        STORAGE_KEYS.DUSTY_BLUEPRINTS,
        STORAGE_KEYS.COMPLETED_RESTORATION_PROJECTS,
        STORAGE_KEYS.COMPLETED_WINGS,
        STORAGE_KEYS.PASSIVE_ITEM_SLOTS,
        STORAGE_KEYS.PASSIVE_FAMILIAR_SLOTS,
        STORAGE_KEYS.CLAIMED_ROOM_REWARDS,
        STORAGE_KEYS.DUNGEON_COMPLETION_DRAWS_REDEEMED,
        STORAGE_KEYS.BOOKS,
        STORAGE_KEYS.EXTERNAL_CURRICULUM
    ];

    stateKeys.forEach(key => {
        let defaultValue;
        if (key === STORAGE_KEYS.ATMOSPHERIC_BUFFS || key === STORAGE_KEYS.BOOKS) {
            defaultValue = {};
        } else if (key === STORAGE_KEYS.EXTERNAL_CURRICULUM) {
            defaultValue = { curriculums: {} };
        } else if (key === STORAGE_KEYS.BUFF_MONTH_COUNTER || key === STORAGE_KEYS.DUSTY_BLUEPRINTS) {
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

