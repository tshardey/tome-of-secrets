/**
 * @jest-environment jsdom
 *
 * The "Tidy your ToS library" review screen (Plan 4, Task 10): the panel, its rows, apply
 * and restore, the simple version, and the reminder banner (D9, D10). All titles, authors
 * and ids are invented.
 */
jest.mock('../assets/js/services/LibraryTidyService.js', () => {
  const actual = jest.requireActual('../assets/js/services/LibraryTidyService.js');
  return {
    ...actual,
    applyTidy: jest.fn((...args) => actual.applyTidy(...args)),
    restoreRemovedBooks: jest.fn((...args) => actual.restoreRemovedBooks(...args))
  };
});
jest.mock('../assets/js/ui/confirmDialog.js', () => ({
  confirmDialog: jest.fn(() => Promise.resolve(true))
}));
jest.mock('../assets/js/services/cloudSync.js', () => ({
  checkReadyForDeliberateChange: jest.fn(() => Promise.resolve({ ok: true })),
  pushDeliberateChange: jest.fn(() => Promise.resolve({ action: 'push', detail: 'library-tidy: books 52→7' }))
}));
jest.mock('../assets/js/tabs.js', () => ({
  switchToTab: jest.fn()
}));

import { applyTidy, restoreRemovedBooks } from '../assets/js/services/LibraryTidyService.js';
import { confirmDialog } from '../assets/js/ui/confirmDialog.js';
import { checkReadyForDeliberateChange, pushDeliberateChange } from '../assets/js/services/cloudSync.js';
import { switchToTab } from '../assets/js/tabs.js';
import { LibraryTidyController, TIDY_REMIND_AFTER_DAYS } from '../assets/js/controllers/LibraryTidyController.js';
import { StateAdapter } from '../assets/js/character-sheet/stateAdapter.js';
import { STORAGE_KEYS, createEmptyCharacterState } from '../assets/js/character-sheet/storageKeys.js';
import { SCHEMA_VERSION } from '../assets/js/character-sheet/dataValidator.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const NOW = Date.parse('2026-11-11T12:00:00.000Z');
const HOUSEHOLD = '00000000-0000-4000-8000-0000000000aa';
const USER = '00000000-0000-4000-8000-0000000000bb';
const pad = (n) => String(n).padStart(12, '0');
const bookId = (n) => `10000000-0000-4000-8000-${pad(n)}`;
const libId = (n) => `20000000-0000-4000-8000-${pad(n)}`;
const FIRST = ['Salt', 'Glass', 'Amber', 'Cinder', 'Hollow', 'Lantern', 'Willow', 'Ember', 'Raven', 'Marble'];
const SECOND = ['Road', 'Orchard', 'Tide', 'Crown', 'Garden', 'Harbour'];
const titleFor = (n) => `${FIRST[n % 10]} ${SECOND[Math.floor(n / 10) % 6]}`;

const flush = () => new Promise(resolve => setTimeout(resolve, 0));
async function settle() {
  for (let i = 0; i < 8; i += 1) await flush();
}

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
  return { status: 'ready', userId: USER, householdId: HOUSEHOLD, books: libraryBooks, tagsAvailable: true, fetchedAt: 1 };
}

const range = (from, to) => Array.from({ length: to - from }, (_, i) => from + i);

function makeAdapter(books, tidy = {}, extra = {}) {
  const state = createEmptyCharacterState();
  state[STORAGE_KEYS.BOOKS] = Object.fromEntries(books.map(b => [b.id, b]));
  state[STORAGE_KEYS.BOOK_TIDY] = { status: 'pending', postponedAt: null, completedAt: null, removedBooks: {}, ...tidy };
  Object.assign(state, extra);
  localStorage.setItem('tomeOfSecrets_schemaVersion', String(SCHEMA_VERSION));
  for (const [key, value] of Object.entries(state)) localStorage.setItem(key, JSON.stringify(value));
  return new StateAdapter(state);
}

function signedInClient() {
  return { auth: { getSession: jest.fn(() => Promise.resolve({ data: { session: { user: { id: USER } } }, error: null })) } };
}

