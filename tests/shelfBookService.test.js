/**
 * @jest-environment jsdom
 *
 * Shelf records (Plan 4, Task 7): the three-way shared-tag merge (D4), shelf records (D6),
 * series fill (D5), "Found on our shelf" (D7), two players on one library (D12), and the
 * Review Focus cases 2, 4 and 5. All titles and ids are invented.
 */
jest.mock('../assets/js/character-sheet/persistence.js', () => {
  const actual = jest.requireActual('../assets/js/character-sheet/persistence.js');
  return { ...actual, setStateKey: jest.fn((...args) => actual.setStateKey(...args)) };
});

import { setStateKey } from '../assets/js/character-sheet/persistence.js';
import { StateAdapter, STATE_EVENTS } from '../assets/js/character-sheet/stateAdapter.js';
import { STORAGE_KEYS, createEmptyCharacterState } from '../assets/js/character-sheet/storageKeys.js';
import { validateCharacterState } from '../assets/js/character-sheet/dataValidator.js';
import { loadState } from '../assets/js/character-sheet/state.js';
import { bookTags, allItems } from '../assets/js/character-sheet/data.js';
import { effectiveBookTags } from '../assets/js/utils/bookTagRules.js';
import { classifyBonusCardState } from '../assets/js/character-sheet/ui.js';
import { BaseQuestHandler } from '../assets/js/quest-handlers/BaseQuestHandler.js';
import { MULTI_QUEST_ABILITIES } from '../assets/js/config/gameConfig.js';
import { LibraryCatalogService, LibraryUnavailableError } from '../assets/js/services/LibraryCatalogService.js';
import {
  mergeShelfTags,
  ensureShelfRecord,
  findShelfRecord,
  syncShelfTags,
  refreshShelfRecords,
  findShelfOffers,
  linkPhysicalToShelf,
  dismissShelfOffer,
  unlinkFromLibrary,
  isLibraryMissing,
  startLibrarySync
} from '../assets/js/services/ShelfBookService.js';

// Shared tags (no scope in the data). Reader and derived ids come from the data (R2).
const F = 'fantasy';
const C = 'cozy';
const E = 'epistolary';
const READER = bookTags.find(t => t.scope === 'reader' && !t.derivedFromType).id;
const DERIVED = bookTags.find(t => t.derivedFromType).id;

const HOUSEHOLD = '00000000-0000-4000-8000-0000000000aa';
const L = '00000000-0000-4000-8000-000000000001';
const L2 = '00000000-0000-4000-8000-000000000002';

const sorted = (list) => [...(list || [])].sort();
const clone = (value) => JSON.parse(JSON.stringify(value));
const flush = () => new Promise(resolve => setTimeout(resolve, 0));

/**
 * An in-memory household library behind the LibraryCatalogService interface. `mode` is
 * 'up', 'down' (every call fails as a timeout) or 'hang' (getCatalog never resolves).
 */
