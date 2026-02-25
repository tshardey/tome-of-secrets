/**
 * @jest-environment jsdom
 *
 * Tests for book state: StateAdapter book CRUD, validation, and migration (Schema v5).
 */
import { StateAdapter, STATE_EVENTS } from '../assets/js/character-sheet/stateAdapter.js';
import { STORAGE_KEYS, createEmptyCharacterState } from '../assets/js/character-sheet/storageKeys.js';
import { validateCharacterState } from '../assets/js/character-sheet/dataValidator.js';
import { migrateState } from '../assets/js/character-sheet/dataMigrator.js';

describe('Book state (StateAdapter)', () => {
  let adapter;
  let state;

  beforeEach(() => {
    localStorage.clear();
    state = createEmptyCharacterState();
    adapter = new StateAdapter(state);
  });

  describe('addBook', () => {
    it('adds a book with required fields and defaults', () => {
      const handler = jest.fn();
      adapter.on(STATE_EVENTS.BOOKS_CHANGED, handler);

      const book = adapter.addBook({ title: 'The Hobbit', author: 'Tolkien' });

      expect(book).not.toBeNull();
      expect(book.id).toBeDefined();
      expect(book.title).toBe('The Hobbit');
      expect(book.author).toBe('Tolkien');
      expect(book.cover).toBeNull();
      expect(book.pageCount).toBeNull();
      expect(book.status).toBe('reading');
      expect(book.dateAdded).toBeDefined();
      expect(book.dateCompleted).toBeNull();
      expect(book.links).toEqual({ questIds: [], curriculumPromptIds: [] });
      expect(adapter.getBooks()).toHaveLength(1);
      expect(handler).toHaveBeenCalled();
    });

    it('accepts full book data including status and links', () => {
      const book = adapter.addBook({
        title: 'Done Book',
        author: 'Author',
        status: 'completed',
        dateCompleted: '2024-01-15T00:00:00.000Z',
        links: { questIds: ['q1'], curriculumPromptIds: ['p1'] }
      });

      expect(book.status).toBe('completed');
      expect(book.dateCompleted).toBe('2024-01-15T00:00:00.000Z');
      expect(book.links.questIds).toEqual(['q1']);
      expect(book.links.curriculumPromptIds).toEqual(['p1']);
    });

    it('accepts legacy coverUrl and pageCountRaw', () => {
      const book = adapter.addBook({
        title: 'Legacy',
        coverUrl: 'https://example.com/cover.jpg',
        pageCountRaw: 300
      });

      expect(book.cover).toBe('https://example.com/cover.jpg');
      expect(book.pageCount).toBe(300);
    });

    it('returns null for invalid input', () => {
      expect(adapter.addBook(null)).toBeNull();
      expect(adapter.addBook(undefined)).toBeNull();
      expect(adapter.getBooks()).toHaveLength(0);
    });
  });

  describe('getBook / getBooks / getBooksByStatus', () => {
    it('getBook returns null for unknown id', () => {
      expect(adapter.getBook('nonexistent')).toBeNull();
    });

    it('getBook returns a copy with links', () => {
      const added = adapter.addBook({ title: 'T', author: 'A' });
      const got = adapter.getBook(added.id);
      expect(got).not.toBe(added);
      expect(got.id).toBe(added.id);
      expect(got.links).toEqual(added.links);
    });

    it('getBooksByStatus filters by status', () => {
      adapter.addBook({ title: 'R1', status: 'reading' });
      adapter.addBook({ title: 'C1', status: 'completed' });
      adapter.addBook({ title: 'R2', status: 'reading' });

      expect(adapter.getBooksByStatus('reading')).toHaveLength(2);
      expect(adapter.getBooksByStatus('completed')).toHaveLength(1);
      expect(adapter.getBooksByStatus('other')).toHaveLength(0);
    });
  });

  describe('updateBook', () => {
    it('updates book fields and emits', () => {
      const book = adapter.addBook({ title: 'Original', author: 'A' });
      const handler = jest.fn();
      adapter.on(STATE_EVENTS.BOOKS_CHANGED, handler);

      const updated = adapter.updateBook(book.id, { title: 'Updated', status: 'completed' });

      expect(updated).not.toBeNull();
      expect(updated.title).toBe('Updated');
      expect(updated.status).toBe('completed');
      expect(adapter.getBook(book.id).title).toBe('Updated');
      expect(handler).toHaveBeenCalled();
    });

    it('returns null for unknown bookId', () => {
      expect(adapter.updateBook('bad-id', { title: 'X' })).toBeNull();
    });
  });

  describe('deleteBook', () => {
    it('removes book and emits', () => {
      const book = adapter.addBook({ title: 'To Remove' });
      const handler = jest.fn();
      adapter.on(STATE_EVENTS.BOOKS_CHANGED, handler);

      const result = adapter.deleteBook(book.id);

      expect(result).toBe(true);
      expect(adapter.getBook(book.id)).toBeNull();
      expect(adapter.getBooks()).toHaveLength(0);
      expect(handler).toHaveBeenCalled();
    });

    it('returns false for unknown bookId', () => {
      expect(adapter.deleteBook('bad-id')).toBe(false);
    });
  });

  describe('markBookComplete', () => {
    it('sets status and dateCompleted', () => {
      const book = adapter.addBook({ title: 'In Progress', status: 'reading' });
      const completed = adapter.markBookComplete(book.id);

      expect(completed).not.toBeNull();
      expect(completed.status).toBe('completed');
      expect(completed.dateCompleted).toBeDefined();
      expect(adapter.getBooksByStatus('completed')).toHaveLength(1);
    });
  });
});

