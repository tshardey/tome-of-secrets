/**
 * Data Validator and Migration System
 * 
 * Ensures localStorage data stays consistent and valid.
 * Handles schema migrations and corrupted data gracefully.
 * 
 * **CRITICAL:** Never lose player data. If data is invalid, fix it or use safe defaults.
 */

import { STORAGE_KEYS, createEmptyCharacterState } from './storageKeys.js';
import { GAME_CONFIG } from '../config/gameConfig.js';
import { normalizeQuestPeriod, PERIOD_TYPES } from '../services/PeriodService.js';

/**
 * Current schema version - increment when data structure changes
 * Version 2: Added Library Restoration Expansion fields
 * Version 3: Added quest date tracking (dateAdded, dateCompleted)
 * Version 4: Added Grimoire Gallery metadata on quests (coverUrl, pageCountRaw, pageCountEffective)
 * Version 5: Book-First Paradigm - books and exchangeProgram state; quests have bookId and id
 */
export const SCHEMA_VERSION = 5;

/**
 * Schema version key in localStorage
 */
const SCHEMA_VERSION_KEY = 'tomeOfSecrets_schemaVersion';

/**
 * Get current schema version from localStorage
 */
export function getStoredSchemaVersion() {
    try {
        const version = localStorage.getItem(SCHEMA_VERSION_KEY);
        return version ? parseInt(version, 10) : null;
    } catch (error) {
        console.warn('Failed to read schema version:', error);
        return null;
    }
}

/**
 * Save current schema version to localStorage
 */
export function saveSchemaVersion() {
    try {
        localStorage.setItem(SCHEMA_VERSION_KEY, SCHEMA_VERSION.toString());
        return true;
    } catch (error) {
        console.error('Failed to save schema version:', error);
        return false;
    }
}

/**
 * Validate and fix a quest object
 * @param {*} quest - Quest object to validate
 * @param {string} context - Context for error messages (e.g., 'activeAssignments[0]')
 * @returns {Object|null} - Validated quest object, or null if unfixable
 */
function validateQuest(quest, context = 'quest') {
    if (!quest || typeof quest !== 'object') {
        console.warn(`Invalid quest in ${context}: not an object, using default`);
        return null;
    }

    // Handle month/year - convert numeric values to strings (legacy data support)
    // normalizeQuestPeriod will handle the conversion, but we need to preserve numeric values here
    const monthValue = quest.month != null ? (typeof quest.month === 'string' ? quest.month : String(quest.month)) : '';
    const yearValue = quest.year != null ? (typeof quest.year === 'string' ? quest.year : String(quest.year)) : '';

    // Required fields with defaults
    const validated = {
        type: typeof quest.type === 'string' ? quest.type : '',
        prompt: typeof quest.prompt === 'string' ? quest.prompt : '',
        book: typeof quest.book === 'string' ? quest.book : '',
        bookAuthor: typeof quest.bookAuthor === 'string' ? quest.bookAuthor : '',
        month: monthValue,
        year: yearValue,
        status: typeof quest.status === 'string' ? quest.status : 'active',
        notes: typeof quest.notes === 'string' ? quest.notes : '',
        buffs: Array.isArray(quest.buffs) ? quest.buffs.filter(b => typeof b === 'string') : [],
        rewards: validateRewards(quest.rewards, `${context}.rewards`),
        isEncounter: typeof quest.isEncounter === 'boolean' ? quest.isEncounter : false,
        roomNumber: quest.roomNumber || null,
        encounterName: typeof quest.encounterName === 'string' ? quest.encounterName : null,
        // Preserve restorationData for restoration project quests
        restorationData: quest.restorationData && typeof quest.restorationData === 'object' ? quest.restorationData : null,
        // Date tracking fields (Schema v3)
        dateAdded: typeof quest.dateAdded === 'string' ? quest.dateAdded : null,
        dateCompleted: typeof quest.dateCompleted === 'string' ? quest.dateCompleted : null,
        // Grimoire Gallery metadata (Schema v4)
        coverUrl: typeof quest.coverUrl === 'string' ? quest.coverUrl : null,
        pageCountRaw: typeof quest.pageCountRaw === 'number' && !isNaN(quest.pageCountRaw) ? Math.max(0, Math.floor(quest.pageCountRaw)) : null,
        pageCountEffective: typeof quest.pageCountEffective === 'number' && !isNaN(quest.pageCountEffective) ? Math.max(0, Math.floor(quest.pageCountEffective)) : null,
        // Book-First (Schema v5)
        id: typeof quest.id === 'string' && quest.id.trim() ? quest.id.trim() : null,
        bookId: typeof quest.bookId === 'string' && quest.bookId.trim() ? quest.bookId.trim() : null
    };

    // Normalize month/year if they're invalid but dates are available (Phase 2.2)
    // This fixes quests with typos, abbreviations, numeric values, or invalid month/year values
    const normalized = normalizeQuestPeriod(validated, PERIOD_TYPES.MONTHLY);
    if (normalized.month !== validated.month || normalized.year !== validated.year) {
        console.info(`Fixed invalid month/year in ${context}: "${validated.month}" "${validated.year}" -> "${normalized.month}" "${normalized.year}"`);
        validated.month = normalized.month;
        validated.year = normalized.year;
    }

    // Warn about missing critical fields but don't fail
    if (!validated.type) {
        console.warn(`Quest in ${context} missing type field`);
    }

    return validated;
}

