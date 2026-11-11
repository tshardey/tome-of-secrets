/**
 * The one-time library tidy (Plan 4, D9 and D10): each Unsorted book is linked to a household
 * library book, given a type, or dropped.
 *
 * - Only `unsorted` books are reviewed. Rows without a decision stay Unsorted; `bookTidy.status`
 *   becomes `done` only when none is left.
 * - A book that is protected (a quest, a curriculum prompt, a completion or a series) is never
 *   removed: a `link` makes it a shelf record in place, and a `drop` is refused.
 * - `applyTidy` runs entirely inside the cross-tab sync lock. A `blocked` or `cancelled` apply
 *   writes nothing at all; the only thing that can have happened is step 3's tag unions.
 * - Removed records go to `bookTidy.removedBooks`, which only ever grows by id. Only
 *   `restoreRemovedBooks` deletes entries, and only the ones it put back.
 *
 * Logs carry an error code only, never titles, authors or tags.
 */
import { STORAGE_KEYS } from '../character-sheet/storageKeys.js';
import { isSchemaWriteSafe } from '../character-sheet/dataValidator.js';
import { matchToLibrary, hasEditionSuffix } from '../utils/bookMatching.js';
import { PICKABLE_TYPES, normalizeLibraryFields } from '../utils/bookTypes.js';
import { sharedTags } from '../utils/bookTagRules.js';
import { runExclusiveSync } from './syncLock.js';

/** The closed list of reasons a tidy is blocked (shared with checkReadyForDeliberateChange). */
export const TIDY_BLOCK_REASONS = Object.freeze(['unsynced', 'offline', 'newer-schema', 'library', 'protected', 'storage']);

/** The reason a deliberate push declares (D10). */
export const TIDY_PUSH_REASON = 'library-tidy';

const QUEST_LIST_KEYS = [
    STORAGE_KEYS.ACTIVE_ASSIGNMENTS,
    STORAGE_KEYS.COMPLETED_QUESTS,
    STORAGE_KEYS.DISCARDED_QUESTS
];

function logCode(error) {
    if (!error || typeof error !== 'object') return 'unknown';
    return String(error.reason || error.code || error.name || 'unknown');
}

function nonEmptyList(list) {
    return Array.isArray(list) && list.length > 0;
}

function isNonEmptyString(value) {
    return typeof value === 'string' && value.trim().length > 0;
}

function uniqueStrings(list) {
    const out = [];
    for (const item of Array.isArray(list) ? list : []) {
        if (typeof item === 'string' && !out.includes(item)) out.push(item);
    }
    return out;
}

function booksOf(state) {
    const books = state ? state[STORAGE_KEYS.BOOKS] : null;
    return books && typeof books === 'object' && !Array.isArray(books) ? books : {};
}

function isReadyCatalog(catalog) {
    return Boolean(catalog) && catalog.status === 'ready' && Array.isArray(catalog.books);
}

function isUnsorted(book) {
    return Boolean(book) && typeof book === 'object' && book.type === 'unsorted';
}

function promptsLinkedTo(state, bookId) {
    const data = state ? state[STORAGE_KEYS.EXTERNAL_CURRICULUM] : null;
    const curriculums = data && typeof data === 'object' && data.curriculums && typeof data.curriculums === 'object'
        ? data.curriculums
        : {};
    for (const curriculum of Object.values(curriculums)) {
        const categories = curriculum && typeof curriculum.categories === 'object' && curriculum.categories ? curriculum.categories : {};
        for (const category of Object.values(categories)) {
            const prompts = category && typeof category.prompts === 'object' && category.prompts ? category.prompts : {};
            for (const prompt of Object.values(prompts)) {
                if (prompt && prompt.bookId === bookId) return true;
            }
        }
    }
    return false;
}

