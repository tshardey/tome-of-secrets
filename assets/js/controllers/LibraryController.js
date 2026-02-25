/**
 * LibraryController - Handles Library tab: add/edit books, search, render book cards
 *
 * - Add Book: inline form with title (live API search), author, cover (URL + upload), page count, status
 * - Book cards grouped by status (Reading, Completed, Other); each card: cover, title, author, Mark Complete, Edit
 * - Edit Book: right-side drawer with same fields + read-only linked quests/prompts
 */

import { BaseController } from './BaseController.js';
import { STATE_EVENTS } from '../character-sheet/stateAdapter.js';
import { searchBooks } from '../services/BookMetadataService.js';
import { trimOrEmpty } from '../utils/helpers.js';

const BOOK_SEARCH_DEBOUNCE_MS = 600;
const BOOK_SEARCH_MIN_LENGTH = 2;

export class LibraryController extends BaseController {
    constructor(stateAdapter, form, dependencies) {
        super(stateAdapter, form, dependencies);
        this._searchAbortController = null;
        this._editingBookId = null;
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

        const bookEditDrawer = document.getElementById('book-edit-drawer');
        const bookEditBackdrop = document.getElementById('book-edit-backdrop');
        const closeBookEditBtn = document.getElementById('close-book-edit');
        const cancelBookEditBtn = document.getElementById('cancel-book-edit-btn');
        const saveBookEditBtn = document.getElementById('save-book-edit-btn');

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

        this._setupAddFormCoverHandlers();

        if (closeBookEditBtn) {
            this.addEventListener(closeBookEditBtn, 'click', () => this._closeBookEditDrawer());
        }
        if (bookEditBackdrop) {
            this.addEventListener(bookEditBackdrop, 'click', () => this._closeBookEditDrawer());
        }
        if (cancelBookEditBtn) {
            this.addEventListener(cancelBookEditBtn, 'click', () => this._closeBookEditDrawer());
        }
        if (saveBookEditBtn) {
            this.addEventListener(saveBookEditBtn, 'click', () => this.handleSaveBookEdit());
        }

        this._setupBookEditCoverHandlers();

        this.addEventListener(document, 'keydown', (e) => {
            if (e.key === 'Escape' && bookEditDrawer && bookEditDrawer.style.display !== 'none') {
                this._closeBookEditDrawer();
            }
        });

        form.addEventListener('click', (e) => {
            const editBtn = e.target.closest('.library-edit-book-btn');
            const markCompleteBtn = e.target.closest('.library-mark-complete-btn');
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
    }

    _runBookSearch(query, author, resultsContainer) {
        if (!query || !resultsContainer) return;
        if (this._searchAbortController) this._searchAbortController.abort();
        this._searchAbortController = new AbortController();
        const signal = this._searchAbortController.signal;
        resultsContainer.innerHTML = '<span class="book-search-loading">Searching…</span>';
        resultsContainer.style.display = 'block';

        searchBooks(query, author || undefined, signal)
            .then((results) => {
                if (signal.aborted) return;
                this._renderSearchResults(results, resultsContainer);
            })
            .catch((err) => {
                if (err.name === 'AbortError') return;
                resultsContainer.innerHTML = '<span class="book-search-error">Search failed.</span>';
                resultsContainer.style.display = 'block';
            });
    }

    _renderSearchResults(results, container) {
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
                this._applySearchResultToAddForm(book);
                container.style.display = 'none';
                container.innerHTML = '';
            });
            container.appendChild(item);
        });
        container.style.display = 'block';
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

    handleAddBook() {
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

        const statusRadio = this.form?.querySelector('input[name="library-add-status"]:checked');
        const status = statusRadio?.value === 'completed' || statusRadio?.value === 'other' ? statusRadio.value : 'reading';

        const book = this.stateAdapter.addBook({
            title,
            author,
            cover,
            pageCount: pageCountNum,
            status
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
        const readingRadio = this.form?.querySelector('input[name="library-add-status"][value="reading"]');
        if (readingRadio) readingRadio.checked = true;
    }

    handleEditBook(bookId) {
        const book = this.stateAdapter.getBook(bookId);
        if (!book) return;

        this._editingBookId = bookId;

        const idEl = document.getElementById('book-edit-id');
        const titleEl = document.getElementById('book-edit-title');
        const authorEl = document.getElementById('book-edit-author');
        const pageCountEl = document.getElementById('book-edit-page-count');
        const statusEl = document.getElementById('book-edit-status');
        const linksSection = document.getElementById('book-edit-links-section');
        const linksDisplay = document.getElementById('book-edit-links-display');
        const valueEl = document.getElementById('book-edit-cover-value');

        if (idEl) idEl.value = book.id;
        if (titleEl) titleEl.value = book.title || '';
        if (authorEl) authorEl.value = book.author || '';
        if (pageCountEl) {
            pageCountEl.value = book.pageCount != null && !isNaN(book.pageCount) ? String(book.pageCount) : '';
        }
        if (statusEl) statusEl.value = book.status || 'reading';

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

        const links = book.links || { questIds: [], curriculumPromptIds: [] };
        const hasLinks = (links.questIds && links.questIds.length > 0) || (links.curriculumPromptIds && links.curriculumPromptIds.length > 0);
        if (linksSection) linksSection.style.display = hasLinks ? 'block' : 'none';
        if (linksDisplay) {
            const parts = [];
            if (links.questIds && links.questIds.length) parts.push(`${links.questIds.length} quest(s)`);
            if (links.curriculumPromptIds && links.curriculumPromptIds.length) parts.push(`${links.curriculumPromptIds.length} prompt(s)`);
            linksDisplay.textContent = parts.join(', ') || '—';
        }

        const drawer = document.getElementById('book-edit-drawer');
        const backdrop = document.getElementById('book-edit-backdrop');
        if (drawer) drawer.style.display = 'flex';
        if (backdrop) backdrop.classList.add('active');
        document.body.style.overflow = 'hidden';
    }

    _closeBookEditDrawer() {
        this._editingBookId = null;
        const drawer = document.getElementById('book-edit-drawer');
        const backdrop = document.getElementById('book-edit-backdrop');
        if (drawer) drawer.style.display = 'none';
        if (backdrop) backdrop.classList.remove('active');
        document.body.style.overflow = '';
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

        const statusEl = document.getElementById('book-edit-status');
        const status = statusEl?.value === 'completed' || statusEl?.value === 'other' ? statusEl.value : 'reading';

        this.stateAdapter.updateBook(bookId, {
            title,
            author,
            cover,
            pageCount: pageCountNum,
            status
        });
        this._closeBookEditDrawer();
        this.renderBooks();
        this.saveState();
    }

    handleMarkComplete(bookId) {
        const book = this.stateAdapter.getBook(bookId);
        if (!book || book.status === 'completed') return;
        this.stateAdapter.markBookComplete(bookId);
        this.renderBooks();
        this.saveState();
    }

    renderBooks() {
        const reading = document.getElementById('library-cards-reading');
        const completed = document.getElementById('library-cards-completed');
        const other = document.getElementById('library-cards-other');
        if (!reading || !completed || !other) return;

        const byStatus = (status) => this.stateAdapter.getBooksByStatus(status);

        reading.innerHTML = this._renderCardList(byStatus('reading'));
        completed.innerHTML = this._renderCardList(byStatus('completed'));
        other.innerHTML = this._renderCardList(byStatus('other'));
    }

    _renderCardList(books) {
        if (!books || books.length === 0) {
            return '<p class="library-empty-section">None</p>';
        }
        return books
            .map((book) => {
                const titleEsc = this._escapeHtml(book.title || '');
                const authorEsc = this._escapeHtml(book.author || '');
                const coverHtml = book.cover
                    ? `<img class="library-card-cover" src="${this._escapeAttr(book.cover)}" alt="" loading="lazy" onerror="this.style.display=\'none\'">`
                    : '<span class="library-card-cover-placeholder">No cover</span>';
                const pageStr = book.pageCount != null && !isNaN(book.pageCount) ? ` · ${book.pageCount} pp` : '';
                const statusClass = book.status === 'completed' ? 'library-status-completed' : book.status === 'reading' ? 'library-status-reading' : 'library-status-other';
                const markCompleteBtn =
                    book.status !== 'completed'
                        ? `<button type="button" class="rpg-btn rpg-btn-secondary library-card-action-btn library-mark-complete-btn" data-book-id="${this._escapeAttr(book.id)}" aria-label="Mark complete" title="Mark complete">✓</button>`
                        : '';
                const editBtn = `<button type="button" class="rpg-btn rpg-btn-secondary library-card-action-btn library-edit-book-btn" data-book-id="${this._escapeAttr(book.id)}" aria-label="Edit" title="Edit">✏</button>`;
                return `
                    <div class="library-card" data-book-id="${this._escapeAttr(book.id)}">
                        <div class="library-card-cover-wrap">
                            ${coverHtml}
                            <span class="library-status-badge library-status-overlay ${statusClass}">${book.status || 'reading'}</span>
                        </div>
                        <div class="library-card-body">
                            <div class="library-card-text">
                                <div class="library-card-title">${titleEsc}</div>
                                <div class="library-card-author">${authorEsc}</div>
                                <div class="library-card-meta">${pageStr || ''}</div>
                            </div>
                            <div class="library-card-actions">
                                ${markCompleteBtn}
                                ${editBtn}
                            </div>
                        </div>
                    </div>`;
            })
            .join('');
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
