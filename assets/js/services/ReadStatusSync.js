/**
 * Read status from ToS (Plan 8, D8): completed shelf books are sent to the library's
 * record_tos_reads RPC, which applies the "who wins" rules server-side.
 *
 * - On open, every completed shelf book is sent. That catch-up is also the one-time backfill.
 * - After that, only books not yet sent this page (signature bookId|completedAt) go, when the
 *   books change (the moment of completion) or the tab returns to view.
 * - Calls run one at a time, in batches of READ_SYNC_BATCH.
 * - It stops for the page on a missing function (PGRST202/42883), a denial (42501), a signed-out
 *   player or one without a household. Any other failure leaves the items unsent for the next
 *   trigger. Nothing throws; logs carry an error code or name only.
 * - Un-completing a book sends nothing, so nothing is ever removed.
 */
import { STATE_EVENTS } from '../character-sheet/stateAdapter.js';
import { libraryCatalog, logCode } from './LibraryCatalogService.js';

export const READ_SYNC_BATCH = 500;

const STOP_CODES = new Set(['PGRST202', '42883', '42501']);

const pad = (n) => String(n).padStart(2, '0');

/** The browser-zone calendar day (YYYY-MM-DD) of an ISO timestamp, or null for a non-date. */
export function localDayOf(iso) {
  if (typeof iso !== 'string' || !iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/**
 * The reads to record: one per library book among the completed shelf books, the latest
 * completion winning (a dated completion beats an undated one).
 * @returns {{bookId: string, completedAt: string|null, finishedOn: string|null}[]}
 */
export function completedShelfReads(books) {
  const byBook = new Map();
  for (const book of Array.isArray(books) ? books : []) {
    if (!book || book.status !== 'completed' || typeof book.libraryBookId !== 'string' || !book.libraryBookId) continue;
    const day = localDayOf(book.dateCompleted);
    const item = {
      bookId: book.libraryBookId,
      completedAt: day === null ? null : book.dateCompleted,
      finishedOn: day
    };
    const kept = byBook.get(item.bookId);
    if (!kept || isLater(item.completedAt, kept.completedAt)) byBook.set(item.bookId, item);
  }
  return [...byBook.values()];
}

function isLater(candidate, kept) {
  if (candidate === null) return false;
  if (kept === null) return true;
  return new Date(candidate).getTime() > new Date(kept).getTime();
}

const signature = (item) => `${item.bookId}|${item.completedAt}`;

function shouldStop(error) {
  const code = error && typeof error === 'object' ? String(error.code ?? '') : '';
  return STOP_CODES.has(code) || (error && error.reason === 'denied');
}

/**
 * Start sending completed shelf books to the library. Never awaited, never throws.
 * @returns {() => void} stop
 */
export function startReadStatusSync(stateAdapter, { service = libraryCatalog, doc } = {}) {
  const target = doc || (typeof document !== 'undefined' ? document : null);
  const sent = new Set();
  let stopped = false;
  let scheduled = false;
  let chain = Promise.resolve();

  const run = async () => {
    if (stopped) return;
    const pending = completedShelfReads(stateAdapter.getBooks()).filter(item => !sent.has(signature(item)));
    if (pending.length === 0) return;
    const catalog = await service.getCatalog();
    if (stopped || !catalog) return;
    if (catalog.status === 'signed-out' || catalog.status === 'no-household') {
      stopped = true;
      return;
    }
    // Unavailable: leave everything unsent for the next trigger.
    if (catalog.status !== 'ready' || !catalog.householdId) return;
    for (let i = 0; i < pending.length && !stopped; i += READ_SYNC_BATCH) {
      const batch = pending.slice(i, i + READ_SYNC_BATCH);
      // A book the library no longer has comes back not_found; it is not retried.
      await service.recordReads(catalog.householdId, batch);
      for (const item of batch) sent.add(signature(item));
    }
  };

  const trigger = () => {
    if (stopped || scheduled) return;
    scheduled = true;
    chain = chain
      .then(() => {
        scheduled = false;
        return run();
      })
      .catch((error) => {
        console.warn('[ReadStatus] sync failed:', logCode(error));
        if (shouldStop(error)) stopped = true;
      });
  };

  const unsubscribe = typeof stateAdapter.on === 'function'
    ? stateAdapter.on(STATE_EVENTS.BOOKS_CHANGED, trigger)
    : () => {};
  const onVisibility = () => {
    if (target && target.visibilityState === 'visible') trigger();
  };
  if (target && typeof target.addEventListener === 'function') {
    target.addEventListener('visibilitychange', onVisibility);
  }
  trigger();

  return () => {
    stopped = true;
    if (typeof unsubscribe === 'function') unsubscribe();
    if (target && typeof target.removeEventListener === 'function') {
      target.removeEventListener('visibilitychange', onVisibility);
    }
  };
}
