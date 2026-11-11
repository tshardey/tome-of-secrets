/**
 * LibraryController - Handles Library tab: add/edit books, search, render book cards
 *
 * - Add Book: inline form, type first (Audiobook, Ebook, Library book, Not in the library yet), then title, author, cover, page count
 * - Book cards grouped by type (Unsorted, Audiobooks, Ebooks, Library books, Not in the library yet) plus Completed by year
 * - Edit Book: right-side drawer with the type select + read-only linked quests/prompts
 */

import { BaseController } from './BaseController.js';
import { BOOK_TYPES, PICKABLE_TYPES, BOOK_TYPE_LABELS } from '../utils/bookTypes.js';
import { STATE_EVENTS } from '../character-sheet/stateAdapter.js';
import { searchBooks } from '../services/BookMetadataService.js';
import { resolveLibraryCatalog } from '../services/LibraryCatalogService.js';
import {
    searchShelf,
    syncShelfTags,
    fillSeriesForBook,
    linkPhysicalToShelf,
    dismissShelfOffer,
    unlinkFromLibrary,
    isLibraryMissing
} from '../services/ShelfBookService.js';
import { renderTagPicker, readTagPicker, applyTagPickerChanges } from '../utils/tagPicker.js';
import { allItems, keeperBackgrounds, schoolBenefits, masteryAbilities, temporaryBuffsFromRewards, temporaryBuffs } from '../character-sheet/data.js';
import { trimOrEmpty } from '../utils/helpers.js';
import { DrawerManager } from '../ui/DrawerManager.js';
import { getUnlinkedActiveQuests, linkExistingQuestToBook, createExtraCreditForBook, getQuestLinkRefusal } from '../utils/questBookLinker.js';
import { toast } from '../ui/toast.js';
import { getApplicableTagIds } from '../utils/applicableTagIds.js';
import { buildEffectContext } from '../services/effectContext.js';

const BOOK_SEARCH_DEBOUNCE_MS = 600;
const BOOK_SEARCH_MIN_LENGTH = 2;

// Library tab sections, in order. Each renders into `library-cards-<type>`;
// a hideWhenEmpty section is hidden instead of showing "None".
const TYPE_SECTIONS = [
    { type: 'unsorted', hideWhenEmpty: true },
    { type: 'audiobook', hideWhenEmpty: false },
    { type: 'ebook', hideWhenEmpty: false },
    { type: 'library-loan', hideWhenEmpty: false },
    { type: 'physical', hideWhenEmpty: true }
];

const UNLINK_OPTION_VALUE = 'unlink';

function errorCode(error) {
    return (error && (error.reason || error.code || error.name)) || 'unknown';
}

function isShelfRecord(book) {
    return Boolean(book) && book.type === 'shelf' && typeof book.libraryBookId === 'string' && book.libraryBookId.trim() !== '';
}

export class LibraryController extends BaseController {
    constructor(stateAdapter, form, dependencies) {
        super(stateAdapter, form, dependencies);
        this._searchAbortController = null;
        this._editSearchAbortController = null;
        this._editingBookId = null;
        this._linkQuestPopoverEl = null;
        this._linkQuestOutsideClickHandler = null;
        this._linkQuestEscHandler = null;
        /** "Found on our shelf" offers: ToS book id -> library book (D7). Never automatic. */
        this._shelfOffers = new Map();
        this._libraryCatalog = resolveLibraryCatalog(this.dependencies);
        this._unsubscribeCatalog = null;
        this._shelfSearchToken = 0;
    }

    initialize() {
        const form = this.form;
        if (!form) return;

        this.renderBooks();

        const addForm = document.getElementById('library-add-book-form');
        const addBookBtn = document.getElementById('library-add-book-btn');
        const searchBtn = document.getElementById('library-book-search-btn');
        const searchResults = document.getElementById('library-book-search-results');
        const titleInput = document.getElementById('library-book-title');
        const authorInput = document.getElementById('library-book-author');

        const saveBookEditBtn = document.getElementById('save-book-edit-btn');
        const cancelBookEditBtn = document.getElementById('cancel-book-edit-btn');

        this.drawerManager = new DrawerManager({
            'book-edit': {
                backdrop: 'book-edit-backdrop',
                drawer: 'book-edit-drawer',
                closeBtn: 'close-book-edit',
                onAfterClose: (drawerEl) => {
                    this._editingBookId = null;
                }
            }
        });

        this._syncAddButton();
        document.querySelectorAll('input[name="library-add-type"]').forEach((radio) => {
            this.addEventListener(radio, 'change', () => this._syncAddButton());
        });

        if (addBookBtn) {
            this.addEventListener(addBookBtn, 'click', (e) => {
                e.preventDefault();
                this.handleAddBook();
            });
        }

        if (searchBtn && titleInput && searchResults) {
            this.addEventListener(searchBtn, 'click', () => {
                this._runBookSearch(trimOrEmpty(titleInput.value), trimOrEmpty(authorInput?.value || ''), searchResults);
            });
            let debounceTimer = null;
            this.addEventListener(titleInput, 'input', () => {
                clearTimeout(debounceTimer);
                const q = trimOrEmpty(titleInput.value);
                if (q.length < BOOK_SEARCH_MIN_LENGTH) {
                    searchResults.style.display = 'none';
                    searchResults.innerHTML = '';
                    return;
                }
                debounceTimer = setTimeout(() => {
                    this._runBookSearch(q, trimOrEmpty(authorInput?.value || ''), searchResults);
                }, BOOK_SEARCH_DEBOUNCE_MS);
            });
        }

        renderTagPicker(document.getElementById('library-add-tags'), [], this._getApplicableTagIds());

        this._setupAddFormCoverHandlers();

        if (cancelBookEditBtn) {
            this.addEventListener(cancelBookEditBtn, 'click', () => this.drawerManager.close('book-edit'));
        }
        if (saveBookEditBtn) {
            this.addEventListener(saveBookEditBtn, 'click', () => this.handleSaveBookEdit());
        }

        this._setupBookEditCoverHandlers();
        this._setupBookEditSearch();

        form.addEventListener('click', (e) => {
            const editBtn = e.target.closest('.library-edit-book-btn');
            const markCompleteBtn = e.target.closest('.library-mark-complete-btn');
            const linkQuestBtn = e.target.closest('.library-link-quest-btn');
            const offerLinkBtn = e.target.closest('.library-offer-link-btn');
            const offerDismissBtn = e.target.closest('.library-offer-dismiss-btn');
            if (offerLinkBtn && offerLinkBtn.dataset.bookId) {
                e.preventDefault();
                this.handleLinkShelfOffer(offerLinkBtn.dataset.bookId);
                return;
            }
            if (offerDismissBtn && offerDismissBtn.dataset.bookId) {
                e.preventDefault();
                this.handleDismissShelfOffer(offerDismissBtn.dataset.bookId);
                return;
            }
            if (linkQuestBtn && linkQuestBtn.dataset.bookId) {
                e.preventDefault();
                this._openLinkQuestPopover(linkQuestBtn, linkQuestBtn.dataset.bookId);
                return;
            }
            if (editBtn && editBtn.dataset.bookId) {
                e.preventDefault();
                this.handleEditBook(editBtn.dataset.bookId);
                return;
            }
            if (markCompleteBtn && markCompleteBtn.dataset.bookId) {
                e.preventDefault();
                this.handleMarkComplete(markCompleteBtn.dataset.bookId);
                return;
            }
        });

        this.stateAdapter.on(STATE_EVENTS.BOOKS_CHANGED, () => {
            this.renderBooks();
        });

        // Each catalogue load can mark a shelf book as missing from the household library
        if (this._libraryCatalog && typeof this._libraryCatalog.subscribe === 'function') {
            this._unsubscribeCatalog = this._libraryCatalog.subscribe(() => this.renderBooks());
        }

        this._onBookMarkedComplete = this.dependencies.onBookMarkedComplete || null;
    }

