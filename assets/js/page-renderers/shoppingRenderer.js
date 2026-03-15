// Renders shopping options and handles redemption on shopping.md
import { shoppingOptions as shoppingOptionsRaw } from '../character-sheet/data.js';
import { safeGetJSON, safeSetJSON } from '../utils/storage.js';
import { STORAGE_KEYS } from '../character-sheet/storageKeys.js';
import { parseIntOr, trimOrEmpty } from '../utils/helpers.js';
import { getStateKey, setStateKey } from '../character-sheet/persistence.js';
import { characterState, isStateLoaded, loadState } from '../character-sheet/state.js';
import { StateAdapter, STATE_EVENTS } from '../character-sheet/stateAdapter.js';
import { createBookSelector } from '../utils/bookSelector.js';
import { searchBooks } from '../services/BookMetadataService.js';

/**
 * @typedef {Object} ShoppingOption
 * @property {string} id
 * @property {string} label
 * @property {string} description
 * @property {number} inkDrops
 * @property {number} paperScraps
 * @property {boolean} allowQuantity
 * @property {string} [type]
 */

/** @type {ShoppingOption[]} */
const shoppingOptions = Object.entries(shoppingOptionsRaw || {}).map(([key, option]) => {
    const opt = option || {};
    return {
        id: typeof opt.id === 'string' && opt.id.trim() ? opt.id.trim() : key,
        label: typeof opt.label === 'string' && opt.label.trim() ? opt.label.trim() : key,
        description: typeof opt.description === 'string' ? opt.description : '',
        inkDrops: typeof opt.inkDrops === 'number' && !isNaN(opt.inkDrops) ? opt.inkDrops : 0,
        paperScraps: typeof opt.paperScraps === 'number' && !isNaN(opt.paperScraps) ? opt.paperScraps : 0,
        allowQuantity: Boolean(opt.allowQuantity),
        type: typeof opt.type === 'string' ? opt.type : 'item'
    };
});

const shoppingOptionsById = new Map(shoppingOptions.map((opt) => [opt.id, opt]));

let stateAdapter = null;
let shoppingLog = [];
let bookSearchAbortController = null;

function clearElement(element) {
    while (element.firstChild) {
        element.removeChild(element.firstChild);
    }
}

function isSafeHttpUrl(value) {
    if (typeof value !== 'string' || !value.trim()) return false;
    const trimmed = value.trim();
    if (!/^https?:\/\//i.test(trimmed)) return false;
    try {
        const url = new URL(trimmed);
        return url.protocol === 'http:' || url.protocol === 'https:';
    } catch (_) {
        return false;
    }
}

function appendNodeWithSpace(container, node) {
    if (container.childNodes.length > 0) {
        container.appendChild(document.createTextNode(' '));
    }
    container.appendChild(node);
}

function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

function generateId() {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        return crypto.randomUUID();
    }
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0;
        const v = c === 'x' ? r : (r & 0x3) | 0x8;
        return v.toString(16);
    });
}

async function ensureStateLoadedOnce() {
    if (!isStateLoaded) {
        await loadState(null);
    }
    if (!stateAdapter) {
        stateAdapter = new StateAdapter(characterState);
    }
}

async function loadShoppingLog() {
    const inMemory = Array.isArray(characterState[STORAGE_KEYS.SHOPPING_LOG])
        ? characterState[STORAGE_KEYS.SHOPPING_LOG]
        : [];
    let persisted = [];
    try {
        const value = await getStateKey(STORAGE_KEYS.SHOPPING_LOG, inMemory);
        persisted = Array.isArray(value) ? value : [];
    } catch (_e) {
        persisted = inMemory;
    }
    shoppingLog = persisted;
    characterState[STORAGE_KEYS.SHOPPING_LOG] = shoppingLog;
}

async function appendShoppingLogEntry(entry) {
    const normalized = {
        id: entry.id || generateId(),
        optionId: entry.optionId,
        linkedBookIds: Array.isArray(entry.linkedBookIds) ? entry.linkedBookIds.filter((x) => typeof x === 'string' && x.trim()) : [],
        actualMoneySpent:
            typeof entry.actualMoneySpent === 'number' && !isNaN(entry.actualMoneySpent) ? entry.actualMoneySpent : null,
        storeName: entry.storeName || null,
        logDate: entry.logDate || new Date().toISOString().slice(0, 10),
        inkDrops: typeof entry.inkDrops === 'number' && !isNaN(entry.inkDrops) ? Math.max(0, Math.floor(entry.inkDrops)) : 0,
        paperScraps:
            typeof entry.paperScraps === 'number' && !isNaN(entry.paperScraps)
                ? Math.max(0, Math.floor(entry.paperScraps))
                : 0
    };

    shoppingLog.push(normalized);
    characterState[STORAGE_KEYS.SHOPPING_LOG] = shoppingLog;
    await setStateKey(STORAGE_KEYS.SHOPPING_LOG, shoppingLog);
}

/**
 * Get current ink drops and paper scraps from the form
 * @returns {{inkDrops: number, paperScraps: number}}
 */
function getCurrentResources() {
    const inkDropsEl = document.getElementById('inkDrops');
    const paperScrapsEl = document.getElementById('paperScraps');

    let inkDrops = 0;
    let paperScraps = 0;

    if (inkDropsEl) {
        inkDrops = parseIntOr(inkDropsEl.value, 0);
    } else {
        const formData = safeGetJSON(STORAGE_KEYS.CHARACTER_SHEET_FORM, {});
        inkDrops = parseIntOr(formData.inkDrops, 0);
    }

    if (paperScrapsEl) {
        paperScraps = parseIntOr(paperScrapsEl.value, 0);
    } else {
        const formData = safeGetJSON(STORAGE_KEYS.CHARACTER_SHEET_FORM, {});
        paperScraps = parseIntOr(formData.paperScraps, 0);
    }

    return { inkDrops, paperScraps };
}

/**
 * Update ink drops and paper scraps in the form and localStorage
 * @param {number} newInkDrops
 * @param {number} newPaperScraps
 */
function updateResources(newInkDrops, newPaperScraps) {
    const inkDropsEl = document.getElementById('inkDrops');
    const paperScrapsEl = document.getElementById('paperScraps');

    if (inkDropsEl) {
        inkDropsEl.value = Math.max(0, newInkDrops);
    }
    if (paperScrapsEl) {
        paperScrapsEl.value = Math.max(0, newPaperScraps);
    }

    const formData = safeGetJSON(STORAGE_KEYS.CHARACTER_SHEET_FORM, {});
    formData.inkDrops = Math.max(0, newInkDrops);
    formData.paperScraps = Math.max(0, newPaperScraps);
    safeSetJSON(STORAGE_KEYS.CHARACTER_SHEET_FORM, formData);

    if (inkDropsEl) {
        inkDropsEl.dispatchEvent(new Event('change', { bubbles: true }));
    }
    if (paperScrapsEl) {
        paperScrapsEl.dispatchEvent(new Event('change', { bubbles: true }));
    }

    updateCurrencyDisplay();
}

function updateCurrencyDisplay() {
    const currencyDisplay = document.getElementById('shopping-currency-display');
    if (!currencyDisplay) return;

    const { inkDrops, paperScraps } = getCurrentResources();
    currencyDisplay.textContent =
        `Ink Drops: ${inkDrops} | Paper Scraps: ${paperScraps} (read-only — update in Character Sheet)`;
}

