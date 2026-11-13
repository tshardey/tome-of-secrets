/**
 * Book Selector - the one shared inline component for linking a book to a quest, a curriculum
 * prompt or a book club (D7, §6.9).
 *
 * The dropdown holds up to three groups, in order:
 * 1. On our shelf (with `libraryCatalog`): household library books matching the search. Picking
 *    one finds or creates its shelf record (one step) and selects it. Hidden when signed out or
 *    without a household; never blocks the rest of the dropdown while the library loads.
 * 2. Your books: the save's own books. Shelf records whose library book is in a ready catalogue
 *    are left out (they are in group 1), so offline they can still be linked from here.
 * 3. Search online (with `onlineSearch` and a search text): a button, never search-as-you-type,
 *    then an inline type choice before the book is added.
 *
 * The selected book's chip can open a `Tags & series` panel inline in the container, so a book
 * can be tagged from inside a drawer. No modals or alert/confirm/prompt.
 * Logs never carry titles, authors or tags.
 */

import { escapeHtml } from './sanitize.js';
import { BOOK_TYPE_LABELS, PICKABLE_TYPES } from './bookTypes.js';
import { renderTagPicker, readTagPicker, applyTagPickerChanges } from './tagPicker.js';
import {
    ensureShelfRecord,
    findShelfRecord,
    searchShelf,
    listedCatalog,
    isLibraryUnhauled,
    syncShelfTags,
    fillSeriesForBook,
    isLibraryMissing
} from '../services/ShelfBookService.js';
import { toast } from '../ui/toast.js';

const SPECIAL_EDITION_TAG = 'special-edition';
const MISSING_NOTE = 'No longer in the household library';
const UNHAULED_NOTE = 'Unhauled';

/** Library books whose edition suggestion was shown on this page (shown once each). */
const suggestedEditions = new Set();

/**
 * Escape a string for use in an HTML attribute (e.g. src, data-*) inside an innerHTML template.
 * @param {string} s
 * @returns {string}
 */