    _runBookSearch(query, author, resultsContainer) {
        if (!query || !resultsContainer) return;
        if (this._searchAbortController) this._searchAbortController.abort();
        this._searchAbortController = new AbortController();
        const signal = this._searchAbortController.signal;
        resultsContainer.innerHTML =
            '<div class="library-shelf-results"></div>' +
            '<div class="library-online-results"><span class="book-search-loading">Searching…</span></div>';
        resultsContainer.style.display = 'block';
        const onlineContainer = resultsContainer.querySelector('.library-online-results');
        this._renderShelfSearchResults(query, resultsContainer);

        searchBooks(query, author || undefined, signal)
            .then((results) => {
                if (signal.aborted) return;
                this._renderSearchResults(results, onlineContainer, resultsContainer);
            })
            .catch((err) => {
                if (err.name === 'AbortError') return;
                onlineContainer.innerHTML = '<span class="book-search-error">Search failed.</span>';
                resultsContainer.style.display = 'block';
            });
    }

    /**
     * The Add form's "On our shelf" results (§6.3): household books are linked from a quest, so
     * they carry the note and no add button. Painted from the cached catalogue at once, then from
     * the library's answer; never blocks the online results.
     */
    _renderShelfSearchResults(query, resultsContainer) {
        const catalogService = this._libraryCatalog;
        if (!catalogService) return;
        const token = ++this._shelfSearchToken;
        const paint = (catalog) => {
            if (token !== this._shelfSearchToken) return;
            const target = resultsContainer.querySelector('.library-shelf-results');
            if (!target) return;
            const matches = searchShelf(catalog, query);
            if (matches.length === 0) {
                target.innerHTML = '';
                return;
            }
            target.innerHTML =
                '<div class="library-shelf-results-heading">On our shelf</div>' +
                matches.map((libraryBook) => {
                    const authors = (libraryBook.authors || []).join(', ');
                    const cover = libraryBook.coverUrl
                        ? `<img class="book-search-result-cover" src="${this._escapeAttr(libraryBook.coverUrl)}" alt="">`
                        : '';
                    const authorHtml = authors ? ` — ${this._escapeHtml(authors)}` : '';
                    return `<div class="library-shelf-result">${cover}` +
                        `<span class="book-search-result-text">${this._escapeHtml(libraryBook.title || '')}${authorHtml}</span>` +
                        '<span class="library-shelf-result-note">Link it from a quest</span></div>';
                }).join('');
        };
        paint(catalogService.peek());
        Promise.resolve()
            .then(() => catalogService.getCatalog())
            .then(paint)
            .catch((error) => console.warn('[Library] shelf search unavailable:', errorCode(error)));
    }

    _renderSearchResults(results, container, outer = container) {
        container.innerHTML = '';
        if (!results || results.length === 0) {
            container.innerHTML = '<span class="book-search-empty">No results.</span>';
            outer.style.display = 'block';
            return;
        }
        results.forEach((book) => {
            const authorStr = Array.isArray(book.authors) && book.authors.length ? book.authors.join(', ') : '';
            const pageStr = book.pageCount != null && book.pageCount !== '' ? ` · ${Number(book.pageCount)} pp` : '';
            const item = document.createElement('button');
            item.type = 'button';
            item.className = 'book-search-result-item';
            if (book.coverUrl) {
                const img = document.createElement('img');
                img.className = 'book-search-result-cover';
                img.src = book.coverUrl;
                img.alt = '';
                item.appendChild(img);
            }
            const text = document.createElement('span');
            text.className = 'book-search-result-text';
            text.textContent = `${book.title}${authorStr ? ` — ${authorStr}` : ''}${pageStr}`;
            item.appendChild(text);
            item.addEventListener('click', () => {
                this._applySearchResultToAddForm(book);
                this._shelfSearchToken += 1;
                outer.style.display = 'none';
                outer.innerHTML = '';
            });
            container.appendChild(item);
        });
        outer.style.display = 'block';
    }

    _applySearchResultToAddForm(book) {
        const titleEl = document.getElementById('library-book-title');
        const authorEl = document.getElementById('library-book-author');
        const authorStr = Array.isArray(book.authors) && book.authors.length ? book.authors.join(', ') : '';
        if (titleEl) titleEl.value = book.title || '';
        if (authorEl) authorEl.value = authorStr || '';
        const pageCountEl = document.getElementById('library-add-page-count');
        if (pageCountEl && book.pageCount != null && book.pageCount !== '') {
            pageCountEl.value = String(Number(book.pageCount));
        }
        const coverUrl = book.coverUrl || '';
        this._setAddFormCover(coverUrl, coverUrl);
    }

    _setupBookEditSearch() {
        const searchBtn = document.getElementById('book-edit-search-btn');
        const searchInput = document.getElementById('book-edit-search-query');
        const searchResults = document.getElementById('book-edit-search-results');
        const titleInput = document.getElementById('book-edit-title');
        const authorInput = document.getElementById('book-edit-author');
        if (!searchResults) return;

        const runSearch = () => {
            const explicit = trimOrEmpty(searchInput?.value || '');
            const titleVal = trimOrEmpty(titleInput?.value || '');
            const authorVal = trimOrEmpty(authorInput?.value || '');
            const query = explicit || titleVal;
            const author = explicit ? '' : authorVal;
            if (!query || query.length < BOOK_SEARCH_MIN_LENGTH) {
                searchResults.style.display = 'none';
                searchResults.innerHTML = '';
                return;
            }
            this._runBookSearchEdit(query, author, searchResults);
        };

        if (searchBtn) {
            this.addEventListener(searchBtn, 'click', () => {
                runSearch();
            });
        }

        let debounceTimer = null;
        const debouncedRun = () => {
            clearTimeout(debounceTimer);
            debounceTimer = setTimeout(runSearch, BOOK_SEARCH_DEBOUNCE_MS);
        };

        if (searchInput) {
            this.addEventListener(searchInput, 'input', debouncedRun);
        }
        if (titleInput) {
            this.addEventListener(titleInput, 'input', debouncedRun);
        }
    }