function signedOutClient() {
  return { auth: { getSession: jest.fn(() => Promise.resolve({ data: { session: null }, error: null })) } };
}

function makeCatalogService(catalog) {
  return {
    getCatalog: jest.fn(() => Promise.resolve(catalog)),
    peek: jest.fn(() => catalog),
    addTags: jest.fn(() => Promise.resolve())
  };
}

function setupDom() {
  document.body.innerHTML = `
    <div id="library-tidy-banner" class="library-tidy-banner" hidden>
      <span id="library-tidy-banner-text"></span>
      <button type="button" id="library-tidy-banner-open">Open</button>
      <button type="button" id="library-tidy-banner-later">Later</button>
    </div>
    <form id="character-sheet">
      <div data-tab-panel="library">
        <div id="library-tidy-panel" class="rpg-panel" hidden>
          <div class="rpg-panel-header"><h2 class="rpg-panel-title">Tidy your ToS library</h2></div>
          <div class="rpg-panel-body">
            <div id="library-tidy-body"></div>
            <div id="library-tidy-message" role="status"></div>
          </div>
        </div>
      </div>
    </form>`;
  document.getElementById('library-tidy-panel').scrollIntoView = jest.fn();
}

let controller = null;

async function start(adapter, { client = signedOutClient(), catalogService = null, now = () => NOW } = {}) {
  controller = new LibraryTidyController(adapter, document.getElementById('character-sheet'), {
    libraryCatalog: catalogService,
    getSupabaseClient: () => Promise.resolve(client),
    now
  });
  await controller.initialize();
  await settle();
  return controller;
}

const panel = () => document.getElementById('library-tidy-panel');
const banner = () => document.getElementById('library-tidy-banner');
const row = (id) => document.querySelector(`.library-tidy-row[data-book-id="${id}"]`);
const message = () => document.getElementById('library-tidy-message').textContent.trim();
const applyBtn = () => document.querySelector('.library-tidy-apply-btn');

beforeEach(() => {
  localStorage.clear();
  setupDom();
  jest.clearAllMocks();
  confirmDialog.mockImplementation(() => Promise.resolve(true));
  checkReadyForDeliberateChange.mockImplementation(() => Promise.resolve({ ok: true }));
  pushDeliberateChange.mockImplementation(() => Promise.resolve({ action: 'push', detail: '' }));
  const actual = jest.requireActual('../assets/js/services/LibraryTidyService.js');
  applyTidy.mockImplementation((...args) => actual.applyTidy(...args));
  restoreRemovedBooks.mockImplementation((...args) => actual.restoreRemovedBooks(...args));
});

afterEach(() => {
  if (controller) controller.destroy();
  controller = null;
});

describe('panel visibility', () => {
  test('shows while the status is not done', async () => {
    await start(makeAdapter([makeBook(1)]));
    expect(panel().hidden).toBe(false);
    expect(document.getElementById('library-tidy-body').textContent).toContain('1 book to sort.');
  });

  test('shows while postponed', async () => {
    await start(makeAdapter([makeBook(1)], { status: 'postponed', postponedAt: new Date(NOW).toISOString() }));
    expect(panel().hidden).toBe(false);
  });

  test('hides when done', async () => {
    await start(makeAdapter([makeBook(1, { type: 'ebook' })], { status: 'done' }));
    expect(panel().hidden).toBe(true);
  });

  test('hides once the last Unsorted book is sorted', async () => {
    const adapter = makeAdapter([makeBook(1)]);
    await start(adapter);
    row(bookId(1)).querySelector('.library-tidy-type-btn[data-type="ebook"]').click();
    applyBtn().click();
    await settle();
    expect(adapter.getBookTidy().status).toBe('done');
    expect(panel().hidden).toBe(true);
  });
});

