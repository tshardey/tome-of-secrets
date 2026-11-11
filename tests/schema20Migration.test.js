/**
 * @jest-environment jsdom
 *
 * Schema 19 -> 20 (Plan 4, D2): book types replace the `audio` tag and Physical TBR.
 * Every entry point (loadState, migrateState, applySnapshot) must give the same answer.
 */
import { STORAGE_KEYS } from '../assets/js/character-sheet/storageKeys.js';
import { migrateState } from '../assets/js/character-sheet/dataMigrator.js';
import {
    SCHEMA_VERSION,
    validateCharacterState,
    resetSchemaWriteGateForTests
} from '../assets/js/character-sheet/dataValidator.js';
import { applySnapshot } from '../assets/js/services/cloudSync.js';
import { getStateKey } from '../assets/js/character-sheet/persistence.js';
import { characterState, loadState, resetStateLoadedForTests } from '../assets/js/character-sheet/state.js';
import { BOOK_TYPES, deriveBookType } from '../assets/js/utils/bookTypes.js';

const SCHEMA_VERSION_KEY = 'tomeOfSecrets_schemaVersion';
const D2_FIELDS = ['type', 'libraryBookId', 'libraryTagsBase', 'shelfMatchDismissed', 'status', 'shelfCategory', 'tags'];

function book(id, overrides = {}) {
    return {
        id,
        title: `The Salt Road ${id}`,
        author: 'Member A',
        cover: null,
        pageCount: 320,
        status: 'reading',
        shelfCategory: 'general',
        dateAdded: '2026-01-02T00:00:00.000Z',
        dateCompleted: null,
        links: { questIds: [], curriculumPromptIds: [] },
        tags: [],
        ...overrides
    };
}

function buildV19() {
    return {
        [STORAGE_KEYS.BOOKS]: {
            'b-audio': book('b-audio', { tags: ['audio', 'fantasy'] }),
            'b-other': book('b-other', { status: 'other', shelfCategory: 'physical-tbr' }),
            'b-done': book('b-done', {
                status: 'completed',
                dateCompleted: '2026-03-04T00:00:00.000Z',
                links: { questIds: ['q-1', 'q-2'], curriculumPromptIds: [], grandfatheredQuestIds: ['q-1', 'q-2'] }
            }),
            'b-series': book('b-series', { title: 'Glass Orchard' }),
            'b-curriculum': book('b-curriculum', { links: { questIds: [], curriculumPromptIds: ['p-1'] } })
        },
        [STORAGE_KEYS.COMPLETED_QUESTS]: [
            { id: 'q-1', type: '♥ Organize the Stacks', bookId: 'b-done', status: 'completed', month: 'March', year: '2026', dateAdded: '2026-02-01T00:00:00.000Z', dateCompleted: '2026-03-04T00:00:00.000Z', rewards: { xp: 15, dollars: 15, items: [], modifiedBy: [] } },
            { id: 'q-2', type: '⭐ Extra Credit', bookId: 'b-done', status: 'completed', month: 'March', year: '2026', dateAdded: '2026-02-01T00:00:00.000Z', dateCompleted: '2026-03-04T00:00:00.000Z', rewards: { xp: 0, dollars: 15, items: [], modifiedBy: [] } }
        ],
        [STORAGE_KEYS.SERIES]: {
            's-1': { id: 's-1', name: 'Orchard Cycle', bookIds: ['b-series'], releasedCount: 3, expectedCount: 3, isCompletedSeries: true }
        },
        [STORAGE_KEYS.EXTERNAL_CURRICULUM]: {
            curriculums: {
                'c-1': {
                    id: 'c-1', name: 'Club', type: 'prompt',
                    categories: { 'cat-1': { id: 'cat-1', name: 'Cat', prompts: { 'p-1': { id: 'p-1', text: 'A prompt', bookId: 'b-curriculum', completedAt: null } } } }
                }
            }
        }
    };
}

function withoutD2(b) {
    const copy = { ...b };
    D2_FIELDS.forEach((field) => delete copy[field]);
    return copy;
}

function clone(value) {
    return JSON.parse(JSON.stringify(value));
}

