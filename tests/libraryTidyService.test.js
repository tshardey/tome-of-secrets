/**
 * @jest-environment jsdom
 *
 * The library tidy (Plan 4, Task 9): protection (D9), the plan, the summary, and applyTidy's
 * one blocked rule, write order, lock, deliberate push, undo and self-heal (D10, Review
 * Focus 3). All titles, authors and ids are invented.
 */
jest.mock('../assets/js/character-sheet/persistence.js', () => {
  const actual = jest.requireActual('../assets/js/character-sheet/persistence.js');
  return { ...actual, setStateKey: jest.fn((...args) => actual.setStateKey(...args)) };
});

import { setStateKey } from '../assets/js/character-sheet/persistence.js';
import { StateAdapter } from '../assets/js/character-sheet/stateAdapter.js';
import { STORAGE_KEYS, createEmptyCharacterState } from '../assets/js/character-sheet/storageKeys.js';
import { SCHEMA_VERSION, resetSchemaWriteGateForTests } from '../assets/js/character-sheet/dataValidator.js';
import { loadState, resetStateLoadedForTests } from '../assets/js/character-sheet/state.js';
import { applySnapshot } from '../assets/js/services/cloudSync.js';
import { runExclusiveSync } from '../assets/js/services/syncLock.js';
import { bookTags } from '../assets/js/character-sheet/data.js';
import {
  isProtected,
  planTidy,
  summarizeTidy,
  applyTidy,
  restoreRemovedBooks,
  mergeRemovedBooks,
  stripInlineCovers,
  healTidyStatus,
  TIDY_BLOCK_REASONS
} from '../assets/js/services/LibraryTidyService.js';

const { setStateKey: actualSetStateKey } = jest.requireActual('../assets/js/character-sheet/persistence.js');

// Shared tags (no scope in the data); the reader tag comes from the data (R2).
const F = 'fantasy';
const C = 'cozy';
const READER = bookTags.find(t => t.scope === 'reader' && !t.derivedFromType).id;

const HOUSEHOLD = '00000000-0000-4000-8000-0000000000aa';
const pad = (n) => String(n).padStart(12, '0');
const bookId = (n) => `10000000-0000-4000-8000-${pad(n)}`;
const libId = (n) => `20000000-0000-4000-8000-${pad(n)}`;
const FIRST = ['Salt', 'Glass', 'Amber', 'Cinder', 'Hollow', 'Lantern', 'Willow', 'Ember', 'Raven', 'Marble'];
const SECOND = ['Road', 'Orchard', 'Tide', 'Crown', 'Garden', 'Harbour'];
// Invented two-word titles; two of them share at most one word, which is never similar enough to match.
const titleFor = (n) => `${FIRST[n % 10]} ${SECOND[Math.floor(n / 10) % 6]}`;

const flush = () => new Promise(resolve => setTimeout(resolve, 0));
const clone = (value) => JSON.parse(JSON.stringify(value));

function makeBook(n, extra = {}) {
  return {
    id: bookId(n),
    title: titleFor(n),
    author: 'Member A',
    cover: null,
    pageCount: null,
    status: 'reading',
    dateAdded: '2026-01-01T00:00:00.000Z',
    dateCompleted: null,
    links: { questIds: [], curriculumPromptIds: [] },
    tags: [],
    type: 'unsorted',
    libraryBookId: null,
    libraryTagsBase: null,
    shelfMatchDismissed: null,
    ...extra
  };
}

function makeLibraryBook(n, extra = {}) {
  return {
    id: libId(n),
    title: titleFor(n),
    authors: ['Member A'],
    coverUrl: null,
    pageCount: null,
    seriesName: null,
    seriesVolume: null,
    editionLabels: [],
    tags: [],
    ...extra
  };
}

function makeCatalog(libraryBooks) {
  return { status: 'ready', userId: 'u', householdId: HOUSEHOLD, books: libraryBooks, tagsAvailable: true, fetchedAt: 1 };
}

/** A StateAdapter over a v20 state that is also on disk, as after loadState. */
function makeAdapter(books, extra = {}) {
  const state = createEmptyCharacterState();
  state[STORAGE_KEYS.BOOKS] = Object.fromEntries(books.map(b => [b.id, b]));
  state[STORAGE_KEYS.BOOK_TIDY] = { status: 'pending', postponedAt: null, completedAt: null, removedBooks: {} };
  Object.assign(state, extra);
  localStorage.setItem('tomeOfSecrets_schemaVersion', String(SCHEMA_VERSION));
  for (const [key, value] of Object.entries(state)) localStorage.setItem(key, JSON.stringify(value));
  return new StateAdapter(state);
}

/** A fresh adapter read back from storage, standing for a reopened page. */
function reopenAdapter() {
  const state = createEmptyCharacterState();
  for (const key of Object.keys(state)) {
    const raw = localStorage.getItem(key);
    if (raw !== null) state[key] = JSON.parse(raw);
  }
  return new StateAdapter(state);
}

function storageSnapshot() {
  const out = {};
  for (let i = 0; i < localStorage.length; i += 1) {
    const key = localStorage.key(i);
    out[key] = localStorage.getItem(key);
  }
  return out;
}

function storedBooks() {
  return JSON.parse(localStorage.getItem(STORAGE_KEYS.BOOKS));
}

function storedTidy() {
  return JSON.parse(localStorage.getItem(STORAGE_KEYS.BOOK_TIDY));
}

function makeService() {
  return { addTags: jest.fn(async () => {}) };
}