function createFakeLibrary() {
  const books = new Map();
  const tags = new Map();
  const listeners = new Set();
  const calls = { getCatalog: 0, readBookTags: 0, addTags: [], removeTags: [], fillSeries: [] };
  let current = null;
  const fake = {
    mode: 'up',
    calls,
    tags,
    addBook(book) {
      books.set(book.id, {
        title: 'The Salt Road', authors: ['Member A'], coverUrl: null, pageCount: null,
        seriesName: null, seriesVolume: null, editionLabels: [], ...book
      });
      tags.set(book.id, new Set(book.tags || []));
      delete books.get(book.id).tags;
      current = null;
    },
    setBook(id, changes) {
      Object.assign(books.get(id), changes);
      current = null;
    },
    deleteBook(id) {
      books.delete(id);
      tags.delete(id);
      current = null;
    },
    libraryTags(id) {
      return sorted(tags.get(id));
    },
    catalog() {
      return {
        status: 'ready',
        userId: 'user-a',
        householdId: HOUSEHOLD,
        books: [...books.entries()].map(([id, b]) => ({ id, ...clone(b), tags: sorted(tags.get(id)) })),
        tagsAvailable: true,
        fetchedAt: 1
      };
    },
    fail() {
      if (fake.mode !== 'up') throw new LibraryUnavailableError('timeout');
    },
    // --- the LibraryCatalogService interface ---
    async getCatalog() {
      calls.getCatalog += 1;
      if (fake.mode === 'hang') return new Promise(() => {});
      if (fake.mode === 'down') return { status: 'unavailable', books: [], tagsAvailable: false, reason: 'timeout' };
      if (!current) {
        current = fake.catalog();
        for (const fn of [...listeners]) fn(current);
      }
      return current;
    },
    peek() {
      return current;
    },
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    /** Announce a result to subscribers, as a load that finished late would. */
    emit(result) {
      for (const fn of [...listeners]) fn(result);
    },
    async readBookTags(id) {
      calls.readBookTags += 1;
      fake.fail();
      return sorted(tags.get(id));
    },
    async addTags(id, householdId, tagIds) {
      calls.addTags.push({ id, householdId, tagIds: [...tagIds] });
      fake.fail();
      if (!tags.has(id)) tags.set(id, new Set());
      for (const t of tagIds) tags.get(id).add(t);
      current = null;
    },
    async removeTags(id, tagIds) {
      calls.removeTags.push({ id, tagIds: [...tagIds] });
      fake.fail();
      for (const t of tagIds) tags.get(id)?.delete(t);
      current = null;
    },
    async fillSeries(id, name) {
      calls.fillSeries.push({ id, name });
      fake.fail();
      const book = books.get(id);
      current = null;
      if (book && book.seriesName === null) {
        book.seriesName = name;
        return 'filled';
      }
      return 'kept';
    }
  };
  return fake;
}

function newAdapter() {
  return new StateAdapter(createEmptyCharacterState());
}

function addShelf(adapter, libraryBookId, extra = {}) {
  return adapter.addBook({
    title: 'The Salt Road',
    author: 'Member A',
    type: 'shelf',
    libraryBookId,
    tags: [],
    libraryTagsBase: [],
    ...extra
  });
}

beforeEach(() => {
  localStorage.clear();
  setStateKey.mockClear();
});

describe('mergeShelfTags (D4)', () => {
  it('local add: merged [f,c], toAdd [c]', () => {
    expect(mergeShelfTags({ base: [F], local: [F, C], library: [F] }))
      .toEqual({ merged: [F, C], toAdd: [C], toRemove: [] });
  });

  it('local remove: toRemove [c]', () => {
    expect(mergeShelfTags({ base: [F, C], local: [F], library: [F, C] }))
      .toEqual({ merged: [F], toAdd: [], toRemove: [C] });
  });

  it('library add: merged [f,e], no diffs', () => {
    expect(mergeShelfTags({ base: [F], local: [F], library: [F, E] }))
      .toEqual({ merged: [F, E], toAdd: [], toRemove: [] });
  });

  it('library remove: merged [f]', () => {
    expect(mergeShelfTags({ base: [F, E], local: [F, E], library: [F] }))
      .toEqual({ merged: [F], toAdd: [], toRemove: [] });
  });

  it('both, disjoint: merged [f,c,e], toAdd [c]', () => {
    expect(mergeShelfTags({ base: [F], local: [F, C], library: [F, E] }))
      .toEqual({ merged: [F, C, E], toAdd: [C], toRemove: [] });
  });

  it('reader and derived ids in local are excluded from every set', () => {
    const result = mergeShelfTags({ base: [F, READER], local: [F, READER, DERIVED], library: [F, READER, DERIVED] });
    expect(result).toEqual({ merged: [F], toAdd: [], toRemove: [] });
    const added = mergeShelfTags({ base: [], local: [READER, DERIVED, C], library: [] });
    expect(added).toEqual({ merged: [C], toAdd: [C], toRemove: [] });
  });
});

describe('two players on one library (D12)', () => {
  it('a shared tag reaches the other player; reader tags never leave their record', async () => {
    const lib = createFakeLibrary();
    lib.addBook({ id: L });
    const a = newAdapter();
    const b = newAdapter();
    const recA = ensureShelfRecord(a, lib.catalog().books[0]);
    const recB = ensureShelfRecord(b, lib.catalog().books[0]);

    a.updateBook(recA, { tags: [F, READER] });
    expect(await syncShelfTags(a, recA, lib)).toBe('synced');
    expect(lib.libraryTags(L)).toEqual([F]);

    await refreshShelfRecords(b, lib.catalog(), lib);
    expect(b.getBook(recB).tags).toEqual([F]);

    b.updateBook(recB, { tags: [] });
    expect(await syncShelfTags(b, recB, lib)).toBe('synced');
    expect(lib.libraryTags(L)).toEqual([]);

    await refreshShelfRecords(a, lib.catalog(), lib);
    expect(a.getBook(recA).tags).toEqual([READER]);
    expect(lib.calls.addTags.flatMap(c => c.tagIds)).not.toContain(READER);
  });
});