describe('banner', () => {
  test('shows on load when pending', async () => {
    await start(makeAdapter([makeBook(1), makeBook(2)]));
    expect(banner().hidden).toBe(false);
    expect(document.getElementById('library-tidy-banner-text').textContent).toBe('Tidy your ToS library — 2 books to sort.');
  });

  test('stays hidden when done', async () => {
    await start(makeAdapter([makeBook(1, { type: 'ebook' })], { status: 'done' }));
    expect(banner().hidden).toBe(true);
  });

  test('Later sets postponed and postponedAt, and hides the banner', async () => {
    const adapter = makeAdapter([makeBook(1)]);
    await start(adapter);
    document.getElementById('library-tidy-banner-later').click();
    await settle();
    const tidy = adapter.getBookTidy();
    expect(tidy.status).toBe('postponed');
    expect(tidy.postponedAt).toBe(new Date(NOW).toISOString());
    expect(banner().hidden).toBe(true);
    // The panel still shows: postponing never hides the review.
    expect(panel().hidden).toBe(false);
  });

  test(`stays hidden at day 6 and shows again at day ${TIDY_REMIND_AFTER_DAYS}`, async () => {
    expect(TIDY_REMIND_AFTER_DAYS).toBe(7);
    const postponedAt = new Date(NOW).toISOString();
    await start(makeAdapter([makeBook(1)], { status: 'postponed', postponedAt }), { now: () => NOW + 6 * DAY_MS });
    expect(banner().hidden).toBe(true);
    controller.destroy();

    setupDom();
    await start(makeAdapter([makeBook(1)], { status: 'postponed', postponedAt }), { now: () => NOW + 7 * DAY_MS });
    expect(banner().hidden).toBe(false);
  });

  test('Open switches to the Library tab and scrolls to the panel', async () => {
    await start(makeAdapter([makeBook(1)]));
    document.getElementById('library-tidy-banner-open').click();
    expect(switchToTab).toHaveBeenCalledWith('library');
    expect(panel().scrollIntoView).toHaveBeenCalled();
  });

  test('there is no control that sets done without sorting', async () => {
    const adapter = makeAdapter([makeBook(1), makeBook(2)]);
    await start(adapter);
    const labels = [...document.querySelectorAll('#library-tidy-banner button, .library-tidy-footer button')]
      .map(button => button.textContent.trim());
    expect(labels.filter(label => /never|skip|dismiss|don't|hide|done/i.test(label))).toEqual([]);
    for (const id of ['library-tidy-banner-open', 'library-tidy-banner-later']) {
      document.getElementById(id).click();
      await settle();
      expect(adapter.getBookTidy().status).not.toBe('done');
    }
    document.querySelector('.library-tidy-later-btn').click();
    await settle();
    expect(adapter.getBookTidy().status).toBe('postponed');
    // Apply with nothing chosen changes nothing.
    expect(applyBtn().disabled).toBe(true);
    applyBtn().click();
    await settle();
    expect(applyTidy).not.toHaveBeenCalled();
    expect(adapter.getBookTidy().status).not.toBe('done');
  });
});

describe('rows (signed in, library ready)', () => {
  function scenario52() {
    // 52 Unsorted books; the first 45 are on our shelf under the same title and author.
    const books = range(0, 52).map(n => makeBook(n));
    const catalog = makeCatalog(range(0, 45).map(n => makeLibraryBook(n)));
    return { adapter: makeAdapter(books), catalogService: makeCatalogService(catalog) };
  }

  test('a preselected row renders checked with the removal outcome line', async () => {
    const { adapter, catalogService } = scenario52();
    await start(adapter, { client: signedInClient(), catalogService });
    const r = row(bookId(3));
    const box = r.querySelector('input.library-tidy-preselect');
    expect(box.checked).toBe(true);
    expect(r.textContent).toContain(`On our shelf: ${titleFor(3)}`);
    expect(r.querySelector('.library-tidy-outcome').textContent).toBe('Will be removed from ToS (stays in the library)');
    expect(applyBtn().textContent).toBe('Apply 45 choices');
  });

  test('a protected preselected row says it will link and keep its quests, and has no Drop', async () => {
    const books = [makeBook(1, { status: 'completed', dateCompleted: '2026-02-01' }), makeBook(2)];
    const adapter = makeAdapter(books);
    const catalogService = makeCatalogService(makeCatalog([makeLibraryBook(1)]));
    await start(adapter, { client: signedInClient(), catalogService });
    expect(row(bookId(1)).querySelector('.library-tidy-outcome').textContent).toBe('Will link to the library (keeps its quests)');
    // Unchecking reveals the type buttons, still with no Drop.
    const box = row(bookId(1)).querySelector('input.library-tidy-preselect');
    box.checked = false;
    box.dispatchEvent(new Event('change', { bubbles: true }));
    expect(row(bookId(1)).querySelectorAll('.library-tidy-type-btn')).toHaveLength(4);
    expect(row(bookId(1)).querySelector('.library-tidy-drop-btn')).toBeNull();
    expect(row(bookId(1)).querySelector('[title="Can\'t drop a book with quest history"]')).not.toBeNull();
    // The unprotected, unmatched row offers Drop.
    expect(row(bookId(2)).querySelector('.library-tidy-drop-btn')).not.toBeNull();
  });

  test('weak candidates ask "Is it one of these?", and None of these reveals the type buttons', async () => {
    // No ToS author: an equal title is only a weak candidate (D8).
    const adapter = makeAdapter([makeBook(1, { author: '' })]);
    const catalogService = makeCatalogService(makeCatalog([makeLibraryBook(1)]));
    await start(adapter, { client: signedInClient(), catalogService });
    const r = row(bookId(1));
    expect(r.textContent).toContain('Is it one of these?');
    expect(r.querySelectorAll('input.library-tidy-candidate')).toHaveLength(2);
    expect(r.querySelector('.library-tidy-type-btn')).toBeNull();
    const none = r.querySelector('input.library-tidy-candidate[value=""]');
    expect(none.closest('label').textContent).toContain('None of these');
    none.checked = true;
    none.dispatchEvent(new Event('change', { bubbles: true }));
    const after = row(bookId(1));
    expect(after.querySelectorAll('.library-tidy-type-btn')).toHaveLength(4);
    expect(after.querySelector('.library-tidy-find-btn').textContent).toBe('Find it in the library…');
    expect(after.querySelector('.library-tidy-drop-btn')).not.toBeNull();
    expect(after.querySelector('input.library-tidy-candidate[value=""]').checked).toBe(true);
  });

  test('choosing a weak candidate links it', async () => {
    const adapter = makeAdapter([makeBook(1, { author: '' })]);
    const catalogService = makeCatalogService(makeCatalog([makeLibraryBook(1)]));
    await start(adapter, { client: signedInClient(), catalogService });
    const pick = row(bookId(1)).querySelector(`input.library-tidy-candidate[value="${libId(1)}"]`);
    pick.checked = true;
    pick.dispatchEvent(new Event('change', { bubbles: true }));
    expect(row(bookId(1)).querySelector('.library-tidy-outcome').textContent).toBe('Will be removed from ToS (stays in the library)');
    applyBtn().click();
    await settle();
    expect(applyTidy.mock.calls[0][0].decisions).toEqual([{ bookId: bookId(1), kind: 'link', libraryBookId: libId(1) }]);
  });

  test('Find it in the library links by hand', async () => {
    const adapter = makeAdapter([makeBook(1)]);
    const catalogService = makeCatalogService(makeCatalog([makeLibraryBook(30)]));
    await start(adapter, { client: signedInClient(), catalogService });
    row(bookId(1)).querySelector('.library-tidy-find-btn').click();
    const input = row(bookId(1)).querySelector('.library-tidy-search-input');
    input.value = titleFor(30).slice(0, 5);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    row(bookId(1)).querySelector(`.library-tidy-search-result[data-library-book-id="${libId(30)}"]`).click();
    expect(row(bookId(1)).textContent).toContain(`On our shelf: ${titleFor(30)}`);
    applyBtn().click();
    await settle();
    expect(applyTidy.mock.calls[0][0].decisions).toEqual([{ bookId: bookId(1), kind: 'link', libraryBookId: libId(30) }]);
  });

  test('Apply passes exactly the chosen decisions, and confirm states the counts', async () => {
    const { adapter, catalogService } = scenario52();
    await start(adapter, { client: signedInClient(), catalogService });
    applyBtn().click();
    await settle();
    expect(applyTidy).toHaveBeenCalledTimes(1);
    const args = applyTidy.mock.calls[0][0];
    expect(args.decisions).toEqual(range(0, 45).map(n => ({ bookId: bookId(n), kind: 'link', libraryBookId: libId(n) })));
    expect(args.stateAdapter).toBe(adapter);
    expect(args.service).toBe(catalogService);
    expect(confirmDialog).toHaveBeenCalledTimes(1);
    const dialog = confirmDialog.mock.calls[0][0];
    expect(dialog.confirmLabel).toBe('Remove 45 books');
    expect(dialog.body).toBe('Remove 45 books from Tome of Secrets. They stay in the household library. Your save goes from 52 to 7 books. You can restore them from this panel.');
    expect(dialog.cancelLabel).toBeTruthy();
    expect(checkReadyForDeliberateChange).toHaveBeenCalledTimes(1);
    expect(pushDeliberateChange).toHaveBeenCalledWith(expect.anything(), { reason: 'library-tidy', booksBefore: 52, booksAfter: 7 });
    expect(Object.keys(adapter.state[STORAGE_KEYS.BOOKS])).toHaveLength(7);
    expect(message()).toBe('Done. 45 removed, 0 linked to the library, 0 typed.');
    expect(document.querySelectorAll('.library-tidy-row')).toHaveLength(7);
    expect(document.querySelector('.library-tidy-restore-btn').textContent).toBe('Restore removed books (45)');
  });

  test('a mix of choices: typed and kept rows, with only the chosen ones applied', async () => {
    const { adapter, catalogService } = scenario52();
    await start(adapter, { client: signedInClient(), catalogService });
    // Untick all but book 0; type book 50; leave the rest.
    for (const n of range(1, 45)) {
      const box = row(bookId(n)).querySelector('input.library-tidy-preselect');
      box.checked = false;
      box.dispatchEvent(new Event('change', { bubbles: true }));
    }
    row(bookId(50)).querySelector('.library-tidy-type-btn[data-type="audiobook"]').click();
    expect(applyBtn().textContent).toBe('Apply 2 choices');
    applyBtn().click();
    await settle();
    expect(applyTidy.mock.calls[0][0].decisions).toEqual([
      { bookId: bookId(0), kind: 'link', libraryBookId: libId(0) },
      { bookId: bookId(50), kind: 'type', type: 'audiobook' }
    ]);
    expect(confirmDialog.mock.calls[0][0].confirmLabel).toBe('Remove 1 book');
    expect(message()).toBe('Done. 1 removed, 0 linked to the library, 1 typed.');
  });

  test('a cancelled confirm changes nothing and keeps the choices', async () => {
    confirmDialog.mockImplementation(() => Promise.resolve(false));
    const { adapter, catalogService } = scenario52();
    await start(adapter, { client: signedInClient(), catalogService });
    applyBtn().click();
    await settle();
    expect(Object.keys(adapter.state[STORAGE_KEYS.BOOKS])).toHaveLength(52);
    expect(pushDeliberateChange).not.toHaveBeenCalled();
    expect(applyBtn().textContent).toBe('Apply 45 choices');
  });

  test('a push that cannot go up says it will upload with the next sync', async () => {
    pushDeliberateChange.mockImplementation(() => Promise.resolve({ action: 'manual_required', detail: 'x' }));
    const { adapter, catalogService } = scenario52();
    await start(adapter, { client: signedInClient(), catalogService });
    applyBtn().click();
    await settle();
    expect(message()).toContain('Done. 45 removed, 0 linked to the library, 0 typed.');
    expect(message()).toContain('Saved on this device. It will upload with your next sync.');
  });

  test('typing only never asks to confirm or touches the cloud', async () => {
    const { adapter, catalogService } = scenario52();
    await start(adapter, { client: signedInClient(), catalogService });
    for (const n of range(0, 45)) {
      const box = row(bookId(n)).querySelector('input.library-tidy-preselect');
      box.checked = false;
      box.dispatchEvent(new Event('change', { bubbles: true }));
    }
    row(bookId(50)).querySelector('.library-tidy-type-btn[data-type="ebook"]').click();
    applyBtn().click();
    await settle();
    expect(confirmDialog).not.toHaveBeenCalled();
    expect(checkReadyForDeliberateChange).not.toHaveBeenCalled();
    expect(pushDeliberateChange).not.toHaveBeenCalled();
    expect(message()).toBe('Done. 0 removed, 0 linked to the library, 1 typed.');
  });
});

describe('simple version', () => {
  test('signed out: no candidate UI, type buttons only, and no getCatalog call', async () => {
    const adapter = makeAdapter([makeBook(1), makeBook(2, { status: 'completed', dateCompleted: '2026-02-01' })]);
    const catalogService = makeCatalogService(makeCatalog([makeLibraryBook(1)]));
    await start(adapter, { client: signedOutClient(), catalogService });
    expect(catalogService.getCatalog).not.toHaveBeenCalled();
    const body = document.getElementById('library-tidy-body');
    expect(body.textContent).toContain('Sign in and join your household to match books with the library.');
    expect(body.querySelector('.library-tidy-preselect, .library-tidy-candidate, .library-tidy-find-btn')).toBeNull();
    expect(row(bookId(1)).querySelectorAll('.library-tidy-type-btn')).toHaveLength(4);
    expect(row(bookId(1)).querySelector('.library-tidy-drop-btn')).not.toBeNull();
    expect(row(bookId(2)).querySelector('.library-tidy-drop-btn')).toBeNull();
  });

  test('without Supabase configured: the simple version, no request', async () => {
    const adapter = makeAdapter([makeBook(1)]);
    controller = new LibraryTidyController(adapter, document.getElementById('character-sheet'), {
      libraryCatalog: null,
      getSupabaseClient: () => Promise.resolve(null),
      now: () => NOW
    });
    await controller.initialize();
    await settle();
    expect(document.getElementById('library-tidy-body').textContent).toContain('Sign in and join your household');
  });

  test('signed in without a household: the simple version', async () => {
    const adapter = makeAdapter([makeBook(1)]);
    const catalogService = makeCatalogService({ status: 'no-household', userId: USER, householdId: null, books: [], tagsAvailable: false, fetchedAt: null });
    await start(adapter, { client: signedInClient(), catalogService });
    expect(document.getElementById('library-tidy-body').textContent).toContain('Sign in and join your household to match books with the library.');
    expect(document.querySelector('.library-tidy-preselect, .library-tidy-candidate')).toBeNull();
  });

  test('library unavailable: the note with Retry, which forces a reload', async () => {
    const adapter = makeAdapter([makeBook(1)]);
    const unavailable = { status: 'unavailable', userId: null, householdId: null, books: [], tagsAvailable: false, fetchedAt: null };
    const catalogService = makeCatalogService(unavailable);
    await start(adapter, { client: signedInClient(), catalogService });
    expect(document.getElementById('library-tidy-body').textContent).toContain('The household library is unavailable right now.');
    catalogService.getCatalog.mockImplementation(() => Promise.resolve(makeCatalog([makeLibraryBook(1)])));
    document.querySelector('.library-tidy-retry-btn').click();
    await settle();
    expect(catalogService.getCatalog).toHaveBeenLastCalledWith({ force: true });
    expect(row(bookId(1)).querySelector('input.library-tidy-preselect').checked).toBe(true);
  });

  test('signed out, a drop confirms in-page and removes the book without any cloud call', async () => {
    const adapter = makeAdapter([makeBook(1), makeBook(2)]);
    await start(adapter, { client: signedOutClient() });
    row(bookId(1)).querySelector('.library-tidy-drop-btn').click();
    applyBtn().click();
    await settle();
    expect(confirmDialog).toHaveBeenCalledTimes(1);
    expect(applyTidy.mock.calls[0][0].cloud).toBeNull();
    expect(checkReadyForDeliberateChange).not.toHaveBeenCalled();
    expect(pushDeliberateChange).not.toHaveBeenCalled();
    expect(adapter.state[STORAGE_KEYS.BOOKS][bookId(1)]).toBeUndefined();
    expect(message()).toBe('Done. 1 removed, 0 linked to the library, 0 typed.');
  });
});

describe('restore', () => {
  test('Restore removed books (45) calls restoreRemovedBooks and the panel returns to pending', async () => {
    const kept = range(45, 52).map(n => makeBook(n, { type: 'ebook' }));
    const removedBooks = Object.fromEntries(range(0, 45).map(n => [bookId(n), makeBook(n)]));
    const adapter = makeAdapter(kept, { status: 'done', completedAt: new Date(NOW).toISOString(), removedBooks });
    await start(adapter);
    expect(panel().hidden).toBe(false);
    const restore = document.querySelector('.library-tidy-restore-btn');
    expect(restore.textContent).toBe('Restore removed books (45)');
    restore.click();
    await settle();
    expect(restoreRemovedBooks).toHaveBeenCalledWith(adapter);
    expect(adapter.getBookTidy().status).toBe('pending');
    expect(document.querySelectorAll('.library-tidy-row')).toHaveLength(45);
    expect(document.querySelector('.library-tidy-restore-btn')).toBeNull();
    expect(panel().hidden).toBe(false);
  });

  test('books back but the bookTidy write failed: no "0 restored", the panel renders from state', async () => {
    const removedBooks = { [bookId(1)]: makeBook(1) };
    const adapter = makeAdapter([makeBook(2, { type: 'ebook' })], { status: 'done', removedBooks });
    await start(adapter);
    restoreRemovedBooks.mockImplementation(async (sa) => {
      // The books write landed; the bookTidy write did not.
      await sa.applyBookTidy({ ...sa.state[STORAGE_KEYS.BOOKS], [bookId(1)]: makeBook(1) }, sa.getBookTidy(), { booksFirst: true });
      return 0;
    });
    document.querySelector('.library-tidy-restore-btn').click();
    await settle();
    expect(message()).not.toMatch(/\b0\b/);
    expect(row(bookId(1))).not.toBeNull();
  });
});

describe('apply messages', () => {
  const PROTECTED_TITLE = titleFor(2);
  const cases = [
    ['unsynced', 'Your cloud save changed on another device. Use Sync now first, then apply.'],
    ['offline', "You're offline. Nothing was changed; removals need a connection. Your choices are still here."],
    ['newer-schema', 'Tome of Secrets was updated. Reload this tab, then apply.'],
    ['library', "Couldn't reach the household library. Nothing was changed."],
    ['protected', `${PROTECTED_TITLE} now has quest history, so it can't be dropped. Nothing was changed.`],
    ['storage', "This browser's storage is full, so nothing was changed. Free some space, or remove uploaded covers, and try again."]
  ];

  test.each(cases)('blocked %s renders its sentence and keeps the choices', async (reason, sentence) => {
    const adapter = makeAdapter([makeBook(1), makeBook(2)]);
    await start(adapter);
    row(bookId(1)).querySelector('.library-tidy-type-btn[data-type="ebook"]').click();
    row(bookId(2)).querySelector('.library-tidy-drop-btn').click();
    applyTidy.mockImplementation(async () => {
      if (reason === 'protected') {
        // Book 2 gained quest history while the panel was open.
        adapter.state[STORAGE_KEYS.BOOKS][bookId(2)].links.questIds = ['q-1'];
      }
      return { status: 'blocked', reason, pushed: false };
    });
    applyBtn().click();
    await settle();
    expect(message()).toBe(sentence);
    expect(row(bookId(1)).querySelector('.library-tidy-type-btn[data-type="ebook"]').getAttribute('aria-pressed')).toBe('true');
    if (reason === 'protected') {
      // The row is redrawn as protected: no Drop, and the refused drop is no longer a choice.
      expect(row(bookId(2)).querySelector('.library-tidy-drop-btn')).toBeNull();
      expect(applyBtn().textContent).toBe('Apply 1 choice');
    } else {
      expect(row(bookId(2)).querySelector('.library-tidy-drop-btn').getAttribute('aria-pressed')).toBe('true');
      expect(applyBtn().textContent).toBe('Apply 2 choices');
    }
  });
});