    _runBookSearchEdit(query, author, resultsContainer) {
        if (!query || !resultsContainer) return;
        if (this._editSearchAbortController) this._editSearchAbortController.abort();
        this._editSearchAbortController = new AbortController();
        const signal = this._editSearchAbortController.signal;
        resultsContainer.innerHTML = '<span class="book-search-loading">Searching…</span>';
        resultsContainer.style.display = 'block';

        searchBooks(query, author || undefined, signal)
            .then((results) => {
                if (signal.aborted) return;
                this._renderEditSearchResults(results, resultsContainer);
            })
            .catch((err) => {
                if (err.name === 'AbortError') return;
                resultsContainer.innerHTML = '<span class="book-search-error">Search failed.</span>';
                resultsContainer.style.display = 'block';
            });
    }

    _renderEditSearchResults(results, container) {
        container.innerHTML = '';
        if (!results || results.length === 0) {
            container.innerHTML = '<span class="book-search-empty">No results.</span>';
            container.style.display = 'block';
            return;
        }
        results.forEach((book) => {
            const authorStr = Array.isArray(book.authors) && book.authors.length ? book.authors.join(', ') : '';
            const pageStr = book.pageCount != null && book.pageCount !== '' ? ` · ${Number(book.pageCount)} pp` : '';
            const item = document.createElement('button');
            item.type = 'button';
            item.className = 'book-search-result-item';
            if (book.coverUrl) {
                const img = document.createElement('img');
                img.className = 'book-search-result-cover';
                img.src = book.coverUrl;
                img.alt = '';
                item.appendChild(img);
            }
            const text = document.createElement('span');
            text.className = 'book-search-result-text';
            text.textContent = `${book.title}${authorStr ? ` — ${authorStr}` : ''}${pageStr}`;
            item.appendChild(text);
            item.addEventListener('click', () => {
                this._applySearchResultToEditForm(book);
                container.style.display = 'none';
                container.innerHTML = '';
            });
            container.appendChild(item);
        });
        container.style.display = 'block';
    }

    _applySearchResultToEditForm(book) {
        const titleEl = document.getElementById('book-edit-title');
        const authorEl = document.getElementById('book-edit-author');
        const pageCountEl = document.getElementById('book-edit-page-count');
        const authorStr = Array.isArray(book.authors) && book.authors.length ? book.authors.join(', ') : '';
        if (titleEl) titleEl.value = book.title || '';
        if (authorEl) authorEl.value = authorStr || '';
        if (pageCountEl && book.pageCount != null && book.pageCount !== '') {
            pageCountEl.value = String(Number(book.pageCount));
        } else if (pageCountEl) {
            pageCountEl.value = '';
        }
        const coverUrl = book.coverUrl || '';
        const valueEl = document.getElementById('book-edit-cover-value');
        const urlEl = document.getElementById('book-edit-cover-url');
        const preview = document.getElementById('book-edit-cover-preview');
        const placeholder = document.getElementById('book-edit-cover-placeholder');
        const v = (coverUrl || '').trim() || '';
        if (valueEl) valueEl.value = v;
        if (urlEl) urlEl.value = coverUrl && !coverUrl.startsWith('data:') ? coverUrl : '';
        if (preview) {
            if (v) {
                preview.src = v;
                preview.style.display = 'block';
                if (placeholder) placeholder.style.display = 'none';
            } else {
                preview.src = '';
                preview.style.display = 'none';
                if (placeholder) placeholder.style.display = 'inline';
            }
        }
        const searchInput = document.getElementById('book-edit-search-query');
        if (searchInput) searchInput.value = '';
    }

    _setAddFormCover(value, urlInputValue = null) {
        const valueEl = document.getElementById('library-add-cover-value');
        const urlEl = document.getElementById('library-add-cover-url');
        const preview = document.getElementById('library-add-cover-preview');
        const placeholder = document.getElementById('library-add-cover-placeholder');
        const v = (value || '').trim() || '';
        if (valueEl) valueEl.value = v;
        if (urlEl && urlInputValue !== undefined) {
            urlEl.value = urlInputValue !== null && !urlInputValue.startsWith('data:') ? urlInputValue : '';
        }
        if (preview) {
            if (v) {
                preview.src = v;
                preview.alt = 'Book cover';
                preview.style.display = 'block';
                if (placeholder) placeholder.style.display = 'none';
            } else {
                preview.src = '';
                preview.style.display = 'none';
                if (placeholder) placeholder.style.display = 'inline';
            }
        }
    }

    _setupAddFormCoverHandlers() {
        const urlEl = document.getElementById('library-add-cover-url');
        const uploadEl = document.getElementById('library-add-cover-upload');
        if (urlEl) {
            this.addEventListener(urlEl, 'change', () => {
                const v = (urlEl.value || '').trim();
                this._setAddFormCover(v, v);
            });
        }
        if (uploadEl) {
            this.addEventListener(uploadEl, 'change', () => {
                const file = uploadEl.files && uploadEl.files[0];
                if (!file || !file.type.startsWith('image/')) return;
                const reader = new FileReader();
                reader.onload = () => {
                    this._setAddFormCover(reader.result, null);
                };
                reader.readAsDataURL(file);
            });
        }
    }

    _setupBookEditCoverHandlers() {
        const urlEl = document.getElementById('book-edit-cover-url');
        const uploadEl = document.getElementById('book-edit-cover-upload');
        const valueEl = document.getElementById('book-edit-cover-value');
        if (!valueEl) return;

        const setEditCover = (value, urlInputValue = null) => {
            const preview = document.getElementById('book-edit-cover-preview');
            const placeholder = document.getElementById('book-edit-cover-placeholder');
            const v = (value || '').trim() || '';
            valueEl.value = v;
            if (urlEl && urlInputValue !== undefined) {
                urlEl.value = urlInputValue !== null && !urlInputValue.startsWith('data:') ? urlInputValue : '';
            }
            if (preview) {
                if (v) {
                    preview.src = v;
                    preview.style.display = 'block';
                    if (placeholder) placeholder.style.display = 'none';
                } else {
                    preview.src = '';
                    preview.style.display = 'none';
                    if (placeholder) placeholder.style.display = 'inline';
                }
            }
        };

        if (urlEl) {
            this.addEventListener(urlEl, 'change', () => {
                const v = (urlEl.value || '').trim();
                setEditCover(v, v);
            });
        }
        if (uploadEl) {
            this.addEventListener(uploadEl, 'change', () => {
                const file = uploadEl.files && uploadEl.files[0];
                if (!file || !file.type.startsWith('image/')) return;
                const reader = new FileReader();
                reader.onload = () => {
                    setEditCover(reader.result, null);
                };
                reader.readAsDataURL(file);
            });
        }
    }