function makeCloud({ ready = { ok: true }, push = true } = {}) {
  return {
    checkReady: jest.fn(async () => ready),
    push: jest.fn(async () => push)
  };
}

function booksWriteCalls() {
  return setStateKey.mock.calls
    .map((call, i) => ({ key: call[0], order: setStateKey.mock.invocationCallOrder[i] }))
    .filter(call => call.key === STORAGE_KEYS.BOOKS);
}

/**
 * The 52-book fixture: 45 removable links, 4 protected links (quest link, completed, series,
 * curriculum prompt) and 3 typed decisions.
 */
function bigFixture() {
  const books = [];
  for (let n = 1; n <= 45; n += 1) books.push(makeBook(n, { tags: [F] }));
  books.push(makeBook(46, { tags: [F, READER], links: { questIds: ['q-46'], curriculumPromptIds: [] } }));
  books.push(makeBook(47, { tags: [F], status: 'completed', dateCompleted: '2026-02-01T00:00:00.000Z' }));
  books.push(makeBook(48, { tags: [F] }));
  books.push(makeBook(49, { tags: [F] }));
  for (let n = 50; n <= 52; n += 1) books.push(makeBook(n));
  const series = { 's-1': { id: 's-1', name: 'The Salt Road', bookIds: [bookId(48)], releasedCount: 0, expectedCount: 0, isCompletedSeries: false } };
  const curriculum = {
    curriculums: {
      'c-1': { id: 'c-1', name: 'Course', type: 'other', categories: { 'cat-1': { id: 'cat-1', name: 'Cat', prompts: { 'p-1': { id: 'p-1', text: 'A prompt', bookId: bookId(49), completedAt: null } } } } }
    }
  };
  const adapter = makeAdapter(books, { [STORAGE_KEYS.SERIES]: series, [STORAGE_KEYS.EXTERNAL_CURRICULUM]: curriculum });
  const libraryBooks = [];
  for (let n = 1; n <= 49; n += 1) libraryBooks.push(makeLibraryBook(n, { tags: [C] }));
  const decisions = [];
  for (let n = 1; n <= 49; n += 1) decisions.push({ bookId: bookId(n), kind: 'link', libraryBookId: libId(n) });
  decisions.push({ bookId: bookId(50), kind: 'type', type: 'audiobook' });
  decisions.push({ bookId: bookId(51), kind: 'type', type: 'ebook' });
  decisions.push({ bookId: bookId(52), kind: 'type', type: 'physical' });
  return { adapter, catalog: makeCatalog(libraryBooks), decisions, series, curriculum };
}

