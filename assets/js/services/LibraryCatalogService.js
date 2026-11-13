/**
 * The household library ("On our shelf"), read and written straight from the `library`
 * schema with the player's own session. RLS limits every row to household members.
 *
 * - getCatalog never throws: a timeout, network error or PostgREST error gives
 *   `status: 'unavailable'`, and play goes on from the save's own book records.
 * - Reads are bounded by LIBRARY_TIMEOUT_MS (the whole load, getSession included), writes
 *   by LIBRARY_WRITE_TIMEOUT_MS.
 * - The catalogue lives in memory only: fresh for CATALOG_TTL_MS, a failure is not retried
 *   for RETRY_AFTER_MS unless forced, and a write makes it stale.
 * - Logs carry an error code or name only, never titles, authors or tags.
 */
import { getSupabaseClient } from './supabaseClient.js';
import { getSupabaseConfig } from './siteConfig.js';

export const LIBRARY_TIMEOUT_MS = 4000;
export const LIBRARY_WRITE_TIMEOUT_MS = 8000;
export const CATALOG_TTL_MS = 600000;
export const RETRY_AFTER_MS = 60000;

const PAGE_SIZE = 1000;
const SERIES_NAME_MAX = 200;
const BOOKS_SELECT = 'id, title, authors, cover_url, page_count, series_name, series_volume, on_shelf, copies(edition_note, deluxe, unhauled_at)';
const CHECK_VIOLATION = '23514';
const INSUFFICIENT_PRIVILEGE = '42501';

export class LibraryUnavailableError extends Error {
  /**
   * @param {'timeout'|'network'|'denied'|'error'} reason
   */
  constructor(reason = 'error') {
    super(`Library unavailable (${reason})`);
    this.name = 'LibraryUnavailableError';
    this.reason = reason;
  }
}

const NETWORK_PATTERNS = ['Failed to fetch', 'NetworkError', 'Load failed', 'Network request failed'];

/** Map any thrown value or PostgREST error to a LibraryUnavailableError. */
function toUnavailable(error) {
  if (error instanceof LibraryUnavailableError) return error;
  const code = error && typeof error === 'object' ? String(error.code ?? '') : '';
  const status = error && typeof error === 'object' ? Number(error.status) : NaN;
  if (code === INSUFFICIENT_PRIVILEGE || status === 401 || status === 403) {
    return new LibraryUnavailableError('denied');
  }
  const message = error && typeof error === 'object' ? String(error.message ?? '') : String(error ?? '');
  if ((error && error.name === 'TypeError') || NETWORK_PATTERNS.some(p => message.includes(p))) {
    return new LibraryUnavailableError('network');
  }
  return new LibraryUnavailableError('error');
}

/** A short code for logs: a PostgREST code or an error name, never a message. */
function logCode(error) {
  if (!error || typeof error !== 'object') return 'unknown';
  return String(error.code || error.reason || error.name || 'unknown');
}

/** Trim, clip to the column limit by code point, and trim again (the check needs btrim). */
function cleanSeriesName(name) {
  if (typeof name !== 'string') return '';
  return Array.from(name.trim()).slice(0, SERIES_NAME_MAX).join('').trim();
}

/**
 * Edition labels of the counted copies: the on-shelf copies, or every copy when the book is
 * unhauled. A deluxe copy adds "Deluxe" unless a label already says so (D10).
 */
function editionLabels(copies, unhauled = false) {
  const all = Array.isArray(copies) ? copies : [];
  const counted = unhauled ? all : all.filter(copy => !copy?.unhauled_at);
  const labels = [];
  for (const copy of counted) {
    const note = typeof copy?.edition_note === 'string' ? copy.edition_note.trim() : '';
    if (note && !labels.includes(note)) labels.push(note);
  }
  if (counted.some(copy => copy?.deluxe === true) && !labels.some(label => label.toLowerCase().includes('deluxe'))) {
    labels.push('Deluxe');
  }
  return labels;
}

function toLibraryBook(row, tags) {
  const unhauled = row.on_shelf === false;
  return {
    id: row.id,
    title: typeof row.title === 'string' ? row.title : '',
    authors: Array.isArray(row.authors) ? row.authors.filter(a => typeof a === 'string') : [],
    coverUrl: row.cover_url ?? null,
    pageCount: Number.isFinite(row.page_count) ? row.page_count : null,
    seriesName: row.series_name ?? null,
    seriesVolume: row.series_volume === null || row.series_volume === undefined ? null : Number(row.series_volume),
    editionLabels: editionLabels(row.copies, unhauled),
    unhauled,
    tags
  };
}