/**
 * Validate and fix a rewards object
 * @param {*} rewards - Rewards object to validate
 * @param {string} context - Context for error messages
 * @returns {Object} - Validated rewards object with safe defaults
 */
function validateRewards(rewards, context = 'rewards') {
    if (!rewards || typeof rewards !== 'object') {
        return {
            xp: 0,
            inkDrops: 0,
            paperScraps: 0,
            items: [],
            modifiedBy: []
        };
    }

    return {
        xp: typeof rewards.xp === 'number' && !isNaN(rewards.xp) ? Math.max(0, rewards.xp) : 0,
        inkDrops: typeof rewards.inkDrops === 'number' && !isNaN(rewards.inkDrops) ? Math.max(0, rewards.inkDrops) : 0,
        paperScraps: typeof rewards.paperScraps === 'number' && !isNaN(rewards.paperScraps) ? Math.max(0, rewards.paperScraps) : 0,
        items: Array.isArray(rewards.items) ? rewards.items.filter(item => typeof item === 'string') : [],
        modifiedBy: Array.isArray(rewards.modifiedBy) ? rewards.modifiedBy.filter(mod => typeof mod === 'string') : []
    };
}

/**
 * Validate and fix an item object
 * @param {*} item - Item object to validate
 * @param {string} context - Context for error messages
 * @returns {Object|null} - Validated item object, or null if unfixable
 */
function validateItem(item, context = 'item') {
    if (!item || typeof item !== 'object') {
        console.warn(`Invalid item in ${context}: not an object`);
        return null;
    }

    if (typeof item.name !== 'string' || !item.name.trim()) {
        console.warn(`Invalid item in ${context}: missing or invalid name`);
        return null;
    }

    return {
        name: item.name.trim(),
        type: typeof item.type === 'string' ? item.type : '',
        img: typeof item.img === 'string' ? item.img : '',
        bonus: typeof item.bonus === 'string' ? item.bonus : ''
    };
}

/**
 * Validate and fix a curse object
 * @param {*} curse - Curse object to validate
 * @param {string} context - Context for error messages
 * @returns {Object|null} - Validated curse object, or null if unfixable
 */
function validateCurse(curse, context = 'curse') {
    if (!curse || typeof curse !== 'object') {
        console.warn(`Invalid curse in ${context}: not an object`);
        return null;
    }

    if (typeof curse.name !== 'string' || !curse.name.trim()) {
        console.warn(`Invalid curse in ${context}: missing or invalid name`);
        return null;
    }

    return {
        name: curse.name.trim(),
        requirement: typeof curse.requirement === 'string' ? curse.requirement : '',
        book: typeof curse.book === 'string' ? curse.book : ''
    };
}

/**
 * Validate and fix a temporary buff object
 * @param {*} buff - Temporary buff object to validate
 * @param {string} context - Context for error messages
 * @returns {Object|null} - Validated buff object, or null if unfixable
 */