describe('offline edit', () => {
  it('waits in the record, survives a reload, and is pushed when the library is back', async () => {
    const lib = createFakeLibrary();
    lib.addBook({ id: L, tags: [F] });
    const state = createEmptyCharacterState();
    const a = new StateAdapter(state);
    const rec = ensureShelfRecord(a, lib.catalog().books[0]);

    lib.mode = 'down';
    a.updateBook(rec, { tags: [F, C] });
    expect(await syncShelfTags(a, rec, lib)).toBe('pending');
    expect(a.getBook(rec).tags).toEqual([F, C]);
    expect(a.getBook(rec).libraryTagsBase).toEqual([F]);

    const reloaded = new StateAdapter(validateCharacterState(clone(state)));
    lib.mode = 'up';
    await refreshShelfRecords(reloaded, lib.catalog(), lib);
    expect(lib.libraryTags(L)).toEqual(sorted([F, C]));
    expect(sorted(reloaded.getBook(rec).libraryTagsBase)).toEqual(sorted([F, C]));
    expect(sorted(reloaded.getBook(rec).tags)).toEqual(sorted([F, C]));
  });

  it('a failed push sets the base to the library so the same diffs are re-pushed', async () => {
    const lib = createFakeLibrary();
    lib.addBook({ id: L, tags: [F] });
    const a = newAdapter();
    const rec = ensureShelfRecord(a, lib.catalog().books[0]);
    a.updateBook(rec, { tags: [F, C] });
    const readOk = lib.readBookTags;
    lib.addTags = async () => { throw new LibraryUnavailableError('timeout'); };
    lib.readBookTags = readOk;

    expect(await syncShelfTags(a, rec, lib)).toBe('pending');
    expect(a.getBook(rec).libraryTagsBase).toEqual([F]);
    expect(mergeShelfTags({ local: a.getBook(rec).tags, base: a.getBook(rec).libraryTagsBase, library: [F] }).toAdd)
      .toEqual([C]);
  });
});

describe('library unreachable mid-session (§6.7)', () => {
  it('refreshShelfRecords with status unavailable changes nothing and resolves', async () => {
    const a = newAdapter();
    const rec = addShelf(a, L, { tags: [F], libraryTagsBase: [F] });
    const before = clone(a.getBook(rec.id));
    setStateKey.mockClear();
    const lib = createFakeLibrary();

    await expect(refreshShelfRecords(a, { status: 'unavailable', books: [], tagsAvailable: false }, lib))
      .resolves.toEqual({ changed: 0 });
    expect(a.getBook(rec.id)).toEqual(before);
    expect(setStateKey).not.toHaveBeenCalled();
  });

  it('startLibrarySync with a never-resolving catalogue does not delay loadState', async () => {
    await loadState();
    const lib = createFakeLibrary();
    lib.mode = 'hang';
    const a = newAdapter();
    const stop = startLibrarySync(a, { onOffers: jest.fn(), service: lib });
    expect(typeof stop).toBe('function');
    await flush();
    expect(lib.calls.getCatalog).toBe(1);
    stop();
  });
});

describe('no-op refresh (Review Focus 2)', () => {
  it('a second refresh with identical data writes nothing and emits nothing', async () => {
    const lib = createFakeLibrary();
    lib.addBook({ id: L, tags: [F, E], coverUrl: 'https://example.test/salt.jpg', pageCount: 320 });
    const a = newAdapter();
    const rec = addShelf(a, L, { tags: [F, READER], libraryTagsBase: [F] });
    a.addSeries({ name: 'Saga', bookIds: [rec.id] });

    await refreshShelfRecords(a, lib.catalog(), lib);
    setStateKey.mockClear();
    const onBooks = jest.fn();
    a.on(STATE_EVENTS.BOOKS_CHANGED, onBooks);

    await expect(refreshShelfRecords(a, lib.catalog(), lib)).resolves.toEqual({ changed: 0 });
    expect(setStateKey).not.toHaveBeenCalled();
    expect(onBooks).not.toHaveBeenCalled();
    expect(lib.calls.addTags).toHaveLength(0);
  });
});

