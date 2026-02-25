/**
 * Book Selector - Reusable inline component for linking a book to a quest or curriculum prompt.
 * Renders a dropdown of books from the library (optionally filtered by status).
 * Shows selected book's cover thumbnail + title with option to unlink.
 * No modals or alert/confirm/prompt.
 */

import { escapeHtml } from './sanitize.js';

/**
 * Escape a string for use in an HTML attribute (e.g. src, data-*).
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

/**
 * Create and mount a book selector in the given container.
 *
 * @param {HTMLElement} container - Element to render the selector into (will be cleared)
 * @param {Object} stateAdapter - State adapter with getBooks() and optionally getBooksByStatus(status)
 * @param {Object} options - Configuration
 * @param {string|null} [options.selectedBookId] - Initially selected book id
 * @param {string} [options.statusFilter] - 'reading' | 'completed' | 'other' to filter listed books
 * @param {function(string|null): void} [options.onSelect] - Called when selection changes (bookId or null for unlink)
 * @param {string} [options.placeholder] - Button text when no book selected (default: "Link Book")
 * @param {string} [options.unlinkLabel] - Label for unlink button (default: "Unlink")
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
    const statusFilter = options.statusFilter; // 'reading' | 'completed' | 'other' | undefined
    const onSelect = typeof options.onSelect === 'function' ? options.onSelect : () => {};
    const placeholder = options.placeholder ?? 'Link Book';
    const unlinkLabel = options.unlinkLabel ?? 'Unlink';

    let dropdownEl = null;
    let clickOutsideHandler = null;
    let ignoreNextDocumentClick = false;

    function getBooksList() {
        if (statusFilter && typeof stateAdapter.getBooksByStatus === 'function') {
            return stateAdapter.getBooksByStatus(statusFilter);
        }
        return typeof stateAdapter.getBooks === 'function' ? stateAdapter.getBooks() : [];
    }

    function closeDropdown() {
        if (dropdownEl) {
            dropdownEl.remove();
            dropdownEl = null;
        }
        if (clickOutsideHandler) {
            document.removeEventListener('click', clickOutsideHandler);
            clickOutsideHandler = null;
        }
    }

    function openDropdown(buttonRect) {
        closeDropdown();
        const books = getBooksList();
        const listContent =
            books.length === 0
                ? '<p class="book-selector-empty">No books in library. Add books in the Library tab first.</p>'
                : books
                      .map((book) => {
                          const titleEsc = escapeHtml(book.title || 'Untitled');
                          const authorEsc = escapeHtml(book.author || '');
                          const coverHtml = book.cover
                              ? `<img class="book-selector-option-cover" src="${escapeAttr(book.cover)}" alt="" loading="lazy" onerror="this.style.display='none'">`
                              : '<span class="book-selector-option-placeholder">No cover</span>';
                          return `
                            <button type="button" class="book-selector-option" data-book-id="${escapeAttr(book.id)}">
                                <span class="book-selector-option-cover-wrap">${coverHtml}</span>
                                <span class="book-selector-option-text">
                                    <span class="book-selector-option-title">${titleEsc}</span>
                                    ${authorEsc ? `<span class="book-selector-option-author">${authorEsc}</span>` : ''}
                                </span>
                            </button>`;
                      })
                      .join('');

        dropdownEl = document.createElement('div');
        dropdownEl.className = 'book-selector-dropdown';
        dropdownEl.innerHTML = listContent;

        const style = dropdownEl.style;
        style.position = 'absolute';
        style.left = `${buttonRect.left}px`;
        style.top = `${buttonRect.bottom + 4}px`;
        style.minWidth = `${Math.max(buttonRect.width, 220)}px`;
        style.zIndex = '1000';

        document.body.appendChild(dropdownEl);

        dropdownEl.querySelectorAll('.book-selector-option').forEach((btn) => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const id = btn.getAttribute('data-book-id');
                if (id) {
                    selectedBookId = id;
                    closeDropdown();
                    onSelect(id);
                    render();
                }
            });
        });

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

    function render() {
        container.innerHTML = '';
        container.className = 'book-selector';

        const books = getBooksList();
        const selectedBook =
            selectedBookId && stateAdapter.getBook
                ? stateAdapter.getBook(selectedBookId)
                : null;

        if (selectedBook) {
            const titleEsc = escapeHtml(selectedBook.title || 'Untitled');
            const authorEsc = escapeHtml(selectedBook.author || '');
            const coverHtml = selectedBook.cover
                ? `<img class="book-selector-selected-cover" src="${escapeAttr(selectedBook.cover)}" alt="" loading="lazy" onerror="this.style.display='none'">`
                : '<span class="book-selector-selected-placeholder">No cover</span>';
            container.innerHTML = `
                <div class="book-selector-selected">
                    <span class="book-selector-selected-cover-wrap">${coverHtml}</span>
                    <span class="book-selector-selected-text">
                        <span class="book-selector-selected-title">${titleEsc}</span>
                        ${authorEsc ? `<span class="book-selector-selected-author">${authorEsc}</span>` : ''}
                    </span>
                    <button type="button" class="rpg-btn rpg-btn-secondary book-selector-unlink" aria-label="${escapeAttr(unlinkLabel)}">${escapeHtml(unlinkLabel)}</button>
                </div>`;
            const unlinkBtn = container.querySelector('.book-selector-unlink');
            if (unlinkBtn) {
                unlinkBtn.addEventListener('click', () => {
                    selectedBookId = null;
                    onSelect(null);
                    render();
                });
            }
        } else {
            container.innerHTML = `
                <button type="button" class="rpg-btn rpg-btn-secondary book-selector-trigger" aria-label="${escapeAttr(placeholder)}">
                    ${escapeHtml(placeholder)}
                </button>`;
            const trigger = container.querySelector('.book-selector-trigger');
            if (trigger) {
                trigger.addEventListener('click', (e) => {
                    e.stopPropagation();
                    openDropdown(trigger.getBoundingClientRect());
                });
            }
        }
    }

    function setSelectedBookId(id) {
        selectedBookId = id ?? null;
        render();
    }

    function getSelectedBookId() {
        return selectedBookId;
    }

    function destroy() {
        closeDropdown();
        container.innerHTML = '';
    }

    render();
    return { render, setSelectedBookId, getSelectedBookId, destroy };
}
