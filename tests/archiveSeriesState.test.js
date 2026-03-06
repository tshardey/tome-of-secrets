/**
 * @jest-environment jsdom
 *
 * Tests for The Archive series state: StateAdapter series CRUD, book tagging, validation (Schema v7).
 */
import { StateAdapter, STATE_EVENTS } from '../assets/js/character-sheet/stateAdapter.js';
import { STORAGE_KEYS, createEmptyCharacterState } from '../assets/js/character-sheet/storageKeys.js';
import { validateCharacterState } from '../assets/js/character-sheet/dataValidator.js';

describe('Archive series state (StateAdapter)', () => {
  let adapter;
  let state;

  beforeEach(() => {
    localStorage.clear();
    state = createEmptyCharacterState();
    adapter = new StateAdapter(state);
  });

  describe('addSeries', () => {
    it('adds a series with name and empty bookIds', () => {
      const handler = jest.fn();
      adapter.on(STATE_EVENTS.SERIES_CHANGED, handler);

      const s = adapter.addSeries({ name: 'Stormlight Archive' });

      expect(s).not.toBeNull();
      expect(s.id).toBeDefined();
      expect(s.name).toBe('Stormlight Archive');
      expect(s.bookIds).toEqual([]);
      expect(adapter.getSeriesList()).toHaveLength(1);
      expect(handler).toHaveBeenCalled();
    });

    it('accepts optional id and bookIds', () => {
      const s = adapter.addSeries({
        id: 'custom-id',
        name: 'Custom Series',
        bookIds: ['b1', 'b2']
      });
      expect(s.id).toBe('custom-id');
      expect(s.name).toBe('Custom Series');
      expect(s.bookIds).toEqual(['b1', 'b2']);
    });

    it('returns null for invalid or empty name', () => {
      expect(adapter.addSeries(null)).toBeNull();
      expect(adapter.addSeries({})).toBeNull();
      expect(adapter.addSeries({ name: '' })).toBeNull();
      expect(adapter.addSeries({ name: '   ' })).toBeNull();
      expect(adapter.getSeriesList()).toHaveLength(0);
    });
  });

  describe('updateSeries / getSeries / deleteSeries', () => {
    it('updates name and bookIds', () => {
      const s = adapter.addSeries({ name: 'Original' });
      adapter.updateSeries(s.id, { name: 'Updated', bookIds: ['b1'] });
      const got = adapter.getSeries(s.id);
      expect(got.name).toBe('Updated');
      expect(got.bookIds).toEqual(['b1']);
    });

    it('getSeries returns null for unknown id', () => {
      expect(adapter.getSeries('none')).toBeNull();
    });

    it('deleteSeries removes series', () => {
      const s = adapter.addSeries({ name: 'To Delete' });
      expect(adapter.getSeries(s.id)).not.toBeNull();
      expect(adapter.deleteSeries(s.id)).toBe(true);
      expect(adapter.getSeries(s.id)).toBeNull();
      expect(adapter.deleteSeries('none')).toBe(false);
    });
  });

  describe('addBookToSeries / removeBookFromSeries / getSeriesForBook', () => {
    it('tags a book to a series and retrieves series for book', () => {
      const book = adapter.addBook({ title: 'Book 1', author: 'A' });
      const s = adapter.addSeries({ name: 'Series A' });
      adapter.addBookToSeries(s.id, book.id);
      expect(adapter.getSeries(s.id).bookIds).toContain(book.id);
      expect(adapter.getSeriesForBook(book.id)).not.toBeNull();
      expect(adapter.getSeriesForBook(book.id).id).toBe(s.id);
    });

    it('removeBookFromSeries removes book from series', () => {
      const book = adapter.addBook({ title: 'Book 1', author: 'A' });
      const s = adapter.addSeries({ name: 'Series A', bookIds: [book.id] });
      adapter.removeBookFromSeries(s.id, book.id);
      expect(adapter.getSeries(s.id).bookIds).not.toContain(book.id);
      expect(adapter.getSeriesForBook(book.id)).toBeNull();
    });

    it('getSeriesForBook returns null when book not in any series', () => {
      const book = adapter.addBook({ title: 'Orphan', author: 'A' });
      expect(adapter.getSeriesForBook(book.id)).toBeNull();
    });
  });

  describe('deleteBook removes book from all series', () => {
    it('removes bookId from every series when book is deleted', () => {
      const b1 = adapter.addBook({ title: 'B1', author: 'A' });
      const b2 = adapter.addBook({ title: 'B2', author: 'A' });
      const s = adapter.addSeries({ name: 'S', bookIds: [b1.id, b2.id] });
      adapter.deleteBook(b1.id);
      expect(adapter.getBook(b1.id)).toBeNull();
      const series = adapter.getSeries(s.id);
      expect(series.bookIds).toEqual([b2.id]);
    });
  });

  describe('validation', () => {
    it('validateCharacterState includes and validates series', () => {
      state[STORAGE_KEYS.SERIES] = {
        's1': { id: 's1', name: 'Valid', bookIds: [] },
        's2': { id: 's2', name: 'Also valid', bookIds: ['b1'] }
      };
      const validated = validateCharacterState(state);
      expect(validated[STORAGE_KEYS.SERIES]).toBeDefined();
      expect(validated[STORAGE_KEYS.SERIES].s1.name).toBe('Valid');
      expect(validated[STORAGE_KEYS.SERIES].s2.bookIds).toEqual(['b1']);
    });

    it('validates series state when missing or invalid', () => {
      const validated = validateCharacterState({});
      expect(validated[STORAGE_KEYS.SERIES]).toEqual({});
    });
  });

  describe('series completion and claimed rewards', () => {
    it('isSeriesComplete is false for empty series', () => {
      const s = adapter.addSeries({ name: 'Empty' });
      expect(adapter.isSeriesComplete(s.id)).toBe(false);
    });

    it('isSeriesComplete is false until all books are completed', () => {
      const b1 = adapter.addBook({ title: 'B1', author: 'A' });
      const b2 = adapter.addBook({ title: 'B2', author: 'A' });
      const s = adapter.addSeries({ name: 'S', bookIds: [b1.id, b2.id] });
      expect(adapter.isSeriesComplete(s.id)).toBe(false);
      adapter.markBookComplete(b1.id);
      expect(adapter.isSeriesComplete(s.id)).toBe(false);
      adapter.markBookComplete(b2.id);
      expect(adapter.isSeriesComplete(s.id)).toBe(true);
    });

    it('getClaimedSeriesRewards returns empty array initially', () => {
      expect(adapter.getClaimedSeriesRewards()).toEqual([]);
    });

    it('addClaimedSeriesReward adds series id and emits', () => {
      const handler = jest.fn();
      adapter.on(STATE_EVENTS.CLAIMED_SERIES_REWARDS_CHANGED, handler);
      adapter.addClaimedSeriesReward('s1');
      expect(adapter.getClaimedSeriesRewards()).toContain('s1');
      expect(adapter.hasClaimedSeriesReward('s1')).toBe(true);
      expect(handler).toHaveBeenCalled();
    });

    it('addClaimedSeriesReward is idempotent', () => {
      adapter.addClaimedSeriesReward('s1');
      adapter.addClaimedSeriesReward('s1');
      expect(adapter.getClaimedSeriesRewards()).toEqual(['s1']);
    });
  });
});