describe('metadata (D6)', () => {
  it('a library title change updates the record; a null cover keeps the ToS cover', async () => {
    const lib = createFakeLibrary();
    lib.addBook({ id: L, title: 'Glass Orchard', coverUrl: null, pageCount: 410 });
    const a = newAdapter();
    const rec = addShelf(a, L, { title: 'Glass Orchard', cover: 'https://example.test/own.jpg' });

    lib.setBook(L, { title: 'Glass Orchard (Revised)' });
    await expect(refreshShelfRecords(a, lib.catalog(), lib)).resolves.toEqual({ changed: 1 });
    const book = a.getBook(rec.id);
    expect(book.title).toBe('Glass Orchard (Revised)');
    expect(book.cover).toBe('https://example.test/own.jpg');
    expect(book.pageCount).toBe(410);
  });
});

describe('deleted library book (Review Focus 4)', () => {
  it('keeps the record, says it is missing, and pushes nothing', async () => {
    const lib = createFakeLibrary();
    lib.addBook({ id: L, tags: [F] });
    lib.addBook({ id: L2, title: 'Glass Orchard' });
    const a = newAdapter();
    const rec = addShelf(a, L, { tags: [F, C], libraryTagsBase: [F] });
    lib.deleteBook(L);
    const before = clone(a.getBook(rec.id));
    setStateKey.mockClear();

    const catalog = lib.catalog();
    await refreshShelfRecords(a, catalog, lib);

    expect(a.getBook(rec.id)).toEqual(before);
    expect(isLibraryMissing(a.getBook(rec.id), catalog)).toBe(true);
    expect(isLibraryMissing(a.getBook(rec.id), { ...catalog, tagsAvailable: false })).toBe(false);
    expect(isLibraryMissing(a.getBook(rec.id), { status: 'unavailable', books: [] })).toBe(false);
    expect(lib.calls.addTags).toHaveLength(0);
    expect(lib.calls.removeTags).toHaveLength(0);
    expect(setStateKey).not.toHaveBeenCalled();
  });
});

describe('left the household (Review Focus 5)', () => {
  function fakeClient(requests) {
    const builder = {};
    for (const m of ['select', 'eq', 'order', 'limit', 'range', 'in', 'delete', 'upsert', 'update', 'is']) {
      builder[m] = () => builder;
    }
    builder.then = (resolve) => resolve({ data: [], error: null });
    return {
      auth: { getSession: async () => ({ data: { session: { user: { id: 'user-a' } } }, error: null }) },
      schema: () => ({
        from: (table) => {
          requests.push(table);
          return builder;
        }
      })
    };
  }

  it('keeps every shelf record, makes no write, and does not ask again within 60 s', async () => {
    const requests = [];
    let now = 1000;
    const client = fakeClient(requests);
    const service = new LibraryCatalogService({ getClient: async () => client, now: () => now });
    const a = newAdapter();
    const rec = addShelf(a, L, { tags: [F, C], libraryTagsBase: [F] });
    const before = clone(a.getBooks());
    setStateKey.mockClear();

    const catalog = await service.getCatalog();
    expect(catalog.status).toBe('no-household');
    expect(requests).toEqual(['household_members']);

    await refreshShelfRecords(a, catalog, service);
    expect(await syncShelfTags(a, rec.id, service)).toBe('pending');
    const stop = startLibrarySync(a, { service, doc: document });
    await flush();
    await flush();

    now += 30000;
    await refreshShelfRecords(a, await service.getCatalog(), service);
    stop();

    expect(requests).toEqual(['household_members']);
    expect(a.getBooks()).toEqual(before);
    expect(a.getBook(rec.id).libraryTagsBase).toEqual([F]);
    expect(setStateKey).not.toHaveBeenCalled();
  });
});