/** The assertions every entry point must satisfy. */
function expectMigratedShape(v19, out) {
    const books = out[STORAGE_KEYS.BOOKS];
    expect(Object.keys(books).sort()).toEqual(Object.keys(v19[STORAGE_KEYS.BOOKS]).sort());

    expect(books['b-audio'].type).toBe('audiobook');
    expect(books['b-audio'].tags).toEqual(['fantasy']);
    ['b-other', 'b-done', 'b-series', 'b-curriculum'].forEach((id) => {
        expect(books[id].type).toBe('unsorted');
    });

    Object.values(books).forEach((b) => {
        expect(b).not.toHaveProperty('shelfCategory');
        expect(['reading', 'completed']).toContain(b.status);
        expect(b.libraryBookId).toBeNull();
        expect(b.libraryTagsBase).toBeNull();
        expect(b.shelfMatchDismissed).toBeNull();
    });
    expect(books['b-other'].status).toBe('reading');
    expect(books['b-done'].status).toBe('completed');

    // Everything outside D2 is untouched
    for (const id of Object.keys(books)) {
        expect(withoutD2(books[id])).toEqual(withoutD2(v19[STORAGE_KEYS.BOOKS][id]));
    }
    expect(books['b-done'].links.grandfatheredQuestIds).toEqual(['q-1', 'q-2']);
    expect(books['b-done'].dateCompleted).toBe('2026-03-04T00:00:00.000Z');
    expect(out[STORAGE_KEYS.SERIES]['s-1'].bookIds).toEqual(['b-series']);
    expect(out[STORAGE_KEYS.EXTERNAL_CURRICULUM].curriculums['c-1'].categories['cat-1'].prompts['p-1'].bookId).toBe('b-curriculum');
    expect(books['b-curriculum'].links.curriculumPromptIds).toEqual(['p-1']);

    expect(out[STORAGE_KEYS.BOOK_TIDY]).toEqual({
        status: 'pending', postponedAt: null, completedAt: null, removedBooks: {}
    });
}

