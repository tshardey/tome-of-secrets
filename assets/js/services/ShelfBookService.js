/**
 * Shelf records (Plan 4, D4-D7): ToS books of type `shelf` that point at a household library
 * book through `libraryBookId`.
 *
 * - Shared tags follow the library by a three-way merge against `libraryTagsBase`, the shared
 *   set at the last successful exchange (D4). Reader tags and unknown ids stay on the record;
 *   type-derived tags are never stored.
 * - Title, author, cover and page count are copied from the library when it has a value (D6).
 * - A shelf record in a ToS series fills the library's empty series name (D5).
 * - A refresh that changes nothing writes nothing (Review Focus 2).
 * - Nothing here ever deletes a record or blocks the page on the library.
 *
 * Logs carry an error code only, never titles, authors or tags.
 */
import { libraryCatalog } from './LibraryCatalogService.js';
import { matchToLibrary } from '../utils/bookMatching.js';
import { isSharedTag, sharedTags } from '../utils/bookTagRules.js';

function logCode(error) {
    if (!error || typeof error !== 'object') return 'unknown';
    return String(error.reason || error.code || error.name || 'unknown');
}

function uniqueStrings(list) {
    const out = [];
    for (const item of Array.isArray(list) ? list : []) {
        if (typeof item === 'string' && !out.includes(item)) out.push(item);
    }
    return out;
}

function sameSet(a, b) {
    const left = new Set(a || []);
    const right = new Set(b || []);
    if (left.size !== right.size) return false;
    for (const item of left) if (!right.has(item)) return false;
    return true;
}

function sameList(a, b) {
    const left = Array.isArray(a) ? a : [];
    const right = Array.isArray(b) ? b : [];
    return left.length === right.length && left.every((item, i) => item === right[i]);
}

function isShelfRecord(book) {
    return Boolean(book) && book.type === 'shelf'
        && typeof book.libraryBookId === 'string' && book.libraryBookId.trim().length > 0;
}

/**
 * The three-way merge of shared tags (D4). Pure. Every input is reduced to shared tags first,
 * so reader, type-derived and unknown ids never reach any of the three sets.
 *   merged   = (library ∪ (local − base)) − (base − local)
 *   toAdd    = merged − library
 *   toRemove = library − merged
 * `merged` keeps the local order, then appends what only the library has.
 * @param {{ local: string[], base: string[], library: string[] }} input
 * @returns {{ merged: string[], toAdd: string[], toRemove: string[] }}
 */
export function mergeShelfTags({ local, base, library } = {}) {
    const localShared = uniqueStrings(sharedTags(local));
    const baseSet = new Set(sharedTags(base));
    const libraryShared = uniqueStrings(sharedTags(library));
    const localSet = new Set(localShared);
    const librarySet = new Set(libraryShared);

    const keep = (id) => {
        const addedLocally = localSet.has(id) && !baseSet.has(id);
        const removedLocally = baseSet.has(id) && !localSet.has(id);
        return (librarySet.has(id) || addedLocally) && !removedLocally;
    };
    const merged = [];
    for (const id of [...localShared, ...libraryShared]) {
        if (!merged.includes(id) && keep(id)) merged.push(id);
    }
    const mergedSet = new Set(merged);
    return {
        merged,
        toAdd: merged.filter((id) => !librarySet.has(id)),
        toRemove: libraryShared.filter((id) => !mergedSet.has(id))
    };
}

/**
 * A record's tags after a merge: its non-shared tags (reader and unknown ids) kept in place,
 * its shared tags replaced by `merged`.
 */
function composeTags(localTags, merged) {
    const mergedSet = new Set(merged);
    const tags = uniqueStrings(localTags).filter((id) => !isSharedTag(id) || mergedSet.has(id));
    for (const id of merged) if (!tags.includes(id)) tags.push(id);
    return tags;
}