beforeEach(() => {
  localStorage.clear();
  resetSchemaWriteGateForTests();
  setStateKey.mockReset();
  setStateKey.mockImplementation((...args) => actualSetStateKey(...args));
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('isProtected (D9)', () => {
  const bare = makeBook(1);
  const base = () => createEmptyCharacterState();

  it('is false for a bare Unsorted book', () => {
    expect(isProtected(bare, base())).toBe(false);
  });

  it.each([
    [STORAGE_KEYS.ACTIVE_ASSIGNMENTS],
    [STORAGE_KEYS.COMPLETED_QUESTS],
    [STORAGE_KEYS.DISCARDED_QUESTS]
  ])('is true for a quest in %s by bookId', (key) => {
    const state = base();
    state[key] = [{ id: 'q-1', bookId: bare.id }];
    expect(isProtected(bare, state)).toBe(true);
  });

  it('is true for links.questIds and grandfatheredQuestIds', () => {
    expect(isProtected({ ...bare, links: { questIds: ['q-1'], curriculumPromptIds: [] } }, base())).toBe(true);
    expect(isProtected({ ...bare, links: { questIds: [], curriculumPromptIds: [], grandfatheredQuestIds: ['q-1'] } }, base())).toBe(true);
  });

  it('is true for a curriculum prompt bookId and for curriculumPromptIds', () => {
    const state = base();
    state[STORAGE_KEYS.EXTERNAL_CURRICULUM] = {
      curriculums: { c: { categories: { k: { prompts: { p: { id: 'p', bookId: bare.id } } } } } }
    };
    expect(isProtected(bare, state)).toBe(true);
    expect(isProtected({ ...bare, links: { questIds: [], curriculumPromptIds: ['p'] } }, base())).toBe(true);
  });

  it('is true for dateCompleted and for series membership', () => {
    expect(isProtected({ ...bare, dateCompleted: '2026-01-02T00:00:00.000Z' }, base())).toBe(true);
    const state = base();
    state[STORAGE_KEYS.SERIES] = { s: { id: 's', name: 'S', bookIds: [bare.id] } };
    expect(isProtected(bare, state)).toBe(true);
  });
});

describe('planTidy', () => {
  it('gives rows only to Unsorted books', () => {
    const state = createEmptyCharacterState();
    state[STORAGE_KEYS.BOOKS] = {
      [bookId(1)]: makeBook(1),
      [bookId(2)]: makeBook(2, { type: 'audiobook', title: titleFor(3) })
    };
    const rows = planTidy(state, makeCatalog([makeLibraryBook(3)]));
    expect(rows.map(r => r.bookId)).toEqual([bookId(1)]);
  });

  it('preselects the single strong match; two strong matches list both and preselect none', () => {
    const state = createEmptyCharacterState();
    state[STORAGE_KEYS.BOOKS] = { [bookId(1)]: makeBook(1), [bookId(2)]: makeBook(2) };
    const catalog = makeCatalog([
      makeLibraryBook(1),
      makeLibraryBook(2, { id: libId(200), coverUrl: 'https://example.test/a.jpg' }),
      makeLibraryBook(2, { id: libId(201), authors: ['Member A', 'Member B'] })
    ]);
    const rows = planTidy(state, catalog);
    const one = rows.find(r => r.bookId === bookId(1));
    expect(one.preselected).toBe(libId(1));
    expect(one.candidates[0]).toEqual({
      libraryBookId: libId(1), title: titleFor(1), authors: ['Member A'], coverUrl: null, reason: 'same_title', score: 1
    });
    const two = rows.find(r => r.bookId === bookId(2));
    expect(two.preselected).toBeNull();
    expect(two.candidates.map(c => c.libraryBookId).sort()).toEqual([libId(200), libId(201)]);
    expect(two.candidates.find(c => c.libraryBookId === libId(200)).coverUrl).toBe('https://example.test/a.jpg');
    expect(two.candidates.find(c => c.libraryBookId === libId(201)).authors).toEqual(['Member A', 'Member B']);
  });

  it('a weak-only row has candidates and no preselection', () => {
    const state = createEmptyCharacterState();
    state[STORAGE_KEYS.BOOKS] = { [bookId(1)]: makeBook(1, { title: 'The Glass Orchard', author: '' }) };
    const rows = planTidy(state, makeCatalog([makeLibraryBook(9, { title: 'The Glass Orchard' })]));
    expect(rows[0].preselected).toBeNull();
    expect(rows[0].candidates).toHaveLength(1);
    expect(rows[0].candidates[0].libraryBookId).toBe(libId(9));
  });

  it.each([
    ['null', null],
    ['unavailable', { status: 'unavailable', books: [] }],
    ['signed-out', { status: 'signed-out', books: [] }]
  ])('a %s catalogue gives empty candidates (the simple version)', (_label, catalog) => {
    const state = createEmptyCharacterState();
    state[STORAGE_KEYS.BOOKS] = { [bookId(1)]: makeBook(1), [bookId(2)]: makeBook(2, { status: 'completed' }) };
    const rows = planTidy(state, catalog);
    expect(rows).toHaveLength(2);
    expect(rows.every(r => r.candidates.length === 0 && r.preselected === null)).toBe(true);
    expect(rows.find(r => r.bookId === bookId(2)).protected).toBe(true);
  });
});

describe('summarizeTidy', () => {
  it('counts the 52-book fixture', () => {
    const { adapter, decisions } = bigFixture();
    expect(summarizeTidy(adapter.state, decisions)).toEqual({
      remove: 45, shelf: 4, typed: 3, dropped: 0, booksBefore: 52, booksAfter: 7
    });
  });
});

describe('applyTidy, signed in and in sync', () => {
  it('confirms, pushes the unions first, writes bookTidy then books, and pushes once', async () => {
    const { adapter, catalog, decisions, series, curriculum } = bigFixture();
    const service = makeService();
    const cloud = makeCloud();
    const confirm = jest.fn(async () => true);
    const setBookTidy = jest.spyOn(adapter, 'setBookTidy');
    const before = clone(adapter.state[STORAGE_KEYS.BOOKS]);

    const result = await applyTidy({ stateAdapter: adapter, decisions, catalog, service, cloud, confirm });

    expect(result).toEqual({ status: 'applied', pushed: true });
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(confirm).toHaveBeenCalledWith({ remove: 45, shelf: 4, typed: 3, dropped: 0, booksBefore: 52, booksAfter: 7 });

    // Every tag union reached the library before any state write.
    expect(service.addTags).toHaveBeenCalledTimes(49);
    expect(service.addTags).toHaveBeenCalledWith(libId(1), HOUSEHOLD, [F]);
    const lastAddTags = Math.max(...service.addTags.mock.invocationCallOrder);
    const firstTidyWrite = setBookTidy.mock.invocationCallOrder[0];
    const booksWrites = booksWriteCalls();
    expect(booksWrites).toHaveLength(1);
    expect(lastAddTags).toBeLessThan(firstTidyWrite);
    // The write order: bookTidy before books.
    expect(firstTidyWrite).toBeLessThan(booksWrites[0].order);

    const books = storedBooks();
    const tidy = storedTidy();
    expect(Object.keys(books)).toHaveLength(7);
    expect(Object.keys(tidy.removedBooks)).toHaveLength(45);
    expect(tidy.removedBooks[bookId(1)]).toEqual(before[bookId(1)]);
    expect(tidy.status).toBe('done');
    expect(typeof tidy.completedAt).toBe('string');

    for (const n of [46, 47, 48, 49]) {
      const record = books[bookId(n)];
      expect(record.type).toBe('shelf');
      expect(record.libraryBookId).toBe(libId(n));
      expect(record.links).toEqual(before[bookId(n)].links);
      expect(record.dateCompleted).toBe(before[bookId(n)].dateCompleted);
      expect([...record.libraryTagsBase].sort()).toEqual([C, F].sort());
    }
    expect(books[bookId(46)].tags).toEqual([F, READER, C]);
    expect(books[bookId(50)].type).toBe('audiobook');
    expect(books[bookId(51)].type).toBe('ebook');
    expect(books[bookId(52)].type).toBe('physical');
    expect(JSON.parse(localStorage.getItem(STORAGE_KEYS.SERIES))).toEqual(series);
    expect(JSON.parse(localStorage.getItem(STORAGE_KEYS.EXTERNAL_CURRICULUM))).toEqual(curriculum);
    expect(adapter.state[STORAGE_KEYS.BOOKS]).toEqual(books);

    expect(cloud.push).toHaveBeenCalledTimes(1);
    expect(cloud.push).toHaveBeenCalledWith({ reason: 'library-tidy', booksBefore: 52, booksAfter: 7 });
  });

  it('a scheduled auto-sync runs only after apply resolves', async () => {
    const { adapter, catalog, decisions } = bigFixture();
    const events = [];
    let answer;
    const confirm = jest.fn(() => new Promise(resolve => { answer = resolve; }));
    const cloud = makeCloud();
    cloud.push.mockImplementation(async () => { events.push('tidy-push'); return true; });

    const apply = applyTidy({ stateAdapter: adapter, decisions, catalog, service: makeService(), cloud, confirm });
    await flush();
    expect(confirm).toHaveBeenCalled();

    // runAutoSyncOnce goes through runExclusiveSync(() => syncAuto(...)).
    const auto = runExclusiveSync(async () => { events.push('auto-sync'); });
    await flush();
    expect(events).toEqual([]);

    answer(true);
    await apply;
    await auto;
    expect(events).toEqual(['tidy-push', 'auto-sync']);
  });
});

describe('applyTidy blocked and cancelled outcomes write nothing', () => {
  it('a precheck of unsynced blocks with no write and no addTags', async () => {
    const { adapter, catalog, decisions } = bigFixture();
    const service = makeService();
    const cloud = makeCloud({ ready: { ok: false, reason: 'unsynced' } });
    const confirm = jest.fn(async () => true);
    const before = storageSnapshot();

    const result = await applyTidy({ stateAdapter: adapter, decisions, catalog, service, cloud, confirm });

    expect(result).toEqual({ status: 'blocked', reason: 'unsynced', pushed: false });
    expect(storageSnapshot()).toEqual(before);
    expect(setStateKey).not.toHaveBeenCalled();
    expect(service.addTags).not.toHaveBeenCalled();
    expect(confirm).not.toHaveBeenCalled();
    expect(cloud.push).not.toHaveBeenCalled();
  });

  it('one blocked rule (I6): offline with types and removals writes nothing, the types included', async () => {
    const { adapter, catalog, decisions } = bigFixture();
    const cloud = makeCloud({ ready: { ok: false, reason: 'offline' } });
    const before = storageSnapshot();
    const ramBefore = clone(adapter.state[STORAGE_KEYS.BOOKS]);

    const result = await applyTidy({ stateAdapter: adapter, decisions, catalog, service: makeService(), cloud, confirm: async () => true });

    expect(result).toEqual({ status: 'blocked', reason: 'offline', pushed: false });
    expect(storageSnapshot()).toEqual(before);
    expect(adapter.state[STORAGE_KEYS.BOOKS]).toEqual(ramBefore);
    expect(adapter.state[STORAGE_KEYS.BOOKS][bookId(50)].type).toBe('unsorted');
  });

  it('type-only decisions never call checkReady and apply offline', async () => {
    const adapter = makeAdapter([makeBook(1), makeBook(2)]);
    const cloud = makeCloud({ ready: { ok: false, reason: 'offline' } });
    const confirm = jest.fn(async () => true);

    const result = await applyTidy({
      stateAdapter: adapter,
      decisions: [{ bookId: bookId(1), kind: 'type', type: 'library-loan' }],
      catalog: null,
      service: null,
      cloud,
      confirm
    });

    expect(result).toEqual({ status: 'applied', pushed: false });
    expect(cloud.checkReady).not.toHaveBeenCalled();
    expect(cloud.push).not.toHaveBeenCalled();
    expect(confirm).not.toHaveBeenCalled();
    expect(storedBooks()[bookId(1)].type).toBe('library-loan');
    expect(storedTidy().status).toBe('pending');
  });

  it('a newer-schema precheck blocks', async () => {
    const { adapter, catalog, decisions } = bigFixture();
    const before = storageSnapshot();
    const result = await applyTidy({
      stateAdapter: adapter, decisions, catalog, service: makeService(),
      cloud: makeCloud({ ready: { ok: false, reason: 'newer-schema' } }), confirm: async () => true
    });
    expect(result).toEqual({ status: 'blocked', reason: 'newer-schema', pushed: false });
    expect(storageSnapshot()).toEqual(before);
  });

  it('every blocked reason comes from the closed list', () => {
    expect(TIDY_BLOCK_REASONS).toEqual(['unsynced', 'offline', 'newer-schema', 'library', 'protected', 'storage']);
  });

  it('library down: addTags rejecting blocks with the save unchanged', async () => {
    const { adapter, catalog, decisions } = bigFixture();
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const service = { addTags: jest.fn(async () => { throw Object.assign(new Error('x'), { reason: 'timeout' }); }) };
    const cloud = makeCloud();
    const before = storageSnapshot();
    const ramBefore = clone(adapter.state);

    const result = await applyTidy({ stateAdapter: adapter, decisions, catalog, service, cloud, confirm: async () => true });

    expect(result).toEqual({ status: 'blocked', reason: 'library', pushed: false });
    expect(storageSnapshot()).toEqual(before);
    expect(adapter.state).toEqual(ramBefore);
    expect(cloud.push).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith('[LibraryTidy] tag push failed:', 'timeout');
  });

  it('cancelled: confirm resolving false writes and pushes nothing', async () => {
    const { adapter, catalog, decisions } = bigFixture();
    const service = makeService();
    const cloud = makeCloud();
    const before = storageSnapshot();

    const result = await applyTidy({ stateAdapter: adapter, decisions, catalog, service, cloud, confirm: async () => false });

    expect(result).toEqual({ status: 'cancelled', pushed: false });
    expect(storageSnapshot()).toEqual(before);
    expect(service.addTags).not.toHaveBeenCalled();
    expect(cloud.push).not.toHaveBeenCalled();
  });

  it('a drop on a protected book is blocked', async () => {
    const adapter = makeAdapter([makeBook(1, { dateCompleted: '2026-01-02T00:00:00.000Z' })]);
    const before = storageSnapshot();
    const result = await applyTidy({
      stateAdapter: adapter, decisions: [{ bookId: bookId(1), kind: 'drop' }],
      catalog: null, service: null, cloud: null, confirm: async () => true
    });
    expect(result).toEqual({ status: 'blocked', reason: 'protected', pushed: false });
    expect(storageSnapshot()).toEqual(before);
  });
});

describe('protection is recomputed inside the lock (I6)', () => {
  it('a book linked to a quest after planTidy becomes shelf, counted under shelf', async () => {
    const adapter = makeAdapter([makeBook(1, { tags: [F] }), makeBook(2, { tags: [F] })]);
    const catalog = makeCatalog([makeLibraryBook(1), makeLibraryBook(2)]);
    const rows = planTidy(adapter.state, catalog);
    expect(rows.find(r => r.bookId === bookId(1)).protected).toBe(false);

    adapter.state[STORAGE_KEYS.ACTIVE_ASSIGNMENTS] = [{ id: 'q-1', bookId: bookId(1) }];
    const confirm = jest.fn(async () => true);
    const result = await applyTidy({
      stateAdapter: adapter,
      decisions: [
        { bookId: bookId(1), kind: 'link', libraryBookId: libId(1) },
        { bookId: bookId(2), kind: 'link', libraryBookId: libId(2) }
      ],
      catalog, service: makeService(), cloud: null, confirm
    });

    expect(result.status).toBe('applied');
    expect(confirm).toHaveBeenCalledWith(expect.objectContaining({ remove: 1, shelf: 1, booksBefore: 2, booksAfter: 1 }));
    expect(storedBooks()[bookId(1)].type).toBe('shelf');
    expect(storedBooks()[bookId(2)]).toBeUndefined();
    expect(Object.keys(storedTidy().removedBooks)).toEqual([bookId(2)]);
  });

  it('a drop for that book is blocked as protected and writes nothing', async () => {
    const adapter = makeAdapter([makeBook(1)]);
    planTidy(adapter.state, null);
    adapter.state[STORAGE_KEYS.ACTIVE_ASSIGNMENTS] = [{ id: 'q-1', bookId: bookId(1) }];
    const before = storageSnapshot();
    const result = await applyTidy({
      stateAdapter: adapter, decisions: [{ bookId: bookId(1), kind: 'drop' }],
      catalog: null, service: null, cloud: makeCloud(), confirm: async () => true
    });
    expect(result).toEqual({ status: 'blocked', reason: 'protected', pushed: false });
    expect(storageSnapshot()).toEqual(before);
  });
});

describe('storage', () => {
  it('a full quota on bookTidy (C2) blocks before books are touched, and nothing is pushed', async () => {
    const { adapter, catalog, decisions } = bigFixture();
    const error = jest.spyOn(console, 'error').mockImplementation(() => {});
    const realSetItem = Storage.prototype.setItem;
    jest.spyOn(Storage.prototype, 'setItem').mockImplementation(function (key, value) {
      if (key === STORAGE_KEYS.BOOK_TIDY) {
        const quota = new Error('quota');
        quota.name = 'QuotaExceededError';
        throw quota;
      }
      return realSetItem.call(this, key, value);
    });
    const cloud = makeCloud();
    const ramBefore = clone(adapter.state[STORAGE_KEYS.BOOKS]);
    const before = storageSnapshot();

    const result = await applyTidy({ stateAdapter: adapter, decisions, catalog, service: makeService(), cloud, confirm: async () => true });

    expect(result).toEqual({ status: 'blocked', reason: 'storage', pushed: false });
    expect(booksWriteCalls()).toHaveLength(0);
    expect(adapter.state[STORAGE_KEYS.BOOKS]).toEqual(ramBefore);
    expect(storageSnapshot()).toEqual(before);
    expect(cloud.push).not.toHaveBeenCalled();
    expect(error).toHaveBeenCalled();
  });

  it('strips a data: cover from a removed record (C2) and keeps an https cover', async () => {
    const adapter = makeAdapter([
      makeBook(1, { cover: 'data:image/jpeg;base64,AAAA' }),
      makeBook(2, { cover: 'https://example.test/cover.jpg' })
    ]);
    await applyTidy({
      stateAdapter: adapter,
      decisions: [{ bookId: bookId(1), kind: 'drop' }, { bookId: bookId(2), kind: 'drop' }],
      catalog: null, service: null, cloud: null, confirm: async () => true
    });
    const removed = storedTidy().removedBooks;
    expect(removed[bookId(1)].cover).toBeNull();
    expect(removed[bookId(2)].cover).toBe('https://example.test/cover.jpg');
    expect(stripInlineCovers({ id: 'x', cover: 'data:x' })).toEqual({ id: 'x', cover: null });
  });

  it('books are written before the push (I1)', async () => {
    const { adapter, catalog, decisions } = bigFixture();
    const events = [];
    setStateKey.mockImplementation(async (key, ...rest) => {
      if (key === STORAGE_KEYS.BOOKS) {
        await new Promise(resolve => setTimeout(resolve, 20));
        const ok = await actualSetStateKey(key, ...rest);
        events.push('books-written');
        return ok;
      }
      return actualSetStateKey(key, ...rest);
    });
    const cloud = makeCloud();
    cloud.push.mockImplementation(async () => { events.push('push'); return true; });

    const result = await applyTidy({ stateAdapter: adapter, decisions, catalog, service: makeService(), cloud, confirm: async () => true });

    expect(result.status).toBe('applied');
    expect(events).toEqual(['books-written', 'push']);
  });

  it('a rejected books write blocks with storage and no push', async () => {
    const { adapter, catalog, decisions } = bigFixture();
    setStateKey.mockImplementation(async (key, ...rest) => {
      if (key === STORAGE_KEYS.BOOKS) throw new Error('disk');
      return actualSetStateKey(key, ...rest);
    });
    const cloud = makeCloud();
    const result = await applyTidy({ stateAdapter: adapter, decisions, catalog, service: makeService(), cloud, confirm: async () => true });
    expect(result).toEqual({ status: 'blocked', reason: 'storage', pushed: false });
    expect(cloud.push).not.toHaveBeenCalled();
    expect(Object.keys(storedBooks())).toHaveLength(52);
  });

  it('RAM holds the tidied books while the books write runs, so an edit meanwhile keeps the tidy (R31)', async () => {
    const adapter = makeAdapter([makeBook(1), makeBook(2)]);
    let release;
    const gate = new Promise(resolve => { release = resolve; });
    let firstBooksWrite = true;
    setStateKey.mockImplementation(async (key, ...rest) => {
      if (key === STORAGE_KEYS.BOOKS && firstBooksWrite) {
        firstBooksWrite = false;
        await gate;
      }
      return actualSetStateKey(key, ...rest);
    });
    const changed = jest.fn();
    adapter.on('booksChanged', changed);
    const applying = applyTidy({
      stateAdapter: adapter,
      decisions: [{ bookId: bookId(1), kind: 'drop' }],
      catalog: null, service: null, cloud: null, confirm: async () => true
    });
    let ramDuringWrite;
    try {
      // Wait until the books write is in flight.
      for (let i = 0; i < 20 && firstBooksWrite; i += 1) await flush();
      ramDuringWrite = adapter.state[STORAGE_KEYS.BOOKS];
      adapter.updateBook(bookId(2), { pageCount: 321 });
    } finally {
      // Never leave the sync lock held for the tests after this one.
      release();
    }
    const result = await applying;
    expect(firstBooksWrite).toBe(false);
    expect(ramDuringWrite[bookId(1)]).toBeUndefined();
    expect(result.status).toBe('applied');
    const booksWrites = setStateKey.mock.calls.filter(call => call[0] === STORAGE_KEYS.BOOKS);
    const lastWritten = booksWrites[booksWrites.length - 1][1];
    expect(lastWritten[bookId(1)]).toBeUndefined();
    expect(lastWritten[bookId(2)].pageCount).toBe(321);
    expect(adapter.state[STORAGE_KEYS.BOOKS][bookId(1)]).toBeUndefined();
    expect(adapter.state[STORAGE_KEYS.BOOKS][bookId(2)].pageCount).toBe(321);
  });

  it('a failed books write puts RAM back and emits no BOOKS_CHANGED (R31)', async () => {
    const adapter = makeAdapter([makeBook(1), makeBook(2)]);
    const ramBefore = adapter.state[STORAGE_KEYS.BOOKS];
    setStateKey.mockImplementation(async (key, ...rest) => {
      if (key === STORAGE_KEYS.BOOKS) {
        expect(adapter.state[STORAGE_KEYS.BOOKS][bookId(1)]).toBeUndefined();
        return false;
      }
      return actualSetStateKey(key, ...rest);
    });
    const changed = jest.fn();
    adapter.on('booksChanged', changed);
    const result = await applyTidy({
      stateAdapter: adapter,
      decisions: [{ bookId: bookId(1), kind: 'drop' }],
      catalog: null, service: null, cloud: null, confirm: async () => true
    });
    expect(result).toEqual({ status: 'blocked', reason: 'storage', pushed: false });
    expect(adapter.state[STORAGE_KEYS.BOOKS]).toBe(ramBefore);
    expect(changed).not.toHaveBeenCalled();
  });
});

describe('removedBooks merge by id (I4) and restore', () => {
  const drop = (n) => ({ bookId: bookId(n), kind: 'drop' });
  const run = (adapter, decisions) => applyTidy({ stateAdapter: adapter, decisions, catalog: null, service: null, cloud: null, confirm: async () => true });

  it('apply X and Y, restore Y, apply Z: removedBooks holds X and Z', async () => {
    const adapter = makeAdapter([makeBook(1), makeBook(2), makeBook(3)]);
    await run(adapter, [drop(1), drop(2)]);
    expect(await restoreRemovedBooks(adapter, [bookId(2)])).toBe(1);
    expect(storedBooks()[bookId(2)]).toBeDefined();
    expect(Object.keys(storedTidy().removedBooks)).toEqual([bookId(1)]);
    await run(adapter, [drop(3)]);
    expect(Object.keys(storedTidy().removedBooks).sort()).toEqual([bookId(1), bookId(3)]);
    expect(Object.keys(storedBooks())).toEqual([bookId(2)]);
  });

  it('mergeRemovedBooks keeps one record per id, the newer one', () => {
    const x = makeBook(1, { title: 'Old' });
    const xNewer = makeBook(1, { title: 'New' });
    const y = makeBook(2);
    const existing = { [x.id]: x, [y.id]: y };
    const merged = mergeRemovedBooks(existing, [xNewer]);
    expect(Object.keys(merged).sort()).toEqual([x.id, y.id]);
    expect(merged[x.id].title).toBe('New');
    expect(existing[x.id].title).toBe('Old');
  });

  it('restore returns the status to pending', async () => {
    const adapter = makeAdapter([makeBook(1)]);
    await run(adapter, [drop(1)]);
    expect(storedTidy().status).toBe('done');
    expect(await restoreRemovedBooks(adapter)).toBe(1);
    expect(storedTidy().status).toBe('pending');
    expect(adapter.getBook(bookId(1)).type).toBe('unsorted');
  });
});

describe('the status heals (I3)', () => {
  it('done with one Unsorted book becomes pending, keeping postponedAt', () => {
    const state = createEmptyCharacterState();
    state[STORAGE_KEYS.BOOKS] = { [bookId(1)]: makeBook(1) };
    state[STORAGE_KEYS.BOOK_TIDY] = { status: 'done', postponedAt: '2026-01-01T00:00:00.000Z', completedAt: null, removedBooks: {} };
    const healed = healTidyStatus(state);
    expect(healed.bookTidy.status).toBe('pending');
    expect(healed.bookTidy.postponedAt).toBe('2026-01-01T00:00:00.000Z');
    expect(state.bookTidy.status).toBe('done');
  });

  it('with no Unsorted book it returns the same object', () => {
    const state = createEmptyCharacterState();
    state[STORAGE_KEYS.BOOKS] = { [bookId(1)]: makeBook(1, { type: 'ebook' }) };
    expect(healTidyStatus(state)).toBe(state);
  });

  it('loadState heals a stored done status and writes it back', async () => {
    localStorage.setItem('tomeOfSecrets_schemaVersion', String(SCHEMA_VERSION));
    localStorage.setItem(STORAGE_KEYS.BOOKS, JSON.stringify({ [bookId(1)]: makeBook(1) }));
    localStorage.setItem(STORAGE_KEYS.BOOK_TIDY, JSON.stringify({ status: 'done', postponedAt: null, completedAt: null, removedBooks: {} }));
    jest.spyOn(console, 'log').mockImplementation(() => {});
    resetStateLoadedForTests();
    await loadState();
    expect(storedTidy().status).toBe('pending');
  });

  it('loadState does not write bookTidy when nothing is Unsorted', async () => {
    localStorage.setItem('tomeOfSecrets_schemaVersion', String(SCHEMA_VERSION));
    localStorage.setItem(STORAGE_KEYS.BOOKS, JSON.stringify({ [bookId(1)]: makeBook(1, { type: 'ebook' }) }));
    const tidyJson = JSON.stringify({ status: 'done', postponedAt: null, completedAt: null, removedBooks: {} });
    localStorage.setItem(STORAGE_KEYS.BOOK_TIDY, tidyJson);
    jest.spyOn(console, 'log').mockImplementation(() => {});
    const setItem = jest.spyOn(Storage.prototype, 'setItem');
    resetStateLoadedForTests();
    await loadState();
    expect(setItem.mock.calls.filter(call => call[0] === STORAGE_KEYS.BOOK_TIDY)).toHaveLength(0);
    expect(localStorage.getItem(STORAGE_KEYS.BOOK_TIDY)).toBe(tidyJson);
  });
});

describe('signed out and duplicates', () => {
  it('signed out: link-free decisions apply locally with no network', async () => {
    const adapter = makeAdapter([makeBook(1), makeBook(2)]);
    const fetchSpy = jest.fn();
    global.fetch = fetchSpy;
    const service = makeService();
    const result = await applyTidy({
      stateAdapter: adapter,
      decisions: [{ bookId: bookId(1), kind: 'type', type: 'ebook' }, { bookId: bookId(2), kind: 'drop' }],
      catalog: null, service, cloud: null, confirm: async () => true
    });
    expect(result).toEqual({ status: 'applied', pushed: false });
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(service.addTags).not.toHaveBeenCalled();
    expect(storedBooks()).toEqual({ [bookId(1)]: expect.objectContaining({ type: 'ebook' }) });
    expect(storedTidy().status).toBe('done');
    delete global.fetch;
  });

  it('a link with no ready catalogue is blocked as library', async () => {
    const adapter = makeAdapter([makeBook(1)]);
    const result = await applyTidy({
      stateAdapter: adapter, decisions: [{ bookId: bookId(1), kind: 'link', libraryBookId: libId(1) }],
      catalog: null, service: makeService(), cloud: null, confirm: async () => true
    });
    expect(result).toEqual({ status: 'blocked', reason: 'library', pushed: false });
  });

  it('two ToS books strong-matching L: the unprotected one is removed, the protected one is shelf', async () => {
    const twin = { title: 'The Salt Road', author: 'Member A' };
    const adapter = makeAdapter([makeBook(1, twin), makeBook(2, { ...twin, links: { questIds: ['q-2'], curriculumPromptIds: [] } })]);
    const catalog = makeCatalog([makeLibraryBook(7, { title: 'The Salt Road' })]);
    const rows = planTidy(adapter.state, catalog);
    expect(rows.map(r => r.preselected)).toEqual([libId(7), libId(7)]);
    const result = await applyTidy({
      stateAdapter: adapter,
      decisions: rows.map(r => ({ bookId: r.bookId, kind: 'link', libraryBookId: r.preselected })),
      catalog, service: makeService(), cloud: null, confirm: async () => true
    });
    expect(result.status).toBe('applied');
    expect(Object.keys(storedTidy().removedBooks)).toEqual([bookId(1)]);
    expect(storedBooks()[bookId(2)]).toMatchObject({ type: 'shelf', libraryBookId: libId(7) });
  });

  it('two protected ones both become shelf records of L', async () => {
    const twin = { title: 'The Salt Road', author: 'Member A', status: 'completed' };
    const adapter = makeAdapter([makeBook(1, twin), makeBook(2, twin)]);
    const catalog = makeCatalog([makeLibraryBook(7, { title: 'The Salt Road' })]);
    const confirm = jest.fn(async () => true);
    const result = await applyTidy({
      stateAdapter: adapter,
      decisions: [1, 2].map(n => ({ bookId: bookId(n), kind: 'link', libraryBookId: libId(7) })),
      catalog, service: makeService(), cloud: makeCloud(), confirm
    });
    expect(result).toEqual({ status: 'applied', pushed: false });
    expect(confirm).not.toHaveBeenCalled();
    const books = storedBooks();
    expect(books[bookId(1)]).toMatchObject({ type: 'shelf', libraryBookId: libId(7) });
    expect(books[bookId(2)]).toMatchObject({ type: 'shelf', libraryBookId: libId(7) });
  });
});

describe('an interrupted apply (Review Focus 3) and self-heal (D10)', () => {
  it('a kill between the writes: re-apply and restore leave exactly one record per id', async () => {
    const adapter = makeAdapter([makeBook(1), makeBook(2)]);
    const drop = [{ bookId: bookId(1), kind: 'drop' }];
    // The bookTidy write lands, the books write never does.
    setStateKey.mockImplementation(async (key, ...rest) => {
      if (key === STORAGE_KEYS.BOOKS) throw new Error('tab closed');
      return actualSetStateKey(key, ...rest);
    });
    const first = await applyTidy({ stateAdapter: adapter, decisions: drop, catalog: null, service: null, cloud: null, confirm: async () => true });
    expect(first.reason).toBe('storage');
    setStateKey.mockImplementation((...args) => actualSetStateKey(...args));

    // Reopen: the book is still in books and still Unsorted, and removedBooks holds it.
    resetSchemaWriteGateForTests();
    const reopened = reopenAdapter();
    expect(Object.keys(reopened.getBookTidy().removedBooks)).toEqual([bookId(1)]);
    expect(planTidy(reopened.state, null).map(r => r.bookId)).toContain(bookId(1));

    const again = await applyTidy({ stateAdapter: reopened, decisions: drop, catalog: null, service: null, cloud: null, confirm: async () => true });
    expect(again.status).toBe('applied');
    expect(Object.keys(storedTidy().removedBooks)).toEqual([bookId(1)]);
    expect(storedBooks()[bookId(1)]).toBeUndefined();

    expect(await restoreRemovedBooks(reopened)).toBe(1);
    expect(await restoreRemovedBooks(reopened)).toBe(0);
    expect(Object.keys(storedBooks()).filter(id => id === bookId(1))).toHaveLength(1);
    expect(storedTidy().removedBooks).toEqual({});
  });

  it('restore skips an id that is already in books', async () => {
    const x = makeBook(1);
    const adapter = makeAdapter([x]);
    adapter.state[STORAGE_KEYS.BOOK_TIDY] = { status: 'pending', postponedAt: null, completedAt: null, removedBooks: { [x.id]: x } };
    expect(await restoreRemovedBooks(adapter)).toBe(0);
    expect(Object.keys(adapter.state[STORAGE_KEYS.BOOKS])).toEqual([x.id]);
    expect(setStateKey).not.toHaveBeenCalled();
  });

  it('an older snapshot after the tidy brings the books back Unsorted and the review pending', async () => {
    const books = [];
    for (let n = 1; n <= 45; n += 1) books.push(makeBook(n));
    books.push(makeBook(46, { type: 'ebook' }));
    const adapter = makeAdapter(books);
    const decisions = [];
    for (let n = 1; n <= 45; n += 1) decisions.push({ bookId: bookId(n), kind: 'drop' });
    const result = await applyTidy({ stateAdapter: adapter, decisions, catalog: null, service: null, cloud: null, confirm: async () => true });
    expect(result.status).toBe('applied');
    expect(storedTidy().status).toBe('done');

    // A v19 snapshot from before the tidy: no types, no bookTidy.
    const v19Books = {};
    for (let n = 1; n <= 46; n += 1) {
      const { type: _t, libraryBookId: _l, libraryTagsBase: _b, shelfMatchDismissed: _s, ...rest } = makeBook(n);
      v19Books[bookId(n)] = rest;
    }
    jest.spyOn(console, 'log').mockImplementation(() => {});
    await applySnapshot({
      version: 19,
      updatedAt: '2026-01-01T00:00:00.000Z',
      data: { formData: {}, characterState: { [STORAGE_KEYS.BOOKS]: v19Books }, monthlyCompletedBooks: [] }
    });

    const after = storedBooks();
    expect(Object.values(after).filter(b => b.type === 'unsorted').length).toBeGreaterThanOrEqual(45);
    expect(storedTidy().status).toBe('pending');
    const state = createEmptyCharacterState();
    state[STORAGE_KEYS.BOOKS] = after;
    expect(planTidy(state, null).length).toBeGreaterThanOrEqual(45);
  });
});
