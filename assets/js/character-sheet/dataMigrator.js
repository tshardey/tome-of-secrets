/**
 * Data Migration System
 * 
 * Handles migration of old save formats to current schema version.
 * Migrations are incremental - each version migrates from the previous one.
 * 
 * **CRITICAL:** Migrations should preserve all player data. Never lose progress.
 */

import { STORAGE_KEYS, createDefaultBookTidy } from './storageKeys.js';
import { GAME_CONFIG } from '../config/gameConfig.js';
import { getStoredSchemaVersion, SCHEMA_VERSION, saveSchemaVersion } from './dataValidator.js';
import { safeGetJSON, safeRemoveJSON } from '../utils/storage.js';
import { purgeStateKey } from './persistence.js';
import { normalizeQuestPeriod, PERIOD_TYPES } from '../services/PeriodService.js';
import * as data from './data.js';
import { getLinkedQuestIds, grandfatherBookLinks, isSameBook } from '../utils/questLinkRules.js';
import { deriveBookType, normalizeBookStatus, normalizeLibraryFields } from '../utils/bookTypes.js';
import { withoutTypeDerivedTags } from '../utils/bookTagRules.js';

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
        // Historical quests never show invented dollars; active quests are recomputed at completion.
        dollars: 0,
        items: [],
        modifiedBy: []
    };

    if (quest.type === '♥ Organize the Stacks') {
        defaultRewards.xp = GAME_CONFIG.rewards.organizeTheStacks.xp;
    } else if (quest.type === '⭐ Extra Credit') {
        // Extra credit carries no XP
    } else if (quest.type === '♠ Dungeon Crawl' && quest.isEncounter) {
        // Default encounter rewards
        defaultRewards.xp = GAME_CONFIG.rewards.encounter.monster.xp;
    } else {
        // Default quest completion rewards
        defaultRewards.xp = GAME_CONFIG.rewards.defaultQuestCompletion.xp;
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
        const activeQuestIds = isCompletedList
            ? new Set(
                (Array.isArray(migrated[STORAGE_KEYS.ACTIVE_ASSIGNMENTS]) ? migrated[STORAGE_KEYS.ACTIVE_ASSIGNMENTS] : [])
                    .map(q => q && q.id)
                    .filter(Boolean)
            )
            : new Set();
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
                        const hasActiveQuest = existingBook.links && Array.isArray(existingBook.links.questIds) &&
                            existingBook.links.questIds.some(qid => activeQuestIds.has(qid));
                        if (!hasActiveQuest) {
                            existingBook.status = 'completed';
                            existingBook.dateCompleted = typeof quest.dateCompleted === 'string' ? quest.dateCompleted : now;
                        }
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
 * Migration from schema version 5 to version 6
 * - Rename legacy genre quest name "Memoirs/Biographies" to "Memoir/Biography"
 *   anywhere it appears in saved character state (selected genres, quest prompts, etc.)
 */
function migrateToVersion6(state) {
    const migrated = { ...state };
    const LEGACY = 'Memoirs/Biographies';
    const CURRENT = 'Memoir/Biography';

    function replaceString(value) {
        if (typeof value === 'string' && value.includes(LEGACY)) {
            return value.split(LEGACY).join(CURRENT);
        }
        return value;
    }

    function deepReplace(value) {
        if (Array.isArray(value)) {
            return value.map(item => {
                if (item && (typeof item === 'object' || Array.isArray(item))) {
                    return deepReplace(item);
                }
                return replaceString(item);
            });
        }
        if (value && typeof value === 'object') {
            const result = { ...value };
            Object.keys(result).forEach(key => {
                const v = result[key];
                if (v && (typeof v === 'object' || Array.isArray(v))) {
                    result[key] = deepReplace(v);
                } else {
                    result[key] = replaceString(v);
                }
            });
            return result;
        }
        return replaceString(value);
    }

    Object.keys(migrated).forEach(key => {
        migrated[key] = deepReplace(migrated[key]);
    });

    return migrated;
}

/**
 * Migration from schema version 6 to version 7
 * - Adds characterState.series (empty object) for The Archive series tracker
 * - Adds characterState.claimedSeriesRewards (empty array) for series completion souvenir claims
 */
function migrateToVersion7(state) {
    const migrated = { ...state };
    if (!(STORAGE_KEYS.SERIES in migrated) || typeof migrated[STORAGE_KEYS.SERIES] !== 'object' || Array.isArray(migrated[STORAGE_KEYS.SERIES])) {
        migrated[STORAGE_KEYS.SERIES] = {};
    }
    if (!(STORAGE_KEYS.CLAIMED_SERIES_REWARDS in migrated) || !Array.isArray(migrated[STORAGE_KEYS.CLAIMED_SERIES_REWARDS])) {
        migrated[STORAGE_KEYS.CLAIMED_SERIES_REWARDS] = [];
    }
    return migrated;
}

/**
 * Migration from schema version 8 to version 9
 * - Adds seriesExpeditionProgress (empty array) for deterministic expedition advancement
 */
function migrateToVersion9(state) {
    const migrated = { ...state };
    if (!(STORAGE_KEYS.SERIES_EXPEDITION_PROGRESS in migrated) || !Array.isArray(migrated[STORAGE_KEYS.SERIES_EXPEDITION_PROGRESS])) {
        migrated[STORAGE_KEYS.SERIES_EXPEDITION_PROGRESS] = [];
    }
    return migrated;
}

/**
 * Migration from schema version 9 to version 10
 * - Originally also added shoppingLog, bookBoxSubscriptions and bookBoxHistory. The shopping
 *   page has been removed (v18 deletes those keys), so they are no longer created here.
 * - Adds shelfCategory to each book; existing books get 'general'
 */
function migrateToVersion10(state) {
    const migrated = { ...state };

    const books = migrated[STORAGE_KEYS.BOOKS];
    if (books && typeof books === 'object' && !Array.isArray(books)) {
        const upgraded = {};
        for (const id in books) {
            const b = books[id];
            if (!b || typeof b !== 'object') continue;
            upgraded[id] = {
                ...b,
                shelfCategory: typeof b.shelfCategory === 'string' && (b.shelfCategory === 'general' || b.shelfCategory === 'physical-tbr') ? b.shelfCategory : 'general'
            };
        }
        migrated[STORAGE_KEYS.BOOKS] = upgraded;
    }

    return migrated;
}

/**
 * Migration from schema version 10 to version 11
 * - Originally added curseHelperState for Worn Page helpers. The Shroud/curse system has been
 *   removed, so this step is now a pass-through (the retired key is no longer created).
 */
function migrateToVersion11(state) {
    return { ...state };
}

/**
 * Migration from schema version 11 to version 12
 * - Adds questDrawHelperState ({}) for monthly draw / dice helper usage
 */
function migrateToVersion12(state) {
    const migrated = { ...state };
    const key = STORAGE_KEYS.QUEST_DRAW_HELPER_STATE;
    if (!(key in migrated) || typeof migrated[key] !== 'object' || Array.isArray(migrated[key])) {
        migrated[key] = {};
    }
    return migrated;
}

/**
 * Migration from schema version 12 to version 13
 * - Adds effectCooldowns ({}) for TCG pipeline effect cooldown tracking
 */
function migrateToVersion13(state) {
    const migrated = { ...state };
    const key = STORAGE_KEYS.EFFECT_COOLDOWNS;
    if (!(key in migrated) || typeof migrated[key] !== 'object' || Array.isArray(migrated[key])) {
        migrated[key] = {};
    }
    return migrated;
}

/**
 * Migration from schema version 13 to version 14
 * - Adds questDrawHelperSettings ({ autoApplyOnDraw: false })
 */
function migrateToVersion14(state) {
    const migrated = { ...state };
    const key = STORAGE_KEYS.QUEST_DRAW_HELPER_SETTINGS;
    if (!(key in migrated) || typeof migrated[key] !== 'object' || Array.isArray(migrated[key])) {
        migrated[key] = { autoApplyOnDraw: false };
    }
    return migrated;
}

/**
 * Migration from schema version 14 to version 15
 * - Migrates characterSheet.librarySanctum form value from display name -> stable sanctum id
 * - Migrates atmosphericBuffs state keys from display name -> stable buff id
 * - Adds sideQuestId to side quests by matching prompt/name text to sideQuestsDetailed ids
 */
function migrateToVersion15(state) {
    const migrated = { ...state };

    const currentBuffs = migrated[STORAGE_KEYS.ATMOSPHERIC_BUFFS];
    if (currentBuffs && typeof currentBuffs === 'object' && !Array.isArray(currentBuffs)) {
        const upgradedBuffs = {};
        for (const [legacyKey, legacyValue] of Object.entries(currentBuffs)) {
            if (!legacyValue || typeof legacyValue !== 'object') continue;
            const resolved = data.getAtmosphericBuff(legacyKey);
            const stableKey = resolved?.id || legacyKey;
            const existing = upgradedBuffs[stableKey];
            if (!existing) {
                upgradedBuffs[stableKey] = { ...legacyValue };
            } else {
                upgradedBuffs[stableKey] = {
                    daysUsed: Math.max(existing.daysUsed || 0, legacyValue.daysUsed || 0),
                    isActive: Boolean(existing.isActive || legacyValue.isActive)
                };
            }
        }
        migrated[STORAGE_KEYS.ATMOSPHERIC_BUFFS] = upgradedBuffs;
    }

    const addSideQuestIds = (quests) => {
        if (!Array.isArray(quests)) return quests;
        return quests.map((quest) => {
            if (!quest || typeof quest !== 'object' || quest.type !== '♣ Side Quest') return quest;
            if (typeof quest.sideQuestId === 'string' && quest.sideQuestId.trim()) return quest;
            const prompt = typeof quest.prompt === 'string' ? quest.prompt : '';
            const match = Object.values(data.sideQuestsDetailed || {}).find((sideQuest) => (
                sideQuest?.id && (
                    prompt === `${sideQuest.name}: ${sideQuest.prompt}` ||
                    prompt.includes(sideQuest.name) ||
                    prompt.includes(sideQuest.prompt)
                )
            ));
            if (!match?.id) return quest;
            return { ...quest, sideQuestId: match.id };
        });
    };

    migrated[STORAGE_KEYS.ACTIVE_ASSIGNMENTS] = addSideQuestIds(migrated[STORAGE_KEYS.ACTIVE_ASSIGNMENTS]);
    migrated[STORAGE_KEYS.COMPLETED_QUESTS] = addSideQuestIds(migrated[STORAGE_KEYS.COMPLETED_QUESTS]);
    migrated[STORAGE_KEYS.DISCARDED_QUESTS] = addSideQuestIds(migrated[STORAGE_KEYS.DISCARDED_QUESTS]);

    const characterSheetForm = safeGetJSON(STORAGE_KEYS.CHARACTER_SHEET_FORM, null);
    if (characterSheetForm && typeof characterSheetForm === 'object' && !Array.isArray(characterSheetForm)) {
        const currentSanctum = characterSheetForm.librarySanctum;
        if (typeof currentSanctum === 'string' && currentSanctum.trim()) {
            const sanctum = data.getSanctumBenefit(currentSanctum.trim());
            if (sanctum?.id && sanctum.id !== characterSheetForm.librarySanctum) {
                characterSheetForm.librarySanctum = sanctum.id;
                try {
                    localStorage.setItem(STORAGE_KEYS.CHARACTER_SHEET_FORM, JSON.stringify(characterSheetForm));
                } catch (error) {
                    console.warn('Could not persist migrated characterSheet sanctum value:', error);
                }
            }
        }
    }

    return migrated;
}

/**
 * Migration from schema version 15 to version 16
 * - Adds tags: [] to existing books that don't have tags
 */
function migrateToVersion16(state) {
    const migrated = { ...state };
    const books = migrated[STORAGE_KEYS.BOOKS];
    if (books && typeof books === 'object' && !Array.isArray(books)) {
        const updated = {};
        for (const [id, book] of Object.entries(books)) {
            if (!book || typeof book !== 'object') {
                updated[id] = book;
                continue;
            }
            updated[id] = {
                ...book,
                tags: Array.isArray(book.tags) ? book.tags : []
            };
        }
        migrated[STORAGE_KEYS.BOOKS] = updated;
    }
    return migrated;
}

/**
 * Migration from schema version 16 to version 17
 * - Adds claimedCountries: the Exchange's once-ever register (side quest 13, branch B)
 */
function migrateToVersion17(state) {
    const migrated = { ...state };
    if (!Array.isArray(migrated[STORAGE_KEYS.CLAIMED_COUNTRIES])) {
        migrated[STORAGE_KEYS.CLAIMED_COUNTRIES] = [];
    }
    return migrated;
}

/**
 * State keys retired by the dollar economy (Shroud curses, Worn Page helpers, shopping page,
 * book boxes). Local string literals on purpose: the STORAGE_KEYS constants are gone, and
 * this list must keep matching what old saves actually contain.
 */
export const RETIRED_STATE_KEYS = Object.freeze([
    'activeCurses',
    'completedCurses',
    'curseHelperState',
    'shoppingLog',
    'bookBoxSubscriptions',
    'bookBoxHistory'
]);

/** Character-sheet form fields retired by the dollar economy (Ink Drops, Paper Scraps, journaling). */
export const RETIRED_FORM_FIELDS = Object.freeze([
    'inkDrops',
    'paperScraps',
    'journal-entries-completed'
]);

/** Schema version that retired the state keys and form fields above. */
export const RETIREMENT_SCHEMA_VERSION = 18;

/**
 * Remove retired fields from a character-sheet form blob. Pure and idempotent; returns a
 * new object. Runs on every form-blob load and on every cloud snapshot apply.
 * @param {Object} formData
 * @returns {Object}
 */
export function stripRetiredFormFields(formData) {
    if (!formData || typeof formData !== 'object' || Array.isArray(formData)) {
        return {};
    }
    const stripped = { ...formData };
    RETIRED_FORM_FIELDS.forEach((field) => {
        delete stripped[field];
    });
    return stripped;
}

/**
 * Migration from schema version 17 to version 18 (dollar economy)
 * - Deletes the retired curse, shopping and book-box state keys
 * - Starts the Fund at $0 with an empty deduction ledger, only when they are absent
 *   (old Ink Drops / Paper Scraps balances are discarded, not converted)
 * - Refreshes stored temporary-buff descriptions from the catalog (no buff was removed or
 *   renamed, but their saved text still described Ink Drops, Paper Scraps or Worn Pages).
 *   Buffs not found in the catalog are kept as they are.
 * - Grandfathers the links of books already linked to two or more quests (one book, one
 *   quest arrives with this version), so each of those quests keeps the full quest base
 * - Leaves every other key untouched
 */
function migrateToVersion18(state) {
    const migrated = { ...state };
    RETIRED_STATE_KEYS.forEach((key) => {
        delete migrated[key];
    });
    const tempBuffs = migrated[STORAGE_KEYS.TEMPORARY_BUFFS];
    if (Array.isArray(tempBuffs)) {
        migrated[STORAGE_KEYS.TEMPORARY_BUFFS] = tempBuffs.map((buff) => {
            if (!buff || typeof buff !== 'object' || typeof buff.name !== 'string') return buff;
            const name = buff.name.trim();
            const catalogBuff = data.getTemporaryBuff(name) || data.getTemporaryBuffFromReward(name);
            if (!catalogBuff || typeof catalogBuff.description !== 'string') return buff;
            return { ...buff, description: catalogBuff.description };
        });
    }
    if (!(STORAGE_KEYS.FUND_BALANCE_CENTS in migrated)) {
        migrated[STORAGE_KEYS.FUND_BALANCE_CENTS] = 0;
    }
    if (!(STORAGE_KEYS.FUND_LEDGER in migrated)) {
        migrated[STORAGE_KEYS.FUND_LEDGER] = [];
    }
    // Every link a v17 save holds predates one book, one quest.
    return grandfatherAllBookLinks(migrated, () => true);
}

/**
 * When one book, one quest went live (PR #134 merged and deployed). A save already at v18
 * cannot tell how its links were made, so links to quests added before this instant (or with
 * no dateAdded) are treated as having predated the rule.
 */
export const ONE_BOOK_ONE_QUEST_SINCE = '2026-11-10T18:29:52Z';

/**
 * Grandfather the links of every book linked to two or more quests (see grandfatherBookLinks),
 * counting links on every library entry for the same book (isSameBook: the book added twice).
 * @param {Object} state
 * @param {function(string): boolean} isLegacyLink - quest id -> link predates the rule
 * @returns {Object} new state (books replaced only when one changed)
 */
function grandfatherAllBookLinks(state, isLegacyLink) {
    const books = state[STORAGE_KEYS.BOOKS];
    if (!books || typeof books !== 'object' || Array.isArray(books)) return state;
    const entries = Object.values(books).filter((book) => book && typeof book === 'object');
    let changed = false;
    const updated = {};
    for (const id in books) {
        const book = books[id];
        if (!book || typeof book !== 'object') {
            updated[id] = book;
            continue;
        }
        const sameBookLinkCount = entries.reduce((count, other) => (
            other === book || isSameBook(book, other) ? count + getLinkedQuestIds(other).length : count
        ), 0);
        const next = grandfatherBookLinks(book, isLegacyLink, sameBookLinkCount);
        if (next !== book) changed = true;
        updated[id] = next;
    }
    return changed ? { ...state, [STORAGE_KEYS.BOOKS]: updated } : state;
}

/**
 * Migration from schema version 18 to version 19
 * - Grandfathers book links that predate one book, one quest in saves that were already at v18
 *   before the marker existed: a link counts as legacy when its quest was added before
 *   ONE_BOOK_ONE_QUEST_SINCE or has no dateAdded. Idempotent; v17 saves were marked by v18.
 */
function migrateToVersion19(state) {
    const cutoff = Date.parse(ONE_BOOK_ONE_QUEST_SINCE);
    const addedAt = new Map();
    for (const key of [STORAGE_KEYS.ACTIVE_ASSIGNMENTS, STORAGE_KEYS.COMPLETED_QUESTS, STORAGE_KEYS.DISCARDED_QUESTS]) {
        const list = state[key];
        if (!Array.isArray(list)) continue;
        for (const quest of list) {
            if (quest && quest.id != null) addedAt.set(String(quest.id), quest.dateAdded);
        }
    }
    return grandfatherAllBookLinks({ ...state }, (questId) => {
        const added = Date.parse(addedAt.get(questId));
        return Number.isNaN(added) || added < cutoff;
    });
}

/**
 * Migration from schema version 19 to version 20 (Plan 4, D2): book types.
 * For every book: `type` from deriveBookType (a stored `audio` tag makes an audiobook, anything
 * else is Unsorted), type-derived tags stripped from `tags`, status 'other' -> 'reading',
 * shelfCategory deleted, and libraryBookId / libraryTagsBase / shelfMatchDismissed normalized.
 * Adds bookTidy when absent: 'pending' when any book is Unsorted, else 'done'.
 *
 * Makes no network call, never reads the clock, makes no ids and removes no book.
 * Idempotent: v20 data passes through unchanged.
 * @param {Object} state
 * @returns {Object}
 */
export function migrateToVersion20(state) {
    const migrated = { ...state };
    const books = migrated[STORAGE_KEYS.BOOKS];
    if (books && typeof books === 'object' && !Array.isArray(books)) {
        const updated = {};
        for (const [id, book] of Object.entries(books)) {
            if (!book || typeof book !== 'object') {
                updated[id] = book;
                continue;
            }
            const type = deriveBookType(book);
            const { shelfCategory: _retired, ...rest } = book;
            updated[id] = {
                ...rest,
                status: normalizeBookStatus(book.status),
                tags: withoutTypeDerivedTags(Array.isArray(book.tags) ? book.tags : []),
                type,
                ...normalizeLibraryFields(type, book)
            };
        }
        migrated[STORAGE_KEYS.BOOKS] = updated;
    }

    const tidy = migrated[STORAGE_KEYS.BOOK_TIDY];
    if (!tidy || typeof tidy !== 'object' || Array.isArray(tidy)) {
        const migratedBooks = migrated[STORAGE_KEYS.BOOKS];
        const anyUnsorted = migratedBooks && typeof migratedBooks === 'object'
            ? Object.values(migratedBooks).some((book) => book && typeof book === 'object' && book.type === 'unsorted')
            : false;
        migrated[STORAGE_KEYS.BOOK_TIDY] = {
            ...createDefaultBookTidy(),
            status: anyUnsorted ? 'pending' : 'done'
        };
    }
    return migrated;
}

/**
 * Delete the retired state keys from every store (IndexedDB and localStorage).
 * activeCurses/completedCurses used to be IndexedDB-backed, so old copies may be
 * orphaned there as well as in localStorage.
 * @returns {Promise<void>}
 */
export async function purgeRetiredStateKeys() {
    for (const key of RETIRED_STATE_KEYS) {
        await purgeStateKey(key);
    }
}

/**
 * Migration from schema version 7 to version 8
 * - Adds publication metadata to each series: releasedCount, expectedCount, isCompletedSeries
 * - Existing series get defaults: releasedCount 0, expectedCount 0, isCompletedSeries false
 */
function migrateToVersion8(state) {
    const migrated = { ...state };
    const series = migrated[STORAGE_KEYS.SERIES];
    if (!series || typeof series !== 'object' || Array.isArray(series)) {
        return migrated;
    }
    const upgraded = {};
    for (const id in series) {
        const s = series[id];
        if (!s || typeof s !== 'object') continue;
        const releasedCount = typeof s.releasedCount === 'number' && !isNaN(s.releasedCount) && s.releasedCount >= 0
            ? Math.floor(s.releasedCount)
            : 0;
        const expectedCount = typeof s.expectedCount === 'number' && !isNaN(s.expectedCount) && s.expectedCount >= 0
            ? Math.floor(s.expectedCount)
            : 0;
        const isCompletedSeries = typeof s.isCompletedSeries === 'boolean' ? s.isCompletedSeries : false;
        upgraded[id] = {
            ...s,
            id: s.id || id,
            name: typeof s.name === 'string' ? s.name.trim() : '',
            bookIds: Array.isArray(s.bookIds) ? s.bookIds.filter(x => typeof x === 'string' && x.trim()) : [],
            releasedCount,
            expectedCount,
            isCompletedSeries
        };
    }
    migrated[STORAGE_KEYS.SERIES] = upgraded;
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
 * Returns true if state has quests with book data (book/bookAuthor/cover/page count)
 * but no valid Book entry (missing or invalid bookId reference). Used to run the
 * v5 book-extraction as a one-time repair when the schema version was already bumped.
 */
function needsBooksRepair(state) {
    if (SCHEMA_VERSION < 5) return false;
    const books = state[STORAGE_KEYS.BOOKS];
    const bookIds = books && typeof books === 'object' && !Array.isArray(books)
        ? new Set(Object.keys(books))
        : new Set();
    const questKeys = [
        STORAGE_KEYS.ACTIVE_ASSIGNMENTS,
        STORAGE_KEYS.COMPLETED_QUESTS,
        STORAGE_KEYS.DISCARDED_QUESTS
    ];
    for (const key of questKeys) {
        const list = state[key];
        if (!Array.isArray(list)) continue;
        for (const quest of list) {
            if (!quest || typeof quest !== 'object') continue;
            const hasBookData = quest.book || quest.bookAuthor || quest.coverUrl != null ||
                (typeof quest.pageCountRaw === 'number' && !isNaN(quest.pageCountRaw)) ||
                (typeof quest.pageCountEffective === 'number' && !isNaN(quest.pageCountEffective));
            if (!hasBookData) continue;
            const hasValidBook = typeof quest.bookId === 'string' && bookIds.has(quest.bookId);
            if (!hasValidBook) return true;
        }
    }
    return false;
}

/**
 * Run all necessary migrations to bring data to current schema version
 * @param {Object} state - Current state object
 * @param {Object} [options]
 * @param {number} [options.fromVersion] - Schema version the state is at. Defaults to the
 *   version stored in localStorage (used when applying a cloud snapshot, which carries its own).
 * @returns {Object} - Migrated state object
 */
export function migrateState(state, { fromVersion } = {}) {
    const storedVersion = Number.isInteger(fromVersion) ? fromVersion : getStoredSchemaVersion();

    // A save from a newer build: leave it exactly as it is and never relabel it with this
    // build's (older) version. See the schema write gate in dataValidator.js.
    if (storedVersion !== null && storedVersion > SCHEMA_VERSION) {
        console.warn(`Save is at schema version ${storedVersion}, newer than this build (${SCHEMA_VERSION}); leaving it untouched.`);
        return state;
    }

    // If already at current version, run idempotent repair for books if needed.
    if (storedVersion === SCHEMA_VERSION) {
        if (storedVersion >= 5 && needsBooksRepair(state)) {
            console.log('Repairing: extracting books from quests while already at current schema version.');
            return migrateToVersion5(state);
        }
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
            case 6:
                migratedState = migrateToVersion6(migratedState);
                break;
            case 7:
                migratedState = migrateToVersion7(migratedState);
                break;
            case 8:
                migratedState = migrateToVersion8(migratedState);
                break;
            case 9:
                migratedState = migrateToVersion9(migratedState);
                break;
            case 10:
                migratedState = migrateToVersion10(migratedState);
                break;
            case 11:
                migratedState = migrateToVersion11(migratedState);
                break;
            case 12:
                migratedState = migrateToVersion12(migratedState);
                break;
            case 13:
                migratedState = migrateToVersion13(migratedState);
                break;
            case 14:
                migratedState = migrateToVersion14(migratedState);
                break;
            case 15:
                migratedState = migrateToVersion15(migratedState);
                break;
            case 16:
                migratedState = migrateToVersion16(migratedState);
                break;
            case 17:
                migratedState = migrateToVersion17(migratedState);
                break;
            case 18:
                migratedState = migrateToVersion18(migratedState);
                break;
            case 19:
                migratedState = migrateToVersion19(migratedState);
                break;
            case 20:
                migratedState = migrateToVersion20(migratedState);
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
        STORAGE_KEYS.EXTERNAL_CURRICULUM,
        STORAGE_KEYS.SERIES,
        STORAGE_KEYS.CLAIMED_SERIES_REWARDS,
        STORAGE_KEYS.SERIES_EXPEDITION_PROGRESS,
        STORAGE_KEYS.FUND_BALANCE_CENTS,
        STORAGE_KEYS.FUND_LEDGER,
        // Schema v20. Absent until migrated: the v20 migration decides its starting status.
        STORAGE_KEYS.BOOK_TIDY
    ];

    stateKeys.forEach(key => {
        let defaultValue;
        if (key === STORAGE_KEYS.ATMOSPHERIC_BUFFS || key === STORAGE_KEYS.BOOKS || key === STORAGE_KEYS.SERIES) {
            defaultValue = {};
        } else if (key === STORAGE_KEYS.EXTERNAL_CURRICULUM) {
            defaultValue = { curriculums: {} };
        } else if (key === STORAGE_KEYS.BUFF_MONTH_COUNTER || key === STORAGE_KEYS.DUSTY_BLUEPRINTS || key === STORAGE_KEYS.FUND_BALANCE_CENTS) {
            defaultValue = 0;
        } else if (key === STORAGE_KEYS.GENRE_DICE_SELECTION) {
            defaultValue = 'd6';
        } else if (key === STORAGE_KEYS.BOOK_TIDY) {
            defaultValue = null;
        } else {
            defaultValue = [];
        }
        state[key] = safeGetJSON(key, defaultValue);
    });

    // Migrate state to current schema version, then drop the retired keys from localStorage
    // (synchronous path; loadState() also purges IndexedDB via purgeRetiredStateKeys()).
    const migrated = migrateState(state);
    RETIRED_STATE_KEYS.forEach(key => safeRemoveJSON(key));
    return migrated;
}