function validateTemporaryBuff(buff, context = 'temporaryBuff') {
    if (!buff || typeof buff !== 'object') {
        console.warn(`Invalid temporary buff in ${context}: not an object`);
        return null;
    }

    if (typeof buff.name !== 'string' || !buff.name.trim()) {
        console.warn(`Invalid temporary buff in ${context}: missing or invalid name`);
        return null;
    }

    return {
        name: buff.name.trim(),
        description: typeof buff.description === 'string' ? buff.description : '',
        duration: typeof buff.duration === 'string' ? buff.duration : 'two-months',
        monthsRemaining: typeof buff.monthsRemaining === 'number' && !isNaN(buff.monthsRemaining) 
            ? Math.max(0, Math.floor(buff.monthsRemaining)) 
            : 0,
        status: typeof buff.status === 'string' ? buff.status : 'active'
    };
}

/**
 * Validate and fix atmospheric buffs object
 * @param {*} atmosphericBuffs - Atmospheric buffs object to validate
 * @returns {Object} - Validated atmospheric buffs object
 */
function validateAtmosphericBuffs(atmosphericBuffs) {
    if (!atmosphericBuffs || typeof atmosphericBuffs !== 'object') {
        return {};
    }

    const validated = {};
    for (const buffName in atmosphericBuffs) {
        const buff = atmosphericBuffs[buffName];
        if (buff && typeof buff === 'object') {
            validated[buffName] = {
                daysUsed: typeof buff.daysUsed === 'number' && !isNaN(buff.daysUsed) 
                    ? Math.max(0, Math.floor(buff.daysUsed)) 
                    : 0,
                isActive: typeof buff.isActive === 'boolean' ? buff.isActive : false
            };
        }
    }
    return validated;
}

/**
 * Validate and fix an array of quests
 * @param {Array} quests - Array of quest objects
 * @param {string} context - Context for error messages
 * @returns {Array} - Array of validated quest objects
 */
function validateQuestArray(quests, context = 'quests') {
    if (!Array.isArray(quests)) {
        console.warn(`Invalid ${context}: not an array, using empty array`);
        return [];
    }

    const validated = [];
    quests.forEach((quest, index) => {
        const validatedQuest = validateQuest(quest, `${context}[${index}]`);
        if (validatedQuest) {
            validated.push(validatedQuest);
        } else {
            console.warn(`Skipping invalid quest at ${context}[${index}]`);
        }
    });
    return validated;
}

/**
 * Validate and fix an array of items
 * @param {Array} items - Array of item objects
 * @param {string} context - Context for error messages
 * @returns {Array} - Array of validated item objects
 */
function validateItemArray(items, context = 'items') {
    if (!Array.isArray(items)) {
        console.warn(`Invalid ${context}: not an array, using empty array`);
        return [];
    }

    const validated = [];
    items.forEach((item, index) => {
        const validatedItem = validateItem(item, `${context}[${index}]`);
        if (validatedItem) {
            validated.push(validatedItem);
        } else {
            console.warn(`Skipping invalid item at ${context}[${index}]`);
        }
    });
    return validated;
}

/**
 * Validate and fix an array of curses
 * @param {Array} curses - Array of curse objects
 * @param {string} context - Context for error messages
 * @returns {Array} - Array of validated curse objects
 */
function validateCurseArray(curses, context = 'curses') {
    if (!Array.isArray(curses)) {
        console.warn(`Invalid ${context}: not an array, using empty array`);
        return [];
    }

    const validated = [];
    curses.forEach((curse, index) => {
        const validatedCurse = validateCurse(curse, `${context}[${index}]`);
        if (validatedCurse) {
            validated.push(validatedCurse);
        } else {
            console.warn(`Skipping invalid curse at ${context}[${index}]`);
        }
    });
    return validated;
}

/**
 * Validate and fix an array of temporary buffs
 * @param {Array} buffs - Array of temporary buff objects
 * @param {string} context - Context for error messages
 * @returns {Array} - Array of validated temporary buff objects
 */
function validateTemporaryBuffArray(buffs, context = 'temporaryBuffs') {
    if (!Array.isArray(buffs)) {
        console.warn(`Invalid ${context}: not an array, using empty array`);
        return [];
    }

    const validated = [];
    buffs.forEach((buff, index) => {
        const validatedBuff = validateTemporaryBuff(buff, `${context}[${index}]`);
        if (validatedBuff) {
            validated.push(validatedBuff);
        } else {
            console.warn(`Skipping invalid temporary buff at ${context}[${index}]`);
        }
    });
    return validated;
}

