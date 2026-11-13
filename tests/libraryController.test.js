/**
 * @jest-environment jsdom
 */

import { LibraryController } from '../assets/js/controllers/LibraryController.js';
import { StateAdapter } from '../assets/js/character-sheet/stateAdapter.js';
import { characterState } from '../assets/js/character-sheet/state.js';
import { STORAGE_KEYS, createEmptyCharacterState } from '../assets/js/character-sheet/storageKeys.js';
import * as ui from '../assets/js/character-sheet/ui.js';
import * as data from '../assets/js/character-sheet/data.js';
import { readTagPicker } from '../assets/js/utils/tagPicker.js';

jest.mock('../assets/js/services/BookMetadataService.js', () => ({
    searchBooks: jest.fn(() => Promise.resolve([]))
}));
jest.mock('../assets/js/services/ShelfBookService.js', () => {
    const actual = jest.requireActual('../assets/js/services/ShelfBookService.js');
    return {
        ...actual,
        linkPhysicalToShelf: jest.fn(actual.linkPhysicalToShelf),
        dismissShelfOffer: jest.fn(actual.dismissShelfOffer),
        unlinkFromLibrary: jest.fn(actual.unlinkFromLibrary),
        syncShelfTags: jest.fn(actual.syncShelfTags)
    };
});

import {
    linkPhysicalToShelf,
    dismissShelfOffer,
    unlinkFromLibrary,
    syncShelfTags
} from '../assets/js/services/ShelfBookService.js';
import { createBookSelector } from '../assets/js/utils/bookSelector.js';

function createLibraryFormHTML() {
    return `
        <form id="character-sheet">
            <div id="library-books-unsorted" class="library-books-section"><div id="library-cards-unsorted"></div></div>
            <div id="library-cards-audiobook"></div>
            <div id="library-cards-ebook"></div>
            <div id="library-cards-library-loan"></div>
            <div id="library-books-physical" class="library-books-section"><div id="library-cards-physical"></div></div>
            <div id="book-edit-drawer" style="display: none;"></div>
            <div id="book-edit-backdrop"></div>
            <button type="button" id="close-book-edit">Close</button>
            <button type="button" id="cancel-book-edit-btn">Cancel</button>
            <button type="button" id="save-book-edit-btn">Save</button>
            <input type="hidden" id="book-edit-id" />
            <div class="form-row">
                <label for="book-edit-search-query">Look up book:</label>
                <div class="library-search-input-and-results">
                    <div class="library-search-wrap">
                        <input type="text" id="book-edit-search-query" />
                        <button type="button" id="book-edit-search-btn">Look up</button>
                    </div>
                    <div id="book-edit-search-results" style="display:none;"></div>
                </div>
            </div>
            <input type="text" id="book-edit-title" />
            <input type="text" id="book-edit-author" />
            <input type="number" id="book-edit-page-count" />
            <select id="book-edit-type"></select>
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
                <label>Type:</label>
                <div class="library-type-radios">
                    <label><input type="radio" name="library-add-type" value="audiobook" /> Audiobook</label>
                    <label><input type="radio" name="library-add-type" value="ebook" /> Ebook</label>
                    <label><input type="radio" name="library-add-type" value="library-loan" /> Library book</label>
                    <label><input type="radio" name="library-add-type" value="physical" /> Physical, not in the library yet</label>
                </div>
            </div>
            <div id="library-add-tags" class="library-tag-picker"></div>
            <button type="submit" id="library-add-book-btn" disabled>Add Book</button>
        </form>
    `;
}