/**
 * Whether a book must never be removed by the tidy (D9): linked to any quest (active, completed
 * or discarded, by the quest's `bookId` or the book's quest links), to any curriculum prompt,
 * completed, or in any series.
 * @param {Object} book
 * @param {Object} state - character state (keyed by STORAGE_KEYS)
 * @returns {boolean}
 */
export function isProtected(book, state) {
    if (!book || typeof book !== 'object') return false;
    if (book.status === 'completed' || isNonEmptyString(book.dateCompleted)) return true;
    const links = book.links && typeof book.links === 'object' ? book.links : {};
    if (nonEmptyList(links.questIds) || nonEmptyList(links.grandfatheredQuestIds) || nonEmptyList(links.curriculumPromptIds)) {
        return true;
    }
    const id = book.id;
    if (!id || !state) return false;
    for (const key of QUEST_LIST_KEYS) {
        const quests = Array.isArray(state[key]) ? state[key] : [];
        if (quests.some((quest) => quest && quest.bookId === id)) return true;
    }
    if (promptsLinkedTo(state, id)) return true;
    const series = state[STORAGE_KEYS.SERIES] && typeof state[STORAGE_KEYS.SERIES] === 'object' ? state[STORAGE_KEYS.SERIES] : {};
    return Object.values(series).some((entry) => entry && Array.isArray(entry.bookIds) && entry.bookIds.includes(id));
}

function toCandidate(libraryBook, reason, score) {
    return {
        libraryBookId: libraryBook.id,
        title: typeof libraryBook.title === 'string' ? libraryBook.title : '',
        authors: Array.isArray(libraryBook.authors) ? [...libraryBook.authors] : [],
        coverUrl: typeof libraryBook.coverUrl === 'string' ? libraryBook.coverUrl : null,
        reason,
        score
    };
}

/**
 * One row per Unsorted book (D9). Without a ready catalogue (signed out, no household, library
 * unavailable) every row has no candidates: the simple version.
 * @param {Object} state - character state
 * @param {Object|null} catalog - a getCatalog() result
 * @returns {Array<{ bookId: string, title: string, author: string, protected: boolean,
 *   candidates: Object[], preselected: string|null }>}
 */
export function planTidy(state, catalog) {
    const ready = isReadyCatalog(catalog);
    return Object.values(booksOf(state)).filter(isUnsorted).map((book) => {
        let candidates = [];
        let preselected = null;
        if (ready) {
            const { strong, weak } = matchToLibrary(book, catalog.books);
            candidates = [
                ...strong.map((libraryBook) => toCandidate(libraryBook, 'same_title', 1)),
                ...weak.map((match) => toCandidate(match.book, match.reason, match.score))
            ];
            // R33: a title whose edition suffix matching stripped is likely a second copy of the
            // plain-titled book; it keeps the candidate but is never preselected for removal.
            preselected = strong.length === 1 && !hasEditionSuffix(book.title) ? strong[0].id : null;
        }
        return {
            bookId: book.id,
            title: typeof book.title === 'string' ? book.title : '',
            author: typeof book.author === 'string' ? book.author : '',
            protected: isProtected(book, state),
            candidates,
            preselected
        };
    });
}

/**
 * Turn decisions into actions against live state. A decision for a book that is gone or no
 * longer Unsorted is skipped, as is a second decision for the same book. Protection is
 * computed now, from the state given.
 * Actions: 'remove' (unprotected link), 'shelf' (protected link), 'type', 'drop', and
 * 'refused-drop' (a drop of a protected book).
 */