/**
 * The oldest (`dateAdded`, then `id`) shelf record of a library book, or null.
 * @param {Object} stateAdapter
 * @param {string} libraryBookId
 * @returns {Object|null}
 */
export function findShelfRecord(stateAdapter, libraryBookId) {
    if (typeof libraryBookId !== 'string' || !libraryBookId) return null;
    const records = stateAdapter.getBooks()
        .filter((book) => isShelfRecord(book) && book.libraryBookId === libraryBookId)
        .sort((a, b) => String(a.dateAdded || '').localeCompare(String(b.dateAdded || ''))
            || String(a.id).localeCompare(String(b.id)));
    return records[0] || null;
}

/** Metadata the library holds a value for and the record does not match (D6). */
function metadataUpdates(book, libraryBook) {
    const updates = {};
    if (typeof libraryBook.title === 'string' && libraryBook.title.trim() && libraryBook.title !== book.title) {
        updates.title = libraryBook.title;
    }
    const authors = Array.isArray(libraryBook.authors) ? libraryBook.authors.filter((a) => typeof a === 'string' && a.trim()) : [];
    const author = authors.join(', ');
    if (author && author !== book.author) updates.author = author;
    if (typeof libraryBook.coverUrl === 'string' && libraryBook.coverUrl && libraryBook.coverUrl !== book.cover) {
        updates.cover = libraryBook.coverUrl;
    }
    if (Number.isFinite(libraryBook.pageCount) && libraryBook.pageCount >= 0
        && Math.floor(libraryBook.pageCount) !== book.pageCount) {
        updates.pageCount = libraryBook.pageCount;
    }
    return updates;
}

/**
 * The shelf record for a library book: the oldest existing one, else a new one (D6).
 * @param {Object} stateAdapter
 * @param {Object} libraryBook - a LibraryBook
 * @returns {string|null} the record's id
 */
export function ensureShelfRecord(stateAdapter, libraryBook) {
    if (!libraryBook || typeof libraryBook.id !== 'string' || !libraryBook.id) return null;
    const existing = findShelfRecord(stateAdapter, libraryBook.id);
    if (existing) return existing.id;
    const shared = uniqueStrings(sharedTags(libraryBook.tags));
    const authors = Array.isArray(libraryBook.authors) ? libraryBook.authors.filter((a) => typeof a === 'string') : [];
    const book = stateAdapter.addBook({
        title: typeof libraryBook.title === 'string' ? libraryBook.title : '',
        author: authors.join(', '),
        cover: typeof libraryBook.coverUrl === 'string' ? libraryBook.coverUrl : null,
        pageCount: Number.isFinite(libraryBook.pageCount) ? libraryBook.pageCount : null,
        type: 'shelf',
        libraryBookId: libraryBook.id,
        tags: [...shared],
        libraryTagsBase: [...shared],
        links: { questIds: [], curriculumPromptIds: [] }
    });
    return book ? book.id : null;
}

/**
 * The household id for a write. getCatalog checks the session before serving its cache, so an
 * account switch never sends the previous household's id.
 */
async function householdIdFor(service) {
    const catalog = await service.getCatalog();
    return catalog && catalog.status === 'ready' && catalog.householdId ? catalog.householdId : null;
}

/**
 * Push a merge's diffs. Resolves to true when every diff reached the library.
 */
async function pushDiffs(service, libraryBookId, householdId, { toAdd, toRemove }) {
    try {
        if (toAdd.length > 0) {
            if (!householdId) return false;
            await service.addTags(libraryBookId, householdId, toAdd);
        }
        if (toRemove.length > 0) await service.removeTags(libraryBookId, toRemove);
        return true;
    } catch (error) {
        console.warn('[ShelfBook] tag push failed:', logCode(error));
        return false;
    }
}