describe('ensureShelfRecord (D6)', () => {
  it('reuses the oldest record for the library book and does not create another', () => {
    const lib = createFakeLibrary();
    lib.addBook({ id: L });
    const a = newAdapter();
    const newer = addShelf(a, L, { id: 'b-newer', dateAdded: '2026-02-01T00:00:00.000Z' });
    const older = addShelf(a, L, { id: 'b-older', dateAdded: '2026-01-01T00:00:00.000Z' });
    const count = a.getBooks().length;

    expect(ensureShelfRecord(a, lib.catalog().books[0])).toBe(older.id);
    expect(findShelfRecord(a, L).id).toBe(older.id);
    expect(a.getBooks()).toHaveLength(count);
    expect(newer.id).not.toBe(older.id);
  });

  it('never reuses an ebook record with the same title', () => {
    const lib = createFakeLibrary();
    lib.addBook({ id: L, title: 'The Salt Road' });
    const a = newAdapter();
    const ebook = a.addBook({ title: 'The Salt Road', author: 'Member A', type: 'ebook' });

    const id = ensureShelfRecord(a, lib.catalog().books[0]);
    expect(id).not.toBe(ebook.id);
    expect(a.getBook(ebook.id).type).toBe('ebook');
  });

  it('a new record is a shelf record with the library shared tags as tags and base', () => {
    const lib = createFakeLibrary();
    lib.addBook({
      id: L, title: 'Glass Orchard', authors: ['Member A', 'Member B'],
      coverUrl: 'https://example.test/glass.jpg', pageCount: 288, tags: [F, E]
    });
    const a = newAdapter();
    const id = ensureShelfRecord(a, lib.catalog().books[0]);
    const book = a.getBook(id);

    expect(book).toMatchObject({
      type: 'shelf',
      libraryBookId: L,
      title: 'Glass Orchard',
      author: 'Member A, Member B',
      cover: 'https://example.test/glass.jpg',
      pageCount: 288,
      links: { questIds: [], curriculumPromptIds: [] }
    });
    expect(sorted(book.tags)).toEqual(sorted([F, E]));
    expect(sorted(book.libraryTagsBase)).toEqual(sorted([F, E]));
  });
});

describe('series fill (§6.8, D5)', () => {
  it('fills an empty library series from the ToS series', async () => {
    const lib = createFakeLibrary();
    lib.addBook({ id: L });
    const a = newAdapter();
    const rec = addShelf(a, L);
    a.addSeries({ name: 'Saga', bookIds: [rec.id] });

    await refreshShelfRecords(a, lib.catalog(), lib);
    expect(lib.calls.fillSeries).toEqual([{ id: L, name: 'Saga' }]);
  });

  it('a library series already set gives no write', async () => {
    const lib = createFakeLibrary();
    lib.addBook({ id: L, seriesName: 'Other Saga' });
    const a = newAdapter();
    const rec = addShelf(a, L);
    a.addSeries({ name: 'Saga', bookIds: [rec.id] });

    await refreshShelfRecords(a, lib.catalog(), lib);
    expect(lib.calls.fillSeries).toHaveLength(0);
  });

  it('a non-shelf book in a series gives no call', async () => {
    const lib = createFakeLibrary();
    lib.addBook({ id: L });
    const a = newAdapter();
    const ebook = a.addBook({ title: 'The Salt Road', author: 'Member A', type: 'ebook' });
    a.addSeries({ name: 'Saga', bookIds: [ebook.id] });

    await refreshShelfRecords(a, lib.catalog(), lib);
    expect(lib.calls.fillSeries).toHaveLength(0);
  });
});