describe('Book validation', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('validates and normalizes book shape', () => {
    const state = createEmptyCharacterState();
    state[STORAGE_KEYS.BOOKS] = {
      'id-1': {
        id: 'id-1',
        title: 'Valid',
        author: 'Author',
        coverUrl: 'https://cover.jpg',
        pageCountRaw: 100,
        status: 'reading',
        links: { tomeQuestId: 'q1' }
      }
    };

    const validated = validateCharacterState(state);

    expect(validated[STORAGE_KEYS.BOOKS]['id-1']).toBeDefined();
    const book = validated[STORAGE_KEYS.BOOKS]['id-1'];
    expect(book.title).toBe('Valid');
    expect(book.cover).toBe('https://cover.jpg');
    expect(book.pageCount).toBe(100);
    expect(book.status).toBe('reading');
    expect(book.links.questIds).toContain('q1');
    expect(book.links.curriculumPromptIds).toEqual([]);
  });

  it('rejects books without id', () => {
    const state = createEmptyCharacterState();
    state[STORAGE_KEYS.BOOKS] = {
      'key': { title: 'No id', author: 'A' }
    };

    const validated = validateCharacterState(state);

    expect(Object.keys(validated[STORAGE_KEYS.BOOKS])).toHaveLength(0);
  });

  it('defaults invalid status to reading', () => {
    const state = createEmptyCharacterState();
    state[STORAGE_KEYS.BOOKS] = {
      'id-1': { id: 'id-1', title: 'T', status: 'invalid' }
    };

    const validated = validateCharacterState(state);

    expect(validated[STORAGE_KEYS.BOOKS]['id-1'].status).toBe('reading');
  });
});

describe('Book migration (v5)', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('migrateToVersion5 creates books from quests with book data', () => {
    const state = {
      [STORAGE_KEYS.ACTIVE_ASSIGNMENTS]: [
        {
          type: '♥ Organize the Stacks',
          prompt: 'Fantasy',
          book: 'Migrated Book',
          bookAuthor: 'Migrated Author',
          month: 'January',
          year: '2024',
          rewards: { xp: 15, inkDrops: 10, paperScraps: 0, items: [] }
        }
      ],
      [STORAGE_KEYS.COMPLETED_QUESTS]: [
        {
          type: '♥ Organize the Stacks',
          prompt: 'Done',
          book: 'Completed Book',
          bookAuthor: 'Done Author',
          month: 'February',
          year: '2024',
          rewards: { xp: 15, inkDrops: 10, paperScraps: 0, items: [] }
        }
      ],
      [STORAGE_KEYS.DISCARDED_QUESTS]: []
    };
    localStorage.setItem('tomeOfSecrets_schemaVersion', '4');

    const migrated = migrateState(state);

    const books = migrated[STORAGE_KEYS.BOOKS];
    expect(typeof books).toBe('object');
    const bookIds = Object.keys(books);
    expect(bookIds.length).toBe(2);

    const activeQuest = migrated[STORAGE_KEYS.ACTIVE_ASSIGNMENTS][0];
    const completedQuest = migrated[STORAGE_KEYS.COMPLETED_QUESTS][0];
    expect(activeQuest.id).toBeDefined();
    expect(activeQuest.bookId).toBeDefined();
    const activeBook = books[activeQuest.bookId];
    expect(activeBook.title).toBe('Migrated Book');
    expect(activeBook.author).toBe('Migrated Author');
    expect(activeBook.status).toBe('reading');
    expect(activeBook.dateCompleted).toBeNull();
    expect(activeBook.links.questIds).toContain(activeQuest.id);

    const completedBook = books[completedQuest.bookId];
    expect(completedBook.title).toBe('Completed Book');
    expect(completedBook.status).toBe('completed');
    expect(completedBook.dateCompleted).toBeDefined();
  });

  it('migrateToVersion5 initializes external curriculum with curriculums', () => {
    localStorage.setItem('tomeOfSecrets_schemaVersion', '4');
    const state = {
      [STORAGE_KEYS.ACTIVE_ASSIGNMENTS]: [],
      [STORAGE_KEYS.COMPLETED_QUESTS]: [],
      [STORAGE_KEYS.DISCARDED_QUESTS]: []
    };

    const migrated = migrateState(state);

    expect(migrated[STORAGE_KEYS.EXTERNAL_CURRICULUM]).toBeDefined();
    expect(migrated[STORAGE_KEYS.EXTERNAL_CURRICULUM].curriculums).toBeDefined();
    expect(typeof migrated[STORAGE_KEYS.EXTERNAL_CURRICULUM].curriculums).toBe('object');
  });
});
