/**
 * @jest-environment jsdom
 *
 * Read status from ToS (Plan 8, Task 4): completed shelf books go to record_tos_reads on
 * open (catch-up, which is also the one-time backfill) and whenever the books change.
 * All titles and ids are invented.
 */
import { StateAdapter, STATE_EVENTS } from '../assets/js/character-sheet/stateAdapter.js';
import { createEmptyCharacterState } from '../assets/js/character-sheet/storageKeys.js';
import { LibraryUnavailableError } from '../assets/js/services/LibraryCatalogService.js';
import {
  READ_SYNC_BATCH,
  localDayOf,
  completedShelfReads,
  startReadStatusSync
} from '../assets/js/services/ReadStatusSync.js';

const HOUSEHOLD = '00000000-0000-4000-8000-0000000000aa';
const bookId = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const flush = async () => { for (let i = 0; i < 12; i += 1) await new Promise(resolve => setTimeout(resolve, 0)); };

// Built from local clock parts so the expected day holds in any zone the suite runs in.
const LATE_EVENING = new Date(2026, 2, 2, 23, 30).toISOString();
const EARLY_MORNING = new Date(2026, 2, 3, 0, 15).toISOString();

const shelf = (n, extra = {}) => ({
  id: `rec-${n}`, status: 'completed', type: 'shelf', libraryBookId: bookId(n),
  dateCompleted: LATE_EVENING, ...extra
});

/** A catalogue service stand-in: getCatalog and recordReads, with recorded calls. */
function createFakeService(catalog = { status: 'ready', householdId: HOUSEHOLD }) {
  const fake = {
    catalog,
    calls: [],
    failWith: null,
    inFlight: 0,
    maxInFlight: 0,
    async getCatalog() { return fake.catalog; },
    async recordReads(householdId, items) {
      fake.calls.push({ householdId, items });
      fake.inFlight += 1;
      fake.maxInFlight = Math.max(fake.maxInFlight, fake.inFlight);
      await new Promise(resolve => setTimeout(resolve, 0));
      fake.inFlight -= 1;
      if (fake.failWith) throw fake.failWith;
      return { outcomes: items.map(item => ({ book_id: item.bookId, outcome: 'added' })) };
    }
  };
  return fake;
}

function adapterWith(books = []) {
  const adapter = new StateAdapter(createEmptyCharacterState());
  for (const book of books) {
    adapter.addBook({
      title: 'The Salt Road', author: 'Petra Wynnecombe', type: 'shelf', tags: [], libraryTagsBase: [], ...book
    });
  }
  return adapter;
}

const shelfBook = (n, extra = {}) => ({ id: `rec-${n}`, libraryBookId: bookId(n), ...extra });
const completedBook = (n, dateCompleted = '2026-03-02T12:00:00.000Z') =>
  shelfBook(n, { status: 'completed', dateCompleted });

let warn;
beforeEach(() => { warn = jest.spyOn(console, 'warn').mockImplementation(() => {}); });
afterEach(() => { warn.mockRestore(); });

describe('localDayOf', () => {
  it('gives the browser-zone calendar day, and null for a non-date', () => {
    expect(localDayOf(LATE_EVENING)).toBe('2026-03-02');
    expect(localDayOf(EARLY_MORNING)).toBe('2026-03-03');
    expect(localDayOf('not a date')).toBeNull();
    expect(localDayOf(null)).toBeNull();
    expect(localDayOf(undefined)).toBeNull();
  });
});

describe('completedShelfReads (D8)', () => {
  it('takes only completed books with a libraryBookId', () => {
    const reads = completedShelfReads([
      shelf(1),
      shelf(2, { status: 'reading' }),
      shelf(3, { libraryBookId: undefined }),
      shelf(4, { libraryBookId: 7 }),
      { id: 'x', status: 'completed', type: 'physical', dateCompleted: '2026-01-01T00:00:00Z' }
    ]);
    expect(reads).toEqual([
      { bookId: bookId(1), completedAt: LATE_EVENING, finishedOn: '2026-03-02' }
    ]);
  });

  it('a completed book without dateCompleted gives null for both', () => {
    expect(completedShelfReads([shelf(1, { dateCompleted: null })]))
      .toEqual([{ bookId: bookId(1), completedAt: null, finishedOn: null }]);
    expect(completedShelfReads([shelf(1, { dateCompleted: 'garbage' })]))
      .toEqual([{ bookId: bookId(1), completedAt: null, finishedOn: null }]);
  });

  it('two records of one library book keep the later completion', () => {
    const early = shelf(1, { id: 'a', dateCompleted: '2026-01-05T10:00:00.000Z' });
    const late = shelf(1, { id: 'b', dateCompleted: '2026-02-05T10:00:00.000Z' });
    const undated = shelf(1, { id: 'c', dateCompleted: null });
    const expected = [{ bookId: bookId(1), completedAt: '2026-02-05T10:00:00.000Z', finishedOn: '2026-02-05' }];
    expect(completedShelfReads([early, late])).toEqual(expected);
    expect(completedShelfReads([late, early])).toEqual(expected);
    expect(completedShelfReads([undated, late, early])).toEqual(expected);
  });

  it('is empty for a non-list', () => {
    expect(completedShelfReads(undefined)).toEqual([]);
  });
});