function showError(errorContainer, message) {
    if (errorContainer) {
        errorContainer.textContent = message;
        errorContainer.style.display = 'block';
        setTimeout(() => {
            errorContainer.style.display = 'none';
        }, 5000);
    }
}

/**
 * Build subscription-month card: subscription selector, purchase vs skip, then fields and actions.
 * @param {ShoppingOption} option
 * @returns {HTMLElement}
 */
function createSubscriptionMonthCard(option) {
    const card = document.createElement('div');
    card.className = 'shopping-option shopping-option-subscription-month';

    const nameEl = document.createElement('h3');
    nameEl.textContent = option.label;
    card.appendChild(nameEl);

    const descEl = document.createElement('p');
    descEl.textContent = option.description;
    card.appendChild(descEl);

    const subs = stateAdapter ? stateAdapter.getBookBoxSubscriptionsList() : [];
    const subSelectWrap = document.createElement('div');
    subSelectWrap.className = 'shopping-subscription-select-wrap';
    const subLabel = document.createElement('label');
    subLabel.setAttribute('for', `sub-select-${option.id}`);
    subLabel.textContent = 'Subscription: ';
    const subSelect = document.createElement('select');
    subSelect.id = `sub-select-${option.id}`;
    subSelect.className = 'shopping-subscription-select';
    subSelect.setAttribute('aria-label', 'Choose a book box subscription');
    subSelectWrap.appendChild(subLabel);
    subSelectWrap.appendChild(subSelect);
    card.appendChild(subSelectWrap);

    if (!subs.length) {
        const msg = document.createElement('p');
        msg.className = 'shopping-subscription-no-subs';
        msg.textContent = 'Add a subscription in the Book Box Subscriptions tab first, then return here to log each month.';
        card.appendChild(msg);
        subSelect.style.display = 'none';
        subLabel.style.display = 'none';
        return card;
    }

    subs.forEach((s) => {
        const opt = document.createElement('option');
        opt.value = s.id;
        opt.textContent = [s.company, s.tier].filter(Boolean).join(' · ') || s.id;
        subSelect.appendChild(opt);
    });

    const monthYearWrap = document.createElement('div');
    monthYearWrap.className = 'shopping-sub-month-year';
    const now = new Date();
    const monthSelect = document.createElement('select');
    monthSelect.className = 'shopping-sub-month';
    monthSelect.setAttribute('aria-label', 'Month');
    const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    months.forEach((m, i) => {
        const o = document.createElement('option');
        o.value = String(i + 1);
        o.textContent = m;
        if (i === now.getMonth()) o.selected = true;
        monthSelect.appendChild(o);
    });
    const yearInput = document.createElement('input');
    yearInput.type = 'number';
    yearInput.className = 'shopping-sub-year';
    yearInput.min = '2020';
    yearInput.max = '2030';
    yearInput.value = String(now.getFullYear());
    yearInput.setAttribute('aria-label', 'Year');
    monthYearWrap.appendChild(monthSelect);
    monthYearWrap.appendChild(yearInput);
    card.appendChild(monthYearWrap);

    const typeWrap = document.createElement('div');
    typeWrap.className = 'shopping-sub-type-wrap shopping-sub-type-toggle-wrap';
    const typeLabel = document.createElement('span');
    typeLabel.textContent = 'This month: ';
    typeWrap.appendChild(typeLabel);
    const switchLabel = document.createElement('label');
    switchLabel.className = 'switch';
    const typeCheckbox = document.createElement('input');
    typeCheckbox.type = 'checkbox';
    typeCheckbox.setAttribute('aria-label', 'Purchase or Skip');
    typeCheckbox.checked = false;
    const slider = document.createElement('span');
    slider.className = 'slider';
    switchLabel.appendChild(typeCheckbox);
    switchLabel.appendChild(slider);
    const typeValueLabel = document.createElement('span');
    typeValueLabel.className = 'shopping-sub-type-label';
    typeValueLabel.textContent = 'Purchase';
    typeWrap.appendChild(switchLabel);
    typeWrap.appendChild(typeValueLabel);
    card.appendChild(typeWrap);

    const purchaseSection = document.createElement('div');
    purchaseSection.className = 'shopping-sub-purchase-section';
    const costEl = document.createElement('div');
    costEl.className = 'shopping-cost';
    costEl.textContent = `In-game cost: ${option.inkDrops} Ink Drops + ${option.paperScraps} Paper Scraps`;
    purchaseSection.appendChild(costEl);
    const metaRow = document.createElement('div');
    metaRow.className = 'shopping-meta-row';
    const moneyInput = document.createElement('input');
    moneyInput.type = 'number';
    moneyInput.className = 'shopping-money-input';
    moneyInput.placeholder = 'Money spent (optional)';
    moneyInput.step = '0.01';
    moneyInput.min = '0';
    moneyInput.setAttribute('aria-label', 'Actual money spent');
    const dateInput = document.createElement('input');
    dateInput.type = 'date';
    dateInput.className = 'shopping-date-input';
    dateInput.value = new Date().toISOString().slice(0, 10);
    dateInput.setAttribute('aria-label', 'Date');
    metaRow.appendChild(moneyInput);
    metaRow.appendChild(dateInput);
    purchaseSection.appendChild(metaRow);
    card.appendChild(purchaseSection);

    let linkedBookIds = [];
    const bookSection = document.createElement('div');
    bookSection.className = 'shopping-book-section';
    const bookLabel = document.createElement('div');
    bookLabel.className = 'shopping-book-label';
    bookLabel.textContent = 'Link books received (optional):';
    const linkedBooksList = document.createElement('div');
    linkedBooksList.className = 'shopping-linked-books-list';
    linkedBooksList.setAttribute('aria-label', 'Books linked to this month');
    function updateLinkedBooksDisplay() {
        clearElement(linkedBooksList);
        linkedBooksList.style.display = linkedBookIds.length ? 'flex' : 'none';
        linkedBookIds.forEach((bookId) => {
            const book = stateAdapter && typeof stateAdapter.getBook === 'function' ? stateAdapter.getBook(bookId) : null;
            const chip = document.createElement('span');
            chip.className = 'shopping-linked-book-chip';
            chip.textContent = book && book.title ? String(book.title) : bookId;
            linkedBooksList.appendChild(chip);
        });
    }
    const bookSelectorContainer = document.createElement('div');
    bookSelectorContainer.className = 'shopping-book-selector-container';
    const quickAddContainer = document.createElement('div');
    quickAddContainer.className = 'shopping-quick-add-container';
    const quickAddSearch = document.createElement('input');
    quickAddSearch.type = 'text';
    quickAddSearch.className = 'shopping-quick-add-search';
    quickAddSearch.placeholder = 'Search title or author…';
    const quickAddButton = document.createElement('button');
    quickAddButton.type = 'button';
    quickAddButton.className = 'rpg-btn rpg-btn-secondary shopping-quick-add-btn';
    quickAddButton.textContent = 'Search books';
    const searchResults = document.createElement('div');
    searchResults.className = 'shopping-book-search-results';
    searchResults.style.display = 'none';
    quickAddContainer.appendChild(quickAddSearch);
    quickAddContainer.appendChild(quickAddButton);
    quickAddContainer.appendChild(searchResults);
    bookSection.appendChild(bookLabel);
    bookSection.appendChild(linkedBooksList);
    bookSection.appendChild(bookSelectorContainer);
    bookSection.appendChild(quickAddContainer);
    card.appendChild(bookSection);

    const bookSelector = createBookSelector(bookSelectorContainer, stateAdapter, {
        selectedBookId: null,
        placeholder: 'Select a book from Library',
        appendTo: 'body',
        onSelect: (bookId) => {
            if (!bookId || !linkedBookIds.includes(bookId)) linkedBookIds = [...linkedBookIds, bookId].filter(Boolean);
            updateLinkedBooksDisplay();
            if (bookSelector && typeof bookSelector.setSelectedBookId === 'function') bookSelector.setSelectedBookId(null);
        }
    });

    const runApiSearch = async () => {
        const query = trimOrEmpty(quickAddSearch.value);
        if (!query || query.length < 2) {
            searchResults.style.display = 'none';
            clearElement(searchResults);
            return;
        }
        if (bookSearchAbortController) bookSearchAbortController.abort();
        bookSearchAbortController = new AbortController();
        const signal = bookSearchAbortController.signal;
        searchResults.style.display = 'block';
        clearElement(searchResults);
        const loading = document.createElement('div');
        loading.className = 'shopping-book-search-loading';
        loading.textContent = 'Searching…';
        searchResults.appendChild(loading);
        try {
            const results = await searchBooks(query, undefined, signal);
            if (signal.aborted) return;
            if (!results || results.length === 0) {
                clearElement(searchResults);
                const empty = document.createElement('div');
                empty.className = 'shopping-book-search-empty';
                empty.textContent = 'No matches found.';
                searchResults.appendChild(empty);
                return;
            }
            const list = document.createElement('div');
            list.className = 'shopping-book-search-list';
            results.forEach((book) => {
                const item = document.createElement('button');
                item.type = 'button';
                item.className = 'shopping-book-search-item';
                const authorStr = Array.isArray(book.authors) && book.authors.length ? book.authors.join(', ') : '';
                item.innerHTML = '';
                const coverWrap = document.createElement('span');
                coverWrap.className = 'shopping-book-search-cover-wrap';
                if (isSafeHttpUrl(book.coverUrl)) {
                    const cover = document.createElement('img');
                    cover.className = 'shopping-book-search-cover';
                    cover.src = book.coverUrl;
                    cover.alt = '';
                    cover.loading = 'lazy';
                    coverWrap.appendChild(cover);
                } else {
                    const placeholder = document.createElement('span');
                    placeholder.className = 'shopping-book-search-cover placeholder';
                    placeholder.textContent = 'No cover';
                    coverWrap.appendChild(placeholder);
                }
                const textWrap = document.createElement('span');
                textWrap.className = 'shopping-book-search-text';
                const title = document.createElement('span');
                title.className = 'shopping-book-search-title';
                title.textContent = book.title || '';
                textWrap.appendChild(title);
                if (authorStr) {
                    const author = document.createElement('span');
                    author.className = 'shopping-book-search-author';
                    author.textContent = authorStr;
                    textWrap.appendChild(author);
                }
                item.appendChild(coverWrap);
                item.appendChild(textWrap);
                item.addEventListener('click', () => {
                    if (!stateAdapter || typeof stateAdapter.addBook !== 'function') return;
                    const newBook = stateAdapter.addBook({
                        title: book.title || '',
                        author: authorStr,
                        cover: book.coverUrl || null,
                        pageCount: book.pageCount != null ? Number(book.pageCount) : null,
                        status: 'reading',
                        shelfCategory: 'physical-tbr'
                    });
                    if (newBook && newBook.id && !linkedBookIds.includes(newBook.id)) {
                        linkedBookIds = [...linkedBookIds, newBook.id];
                        updateLinkedBooksDisplay();
                    }
                    if (bookSelector && typeof bookSelector.setSelectedBookId === 'function') bookSelector.setSelectedBookId(null);
                    searchResults.style.display = 'none';
                    clearElement(searchResults);
                    quickAddSearch.value = '';
                });
                list.appendChild(item);
            });
            clearElement(searchResults);
            searchResults.appendChild(list);
        } catch (err) {
            if (err && err.name === 'AbortError') return;
            searchResults.style.display = 'block';
            clearElement(searchResults);
            const error = document.createElement('div');
            error.className = 'shopping-book-search-error';
            error.textContent = 'Search failed. Please try again.';
            searchResults.appendChild(error);
        }
    };
    quickAddButton.addEventListener('click', (e) => { e.preventDefault(); runApiSearch(); });
    let debounceTimer = null;
    quickAddSearch.addEventListener('input', () => {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(runApiSearch, 600);
    });

    const skipSection = document.createElement('div');
    skipSection.className = 'shopping-sub-skip-section';
    const skipsRemainingEl = document.createElement('p');
    skipsRemainingEl.className = 'shopping-sub-skips-remaining';
    function updateSkipsRemaining() {
        const sid = subSelect.value;
        if (!sid) return;
        const n = stateAdapter ? stateAdapter.getSubscriptionSkipsRemaining(sid) : 0;
        skipsRemainingEl.textContent = `Skips remaining this year: ${n}`;
    }
    subSelect.addEventListener('change', updateSkipsRemaining);
    updateSkipsRemaining();
    skipSection.appendChild(skipsRemainingEl);
    card.appendChild(skipSection);

    const errorContainer = document.createElement('div');
    errorContainer.className = 'error-message';
    errorContainer.style.display = 'none';
    errorContainer.style.color = '#d32f2f';
    errorContainer.style.marginTop = '0.5rem';
    card.appendChild(errorContainer);

    const buttonContainer = document.createElement('div');
    buttonContainer.className = 'shopping-button-container';
    const logButton = document.createElement('button');
    logButton.type = 'button';
    logButton.className = 'redeem-button shopping-sub-log-btn';
    logButton.textContent = 'Log month';

    function setLogButtonLabel() {
        logButton.textContent = typeCheckbox.checked ? 'Log skip' : 'Log purchase';
    }
    function updateTypeDisplay() {
        typeValueLabel.textContent = typeCheckbox.checked ? 'Skip' : 'Purchase';
        purchaseSection.style.display = typeCheckbox.checked ? 'none' : 'block';
        skipSection.style.display = typeCheckbox.checked ? 'block' : 'none';
        setLogButtonLabel();
    }
    typeWrap.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        typeCheckbox.checked = !typeCheckbox.checked;
        updateTypeDisplay();
    });
    typeCheckbox.addEventListener('change', updateTypeDisplay);
    skipSection.style.display = 'none';
    setLogButtonLabel();

    logButton.addEventListener('click', async () => {
        const subscriptionId = subSelect.value;
        if (!subscriptionId) {
            showError(errorContainer, 'Select a subscription.');
            return;
        }
        const month = monthSelect.value;
        const year = trimOrEmpty(yearInput.value) || String(new Date().getFullYear());
        const isSkip = typeCheckbox.checked;

        if (isSkip) {
            const skipsRemaining = stateAdapter ? stateAdapter.getSubscriptionSkipsRemaining(subscriptionId, parseInt(year, 10)) : 0;
            if (skipsRemaining <= 0) {
                if (!confirm('This subscription has no skips remaining for this year. Log anyway?')) return;
            }
            const record = stateAdapter.addBookBoxHistoryEntry({
                subscriptionId,
                month: month.padStart(2, '0'),
                year,
                type: 'skipped'
            });
            if (record) {
                renderShoppingSummary();
                logButton.disabled = true;
                logButton.textContent = 'Logged';
                setTimeout(() => {
                    logButton.disabled = false;
                    setLogButtonLabel();
                }, 2000);
            } else {
                showError(errorContainer, 'Could not save skip.');
            }
            return;
        }

        const current = getCurrentResources();
        if (current.inkDrops < option.inkDrops) {
            showError(errorContainer, `Insufficient Ink Drops. You have ${current.inkDrops}, need ${option.inkDrops}.`);
            return;
        }
        if (current.paperScraps < option.paperScraps) {
            showError(errorContainer, `Insufficient Paper Scraps. You have ${current.paperScraps}, need ${option.paperScraps}.`);
            return;
        }

        const actualMoneyRaw = moneyInput.value;
        const actualSpend = actualMoneyRaw != null && actualMoneyRaw !== '' ? parseFloat(actualMoneyRaw) : null;
        const logDate = dateInput.value && dateInput.value.trim() ? dateInput.value.trim() : new Date().toISOString().slice(0, 10);

        const originalLabel = logButton.textContent;
        logButton.disabled = true;
        logButton.textContent = 'Logging...';
        try {
            stateAdapter.addBookBoxHistoryEntry({
                subscriptionId,
                month: month.padStart(2, '0'),
                year,
                type: 'purchased',
                actualSpend: typeof actualSpend === 'number' && !isNaN(actualSpend) ? actualSpend : null,
                inkDrops: option.inkDrops,
                paperScraps: option.paperScraps,
                bookIds: linkedBookIds
            });
            await appendShoppingLogEntry({
                optionId: option.id,
                linkedBookIds,
                actualMoneySpent: typeof actualSpend === 'number' && !isNaN(actualSpend) ? actualSpend : null,
                storeName: null,
                logDate,
                inkDrops: option.inkDrops,
                paperScraps: option.paperScraps
            });
        } catch (_) {
            showError(errorContainer, 'Could not save. Please try again.');
            logButton.disabled = false;
            logButton.textContent = originalLabel;
            return;
        }
        updateResources(current.inkDrops - option.inkDrops, current.paperScraps - option.paperScraps);
        renderShoppingSummary();
        logButton.disabled = false;
        logButton.textContent = 'Logged';
        setTimeout(() => {
            logButton.textContent = originalLabel;
        }, 2000);
    });

    buttonContainer.appendChild(logButton);
    card.appendChild(buttonContainer);
    return card;
}

