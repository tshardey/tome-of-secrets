/**
 * @jest-environment jsdom
 */

import { LibraryController } from '../assets/js/controllers/LibraryController.js';
import { StateAdapter } from '../assets/js/character-sheet/stateAdapter.js';
import { characterState } from '../assets/js/character-sheet/state.js';
import * as ui from '../assets/js/character-sheet/ui.js';
import * as data from '../assets/js/character-sheet/data.js';

jest.mock('../assets/js/services/BookMetadataService.js', () => ({
    searchBooks: jest.fn(() => Promise.resolve([]))
}));

function createLibraryFormHTML() {
    return `
        <form id="character-sheet">
            <div id="library-cards-reading"></div>
            <div id="library-cards-completed"></div>
            <div id="library-cards-other"></div>
            <div id="book-edit-drawer" style="display: none;"></div>
            <div id="book-edit-backdrop"></div>
            <button type="button" id="close-book-edit">Close</button>
            <button type="button" id="cancel-book-edit-btn">Cancel</button>
            <button type="button" id="save-book-edit-btn">Save</button>
            <input type="hidden" id="book-edit-id" />
            <input type="text" id="book-edit-title" />
            <input type="text" id="book-edit-author" />
            <input type="number" id="book-edit-page-count" />
            <select id="book-edit-status"><option value="reading">Reading</option><option value="completed">Completed</option><option value="other">Other</option></select>
            <input type="hidden" id="book-edit-cover-value" />
            <input type="url" id="book-edit-cover-url" />
            <input type="file" id="book-edit-cover-upload" accept="image/*" />
            <img id="book-edit-cover-preview" style="display: none;" />
            <span id="book-edit-cover-placeholder">No cover</span>
            <div id="book-edit-links-section" style="display: none;"></div>
            <div id="book-edit-links-display"></div>
        </form>
        <form id="library-add-book-form">
            <div class="form-row">
                <label for="library-book-title">Title:</label>
                <div class="library-search-wrap">
                    <input type="text" id="library-book-title" placeholder="Search or enter title" />
                    <button type="button" id="library-book-search-btn">Look up</button>
                </div>
                <div id="library-book-search-results" style="display: none;"></div>
            </div>
            <div class="form-row">
                <label for="library-book-author">Author:</label>
                <input type="text" id="library-book-author" />
            </div>
            <div class="form-row">
                <label>Cover:</label>
                <div class="library-cover-fields">
                    <div class="library-cover-preview-wrap">
                        <img id="library-add-cover-preview" style="display: none;" />
                        <span id="library-add-cover-placeholder">No cover</span>
                    </div>
                    <div class="library-cover-inputs">
                        <input type="url" id="library-add-cover-url" />
                        <input type="file" id="library-add-cover-upload" accept="image/*" />
                        <input type="hidden" id="library-add-cover-value" />
                    </div>
                </div>
            </div>
            <div class="form-row">
                <label for="library-add-page-count">Page count:</label>
                <input type="number" id="library-add-page-count" min="1" />
            </div>
            <div class="form-row">
                <label>Status:</label>
                <div class="library-status-radios">
                    <label><input type="radio" name="library-add-status" value="reading" checked /> Reading</label>
                    <label><input type="radio" name="library-add-status" value="completed" /> Completed</label>
                    <label><input type="radio" name="library-add-status" value="other" /> Other</label>
                </div>
            </div>
            <button type="submit" id="library-add-book-btn">Add Book</button>
        </form>
    `;
}