/**
 * Validate and fix an array of strings (e.g., learned abilities, selected genres)
 * @param {Array} strings - Array of strings
 * @param {string} context - Context for error messages
 * @returns {Array} - Array of validated strings
 */
function validateStringArray(strings, context = 'strings') {
    if (!Array.isArray(strings)) {
        console.warn(`Invalid ${context}: not an array, using empty array`);
        return [];
    }

    return strings.filter(str => typeof str === 'string' && str.trim().length > 0);
}

/**
 * Validate and fix a number value
 * @param {*} value - Value to validate
 * @param {number} defaultValue - Default value if invalid
 * @param {string} context - Context for error messages
 * @returns {number} - Validated number
 */
function validateNumber(value, defaultValue, context = 'number') {
    if (typeof value === 'number' && !isNaN(value)) {
        return value;
    }
    console.warn(`Invalid ${context}: not a number, using default ${defaultValue}`);
    return defaultValue;
}

const BOOK_STATUSES = ['reading', 'completed', 'other'];

/**
 * Validate and fix a book object (Schema v5)
 * @param {*} book - Book object to validate
 * @param {string} context - Context for error messages
 * @returns {Object|null} - Validated book object, or null if unfixable
 */
function validateBook(book, context = 'book') {
    if (!book || typeof book !== 'object') {
        return null;
    }
    const id = typeof book.id === 'string' && book.id.trim() ? book.id.trim() : null;
    if (!id) return null;
    const links = book.links && typeof book.links === 'object' ? book.links : {};
    return {
        id,
        title: typeof book.title === 'string' ? book.title : '',
        author: typeof book.author === 'string' ? book.author : '',
        cover: typeof book.cover === 'string' ? book.cover : (typeof book.coverUrl === 'string' ? book.coverUrl : null),
        pageCount: typeof book.pageCount === 'number' && !isNaN(book.pageCount) ? Math.max(0, Math.floor(book.pageCount)) : (typeof book.pageCountRaw === 'number' && !isNaN(book.pageCountRaw) ? Math.max(0, Math.floor(book.pageCountRaw)) : null),
        status: BOOK_STATUSES.includes(book.status) ? book.status : 'reading',
        dateAdded: typeof book.dateAdded === 'string' ? book.dateAdded : new Date().toISOString(),
        dateCompleted: typeof book.dateCompleted === 'string' ? book.dateCompleted : null,
        links: {
            questIds: Array.isArray(links.questIds) ? links.questIds.filter(x => typeof x === 'string') : (typeof links.tomeQuestId === 'string' ? [links.tomeQuestId] : []),
            curriculumPromptIds: Array.isArray(links.curriculumPromptIds) ? links.curriculumPromptIds.filter(x => typeof x === 'string') : []
        }
    };
}

/**
 * Validate and fix the books state object (Schema v5)
 * @param {*} books - books state (id -> book)
 * @returns {Object} - Validated books object
 */
function validateBooks(books) {
    if (!books || typeof books !== 'object' || Array.isArray(books)) {
        return {};
    }
    const validated = {};
    for (const id in books) {
        const book = validateBook(books[id], `books[${id}]`);
        if (book && book.id) {
            validated[book.id] = book;
        }
    }
    return validated;
}

/**
 * Validate a single external curriculum prompt
 */
function validateCurriculumPrompt(prompt, context = 'prompt') {
    if (!prompt || typeof prompt !== 'object') return null;
    const id = typeof prompt.id === 'string' && prompt.id.trim() ? prompt.id.trim() : null;
    if (!id) return null;
    return {
        id,
        text: typeof prompt.text === 'string' ? prompt.text : '',
        bookId: typeof prompt.bookId === 'string' && prompt.bookId.trim() ? prompt.bookId.trim() : null,
        completedAt: typeof prompt.completedAt === 'string' ? prompt.completedAt : null
    };
}

/**
 * Validate a single external curriculum category (prompts map)
 */
function validateCurriculumCategory(category, context = 'category') {
    if (!category || typeof category !== 'object') return null;
    const id = typeof category.id === 'string' && category.id.trim() ? category.id.trim() : null;
    if (!id) return null;
    const promptsRaw = category.prompts && typeof category.prompts === 'object' ? category.prompts : {};
    const prompts = {};
    for (const pid in promptsRaw) {
        const p = validateCurriculumPrompt(promptsRaw[pid], `${context}.prompts[${pid}]`);
        if (p && p.id) prompts[p.id] = p;
    }
    return {
        id,
        name: typeof category.name === 'string' ? category.name : '',
        prompts
    };
}