/**
 * @param {ShoppingOption} option
 * @returns {HTMLElement}
 */
function createShoppingOptionCard(option) {
    if (option.type === 'subscription-month') {
        return createSubscriptionMonthCard(option);
    }

    const card = document.createElement('div');
    card.className = 'shopping-option';

    const nameEl = document.createElement('h3');
    nameEl.textContent = option.label;
    card.appendChild(nameEl);

    const descEl = document.createElement('p');
    descEl.textContent = option.description;
    card.appendChild(descEl);

    const costEl = document.createElement('div');
    costEl.className = 'shopping-cost';
    const costs = [];
    if (option.inkDrops > 0) costs.push(`${option.inkDrops} Ink Drops`);
    if (option.paperScraps > 0) costs.push(`${option.paperScraps} Paper Scraps`);
    costEl.textContent = `Cost: ${costs.join(' + ')}`;
    card.appendChild(costEl);

    let quantityInput = null;
    if (option.allowQuantity) {
        const quantityContainer = document.createElement('div');
        quantityContainer.className = 'shopping-quantity';
        const quantityLabel = document.createElement('label');
        quantityLabel.textContent = 'Quantity: ';
        quantityLabel.setAttribute('for', `quantity-${option.id}`);
        quantityInput = document.createElement('input');
        quantityInput.type = 'number';
        quantityInput.id = `quantity-${option.id}`;
        quantityInput.className = 'shopping-quantity-input';
        quantityInput.min = '1';
        quantityInput.value = '1';
        quantityContainer.appendChild(quantityLabel);
        quantityContainer.appendChild(quantityInput);
        card.appendChild(quantityContainer);
    }

    const errorContainer = document.createElement('div');
    errorContainer.className = 'error-message';
    errorContainer.style.display = 'none';
    errorContainer.style.color = '#d32f2f';
    errorContainer.style.marginTop = '0.5rem';
    card.appendChild(errorContainer);

    const buttonContainer = document.createElement('div');
    buttonContainer.className = 'shopping-button-container';
    const redeemButton = document.createElement('button');
    redeemButton.type = 'button';
    redeemButton.className = 'redeem-button';
    redeemButton.textContent = 'Redeem';

    const metaContainer = document.createElement('div');
    metaContainer.className = 'shopping-meta';
    const formRow = document.createElement('div');
    formRow.className = 'shopping-meta-row';

    const storeInput = document.createElement('input');
    storeInput.type = 'text';
    storeInput.className = 'shopping-store-input';
    storeInput.placeholder = 'Store / vendor (optional)';
    storeInput.setAttribute('aria-label', 'Store or vendor name');

    const moneyInput = document.createElement('input');
    moneyInput.type = 'number';
    moneyInput.className = 'shopping-money-input';
    moneyInput.placeholder = 'Money spent (optional)';
    moneyInput.step = '0.01';
    moneyInput.min = '0';
    moneyInput.setAttribute('aria-label', 'Actual money spent');

    const dateInput = document.createElement('input');
    dateInput.type = 'date';
    dateInput.className = 'shopping-date-input';
    dateInput.setAttribute('aria-label', 'Date of purchase');
    dateInput.value = new Date().toISOString().slice(0, 10);

    formRow.appendChild(storeInput);
    formRow.appendChild(moneyInput);
    formRow.appendChild(dateInput);
    metaContainer.appendChild(formRow);
    card.appendChild(metaContainer);

    let linkedBookIds = [];
    if (stateAdapter && (option.type === 'book-purchase' || option.type === 'subscription-month' || option.type === 'special-edition')) {
        const bookSection = document.createElement('div');
        bookSection.className = 'shopping-book-section';

        const bookLabel = document.createElement('div');
        bookLabel.className = 'shopping-book-label';
        bookLabel.textContent = 'Link or add a book for this purchase (optional):';

        const linkedBooksList = document.createElement('div');
        linkedBooksList.className = 'shopping-linked-books-list';
        linkedBooksList.setAttribute('aria-label', 'Books linked to this purchase');

        function updateLinkedBooksDisplay() {
            clearElement(linkedBooksList);
            linkedBooksList.style.display = linkedBookIds.length ? 'flex' : 'none';
            linkedBookIds.forEach((bookId) => {
                const book = stateAdapter && typeof stateAdapter.getBook === 'function' ? stateAdapter.getBook(bookId) : null;
                const chip = document.createElement('span');
                chip.className = 'shopping-linked-book-chip';
                chip.textContent = book && book.title ? String(book.title) : bookId;
                linkedBooksList.appendChild(chip);
            });
        }

        const bookSelectorContainer = document.createElement('div');
        bookSelectorContainer.className = 'shopping-book-selector-container';
        const quickAddContainer = document.createElement('div');
        quickAddContainer.className = 'shopping-quick-add-container';
        const quickAddSearch = document.createElement('input');
        quickAddSearch.type = 'text';
        quickAddSearch.className = 'shopping-quick-add-search';
        quickAddSearch.placeholder = 'Search title or author…';
        quickAddSearch.setAttribute('aria-label', 'Search for a book to add');
        const quickAddButton = document.createElement('button');
        quickAddButton.type = 'button';
        quickAddButton.className = 'rpg-btn rpg-btn-secondary shopping-quick-add-btn';
        quickAddButton.textContent = 'Search books';
        const searchResults = document.createElement('div');
        searchResults.className = 'shopping-book-search-results';
        searchResults.style.display = 'none';

        quickAddContainer.appendChild(quickAddSearch);
        quickAddContainer.appendChild(quickAddButton);
        quickAddContainer.appendChild(searchResults);

        bookSection.appendChild(bookLabel);
        bookSection.appendChild(linkedBooksList);
        bookSection.appendChild(bookSelectorContainer);
        bookSection.appendChild(quickAddContainer);
        card.appendChild(bookSection);

        const bookSelector = createBookSelector(bookSelectorContainer, stateAdapter, {
            selectedBookId: null,
            placeholder: 'Select a book from Library',
            appendTo: 'body',
            onSelect: (bookId) => {
                if (!bookId) return;
                if (!linkedBookIds.includes(bookId)) {
                    linkedBookIds = [...linkedBookIds, bookId];
                    updateLinkedBooksDisplay();
                }
                if (bookSelector && typeof bookSelector.setSelectedBookId === 'function') {
                    bookSelector.setSelectedBookId(null);
                }
            }
        });

        const runApiSearch = async () => {
            const query = trimOrEmpty(quickAddSearch.value);
            if (!query || query.length < 2) {
                searchResults.style.display = 'none';
                clearElement(searchResults);
                return;
            }
            if (bookSearchAbortController) {
                bookSearchAbortController.abort();
            }
            bookSearchAbortController = new AbortController();
            const signal = bookSearchAbortController.signal;
            searchResults.style.display = 'block';
            clearElement(searchResults);
            const loading = document.createElement('div');
            loading.className = 'shopping-book-search-loading';
            loading.textContent = 'Searching…';
            searchResults.appendChild(loading);
            try {
                const results = await searchBooks(query, undefined, signal);
                if (signal.aborted) return;
                if (!results || results.length === 0) {
                    clearElement(searchResults);
                    const empty = document.createElement('div');
                    empty.className = 'shopping-book-search-empty';
                    empty.textContent = 'No matches found.';
                    searchResults.appendChild(empty);
                    return;
                }
                const list = document.createElement('div');
                list.className = 'shopping-book-search-list';
                results.forEach((book) => {
                    const item = document.createElement('button');
                    item.type = 'button';
                    item.className = 'shopping-book-search-item';
                    const authorStr = Array.isArray(book.authors) && book.authors.length ? book.authors.join(', ') : '';
                    const pageStr = book.pageCount != null && book.pageCount !== '' ? ` · ${Number(book.pageCount)} pp` : '';

                    const coverWrap = document.createElement('span');
                    coverWrap.className = 'shopping-book-search-cover-wrap';
                    if (isSafeHttpUrl(book.coverUrl)) {
                        const cover = document.createElement('img');
                        cover.className = 'shopping-book-search-cover';
                        cover.src = book.coverUrl;
                        cover.alt = '';
                        cover.loading = 'lazy';
                        cover.addEventListener('error', () => {
                            cover.style.display = 'none';
                        });
                        coverWrap.appendChild(cover);
                    } else {
                        const placeholder = document.createElement('span');
                        placeholder.className = 'shopping-book-search-cover placeholder';
                        placeholder.textContent = 'No cover';
                        coverWrap.appendChild(placeholder);
                    }

                    const textWrap = document.createElement('span');
                    textWrap.className = 'shopping-book-search-text';
                    const title = document.createElement('span');
                    title.className = 'shopping-book-search-title';
                    title.textContent = book.title || '';
                    textWrap.appendChild(title);
                    if (authorStr) {
                        const author = document.createElement('span');
                        author.className = 'shopping-book-search-author';
                        author.textContent = authorStr;
                        textWrap.appendChild(author);
                    }
                    if (pageStr) {
                        const meta = document.createElement('span');
                        meta.className = 'shopping-book-search-meta';
                        meta.textContent = pageStr;
                        textWrap.appendChild(meta);
                    }

                    item.appendChild(coverWrap);
                    item.appendChild(textWrap);
                    item.addEventListener('click', () => {
                        if (!stateAdapter || typeof stateAdapter.addBook !== 'function') return;
                        const newBook = stateAdapter.addBook({
                            title: book.title || '',
                            author: authorStr,
                            cover: book.coverUrl || null,
                            pageCount: book.pageCount != null ? Number(book.pageCount) : null,
                            status: 'reading',
                            shelfCategory: 'physical-tbr'
                        });
                        if (newBook && newBook.id && !linkedBookIds.includes(newBook.id)) {
                            linkedBookIds = [...linkedBookIds, newBook.id];
                            updateLinkedBooksDisplay();
                        }
                        if (bookSelector && typeof bookSelector.setSelectedBookId === 'function') {
                            bookSelector.setSelectedBookId(null);
                        }
                        searchResults.style.display = 'none';
                        clearElement(searchResults);
                        quickAddSearch.value = '';
                    });
                    list.appendChild(item);
                });
                clearElement(searchResults);
                searchResults.appendChild(list);
            } catch (err) {
                if (err && err.name === 'AbortError') return;
                searchResults.style.display = 'block';
                clearElement(searchResults);
                const error = document.createElement('div');
                error.className = 'shopping-book-search-error';
                error.textContent = 'Search failed. Please try again.';
                searchResults.appendChild(error);
            }
        };

        quickAddButton.addEventListener('click', (e) => {
            e.preventDefault();
            runApiSearch();
        });

        let debounceTimer = null;
        quickAddSearch.addEventListener('input', () => {
            clearTimeout(debounceTimer);
            debounceTimer = setTimeout(runApiSearch, 600);
        });
    }

    redeemButton.addEventListener('click', async () => {
        const quantity = option.allowQuantity && quantityInput
            ? Math.max(1, parseIntOr(quantityInput.value, 1))
            : 1;
        const totalInkDrops = option.inkDrops * quantity;
        const totalPaperScraps = option.paperScraps * quantity;
        const current = getCurrentResources();

        if (current.inkDrops < totalInkDrops) {
            showError(errorContainer, `Insufficient Ink Drops. You have ${current.inkDrops}, but need ${totalInkDrops}.`);
            return;
        }
        if (current.paperScraps < totalPaperScraps) {
            showError(errorContainer, `Insufficient Paper Scraps. You have ${current.paperScraps}, but need ${totalPaperScraps}.`);
            return;
        }

        const actualMoneyRaw = moneyInput.value;
        const actualMoney = actualMoneyRaw != null && actualMoneyRaw !== '' ? parseFloat(actualMoneyRaw) : null;
        const storeName = trimOrEmpty(storeInput.value || '') || null;
        const logDate = dateInput.value && dateInput.value.trim() ? dateInput.value.trim() : new Date().toISOString().slice(0, 10);

        const originalButtonLabel = redeemButton.textContent;
        redeemButton.disabled = true;
        redeemButton.textContent = 'Redeeming...';
        try {
            await appendShoppingLogEntry({
                optionId: option.id,
                linkedBookIds,
                actualMoneySpent: typeof actualMoney === 'number' && !isNaN(actualMoney) ? actualMoney : null,
                storeName,
                logDate,
                inkDrops: totalInkDrops,
                paperScraps: totalPaperScraps
            });
        } catch (_) {
            showError(errorContainer, 'Could not save this purchase. Please try again.');
            redeemButton.disabled = false;
            redeemButton.textContent = originalButtonLabel;
            return;
        }

        updateResources(current.inkDrops - totalInkDrops, current.paperScraps - totalPaperScraps);
        renderShoppingSummary();
        redeemButton.disabled = false;
        redeemButton.textContent = originalButtonLabel;

        const successMsg = document.createElement('div');
        successMsg.className = 'success-message';
        successMsg.style.color = '#2e7d32';
        successMsg.style.marginTop = '0.5rem';
        successMsg.textContent = `✓ Redeemed successfully! ${quantity > 1 ? `(${quantity}x)` : ''}`;
        errorContainer.style.display = 'none';
        card.insertBefore(successMsg, errorContainer);
        setTimeout(() => {
            successMsg.remove();
        }, 3000);
    });

    buttonContainer.appendChild(redeemButton);
    card.appendChild(buttonContainer);
    return card;
}

