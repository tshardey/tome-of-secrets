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

jest.mock('../assets/js/services/RewardCalculator.js', () => ({
    RewardCalculator: {
        getBaseRewards: jest.fn(() => ({
            toJSON: () => ({ xp: 0, inkDrops: 0, paperScraps: 10, blueprints: 0, items: [] })
        }))
    }
}));

jest.mock('../assets/js/ui/toast.js', () => ({
    toast: { success: jest.fn(), error: jest.fn(), info: jest.fn(), warning: jest.fn() }
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
            <select id="book-edit-status"><option value="reading">Reading</option><option value="completed">Completed</option><option value="other">Other</option></select>
            <input type="hidden" id="book-edit-cover-value" />
            <input type="url" id="book-edit-cover-url" />
            <input type="file" id="book-edit-cover-upload" accept="image/*" />
            <img id="book-edit-cover-preview" style="display: none;" />
            <span id="book-edit-cover-placeholder">No cover</span>
            <div id="book-edit-links-section" style="display: none;"></div>
            <div id="book-edit-links-list"></div>
            <div class="book-edit-links-actions">
                <button type="button" id="book-edit-link-quest-btn">🔗 Link Quest</button>
            </div>
            <div id="book-edit-link-quest-dropdown" style="display:none;"></div>
            <div id="book-edit-tags"></div>
            <select id="book-edit-shelf-category"><option value="general">General</option></select>
            <input type="date" id="book-edit-date-completed" />
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

const BOOK_1 = {
    id: 'book-1',
    title: 'Test Book',
    author: 'Author A',
    cover: null,
    pageCount: 300,
    status: 'reading',
    dateAdded: '2026-01-01T00:00:00.000Z',
    dateCompleted: null,
    links: { questIds: [], curriculumPromptIds: [] }
};

const QUEST_UNLINKED_1 = {
    id: 'quest-u1',
    type: '📖 Main Quest',
    prompt: 'Read a fantasy book',
    coverUrl: 'http://example.com/cover.jpg',
    bookId: undefined
};

const QUEST_UNLINKED_2 = {
    id: 'quest-u2',
    type: '🎲 Side Quest',
    prompt: 'Read a mystery',
    coverUrl: undefined,
    bookId: undefined
};

const QUEST_LINKED = {
    id: 'quest-linked',
    type: '📖 Main Quest',
    prompt: 'Already linked',
    coverUrl: undefined,
    bookId: 'book-other'
};

describe('Library Quest Linking — Card Popover', () => {
    let stateAdapter;
    let form;
    let dependencies;

    beforeEach(() => {
        document.body.innerHTML = createLibraryFormHTML();
        form = document.getElementById('character-sheet');
        stateAdapter = new StateAdapter(characterState);

        // Mock book methods
        stateAdapter.addBook = jest.fn((d) => ({ id: 'book-new', ...d }));
        stateAdapter.updateBook = jest.fn();
        stateAdapter.getBook = jest.fn((id) => (id === 'book-1' ? { ...BOOK_1 } : null));
        stateAdapter.getBooks = jest.fn(() => [BOOK_1]);
        stateAdapter.getBooksByStatus = jest.fn((status) =>
            status === 'reading' ? [BOOK_1] : []
        );
        stateAdapter.markBookComplete = jest.fn((id) => ({ id, status: 'completed' }));

        // Mock quest/assignment methods used by questBookLinker
        stateAdapter.getActiveAssignments = jest.fn(() => [
            { ...QUEST_UNLINKED_1 },
            { ...QUEST_UNLINKED_2 },
            { ...QUEST_LINKED }
        ]);
        stateAdapter.updateActiveQuest = jest.fn();
        stateAdapter.linkQuestToBook = jest.fn();
        stateAdapter.addActiveQuests = jest.fn();
        stateAdapter.saveState = jest.fn();

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

    function initController() {
        const controller = new LibraryController(stateAdapter, form, dependencies);
        controller.initialize();
        return controller;
    }

    it('renders a Link Quest button on each book card', () => {
        initController();

        const readingHTML = document.getElementById('library-cards-reading').innerHTML;
        expect(readingHTML).toContain('library-link-quest-btn');
        expect(readingHTML).toContain('data-book-id="book-1"');

        const linkBtns = document.querySelectorAll('.library-link-quest-btn');
        expect(linkBtns.length).toBe(1);
        expect(linkBtns[0].getAttribute('aria-label')).toBe('Link quest');
    });

    it('clicking Link Quest button opens popover', () => {
        initController();

        const linkBtn = document.querySelector('.library-link-quest-btn');
        linkBtn.click();

        const popover = document.querySelector('.library-link-quest-popover');
        expect(popover).not.toBeNull();
        expect(popover.querySelector('.library-link-quest-popover-header').textContent).toContain('Test Book');
    });

    it('popover shows linkable quests (not linked to this book)', () => {
        initController();

        const linkBtn = document.querySelector('.library-link-quest-btn');
        linkBtn.click();

        // All 3 quests should show — none are linked to book-1
        const options = document.querySelectorAll('.link-quest-option');
        expect(options.length).toBe(3);

        // First quest has a cover image
        const firstCover = options[0].querySelector('.link-quest-option-cover');
        expect(firstCover).not.toBeNull();
        expect(firstCover.src).toContain('example.com/cover.jpg');

        // Check prompts
        const prompts = document.querySelectorAll('.link-quest-option-prompt');
        expect(prompts[0].textContent).toBe('Read a fantasy book');
        expect(prompts[1].textContent).toBe('Read a mystery');
        expect(prompts[2].textContent).toBe('Already linked');
    });

    it('popover shows Create Extra Credit button', () => {
        initController();

        const linkBtn = document.querySelector('.library-link-quest-btn');
        linkBtn.click();

        const createBtn = document.querySelector('.link-quest-create-ec-btn');
        expect(createBtn).not.toBeNull();
        expect(createBtn.textContent).toContain('Create Extra Credit Quest');
    });

    it('clicking a quest option links it and closes popover', () => {
        initController();

        const linkBtn = document.querySelector('.library-link-quest-btn');
        linkBtn.click();

        const options = document.querySelectorAll('.link-quest-option');
        options[0].click();

        // Verify linking was called
        expect(stateAdapter.updateActiveQuest).toHaveBeenCalledWith('quest-u1', expect.objectContaining({
            bookId: 'book-1'
        }));
        expect(stateAdapter.linkQuestToBook).toHaveBeenCalledWith('book-1', 'quest-u1');
        expect(dependencies.saveState).toHaveBeenCalled();

        // Popover should be closed
        const popover = document.querySelector('.library-link-quest-popover');
        expect(popover).toBeNull();

        // Toast should have been shown
        const { toast: toastMock } = require('../assets/js/ui/toast.js');
        expect(toastMock.success).toHaveBeenCalled();
    });

    it('clicking Create Extra Credit creates quest and closes popover', () => {
        initController();

        const linkBtn = document.querySelector('.library-link-quest-btn');
        linkBtn.click();

        const createBtn = document.querySelector('.link-quest-create-ec-btn');
        createBtn.click();

        // Verify extra credit was created
        expect(stateAdapter.addActiveQuests).toHaveBeenCalledWith(
            expect.arrayContaining([
                expect.objectContaining({
                    type: '\u2B50 Extra Credit',
                    bookId: 'book-1'
                })
            ])
        );
        expect(stateAdapter.linkQuestToBook).toHaveBeenCalledWith('book-1', expect.any(String));
        expect(dependencies.saveState).toHaveBeenCalled();

        // Popover should be closed
        const popover = document.querySelector('.library-link-quest-popover');
        expect(popover).toBeNull();

        const { toast: toastMock } = require('../assets/js/ui/toast.js');
        expect(toastMock.success).toHaveBeenCalled();
    });

    it('popover shows empty message when no linkable quests', () => {
        // All quests are already linked to book-1
        stateAdapter.getActiveAssignments = jest.fn(() => [
            { id: 'q-already', type: '📖 Main Quest', prompt: 'Linked', bookId: 'book-1' }
        ]);

        initController();

        const linkBtn = document.querySelector('.library-link-quest-btn');
        linkBtn.click();

        const empty = document.querySelector('.link-quest-empty');
        expect(empty).not.toBeNull();
        expect(empty.textContent).toBe('No available quests');

        const options = document.querySelectorAll('.link-quest-option');
        expect(options.length).toBe(0);
    });
});

describe('Book Edit Drawer — Links Section', () => {
    let stateAdapter;
    let form;
    let dependencies;

    const BOOK_WITH_LINKS = {
        id: 'b1',
        title: 'Linked Book',
        author: 'Author B',
        cover: null,
        pageCount: 200,
        status: 'reading',
        dateAdded: '2026-01-01T00:00:00.000Z',
        dateCompleted: null,
        links: { questIds: ['q-linked'], curriculumPromptIds: [] },
        tags: [],
        shelfCategory: 'general'
    };

    const BOOK_NO_LINKS = {
        id: 'b2',
        title: 'Solo Book',
        author: 'Author C',
        cover: null,
        pageCount: 150,
        status: 'reading',
        dateAdded: '2026-01-02T00:00:00.000Z',
        dateCompleted: null,
        links: { questIds: [], curriculumPromptIds: [] },
        tags: [],
        shelfCategory: 'general'
    };

    const QUEST_LINKED_TO_B1 = {
        id: 'q-linked',
        type: '\uD83D\uDCD6 Main Quest',
        prompt: 'Read a linked book',
        coverUrl: undefined,
        bookId: 'b1',
        book: 'Linked Book',
        bookAuthor: 'Author B'
    };

    const QUEST_FREE = {
        id: 'q-free',
        type: '\uD83C\uDFB2 Side Quest',
        prompt: 'Read something new',
        coverUrl: 'http://example.com/cover2.jpg',
        bookId: undefined
    };

    beforeEach(() => {
        document.body.innerHTML = createLibraryFormHTML();
        form = document.getElementById('character-sheet');
        stateAdapter = new StateAdapter(characterState);

        stateAdapter.addBook = jest.fn((d) => ({ id: 'book-new', ...d }));
        stateAdapter.updateBook = jest.fn();
        stateAdapter.getBook = jest.fn((id) => {
            if (id === 'b1') return { ...BOOK_WITH_LINKS, links: { ...BOOK_WITH_LINKS.links, questIds: [...BOOK_WITH_LINKS.links.questIds] } };
            if (id === 'b2') return { ...BOOK_NO_LINKS, links: { ...BOOK_NO_LINKS.links, questIds: [] } };
            return null;
        });
        stateAdapter.getBooks = jest.fn(() => [BOOK_WITH_LINKS, BOOK_NO_LINKS]);
        stateAdapter.getBooksByStatus = jest.fn((status) =>
            status === 'reading' ? [BOOK_WITH_LINKS, BOOK_NO_LINKS] : []
        );
        stateAdapter.markBookComplete = jest.fn((id) => ({ id, status: 'completed' }));
        stateAdapter.getActiveAssignments = jest.fn(() => [
            { ...QUEST_LINKED_TO_B1 },
            { ...QUEST_FREE }
        ]);
        stateAdapter.updateActiveQuest = jest.fn();
        stateAdapter.linkQuestToBook = jest.fn();
        stateAdapter.unlinkQuestFromBook = jest.fn();
        stateAdapter.addActiveQuests = jest.fn();
        stateAdapter.saveState = jest.fn();
        stateAdapter.getSeriesForBook = jest.fn(() => null);
        stateAdapter.getSeriesList = jest.fn(() => []);

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

    function initController() {
        const controller = new LibraryController(stateAdapter, form, dependencies);
        controller.initialize();
        return controller;
    }

    it('shows linked quests with unlink button', () => {
        const controller = initController();
        controller.handleEditBook('b1');

        const rows = document.querySelectorAll('.book-edit-linked-quest-row');
        expect(rows.length).toBe(1);

        const text = rows[0].querySelector('.book-edit-linked-quest-text');
        expect(text).not.toBeNull();
        expect(text.textContent).toContain('Read a linked book');

        const unlinkBtn = rows[0].querySelector('.book-edit-unlink-btn');
        expect(unlinkBtn).not.toBeNull();
        expect(unlinkBtn.title).toBe('Unlink quest');
    });

    it('shows empty message when no linked quests', () => {
        const controller = initController();
        controller.handleEditBook('b2');

        const empty = document.querySelector('.book-edit-links-empty');
        expect(empty).not.toBeNull();
        expect(empty.textContent).toBe('No linked quests');

        const rows = document.querySelectorAll('.book-edit-linked-quest-row');
        expect(rows.length).toBe(0);
    });

    it('unlink button removes quest from book', () => {
        const controller = initController();
        controller.handleEditBook('b1');

        // After unlinking, the book should return with no quest links
        const originalGetBook = stateAdapter.getBook;
        stateAdapter.unlinkQuestFromBook.mockImplementation(() => {
            // After unlink is called, getBook returns empty questIds
            stateAdapter.getBook = jest.fn((id) => {
                if (id === 'b1') return { ...BOOK_WITH_LINKS, links: { questIds: [], curriculumPromptIds: [] } };
                return originalGetBook(id);
            });
        });

        const unlinkBtn = document.querySelector('.book-edit-unlink-btn');
        unlinkBtn.click();

        expect(stateAdapter.unlinkQuestFromBook).toHaveBeenCalledWith('b1', 'q-linked');
        expect(stateAdapter.updateActiveQuest).toHaveBeenCalledWith('q-linked', expect.objectContaining({
            bookId: null
        }));
        expect(dependencies.saveState).toHaveBeenCalled();

        const { toast: toastMock } = require('../assets/js/ui/toast.js');
        expect(toastMock.success).toHaveBeenCalledWith('Quest unlinked');

        // After re-render, should show empty message
        const empty = document.querySelector('.book-edit-links-empty');
        expect(empty).not.toBeNull();
    });

    it('Link Quest button opens dropdown with linkable quests and EC option', () => {
        const controller = initController();
        controller.handleEditBook('b1');

        const linkBtn = document.getElementById('book-edit-link-quest-btn');
        linkBtn.click();

        const dropdown = document.getElementById('book-edit-link-quest-dropdown');
        expect(dropdown.style.display).toBe('block');

        const options = dropdown.querySelectorAll('.link-quest-option');
        expect(options.length).toBe(1); // only QUEST_FREE is not linked to b1
        expect(options[0].querySelector('.link-quest-option-prompt').textContent).toBe('Read something new');

        // Also has Create Extra Credit button
        const ecBtn = dropdown.querySelector('.link-quest-create-ec-btn');
        expect(ecBtn).not.toBeNull();
        expect(ecBtn.textContent).toContain('Create Extra Credit Quest');
    });

    it('selecting a quest from dropdown links it and refreshes', () => {
        const controller = initController();
        controller.handleEditBook('b1');

        const linkBtn = document.getElementById('book-edit-link-quest-btn');
        linkBtn.click();

        // After linking, update getBook to return the new quest in links
        stateAdapter.linkQuestToBook.mockImplementation(() => {
            stateAdapter.getBook = jest.fn((id) => {
                if (id === 'b1') return { ...BOOK_WITH_LINKS, links: { questIds: ['q-linked', 'q-free'], curriculumPromptIds: [] } };
                return null;
            });
        });

        const dropdown = document.getElementById('book-edit-link-quest-dropdown');
        const option = dropdown.querySelector('.link-quest-option');
        option.click();

        expect(stateAdapter.updateActiveQuest).toHaveBeenCalledWith('q-free', expect.objectContaining({
            bookId: 'b1'
        }));
        expect(stateAdapter.linkQuestToBook).toHaveBeenCalledWith('b1', 'q-free');
        expect(dependencies.saveState).toHaveBeenCalled();

        const { toast: toastMock } = require('../assets/js/ui/toast.js');
        expect(toastMock.success).toHaveBeenCalled();

        // Links list should now show 2 rows
        const rows = document.querySelectorAll('.book-edit-linked-quest-row');
        expect(rows.length).toBe(2);
    });

    it('Create Extra Credit Quest from dropdown creates quest and refreshes', () => {
        const controller = initController();
        controller.handleEditBook('b1');

        // Open the dropdown first
        const linkBtn = document.getElementById('book-edit-link-quest-btn');
        linkBtn.click();

        // After EC creation, update getBook to return the new quest in links
        stateAdapter.linkQuestToBook.mockImplementation((bookId, questId) => {
            if (questId !== 'q-linked') {
                stateAdapter.getBook = jest.fn((id) => {
                    if (id === 'b1') return { ...BOOK_WITH_LINKS, links: { questIds: ['q-linked', questId], curriculumPromptIds: [] } };
                    return null;
                });
            }
        });

        const dropdown = document.getElementById('book-edit-link-quest-dropdown');
        const ecBtn = dropdown.querySelector('.link-quest-create-ec-btn');
        ecBtn.click();

        expect(stateAdapter.addActiveQuests).toHaveBeenCalledWith(
            expect.arrayContaining([
                expect.objectContaining({
                    type: '\u2B50 Extra Credit',
                    bookId: 'b1'
                })
            ])
        );
        expect(dependencies.saveState).toHaveBeenCalled();

        const { toast: toastMock } = require('../assets/js/ui/toast.js');
        expect(toastMock.success).toHaveBeenCalled();
    });

    it('links section is always visible', () => {
        const controller = initController();
        controller.handleEditBook('b2');

        const linksSection = document.getElementById('book-edit-links-section');
        expect(linksSection.style.display).toBe('block');
    });
});