    _getAddType() {
        const typeRadio = document.querySelector('input[name="library-add-type"]:checked');
        return typeRadio && PICKABLE_TYPES.includes(typeRadio.value) ? typeRadio.value : null;
    }

    /** Add Book stays disabled until a type is chosen. */
    _syncAddButton() {
        const btn = document.getElementById('library-add-book-btn');
        if (btn) btn.disabled = !this._getAddType();
    }

    handleAddBook() {
        const type = this._getAddType();
        if (!type) return;
        const titleEl = document.getElementById('library-book-title');
        const title = trimOrEmpty(titleEl?.value);
        if (!title) return;

        const authorEl = document.getElementById('library-book-author');
        const author = trimOrEmpty(authorEl?.value || '');

        const coverValueEl = document.getElementById('library-add-cover-value');
        const coverUrlEl = document.getElementById('library-add-cover-url');
        let cover = (coverValueEl?.value || '').trim() || null;
        if (!cover && (coverUrlEl?.value || '').trim()) {
            cover = (coverUrlEl.value || '').trim();
        }
        if (!cover) cover = null;

        const pageCountEl = document.getElementById('library-add-page-count');
        const pageCountRaw = pageCountEl?.value;
        const pageCount = pageCountRaw !== '' && pageCountRaw != null ? parseInt(pageCountRaw, 10) : null;
        const pageCountNum = typeof pageCount === 'number' && !isNaN(pageCount) && pageCount > 0 ? pageCount : null;

        const tags = readTagPicker(document.getElementById('library-add-tags'));

        const book = this.stateAdapter.addBook({
            title,
            author,
            cover,
            pageCount: pageCountNum,
            type,
            tags
        });
        if (book) {
            this._clearAddForm();
            this.renderBooks();
            this.saveState();
        }
    }

    _clearAddForm() {
        const titleEl = document.getElementById('library-book-title');
        const authorEl = document.getElementById('library-book-author');
        const coverUrlEl = document.getElementById('library-add-cover-url');
        const coverValueEl = document.getElementById('library-add-cover-value');
        const pageCountEl = document.getElementById('library-add-page-count');
        const uploadEl = document.getElementById('library-add-cover-upload');
        if (titleEl) titleEl.value = '';
        if (authorEl) authorEl.value = '';
        if (coverUrlEl) coverUrlEl.value = '';
        if (coverValueEl) coverValueEl.value = '';
        if (pageCountEl) pageCountEl.value = '';
        if (uploadEl) uploadEl.value = '';
        this._setAddFormCover('', '');
        document.querySelectorAll('input[name="library-add-type"]').forEach((radio) => { radio.checked = false; });
        this._syncAddButton();
        renderTagPicker(document.getElementById('library-add-tags'), [], this._getApplicableTagIds());
    }

    handleEditBook(bookId) {
        const book = this.stateAdapter.getBook(bookId);
        if (!book) return;

        this._editingBookId = bookId;

        const idEl = document.getElementById('book-edit-id');
        const titleEl = document.getElementById('book-edit-title');
        const authorEl = document.getElementById('book-edit-author');
        const pageCountEl = document.getElementById('book-edit-page-count');
        const linksSection = document.getElementById('book-edit-links-section');
        const valueEl = document.getElementById('book-edit-cover-value');

        if (idEl) idEl.value = book.id;
        if (titleEl) titleEl.value = book.title || '';
        if (authorEl) authorEl.value = book.author || '';
        if (pageCountEl) {
            pageCountEl.value = book.pageCount != null && !isNaN(book.pageCount) ? String(book.pageCount) : '';
        }
        this._renderTypeSelect(book);

        const dateCompletedEl = document.getElementById('book-edit-date-completed');
        if (dateCompletedEl) {
            if (book.dateCompleted && typeof book.dateCompleted === 'string') {
                try {
                    const d = new Date(book.dateCompleted);
                    if (!isNaN(d.getTime())) {
                        dateCompletedEl.value = d.toISOString().slice(0, 10);
                    } else {
                        dateCompletedEl.value = '';
                    }
                } catch (_) {
                    dateCompletedEl.value = '';
                }
            } else {
                dateCompletedEl.value = '';
            }
        }

        if (valueEl) valueEl.value = book.cover || '';
        const preview = document.getElementById('book-edit-cover-preview');
        const placeholder = document.getElementById('book-edit-cover-placeholder');
        const urlEl = document.getElementById('book-edit-cover-url');
        if (preview) {
            if (book.cover && !book.cover.startsWith('data:')) {
                preview.src = book.cover;
                preview.style.display = 'block';
                if (placeholder) placeholder.style.display = 'none';
            } else if (book.cover) {
                preview.src = book.cover;
                preview.style.display = 'block';
                if (placeholder) placeholder.style.display = 'none';
            } else {
                preview.src = '';
                preview.style.display = 'none';
                if (placeholder) placeholder.style.display = 'inline';
            }
        }
        if (urlEl) urlEl.value = book.cover && !book.cover.startsWith('data:') ? book.cover : '';

        const uploadEl = document.getElementById('book-edit-cover-upload');
        if (uploadEl) uploadEl.value = '';

        if (linksSection) linksSection.style.display = 'block';
        this._renderDrawerLinksSection(bookId);

        const searchQueryEl = document.getElementById('book-edit-search-query');
        const searchResultsEl = document.getElementById('book-edit-search-results');
        if (searchQueryEl) searchQueryEl.value = '';
        if (searchResultsEl) {
            searchResultsEl.style.display = 'none';
            searchResultsEl.innerHTML = '';
        }

        const tagPickerEl = document.getElementById('book-edit-tags');
        renderTagPicker(tagPickerEl, book.tags || [], this._getApplicableTagIds());
        // Save applies a diff against this, so a tag a refresh adds while open survives
        this._editTagsOpened = readTagPicker(tagPickerEl);

        // Series (campaign) selector: tag this book to a series
        const seriesSelect = document.getElementById('book-edit-series');
        if (seriesSelect) {
            const currentSeries = this.stateAdapter.getSeriesForBook(bookId);
            const seriesList = this.stateAdapter.getSeriesList();
            seriesSelect.innerHTML = '<option value="">— None —</option>' +
                seriesList.map((s) => `<option value="${this._escapeAttr(s.id)}">${this._escapeHtml(s.name || 'Unnamed')}</option>`).join('');
            seriesSelect.value = currentSeries ? currentSeries.id : '';
        }

        this.drawerManager.open('book-edit');
    }