/**
 * Read every row of a query in pages until a page comes back empty (as the library app's
 * readAllPages does). The query must have a stable order.
 */
async function readAllPages(readPage) {
  const rows = [];
  for (let offset = 0; ;) {
    const { data, error } = await readPage(offset, offset + PAGE_SIZE - 1);
    if (error) throw error;
    const page = data ?? [];
    if (page.length === 0) return rows;
    rows.push(...page);
    offset += page.length;
  }
}

function emptyResult(status, extra = {}) {
  return { status, userId: null, householdId: null, books: [], tagsAvailable: false, fetchedAt: null, ...extra };
}

export class LibraryCatalogService {
  constructor({ getClient = getSupabaseClient, now = Date.now, setTimer = setTimeout, clearTimer = clearTimeout } = {}) {
    this._getClient = getClient;
    this._now = now;
    this._setTimer = setTimer;
    this._clearTimer = clearTimer;
    this._last = null;
    this._loadedAt = 0;
    this._stale = false;
    /** The running load: { gen, promise }. */
    this._inFlight = null;
    /** Bumped by every write (even one that failed or timed out: it may have landed). */
    this._writeGen = 0;
    /** Loads are numbered so an older load that ends late never replaces a newer result. */
    this._loadSeq = 0;
    this._storedSeq = 0;
    /** The user the cached result belongs to (null when signed out or never loaded). */
    this._knownUserId = null;
    this._listeners = new Set();
    /** Library book ids whose series fill hit a check violation; never tried again on this page. */
    this._seriesRejected = new Set();
  }

  /** Race a promise against a timer; the timer rejects with LibraryUnavailableError('timeout'). */
  _withTimeout(promise, ms) {
    const setTimer = this._setTimer;
    const clearTimer = this._clearTimer;
    return new Promise((resolve, reject) => {
      const timer = setTimer(() => reject(new LibraryUnavailableError('timeout')), ms);
      Promise.resolve(promise).then(
        (value) => { clearTimer(timer); resolve(value); },
        (error) => { clearTimer(timer); reject(error); }
      );
    });
  }

  async _library() {
    const client = await this._getClient();
    if (!client) throw new LibraryUnavailableError('error');
    return client.schema('library');
  }

  /** Whether the last result can be served without a request. */
  _cacheValid() {
    const last = this._last;
    if (!last || this._stale) return false;
    const age = this._now() - this._loadedAt;
    if (last.status === 'unavailable' || last.reason === 'denied') return age < RETRY_AFTER_MS;
    // Signed out is rechecked every time: the session is local, and a sign-in must show at once.
    if (last.status === 'signed-out') return false;
    return age < CATALOG_TTL_MS;
  }

  /** The session's user id (null when signed out or not configured). */
  async _sessionUserId() {
    const client = await this._getClient();
    if (!client) return null;
    const { data, error } = await client.auth.getSession();
    if (error) throw error;
    return data?.session?.user?.id || null;
  }

  /**
   * Whether the cached result still belongs to the signed-in user. Reads the local session
   * (bounded by the read timeout), so a sign-out or a user switch never serves the previous
   * household's books.
   */
  async _sessionMatchesCache() {
    try {
      const userId = await this._withTimeout(this._sessionUserId(), LIBRARY_TIMEOUT_MS);
      if (!userId) return false;
      // An unavailable result holds no household data, so any signed-in user may wait it out.
      if (this._last?.status === 'unavailable') return true;
      return userId === this._knownUserId;
    } catch (_error) {
      // Session unreadable: keep waiting out a failure, else reload (which reports it).
      return this._last?.status === 'unavailable';
    }
  }

  /** The running load, unless a write happened after it started (its rows may predate it). */
  _currentLoad() {
    const running = this._inFlight;
    return running && running.gen === this._writeGen ? running.promise : null;
  }

  /**
   * The household catalogue. Never throws.
   * @param {{force?: boolean}} [options] force skips the cache and the retry wait
   */
  async getCatalog({ force = false } = {}) {
    const running = this._currentLoad();
    if (running) return running;
    if (!force && this._cacheValid() && await this._sessionMatchesCache()) return this._last;
    return this._currentLoad() || this._startLoad();
  }