/**
 * Validate a single external curriculum (categories map)
 */
function validateCurriculum(curriculum, context = 'curriculum') {
    if (!curriculum || typeof curriculum !== 'object') return null;
    const id = typeof curriculum.id === 'string' && curriculum.id.trim() ? curriculum.id.trim() : null;
    if (!id) return null;

    // Curriculum type: supports multiple UI/behavior modes.
    // Default to 'prompt' (prompt-based list) for existing data.
    const rawType = typeof curriculum.type === 'string' ? curriculum.type : 'prompt';
    let type;
    if (rawType === 'book-club') type = 'book-club';
    else if (rawType === 'bingo') type = 'bingo';
    else type = 'prompt';

    const categoriesRaw = curriculum.categories && typeof curriculum.categories === 'object' ? curriculum.categories : {};
    const categories = {};
    for (const cid in categoriesRaw) {
        const c = validateCurriculumCategory(categoriesRaw[cid], `${context}.categories[${cid}]`);
        if (c && c.id) categories[c.id] = c;
    }
    const validated = {
        id,
        name: typeof curriculum.name === 'string' ? curriculum.name : '',
        type,
        categories
    };

    // Optional bingo board layout: array of prompt ids, persisted order.
    if (type === 'bingo') {
        const boardRaw = Array.isArray(curriculum.boardPromptIds) ? curriculum.boardPromptIds : [];
        validated.boardPromptIds = boardRaw
            .filter(idVal => typeof idVal === 'string' && idVal.trim())
            .map(idVal => idVal.trim());
    }

    return validated;
}

/**
 * Validate and fix the external curriculum state object (Schema v5)
 * Shape: { curriculums: { [curriculumId]: { id, name, categories: { [categoryId]: { id, name, prompts: { [promptId]: { id, text, bookId, completedAt } } } } } }
 * @param {*} externalCurriculum - external curriculum state (stored under key 'exchangeProgram')
 * @returns {Object} - Validated object with curriculums key
 */
function validateExternalCurriculum(externalCurriculum) {
    if (!externalCurriculum || typeof externalCurriculum !== 'object' || Array.isArray(externalCurriculum)) {
        return { curriculums: {} };
    }
    const curriculumsRaw = externalCurriculum.curriculums && typeof externalCurriculum.curriculums === 'object' ? externalCurriculum.curriculums : {};
    const curriculums = {};
    for (const cid in curriculumsRaw) {
        const c = validateCurriculum(curriculumsRaw[cid], `curriculums[${cid}]`);
        if (c && c.id) curriculums[c.id] = c;
    }
    return { curriculums };
}

/**
 * Validate and fix a genre dice selection value
 * @param {*} value - Value to validate
 * @param {string} defaultValue - Default value if invalid
 * @param {string} context - Context for error messages
 * @returns {string} - Validated dice selection ('d4', 'd6', 'd8', 'd10', 'd12', 'd20')
 */
function validateGenreDiceSelection(value, defaultValue = 'd6', context = 'genreDiceSelection') {
    const validDice = ['d4', 'd6', 'd8', 'd10', 'd12', 'd20'];
    if (typeof value === 'string' && validDice.includes(value)) {
        return value;
    }
    console.warn(`Invalid ${context}: not a valid dice selection, using default ${defaultValue}`);
    return defaultValue;
}

/**
 * Validate and fix shelf book colors array
 * @param {Array} colors - Array of hex color strings
 * @param {string} context - Context for error messages
 * @returns {Array} - Array of validated hex color strings (max 10)
 */
function validateShelfBookColors(colors, context = 'shelfBookColors') {
    if (!Array.isArray(colors)) {
        console.warn(`Invalid ${context}: not an array, using empty array`);
        return [];
    }

    // Filter to valid hex color strings and limit to 10
    const hexColorRegex = /^#[0-9A-Fa-f]{6}$/;
    return colors
        .filter(color => typeof color === 'string' && hexColorRegex.test(color))
        .slice(0, 10);
}