    /**
     * Fill the drawer's type select. A shelf book (linked to the household library) shows
     * `On our shelf` plus `Unlink from the library`; every other book offers the four
     * pickable types, plus Unsorted while it is unsorted.
     */
    _renderTypeSelect(book) {
        const select = document.getElementById('book-edit-type');
        if (!select) return;
        const isShelf = book.type === 'shelf';
        const options = isShelf
            ? [['shelf', BOOK_TYPE_LABELS.shelf], [UNLINK_OPTION_VALUE, 'Unlink from the library']]
            : [
                ...(PICKABLE_TYPES.includes(book.type) ? [] : [['unsorted', BOOK_TYPE_LABELS.unsorted]]),
                ...PICKABLE_TYPES.map((t) => [t, BOOK_TYPE_LABELS[t]])
            ];
        select.innerHTML = options
            .map(([value, label]) => `<option value="${this._escapeAttr(value)}">${this._escapeHtml(label)}</option>`)
            .join('');
        select.value = options.some(([v]) => v === book.type) ? book.type : options[0][0];
    }

    /** Whether the drawer's type select asks to unlink a shelf book from the library. */
    _isUnlinkSelected() {
        return document.getElementById('book-edit-type')?.value === UNLINK_OPTION_VALUE;
    }

    /** The updateBook fields for the drawer's type select (Unlink goes through unlinkFromLibrary). */
    _readTypeSelect() {
        const value = document.getElementById('book-edit-type')?.value;
        if (!value || value === UNLINK_OPTION_VALUE) return {};
        return BOOK_TYPES.includes(value) ? { type: value } : {};
    }

    _closeBookEditDrawer() {
        this.drawerManager.close('book-edit');
    }

    handleSaveBookEdit() {
        const bookId = document.getElementById('book-edit-id')?.value;
        if (!bookId || !this.stateAdapter.getBook(bookId)) {
            this._closeBookEditDrawer();
            return;
        }

        const title = trimOrEmpty(document.getElementById('book-edit-title')?.value);
        if (!title) return;

        const author = trimOrEmpty(document.getElementById('book-edit-author')?.value || '');
        const valueEl = document.getElementById('book-edit-cover-value');
        const urlEl = document.getElementById('book-edit-cover-url');
        let cover = (valueEl?.value || '').trim() || null;
        if (!cover && (urlEl?.value || '').trim()) cover = (urlEl.value || '').trim();
        if (!cover) cover = null;

        const pageCountEl = document.getElementById('book-edit-page-count');
        const pageCountRaw = pageCountEl?.value;
        const pageCount = pageCountRaw !== '' && pageCountRaw != null ? parseInt(pageCountRaw, 10) : null;
        const pageCountNum = typeof pageCount === 'number' && !isNaN(pageCount) && pageCount > 0 ? pageCount : null;

        const dateCompletedInput = document.getElementById('book-edit-date-completed');
        let dateCompleted = null;
        if (dateCompletedInput && dateCompletedInput.value && dateCompletedInput.value.trim()) {
            const dateStr = dateCompletedInput.value.trim();
            const parsed = new Date(dateStr + 'T12:00:00Z');
            if (!isNaN(parsed.getTime())) dateCompleted = parsed.toISOString();
        }

        // Update series (campaign) tagging
        let joinedSeries = false;
        const seriesSelect = document.getElementById('book-edit-series');
        if (seriesSelect) {
            const newSeriesId = (seriesSelect.value || '').trim() || null;
            const currentSeries = this.stateAdapter.getSeriesForBook(bookId);
            const currentSeriesId = currentSeries ? currentSeries.id : null;
            if (newSeriesId !== currentSeriesId) {
                if (currentSeriesId) this.stateAdapter.removeBookFromSeries(currentSeriesId, bookId);
                if (newSeriesId) joinedSeries = this.stateAdapter.addBookToSeries(newSeriesId, bookId) !== false;
            }
        }

        // A diff against the picker's opening state, applied to the record's current tags: a tag
        // a library refresh merged in while the drawer was open is kept (D4, D12), and so are
        // ids the picker does not offer.
        const tags = applyTagPickerChanges(
            this.stateAdapter.getBook(bookId)?.tags || [],
            this._editTagsOpened || [],
            readTagPicker(document.getElementById('book-edit-tags'))
        );
        const unlinking = this._isUnlinkSelected();

        const updates = {
            title,
            author,
            cover,
            pageCount: pageCountNum,
            dateCompleted,
            tags
        };
        Object.assign(updates, this._readTypeSelect());
        this.stateAdapter.updateBook(bookId, updates);
        if (unlinking) {
            // Undoes a wrong review match: the book goes back to `physical`, and the match is
            // remembered as dismissed (D7). Nothing is pushed to the library.
            unlinkFromLibrary(this.stateAdapter, bookId);
        } else {
            this._syncShelfBook(bookId, joinedSeries);
        }
        this._closeBookEditDrawer();
        this.renderBooks();
        this.saveState();
    }

    /**
     * After a drawer save of a shelf book: push its shared tags (write-through, D4) and, when
     * it just joined a series, fill the library's empty series name (D5). Never awaited.
     */
    _syncShelfBook(bookId, joinedSeries) {
        const catalog = this._libraryCatalog;
        if (!catalog || !isShelfRecord(this.stateAdapter.getBook(bookId))) return;
        Promise.resolve(syncShelfTags(this.stateAdapter, bookId, catalog))
            .catch((error) => console.warn('[Library] tag sync failed:', errorCode(error)));
        if (joinedSeries) void fillSeriesForBook(this.stateAdapter, bookId, catalog);
    }

    destroy() {
        if (this._unsubscribeCatalog) this._unsubscribeCatalog();
        this._unsubscribeCatalog = null;
        super.destroy();
    }

    /**
     * Show "Found on our shelf — link it?" on these physical books (from startLibrarySync).
     * @param {Array<{ bookId: string, libraryBook: Object }>} offers
     */
    setShelfOffers(offers) {
        this._shelfOffers = new Map(
            (Array.isArray(offers) ? offers : [])
                .filter((offer) => offer && offer.bookId && offer.libraryBook)
                .map((offer) => [offer.bookId, offer.libraryBook])
        );
        this.renderBooks();
    }

    /** `Link`: the physical book becomes a shelf record in place (D7). */
    handleLinkShelfOffer(bookId) {
        const libraryBook = this._shelfOffers.get(bookId);
        if (!libraryBook) return;
        this._shelfOffers.delete(bookId);
        const pending = linkPhysicalToShelf(this.stateAdapter, bookId, libraryBook, this._libraryCatalog || undefined);
        this.renderBooks();
        Promise.resolve(pending)
            .catch((error) => console.warn('[Library] link failed:', errorCode(error)))
            .then((linkedId) => {
                if (linkedId) toast.success('Linked to the household library');
                this.saveState();
                this.renderBooks();
            });
    }