  _startLoad() {
    const gen = this._writeGen;
    const seq = ++this._loadSeq;
    const promise = (async () => {
      let result;
      try {
        result = await this._withTimeout(this._load(), LIBRARY_TIMEOUT_MS);
      } catch (error) {
        const unavailable = toUnavailable(error);
        console.warn('[LibraryCatalog] load failed:', logCode(error));
        result = unavailable.reason === 'denied'
          ? emptyResult('no-household', { reason: 'denied' })
          : emptyResult('unavailable', { reason: unavailable.reason });
      }
      if (seq > this._storedSeq) {
        this._storedSeq = seq;
        this._last = result;
        this._loadedAt = this._now();
        // A write made while this load ran may be missing from its rows.
        this._stale = this._writeGen !== gen;
        this._notify(result);
      }
      return result;
    })();
    const entry = { gen, promise };
    this._inFlight = entry;
    promise.then(() => {
      if (this._inFlight === entry) this._inFlight = null;
    });
    return promise;
  }

  /** Record the session's user; a different user (or none) forgets per-user state. */
  _setKnownUser(userId) {
    if (userId !== this._knownUserId) this._seriesRejected.clear();
    this._knownUserId = userId;
  }

  async _load() {
    const client = await this._getClient();
    if (!client) {
      this._setKnownUser(null);
      return emptyResult('signed-out', { reason: 'not-configured' });
    }

    const { data: sessionData, error: sessionError } = await client.auth.getSession();
    if (sessionError) throw sessionError;
    const userId = sessionData?.session?.user?.id || null;
    this._setKnownUser(userId);
    if (!userId) return emptyResult('signed-out');

    const library = client.schema('library');
    const { data: memberships, error: memberError } = await library
      .from('household_members')
      .select('household_id')
      .eq('user_id', userId)
      .order('created_at', { ascending: true })
      .limit(1);
    if (memberError) throw memberError;
    const householdId = memberships?.[0]?.household_id;
    if (!householdId) return emptyResult('no-household', { userId });

    const booksRead = readAllPages((from, to) => library
      .from('books')
      .select(BOOKS_SELECT)
      .eq('household_id', householdId)
      .order('id')
      .range(from, to));
    // A failed tag read never hides the shelf; any failed page discards the whole tag set.
    const tagsRead = readAllPages((from, to) => library
      .from('book_tags')
      .select('book_id, tag_id')
      .eq('household_id', householdId)
      .order('book_id')
      .order('tag_id')
      .range(from, to))
      .catch((error) => {
        console.warn('[LibraryCatalog] tags unavailable:', logCode(error));
        return null;
      });

    const [bookRows, tagRows] = await Promise.all([booksRead, tagsRead]);
    const tagsAvailable = tagRows !== null;
    const tagsByBook = new Map();
    for (const row of tagRows || []) {
      if (!tagsByBook.has(row.book_id)) tagsByBook.set(row.book_id, []);
      tagsByBook.get(row.book_id).push(row.tag_id);
    }

    return {
      status: 'ready',
      userId,
      householdId,
      books: bookRows.map(row => toLibraryBook(row, tagsByBook.get(row.id) || [])),
      tagsAvailable,
      fetchedAt: this._now()
    };
  }

  /**
   * The signed-in user's household id, for a write (R22). Reads the local session (bounded by
   * the read timeout) and serves the household of a cached result for that same user, even a
   * stale one, so a tag edit does not reload every book; else it loads. Never throws.
   * @returns {Promise<string|null>} null when signed out, without a household, or unavailable
   */
  async currentHouseholdId() {
    try {
      const userId = await this._withTimeout(this._sessionUserId(), LIBRARY_TIMEOUT_MS);
      if (!userId) return null;
      const last = this._last;
      if (last && last.status === 'ready' && last.userId === userId && last.householdId) return last.householdId;
      const catalog = await this.getCatalog();
      return catalog && catalog.status === 'ready' && catalog.userId === userId && catalog.householdId
        ? catalog.householdId
        : null;
    } catch (error) {
      console.warn('[LibraryCatalog] household lookup failed:', logCode(error));
      return null;
    }
  }

  /** The last result, or null before the first load. */
  peek() {
    return this._last;
  }

  /**
   * Called with the result after each completed load.
   * @returns {() => void} unsubscribe
   */
  subscribe(fn) {
    this._listeners.add(fn);
    return () => this._listeners.delete(fn);
  }

  _notify(result) {
    for (const fn of [...this._listeners]) {
      try {
        fn(result);
      } catch (error) {
        console.warn('[LibraryCatalog] subscriber failed:', logCode(error));
      }
    }
  }