describe('on open', () => {
  it('sends every completed shelf book in one recordReads, once the catalogue is ready', async () => {
    const service = createFakeService();
    const adapter = adapterWith([completedBook(1), completedBook(2), shelfBook(3, { status: 'reading' })]);
    const stop = startReadStatusSync(adapter, { service, doc: document });
    await flush();
    expect(service.calls).toHaveLength(1);
    expect(service.calls[0].householdId).toBe(HOUSEHOLD);
    expect(service.calls[0].items.map(i => i.bookId).sort()).toEqual([bookId(1), bookId(2)]);
    stop();
  });

  it('sends nothing when no book is completed', async () => {
    const service = createFakeService();
    const stop = startReadStatusSync(adapterWith([shelfBook(1)]), { service, doc: document });
    await flush();
    expect(service.calls).toHaveLength(0);
    stop();
  });

  it('1,200 items go in 3 calls, one at a time', async () => {
    expect(READ_SYNC_BATCH).toBe(500);
    const service = createFakeService();
    const books = [];
    for (let n = 1; n <= 1200; n += 1) books.push(completedBook(n));
    const stop = startReadStatusSync(adapterWith(books), { service, doc: document });
    await flush();
    expect(service.calls.map(c => c.items.length)).toEqual([500, 500, 200]);
    expect(service.maxInFlight).toBe(1);
    stop();
  });

  it('always sends completedAt unchanged, so the server applies the cleared rule', async () => {
    const service = createFakeService();
    const stop = startReadStatusSync(adapterWith([completedBook(1, EARLY_MORNING)]), { service, doc: document });
    await flush();
    expect(service.calls[0].items).toEqual([
      { bookId: bookId(1), completedAt: EARLY_MORNING, finishedOn: '2026-03-03' }
    ]);
    stop();
  });
});

describe('on completion', () => {
  it('sends only the newly completed book, and nothing on a second change', async () => {
    const service = createFakeService();
    const adapter = adapterWith([completedBook(1), shelfBook(2, { status: 'reading' })]);
    const stop = startReadStatusSync(adapter, { service, doc: document });
    await flush();
    expect(service.calls).toHaveLength(1);

    adapter.markBookComplete('rec-2');
    await flush();
    expect(service.calls).toHaveLength(2);
    expect(service.calls[1].items.map(i => i.bookId)).toEqual([bookId(2)]);

    adapter.updateBook('rec-1', { title: 'Glass Orchard' });
    await flush();
    expect(service.calls).toHaveLength(2);
    stop();
  });

  it('stop() ends the listening', async () => {
    const service = createFakeService();
    const adapter = adapterWith([shelfBook(1, { status: 'reading' })]);
    const stop = startReadStatusSync(adapter, { service, doc: document });
    await flush();
    stop();
    adapter.markBookComplete('rec-1');
    await flush();
    expect(service.calls).toHaveLength(0);
  });
});

