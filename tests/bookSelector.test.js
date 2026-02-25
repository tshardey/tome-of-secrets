/**
 * @jest-environment jsdom
 */

import { createBookSelector } from '../assets/js/utils/bookSelector.js';

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
        it('opens dropdown with book list when Link Book is clicked', () => {
            selectorApi = createBookSelector(container, stateAdapter, {});
            const trigger = container.querySelector('.book-selector-trigger');
            trigger.click();
            const dropdown = document.body.querySelector('.book-selector-dropdown');
            expect(dropdown).toBeTruthy();
            const options = dropdown.querySelectorAll('.book-selector-option');
            expect(options.length).toBe(2);
            expect(options[0].getAttribute('data-book-id')).toBe('b1');
            expect(options[1].getAttribute('data-book-id')).toBe('b2');
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
});