describe('LibraryController', () => {
    let stateAdapter;
    let form;
    let dependencies;

    beforeEach(() => {
        document.body.innerHTML = createLibraryFormHTML();
        form = document.getElementById('character-sheet');
        stateAdapter = new StateAdapter(characterState);

        stateAdapter.addBook = jest.fn((data) => ({
            id: 'book-1',
            title: data.title || '',
            author: data.author || '',
            cover: data.cover || null,
            pageCount: data.pageCount ?? null,
            status: data.status || 'reading',
            dateAdded: new Date().toISOString(),
            dateCompleted: null,
            links: { questIds: [], curriculumPromptIds: [] }
        }));
        stateAdapter.updateBook = jest.fn((id, updates) => ({ id, ...updates }));
        stateAdapter.getBook = jest.fn((id) => {
            const books = {
                'book-1': {
                    id: 'book-1',
                    title: 'Test Book',
                    author: 'Author',
                    cover: null,
                    pageCount: 300,
                    status: 'reading',
                    dateAdded: new Date().toISOString(),
                    dateCompleted: null,
                    links: { questIds: [], curriculumPromptIds: [] }
                },
                b1: {
                    id: 'b1',
                    title: 'B1',
                    author: '',
                    cover: null,
                    pageCount: null,
                    status: 'reading',
                    dateAdded: new Date().toISOString(),
                    dateCompleted: null,
                    links: { questIds: [], curriculumPromptIds: [] }
                }
            };
            return books[id] || null;
        });
        stateAdapter.getBooks = jest.fn(() => []);
        stateAdapter.getBooksByStatus = jest.fn(() => []);
        stateAdapter.markBookComplete = jest.fn((id) => ({ id, status: 'completed' }));

        dependencies = {
            ui: { ...ui },
            data,
            saveState: jest.fn()
        };
    });

    afterEach(() => {
        document.body.innerHTML = '';
        jest.clearAllMocks();
    });

    describe('initialize', () => {
        it('should initialize and render book sections', () => {
            const controller = new LibraryController(stateAdapter, form, dependencies);
            controller.initialize();

            expect(document.getElementById('library-cards-reading')).toBeTruthy();
            expect(document.getElementById('library-cards-completed')).toBeTruthy();
            expect(document.getElementById('library-cards-other')).toBeTruthy();
            expect(stateAdapter.getBooksByStatus).toHaveBeenCalledWith('reading');
            expect(stateAdapter.getBooksByStatus).toHaveBeenCalledWith('completed');
            expect(stateAdapter.getBooksByStatus).toHaveBeenCalledWith('other');
        });

        it('should bind add book button and add book on click', () => {
            const controller = new LibraryController(stateAdapter, form, dependencies);
            controller.initialize();

            const titleInput = document.getElementById('library-book-title');
            titleInput.value = 'New Book';
            const addBookBtn = document.getElementById('library-add-book-btn');
            addBookBtn.click();

            expect(stateAdapter.addBook).toHaveBeenCalledWith(
                expect.objectContaining({
                    title: 'New Book',
                    status: 'reading'
                })
            );
        });
    });

    describe('handleAddBook', () => {
        it('should not add book when title is empty', () => {
            const controller = new LibraryController(stateAdapter, form, dependencies);
            controller.initialize();

            document.getElementById('library-book-title').value = '   ';
            document.getElementById('library-add-book-btn').click();

            expect(stateAdapter.addBook).not.toHaveBeenCalled();
        });

        it('should add book with title and default status', () => {
            const controller = new LibraryController(stateAdapter, form, dependencies);
            controller.initialize();

            document.getElementById('library-book-title').value = 'My Book';
            document.getElementById('library-book-author').value = 'Jane Doe';
            document.getElementById('library-add-book-btn').click();

            expect(stateAdapter.addBook).toHaveBeenCalledWith(
                expect.objectContaining({
                    title: 'My Book',
                    author: 'Jane Doe',
                    status: 'reading'
                })
            );
        });

        it('should call saveState after adding book', () => {
            const controller = new LibraryController(stateAdapter, form, dependencies);
            controller.initialize();

            document.getElementById('library-book-title').value = 'Another Book';
            document.getElementById('library-add-book-btn').click();

            expect(stateAdapter.addBook).toHaveBeenCalled();
            expect(dependencies.saveState).toHaveBeenCalledWith(form);
        });
    });

    describe('handleEditBook and handleSaveBookEdit', () => {
        it('should open edit drawer and populate fields when editing', () => {
            const controller = new LibraryController(stateAdapter, form, dependencies);
            controller.initialize();

            controller.handleEditBook('book-1');

            expect(document.getElementById('book-edit-id').value).toBe('book-1');
            expect(document.getElementById('book-edit-title').value).toBe('Test Book');
            expect(document.getElementById('book-edit-author').value).toBe('Author');
            expect(document.getElementById('book-edit-page-count').value).toBe('300');
            expect(document.getElementById('book-edit-status').value).toBe('reading');
            expect(document.getElementById('book-edit-drawer').style.display).toBe('flex');
        });

        it('should save edits and close drawer', () => {
            const controller = new LibraryController(stateAdapter, form, dependencies);
            controller.initialize();
            controller.handleEditBook('book-1');

            document.getElementById('book-edit-title').value = 'Updated Title';
            document.getElementById('book-edit-author').value = 'Updated Author';
            document.getElementById('save-book-edit-btn').click();

            expect(stateAdapter.updateBook).toHaveBeenCalledWith(
                'book-1',
                expect.objectContaining({
                    title: 'Updated Title',
                    author: 'Updated Author'
                })
            );
            expect(document.getElementById('book-edit-drawer').style.display).toBe('none');
        });
    });

    describe('handleMarkComplete', () => {
        it('should call markBookComplete and re-render', () => {
            stateAdapter.getBooksByStatus = jest.fn((status) =>
                status === 'reading' ? [{ id: 'b1', title: 'B1', status: 'reading' }] : []
            );

            const controller = new LibraryController(stateAdapter, form, dependencies);
            controller.initialize();

            controller.handleMarkComplete('b1');

            expect(stateAdapter.markBookComplete).toHaveBeenCalledWith('b1');
            expect(stateAdapter.getBooksByStatus).toHaveBeenCalled();
        });
    });

    describe('renderBooks', () => {
        it('should render empty sections when no books', () => {
            stateAdapter.getBooksByStatus = jest.fn(() => []);

            const controller = new LibraryController(stateAdapter, form, dependencies);
            controller.initialize();

            expect(document.getElementById('library-cards-reading').innerHTML).toContain('None');
            expect(document.getElementById('library-cards-completed').innerHTML).toContain('None');
            expect(document.getElementById('library-cards-other').innerHTML).toContain('None');
        });

        it('should render book cards with title and Edit button', () => {
            stateAdapter.getBooksByStatus = jest.fn((status) =>
                status === 'reading'
                    ? [{ id: 'r1', title: 'Reading Book', author: 'A', status: 'reading', cover: null, pageCount: 100, links: {} }]
                    : []
            );

            const controller = new LibraryController(stateAdapter, form, dependencies);
            controller.initialize();

            const readingHtml = document.getElementById('library-cards-reading').innerHTML;
            expect(readingHtml).toContain('Reading Book');
            expect(readingHtml).toContain('library-edit-book-btn');
            expect(readingHtml).toContain('data-book-id="r1"');
        });

        it('should show Mark Complete only for non-completed books', () => {
            stateAdapter.getBooksByStatus = jest.fn((status) => {
                if (status === 'reading') {
                    return [{ id: 'r1', title: 'R', author: '', status: 'reading', cover: null, pageCount: null, links: {} }];
                }
                if (status === 'completed') {
                    return [{ id: 'c1', title: 'C', author: '', status: 'completed', cover: null, pageCount: null, links: {} }];
                }
                return [];
            });

            const controller = new LibraryController(stateAdapter, form, dependencies);
            controller.initialize();

            const readingHtml = document.getElementById('library-cards-reading').innerHTML;
            const completedHtml = document.getElementById('library-cards-completed').innerHTML;
            expect(readingHtml).toContain('library-mark-complete-btn');
            expect(completedHtml).not.toContain('library-mark-complete-btn');
        });
    });
});