function escapeAttr(s) {
    if (s == null) return '';
    return String(s)
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

function errorCode(error) {
    return (error && (error.reason || error.code || error.name)) || 'unknown';
}

function isShelfRecord(book) {
    return Boolean(book) && book.type === 'shelf' && typeof book.libraryBookId === 'string' && book.libraryBookId.trim() !== '';
}

/** An online result in the shape addBook takes; accepts searchBooks results too. */
function normalizeOnlineResult(result) {
    const r = result && typeof result === 'object' ? result : {};
    let author = '';
    if (typeof r.author === 'string') author = r.author;
    else if (Array.isArray(r.authors)) author = r.authors.filter((a) => typeof a === 'string' && a.trim()).join(', ');
    let cover = null;
    if (typeof r.cover === 'string' && r.cover) cover = r.cover;
    else if (typeof r.coverUrl === 'string' && r.coverUrl) cover = r.coverUrl;
    const pages = typeof r.pageCount === 'number' ? r.pageCount : parseInt(r.pageCount, 10);
    return {
        title: typeof r.title === 'string' ? r.title.trim() : '',
        author,
        cover,
        pageCount: Number.isFinite(pages) && pages > 0 ? pages : null
    };
}

function coverHtml(url, className, placeholderClass) {
    return url
        ? `<img class="${className}" src="${escapeAttr(url)}" alt="" loading="lazy" onerror="this.style.display='none'">`
        : `<span class="${placeholderClass}">No cover</span>`;
}

function optionHtml({ attrs, cover, title, author, note, disabled, extraClass = '' }) {
    const noteHtml = note ? `<span class="book-selector-option-note">${escapeHtml(note)}</span>` : '';
    const authorHtml = author ? `<span class="book-selector-option-author">${escapeHtml(author)}</span>` : '';
    return `
        <button type="button" class="book-selector-option${extraClass}${disabled ? ' is-disabled' : ''}" ${attrs}${disabled ? ' disabled aria-disabled="true"' : ''}>
            <span class="book-selector-option-cover-wrap">${coverHtml(cover, 'book-selector-option-cover', 'book-selector-option-placeholder')}</span>
            <span class="book-selector-option-text">
                <span class="book-selector-option-title">${escapeHtml(title || 'Untitled')}</span>
                ${authorHtml}
                ${noteHtml}
            </span>
        </button>`;
}

function groupHtml(name, heading, body) {
    const headingHtml = heading ? `<div class="book-selector-group-heading">${escapeHtml(heading)}</div>` : '';
    return `<div class="book-selector-group" data-group="${escapeAttr(name)}">${headingHtml}${body}</div>`;
}

/**
 * Create and mount a book selector in the given container.
 *
 * @param {HTMLElement} container - Element to render the selector into (will be cleared)
 * @param {Object} stateAdapter - State adapter with getBooks() and optionally getBooksByStatus(status)
 * @param {Object} options - Configuration
 * @param {string|null} [options.selectedBookId] - Initially selected book id
 * @param {string} [options.statusFilter] - 'reading' | 'completed' to filter listed books
 * @param {function(string|null): void} [options.onSelect] - Called when selection changes (bookId or null for unlink)
 * @param {string} [options.placeholder] - Button text when no book selected (default: "Link Book")
 * @param {string} [options.unlinkLabel] - Label for unlink button (default: "Unlink")
 * @param {string} [options.appendTo] - Where to mount the dropdown: 'body' (default) or 'container' (inline below trigger, for use inside drawers)
 * @param {function(Object): ({ disabled?: boolean, note?: string }|null)} [options.describeBook] - Optional per-book
 *   status: a note shown under the author, and whether the book can be picked. A shelf result is
 *   described by its existing shelf record, if any (none is created to describe it).
 * @param {Object|null} [options.libraryCatalog] - LibraryCatalogService; absent gives no shelf group
 * @param {function(string, string|undefined, AbortSignal): Promise<Object[]>} [options.onlineSearch] - e.g. searchBooks
 * @param {function(string): void} [options.onBookChanged] - after Tags & series saves
 * @param {boolean} [options.showTagsAndSeries] - default: true when libraryCatalog is given
 * @param {function(): Set<string>} [options.getApplicableTags] - tags to highlight in the tag picker
 * @returns {{ render: function(), setSelectedBookId: function(string|null), getSelectedBookId: function(): string|null, destroy: function() }}
 */
export function createBookSelector(container, stateAdapter, options = {}) {
    if (!container || !stateAdapter) {
        return {
            render: () => {},
            setSelectedBookId: () => {},
            getSelectedBookId: () => null,
            destroy: () => {}
        };
    }

    let selectedBookId = options.selectedBookId ?? null;
    const statusFilter = options.statusFilter;
    const onSelect = typeof options.onSelect === 'function' ? options.onSelect : () => {};
    const placeholder = options.placeholder ?? 'Link Book';
    const unlinkLabel = options.unlinkLabel ?? 'Unlink';
    const appendTo = options.appendTo === 'container' ? 'container' : 'body';
    const describeBook = typeof options.describeBook === 'function' ? options.describeBook : () => null;
    const libraryCatalog = options.libraryCatalog && typeof options.libraryCatalog.peek === 'function'
        ? options.libraryCatalog
        : null;
    const onlineSearch = typeof options.onlineSearch === 'function' ? options.onlineSearch : null;
    const onBookChanged = typeof options.onBookChanged === 'function' ? options.onBookChanged : () => {};
    const showTagsAndSeries = typeof options.showTagsAndSeries === 'boolean' ? options.showTagsAndSeries : Boolean(libraryCatalog);
    const getApplicableTags = typeof options.getApplicableTags === 'function' ? options.getApplicableTags : () => new Set();

    let dropdownEl = null;
    let clickOutsideHandler = null;
    let ignoreNextDocumentClick = false;
    let tagsPanelOpen = false;
    /** Per-open dropdown state; replaced on every open so a late answer can tell it is stale. */
    let view = null;

    function peekCatalog() {
        return libraryCatalog ? libraryCatalog.peek() : null;
    }

    function getBooksList() {
        let list;
        if (statusFilter && typeof stateAdapter.getBooksByStatus === 'function') {
            list = stateAdapter.getBooksByStatus(statusFilter);
        } else {
            list = typeof stateAdapter.getBooks === 'function' ? stateAdapter.getBooks() : [];
        }
        // Most recently added first, then alphabetically by title
        return [...list].sort((a, b) => {
            const dateA = a.dateAdded || '';
            const dateB = b.dateAdded || '';
            const cmp = dateB.localeCompare(dateA);
            if (cmp !== 0) return cmp;
            const titleA = (a.title || '').toLowerCase();
            const titleB = (b.title || '').toLowerCase();
            return titleA.localeCompare(titleB);
        });
    }

    function idleOnline() {
        return { phase: 'idle', results: [], controller: null, pick: null, previous: 'idle' };
    }

    function abortOnlineSearch() {
        if (view && view.online.controller) view.online.controller.abort();
    }

    function closeDropdown() {
        abortOnlineSearch();
        view = null;
        if (dropdownEl) {
            dropdownEl.remove();
            dropdownEl = null;
        }
        if (clickOutsideHandler) {
            document.removeEventListener('click', clickOutsideHandler);
            clickOutsideHandler = null;
        }
    }

    function filterBooksBySearch(books, searchTrim) {
        if (!searchTrim) return books;
        const q = searchTrim.toLowerCase();
        return books.filter((book) => {
            const title = (book.title || '').toLowerCase();
            const author = (book.author || '').toLowerCase();
            return title.includes(q) || author.includes(q);
        });
    }

    // --- group 1: On our shelf ---------------------------------------------------------

    /** The shelf results the group lists right now: none while loading or unavailable. */
    function shelfMatches(catalog, query) {
        if (!libraryCatalog || !catalog || view.retrying || catalog.status !== 'ready') return [];
        // Unhauled books are listed only while a quest links them (D10)
        return searchShelf(listedCatalog(catalog, stateAdapter), query);
    }

    /** '' when the group is hidden (signed out, no household). */
    function renderShelfGroup(catalog, query, matches) {
        const heading = 'On our shelf';
        if (!catalog || view.retrying) {
            return groupHtml('shelf', heading, '<p class="book-selector-empty book-selector-shelf-loading">Checking the household library…</p>');
        }
        if (catalog.status === 'ready') {
            if (matches.length === 0) {
                const message = query ? 'No household books match your search.' : 'No books on our shelf yet.';
                return groupHtml('shelf', heading, `<p class="book-selector-empty">${escapeHtml(message)}</p>`);
            }
            const items = matches.map((libraryBook) => {
                // Describe the existing shelf record, if any; never create one to describe it
                const record = findShelfRecord(stateAdapter, libraryBook.id);
                const status = (record && describeBook(record)) || {};
                return optionHtml({
                    attrs: `data-library-book-id="${escapeAttr(libraryBook.id)}"`,
                    cover: libraryBook.coverUrl,
                    title: libraryBook.title,
                    author: (libraryBook.authors || []).join(', '),
                    note: [status.note, libraryBook.unhauled ? UNHAULED_NOTE : ''].filter(Boolean).join(' · '),
                    disabled: status.disabled === true,
                    extraClass: ' book-selector-shelf-option'
                });
            });
            return groupHtml('shelf', heading, items.join(''));
        }
        if (catalog.status === 'unavailable') {
            return groupHtml('shelf', heading,
                '<p class="book-selector-empty book-selector-shelf-unavailable">On our shelf unavailable ' +
                '<button type="button" class="rpg-btn rpg-btn-secondary book-selector-action" data-action="retry-shelf">Retry</button></p>');
        }
        return '';
    }

    // --- group 2: Your books -----------------------------------------------------------

    function renderOwnGroup(catalog, query, grouped, matches) {
        // Leave out only the shelf records whose library book group 1 lists right now, so a
        // record beyond the 20 shown (or while the library loads) is still pickable here.
        const listed = new Set(matches.map((libraryBook) => libraryBook.id));
        const books = getBooksList().filter((book) => !(isShelfRecord(book) && listed.has(book.libraryBookId)));
        const filtered = filterBooksBySearch(books, query);
        let body;
        if (filtered.length === 0) {
            let message;
            if (query) message = grouped ? 'None of your books match your search.' : 'No books match your search.';
            else message = grouped ? 'No books of your own yet.' : 'No books in library. Add books in the Library tab first.';
            body = `<p class="book-selector-empty">${escapeHtml(message)}</p>`;
        } else {
            body = filtered.map((book) => {
                const status = describeBook(book) || {};
                const notes = [];
                if (status.note) notes.push(status.note);
                if (isLibraryMissing(book, catalog)) notes.push(MISSING_NOTE);
                if (isLibraryUnhauled(book, catalog)) notes.push(UNHAULED_NOTE);
                return optionHtml({
                    attrs: `data-book-id="${escapeAttr(book.id)}"`,
                    cover: book.cover,
                    title: book.title,
                    author: book.author,
                    note: notes.join(' · '),
                    disabled: status.disabled === true
                });
            }).join('');
        }
        return groupHtml('yours', grouped ? 'Your books' : '', body);
    }

    // --- group 3: Search online --------------------------------------------------------

    function renderOnlineGroup(query) {
        const online = view.online;
        const heading = 'Search online';
        if (online.phase === 'type') {
            const types = PICKABLE_TYPES.map((type) =>
                `<button type="button" class="rpg-btn rpg-btn-secondary book-selector-type-option" data-book-type="${escapeAttr(type)}">${escapeHtml(BOOK_TYPE_LABELS[type])}</button>`
            ).join('');
            return groupHtml('online', heading,
                '<div class="book-selector-type-choice">' +
                '<p class="book-selector-type-prompt">What kind of book is this?</p>' +
                `<p class="book-selector-type-book">${escapeHtml(online.pick.title || 'Untitled')}</p>` +
                `<div class="book-selector-type-options">${types}</div>` +
                '<button type="button" class="rpg-btn rpg-btn-secondary book-selector-action" data-action="type-back">Back</button>' +
                '</div>');
        }
        const searchButton = `<button type="button" class="rpg-btn rpg-btn-secondary book-selector-action" data-action="search-online">${escapeHtml(`Search online for "${query}"`)}</button>`;
        const addManual = `<button type="button" class="rpg-btn rpg-btn-secondary book-selector-action" data-action="add-manual">${escapeHtml(`Add "${query}" without searching`)}</button>`;
        let body;
        if (online.phase === 'searching') {
            body = '<p class="book-selector-empty">Searching…</p>';
        } else if (online.phase === 'error') {
            body = '<p class="book-selector-empty">Search failed.</p>' + searchButton;
        } else if (online.phase === 'results') {
            body = online.results.length === 0
                ? '<p class="book-selector-empty">No results online.</p>'
                : online.results.map((result, index) => optionHtml({
                    attrs: `data-online-index="${index}"`,
                    cover: result.cover,
                    title: result.title,
                    author: result.author,
                    note: result.pageCount ? `${result.pageCount} pp` : '',
                    disabled: false,
                    extraClass: ' book-selector-online-result'
                })).join('');
        } else {
            body = searchButton;
        }
        return groupHtml('online', heading, `<div class="book-selector-online-actions">${body}${addManual}</div>`);
    }

    function renderList() {
        if (!dropdownEl || !view) return;
        const listEl = dropdownEl.querySelector('.book-selector-options-list');
        if (!listEl) return;
        const query = view.query;
        const catalog = peekCatalog();
        const matches = shelfMatches(catalog, query);
        const shelfHtml = libraryCatalog ? renderShelfGroup(catalog, query, matches) : '';
        const showOnline = Boolean(onlineSearch) && (Boolean(query) || view.online.phase === 'type');
        const grouped = shelfHtml !== '' || showOnline;
        listEl.innerHTML = shelfHtml + renderOwnGroup(catalog, query, grouped, matches) + (showOnline ? renderOnlineGroup(query) : '');
    }

    /** Ask the catalogue for a current answer; the list re-renders when it lands. Never awaited. */
    function loadCatalog(force) {
        if (!libraryCatalog || !view) return;
        const current = view;
        if (force) {
            current.retrying = true;
            renderList();
        }
        let pending;
        try {
            pending = Promise.resolve(force ? libraryCatalog.getCatalog({ force: true }) : libraryCatalog.getCatalog());
        } catch (error) {
            pending = Promise.reject(error);
        }
        pending
            .catch((error) => {
                console.warn('[BookSelector] library unavailable:', errorCode(error));
            })
            .then(() => {
                if (view !== current) return;
                current.retrying = false;
                renderList();
            });
    }

    // --- picking -----------------------------------------------------------------------

    function choose(bookId) {
        selectedBookId = bookId;
        tagsPanelOpen = false;
        closeDropdown();
        onSelect(bookId);
        render();
    }

    /** §6.4: a labelled copy suggests the Special / Illuminated Edition tag, once per book. */
    function suggestSpecialEdition(libraryBook, recordId) {
        const labels = Array.isArray(libraryBook.editionLabels) ? libraryBook.editionLabels : [];
        if (labels.length === 0 || suggestedEditions.has(libraryBook.id)) return;
        const record = stateAdapter.getBook ? stateAdapter.getBook(recordId) : null;
        const tags = [...(libraryBook.tags || []), ...((record && record.tags) || [])];
        if (tags.includes(SPECIAL_EDITION_TAG)) return;
        suggestedEditions.add(libraryBook.id);
        toast.info(`This copy is labelled "${labels[0]}". Tag it Special / Illuminated Edition in Tags & series if that fits.`);
    }

    function pickShelfBook(libraryBookId) {
        const catalog = peekCatalog();
        const libraryBook = catalog && Array.isArray(catalog.books)
            ? catalog.books.find((b) => b.id === libraryBookId)
            : null;
        if (!libraryBook) return;
        const id = ensureShelfRecord(stateAdapter, libraryBook);
        if (!id) return;
        choose(id);
        suggestSpecialEdition(libraryBook, id);
    }

    function runOnlineSearch() {
        if (!view || !onlineSearch || !view.query) return;
        abortOnlineSearch();
        const current = view;
        const controller = new AbortController();
        current.online = { ...idleOnline(), phase: 'searching', controller };
        renderList();
        let pending;
        try {
            pending = Promise.resolve(onlineSearch(current.query, undefined, controller.signal));
        } catch (error) {
            pending = Promise.reject(error);
        }
        pending.then(
            (results) => {
                if (view !== current || current.online.controller !== controller || controller.signal.aborted) return;
                const list = Array.isArray(results) ? results.map(normalizeOnlineResult).filter((r) => r.title) : [];
                current.online = { ...idleOnline(), phase: 'results', results: list };
                renderList();
            },
            (error) => {
                if (view !== current || current.online.controller !== controller || (error && error.name === 'AbortError')) return;
                current.online = { ...idleOnline(), phase: 'error' };
                renderList();
            }
        );
    }

    function showTypeChoice(pick) {
        if (!view) return;
        view.online = { ...view.online, controller: null, phase: 'type', previous: view.online.phase, pick };
        renderList();
    }

    function addWithType(type) {
        if (!view || view.online.phase !== 'type' || !PICKABLE_TYPES.includes(type)) return;
        const pick = view.online.pick;
        const book = stateAdapter.addBook({
            title: pick.title,
            author: pick.author,
            cover: pick.cover,
            pageCount: pick.pageCount,
            type,
            tags: []
        });
        if (book && book.id) choose(book.id);
    }

    function handleDropdownClick(e) {
        // Re-rendering detaches the clicked node, so keep the click from reaching the
        // outside-click handler (it would close the dropdown).
        e.stopPropagation();
        const btn = e.target.closest('button');
        if (!btn || btn.disabled || !dropdownEl || !dropdownEl.contains(btn)) return;
        if (btn.hasAttribute('data-library-book-id')) {
            pickShelfBook(btn.getAttribute('data-library-book-id'));
        } else if (btn.hasAttribute('data-book-id')) {
            const id = btn.getAttribute('data-book-id');
            if (id) choose(id);
        } else if (btn.hasAttribute('data-online-index')) {
            const result = view && view.online.results[Number(btn.getAttribute('data-online-index'))];
            if (result) showTypeChoice(result);
        } else if (btn.hasAttribute('data-book-type')) {
            addWithType(btn.getAttribute('data-book-type'));
        } else {
            const action = btn.getAttribute('data-action');
            if (action === 'retry-shelf') {
                loadCatalog(true);
            } else if (action === 'search-online') {
                runOnlineSearch();
            } else if (action === 'add-manual' && view && view.query) {
                showTypeChoice({ title: view.query, author: '', cover: null, pageCount: null });
            } else if (action === 'type-back' && view) {
                const back = view.online.previous === 'results' || view.online.previous === 'error' ? view.online.previous : 'idle';
                view.online = { ...view.online, phase: back, pick: null };
                renderList();
            }
        }
    }

    function openDropdown(buttonRect) {
        closeDropdown();
        view = { query: '', retrying: false, online: idleOnline() };
        const searchHtml =
            '<div class="book-selector-search-wrap">' +
            '<input type="text" class="book-selector-search-input" placeholder="Search books…" autocomplete="off" aria-label="Search books" />' +
            '</div>';

        dropdownEl = document.createElement('div');
        dropdownEl.className = 'book-selector-dropdown';
        dropdownEl.innerHTML = searchHtml + '<div class="book-selector-options-list"></div>';

        const style = dropdownEl.style;
        style.minWidth = '220px';
        style.zIndex = '10001';

        if (appendTo === 'container') {
            // Render inside container so dropdown is visible inside drawers (no stacking-context issues)
            container.style.position = 'relative';
            style.position = 'absolute';
            style.top = '100%';
            style.left = '0';
            style.marginTop = '4px';
            container.appendChild(dropdownEl);
        } else {
            // fixed so top/left are viewport coords (match getBoundingClientRect); avoids wrong position when inside transformed/scroll containers
            style.position = 'fixed';
            style.left = `${buttonRect.left}px`;
            style.top = `${buttonRect.bottom + 4}px`;
            style.minWidth = `${Math.max(buttonRect.width, 220)}px`;
            document.body.appendChild(dropdownEl);
        }

        // Render now from what is cached; the library's answer fills in when it lands.
        renderList();
        loadCatalog(false);

        const searchInput = dropdownEl.querySelector('.book-selector-search-input');
        if (searchInput) {
            searchInput.addEventListener('input', () => {
                if (!view) return;
                view.query = (searchInput.value || '').trim();
                // A new search text starts the online group over: no request until the button
                abortOnlineSearch();
                view.online = idleOnline();
                renderList();
            });
            searchInput.addEventListener('keydown', (e) => {
                if (e.key !== 'Enter') return;
                // Never submit the surrounding form; Enter is an explicit online search
                e.preventDefault();
                if (view && view.online.phase !== 'type') runOnlineSearch();
            });
            searchInput.focus();
        }
        dropdownEl.addEventListener('click', handleDropdownClick);

        clickOutsideHandler = (e) => {
            if (ignoreNextDocumentClick) {
                ignoreNextDocumentClick = false;
                return;
            }
            if (dropdownEl && !dropdownEl.contains(e.target) && !container.contains(e.target)) {
                closeDropdown();
            }
        };
        ignoreNextDocumentClick = true;
        document.addEventListener('click', clickOutsideHandler);
    }

    // --- Tags & series -----------------------------------------------------------------

    function renderTagsPanel(book) {
        const panel = document.createElement('div');
        panel.className = 'book-selector-tags-panel';

        const pickerEl = document.createElement('div');
        pickerEl.className = 'library-tag-picker book-selector-tag-picker';
        let applicable = new Set();
        try {
            applicable = getApplicableTags() || new Set();
        } catch (error) {
            console.warn('[BookSelector] applicable tags unavailable:', errorCode(error));
        }
        renderTagPicker(pickerEl, book.tags || [], applicable);
        // Save applies a diff against this opening state (D4, D12)
        const openedTags = readTagPicker(pickerEl);
        panel.appendChild(pickerEl);

        let seriesSelect = null;
        if (typeof stateAdapter.getSeriesList === 'function' && typeof stateAdapter.getSeriesForBook === 'function') {
            const row = document.createElement('label');
            row.className = 'book-selector-series-row';
            row.appendChild(document.createTextNode('Archive series '));
            seriesSelect = document.createElement('select');
            seriesSelect.className = 'book-selector-series-select';
            const none = document.createElement('option');
            none.value = '';
            none.textContent = '— None —';
            seriesSelect.appendChild(none);
            for (const series of stateAdapter.getSeriesList() || []) {
                const option = document.createElement('option');
                option.value = series.id;
                option.textContent = series.name || 'Unnamed';
                seriesSelect.appendChild(option);
            }
            const current = stateAdapter.getSeriesForBook(book.id);
            seriesSelect.value = current ? current.id : '';
            row.appendChild(seriesSelect);
            panel.appendChild(row);
        }

        const actions = document.createElement('div');
        actions.className = 'book-selector-tags-actions';
        const save = document.createElement('button');
        save.type = 'button';
        save.className = 'rpg-btn rpg-btn-primary book-selector-tags-save';
        save.textContent = 'Save';
        save.addEventListener('click', () => saveTagsPanel(book.id, pickerEl, openedTags, seriesSelect));
        const cancel = document.createElement('button');
        cancel.type = 'button';
        cancel.className = 'rpg-btn rpg-btn-secondary book-selector-tags-cancel';
        cancel.textContent = 'Cancel';
        cancel.addEventListener('click', () => {
            tagsPanelOpen = false;
            render();
        });
        actions.appendChild(save);
        actions.appendChild(cancel);
        panel.appendChild(actions);
        return panel;
    }

    function saveTagsPanel(bookId, pickerEl, openedTags, seriesSelect) {
        const book = stateAdapter.getBook ? stateAdapter.getBook(bookId) : null;
        if (!book) return;
        // Only what the player changed is applied to the record's current tags: a tag a library
        // refresh merged in while the panel was open survives, and so do ids the picker does
        // not offer (unknown legacy ids).
        const tags = applyTagPickerChanges(book.tags || [], openedTags, readTagPicker(pickerEl));
        stateAdapter.updateBook(bookId, { tags });

        let joinedSeries = false;
        if (seriesSelect) {
            const nextId = seriesSelect.value || null;
            const current = stateAdapter.getSeriesForBook(bookId);
            const currentId = current ? current.id : null;
            if (nextId !== currentId) {
                if (currentId) stateAdapter.removeBookFromSeries(currentId, bookId);
                if (nextId) joinedSeries = stateAdapter.addBookToSeries(nextId, bookId) !== false;
            }
        }

        if (libraryCatalog && isShelfRecord(book)) {
            // Write-through (D4) and the series fill (D5) run in the background, never awaited
            Promise.resolve(syncShelfTags(stateAdapter, bookId, libraryCatalog)).catch((error) => {
                console.warn('[BookSelector] tag sync failed:', errorCode(error));
            });
            if (joinedSeries) void fillSeriesForBook(stateAdapter, bookId, libraryCatalog);
        }

        tagsPanelOpen = false;
        onBookChanged(bookId);
        render();
    }

    function render() {
        container.innerHTML = '';
        container.className = 'book-selector';

        const selectedBook =
            selectedBookId && stateAdapter.getBook
                ? stateAdapter.getBook(selectedBookId)
                : null;

        if (selectedBook) {
            const titleEsc = escapeHtml(selectedBook.title || 'Untitled');
            const authorEsc = escapeHtml(selectedBook.author || '');
            const selectedCatalog = libraryCatalog ? peekCatalog() : null;
            const missing = libraryCatalog && isLibraryMissing(selectedBook, selectedCatalog);
            const unhauled = Boolean(libraryCatalog) && isLibraryUnhauled(selectedBook, selectedCatalog);
            const tagsBtn = showTagsAndSeries
                ? `<button type="button" class="rpg-btn rpg-btn-secondary book-selector-tags-btn" aria-expanded="${tagsPanelOpen ? 'true' : 'false'}">Tags &amp; series</button>`
                : '';
            container.innerHTML = `
                <div class="book-selector-selected">
                    <span class="book-selector-selected-cover-wrap">${coverHtml(selectedBook.cover, 'book-selector-selected-cover', 'book-selector-selected-placeholder')}</span>
                    <span class="book-selector-selected-text">
                        <span class="book-selector-selected-title">${titleEsc}</span>
                        ${authorEsc ? `<span class="book-selector-selected-author">${authorEsc}</span>` : ''}
                        ${missing ? `<span class="book-selector-option-note">${escapeHtml(MISSING_NOTE)}</span>` : ''}
                        ${unhauled ? `<span class="book-selector-option-note">${escapeHtml(UNHAULED_NOTE)}</span>` : ''}
                    </span>
                    ${tagsBtn}
                    <button type="button" class="rpg-btn rpg-btn-secondary book-selector-unlink" aria-label="${escapeAttr(unlinkLabel)}">${escapeHtml(unlinkLabel)}</button>
                </div>`;
            const unlinkBtn = container.querySelector('.book-selector-unlink');
            if (unlinkBtn) {
                unlinkBtn.addEventListener('click', () => {
                    selectedBookId = null;
                    tagsPanelOpen = false;
                    onSelect(null);
                    render();
                });
            }
            const tagsButton = container.querySelector('.book-selector-tags-btn');
            if (tagsButton) {
                tagsButton.addEventListener('click', (e) => {
                    e.preventDefault();
                    tagsPanelOpen = !tagsPanelOpen;
                    render();
                });
            }
            if (showTagsAndSeries && tagsPanelOpen) container.appendChild(renderTagsPanel(selectedBook));
        } else {
            tagsPanelOpen = false;
            container.innerHTML = `
                <button type="button" class="rpg-btn rpg-btn-secondary book-selector-trigger" aria-label="${escapeAttr(placeholder)}">
                    ${escapeHtml(placeholder)}
                </button>`;
            const trigger = container.querySelector('.book-selector-trigger');
            if (trigger) {
                // Use capture so this runs before any parent handler (e.g. form delegated click)
                trigger.addEventListener('click', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    openDropdown(trigger.getBoundingClientRect());
                }, true);
            }
        }
    }

    function setSelectedBookId(id) {
        selectedBookId = id ?? null;
        tagsPanelOpen = false;
        render();
    }

    function getSelectedBookId() {
        return selectedBookId;
    }

    function destroy() {
        closeDropdown();
        tagsPanelOpen = false;
        container.innerHTML = '';
    }

    render();
    return { render, setSelectedBookId, getSelectedBookId, destroy };
}
