/**
 * @jest-environment jsdom
 *
 * Tests for external curriculum state: StateAdapter CRUD, validation, batch prompt add (Schema v5).
 */
import { StateAdapter, STATE_EVENTS } from '../assets/js/character-sheet/stateAdapter.js';
import { STORAGE_KEYS, createEmptyCharacterState } from '../assets/js/character-sheet/storageKeys.js';
import { validateCharacterState } from '../assets/js/character-sheet/dataValidator.js';

describe('External curriculum state (StateAdapter)', () => {
  let adapter;
  let state;

  beforeEach(() => {
    localStorage.clear();
    state = createEmptyCharacterState();
    adapter = new StateAdapter(state);
  });

  describe('addCurriculum', () => {
    it('adds a curriculum with id and name', () => {
      const handler = jest.fn();
      adapter.on(STATE_EVENTS.EXTERNAL_CURRICULUM_CHANGED, handler);

      const curriculum = adapter.addCurriculum('My Reading List');

      expect(curriculum).not.toBeNull();
      expect(curriculum.id).toBeDefined();
      expect(curriculum.name).toBe('My Reading List');
      expect(curriculum.categories).toEqual({});
      expect(handler).toHaveBeenCalled();
    });
  });

  describe('updateCurriculum', () => {
    it('updates curriculum name', () => {
      const c = adapter.addCurriculum('Original');
      const updated = adapter.updateCurriculum(c.id, { name: 'Updated Name' });

      expect(updated).not.toBeNull();
      expect(updated.name).toBe('Updated Name');
    });

    it('returns null for unknown id', () => {
      expect(adapter.updateCurriculum('bad-id', { name: 'X' })).toBeNull();
    });
  });

  describe('deleteCurriculum', () => {
    it('removes curriculum and emits', () => {
      const c = adapter.addCurriculum('To Remove');
      const handler = jest.fn();
      adapter.on(STATE_EVENTS.EXTERNAL_CURRICULUM_CHANGED, handler);

      const result = adapter.deleteCurriculum(c.id);

      expect(result).toBe(true);
      const data = state[STORAGE_KEYS.EXTERNAL_CURRICULUM];
      expect(data.curriculums[c.id]).toBeUndefined();
      expect(handler).toHaveBeenCalled();
    });

    it('returns false for unknown id', () => {
      expect(adapter.deleteCurriculum('bad-id')).toBe(false);
    });
  });

  describe('addCategory', () => {
    it('adds a category to a curriculum', () => {
      const curriculum = adapter.addCurriculum('Curr');
      const handler = jest.fn();
      adapter.on(STATE_EVENTS.EXTERNAL_CURRICULUM_CHANGED, handler);

      const category = adapter.addCategory(curriculum.id, 'Fiction');

      expect(category).not.toBeNull();
      expect(category.id).toBeDefined();
      expect(category.name).toBe('Fiction');
      expect(category.prompts).toEqual({});
      expect(handler).toHaveBeenCalled();
    });

    it('returns null for unknown curriculumId', () => {
      expect(adapter.addCategory('bad-id', 'Cat')).toBeNull();
    });
  });

  describe('addPrompts', () => {
    it('adds multiple prompts in batch', () => {
      const curriculum = adapter.addCurriculum('Curr');
      const category = adapter.addCategory(curriculum.id, 'Cat');
      const handler = jest.fn();
      adapter.on(STATE_EVENTS.EXTERNAL_CURRICULUM_CHANGED, handler);

      const added = adapter.addPrompts(curriculum.id, category.id, [
        'Read a fantasy novel',
        'Read a mystery',
        ''
      ]);

      expect(added).toHaveLength(2);
      expect(added[0].text).toBe('Read a fantasy novel');
      expect(added[0].bookId).toBeNull();
      expect(added[0].completedAt).toBeNull();
      expect(added[1].text).toBe('Read a mystery');
      expect(handler).toHaveBeenCalled();

      const data = state[STORAGE_KEYS.EXTERNAL_CURRICULUM];
      const prompts = data.curriculums[curriculum.id].categories[category.id].prompts;
      expect(Object.keys(prompts)).toHaveLength(2);
    });

    it('returns empty array for invalid inputs', () => {
      const curriculum = adapter.addCurriculum('C');
      const category = adapter.addCategory(curriculum.id, 'Cat');

      expect(adapter.addPrompts('bad', category.id, ['a'])).toEqual([]);
      expect(adapter.addPrompts(curriculum.id, 'bad', ['a'])).toEqual([]);
      expect(adapter.addPrompts(curriculum.id, category.id, [])).toEqual([]);
    });
  });

  describe('linkBookToPrompt', () => {
    it('links a book to a prompt and updates book links', () => {
      const book = adapter.addBook({ title: 'Linked Book' });
      const curriculum = adapter.addCurriculum('C');
      const category = adapter.addCategory(curriculum.id, 'Cat');
      const [prompt] = adapter.addPrompts(curriculum.id, category.id, ['Prompt 1']);

      const updated = adapter.linkBookToPrompt(prompt.id, book.id);

      expect(updated).not.toBeNull();
      expect(updated.bookId).toBe(book.id);

      const bookAfter = adapter.getBook(book.id);
      expect(bookAfter.links.curriculumPromptIds).toContain(prompt.id);
    });

    it('unlinks when passing null bookId and removes prompt from book links', () => {
      const book = adapter.addBook({ title: 'B' });
      const curriculum = adapter.addCurriculum('C');
      const category = adapter.addCategory(curriculum.id, 'Cat');
      const [prompt] = adapter.addPrompts(curriculum.id, category.id, ['P']);
      adapter.linkBookToPrompt(prompt.id, book.id);
      expect(adapter.getBook(book.id).links.curriculumPromptIds).toContain(prompt.id);

      const updated = adapter.linkBookToPrompt(prompt.id, null);

      expect(updated.bookId).toBeNull();
      expect(adapter.getBook(book.id).links.curriculumPromptIds).not.toContain(prompt.id);
    });

    it('returns null for unknown promptId', () => {
      const book = adapter.addBook({ title: 'B' });
      expect(adapter.linkBookToPrompt('bad-prompt-id', book.id)).toBeNull();
    });
  });

  describe('markPromptComplete', () => {
    it('sets completedAt on prompt', () => {
      const curriculum = adapter.addCurriculum('C');
      const category = adapter.addCategory(curriculum.id, 'Cat');
      const [prompt] = adapter.addPrompts(curriculum.id, category.id, ['Do it']);

      const updated = adapter.markPromptComplete(prompt.id);

      expect(updated).not.toBeNull();
      expect(updated.completedAt).toBeDefined();
    });

    it('returns null for unknown promptId', () => {
      expect(adapter.markPromptComplete('bad-id')).toBeNull();
    });
  });
});