function renderShoppingSummary() {
    const summaryContainerId = 'shopping-log-summary';
    let summaryContainer = document.getElementById(summaryContainerId);
    if (!summaryContainer) {
        const parent = document.getElementById('shopping-options-container')?.parentElement || document.body;
        summaryContainer = document.createElement('div');
        summaryContainer.id = summaryContainerId;
        summaryContainer.className = 'shopping-log-summary';
        parent.appendChild(summaryContainer);
    }

    clearElement(summaryContainer);
    const byMonth = new Map();
    (shoppingLog || []).forEach((entry) => {
        const d = typeof entry.logDate === 'string' ? entry.logDate : '';
        const key = d && d.length >= 7 ? d.slice(0, 7) : 'unknown';
        if (!byMonth.has(key)) byMonth.set(key, { entries: [], inkDrops: 0, paperScraps: 0, actualMoneySpent: 0 });
        const bucket = byMonth.get(key);
        bucket.entries.push(entry);
        bucket.inkDrops += typeof entry.inkDrops === 'number' ? entry.inkDrops : 0;
        bucket.paperScraps += typeof entry.paperScraps === 'number' ? entry.paperScraps : 0;
        const spend = typeof entry.actualMoneySpent === 'number' && !isNaN(entry.actualMoneySpent) ? entry.actualMoneySpent : 0;
        bucket.actualMoneySpent += spend;
    });

    const months = Array.from(byMonth.keys()).sort().reverse();
    const selectedKey = (summaryContainer.dataset.selectedMonthKey || '').trim() || months[0];
    if (!months.includes(selectedKey)) {
        delete summaryContainer.dataset.selectedMonthKey;
    }
    if (months.length === 0) {
        const heading = document.createElement('h2');
        heading.textContent = 'Shopping Log';
        const copy = document.createElement('p');
        copy.textContent =
            'No purchases logged yet. When you redeem a shopping option, a log entry will appear here with monthly totals.';
        summaryContainer.appendChild(heading);
        summaryContainer.appendChild(copy);
        return;
    }
    const currentKey = months.includes(selectedKey) ? selectedKey : months[0];
    if (currentKey !== selectedKey) summaryContainer.dataset.selectedMonthKey = currentKey;
    const latest = byMonth.get(currentKey);
    const monthLabel = currentKey === 'unknown' ? 'Unknown period' : currentKey;

    const heading = document.createElement('h2');
    heading.textContent = `Shopping Log — ${monthLabel}`;
    summaryContainer.appendChild(heading);

    if (months.length > 1) {
        const monthSelectWrap = document.createElement('div');
        monthSelectWrap.className = 'shopping-log-month-select-wrap';
        const monthLabelEl = document.createElement('label');
        monthLabelEl.setAttribute('for', 'shopping-log-month-select');
        monthLabelEl.textContent = 'Month: ';
        const monthSelect = document.createElement('select');
        monthSelect.id = 'shopping-log-month-select';
        monthSelect.className = 'shopping-log-month-select';
        monthSelect.setAttribute('aria-label', 'Select month to view');
        months.forEach((key) => {
            const opt = document.createElement('option');
            opt.value = key;
            opt.textContent = key === 'unknown' ? 'Unknown period' : key;
            opt.selected = key === currentKey;
            monthSelect.appendChild(opt);
        });
        monthSelect.addEventListener('change', () => {
            summaryContainer.dataset.selectedMonthKey = monthSelect.value;
            renderShoppingSummary();
        });
        monthSelectWrap.appendChild(monthLabelEl);
        monthSelectWrap.appendChild(monthSelect);
        summaryContainer.appendChild(monthSelectWrap);
    }

    const totals = document.createElement('p');
    totals.className = 'shopping-log-totals';
    totals.appendChild(document.createTextNode('Totals: '));
    const inkStrong = document.createElement('strong');
    inkStrong.textContent = String(latest.inkDrops);
    totals.appendChild(inkStrong);
    totals.appendChild(document.createTextNode(' Ink Drops · '));
    const paperStrong = document.createElement('strong');
    paperStrong.textContent = String(latest.paperScraps);
    totals.appendChild(paperStrong);
    totals.appendChild(document.createTextNode(' Paper Scraps'));
    if (latest.actualMoneySpent != null && latest.actualMoneySpent > 0) {
        totals.appendChild(document.createTextNode(' · Money spent: '));
        const moneyStrong = document.createElement('strong');
        moneyStrong.textContent = `$${Number(latest.actualMoneySpent).toFixed(2)}`;
        totals.appendChild(moneyStrong);
    } else {
        totals.appendChild(document.createTextNode(' · Money spent: —'));
    }
    summaryContainer.appendChild(totals);

    const list = document.createElement('ul');
    list.className = 'shopping-log-list';
    latest.entries.forEach((entry) => {
        const row = document.createElement('li');
        row.className = 'shopping-log-row';

        const main = document.createElement('div');
        main.className = 'shopping-log-row-main';
        const dateSpan = document.createElement('span');
        dateSpan.className = 'shopping-log-date';
        dateSpan.textContent = typeof entry.logDate === 'string' ? entry.logDate : '';
        appendNodeWithSpace(main, dateSpan);

        const opt = shoppingOptionsById.get(entry.optionId) || null;
        const labelSpan = document.createElement('span');
        labelSpan.className = 'shopping-log-label';
        labelSpan.textContent = opt ? opt.label : entry.optionId || 'Purchase';
        appendNodeWithSpace(main, labelSpan);

        if (entry.storeName) {
            const storeSpan = document.createElement('span');
            storeSpan.className = 'shopping-log-store';
            storeSpan.textContent = `@ ${entry.storeName}`;
            appendNodeWithSpace(main, storeSpan);
        }

        const currencySpan = document.createElement('span');
        currencySpan.className = 'shopping-log-currency';
        currencySpan.textContent = `-${entry.inkDrops || 0} Ink · -${entry.paperScraps || 0} Paper`;
        appendNodeWithSpace(main, currencySpan);

        if (typeof entry.actualMoneySpent === 'number' && !isNaN(entry.actualMoneySpent)) {
            const moneySpan = document.createElement('span');
            moneySpan.className = 'shopping-log-money';
            moneySpan.textContent = `$${entry.actualMoneySpent.toFixed(2)}`;
            appendNodeWithSpace(main, moneySpan);
        }

        row.appendChild(main);

        const linkedIds = Array.isArray(entry.linkedBookIds) ? entry.linkedBookIds : [];
        if (linkedIds.length > 0 && stateAdapter && typeof stateAdapter.getBook === 'function') {
            const details = document.createElement('details');
            details.className = 'shopping-log-books-details';
            const summary = document.createElement('summary');
            summary.className = 'shopping-log-books-summary';
            summary.textContent = `Books (${linkedIds.length})`;
            details.appendChild(summary);
            const bookList = document.createElement('ul');
            bookList.className = 'shopping-log-books-list';
            linkedIds.forEach((bookId) => {
                const book = stateAdapter.getBook(bookId);
                const title = book && book.title ? String(book.title) : bookId;
                const li = document.createElement('li');
                li.className = 'shopping-log-book-item';
                li.textContent = title;
                bookList.appendChild(li);
            });
            details.appendChild(bookList);
            row.appendChild(details);
        }

        list.appendChild(row);
    });

    summaryContainer.appendChild(list);
}