describe('LibraryController', () => {
    let stateAdapter;
    let form;
    let dependencies;

    // Serve a book list through the type and status getters the controller reads
    function setLibrary(books) {
        stateAdapter.getBooksByType = jest.fn((type) => books.filter((b) => b.type === type));
        stateAdapter.getBooksByStatus = jest.fn((status) => books.filter((b) => b.status === status));
        return books;
    }

    function chooseAddType(type) {
        const radio = document.querySelector(`input[name="library-add-type"][value="${type}"]`);
        radio.checked = true;
        radio.dispatchEvent(new Event('change', { bubbles: true }));
    }

    function book(id, type, status, extra = {}) {
        return {
            id,
            title: `Title ${id}`,
            author: '',
            cover: null,
            pageCount: null,
            type,
            status,
            dateAdded: '2026-01-01T00:00:00.000Z',
            dateCompleted: status === 'completed' ? '2026-03-05T00:00:00.000Z' : null,
            links: {},
            ...extra
        };
    }

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
        stateAdapter.getBooksByType = jest.fn(() => []);
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

            for (const type of ['unsorted', 'audiobook', 'ebook', 'library-loan', 'physical']) {
                expect(stateAdapter.getBooksByType).toHaveBeenCalledWith(type);
            }
            expect(stateAdapter.getBooksByStatus).not.toHaveBeenCalled();
        });

        it('should bind add book button and add book on click', () => {
            const controller = new LibraryController(stateAdapter, form, dependencies);
            controller.initialize();

            document.getElementById('library-book-title').value = 'New Book';
            chooseAddType('ebook');
            document.getElementById('library-add-book-btn').click();

            expect(stateAdapter.addBook).toHaveBeenCalledWith(
                expect.objectContaining({ title: 'New Book', type: 'ebook' })
            );
        });
    });

    describe('handleAddBook', () => {
        it('should not add book when title is empty', () => {
            const controller = new LibraryController(stateAdapter, form, dependencies);
            controller.initialize();

            chooseAddType('ebook');
            document.getElementById('library-book-title').value = '   ';
            document.getElementById('library-add-book-btn').click();

            expect(stateAdapter.addBook).not.toHaveBeenCalled();
        });

        it('keeps Add Book disabled until a type is checked', () => {
            const controller = new LibraryController(stateAdapter, form, dependencies);
            controller.initialize();

            const addBtn = document.getElementById('library-add-book-btn');
            expect(addBtn.disabled).toBe(true);
            document.getElementById('library-book-title').value = 'My Book';
            controller.handleAddBook();
            expect(stateAdapter.addBook).not.toHaveBeenCalled();

            chooseAddType('audiobook');
            expect(addBtn.disabled).toBe(false);
        });

        it('adds the chosen type with no status or shelfCategory key', () => {
            const controller = new LibraryController(stateAdapter, form, dependencies);
            controller.initialize();

            document.getElementById('library-book-title').value = 'My Book';
            document.getElementById('library-book-author').value = 'Jane Doe';
            chooseAddType('ebook');
            document.getElementById('library-add-book-btn').click();

            expect(stateAdapter.addBook).toHaveBeenCalledTimes(1);
            const payload = stateAdapter.addBook.mock.calls[0][0];
            expect(payload).toEqual(expect.objectContaining({ title: 'My Book', author: 'Jane Doe', type: 'ebook' }));
            expect(payload).not.toHaveProperty('status');
            expect(payload).not.toHaveProperty('shelfCategory');
        });

        it('resets the type choice (and disables Add Book) after adding', () => {
            const controller = new LibraryController(stateAdapter, form, dependencies);
            controller.initialize();

            document.getElementById('library-book-title').value = 'My Book';
            chooseAddType('physical');
            document.getElementById('library-add-book-btn').click();

            expect(document.querySelector('input[name="library-add-type"]:checked')).toBeNull();
            expect(document.getElementById('library-add-book-btn').disabled).toBe(true);
        });

        it('should call saveState after adding book', () => {
            const controller = new LibraryController(stateAdapter, form, dependencies);
            controller.initialize();

            document.getElementById('library-book-title').value = 'Another Book';
            chooseAddType('library-loan');
            document.getElementById('library-add-book-btn').click();

            expect(stateAdapter.addBook).toHaveBeenCalled();
            expect(dependencies.saveState).toHaveBeenCalledWith(form);
        });

        it('the Library tab and drawer markup carry no status, shelf or Physical TBR controls', () => {
            const fs = require('fs');
            const path = require('path');
            const root = path.join(__dirname, '..', '_includes', 'character-sheet');
            const tab = fs.readFileSync(path.join(root, 'tabs', 'library.html'), 'utf8');
            const drawer = fs.readFileSync(path.join(root, 'drawers', 'book-edit.html'), 'utf8');
            for (const markup of [tab, drawer]) {
                expect(markup).not.toContain('library-add-status');
                expect(markup).not.toContain('library-add-shelf-category');
                expect(markup).not.toContain('book-edit-status');
                expect(markup).not.toContain('book-edit-shelf-category');
                expect(markup).not.toContain('Physical TBR');
            }
            expect(tab).toContain('name="library-add-type"');
            expect(tab).toContain('id="library-add-book-btn"');
            expect(drawer).toContain('id="book-edit-type"');
            for (const id of ['unsorted', 'audiobook', 'ebook', 'library-loan', 'physical']) {
                expect(tab).toContain(`id="library-cards-${id}"`);
            }
            // Quest completion lives in the Archived tab; the Library tab has no Completed section
            expect(tab).not.toContain('id="library-cards-completed"');
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
            expect(document.getElementById('book-edit-drawer').style.display).toBe('flex');
        });

        describe('type select', () => {
            const typeOptions = () => Array.from(document.getElementById('book-edit-type').options).map((o) => o.value);

            function editBook(extra) {
                stateAdapter.getBook = jest.fn((id) => book(id, extra.type, 'reading', extra));
                const controller = new LibraryController(stateAdapter, form, dependencies);
                controller.initialize();
                controller.handleEditBook('x1');
            }

            it('offers Unsorted plus the four pickable types for an unsorted book', () => {
                editBook({ type: 'unsorted' });
                expect(typeOptions()).toEqual(['unsorted', 'audiobook', 'ebook', 'library-loan', 'physical']);
                expect(document.getElementById('book-edit-type').value).toBe('unsorted');
            });

            it('offers only the four pickable types once a book has one', () => {
                editBook({ type: 'ebook' });
                expect(typeOptions()).toEqual(['audiobook', 'ebook', 'library-loan', 'physical']);
                expect(document.getElementById('book-edit-type').value).toBe('ebook');
            });

            it('saves a picked type through updateBook', () => {
                editBook({ type: 'unsorted' });
                document.getElementById('book-edit-type').value = 'audiobook';
                document.getElementById('save-book-edit-btn').click();

                expect(stateAdapter.updateBook).toHaveBeenCalledWith('x1', expect.objectContaining({ type: 'audiobook' }));
                const updates = stateAdapter.updateBook.mock.calls[0][1];
                expect(updates).not.toHaveProperty('status');
                expect(updates).not.toHaveProperty('shelfCategory');
            });

            it('shows On our shelf and no type options for a shelf book', () => {
                editBook({ type: 'shelf', libraryBookId: 'lib-1' });
                const select = document.getElementById('book-edit-type');
                expect(select.value).toBe('shelf');
                expect(select.options[0].textContent).toBe('On our shelf');
                expect(typeOptions()).toEqual(['shelf', 'unlink']);
                expect(select.options[1].textContent).toBe('Unlink from the library');
            });

            it('saving the drawer re-types an already-typed book (ebook -> audiobook) in the real StateAdapter', () => {
                const realAdapter = new StateAdapter(createEmptyCharacterState());
                const saved = realAdapter.addBook({ title: 'Glass Orchard', author: 'Member A', type: 'ebook', tags: ['fantasy'] });
                expect(saved.type).toBe('ebook');
                const controller = new LibraryController(realAdapter, form, dependencies);
                controller.initialize();
                controller.handleEditBook(saved.id);
                expect(document.getElementById('book-edit-type').value).toBe('ebook');

                document.getElementById('book-edit-type').value = 'audiobook';
                document.getElementById('save-book-edit-btn').click();

                const after = realAdapter.getBook(saved.id);
                expect(after.type).toBe('audiobook');
                expect(after.status).toBe('reading');
                expect(after.libraryBookId).toBeNull();
                expect(after).not.toHaveProperty('shelfCategory');
                expect(after.tags).not.toContain('audio');
                expect(realAdapter.getBooksByType('audiobook').map((b) => b.id)).toEqual([saved.id]);
                expect(realAdapter.getBooksByType('ebook')).toEqual([]);
            });

            it('Unlink from the library makes the book physical and remembers the dismissed match', () => {
                editBook({ type: 'shelf', libraryBookId: 'lib-1' });
                document.getElementById('book-edit-type').value = 'unlink';
                document.getElementById('save-book-edit-btn').click();

                expect(stateAdapter.updateBook).toHaveBeenCalledWith(
                    'x1',
                    expect.objectContaining({ type: 'physical', shelfMatchDismissed: 'lib-1' })
                );
            });
        });

        it('should wire edit search button and inputs to BookMetadataService.searchBooks', async () => {
            const { searchBooks } = require('../assets/js/services/BookMetadataService.js');
            searchBooks.mockResolvedValueOnce([]);

            const controller = new LibraryController(stateAdapter, form, dependencies);
            controller.initialize();
            controller.handleEditBook('book-1');

            const searchInput = document.getElementById('book-edit-search-query');
            const searchBtn = document.getElementById('book-edit-search-btn');

            // Type explicit query and click button
            searchInput.value = 'Test Book';
            searchBtn.click();

            expect(searchBooks).toHaveBeenCalledWith('Test Book', undefined, expect.any(AbortSignal));
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
        it('calls markBookComplete and badges the card Completed in its type section', () => {
            const library = setLibrary([book('b1', 'ebook', 'reading')]);
            stateAdapter.markBookComplete = jest.fn((id) => {
                library.find((b) => b.id === id).status = 'completed';
                return { id, status: 'completed' };
            });

            const controller = new LibraryController(stateAdapter, form, dependencies);
            controller.initialize();
            expect(document.querySelector('#library-cards-ebook .library-status-badge')).toBeNull();

            document.querySelector('#library-cards-ebook .library-mark-complete-btn').click();

            expect(stateAdapter.markBookComplete).toHaveBeenCalledWith('b1');
            expect(document.querySelector('#library-cards-ebook .library-status-badge').textContent).toBe('Completed');
            expect(document.querySelector('#library-cards-ebook .library-mark-complete-btn')).toBeNull();
        });
    });

    describe('renderBooks', () => {
        const byId = (id) => document.getElementById(id);

        it('places each book in its type section, completed books included', () => {
            setLibrary([
                book('a1', 'audiobook', 'reading'),
                book('u1', 'unsorted', 'reading'),
                book('e1', 'ebook', 'completed')
            ]);
            new LibraryController(stateAdapter, form, dependencies).initialize();

            expect(byId('library-cards-audiobook').innerHTML).toContain('Title a1');
            expect(byId('library-cards-unsorted').innerHTML).toContain('Title u1');
            const ebook = byId('library-cards-ebook');
            expect(ebook.innerHTML).toContain('Title e1');
            expect(ebook.querySelector('.library-status-badge').textContent).toBe('Completed');
            // Not completed and no active quest links it: no badge (spec 6.3)
            expect(byId('library-cards-audiobook').querySelector('.library-status-badge')).toBeNull();
        });

        it('shows On a quest only on an unfinished book an active quest links', () => {
            setLibrary([
                book('a1', 'audiobook', 'reading', { links: { questIds: ['q-active'], curriculumPromptIds: [] } }),
                book('a2', 'audiobook', 'reading', { links: { questIds: ['q-old'], curriculumPromptIds: [] } })
            ]);
            const savedActive = characterState[STORAGE_KEYS.ACTIVE_ASSIGNMENTS];
            characterState[STORAGE_KEYS.ACTIVE_ASSIGNMENTS] = [{ id: 'q-active', bookId: 'a1' }];
            try {
                new LibraryController(stateAdapter, form, dependencies).initialize();
                const cards = byId('library-cards-audiobook').querySelectorAll('.library-card');
                const badge = (card) => card.querySelector('.library-status-badge');
                expect(badge(cards[0]) || badge(cards[1])).toBeTruthy();
                const byBook = Object.fromEntries(Array.from(cards).map((c) => [c.dataset.bookId, badge(c)]));
                expect(byBook.a1.textContent).toBe('On a quest');
                expect(byBook.a2).toBeNull();
            } finally {
                characterState[STORAGE_KEYS.ACTIVE_ASSIGNMENTS] = savedActive;
            }
        });

        it('renders every present section even when the others are missing from the DOM', () => {
            document.body.innerHTML = `
                <form id="character-sheet">
                    <div id="library-cards-ebook"></div>
                </form>`;
            setLibrary([book('e1', 'ebook', 'completed'), book('a1', 'audiobook', 'reading')]);
            const lonelyForm = document.getElementById('character-sheet');

            new LibraryController(stateAdapter, lonelyForm, dependencies).renderBooks();

            expect(byId('library-cards-ebook').innerHTML).toContain('Title e1');
        });

        it('hides empty Unsorted and Not-in-the-library sections, and shows None for the rest', () => {
            setLibrary([]);
            new LibraryController(stateAdapter, form, dependencies).initialize();

            expect(byId('library-books-unsorted').style.display).toBe('none');
            expect(byId('library-books-physical').style.display).toBe('none');
            expect(byId('library-cards-audiobook').innerHTML).toContain('None');
            expect(byId('library-cards-ebook').innerHTML).toContain('None');
            expect(byId('library-cards-library-loan').innerHTML).toContain('None');
        });

        it('shows the Unsorted and physical sections again once they hold a book', () => {
            const library = setLibrary([]);
            const controller = new LibraryController(stateAdapter, form, dependencies);
            controller.initialize();

            library.push(book('u1', 'unsorted', 'reading'), book('p1', 'physical', 'reading'));
            controller.renderBooks();

            expect(byId('library-books-unsorted').style.display).toBe('');
            expect(byId('library-books-physical').style.display).toBe('');
            expect(byId('library-cards-physical').innerHTML).toContain('Title p1');
        });

        it('should render book cards with title and Edit button', () => {
            setLibrary([book('r1', 'ebook', 'reading', { title: 'Reading Book', author: 'A', pageCount: 100 })]);
            new LibraryController(stateAdapter, form, dependencies).initialize();

            const html = byId('library-cards-ebook').innerHTML;
            expect(html).toContain('Reading Book');
            expect(html).toContain('library-edit-book-btn');
            expect(html).toContain('data-book-id="r1"');
        });

        it('should show Mark Complete only for non-completed books', () => {
            setLibrary([book('r1', 'ebook', 'reading'), book('c1', 'audiobook', 'completed')]);
            new LibraryController(stateAdapter, form, dependencies).initialize();

            expect(byId('library-cards-ebook').innerHTML).toContain('library-mark-complete-btn');
            expect(byId('library-cards-audiobook').innerHTML).not.toContain('library-mark-complete-btn');
        });

        it('renderBookCard returns one card with the status badge', () => {
            const controller = new LibraryController(stateAdapter, form, dependencies);
            const html = controller.renderBookCard(book('r1', 'ebook', 'reading', { title: 'The Salt Road' }));
            expect(html).toContain('class="library-card"');
            expect(html).toContain('The Salt Road');
            // Unfinished and not on an active quest: no status badge
            expect(html).not.toContain('library-status-badge');
            expect(html).not.toContain('Physical TBR');
            const done = controller.renderBookCard(book('c1', 'ebook', 'completed'));
            expect(done).toContain('Completed');
        });
    });

    describe('tag picker highlighting', () => {
        it('should highlight applicable tags based on equipped items', () => {
            // Equip Cloak of the Story-Weaver, which has tagMatch: [["series"]]
            stateAdapter.state.equippedItems = ['Cloak of the Story-Weaver'];

            const controller = new LibraryController(stateAdapter, form, dependencies);
            controller.initialize();

            const tagContainer = document.getElementById('library-add-tags');
            const tagLabels = tagContainer.querySelectorAll('.library-tag-option');

            const seriesLabel = Array.from(tagLabels).find(
                (label) => label.querySelector('input[value="series"]')
            );
            const fantasyLabel = Array.from(tagLabels).find(
                (label) => label.querySelector('input[value="fantasy"]')
            );

            expect(seriesLabel).toBeTruthy();
            expect(seriesLabel.classList.contains('tag--applicable')).toBe(true);

            expect(fantasyLabel).toBeTruthy();
            expect(fantasyLabel.classList.contains('tag--applicable')).toBe(false);
        });
    });

    describe('tag picker "just you" note', () => {
        function labelFor(container, id) {
            return container.querySelector(`input[value="${id}"]`).closest('label');
        }

        it('marks reader-scoped tags "just you" and leaves shared tags unmarked', () => {
            const readerTag = data.bookTags.find((tag) => tag.scope === 'reader' && !tag.derivedFromType);
            const sharedTag = data.bookTags.find((tag) => tag.scope !== 'reader' && !tag.derivedFromType);
            expect(readerTag).toBeTruthy();

            new LibraryController(stateAdapter, form, dependencies).initialize();
            const container = document.getElementById('library-add-tags');

            expect(labelFor(container, readerTag.id).textContent).toContain('just you');
            expect(labelFor(container, sharedTag.id).textContent).not.toContain('just you');
        });

        it('never renders a type-derived tag, so there is no audio checkbox', () => {
            new LibraryController(stateAdapter, form, dependencies).initialize();
            const container = document.getElementById('library-add-tags');
            expect(container.querySelector('input[value="audio"]')).toBeNull();
        });

        it('uses the tag list it is given, not a hard-coded id', () => {
            const fixture = [
                { id: 'fx-reader', label: 'Fixture reader', category: 'agency', scope: 'reader' },
                { id: 'fx-shared', label: 'Fixture shared', category: 'agency' }
            ];
            const original = data.bookTags.splice(0, data.bookTags.length, ...fixture);
            try {
                new LibraryController(stateAdapter, form, dependencies).initialize();
                const container = document.getElementById('library-add-tags');
                expect(labelFor(container, 'fx-reader').textContent).toContain('just you');
                expect(labelFor(container, 'fx-shared').textContent).not.toContain('just you');
            } finally {
                data.bookTags.splice(0, data.bookTags.length, ...original);
            }
        });
    });

    describe('tag picker categories', () => {
        it('should render a column for every tag category, including provenance', () => {
            const controller = new LibraryController(stateAdapter, form, dependencies);
            controller.initialize();

            const tagContainer = document.getElementById('library-add-tags');
            const headings = Array.from(
                tagContainer.querySelectorAll('.library-tag-category')
            ).map((el) => el.textContent);

            expect(headings).toEqual(['Genre', 'Content', 'Provenance', 'Agency', 'Form']);
        });

        it('should render a checkbox for every tag in the tag data except type-derived ones', () => {
            const controller = new LibraryController(stateAdapter, form, dependencies);
            controller.initialize();

            const tagContainer = document.getElementById('library-add-tags');
            const renderedIds = Array.from(
                tagContainer.querySelectorAll('input[type="checkbox"]')
            ).map((cb) => cb.value);

            // Schema 20: a type-derived tag (Audio) comes from the book type, never the picker
            const pickable = data.bookTags.filter((tag) => !tag.derivedFromType);
            const derived = data.bookTags.filter((tag) => tag.derivedFromType);
            expect(derived.length).toBeGreaterThan(0);
            for (const tag of pickable) {
                expect(renderedIds).toContain(tag.id);
            }
            for (const tag of derived) {
                expect(renderedIds).not.toContain(tag.id);
            }
            expect(renderedIds).toHaveLength(pickable.length);
        });

        it('should render provenance tags as selectable options in the picker', () => {
            const controller = new LibraryController(stateAdapter, form, dependencies);
            controller.initialize();

            const tagContainer = document.getElementById('library-add-tags');
            const borrowedCheckbox = tagContainer.querySelector('input[value="borrowed"]');

            expect(borrowedCheckbox).toBeTruthy();
            expect(borrowedCheckbox.type).toBe('checkbox');
            expect(borrowedCheckbox.checked).toBe(false);

            const provenanceColumn = borrowedCheckbox.closest('.library-tag-column');
            expect(provenanceColumn.querySelector('.library-tag-category').textContent).toBe('Provenance');

            borrowedCheckbox.checked = true;
            expect(readTagPicker(tagContainer)).toContain('borrowed');
        });
    });
});