/**
 * Merge one record against the library's tags, push the diffs, and work out the record's new
 * tags and base (D4).
 * - The record is unchanged after the push: `{ pushed, tags, libraryTagsBase }`.
 * - It changed while the push ran and the push landed: `{ interrupted: true, libraryTagsBase }`.
 *   The library now holds `merged`, so the base moves there while the tags (the player's newer
 *   edit) stay as they are; the caller then syncs again so that edit is measured against what
 *   the library really holds.
 * - It changed and the push failed: null. The stored base still describes the last exchange.
 */
async function mergeAndPush(stateAdapter, book, libraryTags, householdId, service) {
    const local = book.tags || [];
    const base = book.libraryTagsBase || [];
    const result = mergeShelfTags({ local, base, library: libraryTags });
    const hasDiffs = result.toAdd.length > 0 || result.toRemove.length > 0;
    const pushed = !hasDiffs || await pushDiffs(service, book.libraryBookId, householdId, result);
    const current = stateAdapter.getBook(book.id);
    if (!current || !sameList(current.tags, book.tags) || !sameList(current.libraryTagsBase, book.libraryTagsBase)
        || current.libraryBookId !== book.libraryBookId) {
        if (!pushed || !hasDiffs || !isShelfRecord(current) || current.libraryBookId !== book.libraryBookId) return null;
        return { interrupted: true, libraryTagsBase: result.merged };
    }
    return {
        pushed,
        tags: composeTags(local, result.merged),
        libraryTagsBase: pushed ? result.merged : uniqueStrings(sharedTags(libraryTags))
    };
}

/** Updates for tags and base, or {} when they already match. */
function tagUpdates(book, outcome) {
    if (!outcome) return {};
    const updates = {};
    if (outcome.tags && !sameList(book.tags, outcome.tags)) updates.tags = outcome.tags;
    if (!sameSet(book.libraryTagsBase, outcome.libraryTagsBase)) updates.libraryTagsBase = outcome.libraryTagsBase;
    return updates;
}

/** Times a sync starts over when the record keeps changing under its push. */
const MAX_SYNC_ATTEMPTS = 3;

/**
 * Write-through after a tag edit on a shelf record: read the book's library tags, merge, push.
 * @returns {Promise<'synced'|'pending'>} 'pending' leaves the diffs waiting in the record
 */
export async function syncShelfTags(stateAdapter, bookId, service = libraryCatalog) {
    for (let attempt = 1; attempt <= MAX_SYNC_ATTEMPTS; attempt += 1) {
        const book = stateAdapter.getBook(bookId);
        if (!isShelfRecord(book)) return 'pending';
        let libraryTags;
        let householdId;
        try {
            // No household (signed out, left it, or denied): no request at all (Review Focus 5).
            householdId = await householdIdFor(service);
            if (!householdId) return 'pending';
            libraryTags = await service.readBookTags(book.libraryBookId);
        } catch (error) {
            console.warn('[ShelfBook] tag read failed:', logCode(error));
            return 'pending';
        }
        const outcome = await mergeAndPush(stateAdapter, book, libraryTags, householdId, service);
        if (!outcome) return 'pending';
        if (outcome.interrupted) {
            // The push landed under a newer edit: record it in the base, then start over.
            const updates = tagUpdates(stateAdapter.getBook(bookId), outcome);
            if (Object.keys(updates).length > 0) stateAdapter.updateBook(bookId, updates);
            continue;
        }
        const updates = tagUpdates(book, outcome);
        if (Object.keys(updates).length > 0) stateAdapter.updateBook(bookId, updates);
        return outcome.pushed ? 'synced' : 'pending';
    }
    return 'pending';
}

/** Fill the library's empty series name from the record's ToS series (D5). Never throws. */
async function fillSeriesFor(stateAdapter, book, libraryBook, service) {
    if (libraryBook.seriesName !== null && libraryBook.seriesName !== undefined) return;
    const series = typeof stateAdapter.getSeriesForBook === 'function' ? stateAdapter.getSeriesForBook(book.id) : null;
    const name = series && typeof series.name === 'string' ? series.name.trim() : '';
    if (!name) return;
    try {
        await service.fillSeries(libraryBook.id, name);
    } catch (error) {
        console.warn('[ShelfBook] series fill failed:', logCode(error));
    }
}