function resolveDecisions(state, decisions) {
    const books = booksOf(state);
    const seen = new Set();
    const actions = [];
    for (const decision of Array.isArray(decisions) ? decisions : []) {
        if (!decision || typeof decision.bookId !== 'string' || seen.has(decision.bookId)) continue;
        const book = books[decision.bookId];
        if (!isUnsorted(book)) continue;
        let action = null;
        if (decision.kind === 'type' && PICKABLE_TYPES.includes(decision.type)) {
            action = { kind: 'type', type: decision.type };
        } else if (decision.kind === 'link' && isNonEmptyString(decision.libraryBookId)) {
            action = { kind: isProtected(book, state) ? 'shelf' : 'remove', libraryBookId: decision.libraryBookId };
        } else if (decision.kind === 'drop') {
            action = { kind: isProtected(book, state) ? 'refused-drop' : 'drop' };
        }
        if (!action) continue;
        seen.add(decision.bookId);
        actions.push({ bookId: decision.bookId, ...action });
    }
    return actions;
}

function summarizeActions(state, actions) {
    const count = (kind) => actions.filter((action) => action.kind === kind).length;
    const dropped = count('drop');
    const remove = count('remove') + dropped;
    const booksBefore = Object.keys(booksOf(state)).length;
    return { remove, shelf: count('shelf'), typed: count('type'), dropped, booksBefore, booksAfter: booksBefore - remove };
}

/**
 * The counts an apply would produce, from the state given. `remove` includes the drops.
 * @param {Object} state
 * @param {Object[]} decisions - TidyDecisions
 * @returns {{ remove: number, shelf: number, typed: number, dropped: number, booksBefore: number, booksAfter: number }}
 */
export function summarizeTidy(state, decisions) {
    return summarizeActions(state, resolveDecisions(state, decisions));
}

/**
 * A copy of the book with a `data:` cover set to null; an http(s) cover is kept (D9).
 * @param {Object} book
 * @returns {Object}
 */
export function stripInlineCovers(book) {
    if (!book || typeof book !== 'object') return book;
    const copy = { ...book };
    if (typeof copy.cover === 'string' && copy.cover.startsWith('data:')) copy.cover = null;
    return copy;
}

/**
 * Merge newly removed records into the existing map by id. An id already there is overwritten
 * with the newer record; no id is ever dropped (D9).
 * @param {Object} existing - { [id]: Book }
 * @param {Object[]} removed - Books
 * @returns {Object} a new map
 */
export function mergeRemovedBooks(existing, removed) {
    const merged = existing && typeof existing === 'object' && !Array.isArray(existing) ? { ...existing } : {};
    for (const book of Array.isArray(removed) ? removed : []) {
        if (book && isNonEmptyString(book.id)) merged[book.id] = book;
    }
    return merged;
}

/**
 * The review can never be hidden for good (D9): a `done` status goes back to `pending` while any
 * book is Unsorted. Everything else, `postponedAt` included, is kept.
 * @param {Object} state
 * @returns {Object} a new state when the status changed, else the same object
 */
export function healTidyStatus(state) {
    if (!state || typeof state !== 'object') return state;
    const tidy = state[STORAGE_KEYS.BOOK_TIDY];
    if (!tidy || typeof tidy !== 'object' || tidy.status !== 'done') return state;
    if (!Object.values(booksOf(state)).some(isUnsorted)) return state;
    return { ...state, [STORAGE_KEYS.BOOK_TIDY]: { ...tidy, status: 'pending' } };
}

function blocked(reason) {
    return { status: 'blocked', reason, pushed: false };
}

function sameActions(a, b) {
    return a.length === b.length && a.every((action, i) => action.bookId === b[i].bookId && action.kind === b[i].kind);
}

/** The shared tags each library book is missing, by library book id (D9: union into the library). */
function tagUnions(books, actions, libraryById) {
    const unions = new Map();
    for (const action of actions) {
        if (action.kind !== 'remove' && action.kind !== 'shelf') continue;
        const libraryShared = new Set(sharedTags(libraryById.get(action.libraryBookId).tags));
        const missing = sharedTags(books[action.bookId].tags).filter((id) => !libraryShared.has(id));
        const list = unions.get(action.libraryBookId) || [];
        unions.set(action.libraryBookId, uniqueStrings([...list, ...missing]));
    }
    return unions;
}