describe('Found on our shelf (§6.9, D7)', () => {
  function setup() {
    const lib = createFakeLibrary();
    lib.addBook({ id: L, title: 'The Salt Road', authors: ['Member A'], tags: [F] });
    const a = newAdapter();
    return { lib, a };
  }

  it('a physical book with exactly one strong match gives one offer', () => {
    const { lib, a } = setup();
    const book = a.addBook({ title: 'The Salt Road', author: 'Member A', type: 'physical' });
    const offers = findShelfOffers(a, lib.catalog());
    expect(offers).toHaveLength(1);
    expect(offers[0].bookId).toBe(book.id);
    expect(offers[0].libraryBook.id).toBe(L);
  });

  it('two strong matches give none', () => {
    const { lib, a } = setup();
    lib.addBook({ id: L2, title: 'The Salt Road', authors: ['Member A'] });
    a.addBook({ title: 'The Salt Road', author: 'Member A', type: 'physical' });
    expect(findShelfOffers(a, lib.catalog())).toEqual([]);
  });

  it('a dismissed match gives none', () => {
    const { lib, a } = setup();
    const book = a.addBook({ title: 'The Salt Road', author: 'Member A', type: 'physical' });
    dismissShelfOffer(a, book.id, L);
    expect(a.getBook(book.id).shelfMatchDismissed).toBe(L);
    expect(findShelfOffers(a, lib.catalog())).toEqual([]);
  });

  it('an ebook with the same title gives none', () => {
    const { lib, a } = setup();
    a.addBook({ title: 'The Salt Road', author: 'Member A', type: 'ebook' });
    expect(findShelfOffers(a, lib.catalog())).toEqual([]);
  });

  it('linkPhysicalToShelf converts in place, unions the tags and pushes them', async () => {
    const { lib, a } = setup();
    const book = a.addBook({
      title: 'The Salt Road', author: 'Member A', type: 'physical', status: 'completed',
      dateCompleted: '2026-03-04T00:00:00.000Z', tags: [C, READER],
      links: { questIds: ['q-1'], curriculumPromptIds: ['p-1'] }
    });

    expect(await linkPhysicalToShelf(a, book.id, lib.catalog().books[0], lib)).toBe(book.id);
    const linked = a.getBook(book.id);
    expect(linked.type).toBe('shelf');
    expect(linked.libraryBookId).toBe(L);
    expect(sorted(linked.tags)).toEqual(sorted([C, READER, F]));
    expect(sorted(linked.libraryTagsBase)).toEqual(sorted([C, F]));
    expect(linked.links).toEqual({ questIds: ['q-1'], curriculumPromptIds: ['p-1'] });
    expect(linked.dateCompleted).toBe('2026-03-04T00:00:00.000Z');
    expect(linked.status).toBe('completed');
    expect(lib.libraryTags(L)).toEqual(sorted([C, F]));
    expect(a.getBooks()).toHaveLength(1);
  });

  it('unlinkFromLibrary makes the record physical with its match dismissed', () => {
    const { lib, a } = setup();
    const rec = addShelf(a, L, { tags: [F], libraryTagsBase: [F] });
    unlinkFromLibrary(a, rec.id);
    const book = a.getBook(rec.id);
    expect(book).toMatchObject({ type: 'physical', libraryBookId: null, libraryTagsBase: null, shelfMatchDismissed: L });
    expect(book.tags).toEqual([F]);
    expect(findShelfOffers(a, lib.catalog())).toEqual([]);
  });
});

describe('rewards are history (§6.9, D3)', () => {
  it('a library refresh never changes a completed quest, but updates an active preview', async () => {
    const lib = createFakeLibrary();
    lib.addBook({ id: L, tags: [F] });
    lib.addBook({ id: L2, title: 'Glass Orchard' });
    const state = createEmptyCharacterState();
    state[STORAGE_KEYS.EQUIPPED_ITEMS] = [{ name: 'Raven Familiar', type: 'Familiar' }];
    const a = new StateAdapter(state);
    const catalog = lib.catalog();
    const done = ensureShelfRecord(a, catalog.books.find(b => b.id === L));
    const active = ensureShelfRecord(a, catalog.books.find(b => b.id === L2));

    const quest = {
      id: 'q-done', type: '♥ Organize the Stacks', prompt: 'Fantasy', book: 'The Salt Road', bookId: done,
      month: 'January', year: '2026', buffs: [],
      rewards: { xp: 15, dollars: 15, blueprints: 0, items: [], modifiedBy: [] }
    };
    a.addActiveQuests(quest);
    a.linkQuestToBook(done, 'q-done');
    a.addActiveQuests({ id: 'q-active', type: '♥ Organize the Stacks', prompt: 'Fantasy', book: 'Glass Orchard', bookId: active, buffs: [] });
    a.linkQuestToBook(active, 'q-active');

    a.moveQuest(STORAGE_KEYS.ACTIVE_ASSIGNMENTS, 0, STORAGE_KEYS.COMPLETED_QUESTS,
      q => BaseQuestHandler.completeActiveQuest(q, '', '', a));
    expect(a.getCompletedQuests().map(q => q.id)).toEqual(['q-done']);
    expect(a.getActiveAssignments().map(q => q.id)).toEqual(['q-active']);
    const recorded = clone(a.getCompletedQuests()[0].rewards);

    const raven = { type: 'item', itemData: allItems['Raven Familiar'] };
    expect(classifyBonusCardState(raven, effectiveBookTags(a.getBook(active)), null)).toBe('unmatched');

    lib.tags.get(L).add(E);
    lib.tags.get(L).delete(F);
    lib.tags.get(L2).add(E);
    await refreshShelfRecords(a, lib.catalog(), lib);
    expect(a.getBook(done).tags).toEqual([E]);

    const validated = validateCharacterState(clone(state));
    expect(clone(validated[STORAGE_KEYS.COMPLETED_QUESTS][0].rewards)).toEqual(recorded);
    expect(clone(a.getCompletedQuests()[0].rewards)).toEqual(recorded);
    expect(classifyBonusCardState(raven, effectiveBookTags(a.getBook(active)), null)).toBe('auto-applied');
  });
});