  /**
   * Run one write; errors become LibraryUnavailableError. Every write, even one that failed
   * or timed out (it may still have landed), makes the catalogue stale.
   */
  async _write(run) {
    try {
      return await this._withTimeout((async () => run(await this._library()))(), LIBRARY_WRITE_TIMEOUT_MS);
    } catch (error) {
      console.warn('[LibraryCatalog] write failed:', logCode(error));
      throw toUnavailable(error);
    } finally {
      this._writeGen += 1;
      this._stale = true;
    }
  }

  /**
   * The shared tags of one library book, read through the book row so a deleted book (whose
   * tags the FK cascade removed) is told apart from a book with no tags.
   * @returns {Promise<string[]|null>} the tag ids (sorted), or null when the book is gone
   * @throws {LibraryUnavailableError}
   */
  async readBookTags(libraryBookId) {
    try {
      return await this._withTimeout((async () => {
        const library = await this._library();
        const { data, error } = await library
          .from('books')
          .select('id, book_tags(tag_id)')
          .eq('id', libraryBookId)
          .limit(1);
        if (error) throw error;
        const row = Array.isArray(data) ? data[0] : null;
        if (!row) return null;
        const tags = Array.isArray(row.book_tags) ? row.book_tags : [];
        return tags.map(t => t && t.tag_id).filter(id => typeof id === 'string').sort();
      })(), LIBRARY_TIMEOUT_MS);
    } catch (error) {
      console.warn('[LibraryCatalog] tag read failed:', logCode(error));
      throw toUnavailable(error);
    }
  }

  /**
   * Add shared tags to a library book (duplicates are ignored).
   * @throws {LibraryUnavailableError}
   */
  async addTags(libraryBookId, householdId, tagIds) {
    const unique = [...new Set(Array.isArray(tagIds) ? tagIds : [])];
    if (unique.length === 0) return;
    const rows = unique.map(tagId => ({ book_id: libraryBookId, household_id: householdId, tag_id: tagId }));
    await this._write(async (library) => {
      const { error } = await library
        .from('book_tags')
        .upsert(rows, { onConflict: 'book_id,tag_id', ignoreDuplicates: true });
      if (error) throw error;
    });
  }

  /**
   * Remove shared tags from a library book.
   * @throws {LibraryUnavailableError}
   */
  async removeTags(libraryBookId, tagIds) {
    const unique = [...new Set(Array.isArray(tagIds) ? tagIds : [])];
    if (unique.length === 0) return;
    await this._write(async (library) => {
      const { error } = await library
        .from('book_tags')
        .delete()
        .eq('book_id', libraryBookId)
        .in('tag_id', unique);
      if (error) throw error;
    });
  }

  /**
   * Set a library book's series only when it has none (D5). Never overwrites or clears.
   * A blank name makes no request; a check violation counts as 'kept' and that book is not
   * tried again on this page.
   * @returns {Promise<'filled'|'kept'>}
   * @throws {LibraryUnavailableError}
   */
  async fillSeries(libraryBookId, name) {
    const seriesName = cleanSeriesName(name);
    if (!seriesName || this._seriesRejected.has(libraryBookId)) return 'kept';
    return await this._write(async (library) => {
      const { data, error } = await library
        .from('books')
        .update({ series_name: seriesName })
        .eq('id', libraryBookId)
        .is('series_name', null)
        .select('id');
      if (error) {
        if (String(error.code) === CHECK_VIOLATION) {
          this._seriesRejected.add(libraryBookId);
          return 'kept';
        }
        throw error;
      }
      return Array.isArray(data) && data.length > 0 ? 'filled' : 'kept';
    });
  }
}

export const libraryCatalog = new LibraryCatalogService();

/**
 * The page's catalogue when Supabase is configured, else null (no shelf group, no request).
 * Read synchronously from the page's meta tags.
 * @returns {LibraryCatalogService|null}
 */
export function configuredLibraryCatalog() {
  const { url, publishableKey } = getSupabaseConfig();
  return url && publishableKey ? libraryCatalog : null;
}

/**
 * The catalogue a controller hands its book selectors: `dependencies.libraryCatalog` when the
 * key is present (tests, or null to turn it off), else the configured one.
 * @param {Object} [dependencies]
 * @returns {LibraryCatalogService|null}
 */
export function resolveLibraryCatalog(dependencies) {
  if (dependencies && Object.prototype.hasOwnProperty.call(dependencies, 'libraryCatalog')) {
    return dependencies.libraryCatalog || null;
  }
  return configuredLibraryCatalog();
}