async function pushTagUnions(unions, catalog, service) {
    const pending = [...unions].filter(([, tags]) => tags.length > 0);
    if (pending.length === 0) return true;
    if (!isNonEmptyString(catalog.householdId) || !service || typeof service.addTags !== 'function') return false;
    try {
        for (const [libraryBookId, tags] of pending) {
            await service.addTags(libraryBookId, catalog.householdId, tags);
        }
        return true;
    } catch (error) {
        console.warn('[LibraryTidy] tag push failed:', logCode(error));
        return false;
    }
}

/** The books and bookTidy after the actions (D9). */
function buildNext(books, tidy, actions, libraryById, now) {
    const nextBooks = { ...books };
    const removed = [];
    for (const action of actions) {
        const book = books[action.bookId];
        if (action.kind === 'remove' || action.kind === 'drop') {
            removed.push(stripInlineCovers(book));
            delete nextBooks[action.bookId];
        } else if (action.kind === 'shelf') {
            const libraryShared = uniqueStrings(sharedTags(libraryById.get(action.libraryBookId).tags));
            nextBooks[action.bookId] = {
                ...book,
                type: 'shelf',
                libraryBookId: action.libraryBookId,
                tags: uniqueStrings([...(book.tags || []), ...libraryShared]),
                libraryTagsBase: uniqueStrings([...sharedTags(book.tags), ...libraryShared]),
                shelfMatchDismissed: null
            };
        } else if (action.kind === 'type') {
            nextBooks[action.bookId] = { ...book, type: action.type, ...normalizeLibraryFields(action.type, book) };
        }
    }
    const anyUnsorted = Object.values(nextBooks).some(isUnsorted);
    const nextTidy = {
        ...tidy,
        removedBooks: mergeRemovedBooks(tidy.removedBooks, removed),
        status: anyUnsorted ? (tidy.status === 'done' ? 'pending' : tidy.status) : 'done',
        completedAt: anyUnsorted ? tidy.completedAt : now
    };
    return { nextBooks, nextTidy };
}

/**
 * Apply the review's decisions (D10), inside the sync lock:
 *   1. recheck protection from live state, and the cloud when something is removed;
 *   2. confirm in-page when something is removed;
 *   3. push the shared-tag unions to the library (a failure aborts with nothing local changed);
 *   4. write bookTidy, then books (stateAdapter.applyBookTidy);
 *   5. push the save deliberately when something was removed.
 * A `blocked` or `cancelled` result wrote nothing.
 * @param {{ stateAdapter: Object, decisions: Object[], catalog: Object|null, service: Object|null,
 *   cloud: { checkReady: Function, push: Function }|null, confirm: Function }} options
 * @returns {Promise<{ status: 'applied'|'cancelled'|'blocked', reason?: string, pushed: boolean }>}
 */