    /** `Not this one`: that library book is not offered for this book again. */
    handleDismissShelfOffer(bookId) {
        const libraryBook = this._shelfOffers.get(bookId);
        if (!libraryBook) return;
        this._shelfOffers.delete(bookId);
        dismissShelfOffer(this.stateAdapter, bookId, libraryBook.id);
        this.renderBooks();
        this.saveState();
    }

    handleMarkComplete(bookId) {
        const book = this.stateAdapter.getBook(bookId);
        if (!book || book.status === 'completed') return;
        const result = this.stateAdapter.markBookComplete(bookId);
        if (!result) return;
        if (this._onBookMarkedComplete) {
            this._onBookMarkedComplete(result);
        }
        this.renderBooks();
        this.saveState();
    }

    _sortBooksForDisplay(books) {
        if (!books || !books.length) return [];
        return [...books].sort((a, b) => {
            const dateA = a.dateAdded || '';
            const dateB = b.dateAdded || '';
            const cmp = dateB.localeCompare(dateA);
            if (cmp !== 0) return cmp;
            const titleA = (a.title || '').toLowerCase();
            const titleB = (b.title || '').toLowerCase();
            return titleA.localeCompare(titleB);
        });
    }

    /**
     * Group completed books by completion year (from dateCompleted), most recent first.
     * Books without dateCompleted are grouped under "Unknown".
     * @returns {Array<{ year: string, books: Object[] }>}
     */
    _groupCompletedBooksByYear(completedBooks) {
        if (!completedBooks || completedBooks.length === 0) return [];
        const byYear = new Map();
        for (const book of completedBooks) {
            const dateStr = book.dateCompleted || book.dateAdded || '';
            const year = dateStr ? String(new Date(dateStr).getFullYear()) : 'Unknown';
            if (!byYear.has(year)) byYear.set(year, []);
            byYear.get(year).push(book);
        }
        for (const books of byYear.values()) {
            books.sort((a, b) => {
                const dateA = a.dateCompleted || a.dateAdded || '';
                const dateB = b.dateCompleted || b.dateAdded || '';
                return dateB.localeCompare(dateA) || (a.title || '').localeCompare(b.title || '');
            });
        }
        const years = Array.from(byYear.keys()).filter((y) => y !== 'Unknown');
        years.sort((a, b) => Number(b) - Number(a));
        if (byYear.has('Unknown')) years.push('Unknown');
        return years.map((year) => ({ year, books: byYear.get(year) }));
    }

    /** Render every section whose container exists, independently of the others. */
    renderBooks() {
        for (const { type, hideWhenEmpty } of TYPE_SECTIONS) {
            const container = document.getElementById(`library-cards-${type}`);
            if (!container) continue;
            const books = this._sortBooksForDisplay(this.stateAdapter.getBooksByType(type));
            container.innerHTML = this._renderCardList(books);
            if (hideWhenEmpty) {
                const section = container.closest('.library-books-section') || container;
                section.style.display = books.length === 0 ? 'none' : '';
            }
        }

        const completed = document.getElementById('library-cards-completed');
        if (completed) {
            const completedBooks = this.stateAdapter.getBooksByStatus('completed');
            completed.innerHTML = this._renderCompletedByYear(completedBooks);
            completed.classList.toggle('library-cards-completed--by-year', completedBooks.length > 0);
        }
    }

    _renderCompletedByYear(completedBooks) {
        if (!completedBooks || completedBooks.length === 0) {
            return '<p class="library-empty-section">None</p>';
        }
        const groups = this._groupCompletedBooksByYear(completedBooks);
        return groups
            .map(
                ({ year, books }) =>
                    `<div class="library-completed-year-group">` +
                    `<h4 class="library-year-heading">${this._escapeHtml(year)} (${books.length})</h4>` +
                    `<div class="library-cards-grid">${this._renderCardList(books)}</div>` +
                    `</div>`
            )
            .join('');
    }

    _renderCardList(books) {
        if (!books || books.length === 0) {
            return '<p class="library-empty-section">None</p>';
        }
        return books.map((book) => this.renderBookCard(book)).join('');
    }

    /**
     * One book card (cover, title, author, status badge, actions). Also used for the
     * offer line on the quest tab.
     * @param {Object} book
     * @returns {string} HTML
     */
    renderBookCard(book) {
        const idAttr = this._escapeAttr(book.id);
        const titleEsc = this._escapeHtml(book.title || '');
        const authorEsc = this._escapeHtml(book.author || '');
        const coverHtml = book.cover
            ? `<img class="library-card-cover" src="${this._escapeAttr(book.cover)}" alt="" loading="lazy" onerror="this.style.display=\'none\'">`
            : '<span class="library-card-cover-placeholder">No cover</span>';
        const pageStr = book.pageCount != null && !isNaN(book.pageCount) ? ` · ${book.pageCount} pp` : '';
        const isCompleted = book.status === 'completed';
        // Badge per spec 6.3: Completed, or On a quest when an active quest links the book; else none
        const onQuest = !isCompleted && typeof this.stateAdapter.isBookOnActiveQuest === 'function'
            && this.stateAdapter.isBookOnActiveQuest(book);
        const statusBadge = isCompleted
            ? '<span class="library-status-badge library-status-overlay library-status-completed">Completed</span>'
            : (onQuest ? '<span class="library-status-badge library-status-overlay library-status-reading">On a quest</span>' : '');
        const markCompleteBtn = !isCompleted
            ? `<button type="button" class="rpg-btn rpg-btn-secondary library-card-action-btn library-mark-complete-btn" data-book-id="${idAttr}" aria-label="Mark complete" title="Mark complete">✓</button>`
            : '';
        const editBtn = `<button type="button" class="rpg-btn rpg-btn-secondary library-card-action-btn library-edit-book-btn" data-book-id="${idAttr}" aria-label="Edit" title="Edit">✏</button>`;
        const linkQuestBtn = `<button type="button" class="rpg-btn rpg-btn-secondary library-card-action-btn library-link-quest-btn" data-book-id="${idAttr}" aria-label="Link quest" title="Link quest">🔗</button>`;
        // "Found on our shelf — link it?" (D7): only on a physical book, never automatic
        const offer = book.type === 'physical' ? this._shelfOffers.get(book.id) : null;
        const offerHtml = offer
            ? '<div class="library-card-offer">' +
                '<span class="library-card-offer-text">Found on our shelf — link it?</span>' +
                `<button type="button" class="rpg-btn rpg-btn-secondary library-offer-link-btn" data-book-id="${idAttr}">Link</button>` +
                `<button type="button" class="rpg-btn rpg-btn-secondary library-offer-dismiss-btn" data-book-id="${idAttr}">Not this one</button>` +
                '</div>'
            : '';
        // Review Focus 4: the record keeps its data; the card only says the library book is gone
        const catalog = this._libraryCatalog ? this._libraryCatalog.peek() : null;
        const missingHtml = isLibraryMissing(book, catalog)
            ? '<div class="library-card-missing">No longer in the household library</div>'
            : '';
        return `
            <div class="library-card" data-book-id="${idAttr}">
                <div class="library-card-cover-wrap">
                    ${coverHtml}
                    ${statusBadge}
                </div>
                <div class="library-card-body">
                    <div class="library-card-text">
                        <div class="library-card-title">${titleEsc}</div>
                        <div class="library-card-author">${authorEsc}</div>
                        <div class="library-card-meta">${pageStr || ''}</div>
                        ${missingHtml}
                    </div>
                    <div class="library-card-actions">
                        ${markCompleteBtn}
                        ${editBtn}
                        ${linkQuestBtn}
                    </div>
                    ${offerHtml}
                </div>
            </div>`;
    }

