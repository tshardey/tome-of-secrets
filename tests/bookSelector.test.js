/**
 * @jest-environment jsdom
 */

jest.mock('../assets/js/services/ShelfBookService.js', () => {
    const actual = jest.requireActual('../assets/js/services/ShelfBookService.js');
    return {
        ...actual,
        ensureShelfRecord: jest.fn(actual.ensureShelfRecord),
        syncShelfTags: jest.fn(actual.syncShelfTags)
    };
});
jest.mock('../assets/js/ui/toast.js', () => ({
    toast: { success: jest.fn(), error: jest.fn(), info: jest.fn(), warning: jest.fn() }
}));

import { createBookSelector } from '../assets/js/utils/bookSelector.js';
import { ensureShelfRecord, syncShelfTags } from '../assets/js/services/ShelfBookService.js';
import { libraryCatalog } from '../assets/js/services/LibraryCatalogService.js';
import { toast } from '../assets/js/ui/toast.js';
import { StateAdapter } from '../assets/js/character-sheet/stateAdapter.js';
import { createEmptyCharacterState, STORAGE_KEYS } from '../assets/js/character-sheet/storageKeys.js';

describe('bookSelector', () => {
    let container;
    let stateAdapter;
    /** @type {ReturnType<typeof createBookSelector> | null} */
    let selectorApi = null;

    beforeEach(() => {
        document.body.innerHTML = '<div id="book-selector-container"></div>';
        container = document.getElementById('book-selector-container');
        selectorApi = null;
        stateAdapter = {
            getBooks: jest.fn(() => [
                {
                    id: 'b1',
                    title: 'First Book',
                    author: 'Author One',
                    cover: 'https://example.com/cover1.jpg',
                    pageCount: 100,
                    status: 'reading',
                    dateAdded: '2025-01-01T00:00:00.000Z',
                    dateCompleted: null,
                    links: { questIds: [], curriculumPromptIds: [] }
                },
                {
                    id: 'b2',
                    title: 'Second Book',
                    author: 'Author Two',
                    cover: null,
                    pageCount: 200,
                    status: 'completed',
                    dateAdded: '2025-01-02T00:00:00.000Z',
                    dateCompleted: '2025-01-10T00:00:00.000Z',
                    links: { questIds: [], curriculumPromptIds: [] }
                }
            ]),
            getBooksByStatus: jest.fn((status) => {
                const all = stateAdapter.getBooks();
                return all.filter((b) => b.status === status);
            }),
            getBook: jest.fn((id) => {
                const found = stateAdapter.getBooks().find((b) => b.id === id);
                return found ? { ...found } : null;
            })
        };
    });

    afterEach(() => {
        if (selectorApi) selectorApi.destroy();
        selectorApi = null;
        // Remove any dropdown left in document.body (e.g. from opening then not closing)
        document.querySelectorAll('.book-selector-dropdown').forEach((el) => el.remove());
        document.body.innerHTML = '';
        jest.clearAllMocks();
    });

    describe('createBookSelector', () => {
        it('returns API with render, setSelectedBookId, getSelectedBookId, destroy when given valid container and stateAdapter', () => {
            selectorApi = createBookSelector(container, stateAdapter, {});
            const api = selectorApi;
            expect(api).toHaveProperty('render');
            expect(api).toHaveProperty('setSelectedBookId');
            expect(api).toHaveProperty('getSelectedBookId');
            expect(api).toHaveProperty('destroy');
            expect(typeof api.render).toBe('function');
            expect(typeof api.setSelectedBookId).toBe('function');
            expect(typeof api.getSelectedBookId).toBe('function');
            expect(typeof api.destroy).toBe('function');
        });

        it('returns no-op API when container is null', () => {
            selectorApi = createBookSelector(null, stateAdapter, {});
            const api = selectorApi;
            api.render();
            expect(container.innerHTML).toBe('');
        });

        it('returns no-op API when stateAdapter is null', () => {
            selectorApi = createBookSelector(container, null, {});
            const api = selectorApi;
            api.render();
            expect(container.querySelector('.book-selector-trigger')).toBeFalsy();
        });
    });

    describe('initial render (no selection)', () => {
        it('renders "Link Book" button when no selectedBookId', () => {
            selectorApi = createBookSelector(container, stateAdapter, {});
            const trigger = container.querySelector('.book-selector-trigger');
            expect(trigger).toBeTruthy();
            expect(trigger.textContent.trim()).toBe('Link Book');
        });

        it('uses custom placeholder when provided', () => {
            selectorApi = createBookSelector(container, stateAdapter, { placeholder: 'Choose a book' });
            const trigger = container.querySelector('.book-selector-trigger');
            expect(trigger).toBeTruthy();
            expect(trigger.textContent.trim()).toBe('Choose a book');
        });
    });

    describe('initial render (with selection)', () => {
        it('renders selected book with cover, title, author and Unlink button when selectedBookId is set', () => {
            stateAdapter.getBook.mockReturnValue({
                id: 'b1',
                title: 'First Book',
                author: 'Author One',
                cover: 'https://example.com/cover1.jpg',
                status: 'reading',
                links: { questIds: [], curriculumPromptIds: [] }
            });
            selectorApi = createBookSelector(container, stateAdapter, { selectedBookId: 'b1' });
            expect(container.querySelector('.book-selector-selected')).toBeTruthy();
            expect(container.querySelector('.book-selector-selected-title').textContent).toBe('First Book');
            expect(container.querySelector('.book-selector-selected-author').textContent).toBe('Author One');
            expect(container.querySelector('.book-selector-selected-cover').getAttribute('src')).toBe('https://example.com/cover1.jpg');
            expect(container.querySelector('.book-selector-unlink')).toBeTruthy();
        });

        it('renders "No cover" placeholder when selected book has no cover', () => {
            stateAdapter.getBook.mockReturnValue({
                id: 'b2',
                title: 'Second Book',
                author: 'Author Two',
                cover: null,
                status: 'completed',
                links: { questIds: [], curriculumPromptIds: [] }
            });
            selectorApi = createBookSelector(container, stateAdapter, { selectedBookId: 'b2' });
            expect(container.querySelector('.book-selector-selected-placeholder')).toBeTruthy();
            expect(container.querySelector('.book-selector-selected-placeholder').textContent).toContain('No cover');
        });

        it('uses custom unlink label when provided', () => {
            stateAdapter.getBook.mockReturnValue({
                id: 'b1',
                title: 'First',
                author: '',
                cover: null,
                status: 'reading',
                links: { questIds: [], curriculumPromptIds: [] }
            });
            selectorApi = createBookSelector(container, stateAdapter, { selectedBookId: 'b1', unlinkLabel: 'Remove' });
            const unlink = container.querySelector('.book-selector-unlink');
            expect(unlink).toBeTruthy();
            expect(unlink.textContent.trim()).toBe('Remove');
        });
    });

    describe('dropdown', () => {
        it('opens dropdown with book list when Link Book is clicked (most recently added first)', () => {
            selectorApi = createBookSelector(container, stateAdapter, {});
            const trigger = container.querySelector('.book-selector-trigger');
            trigger.click();
            const dropdown = document.body.querySelector('.book-selector-dropdown');
            expect(dropdown).toBeTruthy();
            const options = dropdown.querySelectorAll('.book-selector-option');
            expect(options.length).toBe(2);
            // Sorted by dateAdded desc then title: b2 (2025-01-02) then b1 (2025-01-01)
            expect(options[0].getAttribute('data-book-id')).toBe('b2');
            expect(options[1].getAttribute('data-book-id')).toBe('b1');
            expect(stateAdapter.getBooks).toHaveBeenCalled();
        });

        it('uses getBooksByStatus when statusFilter is provided', () => {
            stateAdapter.getBooksByStatus.mockReturnValue([
                {
                    id: 'b1',
                    title: 'First Book',
                    author: 'Author One',
                    cover: null,
                    status: 'reading',
                    links: { questIds: [], curriculumPromptIds: [] }
                }
            ]);
            selectorApi = createBookSelector(container, stateAdapter, { statusFilter: 'reading' });
            const trigger = container.querySelector('.book-selector-trigger');
            trigger.click();
            expect(stateAdapter.getBooksByStatus).toHaveBeenCalledWith('reading');
            const dropdown = document.body.querySelector('.book-selector-dropdown');
            expect(dropdown.querySelectorAll('.book-selector-option').length).toBe(1);
        });

        it('shows search input and filters list by title/author', () => {
            selectorApi = createBookSelector(container, stateAdapter, {});
            const trigger = container.querySelector('.book-selector-trigger');
            trigger.click();
            const dropdown = document.body.querySelector('.book-selector-dropdown');
            const searchInput = dropdown.querySelector('.book-selector-search-input');
            expect(searchInput).toBeTruthy();
            expect(searchInput.placeholder).toContain('Search');
            const optionsList = dropdown.querySelector('.book-selector-options-list');
            expect(optionsList.querySelectorAll('.book-selector-option').length).toBe(2);
            searchInput.value = 'Second';
            searchInput.dispatchEvent(new Event('input', { bubbles: true }));
            expect(optionsList.querySelectorAll('.book-selector-option').length).toBe(1);
            expect(optionsList.querySelector('.book-selector-option').getAttribute('data-book-id')).toBe('b2');
        });

        it('shows empty message when library has no books', () => {
            stateAdapter.getBooks.mockReturnValue([]);
            selectorApi = createBookSelector(container, stateAdapter, {});
            const trigger = container.querySelector('.book-selector-trigger');
            trigger.click();
            const dropdown = document.body.querySelector('.book-selector-dropdown');
            expect(dropdown).toBeTruthy();
            expect(dropdown.querySelector('.book-selector-empty')).toBeTruthy();
            expect(dropdown.querySelector('.book-selector-empty').textContent).toContain('No books in library');
        });

        it('calls onSelect(bookId) and closes dropdown when a book option is clicked', () => {
            const onSelect = jest.fn();
            selectorApi = createBookSelector(container, stateAdapter, { onSelect });
            const trigger = container.querySelector('.book-selector-trigger');
            trigger.click();
            const dropdown = document.body.querySelector('.book-selector-dropdown');
            const firstOption = dropdown.querySelector('.book-selector-option[data-book-id="b1"]');
            firstOption.click();
            expect(onSelect).toHaveBeenCalledWith('b1');
            expect(document.body.querySelector('.book-selector-dropdown')).toBeFalsy();
        });

        it('re-renders container to show selected book after selecting from dropdown', () => {
            const onSelect = jest.fn();
            selectorApi = createBookSelector(container, stateAdapter, { onSelect });
            container.querySelector('.book-selector-trigger').click();
            document.body.querySelector('.book-selector-option[data-book-id="b1"]').click();
            expect(container.querySelector('.book-selector-selected')).toBeTruthy();
            expect(container.querySelector('.book-selector-selected-title').textContent).toBe('First Book');
        });
    });

    describe('unlink', () => {
        it('calls onSelect(null) and re-renders to show Link Book when Unlink is clicked', () => {
            const onSelect = jest.fn();
            stateAdapter.getBook.mockReturnValue({
                id: 'b1',
                title: 'First Book',
                author: 'Author One',
                cover: null,
                status: 'reading',
                links: { questIds: [], curriculumPromptIds: [] }
            });
            selectorApi = createBookSelector(container, stateAdapter, { selectedBookId: 'b1', onSelect });
            const unlink = container.querySelector('.book-selector-unlink');
            unlink.click();
            expect(onSelect).toHaveBeenCalledWith(null);
            expect(container.querySelector('.book-selector-trigger')).toBeTruthy();
            expect(container.querySelector('.book-selector-selected')).toBeFalsy();
        });
    });

    describe('API', () => {
        it('getSelectedBookId returns current selection', () => {
            selectorApi = createBookSelector(container, stateAdapter, { selectedBookId: 'b1' });
            const api = selectorApi;
            expect(api.getSelectedBookId()).toBe('b1');
        });

        it('getSelectedBookId returns null when nothing selected', () => {
            selectorApi = createBookSelector(container, stateAdapter, {});
            const api = selectorApi;
            expect(api.getSelectedBookId()).toBe(null);
        });

        it('setSelectedBookId updates selection and re-renders', () => {
            selectorApi = createBookSelector(container, stateAdapter, {});
            const api = selectorApi;
            expect(container.querySelector('.book-selector-trigger')).toBeTruthy();
            api.setSelectedBookId('b1');
            expect(api.getSelectedBookId()).toBe('b1');
            expect(container.querySelector('.book-selector-selected')).toBeTruthy();
            api.setSelectedBookId(null);
            expect(api.getSelectedBookId()).toBe(null);
            expect(container.querySelector('.book-selector-trigger')).toBeTruthy();
        });

        it('destroy removes dropdown and clears container', () => {
            selectorApi = createBookSelector(container, stateAdapter, {});
            const api = selectorApi;
            container.querySelector('.book-selector-trigger').click();
            expect(document.body.querySelector('.book-selector-dropdown')).toBeTruthy();
            api.destroy();
            expect(document.body.querySelector('.book-selector-dropdown')).toBeFalsy();
            expect(container.innerHTML).toBe('');
        });
    });

    describe('XSS safety', () => {
        it('escapes book title and author in dropdown options', () => {
            stateAdapter.getBooks.mockReturnValue([
                {
                    id: 'x1',
                    title: '<script>alert(1)</script>',
                    author: '"><img src=x onerror=alert(2)>',
                    cover: null,
                    status: 'reading',
                    dateAdded: '',
                    dateCompleted: null,
                    links: { questIds: [], curriculumPromptIds: [] }
                }
            ]);
            selectorApi =             selectorApi = createBookSelector(container, stateAdapter, {});
            container.querySelector('.book-selector-trigger').click();
            const dropdown = document.body.querySelector('.book-selector-dropdown');
            expect(dropdown.innerHTML).not.toContain('<script>');
            expect(dropdown.innerHTML).toContain('&lt;script&gt;');
        });
    });

    describe('describeBook', () => {
        it('shows each book\'s note and disables books that cannot be picked', () => {
            const onSelect = jest.fn();
            selectorApi = createBookSelector(container, stateAdapter, {
                onSelect,
                describeBook: (book) => (book.id === 'b1' ? { disabled: true, note: 'Linked to: <Quest>' } : null)
            });
            container.querySelector('.book-selector-trigger').click();
            const dropdown = document.querySelector('.book-selector-dropdown');
            const linked = dropdown.querySelector('[data-book-id="b1"]');
            expect(linked.disabled).toBe(true);
            expect(linked.classList.contains('is-disabled')).toBe(true);
            expect(linked.querySelector('.book-selector-option-note').textContent).toBe('Linked to: <Quest>');
            const free = dropdown.querySelector('[data-book-id="b2"]');
            expect(free.disabled).toBe(false);
            expect(free.querySelector('.book-selector-option-note')).toBeNull();

            linked.querySelector('.book-selector-option-title').click();
            expect(onSelect).not.toHaveBeenCalled();
            free.click();
            expect(onSelect).toHaveBeenCalledWith('b2');
        });
    });
});