function renderSubscriptionsList() {
    const container = document.getElementById('book-box-subscriptions-list');
    if (!container || !stateAdapter) return;

    const list = stateAdapter.getBookBoxSubscriptionsList() || [];
    container.innerHTML = '';

    if (list.length === 0) {
        const empty = document.createElement('p');
        empty.className = 'book-box-subscriptions-empty';
        empty.textContent = 'No subscriptions yet. Add one above, then log each month in the Shop tab.';
        container.appendChild(empty);
        return;
    }

    list.forEach((sub) => {
        const skipsRemaining = stateAdapter.getSubscriptionSkipsRemaining(sub.id);

        const card = document.createElement('div');
        card.className = 'book-box-sub-card';
        card.dataset.bookBoxSubscriptionId = sub.id;

        const viewDiv = document.createElement('div');
        viewDiv.className = 'book-box-sub-card-view';
        viewDiv.innerHTML = `
            <div class="book-box-sub-card-header">
                <strong class="book-box-sub-card-title">${escapeHtml(sub.company || 'Unnamed')}${sub.tier ? ` · ${escapeHtml(sub.tier)}` : ''}</strong>
                <div class="book-box-sub-card-actions">
                    <button type="button" class="rpg-btn rpg-btn-secondary book-box-sub-edit-btn" data-subscription-id="${escapeHtml(sub.id)}" aria-label="Edit subscription">Edit</button>
                    <button type="button" class="rpg-btn rpg-btn-secondary book-box-sub-delete-btn" data-subscription-id="${escapeHtml(sub.id)}" aria-label="Delete subscription">Delete</button>
                </div>
            </div>
            <div class="book-box-sub-card-meta">
                ${sub.defaultMonthlyCost != null ? `<span>Default: $${Number(sub.defaultMonthlyCost).toFixed(2)}/mo</span>` : ''}
                <span>Skips this year: <strong>${skipsRemaining}</strong> / ${sub.skipsAllowedPerYear ?? 0}</span>
            </div>
        `;

        const editDiv = document.createElement('div');
        editDiv.className = 'book-box-sub-card-edit';
        editDiv.hidden = true;
        editDiv.innerHTML = `
            <div class="book-box-sub-edit-row">
                <label>Company</label>
                <input type="text" class="book-box-sub-edit-company" value="${escapeHtml(sub.company || '')}" />
            </div>
            <div class="book-box-sub-edit-row">
                <label>Tier</label>
                <input type="text" class="book-box-sub-edit-tier" value="${escapeHtml(sub.tier || '')}" />
            </div>
            <div class="book-box-sub-edit-row">
                <label>Default cost ($)</label>
                <input type="number" class="book-box-sub-edit-cost" min="0" step="0.01" value="${sub.defaultMonthlyCost != null ? escapeHtml(String(sub.defaultMonthlyCost)) : ''}" placeholder="Optional" />
            </div>
            <div class="book-box-sub-edit-row">
                <label>Skips per year</label>
                <input type="number" class="book-box-sub-edit-skips" min="0" value="${sub.skipsAllowedPerYear ?? 0}" />
            </div>
            <div class="book-box-sub-edit-actions">
                <button type="button" class="rpg-btn rpg-btn-primary book-box-sub-save-edit-btn" data-subscription-id="${escapeHtml(sub.id)}">Save</button>
                <button type="button" class="rpg-btn rpg-btn-secondary book-box-sub-cancel-edit-btn" data-subscription-id="${escapeHtml(sub.id)}">Cancel</button>
            </div>
        `;

        card.appendChild(viewDiv);
        card.appendChild(editDiv);
        container.appendChild(card);
    });
}

