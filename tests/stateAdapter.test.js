/**
 * @jest-environment jsdom
 */
import { StateAdapter, STATE_EVENTS } from '../assets/js/character-sheet/stateAdapter.js';
import { STORAGE_KEYS, createEmptyCharacterState } from '../assets/js/character-sheet/storageKeys.js';

describe('StateAdapter', () => {
  let adapter;
  let state;

  beforeEach(() => {
    localStorage.clear();
    state = createEmptyCharacterState();
    adapter = new StateAdapter(state);
  });

  it('setSelectedGenres persists sanitized list and emits change event', () => {
    const handler = jest.fn();
    adapter.on(STATE_EVENTS.SELECTED_GENRES_CHANGED, handler);

    const result = adapter.setSelectedGenres([' Fantasy ', 'Mystery', 'Fantasy', '', null]);

    expect(result).toEqual(['Fantasy', 'Mystery']);
    expect(state[STORAGE_KEYS.SELECTED_GENRES]).toEqual(['Fantasy', 'Mystery']);
    expect(JSON.parse(localStorage.getItem(STORAGE_KEYS.SELECTED_GENRES))).toEqual(['Fantasy', 'Mystery']);
    expect(handler).toHaveBeenCalledWith(['Fantasy', 'Mystery']);
  });

  it('does not emit change event when setting identical genres', () => {
    adapter.setSelectedGenres(['Mystery', 'Fantasy']);
    const handler = jest.fn();
    adapter.on(STATE_EVENTS.SELECTED_GENRES_CHANGED, handler);

    adapter.setSelectedGenres(['Mystery', 'Fantasy']);

    expect(handler).not.toHaveBeenCalled();
  });

  it('syncSelectedGenresFromStorage hydrates state without emitting events', () => {
    localStorage.setItem(STORAGE_KEYS.SELECTED_GENRES, JSON.stringify(['Mystery', 'Fantasy']));
    const handler = jest.fn();
    adapter.on(STATE_EVENTS.SELECTED_GENRES_CHANGED, handler);

    const genres = adapter.syncSelectedGenresFromStorage();

    expect(genres).toEqual(['Mystery', 'Fantasy']);
    expect(state[STORAGE_KEYS.SELECTED_GENRES]).toEqual(['Mystery', 'Fantasy']);
    expect(handler).not.toHaveBeenCalled();
  });

  it('clearSelectedGenres removes persisted value', () => {
    adapter.setSelectedGenres(['Mystery']);
    adapter.clearSelectedGenres();

    expect(state[STORAGE_KEYS.SELECTED_GENRES]).toEqual([]);
    expect(JSON.parse(localStorage.getItem(STORAGE_KEYS.SELECTED_GENRES))).toEqual([]);
  });

  it('addActiveQuests emits change events and stores quests', () => {
    const handler = jest.fn();
    adapter.on(STATE_EVENTS.ACTIVE_ASSIGNMENTS_CHANGED, handler);

    const quests = [{ id: 1, type: 'Test Quest' }];
    adapter.addActiveQuests(quests);

    expect(state[STORAGE_KEYS.ACTIVE_ASSIGNMENTS]).toHaveLength(1);
    expect(state[STORAGE_KEYS.ACTIVE_ASSIGNMENTS][0]).toEqual(quests[0]);
    expect(handler).toHaveBeenCalledWith(state[STORAGE_KEYS.ACTIVE_ASSIGNMENTS]);
  });

  it('moveQuest transfers quest between lists', () => {
    const quest = { id: 42, type: 'Dungeon' };
    adapter.addActiveQuests(quest);
    const handlerCompleted = jest.fn();
    adapter.on(STATE_EVENTS.COMPLETED_QUESTS_CHANGED, handlerCompleted);

    const transformed = adapter.moveQuest(
      STORAGE_KEYS.ACTIVE_ASSIGNMENTS,
      0,
      STORAGE_KEYS.COMPLETED_QUESTS,
      (q) => ({ ...q, completed: true })
    );

    expect(transformed).toEqual({ id: 42, type: 'Dungeon', completed: true });
    expect(state[STORAGE_KEYS.ACTIVE_ASSIGNMENTS]).toHaveLength(0);
    expect(state[STORAGE_KEYS.COMPLETED_QUESTS]).toHaveLength(1);
    expect(handlerCompleted).toHaveBeenCalledWith(state[STORAGE_KEYS.COMPLETED_QUESTS]);
  });

  it('moveInventoryItemToEquipped moves items between lists', () => {
    const invHandler = jest.fn();
    const equipHandler = jest.fn();
    adapter.on(STATE_EVENTS.INVENTORY_ITEMS_CHANGED, invHandler);
    adapter.on(STATE_EVENTS.EQUIPPED_ITEMS_CHANGED, equipHandler);

    adapter.addInventoryItem({ name: 'Lens of Clarity', type: 'wearable' });
    const moved = adapter.moveInventoryItemToEquipped(0);

    expect(moved).toEqual({ name: 'Lens of Clarity', type: 'wearable' });
    expect(state[STORAGE_KEYS.INVENTORY_ITEMS]).toHaveLength(0);
    expect(state[STORAGE_KEYS.EQUIPPED_ITEMS]).toHaveLength(1);
    expect(invHandler).toHaveBeenCalled();
    expect(equipHandler).toHaveBeenCalled();
  });
});

