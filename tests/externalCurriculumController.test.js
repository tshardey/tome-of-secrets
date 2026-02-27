/**
 * @jest-environment jsdom
 *
 * Tests for ExternalCurriculumController: add curriculum/category/prompts,
 * batch prompt entry, link book, mark complete, delete, render.
 */
import { ExternalCurriculumController } from '../assets/js/controllers/ExternalCurriculumController.js';

const mockBookSelectorInstance = {
    render: jest.fn(),
    setSelectedBookId: jest.fn(),
    getSelectedBookId: jest.fn(() => null),
    destroy: jest.fn()
};

jest.mock('../assets/js/utils/bookSelector.js', () => ({
    createBookSelector: jest.fn(() => mockBookSelectorInstance)
}));

function createCurriculumFormHTML() {
    return `
        <form id="character-sheet">
            <input type="text" id="external-curriculum-name" placeholder="Curriculum name" />
            <button type="button" id="external-curriculum-add-btn">Add Curriculum</button>
            <div id="external-curriculum-list" class="curriculum-list"></div>
        </form>
    `;
}

describe('ExternalCurriculumController', () => {
    let stateAdapter;
    let form;
    let dependencies;

    beforeEach(() => {
        document.body.innerHTML = createCurriculumFormHTML();
        form = document.getElementById('character-sheet');
        stateAdapter = {
            getExternalCurriculum: jest.fn(() => ({})),
            addCurriculum: jest.fn((name) => ({
                id: 'curriculum-1',
                name: name || '',
                categories: {}
            })),
            addCategory: jest.fn((curriculumId, name) => ({
                id: 'category-1',
                name: name || '',
                prompts: {}
            })),
            addPrompts: jest.fn((curriculumId, categoryId, texts) =>
                (texts || []).map((text, i) => ({
                    id: `prompt-${i}`,
                    text,
                    bookId: null,
                    completedAt: null
                }))
            ),
            updateCurriculum: jest.fn((id, updates) => ({ id, name: updates?.name ?? '', categories: {} })),
            updateCategory: jest.fn((curriculumId, categoryId, updates) => ({
                id: categoryId,
                name: updates?.name ?? '',
                prompts: {}
            })),
            deleteCurriculum: jest.fn(() => true),
            deleteCategory: jest.fn(() => true),
            deletePrompt: jest.fn(() => true),
            linkBookToPrompt: jest.fn(() => ({})),
            markPromptComplete: jest.fn(() => ({})),
            on: jest.fn()
        };

        dependencies = {
            saveState: jest.fn()
        };
        mockBookSelectorInstance.render.mockClear();
        mockBookSelectorInstance.setSelectedBookId.mockClear();
        mockBookSelectorInstance.getSelectedBookId.mockReturnValue(null);
        mockBookSelectorInstance.destroy.mockClear();
    });

    afterEach(() => {
        document.body.innerHTML = '';
        jest.clearAllMocks();
    });

    describe('initialize', () => {
        it('renders curriculums and binds add curriculum button', () => {
            const controller = new ExternalCurriculumController(stateAdapter, form, dependencies);
            controller.initialize();

            expect(stateAdapter.getExternalCurriculum).toHaveBeenCalled();
            expect(document.getElementById('external-curriculum-list')).toBeTruthy();
        });

        it('subscribes to EXTERNAL_CURRICULUM_CHANGED and BOOKS_CHANGED', () => {
            const controller = new ExternalCurriculumController(stateAdapter, form, dependencies);
            controller.initialize();

            expect(stateAdapter.on).toHaveBeenCalledWith('externalCurriculumChanged', expect.any(Function));
            expect(stateAdapter.on).toHaveBeenCalledWith('booksChanged', expect.any(Function));
        });
    });

    describe('handleAddCurriculum', () => {
        it('adds curriculum when name is non-empty', () => {
            const controller = new ExternalCurriculumController(stateAdapter, form, dependencies);
            controller.initialize();

            document.getElementById('external-curriculum-name').value = 'Book Club 2025';
            document.getElementById('external-curriculum-add-btn').click();

            expect(stateAdapter.addCurriculum).toHaveBeenCalledWith('Book Club 2025', 'prompt');
            expect(dependencies.saveState).toHaveBeenCalledWith(form);
        });

        it('does not add curriculum when name is empty', () => {
            const controller = new ExternalCurriculumController(stateAdapter, form, dependencies);
            controller.initialize();

            document.getElementById('external-curriculum-name').value = '   ';
            document.getElementById('external-curriculum-add-btn').click();

            expect(stateAdapter.addCurriculum).not.toHaveBeenCalled();
        });

        it('clears name input after adding', () => {
            stateAdapter.getExternalCurriculum = jest.fn(() => ({
                'curriculum-1': { id: 'curriculum-1', name: 'Book Club', type: 'prompt', categories: {} }
            }));
            const controller = new ExternalCurriculumController(stateAdapter, form, dependencies);
            controller.initialize();

            document.getElementById('external-curriculum-name').value = 'New Curriculum';
            document.getElementById('external-curriculum-add-btn').click();

            expect(document.getElementById('external-curriculum-name').value).toBe('');
        });
    });

    describe('handleAddCategory', () => {
        it('adds category when input has value', () => {
            stateAdapter.getExternalCurriculum = jest.fn(() => ({
                'curriculum-1': {
                    id: 'curriculum-1',
                    name: 'Curr',
                    categories: {}
                }
            }));
            const controller = new ExternalCurriculumController(stateAdapter, form, dependencies);
            controller.initialize();

            const addCategoryInput = form.querySelector('.curriculum-add-category-input');
            const addCategoryBtn = form.querySelector('.curriculum-add-category-btn');
            expect(addCategoryInput).toBeTruthy();
            expect(addCategoryBtn).toBeTruthy();
            addCategoryInput.value = 'Fiction';
            addCategoryBtn.click();

            expect(stateAdapter.addCategory).toHaveBeenCalledWith('curriculum-1', 'Fiction');
            expect(dependencies.saveState).toHaveBeenCalledWith(form);
        });
    });

    describe('handleAddPrompts', () => {
        it('adds prompts from textarea (one per line) when Add Prompts clicked', () => {
            stateAdapter.getExternalCurriculum = jest.fn(() => ({
                'curriculum-1': {
                    id: 'curriculum-1',
                    name: 'Curr',
                    type: 'prompt',
                    categories: {
                        'category-1': {
                            id: 'category-1',
                            name: 'Cat',
                            prompts: {}
                        }
                    }
                }
            }));
            const controller = new ExternalCurriculumController(stateAdapter, form, dependencies);
            controller.initialize();

            const textarea = form.querySelector('.curriculum-add-prompts-textarea');
            const addPromptsBtn = form.querySelector('.curriculum-add-prompts-btn');
            expect(textarea).toBeTruthy();
            expect(addPromptsBtn).toBeTruthy();
            textarea.value = 'Prompt one\nPrompt two\n  \nPrompt three  ';
            addPromptsBtn.click();

            expect(stateAdapter.addPrompts).toHaveBeenCalledWith(
                'curriculum-1',
                'category-1',
                ['Prompt one', 'Prompt two', 'Prompt three']
            );
            expect(dependencies.saveState).toHaveBeenCalledWith(form);
        });
    });

    describe('handleMarkPromptComplete', () => {
        it('calls markPromptComplete and saveState', () => {
            stateAdapter.getExternalCurriculum = jest.fn(() => ({
                'curriculum-1': {
                    id: 'curriculum-1',
                    name: 'Curr',
                    type: 'prompt',
                    categories: {
                        'category-1': {
                            id: 'category-1',
                            name: 'Cat',
                            prompts: {
                                'prompt-1': {
                                    id: 'prompt-1',
                                    text: 'Read a book',
                                    bookId: null,
                                    completedAt: null
                                }
                            }
                        }
                    }
                }
            }));
            const controller = new ExternalCurriculumController(stateAdapter, form, dependencies);
            controller.initialize();

            const completeBtn = form.querySelector('.curriculum-prompt-complete-btn[data-prompt-id="prompt-1"]');
            expect(completeBtn).toBeTruthy();
            completeBtn.click();

            expect(stateAdapter.markPromptComplete).toHaveBeenCalledWith('prompt-1');
            expect(dependencies.saveState).toHaveBeenCalledWith(form);
        });
    });

    describe('handleDeleteCurriculum', () => {
        it('calls deleteCurriculum and re-renders', () => {
            stateAdapter.getExternalCurriculum = jest.fn(() => ({
                'curriculum-1': { id: 'curriculum-1', name: 'To Delete', categories: {} }
            }));
            const controller = new ExternalCurriculumController(stateAdapter, form, dependencies);
            controller.initialize();

            const deleteBtn = form.querySelector('.curriculum-delete-curriculum-btn[data-curriculum-id="curriculum-1"]');
            expect(deleteBtn).toBeTruthy();
            deleteBtn.click();

            expect(stateAdapter.deleteCurriculum).toHaveBeenCalledWith('curriculum-1');
            expect(dependencies.saveState).toHaveBeenCalledWith(form);
        });
    });

    describe('handleDeleteCategory', () => {
        it('calls deleteCategory when Delete category clicked', () => {
            stateAdapter.getExternalCurriculum = jest.fn(() => ({
                'curriculum-1': {
                    id: 'curriculum-1',
                    name: 'Curr',
                    type: 'prompt',
                    categories: {
                        'category-1': { id: 'category-1', name: 'Cat', prompts: {} }
                    }
                }
            }));
            const controller = new ExternalCurriculumController(stateAdapter, form, dependencies);
            controller.initialize();

            const deleteCatBtn = form.querySelector('.curriculum-delete-category-btn[data-category-id="category-1"]');
            expect(deleteCatBtn).toBeTruthy();
            deleteCatBtn.click();

            expect(stateAdapter.deleteCategory).toHaveBeenCalledWith('curriculum-1', 'category-1');
            expect(dependencies.saveState).toHaveBeenCalledWith(form);
        });
    });

    describe('handleDeletePrompt', () => {
        it('calls deletePrompt when Delete prompt clicked', () => {
            stateAdapter.getExternalCurriculum = jest.fn(() => ({
                'curriculum-1': {
                    id: 'curriculum-1',
                    name: 'Curr',
                    categories: {
                        'category-1': {
                            id: 'category-1',
                            name: 'Cat',
                            prompts: {
                                'prompt-1': {
                                    id: 'prompt-1',
                                    text: 'Read something',
                                    bookId: null,
                                    completedAt: null
                                }
                            }
                        }
                    }
                }
            }));
            const controller = new ExternalCurriculumController(stateAdapter, form, dependencies);
            controller.initialize();

            const deletePromptBtn = form.querySelector('.curriculum-delete-prompt-btn[data-prompt-id="prompt-1"]');
            expect(deletePromptBtn).toBeTruthy();
            deletePromptBtn.click();

            expect(stateAdapter.deletePrompt).toHaveBeenCalledWith('prompt-1');
            expect(dependencies.saveState).toHaveBeenCalledWith(form);
        });
    });

    describe('renderCurriculums', () => {
        it('shows empty message when no curriculums', () => {
            stateAdapter.getExternalCurriculum = jest.fn(() => ({}));
            const controller = new ExternalCurriculumController(stateAdapter, form, dependencies);
            controller.initialize();

            const list = document.getElementById('external-curriculum-list');
            expect(list.innerHTML).toContain('No curriculums yet');
        });

        it('renders curriculum cards with editable name and Add Category', () => {
            stateAdapter.getExternalCurriculum = jest.fn(() => ({
                'curriculum-1': {
                    id: 'curriculum-1',
                    name: 'My List',
                    type: 'prompt',
                    categories: {}
                }
            }));
            const controller = new ExternalCurriculumController(stateAdapter, form, dependencies);
            controller.initialize();

            const list = document.getElementById('external-curriculum-list');
            expect(list.innerHTML).toContain('My List');
            expect(list.querySelector('.curriculum-name-input-inline[data-curriculum-id="curriculum-1"]')).toBeTruthy();
            expect(list.querySelector('.curriculum-type-pill')).toBeTruthy();
            expect(list.querySelector('.curriculum-add-category-btn[data-curriculum-id="curriculum-1"]')).toBeTruthy();
            expect(list.querySelector('.curriculum-delete-curriculum-btn[data-curriculum-id="curriculum-1"]')).toBeTruthy();
        });

        it('renders categories and prompts with completed badge when completedAt set', () => {
            stateAdapter.getExternalCurriculum = jest.fn(() => ({
                'curriculum-1': {
                    id: 'curriculum-1',
                    name: 'Curr',
                    categories: {
                        'category-1': {
                            id: 'category-1',
                            name: 'Fiction',
                            prompts: {
                                'prompt-1': {
                                    id: 'prompt-1',
                                    text: 'Read a novel',
                                    bookId: null,
                                    completedAt: '2025-01-15T12:00:00.000Z'
                                }
                            }
                        }
                    }
                }
            }));
            const controller = new ExternalCurriculumController(stateAdapter, form, dependencies);
            controller.initialize();

            const list = document.getElementById('external-curriculum-list');
            expect(list.innerHTML).toContain('Fiction');
            expect(list.innerHTML).toContain('Read a novel');
            expect(list.querySelector('.curriculum-prompt-completed')).toBeTruthy();
            expect(list.querySelector('.curriculum-prompt-completed-badge')).toBeTruthy();
            expect(list.querySelector('.curriculum-prompt-complete-btn')).toBeFalsy();
        });

        it('creates book selector for each prompt', () => {
            const { createBookSelector } = require('../assets/js/utils/bookSelector.js');
            createBookSelector.mockClear();
            stateAdapter.getExternalCurriculum = jest.fn(() => ({
                'curriculum-1': {
                    id: 'curriculum-1',
                    name: 'Curr',
                    categories: {
                        'category-1': {
                            id: 'category-1',
                            name: 'Cat',
                            prompts: {
                                'prompt-1': {
                                    id: 'prompt-1',
                                    text: 'Prompt',
                                    bookId: null,
                                    completedAt: null
                                }
                            }
                        }
                    }
                }
            }));
            const controller = new ExternalCurriculumController(stateAdapter, form, dependencies);
            controller.initialize();

            expect(createBookSelector).toHaveBeenCalledWith(
                expect.any(HTMLElement),
                stateAdapter,
                expect.objectContaining({
                    placeholder: 'Link Book',
                    appendTo: 'body',
                    onSelect: expect.any(Function)
                })
            );
        });
    });

    describe('destroy', () => {
        it('destroys book selectors and removes listeners', () => {
            stateAdapter.getExternalCurriculum = jest.fn(() => ({
                'curriculum-1': {
                    id: 'curriculum-1',
                    name: 'C',
                    type: 'prompt',
                    categories: {
                        'category-1': {
                            id: 'category-1',
                            name: 'Cat',
                            prompts: {
                                'prompt-1': {
                                    id: 'prompt-1',
                                    text: 'P',
                                    bookId: null,
                                    completedAt: null
                                }
                            }
                        }
                    }
                }
            }));
            const controller = new ExternalCurriculumController(stateAdapter, form, dependencies);
            controller.initialize();
            controller.destroy();

            expect(mockBookSelectorInstance.destroy).toHaveBeenCalled();
        });
    });
});