describe('schema 20 migration (book types)', () => {
    beforeEach(() => {
        localStorage.clear();
        resetSchemaWriteGateForTests();
    });

    it('is schema 20', () => {
        expect(SCHEMA_VERSION).toBe(20);
    });

    it('types audiobooks from the audio tag, everything else unsorted, and keeps all other data', () => {
        const v19 = buildV19();
        const out = migrateState(clone(v19), { fromVersion: 19 });
        expectMigratedShape(v19, out);
    });

    it('marks the tidy done when no book is unsorted', () => {
        const v19 = {
            [STORAGE_KEYS.BOOKS]: {
                a: book('a', { tags: ['audio'] }),
                b: book('b', { tags: ['fantasy', 'audio'], status: 'other' })
            }
        };
        const out = migrateState(v19, { fromVersion: 19 });
        expect(out[STORAGE_KEYS.BOOKS].a.type).toBe('audiobook');
        expect(out[STORAGE_KEYS.BOOKS].b.tags).toEqual(['fantasy']);
        expect(out[STORAGE_KEYS.BOOK_TIDY].status).toBe('done');
    });

    it('keeps a bookTidy that is already present', () => {
        const v19 = buildV19();
        const tidy = { status: 'postponed', postponedAt: '2026-11-01T00:00:00.000Z', completedAt: null, removedBooks: {} };
        v19[STORAGE_KEYS.BOOK_TIDY] = tidy;
        const out = migrateState(v19, { fromVersion: 19 });
        expect(out[STORAGE_KEYS.BOOK_TIDY]).toEqual(tidy);
    });

    it('makes no network call, reads no clock and makes no random ids; two runs are deep-equal', () => {
        const realFetch = global.fetch;
        const realNow = Date.now;
        const realRandom = Math.random;
        global.fetch = () => { throw new Error('network call during migration'); };
        Date.now = () => { throw new Error('clock read during migration'); };
        Math.random = () => { throw new Error('random id during migration'); };
        try {
            const v19 = buildV19();
            const first = migrateState(clone(v19), { fromVersion: 19 });
            const second = migrateState(clone(v19), { fromVersion: 19 });
            expectMigratedShape(v19, first);
            expect(second).toEqual(first);
        } finally {
            global.fetch = realFetch;
            Date.now = realNow;
            Math.random = realRandom;
        }
    });

    it('is idempotent: migrating v20 output again changes nothing', () => {
        const once = migrateState(clone(buildV19()), { fromVersion: 19 });
        const twice = migrateState(clone(once), { fromVersion: 19 });
        expect(twice).toEqual(once);
    });

    it('survives validation (the seam)', () => {
        const v19 = buildV19();
        const out = validateCharacterState(migrateState(clone(v19), { fromVersion: 19 }));
        expectMigratedShape(v19, out);
        // Quests keep their book links
        expect(out[STORAGE_KEYS.COMPLETED_QUESTS].map((q) => q.bookId)).toEqual(['b-done', 'b-done']);
    });

    it('loadState migrates a stored v19 save and writes a pending bookTidy', async () => {
        const v19 = buildV19();
        localStorage.setItem(SCHEMA_VERSION_KEY, '19');
        Object.entries(v19).forEach(([key, value]) => localStorage.setItem(key, JSON.stringify(value)));
        resetStateLoadedForTests();

        await loadState();

        expectMigratedShape(v19, characterState);
        expect(JSON.parse(localStorage.getItem(STORAGE_KEYS.BOOK_TIDY)).status).toBe('pending');
        expect(localStorage.getItem(SCHEMA_VERSION_KEY)).toBe('20');
    });

    it('applySnapshot of a v19 cloud snapshot arrives as v20 with a pending review', async () => {
        const v19 = buildV19();
        await applySnapshot({
            version: 19,
            data: { formData: {}, characterState: clone(v19), monthlyCompletedBooks: [] }
        });

        const books = await getStateKey(STORAGE_KEYS.BOOKS, {});
        expect(books['b-audio'].type).toBe('audiobook');
        expect(books['b-audio'].tags).toEqual(['fantasy']);
        expect(books['b-other'].type).toBe('unsorted');
        expect(books['b-other'].status).toBe('reading');
        expect(books['b-other']).not.toHaveProperty('shelfCategory');
        const tidy = await getStateKey(STORAGE_KEYS.BOOK_TIDY, null);
        expect(tidy.status).toBe('pending');
        expect(localStorage.getItem(SCHEMA_VERSION_KEY)).toBe('20');
    });
});

describe('deriveBookType', () => {
    it('re-types a shelf book with no libraryBookId as unsorted', () => {
        expect(deriveBookType({ type: 'shelf' })).toBe('unsorted');
        expect(deriveBookType({ type: 'shelf', libraryBookId: '' })).toBe('unsorted');
    });

    it('keeps a shelf book with a libraryBookId', () => {
        expect(deriveBookType({ type: 'shelf', libraryBookId: '00000000-0000-4000-8000-000000000001' })).toBe('shelf');
    });

    it('keeps any other valid type', () => {
        BOOK_TYPES.filter((t) => t !== 'shelf').forEach((type) => {
            expect(deriveBookType({ type, tags: [] })).toBe(type);
        });
    });

    it('derives audiobook from the type-derived tag, else unsorted', () => {
        expect(deriveBookType({ tags: ['fantasy', 'audio'] })).toBe('audiobook');
        expect(deriveBookType({ type: 'bogus', tags: ['fantasy'] })).toBe('unsorted');
        expect(deriveBookType({})).toBe('unsorted');
    });
});

