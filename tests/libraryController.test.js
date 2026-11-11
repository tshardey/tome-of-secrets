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
            <div id="library-books-unsorted" class="library-books-section"><div id="library-cards-unsorted"></div></div>
            <div id="library-cards-audiobook"></div>
            <div id="library-cards-ebook"></div>
            <div id="library-cards-library-loan"></div>
            <div id="library-books-physical" class="library-books-section"><div id="library-cards-physical"></div></div>
            <div id="library-cards-completed"></div>
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
            expect(stateAdapter.getBooksByStatus).toHaveBeenCalledWith('completed');
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
            for (const id of ['unsorted', 'audiobook', 'ebook', 'library-loan', 'physical', 'completed']) {
                expect(tab).toContain(`id="library-cards-${id}"`);
            }
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
        it('calls markBookComplete and moves the card to Completed', () => {
            const library = setLibrary([book('b1', 'ebook', 'reading')]);
            stateAdapter.markBookComplete = jest.fn((id) => {
                library.find((b) => b.id === id).status = 'completed';
                return { id, status: 'completed' };
            });

            const controller = new LibraryController(stateAdapter, form, dependencies);
            controller.initialize();
            expect(document.getElementById('library-cards-completed').innerHTML).toContain('None');

            document.querySelector('#library-cards-ebook .library-mark-complete-btn').click();

            expect(stateAdapter.markBookComplete).toHaveBeenCalledWith('b1');
            expect(document.getElementById('library-cards-completed').innerHTML).toContain('Title b1');
            expect(document.querySelector('#library-cards-ebook .library-mark-complete-btn')).toBeNull();
        });
    });

    describe('renderBooks', () => {
        const byId = (id) => document.getElementById(id);

        it('places each book in its type section, and every completed book also under its year', () => {
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
            const completed = byId('library-cards-completed');
            expect(completed.innerHTML).toContain('Title e1');
            expect(completed.querySelector('.library-year-heading').textContent).toBe('2026 (1)');
            expect(byId('library-cards-audiobook').querySelector('.library-status-badge').textContent).toBe('On a quest');
        });

        it('renders every present section even when the others are missing from the DOM', () => {
            document.body.innerHTML = `
                <form id="character-sheet">
                    <div id="library-cards-completed"></div>
                    <div id="library-cards-ebook"></div>
                </form>`;
            setLibrary([book('e1', 'ebook', 'completed'), book('a1', 'audiobook', 'reading')]);
            const lonelyForm = document.getElementById('character-sheet');

            new LibraryController(stateAdapter, lonelyForm, dependencies).renderBooks();

            expect(byId('library-cards-ebook').innerHTML).toContain('Title e1');
            expect(byId('library-cards-completed').innerHTML).toContain('Title e1');
        });

        it('hides empty Unsorted and Not-in-the-library sections, and shows None for the rest', () => {
            setLibrary([]);
            new LibraryController(stateAdapter, form, dependencies).initialize();

            expect(byId('library-books-unsorted').style.display).toBe('none');
            expect(byId('library-books-physical').style.display).toBe('none');
            expect(byId('library-cards-audiobook').innerHTML).toContain('None');
            expect(byId('library-cards-ebook').innerHTML).toContain('None');
            expect(byId('library-cards-library-loan').innerHTML).toContain('None');
            expect(byId('library-cards-completed').innerHTML).toContain('None');
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
            expect(byId('library-cards-completed').innerHTML).not.toContain('library-mark-complete-btn');
        });

        it('renderBookCard returns one card with the status badge', () => {
            const controller = new LibraryController(stateAdapter, form, dependencies);
            const html = controller.renderBookCard(book('r1', 'ebook', 'reading', { title: 'The Salt Road' }));
            expect(html).toContain('class="library-card"');
            expect(html).toContain('The Salt Road');
            expect(html).toContain('On a quest');
            expect(html).not.toContain('Physical TBR');
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
            expect(controller._readTagPicker(tagContainer)).toContain('borrowed');
        });
    });
});