/**
 * Bring every shelf record whose library book is in a ready catalogue up to date: metadata
 * (D6), shared tags (D4, when the catalogue's tags loaded) and the series fill (D5). One
 * updateBook per changed record; an unchanged record is not written.
 * @param {Object} stateAdapter
 * @param {Object} catalog - a getCatalog() result
 * @returns {Promise<{ changed: number }>}
 */
export async function refreshShelfRecords(stateAdapter, catalog, service = libraryCatalog) {
    if (!catalog || catalog.status !== 'ready' || !Array.isArray(catalog.books)) return { changed: 0 };
    const byId = new Map(catalog.books.map((book) => [book.id, book]));
    const ids = stateAdapter.getBooks().filter(isShelfRecord).map((book) => book.id);
    let changed = 0;
    for (const id of ids) {
        // Read each record right before its merge: an earlier record's push may have taken a while.
        const before = stateAdapter.getBook(id);
        if (!isShelfRecord(before)) continue;
        const libraryBook = byId.get(before.libraryBookId);
        // A deleted library book: the record keeps its metadata and tags (Review Focus 4).
        if (!libraryBook) continue;

        let outcome = null;
        if (catalog.tagsAvailable) {
            outcome = await mergeAndPush(stateAdapter, before, libraryBook.tags || [], catalog.householdId, service);
        }
        await fillSeriesFor(stateAdapter, before, libraryBook, service);

        const book = stateAdapter.getBook(id);
        if (!isShelfRecord(book) || book.libraryBookId !== libraryBook.id) continue;
        const updates = { ...metadataUpdates(book, libraryBook), ...tagUpdates(book, outcome) };
        if (Object.keys(updates).length > 0) {
            stateAdapter.updateBook(id, updates);
            changed += 1;
        }
        // The push landed under a newer edit: measure that edit against the library again.
        if (outcome && outcome.interrupted) await syncShelfTags(stateAdapter, id, service);
    }
    return { changed };
}

/**
 * "Found on our shelf — link it?" (D7): `physical` books with exactly one strong match that
 * is not their dismissed match. Never links anything.
 * @returns {Array<{ bookId: string, libraryBook: Object }>}
 */
export function findShelfOffers(stateAdapter, catalog) {
    if (!catalog || catalog.status !== 'ready' || !Array.isArray(catalog.books) || catalog.books.length === 0) return [];
    const offers = [];
    for (const book of stateAdapter.getBooks()) {
        if (book.type !== 'physical') continue;
        const { strong } = matchToLibrary(book, catalog.books);
        if (strong.length !== 1) continue;
        if (strong[0].id === book.shelfMatchDismissed) continue;
        offers.push({ bookId: book.id, libraryBook: strong[0] });
    }
    return offers;
}

/**
 * Accept an offer: the physical record becomes a shelf record in place (links, id and dates
 * kept), its tags the union of its own and the library's shared tags, and its shared tags
 * pushed (D7). The push may stay pending.
 * @returns {Promise<string|null>} the record's id
 */
export async function linkPhysicalToShelf(stateAdapter, bookId, libraryBook, service = libraryCatalog) {
    const book = stateAdapter.getBook(bookId);
    // Only a physical book is offered and linked; another type stays its own record (D6).
    if (!book || book.type !== 'physical') return null;
    if (!libraryBook || typeof libraryBook.id !== 'string' || !libraryBook.id) return null;
    const libraryShared = uniqueStrings(sharedTags(libraryBook.tags));
    const tags = uniqueStrings([...(book.tags || []), ...libraryShared]);
    stateAdapter.updateBook(bookId, {
        ...metadataUpdates(book, libraryBook),
        type: 'shelf',
        libraryBookId: libraryBook.id,
        libraryTagsBase: libraryShared,
        tags,
        shelfMatchDismissed: null
    });
    await syncShelfTags(stateAdapter, bookId, service);
    return bookId;
}