    _renderDrawerLinksSection(bookId) {
        const book = this.stateAdapter.getBook(bookId);
        if (!book) return;

        const listEl = document.getElementById('book-edit-links-list');
        const dropdown = document.getElementById('book-edit-link-quest-dropdown');
        if (dropdown) dropdown.style.display = 'none';
        if (!listEl) return;

        listEl.innerHTML = '';

        const questIds = (book.links && book.links.questIds) || [];
        const activeQuests = this.stateAdapter.getActiveAssignments() || [];

        if (questIds.length === 0) {
            const emptyDiv = document.createElement('div');
            emptyDiv.className = 'book-edit-links-empty';
            emptyDiv.textContent = 'No linked quests';
            listEl.appendChild(emptyDiv);
        } else {
            for (const qid of questIds) {
                const quest = activeQuests.find(q => q.id === qid);
                const row = document.createElement('div');
                row.className = 'book-edit-linked-quest-row';

                const textSpan = document.createElement('span');
                textSpan.className = 'book-edit-linked-quest-text';
                if (quest) {
                    const typeEmoji = quest.type ? quest.type.split(' ')[0] : '';
                    textSpan.textContent = `${typeEmoji} ${quest.prompt || '(no prompt)'}`;
                } else {
                    textSpan.textContent = `(completed/archived quest)`;
                }
                row.appendChild(textSpan);

                const unlinkBtn = document.createElement('button');
                unlinkBtn.type = 'button';
                unlinkBtn.className = 'book-edit-unlink-btn';
                unlinkBtn.textContent = '\u2715';
                unlinkBtn.title = 'Unlink quest';
                unlinkBtn.dataset.questId = qid;
                unlinkBtn.addEventListener('click', () => {
                    this.stateAdapter.unlinkQuestFromBook(bookId, qid);
                    this.stateAdapter.updateActiveQuest(qid, {
                        bookId: null,
                        book: '',
                        bookAuthor: '',
                        coverUrl: undefined
                    });
                    this.saveState();
                    toast.success('Quest unlinked');
                    this._renderDrawerLinksSection(bookId);
                    this.renderBooks();
                    this._refreshQuestUI();
                });
                row.appendChild(unlinkBtn);

                listEl.appendChild(row);
            }
        }

        // Wire up Link Quest button — opens dropdown with both link and create options
        const linkBtn = document.getElementById('book-edit-link-quest-btn');
        if (linkBtn) {
            const newBtn = linkBtn.cloneNode(true);
            linkBtn.parentNode.replaceChild(newBtn, linkBtn);
            newBtn.addEventListener('click', () => {
                this._renderDrawerLinkQuestDropdown(bookId);
            });
        }
    }

    _renderDrawerLinkQuestDropdown(bookId) {
        const dropdown = document.getElementById('book-edit-link-quest-dropdown');
        if (!dropdown) return;

        // Toggle: if already visible, hide it
        if (dropdown.style.display === 'block') {
            dropdown.style.display = 'none';
            return;
        }

        const linkableQuests = getUnlinkedActiveQuests(this.stateAdapter, bookId);

        dropdown.innerHTML = '';

        // Quest list section
        if (linkableQuests.length === 0) {
            const empty = document.createElement('div');
            empty.className = 'link-quest-empty';
            empty.textContent = 'No available quests to link';
            dropdown.appendChild(empty);
        } else {
            for (const q of linkableQuests) {
                const option = document.createElement('button');
                option.type = 'button';
                option.className = 'link-quest-option';
                option.dataset.questId = q.id;

                if (q.coverUrl) {
                    const img = document.createElement('img');
                    img.className = 'link-quest-option-cover';
                    img.src = q.coverUrl;
                    img.alt = '';
                    option.appendChild(img);
                } else {
                    const placeholder = document.createElement('span');
                    placeholder.className = 'link-quest-option-cover-placeholder';
                    option.appendChild(placeholder);
                }

                const textWrap = document.createElement('span');
                textWrap.className = 'link-quest-option-text';

                const typeSpan = document.createElement('span');
                typeSpan.className = 'link-quest-option-type';
                typeSpan.textContent = q.type ? q.type.split(' ')[0] : '';
                textWrap.appendChild(typeSpan);

                const promptSpan = document.createElement('span');
                promptSpan.className = 'link-quest-option-prompt';
                promptSpan.textContent = q.prompt || '(no prompt)';
                textWrap.appendChild(promptSpan);

                option.appendChild(textWrap);
                dropdown.appendChild(option);
            }
        }

        // Divider
        const divider = document.createElement('div');
        divider.style.borderTop = '1px solid #54483b';
        divider.style.margin = '6px 0';
        dropdown.appendChild(divider);

        // Create Extra Credit option
        const ecBtn = document.createElement('button');
        ecBtn.type = 'button';
        ecBtn.className = 'link-quest-create-ec-btn';
        ecBtn.dataset.action = 'create-ec';
        ecBtn.textContent = '\u2B50 Create Extra Credit Quest';
        dropdown.appendChild(ecBtn);

        // Single delegated click handler on the dropdown
        dropdown.onclick = (e) => {
            const optionEl = e.target.closest('.link-quest-option');
            const ecBtnEl = e.target.closest('.link-quest-create-ec-btn');

            if (optionEl) {
                const selectedQuestId = optionEl.dataset.questId;
                if (!selectedQuestId) return;
                const success = linkExistingQuestToBook(selectedQuestId, bookId, this.stateAdapter);
                if (success) {
                    this.saveState();
                    const book = this.stateAdapter.getBook(bookId);
                    toast.success(`Quest linked to "${book ? book.title : 'book'}"`);
                } else {
                    toast.error(getQuestLinkRefusal(this.stateAdapter, bookId, selectedQuestId) || 'Failed to link quest — check browser console for details');
                }
                this._renderDrawerLinksSection(bookId);
                this.renderBooks();
                this._refreshQuestUI();
            } else if (ecBtnEl) {
                const quest = createExtraCreditForBook(bookId, this.stateAdapter);
                if (quest) {
                    this.saveState();
                    const book = this.stateAdapter.getBook(bookId);
                    toast.success(`Extra Credit quest created for "${book ? book.title : 'book'}"`);
                } else {
                    toast.error(getQuestLinkRefusal(this.stateAdapter, bookId, null) || 'Failed to create quest');
                }
                this._renderDrawerLinksSection(bookId);
                this.renderBooks();
                this._refreshQuestUI();
            }
        };

        dropdown.style.display = 'block';
    }