describe('StateAdapter book types and bookTidy (schema 20)', () => {
    let adapter;
    let state;

    beforeEach(async () => {
        localStorage.clear();
        resetSchemaWriteGateForTests();
        const { StateAdapter } = await import('../assets/js/character-sheet/stateAdapter.js');
        const { createEmptyCharacterState } = await import('../assets/js/character-sheet/storageKeys.js');
        state = createEmptyCharacterState();
        adapter = new StateAdapter(state);
    });

    it('addBook stores the v20 fields and no shelfCategory; status is reading or completed', () => {
        const b = adapter.addBook({ title: 'The Salt Road', type: 'ebook', status: 'other', shelfCategory: 'physical-tbr', tags: ['fantasy', 'audio'] });
        expect(b.type).toBe('ebook');
        expect(b.status).toBe('reading');
        expect(b).not.toHaveProperty('shelfCategory');
        expect(b.libraryBookId).toBeNull();
        expect(b.libraryTagsBase).toBeNull();
        expect(b.shelfMatchDismissed).toBeNull();
        expect(b.tags).toEqual(['fantasy']);
        expect(adapter.getBook(b.id)).not.toHaveProperty('shelfCategory');
    });

    it('addBook defaults to unsorted, and a shelf book keeps its library link', () => {
        expect(adapter.addBook({ title: 'Glass Orchard' }).type).toBe('unsorted');
        const shelf = adapter.addBook({
            title: 'Ember Atlas', type: 'shelf',
            libraryBookId: '00000000-0000-4000-8000-000000000002', libraryTagsBase: ['fantasy']
        });
        expect(shelf.type).toBe('shelf');
        expect(shelf.libraryBookId).toBe('00000000-0000-4000-8000-000000000002');
        expect(shelf.libraryTagsBase).toEqual(['fantasy']);
        expect(adapter.addBook({ title: 'No Link', type: 'shelf' }).type).toBe('unsorted');
    });

    it('updateBook changes the type and clears the library fields when it leaves shelf', () => {
        const b = adapter.addBook({
            title: 'Ember Atlas', type: 'shelf',
            libraryBookId: '00000000-0000-4000-8000-000000000003', libraryTagsBase: []
        });
        adapter.updateBook(b.id, { shelfMatchDismissed: '00000000-0000-4000-8000-000000000009' });
        expect(adapter.getBook(b.id).shelfMatchDismissed).toBe('00000000-0000-4000-8000-000000000009');
        const updated = adapter.updateBook(b.id, { type: 'audiobook', status: 'other' });
        expect(updated.type).toBe('audiobook');
        expect(updated.status).toBe('reading');
        expect(updated.libraryBookId).toBeNull();
        expect(updated.libraryTagsBase).toBeNull();
        expect(adapter.updateBook(b.id, { type: 'not-a-type' }).type).toBe('audiobook');
    });

    it('getBooksByType filters by type', () => {
        adapter.addBook({ title: 'A', type: 'audiobook' });
        adapter.addBook({ title: 'B', type: 'ebook' });
        adapter.addBook({ title: 'C' });
        expect(adapter.getBooksByType('audiobook').map((b) => b.title)).toEqual(['A']);
        expect(adapter.getBooksByType('unsorted').map((b) => b.title)).toEqual(['C']);
        expect(adapter.getBooksByType('bogus')).toEqual([]);
    });

    it('getBookTidy / setBookTidy validate, persist to localStorage and emit', async () => {
        const { STATE_EVENTS } = await import('../assets/js/character-sheet/stateAdapter.js');
        expect(adapter.getBookTidy()).toEqual({ status: 'done', postponedAt: null, completedAt: null, removedBooks: {} });
        const handler = jest.fn();
        adapter.on(STATE_EVENTS.BOOK_TIDY_CHANGED, handler);
        const next = adapter.setBookTidy({ status: 'postponed', postponedAt: '2026-11-01T00:00:00.000Z', completedAt: null, removedBooks: {}, junk: 1 });
        expect(next).toEqual({ status: 'postponed', postponedAt: '2026-11-01T00:00:00.000Z', completedAt: null, removedBooks: {} });
        expect(JSON.parse(localStorage.getItem(STORAGE_KEYS.BOOK_TIDY))).toEqual(next);
        expect(adapter.getBookTidy()).toEqual(next);
        expect(handler).toHaveBeenCalledWith(next);
    });

    it('setBookTidy refuses to write when the schema write gate is closed', () => {
        localStorage.setItem(SCHEMA_VERSION_KEY, '20');
        resetSchemaWriteGateForTests();
        adapter.getBookTidy();
        // Another tab (or a newer build) moves the stored version on
        localStorage.setItem(SCHEMA_VERSION_KEY, '21');
        expect(adapter.setBookTidy({ status: 'done', postponedAt: null, completedAt: null, removedBooks: {} })).toBeNull();
        expect(localStorage.getItem(STORAGE_KEYS.BOOK_TIDY)).toBeNull();
    });
});