export async function applyTidy({ stateAdapter, decisions, catalog, service, cloud, confirm }) {
    return runExclusiveSync(async () => {
        if (!isSchemaWriteSafe()) return blocked('newer-schema');

        // 1. Recheck from live state, never from the plan the panel was drawn from.
        const actions = resolveDecisions(stateAdapter.state, decisions);
        if (actions.some((action) => action.kind === 'refused-drop')) return blocked('protected');
        if (actions.length === 0) return { status: 'applied', pushed: false };
        const summary = summarizeActions(stateAdapter.state, actions);

        let libraryById = new Map();
        if (actions.some((action) => action.kind === 'remove' || action.kind === 'shelf')) {
            if (!isReadyCatalog(catalog)) return blocked('library');
            libraryById = new Map(catalog.books.map((libraryBook) => [libraryBook.id, libraryBook]));
            if (actions.some((action) => action.libraryBookId && !libraryById.has(action.libraryBookId))) {
                return blocked('library');
            }
        }

        if (summary.remove > 0 && cloud) {
            let ready;
            try {
                ready = await cloud.checkReady();
            } catch (error) {
                console.warn('[LibraryTidy] cloud check failed:', logCode(error));
                ready = { ok: false, reason: 'offline' };
            }
            if (!ready || ready.ok !== true) {
                return blocked(ready && TIDY_BLOCK_REASONS.includes(ready.reason) ? ready.reason : 'offline');
            }
        }

        // 2. Confirm in-page. Only a removal asks; there is no default answer.
        if (summary.remove > 0) {
            let confirmed = false;
            try {
                confirmed = (await confirm(summary)) === true;
            } catch (error) {
                console.warn('[LibraryTidy] confirm failed:', logCode(error));
            }
            if (!confirmed) return { status: 'cancelled', pushed: false };
            // The page may have changed a book while the dialog was open: what was confirmed
            // must still be what happens.
            if (!isSchemaWriteSafe()) return blocked('newer-schema');
            if (!sameActions(actions, resolveDecisions(stateAdapter.state, decisions))) return blocked('protected');
        }

        // 3. The tag unions reach the library before anything local changes.
        const books = booksOf(stateAdapter.state);
        if (!await pushTagUnions(tagUnions(books, actions, libraryById), catalog, service)) return blocked('library');

        // 4. bookTidy first, then books (D9 write order). Re-read: the unions took a while.
        const liveBooks = booksOf(stateAdapter.state);
        if (!sameActions(actions, resolveDecisions(stateAdapter.state, decisions))) return blocked('protected');
        // getBookTidy reads the stored record, so another tab's removed books are kept.
        const { nextBooks, nextTidy } = buildNext(liveBooks, stateAdapter.getBookTidy(), actions, libraryById, new Date().toISOString());
        const written = await stateAdapter.applyBookTidy(nextBooks, nextTidy);
        if (!written || written.ok !== true) return blocked('storage');

        // 5. The shrink goes up as a deliberate, declared push, never through auto-sync.
        let pushed = false;
        if (summary.remove > 0 && cloud) {
            try {
                pushed = (await cloud.push({
                    reason: TIDY_PUSH_REASON,
                    booksBefore: summary.booksBefore,
                    booksAfter: summary.booksAfter
                })) === true;
            } catch (error) {
                console.warn('[LibraryTidy] push failed:', logCode(error));
            }
        }
        return { status: 'applied', pushed };
    });
}

/**
 * Put removed books back (D9): by id, skipping ids already in `books`; only the restored
 * entries leave `removedBooks`. The status returns to `pending` when an Unsorted book is back.
 * Books are written before bookTidy, so a failure in between leaves a record in both places
 * (restore skips it, the next apply removes it again by id), never in neither.
 * @param {Object} stateAdapter
 * @param {string[]} [ids] - all removed books when omitted
 * @returns {Promise<number>} how many were restored
 */
export function restoreRemovedBooks(stateAdapter, ids) {
    return runExclusiveSync(async () => {
        // The stored bookTidy, not this tab's RAM copy: another tab may have removed books since.
        const tidy = stateAdapter.getBookTidy();
        const books = booksOf(stateAdapter.state);
        const wanted = Array.isArray(ids) ? new Set(ids) : null;
        const restoring = Object.keys(tidy.removedBooks).filter((id) => (!wanted || wanted.has(id)) && !(id in books));
        if (restoring.length === 0) return 0;

        const nextBooks = { ...books };
        const removedBooks = { ...tidy.removedBooks };
        for (const id of restoring) {
            nextBooks[id] = tidy.removedBooks[id];
            delete removedBooks[id];
        }
        const anyUnsorted = Object.values(nextBooks).some(isUnsorted);
        const nextTidy = { ...tidy, removedBooks, status: anyUnsorted ? 'pending' : tidy.status };
        const written = await stateAdapter.applyBookTidy(nextBooks, nextTidy, { booksFirst: true, restoredIds: restoring });
        return written && written.ok === true ? restoring.length : 0;
    });
}