function setupSubscriptionsPanel() {
    const container = document.getElementById('shopping-subscriptions-container');
    if (!container || !stateAdapter) return;

    container.innerHTML = `
        <div class="rpg-panel rpg-book-box-subscriptions-panel">
            <div class="rpg-panel-header">
                <h2 class="rpg-panel-title">📦 Book Box Subscriptions</h2>
                <p class="rpg-panel-subtitle">Define subscriptions here, then log each month in the <strong>Shop</strong> tab using “One Month of a Book Box Subscription”.</p>
            </div>
            <div class="rpg-panel-body">
                <div class="book-box-subscriptions-add-form">
                    <div class="form-row book-box-sub-form-row">
                        <label for="book-box-sub-company"><strong>Company:</strong></label>
                        <input type="text" id="book-box-sub-company" class="book-box-sub-input" placeholder="e.g. Fairyloot" />
                    </div>
                    <div class="form-row book-box-sub-form-row">
                        <label for="book-box-sub-tier"><strong>Tier:</strong></label>
                        <input type="text" id="book-box-sub-tier" class="book-box-sub-input" placeholder="e.g. Adult" />
                    </div>
                    <div class="form-row book-box-sub-form-row book-box-sub-meta-row">
                        <label for="book-box-sub-default-cost"><strong>Default monthly cost ($):</strong></label>
                        <input type="number" id="book-box-sub-default-cost" class="book-box-sub-number" min="0" step="0.01" placeholder="Optional" aria-label="Default monthly cost in dollars" />
                        <label for="book-box-sub-skips"><strong>Skips per year:</strong></label>
                        <input type="number" id="book-box-sub-skips" class="book-box-sub-number" min="0" value="0" aria-label="Skips allowed per year" />
                    </div>
                    <div class="form-row book-box-sub-actions">
                        <button type="button" id="book-box-sub-add-btn" class="rpg-btn rpg-btn-primary">Add Subscription</button>
                    </div>
                </div>
                <div id="book-box-subscriptions-list" class="book-box-subscriptions-list" aria-live="polite"></div>
            </div>
        </div>
    `;

    const addBtn = document.getElementById('book-box-sub-add-btn');
    if (addBtn) {
        addBtn.addEventListener('click', () => {
            const company = trimOrEmpty(document.getElementById('book-box-sub-company')?.value || '');
            const tier = trimOrEmpty(document.getElementById('book-box-sub-tier')?.value || '');
            const defaultCostEl = document.getElementById('book-box-sub-default-cost');
            const skipsEl = document.getElementById('book-box-sub-skips');
            const defaultMonthlyCost = defaultCostEl && defaultCostEl.value !== '' ? parseFloat(defaultCostEl.value) : null;
            const skipsAllowedPerYear = skipsEl ? Math.max(0, parseInt(skipsEl.value, 10) || 0) : 0;

            if (!company) {
                const listEl = document.getElementById('book-box-subscriptions-list');
                if (listEl) {
                    const msg = document.createElement('p');
                    msg.className = 'book-box-sub-error';
                    msg.setAttribute('role', 'alert');
                    msg.textContent = 'Company name is required.';
                    listEl.insertBefore(msg, listEl.firstChild);
                    setTimeout(() => msg.remove(), 3000);
                }
                return;
            }

            stateAdapter.addBookBoxSubscription({
                company,
                tier,
                defaultMonthlyCost: typeof defaultMonthlyCost === 'number' && !isNaN(defaultMonthlyCost) ? defaultMonthlyCost : null,
                skipsAllowedPerYear
            });
            void setStateKey(STORAGE_KEYS.BOOK_BOX_SUBSCRIPTIONS, characterState[STORAGE_KEYS.BOOK_BOX_SUBSCRIPTIONS]);
            document.getElementById('book-box-sub-company').value = '';
            document.getElementById('book-box-sub-tier').value = '';
            if (defaultCostEl) defaultCostEl.value = '';
            if (skipsEl) skipsEl.value = '0';
            renderSubscriptionsList();
        });
    }

    container.addEventListener('click', (e) => {
        const deleteBtn = e.target.closest('.book-box-sub-delete-btn');
        const editBtn = e.target.closest('.book-box-sub-edit-btn');
        const cancelEditBtn = e.target.closest('.book-box-sub-cancel-edit-btn');
        const saveEditBtn = e.target.closest('.book-box-sub-save-edit-btn');
        if (deleteBtn?.dataset.subscriptionId) {
            e.preventDefault();
            if (!confirm('Remove this subscription? Monthly history will be kept, but the subscription definition will be removed.')) return;
            stateAdapter.deleteBookBoxSubscription(deleteBtn.dataset.subscriptionId);
            void setStateKey(STORAGE_KEYS.BOOK_BOX_SUBSCRIPTIONS, characterState[STORAGE_KEYS.BOOK_BOX_SUBSCRIPTIONS]);
            renderSubscriptionsList();
            return;
        }
        if (editBtn?.dataset.subscriptionId) {
            e.preventDefault();
            const subscriptionId = editBtn.dataset.subscriptionId;
            const sub = stateAdapter.getBookBoxSubscription(subscriptionId);
            if (!sub) return;
            const card = document.querySelector(`[data-book-box-subscription-id="${subscriptionId}"]`);
            if (!card) return;
            const viewEl = card.querySelector('.book-box-sub-card-view');
            const editEl = card.querySelector('.book-box-sub-card-edit');
            if (!viewEl || !editEl) return;
            editEl.querySelector('.book-box-sub-edit-company').value = sub.company || '';
            editEl.querySelector('.book-box-sub-edit-tier').value = sub.tier || '';
            editEl.querySelector('.book-box-sub-edit-cost').value = sub.defaultMonthlyCost != null ? String(sub.defaultMonthlyCost) : '';
            editEl.querySelector('.book-box-sub-edit-skips').value = String(sub.skipsAllowedPerYear ?? 0);
            viewEl.hidden = true;
            editEl.hidden = false;
            return;
        }
        if (cancelEditBtn?.dataset.subscriptionId) {
            e.preventDefault();
            const card = document.querySelector(`[data-book-box-subscription-id="${cancelEditBtn.dataset.subscriptionId}"]`);
            if (!card) return;
            const viewEl = card.querySelector('.book-box-sub-card-view');
            const editEl = card.querySelector('.book-box-sub-card-edit');
            if (viewEl) viewEl.hidden = false;
            if (editEl) editEl.hidden = true;
            return;
        }
        if (saveEditBtn?.dataset.subscriptionId) {
            e.preventDefault();
            const subscriptionId = saveEditBtn.dataset.subscriptionId;
            const card = document.querySelector(`[data-book-box-subscription-id="${subscriptionId}"]`);
            if (!card) return;
            const editEl = card.querySelector('.book-box-sub-card-edit');
            if (!editEl) return;
            const company = trimOrEmpty(editEl.querySelector('.book-box-sub-edit-company')?.value || '');
            const tier = trimOrEmpty(editEl.querySelector('.book-box-sub-edit-tier')?.value || '');
            const costInput = editEl.querySelector('.book-box-sub-edit-cost');
            const skipsInput = editEl.querySelector('.book-box-sub-edit-skips');
            const defaultMonthlyCost = costInput && costInput.value !== '' ? parseFloat(costInput.value) : null;
            const skipsAllowedPerYear = skipsInput ? Math.max(0, parseInt(skipsInput.value, 10) || 0) : 0;
            if (!company) return;
            stateAdapter.updateBookBoxSubscription(subscriptionId, {
                company,
                tier,
                defaultMonthlyCost: typeof defaultMonthlyCost === 'number' && !isNaN(defaultMonthlyCost) ? defaultMonthlyCost : null,
                skipsAllowedPerYear
            });
            void setStateKey(STORAGE_KEYS.BOOK_BOX_SUBSCRIPTIONS, characterState[STORAGE_KEYS.BOOK_BOX_SUBSCRIPTIONS]);
            const viewEl = card.querySelector('.book-box-sub-card-view');
            if (viewEl) viewEl.hidden = false;
            if (editEl) editEl.hidden = true;
            renderSubscriptionsList();
        }
    });

    renderSubscriptionsList();
    stateAdapter.on(STATE_EVENTS.BOOK_BOX_SUBSCRIPTIONS_CHANGED, renderSubscriptionsList);
    stateAdapter.on(STATE_EVENTS.BOOK_BOX_HISTORY_CHANGED, renderSubscriptionsList);
}