describe('External curriculum validation', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('validates nested curriculum structure', () => {
    const state = createEmptyCharacterState();
    state[STORAGE_KEYS.EXTERNAL_CURRICULUM] = {
      curriculums: {
        'c1': {
          id: 'c1',
          name: 'Reading Challenge',
          categories: {
            'cat1': {
              id: 'cat1',
              name: 'Fiction',
              prompts: {
                'p1': {
                  id: 'p1',
                  text: 'Read a novel',
                  bookId: null,
                  completedAt: null
                }
              }
            }
          }
        }
      }
    };

    const validated = validateCharacterState(state);

    const data = validated[STORAGE_KEYS.EXTERNAL_CURRICULUM];
    expect(data.curriculums['c1'].name).toBe('Reading Challenge');
    expect(data.curriculums['c1'].categories['cat1'].name).toBe('Fiction');
    expect(data.curriculums['c1'].categories['cat1'].prompts['p1'].text).toBe('Read a novel');
  });

  it('returns empty curriculums for invalid root', () => {
    const state = createEmptyCharacterState();
    state[STORAGE_KEYS.EXTERNAL_CURRICULUM] = null;

    const validated = validateCharacterState(state);

    expect(validated[STORAGE_KEYS.EXTERNAL_CURRICULUM]).toEqual({ curriculums: {} });
  });

  it('filters invalid prompts and preserves valid ones', () => {
    const state = createEmptyCharacterState();
    state[STORAGE_KEYS.EXTERNAL_CURRICULUM] = {
      curriculums: {
        'c1': {
          id: 'c1',
          name: 'C',
          categories: {
            'cat1': {
              id: 'cat1',
              name: 'Cat',
              prompts: {
                'p1': { id: 'p1', text: 'Valid', bookId: null, completedAt: null },
                'bad': { text: 'No id' }
              }
            }
          }
        }
      }
    };

    const validated = validateCharacterState(state);

    const prompts = validated[STORAGE_KEYS.EXTERNAL_CURRICULUM].curriculums['c1'].categories['cat1'].prompts;
    expect(prompts['p1']).toBeDefined();
    expect(prompts['p1'].text).toBe('Valid');
    expect(prompts['bad']).toBeUndefined();
  });
});