// ---------------------------------------------------------------------------------------
// Plan 4 (D7): the household library ("On our shelf"), online search, and Tags & series.
// Invented titles and synthetic ids only.
// ---------------------------------------------------------------------------------------
describe('bookSelector with the household library', () => {
    const HOUSEHOLD = '00000000-0000-4000-8000-0000000000aa';
    const L1 = '00000000-0000-4000-8000-000000000001';
    const L2 = '00000000-0000-4000-8000-000000000002';
    const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

    let container;
    let adapter;
    let api;
    let warnSpy;

    const libraryBook = (id, extra = {}) => ({
        id,
        title: 'The Salt Road',
        authors: ['Member A'],
        coverUrl: 'https://example.com/salt.jpg',
        pageCount: 320,
        seriesName: null,
        seriesVolume: null,
        editionLabels: [],
        tags: [],
        ...extra
    });

    const readyCatalog = (books) => ({
        status: 'ready',
        userId: 'user-a',
        householdId: HOUSEHOLD,
        books,
        tagsAvailable: true,
        fetchedAt: 1
    });

    /** A scripted LibraryCatalogService: `peek` and `getCatalog` serve `result`. */
    function fakeCatalog(result, { pending = false } = {}) {
        let current = result;
        return {
            peek: jest.fn(() => current),
            getCatalog: jest.fn(() => (pending ? new Promise(() => {}) : Promise.resolve(current))),
            subscribe: jest.fn(() => () => {}),
            currentHouseholdId: jest.fn(async () => HOUSEHOLD),
            readBookTags: jest.fn(async () => []),
            addTags: jest.fn(async () => {}),
            removeTags: jest.fn(async () => {}),
            fillSeries: jest.fn(async () => 'filled'),
            set(next) { current = next; }
        };
    }

    function ownBook(title, extra = {}) {
        return adapter.addBook({ title, author: 'Member B', type: 'ebook', ...extra });
    }

    function open() {
        container.querySelector('.book-selector-trigger').click();
        return document.querySelector('.book-selector-dropdown');
    }

    function search(dropdown, text) {
        const input = dropdown.querySelector('.book-selector-search-input');
        input.value = text;
        input.dispatchEvent(new Event('input', { bubbles: true }));
    }

    function headings(dropdown) {
        return Array.from(dropdown.querySelectorAll('.book-selector-group-heading')).map((el) => el.textContent.trim());
    }

    function group(dropdown, name) {
        return dropdown.querySelector(`.book-selector-group[data-group="${name}"]`);
    }

    function buttonByText(root, text) {
        return Array.from(root.querySelectorAll('button')).find((b) => b.textContent.trim() === text) || null;
    }

    beforeEach(() => {
        document.body.innerHTML = '<div id="sel"></div>';
        container = document.getElementById('sel');
        adapter = new StateAdapter(createEmptyCharacterState());
        api = null;
        warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    });

    afterEach(() => {
        if (api) api.destroy();
        document.body.innerHTML = '';
        // Logs never carry titles, authors or tag sets.
        for (const call of warnSpy.mock.calls) {
            const text = call.join(' ');
            expect(text).not.toMatch(/Salt Road|Glass Orchard|Member A|Member B|epistolary/);
        }
        warnSpy.mockRestore();
        jest.clearAllMocks();
    });

    it('lists the groups in order: On our shelf, Your books, Search online', () => {
        const catalog = fakeCatalog(readyCatalog([libraryBook(L1)]));
        const record = adapter.addBook({ title: 'The Salt Road', type: 'shelf', libraryBookId: L1 });
        const own = ownBook('Glass Orchard');
        api = createBookSelector(container, adapter, { libraryCatalog: catalog, onlineSearch: jest.fn() });
        const dropdown = open();
        search(dropdown, 'o');

        expect(headings(dropdown)).toEqual(['On our shelf', 'Your books', 'Search online']);
        const shelfIds = Array.from(group(dropdown, 'shelf').querySelectorAll('[data-library-book-id]'))
            .map((el) => el.getAttribute('data-library-book-id'));
        expect(shelfIds).toEqual([L1]);
        const yourIds = Array.from(group(dropdown, 'yours').querySelectorAll('[data-book-id]'))
            .map((el) => el.getAttribute('data-book-id'));
        // The shelf record of a ready library book appears only under On our shelf
        expect(yourIds).toEqual([own.id]);
        expect(yourIds).not.toContain(record.id);
    });

    it('matches shelf books by title or author with accents folded', () => {
        const catalog = fakeCatalog(readyCatalog([
            libraryBook(L1, { title: 'Café Lumière' }),
            libraryBook(L2, { title: 'Glass Orchard', authors: ['Zoë Example'] })
        ]));
        api = createBookSelector(container, adapter, { libraryCatalog: catalog });
        const dropdown = open();
        search(dropdown, 'cafe');
        expect(group(dropdown, 'shelf').querySelectorAll('[data-library-book-id]')).toHaveLength(1);
        search(dropdown, 'zoe');
        expect(group(dropdown, 'shelf').querySelector('[data-library-book-id]').getAttribute('data-library-book-id')).toBe(L2);
    });

    it('links a shelf book in one step, and reuses its record on the next pick', () => {
        const catalog = fakeCatalog(readyCatalog([libraryBook(L1)]));
        const onSelect = jest.fn();
        const addSpy = jest.spyOn(adapter, 'addBook');
        api = createBookSelector(container, adapter, { libraryCatalog: catalog, onSelect, appendTo: 'container' });

        group(open(), 'shelf').querySelector(`[data-library-book-id="${L1}"]`).click();
        expect(ensureShelfRecord).toHaveBeenCalledTimes(1);
        expect(addSpy).toHaveBeenCalledTimes(1);
        const id = onSelect.mock.calls[0][0];
        expect(adapter.getBook(id)).toEqual(expect.objectContaining({ type: 'shelf', libraryBookId: L1 }));
        expect(api.getSelectedBookId()).toBe(id);

        api.setSelectedBookId(null);
        group(open(), 'shelf').querySelector(`[data-library-book-id="${L1}"]`).click();
        expect(addSpy).toHaveBeenCalledTimes(1);
        expect(onSelect).toHaveBeenLastCalledWith(id);
    });

    describe('unhauled books (Plan 6, D10)', () => {
        const A = '00000000-0000-4000-8000-0000000000a1';
        const U = '00000000-0000-4000-8000-0000000000b1';
        const V = '00000000-0000-4000-8000-0000000000b2';

        function setup() {
            const catalog = fakeCatalog(readyCatalog([
                libraryBook(A, { title: 'The Salt Road' }),
                libraryBook(U, { title: 'Glass Orchard', unhauled: true }),
                libraryBook(V, { title: 'The Ember Gate', unhauled: true })
            ]));
            const record = adapter.addBook({ title: 'Glass Orchard', type: 'shelf', libraryBookId: U });
            adapter.addActiveQuests({ id: 'q-1', type: 'Organize the Stacks', prompt: 'Fantasy', book: 'Glass Orchard', bookId: record.id, buffs: [] });
            adapter.linkQuestToBook(record.id, 'q-1');
            return { catalog, record };
        }

        const shelfIds = (dropdown) => Array.from(group(dropdown, 'shelf').querySelectorAll('[data-library-book-id]'))
            .map((el) => el.getAttribute('data-library-book-id'));

        it('lists the on-shelf and the quest-linked unhauled book, not the unlinked one, and marks the linked one', () => {
            const { catalog } = setup();
            api = createBookSelector(container, adapter, { libraryCatalog: catalog });
            const dropdown = open();
            expect(shelfIds(dropdown).sort()).toEqual([A, U].sort());
            const u = group(dropdown, 'shelf').querySelector(`[data-library-book-id="${U}"]`);
            expect(u.textContent).toContain('Unhauled');
            const a = group(dropdown, 'shelf').querySelector(`[data-library-book-id="${A}"]`);
            expect(a.textContent).not.toContain('Unhauled');
        });

        it('a search matching only the unlinked unhauled book lists nothing from the shelf', () => {
            const { catalog } = setup();
            api = createBookSelector(container, adapter, { libraryCatalog: catalog });
            const dropdown = open();
            search(dropdown, 'Gate');
            expect(shelfIds(dropdown)).toEqual([]);
        });

        it('Your books marks the record Unhauled once a discarded quest drops it from the shelf group', () => {
            const { catalog, record } = setup();
            api = createBookSelector(container, adapter, { libraryCatalog: catalog });
            let dropdown = open();
            // While the shelf group lists it, the record is left out of Your books.
            expect(group(dropdown, 'yours').querySelector(`[data-book-id="${record.id}"]`)).toBeNull();
            api.destroy();

            adapter.removeQuest(STORAGE_KEYS.ACTIVE_ASSIGNMENTS, 0);
            api = createBookSelector(container, adapter, { libraryCatalog: catalog });
            dropdown = open();
            expect(shelfIds(dropdown)).toEqual([A]);
            const mine = group(dropdown, 'yours').querySelector(`[data-book-id="${record.id}"]`);
            expect(mine.textContent).toContain('Unhauled');
        });

        it('the selected book line says Unhauled', () => {
            const { catalog, record } = setup();
            api = createBookSelector(container, adapter, { libraryCatalog: catalog, selectedBookId: record.id });
            expect(container.querySelector('.book-selector-selected').textContent).toContain('Unhauled');
        });

        it('picking a listed unhauled book resolves it from the full catalogue', () => {
            const { catalog, record } = setup();
            api = createBookSelector(container, adapter, { libraryCatalog: catalog });
            const dropdown = open();
            group(dropdown, 'shelf').querySelector(`[data-library-book-id="${U}"]`).click();
            expect(api.getSelectedBookId()).toBe(record.id);
        });
    });

    describe('when the library is unavailable', () => {
        it('says so, and lists the shelf record under Your books, selectable', () => {
            const catalog = fakeCatalog({ status: 'unavailable', books: [], tagsAvailable: false, reason: 'timeout' });
            const record = adapter.addBook({ title: 'The Salt Road', type: 'shelf', libraryBookId: L1 });
            const onSelect = jest.fn();
            api = createBookSelector(container, adapter, { libraryCatalog: catalog, onSelect });
            const dropdown = open();

            expect(group(dropdown, 'shelf').textContent).toContain('On our shelf unavailable');
            const option = group(dropdown, 'yours').querySelector(`[data-book-id="${record.id}"]`);
            expect(option).toBeTruthy();
            expect(option.disabled).toBe(false);
            option.click();
            expect(onSelect).toHaveBeenCalledWith(record.id);
        });

        it('Retry forces a reload', () => {
            const catalog = fakeCatalog({ status: 'unavailable', books: [], tagsAvailable: false, reason: 'timeout' });
            api = createBookSelector(container, adapter, { libraryCatalog: catalog });
            const dropdown = open();
            catalog.getCatalog.mockImplementation(() => new Promise(() => {}));
            buttonByText(group(dropdown, 'shelf'), 'Retry').click();
            expect(catalog.getCatalog).toHaveBeenCalledWith({ force: true });
            expect(document.querySelector('.book-selector-dropdown')).toBeTruthy();
            expect(group(document.querySelector('.book-selector-dropdown'), 'shelf').textContent)
                .toContain('Checking the household library…');
        });

        it('renders at once while the catalogue is still loading', () => {
            const catalog = fakeCatalog(null, { pending: true });
            ownBook('Glass Orchard');
            api = createBookSelector(container, adapter, { libraryCatalog: catalog });
            const dropdown = open();
            expect(group(dropdown, 'shelf').textContent).toContain('Checking the household library…');
            expect(group(dropdown, 'yours').querySelectorAll('[data-book-id]')).toHaveLength(1);
        });

        it('fills the shelf group in when the load lands', async () => {
            let resolveLoad;
            const catalog = fakeCatalog(null);
            catalog.getCatalog.mockImplementation(() => new Promise((resolve) => { resolveLoad = resolve; }));
            api = createBookSelector(container, adapter, { libraryCatalog: catalog });
            const dropdown = open();
            expect(group(dropdown, 'shelf').textContent).toContain('Checking');
            const ready = readyCatalog([libraryBook(L1)]);
            catalog.set(ready);
            resolveLoad(ready);
            await flush();
            expect(group(dropdown, 'shelf').querySelector(`[data-library-book-id="${L1}"]`)).toBeTruthy();
        });
    });

    describe('signed out', () => {
        it('shows no shelf group, and never touches the catalogue without the option', () => {
            const spy = jest.spyOn(libraryCatalog, 'getCatalog');
            ownBook('Glass Orchard');
            api = createBookSelector(container, adapter, {});
            const dropdown = open();
            search(dropdown, 'glass');
            expect(group(dropdown, 'shelf')).toBeNull();
            expect(headings(dropdown)).not.toContain('On our shelf');
            expect(spy).not.toHaveBeenCalled();
            spy.mockRestore();
        });

        it('hides the shelf group for a signed-out or household-less catalogue', () => {
            for (const status of ['signed-out', 'no-household']) {
                const catalog = fakeCatalog({ status, books: [], tagsAvailable: false });
                api = createBookSelector(container, adapter, { libraryCatalog: catalog });
                const dropdown = open();
                expect(group(dropdown, 'shelf')).toBeNull();
                api.destroy();
            }
            api = null;
        });
    });

    describe('online search', () => {
        it('searches only on the button, then adds the picked result with the chosen type', async () => {
            const onlineSearch = jest.fn(async () => [
                { title: 'Glass Orchard', author: 'Member B', cover: 'https://example.com/glass.jpg', pageCount: 210 }
            ]);
            const onSelect = jest.fn();
            const addSpy = jest.spyOn(adapter, 'addBook');
            api = createBookSelector(container, adapter, { onlineSearch, onSelect });
            const dropdown = open();
            search(dropdown, 'glass');
            search(dropdown, 'glass o');
            expect(onlineSearch).not.toHaveBeenCalled();

            buttonByText(group(dropdown, 'online'), 'Search online for "glass o"').click();
            expect(onlineSearch).toHaveBeenCalledTimes(1);
            expect(onlineSearch.mock.calls[0][0]).toBe('glass o');
            await flush();

            group(dropdown, 'online').querySelector('.book-selector-online-result').click();
            const online = group(dropdown, 'online');
            expect(online.textContent).toContain('What kind of book is this?');
            const typeLabels = Array.from(online.querySelectorAll('[data-book-type]')).map((b) => b.textContent.trim());
            expect(typeLabels).toEqual(['Audiobook', 'Ebook', 'Library book', 'Physical, not in the library yet']);

            buttonByText(online, 'Ebook').click();
            expect(addSpy).toHaveBeenCalledWith(expect.objectContaining({
                type: 'ebook',
                title: 'Glass Orchard',
                author: 'Member B',
                cover: 'https://example.com/glass.jpg',
                pageCount: 210
            }));
            const added = addSpy.mock.results[0].value;
            expect(onSelect).toHaveBeenCalledWith(added.id);
            expect(document.querySelector('.book-selector-dropdown')).toBeNull();
        });

        it('accepts searchBooks results (authors list, coverUrl)', async () => {
            const onlineSearch = jest.fn(async () => [
                { title: 'Glass Orchard', authors: ['Member A', 'Member B'], coverUrl: 'https://example.com/g.jpg', pageCount: null }
            ]);
            const addSpy = jest.spyOn(adapter, 'addBook');
            api = createBookSelector(container, adapter, { onlineSearch });
            const dropdown = open();
            search(dropdown, 'glass');
            buttonByText(group(dropdown, 'online'), 'Search online for "glass"').click();
            await flush();
            group(dropdown, 'online').querySelector('.book-selector-online-result').click();
            buttonByText(group(dropdown, 'online'), 'Library book').click();
            expect(addSpy).toHaveBeenCalledWith(expect.objectContaining({
                type: 'library-loan', author: 'Member A, Member B', cover: 'https://example.com/g.jpg'
            }));
        });

        it('adds without searching as a physical book', () => {
            const onlineSearch = jest.fn();
            const onSelect = jest.fn();
            const addSpy = jest.spyOn(adapter, 'addBook');
            api = createBookSelector(container, adapter, { onlineSearch, onSelect });
            const dropdown = open();
            search(dropdown, 'x');
            buttonByText(group(dropdown, 'online'), 'Add "x" without searching').click();
            buttonByText(group(dropdown, 'online'), 'Physical, not in the library yet').click();
            expect(onlineSearch).not.toHaveBeenCalled();
            expect(addSpy).toHaveBeenCalledWith(expect.objectContaining({ type: 'physical', title: 'x' }));
            expect(onSelect).toHaveBeenCalledWith(addSpy.mock.results[0].value.id);
        });
    });

    it('with more than 20 household matches, a shelf record beyond them stays pickable under Your books', () => {
        const ids = Array.from({ length: 22 }, (_, i) => `00000000-0000-4000-8000-0000000001${String(i).padStart(2, '0')}`);
        const books = ids.map((id, i) => libraryBook(id, { title: `Shelf Volume ${String(i).padStart(2, '0')}` }));
        const catalog = fakeCatalog(readyCatalog(books));
        const records = ids.map((id, i) => adapter.addBook({ title: `Shelf Volume ${String(i).padStart(2, '0')}`, type: 'shelf', libraryBookId: id }));
        api = createBookSelector(container, adapter, { libraryCatalog: catalog });
        const dropdown = open();

        const shown = Array.from(group(dropdown, 'shelf').querySelectorAll('[data-library-book-id]'))
            .map((el) => el.getAttribute('data-library-book-id'));
        expect(shown).toHaveLength(20);
        const yours = Array.from(group(dropdown, 'yours').querySelectorAll('[data-book-id]'))
            .map((el) => el.getAttribute('data-book-id'));
        // Every record is in exactly one group
        const hidden = records.filter((r) => !shown.includes(r.libraryBookId)).map((r) => r.id);
        expect(hidden).toHaveLength(2);
        expect(yours.sort()).toEqual(hidden.sort());
    });

    describe('quota', () => {
        it('disables a shelf result whose record holds its quota, and creates no record on open', () => {
            const catalog = fakeCatalog(readyCatalog([libraryBook(L1), libraryBook(L2, { title: 'Glass Orchard' })]));
            const record = adapter.addBook({ title: 'The Salt Road', type: 'shelf', libraryBookId: L1 });
            const describeBook = jest.fn((book) => (book.id === record.id ? { disabled: true, note: 'Linked to: Quest A' } : null));
            const addSpy = jest.spyOn(adapter, 'addBook');
            api = createBookSelector(container, adapter, { libraryCatalog: catalog, describeBook });
            const dropdown = open();

            const full = group(dropdown, 'shelf').querySelector(`[data-library-book-id="${L1}"]`);
            expect(full.disabled).toBe(true);
            expect(full.querySelector('.book-selector-option-note').textContent).toBe('Linked to: Quest A');
            const free = group(dropdown, 'shelf').querySelector(`[data-library-book-id="${L2}"]`);
            expect(free.disabled).toBe(false);
            expect(addSpy).not.toHaveBeenCalled();
            expect(adapter.getBooks()).toHaveLength(1);
        });
    });

    describe('Tags & series', () => {
        const SERIES_NAME = 'The Lantern Cycle';

        function selectedShelfRecord(catalog, options = {}) {
            const record = adapter.addBook({ title: 'The Salt Road', type: 'shelf', libraryBookId: L1, tags: [], libraryTagsBase: [] });
            api = createBookSelector(container, adapter, {
                libraryCatalog: catalog,
                selectedBookId: record.id,
                appendTo: 'container',
                ...options
            });
            return record;
        }

        it('opens inline inside the container', () => {
            const catalog = fakeCatalog(readyCatalog([libraryBook(L1)]));
            selectedShelfRecord(catalog);
            buttonByText(container, 'Tags & series').click();
            const panel = container.querySelector('.book-selector-tags-panel');
            expect(panel).toBeTruthy();
            expect(container.contains(panel)).toBe(true);
            expect(panel.querySelector('input[value="epistolary"]')).toBeTruthy();
        });

        it('saving a tag updates the record, syncs the shelf tags and reports the change', async () => {
            const catalog = fakeCatalog(readyCatalog([libraryBook(L1)]));
            const onBookChanged = jest.fn();
            const updateSpy = jest.spyOn(adapter, 'updateBook');
            const record = selectedShelfRecord(catalog, { onBookChanged });
            buttonByText(container, 'Tags & series').click();
            container.querySelector('.book-selector-tags-panel input[value="epistolary"]').checked = true;
            buttonByText(container.querySelector('.book-selector-tags-panel'), 'Save').click();

            expect(updateSpy).toHaveBeenCalledWith(record.id, expect.objectContaining({ tags: ['epistolary'] }));
            expect(syncShelfTags).toHaveBeenCalledWith(adapter, record.id, catalog);
            expect(onBookChanged).toHaveBeenCalledWith(record.id);
            expect(container.querySelector('.book-selector-tags-panel')).toBeNull();
            await flush();
            expect(catalog.addTags).toHaveBeenCalledWith(L1, HOUSEHOLD, ['epistolary']);
        });

        it('choosing an Archive series adds the book to it and fills the library series', async () => {
            const catalog = fakeCatalog(readyCatalog([libraryBook(L1)]));
            const series = adapter.addSeries({ name: SERIES_NAME });
            const addToSeries = jest.spyOn(adapter, 'addBookToSeries');
            const record = selectedShelfRecord(catalog);
            buttonByText(container, 'Tags & series').click();
            const select = container.querySelector('.book-selector-series-select');
            expect(Array.from(select.options).map((o) => o.textContent)).toContain(SERIES_NAME);
            select.value = series.id;
            buttonByText(container.querySelector('.book-selector-tags-panel'), 'Save').click();

            expect(addToSeries).toHaveBeenCalledWith(series.id, record.id);
            await flush();
            expect(catalog.fillSeries).toHaveBeenCalledWith(L1, SERIES_NAME);
        });

        it('keeps tag ids the picker does not offer', () => {
            const catalog = fakeCatalog(readyCatalog([libraryBook(L1)]));
            const record = adapter.addBook({ title: 'Glass Orchard', type: 'ebook', tags: ['legacy-unknown-id'] });
            api = createBookSelector(container, adapter, { libraryCatalog: catalog, selectedBookId: record.id });
            buttonByText(container, 'Tags & series').click();
            container.querySelector('.book-selector-tags-panel input[value="epistolary"]').checked = true;
            buttonByText(container.querySelector('.book-selector-tags-panel'), 'Save').click();
            expect(adapter.getBook(record.id).tags).toEqual(['legacy-unknown-id', 'epistolary']);
            // Not a shelf record: nothing goes to the library
            expect(syncShelfTags).not.toHaveBeenCalled();
        });

        it('a tag a refresh adds while the panel is open survives the save', async () => {
            const catalog = fakeCatalog(readyCatalog([libraryBook(L1)]));
            const lib = new Set(['fantasy']);
            catalog.readBookTags.mockImplementation(async () => [...lib].sort());
            catalog.addTags.mockImplementation(async (_id, _h, ids) => ids.forEach((t) => lib.add(t)));
            catalog.removeTags.mockImplementation(async (_id, ids) => ids.forEach((t) => lib.delete(t)));
            const record = adapter.addBook({ title: 'The Salt Road', type: 'shelf', libraryBookId: L1, tags: ['fantasy'], libraryTagsBase: ['fantasy'] });
            api = createBookSelector(container, adapter, { libraryCatalog: catalog, selectedBookId: record.id, appendTo: 'container' });
            buttonByText(container, 'Tags & series').click();
            // A refresh merges cozy from the library while the panel is open
            lib.add('cozy');
            adapter.updateBook(record.id, { tags: ['fantasy', 'cozy'], libraryTagsBase: ['fantasy', 'cozy'] });

            container.querySelector('.book-selector-tags-panel input[value="epistolary"]').checked = true;
            buttonByText(container.querySelector('.book-selector-tags-panel'), 'Save').click();
            await flush();

            expect(adapter.getBook(record.id).tags).toEqual(['fantasy', 'cozy', 'epistolary']);
            expect([...lib].sort()).toEqual(['cozy', 'epistolary', 'fantasy']);
            expect(catalog.removeTags).not.toHaveBeenCalled();
        });

        it('is hidden without the catalogue unless asked for', () => {
            const record = ownBook('Glass Orchard');
            api = createBookSelector(container, adapter, { selectedBookId: record.id });
            expect(buttonByText(container, 'Tags & series')).toBeNull();
            api.destroy();
            api = createBookSelector(container, adapter, { selectedBookId: record.id, showTagsAndSeries: true });
            expect(buttonByText(container, 'Tags & series')).toBeTruthy();
        });
    });

    it('suggests the Special / Illuminated Edition tag once for a labelled copy', () => {
        const catalog = fakeCatalog(readyCatalog([libraryBook(L1, { editionLabels: ['Invented Box'] })]));
        api = createBookSelector(container, adapter, { libraryCatalog: catalog, appendTo: 'container' });
        group(open(), 'shelf').querySelector(`[data-library-book-id="${L1}"]`).click();
        expect(toast.info).toHaveBeenCalledTimes(1);
        expect(toast.info).toHaveBeenCalledWith(
            'This copy is labelled "Invented Box". Tag it Special / Illuminated Edition in Tags & series if that fits.'
        );

        api.setSelectedBookId(null);
        group(open(), 'shelf').querySelector(`[data-library-book-id="${L1}"]`).click();
        expect(toast.info).toHaveBeenCalledTimes(1);
    });

    it('does not suggest the tag when the book already has it', () => {
        const catalog = fakeCatalog(readyCatalog([libraryBook(L2, { editionLabels: ['Invented Box'], tags: ['special-edition'] })]));
        api = createBookSelector(container, adapter, { libraryCatalog: catalog });
        group(open(), 'shelf').querySelector(`[data-library-book-id="${L2}"]`).click();
        expect(toast.info).not.toHaveBeenCalled();
    });

    it('escapes library titles and keeps cover URLs as given', () => {
        const catalog = fakeCatalog(readyCatalog([
            libraryBook(L1, { title: '<img src=x onerror=alert(1)>', coverUrl: 'https://example.com/c.jpg?a=1&b=2' })
        ]));
        api = createBookSelector(container, adapter, { libraryCatalog: catalog });
        const dropdown = open();
        const option = group(dropdown, 'shelf').querySelector('[data-library-book-id]');
        expect(option.querySelector('.book-selector-option-title').textContent).toBe('<img src=x onerror=alert(1)>');
        expect(option.querySelector('img.book-selector-option-cover').getAttribute('src')).toBe('https://example.com/c.jpg?a=1&b=2');
    });
});