function setupShoppingTabs() {
    const nav = document.querySelector('.shopping-tab-nav');
    const panels = document.querySelectorAll('.shopping-tab-panel');
    const buttons = document.querySelectorAll('.shopping-tab-btn');
    if (!nav || !panels.length || !buttons.length) return;

    buttons.forEach((btn) => {
        btn.addEventListener('click', () => {
            const tab = btn.dataset.shoppingTab;
            if (!tab) return;
            buttons.forEach((b) => {
                b.classList.toggle('active', b === btn);
                b.setAttribute('aria-selected', b === btn ? 'true' : 'false');
            });
            panels.forEach((panel) => {
                const isActive = panel.dataset.shoppingPanel === tab;
                panel.classList.toggle('active', isActive);
                panel.setAttribute('aria-hidden', isActive ? 'false' : 'true');
            });
        });
    });
}

/**
 * Initialize the shopping page
 */
export async function initializeShoppingPage() {
    const container = document.getElementById('shopping-options-container');
    if (!container) return;

    await ensureStateLoadedOnce();
    await loadShoppingLog();

    const shopPanel = document.getElementById('shopping-tab-panel-shop');
    let currencyDisplay = document.getElementById('shopping-currency-display');
    if (!currencyDisplay && shopPanel) {
        currencyDisplay = document.createElement('div');
        currencyDisplay.id = 'shopping-currency-display';
        currencyDisplay.className = 'shopping-currency-display';
        shopPanel.insertBefore(currencyDisplay, shopPanel.firstChild);
    }

    if (!shoppingOptions || shoppingOptions.length === 0) {
        container.innerHTML = '<p>No shopping options available.</p>';
        updateCurrencyDisplay();
    } else {
        container.innerHTML = '';
        shoppingOptions.forEach((option) => {
            const card = createShoppingOptionCard(option);
            container.appendChild(card);
        });
    }

    setupShoppingTabs();
    setupSubscriptionsPanel();
    updateCurrencyDisplay();
    renderShoppingSummary();
}