describe('a book linked to two quests', () => {
  it('keeps both links through refresh and merge; isSecondaryQuestForBook is unchanged', async () => {
    const lib = createFakeLibrary();
    lib.addBook({ id: L, tags: [F] });
    const a = newAdapter();
    a.addLearnedAbility(MULTI_QUEST_ABILITIES[0]);
    a.addActiveQuests([
      { id: 'q-1', type: '♥ Organize the Stacks', prompt: 'Fantasy', dateAdded: '2026-01-01' },
      { id: 'q-2', type: '♥ Organize the Stacks', prompt: 'Fantasy', dateAdded: '2026-01-02' }
    ]);
    const rec = ensureShelfRecord(a, lib.catalog().books[0]);
    expect(a.linkQuestToBook(rec, 'q-1')).toBe(true);
    expect(a.linkQuestToBook(rec, 'q-2')).toBe(true);
    const before = [a.isSecondaryQuestForBook(rec, 'q-1'), a.isSecondaryQuestForBook(rec, 'q-2')];

    a.updateBook(rec, { tags: [F, C] });
    await syncShelfTags(a, rec, lib);
    lib.tags.get(L).add(E);
    await refreshShelfRecords(a, lib.catalog(), lib);

    expect(a.getBook(rec).links.questIds).toEqual(['q-1', 'q-2']);
    expect(sorted(a.getBook(rec).tags)).toEqual(sorted([F, C, E]));
    expect([a.isSecondaryQuestForBook(rec, 'q-1'), a.isSecondaryQuestForBook(rec, 'q-2')]).toEqual(before);
    expect(before).toEqual([false, true]);
  });
});

describe('startLibrarySync', () => {
  it('refreshes shelf records and reports offers after the first load', async () => {
    const lib = createFakeLibrary();
    lib.addBook({ id: L, title: 'The Salt Road', authors: ['Member A'], tags: [F] });
    const a = newAdapter();
    const rec = addShelf(a, L, { title: 'Old Title' });
    a.addBook({ title: 'The Salt Road', author: 'Member A', type: 'physical' });
    const onOffers = jest.fn();

    const stop = startLibrarySync(a, { onOffers, service: lib, doc: document });
    for (let i = 0; i < 5; i += 1) await flush();
    stop();

    expect(a.getBook(rec.id).title).toBe('The Salt Road');
    expect(a.getBook(rec.id).tags).toEqual([F]);
    expect(onOffers).toHaveBeenCalledTimes(1);
    expect(onOffers.mock.calls[0][0]).toHaveLength(1);
  });

  it('skips a catalogue that went stale before its refresh ran (a tag write overlapped it)', async () => {
    const lib = createFakeLibrary();
    lib.addBook({ id: L, tags: [F] });
    const a = newAdapter();
    const rec = ensureShelfRecord(a, lib.catalog().books[0]);
    const old = await lib.getCatalog();

    a.updateBook(rec, { tags: [F, C] });
    await syncShelfTags(a, rec, lib);
    const onOffers = jest.fn();
    const stop = startLibrarySync(a, { onOffers, service: lib, doc: document });
    // Deliver the pre-write result as an overlapping load would.
    lib.emit(old);
    for (let i = 0; i < 5; i += 1) await flush();
    stop();

    expect(old.books[0].tags).toEqual([F]);
    expect(sorted(a.getBook(rec).tags)).toEqual(sorted([F, C]));
    expect(lib.libraryTags(L)).toEqual(sorted([C, F]));
  });
});