/**
 * Validate a passive slot object (item or familiar in a passive slot)
 * @param {*} slot - Passive slot object to validate
 * @param {string} context - Context for error messages
 * @returns {Object|null} - Validated slot object, or null if unfixable
 */
function validatePassiveSlot(slot, context = 'passiveSlot') {
    if (!slot || typeof slot !== 'object') {
        console.warn(`Invalid passive slot in ${context}: not an object`);
        return null;
    }

    // A passive slot must have at minimum a slotId
    if (typeof slot.slotId !== 'string' || !slot.slotId.trim()) {
        console.warn(`Invalid passive slot in ${context}: missing or invalid slotId`);
        return null;
    }

    return {
        slotId: slot.slotId.trim(),
        itemName: typeof slot.itemName === 'string' ? slot.itemName.trim() : null,
        unlockedFrom: typeof slot.unlockedFrom === 'string' ? slot.unlockedFrom : null,
        unlockedAt: typeof slot.unlockedAt === 'string' ? slot.unlockedAt : null
    };
}

/**
 * Validate and fix an array of passive slots
 * @param {Array} slots - Array of passive slot objects
 * @param {string} context - Context for error messages
 * @returns {Array} - Array of validated passive slot objects
 */
function validatePassiveSlotArray(slots, context = 'passiveSlots') {
    if (!Array.isArray(slots)) {
        console.warn(`Invalid ${context}: not an array, using empty array`);
        return [];
    }

    const validated = [];
    slots.forEach((slot, index) => {
        const validatedSlot = validatePassiveSlot(slot, `${context}[${index}]`);
        if (validatedSlot) {
            validated.push(validatedSlot);
        } else {
            console.warn(`Skipping invalid passive slot at ${context}[${index}]`);
        }
    });
    return validated;
}

/**
 * Validate and fix character form data
 * @param {*} formData - Form data object
 * @returns {Object} - Validated form data object
 */
function validateFormData(formData) {
    if (!formData || typeof formData !== 'object') {
        return {};
    }

    const validated = {};
    // Form data is mostly strings, so we just ensure it's an object
    // Individual fields will be validated when used
    for (const key in formData) {
        if (typeof formData[key] === 'string' || typeof formData[key] === 'number') {
            validated[key] = formData[key];
        }
    }
    return validated;
}

/**
 * Validate entire character state
 * @param {Object} state - Character state object
 * @returns {Object} - Validated character state object
 */
