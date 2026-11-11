/**
 * "Tidy your ToS library" (Plan 4, D9 and D10): the review panel at the top of the Library tab
 * and the reminder banner in the character-sheet header.
 *
 * - The panel shows while bookTidy.status isn't `done` (and while a removed book can still be
 *   restored). There is no "never": `Later` only postpones, and the banner comes back once
 *   TIDY_REMIND_AFTER_DAYS have passed.
 * - Signed in with a household and a ready catalogue, each row offers its library matches.
 *   Otherwise (signed out, no household, library unavailable) it is the simple version: the
 *   four types and Drop, with no network needed. Signed out never asks for the catalogue.
 * - Apply hands exactly the chosen decisions to applyTidy; the confirm, the cloud precheck
 *   and the deliberate push happen only when the apply removes books (R26).
 * - Logs carry an error code only, never titles, authors or tags.
 */
import { BaseController } from './BaseController.js';
import { STATE_EVENTS } from '../character-sheet/stateAdapter.js';
import { STORAGE_KEYS } from '../character-sheet/storageKeys.js';
import { PICKABLE_TYPES, BOOK_TYPE_LABELS } from '../utils/bookTypes.js';
import {
    planTidy,
    summarizeTidy,
    applyTidy,
    restoreRemovedBooks,
    isProtected
} from '../services/LibraryTidyService.js';
import { resolveLibraryCatalog, LIBRARY_TIMEOUT_MS } from '../services/LibraryCatalogService.js';
import { searchShelf } from '../services/ShelfBookService.js';
import { getSupabaseClient } from '../services/supabaseClient.js';
import { checkReadyForDeliberateChange, pushDeliberateChange } from '../services/cloudSync.js';
import { runExclusiveSync } from '../services/syncLock.js';
import { confirmDialog } from '../ui/confirmDialog.js';
import { switchToTab } from '../tabs.js';

/** Days after `Later` before the banner shows again (D9). */
export const TIDY_REMIND_AFTER_DAYS = 7;

const DAY_MS = 24 * 60 * 60 * 1000;
const SEARCH_LIMIT = 8;

const SUBTEXT_REST = 'Books on our shelf with no quest, no completion and no series move to the household library; everything else keeps its history.';
const SIGNED_OUT_NOTE = 'Sign in and join your household to match books with the library.';
const UNAVAILABLE_NOTE = 'The household library is unavailable right now.';
const LOADING_NOTE = 'Checking the household library…';
const OUTCOME_REMOVE = 'Will be removed from ToS (stays in the library)';
const OUTCOME_SHELF = 'Will link to the library (keeps its quests)';
const PROTECTED_TOOLTIP = "Can't drop a book with quest history";
const PUSH_HINT = 'Saved on this device. It will upload with your next sync.';
const STORAGE_FULL = "This browser's storage is full, so nothing was changed. Free some space, or remove uploaded covers, and try again.";

/** A `protected` block where no chosen book became protected (R31). */
const LIBRARY_CHANGED = 'Your library changed while the dialog was open. Nothing was changed; check your choices and apply again.';

/** A write that failed for a reason not known to be storage quota (R30). */
const SAVE_FAILED = "Couldn't save that. Nothing was changed.";

/**
 * The cloud adapter while the session can't be read: the player may be signed in, so a
 * removal is blocked as offline (nothing written) instead of skipping the precheck.
 */
const OFFLINE_CLOUD = Object.freeze({
    checkReady: async () => ({ ok: false, reason: 'offline' }),
    push: async () => false
});

/**
 * The confirm body (D10). Verbatim when nothing is dropped, linked or typed; with drops, says
 * how many stay in the household library and how many are dropped (R28); then how many link to
 * the library and how many get a type, so removed + linked + typed add up to the choices (R34).
 * @param {{ remove: number, dropped: number, shelf?: number, typed?: number, booksBefore: number, booksAfter: number }} summary
 */
export function tidyConfirmBody(summary) {
    const lead = `Remove ${plural(summary.remove, 'book', 'books')} from Tome of Secrets.`;
    const tail = `Your save goes from ${summary.booksBefore} to ${summary.booksAfter} books. You can restore them from this panel.`;
    let removal;
    if (!(summary.dropped > 0)) {
        removal = 'They stay in the household library.';
    } else {
        const kept = summary.remove - summary.dropped;
        const dropped = `${summary.dropped} ${summary.dropped === 1 ? 'is' : 'are'} dropped.`;
        removal = kept > 0
            ? `${kept} ${kept === 1 ? 'stays' : 'stay'} in the household library; ${dropped}`
            : dropped;
    }
    const shelf = summary.shelf > 0 ? summary.shelf : 0;
    const typed = summary.typed > 0 ? summary.typed : 0;
    const linkClause = shelf > 0
        ? `${shelf} ${shelf === 1 ? 'links to the library and keeps its history' : 'link to the library and keep their history'}`
        : '';
    const typeClause = typed > 0 ? `${typed} ${typed === 1 ? 'gets a type' : 'get a type'}` : '';
    const others = [linkClause, typeClause].filter(Boolean).join('; ');
    return [lead, removal, others ? `${others}.` : '', tail].filter(Boolean).join(' ');
}