    _openLinkQuestPopover(anchorEl, bookId) {
        this._closeLinkQuestPopover();

        const book = this.stateAdapter.getBook(bookId);
        if (!book) return;

        const linkableQuests = getUnlinkedActiveQuests(this.stateAdapter, bookId);

        const popover = document.createElement('div');
        popover.className = 'library-link-quest-popover';

        const header = document.createElement('div');
        header.className = 'library-link-quest-popover-header';
        header.textContent = `Link quest to "${book.title}"`;
        popover.appendChild(header);

        const list = document.createElement('div');
        list.className = 'link-quest-list';

        if (linkableQuests.length === 0) {
            const empty = document.createElement('div');
            empty.className = 'link-quest-empty';
            empty.textContent = 'No available quests';
            list.appendChild(empty);
        } else {
            for (const q of linkableQuests) {
                const option = document.createElement('button');
                option.type = 'button';
                option.className = 'link-quest-option';
                option.dataset.questId = q.id;

                if (q.coverUrl) {
                    const img = document.createElement('img');
                    img.className = 'link-quest-option-cover';
                    img.src = q.coverUrl;
                    img.alt = '';
                    option.appendChild(img);
                } else {
                    const placeholder = document.createElement('span');
                    placeholder.className = 'link-quest-option-cover-placeholder';
                    option.appendChild(placeholder);
                }

                const textWrap = document.createElement('span');
                textWrap.className = 'link-quest-option-text';

                const typeSpan = document.createElement('span');
                typeSpan.className = 'link-quest-option-type';
                typeSpan.textContent = q.type ? q.type.split(' ')[0] : '';
                textWrap.appendChild(typeSpan);

                const promptSpan = document.createElement('span');
                promptSpan.className = 'link-quest-option-prompt';
                promptSpan.textContent = q.prompt || '(no prompt)';
                textWrap.appendChild(promptSpan);

                option.appendChild(textWrap);
                list.appendChild(option);
            }
        }

        popover.appendChild(list);

        // Divider
        const divider = document.createElement('div');
        divider.style.borderTop = '1px solid #54483b';
        divider.style.margin = '6px 0';
        popover.appendChild(divider);

        const createBtn = document.createElement('button');
        createBtn.type = 'button';
        createBtn.className = 'link-quest-create-ec-btn';
        createBtn.textContent = '\u2B50 Create Extra Credit Quest';
        popover.appendChild(createBtn);

        // Single delegated click handler on the popover
        popover.addEventListener('click', (e) => {
            const optionEl = e.target.closest('.link-quest-option');
            const ecBtnEl = e.target.closest('.link-quest-create-ec-btn');

            if (optionEl) {
                const selectedQuestId = optionEl.dataset.questId;
                if (!selectedQuestId) return;
                const success = linkExistingQuestToBook(selectedQuestId, bookId, this.stateAdapter);
                if (success) {
                    this.saveState();
                    toast.success(`Quest linked to "${book.title}"`);
                } else {
                    toast.error(getQuestLinkRefusal(this.stateAdapter, bookId, selectedQuestId) || 'Failed to link quest');
                }
                this.renderBooks();
                this._closeLinkQuestPopover();
                this._refreshQuestUI();
            } else if (ecBtnEl) {
                const quest = createExtraCreditForBook(bookId, this.stateAdapter);
                if (quest) {
                    this.saveState();
                    toast.success(`Extra Credit quest created for "${book.title}"`);
                } else {
                    toast.error(getQuestLinkRefusal(this.stateAdapter, bookId, null) || 'Failed to create quest');
                }
                this.renderBooks();
                this._closeLinkQuestPopover();
                this._refreshQuestUI();
            }
        });

        // Position popover using fixed positioning relative to viewport
        const rect = anchorEl.getBoundingClientRect();
        popover.style.position = 'fixed';
        popover.style.top = `${rect.bottom + 4}px`;
        popover.style.right = `${window.innerWidth - rect.right}px`;
        document.body.appendChild(popover);

        this._linkQuestPopoverEl = popover;

        this._linkQuestOutsideClickHandler = (evt) => {
            if (!popover.contains(evt.target) && !anchorEl.contains(evt.target)) {
                this._closeLinkQuestPopover();
            }
        };
        this._linkQuestEscHandler = (evt) => {
            if (evt.key === 'Escape') {
                this._closeLinkQuestPopover();
            }
        };

        setTimeout(() => {
            document.addEventListener('click', this._linkQuestOutsideClickHandler);
            document.addEventListener('keydown', this._linkQuestEscHandler);
        }, 0);
    }

    _closeLinkQuestPopover() {
        if (this._linkQuestPopoverEl && this._linkQuestPopoverEl.parentNode) {
            this._linkQuestPopoverEl.parentNode.removeChild(this._linkQuestPopoverEl);
        }
        this._linkQuestPopoverEl = null;
        if (this._linkQuestOutsideClickHandler) {
            document.removeEventListener('click', this._linkQuestOutsideClickHandler);
            this._linkQuestOutsideClickHandler = null;
        }
        if (this._linkQuestEscHandler) {
            document.removeEventListener('keydown', this._linkQuestEscHandler);
            this._linkQuestEscHandler = null;
        }
    }

    _refreshQuestUI() {
        const { ui: uiModule } = this.dependencies;
        if (uiModule && uiModule.renderActiveAssignments) {
            uiModule.renderActiveAssignments();
        }
    }

    _getApplicableTagIds() {
        const dataModule = {
            allItems,
            keeperBackgrounds,
            schoolBenefits,
            masteryAbilities,
            temporaryBuffsFromRewards,
            temporaryBuffs
        };
        const effectContext = buildEffectContext(this.stateAdapter, this.form);
        return getApplicableTagIds(effectContext, dataModule);
    }

    _escapeHtml(s) {
        const div = document.createElement('div');
        div.textContent = s;
        return div.innerHTML;
    }

    _escapeAttr(s) {
        return String(s)
            .replace(/&/g, '&amp;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
    }
}