export function validateCharacterState(state) {
    if (!state || typeof state !== 'object') {
        console.warn('Invalid character state: not an object, using empty state');
        return createEmptyCharacterState();
    }

    const validated = createEmptyCharacterState();

    // Validate each state key
    validated[STORAGE_KEYS.ACTIVE_ASSIGNMENTS] = validateQuestArray(
        state[STORAGE_KEYS.ACTIVE_ASSIGNMENTS],
        STORAGE_KEYS.ACTIVE_ASSIGNMENTS
    );
    validated[STORAGE_KEYS.COMPLETED_QUESTS] = validateQuestArray(
        state[STORAGE_KEYS.COMPLETED_QUESTS],
        STORAGE_KEYS.COMPLETED_QUESTS
    );
    validated[STORAGE_KEYS.DISCARDED_QUESTS] = validateQuestArray(
        state[STORAGE_KEYS.DISCARDED_QUESTS],
        STORAGE_KEYS.DISCARDED_QUESTS
    );
    validated[STORAGE_KEYS.EQUIPPED_ITEMS] = validateItemArray(
        state[STORAGE_KEYS.EQUIPPED_ITEMS],
        STORAGE_KEYS.EQUIPPED_ITEMS
    );
    validated[STORAGE_KEYS.INVENTORY_ITEMS] = validateItemArray(
        state[STORAGE_KEYS.INVENTORY_ITEMS],
        STORAGE_KEYS.INVENTORY_ITEMS
    );
    validated[STORAGE_KEYS.LEARNED_ABILITIES] = validateStringArray(
        state[STORAGE_KEYS.LEARNED_ABILITIES],
        STORAGE_KEYS.LEARNED_ABILITIES
    );
    validated[STORAGE_KEYS.ATMOSPHERIC_BUFFS] = validateAtmosphericBuffs(
        state[STORAGE_KEYS.ATMOSPHERIC_BUFFS]
    );
    validated[STORAGE_KEYS.ACTIVE_CURSES] = validateCurseArray(
        state[STORAGE_KEYS.ACTIVE_CURSES],
        STORAGE_KEYS.ACTIVE_CURSES
    );
    validated[STORAGE_KEYS.COMPLETED_CURSES] = validateCurseArray(
        state[STORAGE_KEYS.COMPLETED_CURSES],
        STORAGE_KEYS.COMPLETED_CURSES
    );
    validated[STORAGE_KEYS.TEMPORARY_BUFFS] = validateTemporaryBuffArray(
        state[STORAGE_KEYS.TEMPORARY_BUFFS],
        STORAGE_KEYS.TEMPORARY_BUFFS
    );
    validated[STORAGE_KEYS.BUFF_MONTH_COUNTER] = validateNumber(
        state[STORAGE_KEYS.BUFF_MONTH_COUNTER],
        0,
        STORAGE_KEYS.BUFF_MONTH_COUNTER
    );
    validated[STORAGE_KEYS.SELECTED_GENRES] = validateStringArray(
        state[STORAGE_KEYS.SELECTED_GENRES],
        STORAGE_KEYS.SELECTED_GENRES
    );
    validated[STORAGE_KEYS.GENRE_DICE_SELECTION] = validateGenreDiceSelection(
        state[STORAGE_KEYS.GENRE_DICE_SELECTION],
        'd6',
        STORAGE_KEYS.GENRE_DICE_SELECTION
    );
    validated[STORAGE_KEYS.SHELF_BOOK_COLORS] = validateShelfBookColors(
        state[STORAGE_KEYS.SHELF_BOOK_COLORS],
        STORAGE_KEYS.SHELF_BOOK_COLORS
    );

    // Library Restoration Expansion validation
    validated[STORAGE_KEYS.DUSTY_BLUEPRINTS] = validateNumber(
        state[STORAGE_KEYS.DUSTY_BLUEPRINTS],
        0,
        STORAGE_KEYS.DUSTY_BLUEPRINTS
    );
    validated[STORAGE_KEYS.COMPLETED_RESTORATION_PROJECTS] = validateStringArray(
        state[STORAGE_KEYS.COMPLETED_RESTORATION_PROJECTS],
        STORAGE_KEYS.COMPLETED_RESTORATION_PROJECTS
    );
    validated[STORAGE_KEYS.COMPLETED_WINGS] = validateStringArray(
        state[STORAGE_KEYS.COMPLETED_WINGS],
        STORAGE_KEYS.COMPLETED_WINGS
    );
    validated[STORAGE_KEYS.PASSIVE_ITEM_SLOTS] = validatePassiveSlotArray(
        state[STORAGE_KEYS.PASSIVE_ITEM_SLOTS],
        STORAGE_KEYS.PASSIVE_ITEM_SLOTS
    );
    validated[STORAGE_KEYS.PASSIVE_FAMILIAR_SLOTS] = validatePassiveSlotArray(
        state[STORAGE_KEYS.PASSIVE_FAMILIAR_SLOTS],
        STORAGE_KEYS.PASSIVE_FAMILIAR_SLOTS
    );
    validated[STORAGE_KEYS.CLAIMED_ROOM_REWARDS] = validateStringArray(
        state[STORAGE_KEYS.CLAIMED_ROOM_REWARDS],
        STORAGE_KEYS.CLAIMED_ROOM_REWARDS
    );
    validated[STORAGE_KEYS.DUNGEON_COMPLETION_DRAWS_REDEEMED] = validateNumber(
        state[STORAGE_KEYS.DUNGEON_COMPLETION_DRAWS_REDEEMED],
        0,
        STORAGE_KEYS.DUNGEON_COMPLETION_DRAWS_REDEEMED
    );
    validated[STORAGE_KEYS.BOOKS] = validateBooks(state[STORAGE_KEYS.BOOKS]);
    validated[STORAGE_KEYS.EXTERNAL_CURRICULUM] = validateExternalCurriculum(state[STORAGE_KEYS.EXTERNAL_CURRICULUM]);

    return validated;
}

/**
 * Validate form data
 * @param {*} formData - Form data object
 * @returns {Object} - Validated form data object
 */
export function validateFormDataSafe(formData) {
    return validateFormData(formData);
}