// ---------------------------------------------------------------------------------------
// Plan 4 (D7): the household library on the Library tab. Invented titles, synthetic ids.
// ---------------------------------------------------------------------------------------
describe('LibraryController and the household library', () => {
    const HOUSEHOLD = '00000000-0000-4000-8000-0000000000aa';
    const L1 = '00000000-0000-4000-8000-000000000001';
    const L9 = '00000000-0000-4000-8000-000000000009';
    const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

    let adapter;
    let form;
    let catalog;
    let deps;
    let warnSpy;

    const libraryBook = (id, extra = {}) => ({
        id,
        title: 'The Salt Road',
        authors: ['Member A'],
        coverUrl: null,
        pageCount: 320,
        seriesName: null,
        seriesVolume: null,
        editionLabels: [],
        tags: [],
        ...extra
    });

    function fakeCatalog(books) {
        const result = { status: 'ready', userId: 'user-a', householdId: HOUSEHOLD, books, tagsAvailable: true, fetchedAt: 1 };
        return {
            peek: jest.fn(() => result),
            getCatalog: jest.fn(async () => result),
            subscribe: jest.fn(() => () => {}),
            currentHouseholdId: jest.fn(async () => HOUSEHOLD),
            readBookTags: jest.fn(async () => []),
            addTags: jest.fn(async () => {}),
            removeTags: jest.fn(async () => {}),
            fillSeries: jest.fn(async () => 'filled')
        };
    }

    function start() {
        const controller = new LibraryController(adapter, form, deps);
        controller.initialize();
        return controller;
    }

    beforeEach(() => {
        document.body.innerHTML = createLibraryFormHTML();
        form = document.getElementById('character-sheet');
        form.insertAdjacentHTML('beforeend', '<div id="book-edit-tags"></div><select id="book-edit-series"></select>');
        adapter = new StateAdapter(createEmptyCharacterState());
        catalog = fakeCatalog([libraryBook(L1)]);
        deps = { ui: { ...ui }, data, saveState: jest.fn(), libraryCatalog: catalog };
        warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    });

    afterEach(() => {
        for (const call of warnSpy.mock.calls) {
            expect(call.join(' ')).not.toMatch(/Salt Road|Glass Orchard|Member A|epistolary/);
        }
        warnSpy.mockRestore();
        document.body.innerHTML = '';
        jest.clearAllMocks();
    });

    it('the Add-form search lists On our shelf results to link from a quest, with no add button', async () => {
        const { searchBooks } = require('../assets/js/services/BookMetadataService.js');
        searchBooks.mockResolvedValueOnce([{ title: 'Glass Orchard', authors: ['Member B'], coverUrl: null, pageCount: 90 }]);
        start();
        document.getElementById('library-book-title').value = 'salt';
        document.getElementById('library-book-search-btn').click();
        await flush();

        const results = document.getElementById('library-book-search-results');
        const shelf = results.querySelector('.library-shelf-results');
        expect(shelf).toBeTruthy();
        expect(shelf.textContent).toContain('On our shelf');
        const item = shelf.querySelector('.library-shelf-result');
        expect(item.textContent).toContain('The Salt Road');
        expect(item.textContent).toContain('Link it from a quest');
        expect(item.querySelector('button')).toBeNull();
        expect(item.tagName).not.toBe('BUTTON');
        // Online results still follow
        expect(results.querySelector('.book-search-result-item').textContent).toContain('Glass Orchard');
    });

    it('the Add-form search shows no shelf results without the catalogue', async () => {
        deps.libraryCatalog = null;
        start();
        document.getElementById('library-book-title').value = 'salt';
        document.getElementById('library-book-search-btn').click();
        await flush();
        expect(document.querySelector('.library-shelf-result')).toBeNull();
    });

    describe('Found on our shelf — link it?', () => {
        function physicalWithOffer() {
            const own = adapter.addBook({ title: 'The Salt Road', author: 'Member A', type: 'physical' });
            const controller = start();
            const offer = { bookId: own.id, libraryBook: libraryBook(L1) };
            controller.setShelfOffers([offer]);
            return { own, controller, offer };
        }

        it('shows the offer line on the physical card', () => {
            const { own } = physicalWithOffer();
            const card = document.querySelector(`#library-cards-physical .library-card[data-book-id="${own.id}"]`);
            expect(card.textContent).toContain('Found on our shelf — link it?');
            expect(card.querySelector('.library-offer-link-btn').textContent.trim()).toBe('Link');
            expect(card.querySelector('.library-offer-dismiss-btn').textContent.trim()).toBe('Not this one');
        });

        it('Link calls linkPhysicalToShelf', async () => {
            const { own, offer } = physicalWithOffer();
            document.querySelector('.library-offer-link-btn').click();
            expect(linkPhysicalToShelf).toHaveBeenCalledWith(adapter, own.id, offer.libraryBook, catalog);
            await flush();
            expect(adapter.getBook(own.id)).toEqual(expect.objectContaining({ type: 'shelf', libraryBookId: L1 }));
            expect(deps.saveState).toHaveBeenCalled();
            expect(document.body.textContent).not.toContain('Found on our shelf — link it?');
        });

        it('Not this one calls dismissShelfOffer', () => {
            const { own } = physicalWithOffer();
            document.querySelector('.library-offer-dismiss-btn').click();
            expect(dismissShelfOffer).toHaveBeenCalledWith(adapter, own.id, L1);
            expect(adapter.getBook(own.id).shelfMatchDismissed).toBe(L1);
            expect(adapter.getBook(own.id).type).toBe('physical');
            expect(document.body.textContent).not.toContain('Found on our shelf — link it?');
            expect(deps.saveState).toHaveBeenCalled();
        });

        it('never shows an offer on a book that is no longer physical', () => {
            const { own, controller } = physicalWithOffer();
            adapter.updateBook(own.id, { type: 'ebook' });
            controller.renderBooks();
            expect(document.body.textContent).not.toContain('Found on our shelf');
        });
    });

    it('the shelf drawer\'s Unlink from the library calls unlinkFromLibrary', () => {
        const record = adapter.addBook({ title: 'The Salt Road', type: 'shelf', libraryBookId: L1, tags: [], libraryTagsBase: [] });
        const controller = start();
        controller.handleEditBook(record.id);
        document.getElementById('book-edit-type').value = 'unlink';
        document.getElementById('save-book-edit-btn').click();
        expect(unlinkFromLibrary).toHaveBeenCalledWith(adapter, record.id);
        expect(adapter.getBook(record.id)).toEqual(expect.objectContaining({
            type: 'physical', libraryBookId: null, shelfMatchDismissed: L1
        }));
        // An unlinked record pushes nothing to the library
        expect(syncShelfTags).not.toHaveBeenCalled();
    });

    it('saving a shelf record\'s tags in the drawer syncs them, and a new series fills the library series', async () => {
        const record = adapter.addBook({ title: 'The Salt Road', type: 'shelf', libraryBookId: L1, tags: [], libraryTagsBase: [] });
        const series = adapter.addSeries({ name: 'The Lantern Cycle' });
        const controller = start();
        controller.handleEditBook(record.id);
        document.querySelector('#book-edit-tags input[value="epistolary"]').checked = true;
        document.getElementById('book-edit-series').value = series.id;
        document.getElementById('save-book-edit-btn').click();

        expect(syncShelfTags).toHaveBeenCalledWith(adapter, record.id, catalog);
        await flush();
        expect(catalog.addTags).toHaveBeenCalledWith(L1, HOUSEHOLD, ['epistolary']);
        expect(catalog.fillSeries).toHaveBeenCalledWith(L1, 'The Lantern Cycle');
    });

    it('the selector notes a missing library book and leaves it out of On our shelf', () => {
        const gone = adapter.addBook({
            title: 'The Salt Road', type: 'shelf', libraryBookId: L9, status: 'completed',
            dateCompleted: '2026-03-05T00:00:00.000Z'
        });
        adapter.addBook({
            title: 'Glass Orchard', type: 'shelf', libraryBookId: L1, status: 'completed',
            dateCompleted: '2026-03-06T00:00:00.000Z'
        });
        start();

        document.body.insertAdjacentHTML('beforeend', '<div id="picker"></div>');
        const picker = document.getElementById('picker');
        const selector = createBookSelector(picker, adapter, { libraryCatalog: catalog });
        picker.querySelector('.book-selector-trigger').click();
        const dropdown = document.querySelector('.book-selector-dropdown');
        const shelfIds = Array.from(dropdown.querySelectorAll('[data-group="shelf"] [data-library-book-id]'))
            .map((el) => el.getAttribute('data-library-book-id'));
        expect(shelfIds).toEqual([L1]);
        expect(shelfIds).not.toContain(L9);
        const yours = dropdown.querySelector(`[data-group="yours"] [data-book-id="${gone.id}"]`);
        expect(yours.textContent).toContain('No longer in the household library');
        selector.destroy();
    });

    describe('unhauled books (Plan 6, D10)', () => {
        const U = '00000000-0000-4000-8000-0000000000b1';
        const V = '00000000-0000-4000-8000-0000000000b2';

        beforeEach(() => {
            catalog = fakeCatalog([
                libraryBook(L1),
                libraryBook(U, { title: 'Glass Orchard', unhauled: true }),
                libraryBook(V, { title: 'The Ember Gate', unhauled: true })
            ]);
            deps.libraryCatalog = catalog;
        });

        it('the Add-form shelf results leave out an unlinked unhauled book', async () => {
            start();
            document.getElementById('library-book-title').value = 'gate';
            document.getElementById('library-book-search-btn').click();
            await flush();
            expect(document.querySelector('.library-shelf-result')).toBeNull();
        });

        it('the Add-form shelf results keep a quest-linked unhauled book', async () => {
            const record = adapter.addBook({ title: 'Glass Orchard', type: 'shelf', libraryBookId: U });
            adapter.addActiveQuests({ id: 'q-1', type: 'Organize the Stacks', prompt: 'Fantasy', book: 'Glass Orchard', bookId: record.id, buffs: [] });
            adapter.linkQuestToBook(record.id, 'q-1');
            start();
            document.getElementById('library-book-title').value = 'glass';
            document.getElementById('library-book-search-btn').click();
            await flush();
            expect(document.querySelector('.library-shelf-result')).toBeTruthy();
            expect(document.querySelector('.library-shelf-result-note').textContent).toContain('Unhauled');
        });
    });

    describe('drawer tag saves (PR review fixes)', () => {
        /** The library's tags per book; a book missing from the map is deleted (null). */
        function libraryTags(map) {
            catalog.readBookTags.mockImplementation(async (id) => (map.has(id) ? [...map.get(id)].sort() : null));
            catalog.addTags.mockImplementation(async (id, _h, ids) => { ids.forEach((t) => map.get(id).add(t)); });
            catalog.removeTags.mockImplementation(async (id, ids) => { ids.forEach((t) => map.get(id).delete(t)); });
        }

        it('a drawer save on a missing library book keeps its shared tags and pushes nothing', async () => {
            libraryTags(new Map());
            const record = adapter.addBook({
                title: 'The Salt Road', type: 'shelf', libraryBookId: L9, tags: ['fantasy'], libraryTagsBase: ['fantasy']
            });
            const controller = start();
            controller.handleEditBook(record.id);
            document.querySelector('#book-edit-tags input[value="epistolary"]').checked = true;
            document.getElementById('save-book-edit-btn').click();
            await flush();

            expect(syncShelfTags).toHaveBeenCalled();
            expect(adapter.getBook(record.id).tags).toEqual(['fantasy', 'epistolary']);
            expect(adapter.getBook(record.id).libraryTagsBase).toEqual(['fantasy']);
            expect(catalog.addTags).not.toHaveBeenCalled();
            expect(catalog.removeTags).not.toHaveBeenCalled();
        });

        it('a tag a refresh adds while the drawer is open survives the save, locally and in the library', async () => {
            const lib = new Map([[L1, new Set(['fantasy'])]]);
            libraryTags(lib);
            const record = adapter.addBook({
                title: 'The Salt Road', type: 'shelf', libraryBookId: L1, tags: ['fantasy'], libraryTagsBase: ['fantasy']
            });
            const controller = start();
            controller.handleEditBook(record.id);
            // Another player tags it cozy; a refresh merges that in while the drawer is open
            lib.get(L1).add('cozy');
            adapter.updateBook(record.id, { tags: ['fantasy', 'cozy'], libraryTagsBase: ['fantasy', 'cozy'] });

            document.querySelector('#book-edit-tags input[value="epistolary"]').checked = true;
            document.getElementById('save-book-edit-btn').click();
            await flush();

            expect(adapter.getBook(record.id).tags).toEqual(['fantasy', 'cozy', 'epistolary']);
            expect([...lib.get(L1)].sort()).toEqual(['cozy', 'epistolary', 'fantasy']);
            expect(catalog.removeTags).not.toHaveBeenCalled();
        });

        it('an unchecked tag is still removed', async () => {
            const lib = new Map([[L1, new Set(['fantasy', 'cozy'])]]);
            libraryTags(lib);
            const record = adapter.addBook({
                title: 'The Salt Road', type: 'shelf', libraryBookId: L1, tags: ['fantasy', 'cozy'], libraryTagsBase: ['fantasy', 'cozy']
            });
            const controller = start();
            controller.handleEditBook(record.id);
            document.querySelector('#book-edit-tags input[value="cozy"]').checked = false;
            document.getElementById('save-book-edit-btn').click();
            await flush();
            expect(adapter.getBook(record.id).tags).toEqual(['fantasy']);
            expect([...lib.get(L1)]).toEqual(['fantasy']);
        });

        it('keeps tag ids the picker does not offer', () => {
            const own = adapter.addBook({ title: 'Glass Orchard', type: 'ebook', tags: ['legacy-unknown-id', 'fantasy'] });
            const controller = start();
            controller.handleEditBook(own.id);
            document.querySelector('#book-edit-tags input[value="epistolary"]').checked = true;
            document.getElementById('save-book-edit-btn').click();
            expect(adapter.getBook(own.id).tags).toEqual(['legacy-unknown-id', 'fantasy', 'epistolary']);
        });
    });
});