/** "Not this one": that library book is not offered for this record again. */
export function dismissShelfOffer(stateAdapter, bookId, libraryBookId) {
    if (typeof libraryBookId !== 'string' || !libraryBookId) return null;
    return stateAdapter.updateBook(bookId, { shelfMatchDismissed: libraryBookId });
}

/** "Unlink from the library": the record becomes `physical` and its match is dismissed. */
export function unlinkFromLibrary(stateAdapter, bookId) {
    const book = stateAdapter.getBook(bookId);
    if (!isShelfRecord(book)) return null;
    return stateAdapter.updateBook(bookId, {
        type: 'physical',
        libraryBookId: null,
        libraryTagsBase: null,
        shelfMatchDismissed: book.libraryBookId
    });
}

/**
 * Whether a shelf record's library book is gone. Derived at render time, never stored; only
 * a ready catalogue whose tags loaded can say so.
 */
export function isLibraryMissing(book, catalog) {
    if (!isShelfRecord(book)) return false;
    if (!catalog || catalog.status !== 'ready' || !catalog.tagsAvailable || !Array.isArray(catalog.books)) return false;
    return !catalog.books.some((libraryBook) => libraryBook.id === book.libraryBookId);
}

/**
 * Keep shelf records in step with the household library for the life of the page: a load
 * now, a reload when the tab comes back and the catalogue is stale, and a refresh plus the
 * offers after every completed load. Returns at once; nothing here is awaited by the page.
 * @param {Object} stateAdapter
 * @param {{ onOffers?: Function, service?: Object, doc?: Document }} [options]
 * @returns {() => void} stop
 */
export function startLibrarySync(stateAdapter, { onOffers, service = libraryCatalog, doc } = {}) {
    const target = doc || (typeof document !== 'undefined' ? document : null);
    let chain = Promise.resolve();
    let stopped = false;
    let lastQueued = null;

    const handle = async (catalog) => {
        if (stopped || !catalog || catalog.status !== 'ready') return;
        // A load that overlapped a tag write may predate it, and merging against it would undo
        // that write. getCatalog serves this same result only while it is fresh; otherwise a
        // newer load is running and will be handled when it lands.
        if (await service.getCatalog() !== catalog) return;
        await refreshShelfRecords(stateAdapter, catalog, service);
        if (!stopped && typeof onOffers === 'function') onOffers(findShelfOffers(stateAdapter, catalog));
    };
    // Loads can finish close together; refreshes run one at a time, once per result.
    const enqueue = (catalog) => {
        if (!catalog || catalog === lastQueued) return;
        lastQueued = catalog;
        chain = chain.then(() => handle(catalog)).catch((error) => {
            console.warn('[ShelfBook] library sync failed:', logCode(error));
        });
    };

    const unsubscribe = service.subscribe(enqueue);
    const load = () => {
        // A cached result is not announced to subscribers, so the answer is queued here too.
        Promise.resolve()
            .then(() => service.getCatalog())
            .then(enqueue)
            .catch((error) => console.warn('[ShelfBook] catalogue load failed:', logCode(error)));
    };
    const onVisibility = () => {
        // getCatalog serves a fresh cache without a request, so this only reloads when stale.
        if (target && target.visibilityState === 'visible') load();
    };
    if (target && typeof target.addEventListener === 'function') {
        target.addEventListener('visibilitychange', onVisibility);
    }
    load();

    return () => {
        stopped = true;
        unsubscribe();
        if (target && typeof target.removeEventListener === 'function') {
            target.removeEventListener('visibilitychange', onVisibility);
        }
    };
}