describe('retry', () => {
  it('a failed call is retried on the next BOOKS_CHANGED', async () => {
    const service = createFakeService();
    service.failWith = new LibraryUnavailableError('timeout');
    const adapter = adapterWith([completedBook(1)]);
    const stop = startReadStatusSync(adapter, { service, doc: document });
    await flush();
    expect(service.calls).toHaveLength(1);

    service.failWith = null;
    adapter.emit(STATE_EVENTS.BOOKS_CHANGED, {});
    await flush();
    expect(service.calls).toHaveLength(2);
    expect(service.calls[1].items.map(i => i.bookId)).toEqual([bookId(1)]);

    adapter.emit(STATE_EVENTS.BOOKS_CHANGED, {});
    await flush();
    expect(service.calls).toHaveLength(2);
    stop();
  });

  it('a failed call is retried when the tab becomes visible', async () => {
    const service = createFakeService();
    service.failWith = new LibraryUnavailableError('network');
    const stop = startReadStatusSync(adapterWith([completedBook(1)]), { service, doc: document });
    await flush();
    service.failWith = null;
    document.dispatchEvent(new Event('visibilitychange'));
    await flush();
    expect(service.calls).toHaveLength(2);
    stop();
  });

  it('a failed batch leaves the earlier batches sent', async () => {
    const service = createFakeService();
    const books = [];
    for (let n = 1; n <= 600; n += 1) books.push(completedBook(n));
    const adapter = adapterWith(books);
    const original = service.recordReads.bind(service);
    let attempts = 0;
    service.recordReads = async (householdId, items) => {
      attempts += 1;
      if (attempts === 2) {
        service.calls.push({ householdId, items });
        throw new LibraryUnavailableError('timeout');
      }
      return original(householdId, items);
    };
    const stop = startReadStatusSync(adapter, { service, doc: document });
    await flush();
    adapter.emit(STATE_EVENTS.BOOKS_CHANGED, {});
    await flush();
    expect(service.calls[service.calls.length - 1].items).toHaveLength(100);
    stop();
  });
});

describe('stops (Review Focus 5)', () => {
  it.each(['signed-out', 'no-household'])('a %s catalogue sends nothing and logs nothing', async (status) => {
    const service = createFakeService({ status, householdId: null });
    const adapter = adapterWith([completedBook(1), shelfBook(2, { status: 'reading' })]);
    const stop = startReadStatusSync(adapter, { service, doc: document });
    await flush();
    adapter.markBookComplete('rec-2');
    await flush();
    expect(service.calls).toHaveLength(0);
    expect(warn).not.toHaveBeenCalled();
    stop();
  });

  it('an unavailable catalogue sends nothing now, and is retried later', async () => {
    const service = createFakeService({ status: 'unavailable', householdId: null });
    const adapter = adapterWith([completedBook(1)]);
    const stop = startReadStatusSync(adapter, { service, doc: document });
    await flush();
    expect(service.calls).toHaveLength(0);
    service.catalog = { status: 'ready', householdId: HOUSEHOLD };
    adapter.emit(STATE_EVENTS.BOOKS_CHANGED, {});
    await flush();
    expect(service.calls).toHaveLength(1);
    stop();
  });

  it.each(['PGRST202', '42501', '42883'])('%s stops the sync for the page', async (code) => {
    const service = createFakeService();
    service.failWith = Object.assign(new LibraryUnavailableError('error'), { code });
    const adapter = adapterWith([completedBook(1), shelfBook(2, { status: 'reading' })]);
    const stop = startReadStatusSync(adapter, { service, doc: document });
    await flush();
    expect(service.calls).toHaveLength(1);

    service.failWith = null;
    adapter.markBookComplete('rec-2');
    document.dispatchEvent(new Event('visibilitychange'));
    await flush();
    expect(service.calls).toHaveLength(1);
    stop();
  });

  it('a denied reason stops the sync too', async () => {
    const service = createFakeService();
    service.failWith = new LibraryUnavailableError('denied');
    const adapter = adapterWith([completedBook(1)]);
    const stop = startReadStatusSync(adapter, { service, doc: document });
    await flush();
    service.failWith = null;
    adapter.emit(STATE_EVENTS.BOOKS_CHANGED, {});
    await flush();
    expect(service.calls).toHaveLength(1);
    stop();
  });

  it('never throws, and logs a code only', async () => {
    const service = createFakeService();
    service.failWith = Object.assign(new Error('The Salt Road by Petra Wynnecombe'), { code: 'PGRST202' });
    const stop = startReadStatusSync(adapterWith([completedBook(1)]), { service, doc: document });
    await flush();
    expect(warn).toHaveBeenCalledWith('[ReadStatus] sync failed:', 'PGRST202');
    for (const call of warn.mock.calls) {
      expect(JSON.stringify(call)).not.toMatch(/Salt Road|Wynnecombe/);
    }
    stop();
  });

  it('survives a catalogue that throws', async () => {
    const service = createFakeService();
    service.getCatalog = async () => { throw new TypeError('Failed to fetch'); };
    const stop = startReadStatusSync(adapterWith([completedBook(1)]), { service, doc: document });
    await flush();
    expect(service.calls).toHaveLength(0);
    expect(warn).toHaveBeenCalledWith('[ReadStatus] sync failed:', 'TypeError');
    stop();
  });
});