const BLOCKED_MESSAGES = {
    unsynced: () => 'Your cloud save changed on another device. Use Sync now first, then apply.',
    offline: () => "You're offline. Nothing was changed; removals need a connection. Your choices are still here.",
    'newer-schema': () => 'Tome of Secrets was updated. Reload this tab, then apply.',
    library: () => "Couldn't reach the household library. Nothing was changed.",
    protected: (title) => `${title} now has quest history, so it can't be dropped. Nothing was changed.`,
    storage: () => STORAGE_FULL
};

function plural(n, one, many) {
    return `${n} ${n === 1 ? one : many}`;
}

function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

/** Attribute escaping for a URL (as LibraryController._escapeAttr). */
function escapeAttr(value) {
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

/** An image URL safe to render: http(s), or an inline data:image cover. Else null. */
function safeImageUrl(url) {
    if (typeof url !== 'string') return null;
    const trimmed = url.trim();
    return /^(https?:\/\/|data:image\/)/i.test(trimmed) ? trimmed : null;
}

/** A small cover image, or '' when there is none. */
function coverImgHtml(url, className) {
    const safe = safeImageUrl(url);
    return safe
        ? `<img class="${className}" src="${escapeAttr(safe)}" alt="" loading="lazy" onerror="this.style.display='none'">`
        : '';
}

function errorCode(error) {
    return (error && (error.reason || error.code || error.name)) || 'unknown';
}

function isUnsorted(book) {
    return Boolean(book) && typeof book === 'object' && book.type === 'unsorted';
}

export class LibraryTidyController extends BaseController {
    constructor(stateAdapter, form, dependencies = {}) {
        super(stateAdapter, form, dependencies);
        this._catalogService = resolveLibraryCatalog(dependencies);
        this._getClient = dependencies.getSupabaseClient || getSupabaseClient;
        this._now = typeof dependencies.now === 'function' ? dependencies.now : () => Date.now();

        /** 'idle' (not asked yet), 'loading', 'ready', 'signed-out' or 'unavailable'. */
        this._source = 'idle';
        this._catalog = null;
        /** { checkReady, push } when signed in, else null (no cloud save to push). */
        this._cloud = null;
        this._loadToken = 0;
        this._loading = null;
        /** The session's user at the last load, and the client whose auth changes are watched. */
        this._userId = null;
        this._authClient = null;
        /** The user of an auth event seen while a load ran (undefined: none). */
        this._authDuringLoad = undefined;
        this._sessionTimeoutMs = Number.isFinite(dependencies.sessionTimeoutMs) ? dependencies.sessionTimeoutMs : LIBRARY_TIMEOUT_MS;

        this._plan = [];
        /** bookId -> { kind: 'link', libraryBookId } | { kind: 'type', type } | { kind: 'drop' } */
        this._choices = new Map();
        /** Rows the player changed: a preselected match is never put back on them. */
        this._touched = new Set();
        /** Rows whose type buttons show although they have a match (unticked, or None of these). */
        this._revealed = new Set();
        /** bookId -> query, for rows with "Find it in the library…" open. */
        this._searching = new Map();

        this._busy = false;
        this._bannerOpened = false;
        this._unsubscribers = [];
    }

    /**
     * @returns {Promise<void>} resolves once the household library was asked (or wasn't needed)
     */
    initialize() {
        this._panel = document.getElementById('library-tidy-panel');
        this._body = document.getElementById('library-tidy-body');
        this._messageEl = document.getElementById('library-tidy-message');
        this._banner = document.getElementById('library-tidy-banner');
        this._bannerText = document.getElementById('library-tidy-banner-text');
        if (!this._panel && !this._banner) return Promise.resolve();

        if (this._body) {
            this.addEventListener(this._body, 'click', (event) => this._onClick(event));
            this.addEventListener(this._body, 'change', (event) => this._onChange(event));
            this.addEventListener(this._body, 'input', (event) => this._onInput(event));
        }
        this.addEventListener(document.getElementById('library-tidy-banner-open'), 'click', () => this.handleOpen());
        this.addEventListener(document.getElementById('library-tidy-banner-later'), 'click', () => this.handleLater());

        const onChange = () => this._onStateChanged();
        this._unsubscribers.push(this.stateAdapter.on(STATE_EVENTS.BOOKS_CHANGED, onChange));
        this._unsubscribers.push(this.stateAdapter.on(STATE_EVENTS.BOOK_TIDY_CHANGED, onChange));

        this._replan();
        this.render();
        this._reconcileStatus();
        return this._ensureSource();
    }

    destroy() {
        super.destroy();
        this._unsubscribers.forEach((off) => { if (typeof off === 'function') off(); });
        this._unsubscribers = [];
        this._loadToken += 1;
    }

    // --- State ---------------------------------------------------------------------------

    _books() {
        const books = this.stateAdapter.state[STORAGE_KEYS.BOOKS];
        return books && typeof books === 'object' && !Array.isArray(books) ? books : {};
    }

    _unsortedCount() {
        return Object.values(this._books()).filter(isUnsorted).length;
    }

    /** Removed books that a restore would put back (ids not already in books). */
    _restorableCount() {
        const removed = this.stateAdapter.getBookTidy().removedBooks;
        const books = this._books();
        return Object.keys(removed).filter((id) => !(id in books)).length;
    }

    _panelVisible() {
        const tidy = this.stateAdapter.getBookTidy();
        return tidy.status !== 'done' || this._unsortedCount() > 0 || this._restorableCount() > 0;
    }

    _bannerDue() {
        if (this._unsortedCount() === 0) return false;
        const tidy = this.stateAdapter.getBookTidy();
        if (tidy.status === 'pending' || tidy.status === 'done') return true;
        const at = Date.parse(tidy.postponedAt);
        if (!Number.isFinite(at)) return true;
        return this._now() - at >= TIDY_REMIND_AFTER_DAYS * DAY_MS;
    }

    _readyCatalog() {
        return this._source === 'ready' ? this._catalog : null;
    }

    /** Recompute the rows from live state, keeping the player's choices where they still apply. */
    _replan() {
        const catalog = this._readyCatalog();
        this._plan = planTidy(this.stateAdapter.state, catalog);
        const libraryIds = new Set(catalog ? catalog.books.map((book) => book.id) : []);
        const rowIds = new Set(this._plan.map((row) => row.bookId));
        for (const id of [...this._choices.keys(), ...this._touched, ...this._revealed, ...this._searching.keys()]) {
            if (rowIds.has(id)) continue;
            this._choices.delete(id);
            this._touched.delete(id);
            this._revealed.delete(id);
            this._searching.delete(id);
        }
        for (const row of this._plan) {
            const choice = this._choices.get(row.bookId);
            if (choice && choice.kind === 'drop' && row.protected) this._choices.delete(row.bookId);
            if (choice && choice.kind === 'link' && !libraryIds.has(choice.libraryBookId)) this._choices.delete(row.bookId);
            if (!catalog) this._searching.delete(row.bookId);
            if (row.preselected && !this._touched.has(row.bookId) && !this._choices.has(row.bookId)) {
                this._choices.set(row.bookId, { kind: 'link', libraryBookId: row.preselected });
            }
        }
    }

    /** The decisions applyTidy gets: one per chosen row, in row order. */
    _decisions() {
        const decisions = [];
        for (const row of this._plan) {
            const choice = this._choices.get(row.bookId);
            if (!choice) continue;
            if (choice.kind === 'link') decisions.push({ bookId: row.bookId, kind: 'link', libraryBookId: choice.libraryBookId });
            else if (choice.kind === 'type') decisions.push({ bookId: row.bookId, kind: 'type', type: choice.type });
            else if (choice.kind === 'drop') decisions.push({ bookId: row.bookId, kind: 'drop' });
        }
        return decisions;
    }

    _onStateChanged() {
        this._replan();
        this.render();
        this._reconcileStatus();
        void this._ensureSource();
    }

    /**
     * Keep the status honest when books change outside the panel (the edit drawer can type the
     * last Unsorted book): `done` once none is left, `pending` again when one is back (as
     * healTidyStatus does on load). Re-checked inside the sync lock, so it never races an apply.
     */
    _reconcileStatus() {
        const needsChange = () => {
            const tidy = this.stateAdapter.getBookTidy();
            const unsorted = this._unsortedCount();
            if (tidy.status !== 'done' && unsorted === 0) return { ...tidy, status: 'done', completedAt: new Date(this._now()).toISOString() };
            if (tidy.status === 'done' && unsorted > 0) return { ...tidy, status: 'pending' };
            return null;
        };
        if (!needsChange()) return;
        runExclusiveSync(() => {
            const next = needsChange();
            if (next) this.stateAdapter.setBookTidy(next);
        }).catch((error) => console.warn('[LibraryTidy] status update failed:', errorCode(error)));
    }

    // --- Household library -----------------------------------------------------------------

    /** Ask the household library once there is something to sort. */
    _ensureSource() {
        if (this._source !== 'idle' || this._plan.length === 0) return this._loading || Promise.resolve();
        return this._loadSource();
    }

    _loadSource({ force = false } = {}) {
        const token = ++this._loadToken;
        this._source = 'loading';
        this.render();
        this._authDuringLoad = undefined;
        this._loading = (async () => {
            let client = null;
            let userId = null;
            let sessionUnknown = false;
            try {
                ({ client, userId } = await this._readSession());
            } catch (error) {
                // Not "signed out": the player may be signed in, so removals must not skip the
                // cloud precheck. They are blocked as offline until the session can be read.
                console.warn('[LibraryTidy] session unavailable:', errorCode(error));
                sessionUnknown = true;
            }
            if (token !== this._loadToken) return;
            this._userId = userId;
            if (sessionUnknown) {
                this._cloud = OFFLINE_CLOUD;
                this._catalog = null;
                this._source = 'unavailable';
            } else if (!userId || !this._catalogService) {
                this._cloud = userId ? this._makeCloud(client) : null;
                this._catalog = null;
                this._source = 'signed-out';
            } else {
                this._cloud = this._makeCloud(client);
                let catalog = null;
                try {
                    catalog = await this._catalogService.getCatalog(force ? { force: true } : undefined);
                } catch (error) {
                    console.warn('[LibraryTidy] library unavailable:', errorCode(error));
                }
                if (token !== this._loadToken) return;
                this._catalog = catalog;
                if (catalog && catalog.status === 'ready' && Array.isArray(catalog.books)) this._source = 'ready';
                else if (!catalog || catalog.status === 'unavailable') this._source = 'unavailable';
                else this._source = 'signed-out';
            }
            this._replan();
            this.render();
            // The user changed while this load ran: its answer is for the wrong user (R31).
            const seen = this._authDuringLoad;
            this._authDuringLoad = undefined;
            if (seen !== undefined && seen !== this._userId) await this._loadSource();
        })();
        return this._loading;
    }

    /**
     * The client and the session's user, bounded by LIBRARY_TIMEOUT_MS: a CDN import or a token
     * refresh that stalls must not keep the panel loading (and Apply disabled) for ever.
     * @returns {Promise<{ client: Object|null, userId: string|null }>} rejects when unknown
     */
    _readSession() {
        const read = (async () => {
            const client = await this._getClient();
            if (!client || !client.auth || typeof client.auth.getSession !== 'function') return { client, userId: null };
            this._watchAuth(client);
            const { data, error } = await client.auth.getSession();
            if (error) throw error;
            const userId = data && data.session && data.session.user ? data.session.user.id || null : null;
            return { client, userId };
        })();
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                const timeout = new Error('Session read timed out');
                timeout.name = 'TimeoutError';
                reject(timeout);
            }, this._sessionTimeoutMs);
            read.then(
                (value) => { clearTimeout(timer); resolve(value); },
                (error) => { clearTimeout(timer); reject(error); }
            );
        });
    }

    /**
     * Reload when the signed-in user changes (sign-in or sign-out after the page loaded).
     * Subscribed once per client; an event for the same user (token refresh) is ignored.
     */
    _watchAuth(client) {
        if (this._authClient === client || typeof client.auth.onAuthStateChange !== 'function') return;
        this._authClient = client;
        try {
            const result = client.auth.onAuthStateChange((_event, session) => {
                const userId = session && session.user ? session.user.id || null : null;
                if (this._source === 'idle' || this._source === 'loading') {
                    // Settled when the running load ends: reloads then if the user differs.
                    this._authDuringLoad = userId;
                    return;
                }
                if (userId === this._userId) return;
                void this._loadSource();
            });
            const subscription = result && result.data ? result.data.subscription : null;
            if (subscription && typeof subscription.unsubscribe === 'function') {
                this._unsubscribers.push(() => subscription.unsubscribe());
            }
        } catch (error) {
            console.warn('[LibraryTidy] auth watch unavailable:', errorCode(error));
        }
    }

    /** The cloud adapter applyTidy expects: push resolves true only when the save went up. */
    _makeCloud(client) {
        return {
            checkReady: () => checkReadyForDeliberateChange(client),
            push: async (declaration) => {
                const result = await pushDeliberateChange(client, declaration);
                return Boolean(result && result.action === 'push');
            }
        };
    }

    // --- Actions ---------------------------------------------------------------------------

    handleOpen() {
        this._bannerOpened = true;
        this._renderBanner();
        switchToTab('library');
        if (this._panel && typeof this._panel.scrollIntoView === 'function') {
            this._panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    }

    async handleLater() {
        let ok = false;
        try {
            ok = await runExclusiveSync(() => {
                const tidy = this.stateAdapter.getBookTidy();
                if (tidy.status === 'done') return true;
                return Boolean(this.stateAdapter.setBookTidy({
                    ...tidy,
                    status: 'postponed',
                    postponedAt: new Date(this._now()).toISOString()
                }));
            });
        } catch (error) {
            console.warn('[LibraryTidy] postpone failed:', errorCode(error));
        }
        // The adapter doesn't say why a write failed, so it is never called a full quota (R30).
        if (!ok) this._setMessage(SAVE_FAILED);
        this.render();
    }

    /** Apply waits for the session and the library: until then it can't know about the cloud. */
    _sourcePending() {
        return this._source === 'idle' || this._source === 'loading';
    }

    async handleApply() {
        if (this._busy) return;
        // The decisions are the ones on screen now; a library answer arriving meanwhile must
        // not add preselected matches the player never saw.
        const decisions = this._decisions();
        if (decisions.length === 0) return;
        const plannedProtected = new Map(this._plan.map((row) => [row.bookId, row.protected]));
        this._busy = true;
        this._setMessage('');
        this.render();

        if (this._sourcePending()) {
            // A load can hand over to a newer one (an auth change); each is bounded.
            for (let attempt = 0; attempt < 3 && this._sourcePending(); attempt += 1) {
                try {
                    await (this._loading || this._ensureSource());
                } catch (error) {
                    console.warn('[LibraryTidy] source load failed:', errorCode(error));
                }
            }
            if (this._sourcePending()) {
                // Still unknown (never expected): don't guess about the cloud.
                this._cloud = OFFLINE_CLOUD;
            }
        }

        let summary = summarizeTidy(this.stateAdapter.state, decisions);
        const confirm = (confirmed) => {
            summary = confirmed;
            return confirmDialog({
                title: 'Remove books from Tome of Secrets?',
                body: tidyConfirmBody(confirmed),
                confirmLabel: `Remove ${plural(confirmed.remove, 'book', 'books')}`,
                cancelLabel: 'Cancel'
            });
        };

        let result;
        try {
            result = await applyTidy({
                stateAdapter: this.stateAdapter,
                decisions,
                catalog: this._readyCatalog(),
                service: this._catalogService,
                cloud: this._cloud,
                confirm
            });
        } catch (error) {
            console.warn('[LibraryTidy] apply failed:', errorCode(error));
            result = { status: 'failed', pushed: false };
        }
        this._busy = false;

        if (result.status === 'applied') {
            let text = `Done. ${summary.remove} removed, ${summary.shelf} linked to the library, ${summary.typed} typed.`;
            if (summary.remove > 0 && this._cloud && !result.pushed) text += ` ${PUSH_HINT}`;
            this._setMessage(text);
        } else if (result.status === 'blocked') {
            const toText = BLOCKED_MESSAGES[result.reason];
            if (result.reason === 'protected') {
                const title = this._protectedTitle(decisions, plannedProtected);
                this._setMessage(title === null ? LIBRARY_CHANGED : toText(title));
            } else {
                this._setMessage(toText ? toText() : SAVE_FAILED);
            }
        } else if (result.status === 'failed') {
            this._setMessage(SAVE_FAILED);
        }
        this._replan();
        this.render();
    }

    /**
     * The title for the `protected` message: a chosen book that became protected (a drop that
     * now has history, else a link that had none when the panel was drawn). Null when no chosen
     * book did: the action list changed for another reason (R31).
     */
    _protectedTitle(decisions, plannedProtected) {
        const books = this._books();
        const state = this.stateAdapter.state;
        const nowProtected = (d) => Boolean(books[d.bookId]) && isProtected(books[d.bookId], state);
        const hit = decisions.find((d) => d.kind === 'drop' && nowProtected(d))
            || decisions.find((d) => d.kind === 'link' && !plannedProtected.get(d.bookId) && nowProtected(d));
        if (!hit) return null;
        return books[hit.bookId].title || 'A book';
    }

    async handleRestore() {
        if (this._busy) return;
        this._busy = true;
        this._setMessage('');
        const before = Object.keys(this.stateAdapter.getBookTidy().removedBooks).filter((id) => !(id in this._books()));
        try {
            await restoreRemovedBooks(this.stateAdapter);
        } catch (error) {
            console.warn('[LibraryTidy] restore failed:', errorCode(error));
        }
        this._busy = false;
        // Count from state: the books can be back even when the bookTidy write failed.
        const books = this._books();
        const back = before.filter((id) => id in books).length;
        // restoreRemovedBooks doesn't say why a write failed, so it is never called a full quota (R30).
        this._setMessage(back > 0 ? `Restored ${plural(back, 'book', 'books')}.` : SAVE_FAILED);
        this._replan();
        this.render();
        this._reconcileStatus();
        void this._ensureSource();
    }

    // --- Events ----------------------------------------------------------------------------

    _rowId(target) {
        const rowEl = target.closest('.library-tidy-row');
        return rowEl ? rowEl.dataset.bookId : null;
    }

    _onClick(event) {
        const button = event.target.closest('button');
        if (!button || !this._body.contains(button)) return;
        event.preventDefault();
        if (button.classList.contains('library-tidy-apply-btn')) { void this.handleApply(); return; }
        if (button.classList.contains('library-tidy-later-btn')) { void this.handleLater(); return; }
        if (button.classList.contains('library-tidy-restore-btn')) { void this.handleRestore(); return; }
        if (button.classList.contains('library-tidy-retry-btn')) { void this._loadSource({ force: true }); return; }

        const bookId = this._rowId(button);
        if (!bookId) return;
        const current = this._choices.get(bookId);
        if (button.classList.contains('library-tidy-type-btn')) {
            const type = button.dataset.type;
            if (!PICKABLE_TYPES.includes(type)) return;
            this._touched.add(bookId);
            if (current && current.kind === 'type' && current.type === type) this._choices.delete(bookId);
            else this._choices.set(bookId, { kind: 'type', type });
        } else if (button.classList.contains('library-tidy-drop-btn')) {
            this._touched.add(bookId);
            if (current && current.kind === 'drop') this._choices.delete(bookId);
            else this._choices.set(bookId, { kind: 'drop' });
        } else if (button.classList.contains('library-tidy-find-btn')) {
            if (this._searching.has(bookId)) this._searching.delete(bookId);
            else this._searching.set(bookId, '');
            this.render();
            const rowEl = [...this._body.querySelectorAll('.library-tidy-row')].find((el) => el.dataset.bookId === bookId);
            const input = rowEl ? rowEl.querySelector('.library-tidy-search-input') : null;
            if (input) input.focus();
            return;
        } else if (button.classList.contains('library-tidy-search-result')) {
            const libraryBookId = button.dataset.libraryBookId;
            if (!libraryBookId) return;
            this._touched.add(bookId);
            this._revealed.add(bookId);
            this._choices.set(bookId, { kind: 'link', libraryBookId });
            this._searching.delete(bookId);
        } else {
            return;
        }
        this.render();
    }

    _onChange(event) {
        const input = event.target;
        if (!(input instanceof HTMLInputElement)) return;
        const bookId = this._rowId(input);
        if (!bookId) return;
        const row = this._plan.find((r) => r.bookId === bookId);
        if (!row) return;
        const current = this._choices.get(bookId);
        if (input.classList.contains('library-tidy-preselect')) {
            this._touched.add(bookId);
            if (input.checked) {
                this._choices.set(bookId, { kind: 'link', libraryBookId: row.preselected });
                this._revealed.delete(bookId);
            } else {
                if (current && current.kind === 'link') this._choices.delete(bookId);
                this._revealed.add(bookId);
            }
        } else if (input.classList.contains('library-tidy-candidate')) {
            this._touched.add(bookId);
            if (input.value) {
                this._choices.set(bookId, { kind: 'link', libraryBookId: input.value });
                this._revealed.delete(bookId);
            } else {
                if (current && current.kind === 'link') this._choices.delete(bookId);
                this._revealed.add(bookId);
            }
        } else if (input.classList.contains('library-tidy-hand')) {
            this._touched.add(bookId);
            if (!input.checked && current && current.kind === 'link') this._choices.delete(bookId);
        } else {
            return;
        }
        this.render();
    }

    _onInput(event) {
        const input = event.target;
        if (!(input instanceof HTMLInputElement) || !input.classList.contains('library-tidy-search-input')) return;
        const bookId = this._rowId(input);
        if (!bookId || !this._searching.has(bookId)) return;
        this._searching.set(bookId, input.value);
        const results = input.closest('.library-tidy-search').querySelector('.library-tidy-search-results');
        if (results) results.innerHTML = this._searchResultsHtml(input.value);
    }

    // --- Rendering -------------------------------------------------------------------------

    _setMessage(text) {
        if (this._messageEl) this._messageEl.textContent = text;
    }

    render() {
        this._renderPanel();
        this._renderBanner();
    }

    _renderBanner() {
        if (!this._banner) return;
        const show = !this._bannerOpened && this._bannerDue();
        this._banner.hidden = !show;
        if (show && this._bannerText) {
            this._bannerText.textContent = `Tidy your ToS library — ${plural(this._unsortedCount(), 'book', 'books')} to sort.`;
        }
    }

    _renderPanel() {
        if (!this._panel) return;
        const visible = this._panelVisible();
        this._panel.hidden = !visible;
        if (!visible || !this._body) return;

        // Keep keyboard focus on the same control across the redraw.
        const active = document.activeElement;
        const focusKey = active && this._body.contains(active) ? active.dataset.focusKey : null;

        const rows = this._plan;
        const intro = rows.length > 0
            ? `<p class="library-tidy-subtext">${escapeHtml(`${plural(rows.length, 'book', 'books')} to sort. ${SUBTEXT_REST}`)}</p>`
            : '<p class="library-tidy-subtext">Nothing left to sort.</p>';
        this._body.innerHTML =
            intro +
            (rows.length > 0 ? this._sourceNoteHtml() : '') +
            (rows.length > 0 ? `<div class="library-tidy-rows">${rows.map((row) => this._rowHtml(row)).join('')}</div>` : '') +
            this._footerHtml(rows.length > 0);

        if (focusKey) {
            const again = [...this._body.querySelectorAll('[data-focus-key]')].find((el) => el.dataset.focusKey === focusKey);
            if (again) again.focus();
        }
    }

    _sourceNoteHtml() {
        if (this._source === 'ready') return '';
        if (this._source === 'unavailable') {
            return `<p class="library-tidy-simple-note">${escapeHtml(UNAVAILABLE_NOTE)} ` +
                '<button type="button" class="rpg-btn rpg-btn-secondary library-tidy-retry-btn" data-focus-key="retry">Retry</button></p>';
        }
        if (this._source === 'loading' || this._source === 'idle') {
            return `<p class="library-tidy-simple-note">${escapeHtml(LOADING_NOTE)}</p>`;
        }
        return `<p class="library-tidy-simple-note">${escapeHtml(SIGNED_OUT_NOTE)}</p>`;
    }

    _footerHtml(hasRows) {
        const k = this._decisions().length;
        const restorable = this._restorableCount();
        const status = this.stateAdapter.getBookTidy().status;
        const parts = [];
        if (hasRows) {
            parts.push(`<button type="button" class="rpg-btn rpg-btn-primary library-tidy-apply-btn" data-focus-key="apply"${k === 0 || this._busy || this._sourcePending() ? ' disabled' : ''}>Apply ${escapeHtml(plural(k, 'choice', 'choices'))}</button>`);
            if (status !== 'done') {
                parts.push('<button type="button" class="rpg-btn rpg-btn-secondary library-tidy-later-btn" data-focus-key="later">Later</button>');
            }
        }
        if (restorable > 0) {
            parts.push(`<button type="button" class="rpg-btn rpg-btn-secondary library-tidy-restore-btn" data-focus-key="restore"${this._busy ? ' disabled' : ''}>Restore removed books (${restorable})</button>`);
        }
        return parts.length ? `<div class="library-tidy-footer">${parts.join('')}</div>` : '';
    }

    _outcomeHtml(row) {
        return `<div class="library-tidy-outcome">${escapeHtml(row.protected ? OUTCOME_SHELF : OUTCOME_REMOVE)}</div>`;
    }

    _libraryTitle(libraryBookId, row) {
        const candidate = row.candidates.find((c) => c.libraryBookId === libraryBookId);
        if (candidate) return candidate.title;
        const catalog = this._readyCatalog();
        const book = catalog ? catalog.books.find((b) => b.id === libraryBookId) : null;
        return book ? book.title : '';
    }

    _rowHtml(row) {
        const id = escapeHtml(row.bookId);
        const book = this._books()[row.bookId] || {};
        const choice = this._choices.get(row.bookId) || null;
        const linked = choice && choice.kind === 'link' ? choice.libraryBookId : null;
        const ready = Boolean(this._readyCatalog());
        const key = (suffix) => escapeHtml(`${row.bookId}:${suffix}`);

        const cover = coverImgHtml(book.cover, 'library-tidy-cover')
            || '<span class="library-tidy-cover library-tidy-cover-placeholder">No cover</span>';
        const author = row.author ? `<div class="library-tidy-author">${escapeHtml(row.author)}</div>` : '';

        let matchHtml = '';
        let showOptions = true;
        if (ready && row.preselected) {
            const checked = linked === row.preselected;
            const preselected = row.candidates.find((c) => c.libraryBookId === row.preselected);
            matchHtml =
                '<label class="library-tidy-match">' +
                `<input type="checkbox" class="library-tidy-preselect" data-focus-key="${key('preselect')}"${checked ? ' checked' : ''}> ` +
                coverImgHtml(preselected ? preselected.coverUrl : null, 'library-tidy-candidate-cover') +
                `On our shelf: ${escapeHtml(this._libraryTitle(row.preselected, row))}</label>` +
                (checked ? this._outcomeHtml(row) : '');
            showOptions = !checked;
        } else if (ready && row.candidates.length > 0) {
            const pickedCandidate = linked && row.candidates.some((c) => c.libraryBookId === linked) ? linked : null;
            const none = !pickedCandidate && (this._revealed.has(row.bookId) || Boolean(choice));
            const name = `library-tidy-candidate-${id}`;
            const options = row.candidates.map((c) => {
                const authors = c.authors.length ? ` — ${escapeHtml(c.authors.join(', '))}` : '';
                return '<label class="library-tidy-candidate-option">' +
                    `<input type="radio" class="library-tidy-candidate" name="${name}" value="${escapeHtml(c.libraryBookId)}" data-focus-key="${key(`cand:${c.libraryBookId}`)}"${pickedCandidate === c.libraryBookId ? ' checked' : ''}> ` +
                    coverImgHtml(c.coverUrl, 'library-tidy-candidate-cover') +
                    `${escapeHtml(c.title)}${authors}</label>`;
            }).join('');
            matchHtml =
                '<fieldset class="library-tidy-candidates"><legend>Is it one of these?</legend>' +
                options +
                '<label class="library-tidy-candidate-option">' +
                `<input type="radio" class="library-tidy-candidate" name="${name}" value="" data-focus-key="${key('cand:none')}"${none ? ' checked' : ''}> None of these</label>` +
                '</fieldset>' +
                (pickedCandidate ? this._outcomeHtml(row) : '');
            showOptions = none;
        }

        let optionsHtml = '';
        if (showOptions) {
            const typeButtons = PICKABLE_TYPES.map((type) => {
                const pressed = choice && choice.kind === 'type' && choice.type === type;
                return `<button type="button" class="rpg-btn rpg-btn-secondary library-tidy-type-btn" data-type="${type}" data-focus-key="${key(`type:${type}`)}" aria-pressed="${pressed ? 'true' : 'false'}">${escapeHtml(BOOK_TYPE_LABELS[type])}</button>`;
            }).join('');
            let handHtml = '';
            if (ready && linked && linked !== row.preselected && !row.candidates.some((c) => c.libraryBookId === linked)) {
                handHtml = '<label class="library-tidy-match">' +
                    `<input type="checkbox" class="library-tidy-hand" data-focus-key="${key('hand')}" checked> ` +
                    `On our shelf: ${escapeHtml(this._libraryTitle(linked, row))}</label>` + this._outcomeHtml(row);
            }
            let findHtml = '';
            if (ready) {
                findHtml = `<button type="button" class="rpg-btn rpg-btn-secondary library-tidy-find-btn" data-focus-key="${key('find')}" aria-expanded="${this._searching.has(row.bookId) ? 'true' : 'false'}">Find it in the library…</button>`;
                if (this._searching.has(row.bookId)) {
                    const query = this._searching.get(row.bookId);
                    findHtml += '<div class="library-tidy-search">' +
                        `<input type="search" class="library-tidy-search-input" data-focus-key="${key('search')}" placeholder="Search the household library" aria-label="Search the household library" value="${escapeHtml(query)}" autocomplete="off">` +
                        `<div class="library-tidy-search-results">${this._searchResultsHtml(query)}</div></div>`;
                }
            }
            const dropHtml = row.protected
                ? `<span class="library-tidy-protected-note" title="${escapeHtml(PROTECTED_TOOLTIP)}">${escapeHtml(PROTECTED_TOOLTIP)}</span>`
                : `<button type="button" class="rpg-btn rpg-btn-secondary library-tidy-drop-btn" data-focus-key="${key('drop')}" aria-pressed="${choice && choice.kind === 'drop' ? 'true' : 'false'}">Drop</button>`;
            optionsHtml = handHtml +
                `<div class="library-tidy-options" role="group" aria-label="What kind of book is it?">${typeButtons}</div>` +
                `<div class="library-tidy-more">${findHtml}${dropHtml}</div>`;
        }

        return `<div class="library-tidy-row" data-book-id="${id}">` +
            `<div class="library-tidy-cover-wrap">${cover}</div>` +
            '<div class="library-tidy-main">' +
            `<div class="library-tidy-title">${escapeHtml(row.title)}</div>${author}` +
            matchHtml + optionsHtml +
            '</div></div>';
    }

    _searchResultsHtml(query) {
        const q = String(query || '').trim();
        if (!q) return '';
        const matches = searchShelf(this._readyCatalog(), q, SEARCH_LIMIT);
        if (matches.length === 0) return '<span class="book-search-empty">No books on our shelf match.</span>';
        return matches.map((libraryBook) => {
            const authors = (libraryBook.authors || []).join(', ');
            return `<button type="button" class="book-search-result-item library-tidy-search-result" data-library-book-id="${escapeHtml(libraryBook.id)}">` +
                `<span class="book-search-result-text">${escapeHtml(libraryBook.title || '')}${authors ? ` — ${escapeHtml(authors)}` : ''}</span></button>`;
        }).join('');
    }
}
