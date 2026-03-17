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

  it('emits change event even when setting identical genres (for UI consistency)', () => {
    adapter.setSelectedGenres(['Mystery', 'Fantasy']);
    const handler = jest.fn();
    adapter.on(STATE_EVENTS.SELECTED_GENRES_CHANGED, handler);

    adapter.setSelectedGenres(['Mystery', 'Fantasy']);

    // Always emit to ensure UI stays in sync
    expect(handler).toHaveBeenCalledWith(['Mystery', 'Fantasy']);
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

  it('addCompletedQuests prevents duplicate quest ids', () => {
    const quest = { id: 'restore-front-desk', type: '🔨 Restoration Project', prompt: 'Front Desk: Restore it' };
    adapter.addCompletedQuests(quest);

    const result = adapter.addCompletedQuests({ ...quest, prompt: 'Front Desk: Restore it (duplicate attempt)' });

    expect(result).toEqual([]);
    expect(state[STORAGE_KEYS.COMPLETED_QUESTS]).toHaveLength(1);
    expect(state[STORAGE_KEYS.COMPLETED_QUESTS][0].id).toBe('restore-front-desk');
  });

  it('addCompletedQuests prevents duplicates for id-less quests with same signature', () => {
    const questWithoutId = {
      type: '🔨 Restoration Project',
      prompt: 'Restore Front Desk: Complete this project',
      book: 'Some Book',
      month: 'March',
      year: '2026',
      dateCompleted: '2026-03-15T00:00:00.000Z'
    };
    adapter.addCompletedQuests(questWithoutId);

    const result = adapter.addCompletedQuests({ ...questWithoutId });

    expect(result).toEqual([]);
    expect(state[STORAGE_KEYS.COMPLETED_QUESTS]).toHaveLength(1);
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

  describe('Curses', () => {
    it('addActiveCurse adds curse and emits event', () => {
      const handler = jest.fn();
      adapter.on(STATE_EVENTS.ACTIVE_CURSES_CHANGED, handler);

      const curse = { name: 'Test Curse', requirement: 'Read 5 books' };
      const result = adapter.addActiveCurse(curse);

      expect(result).toEqual(curse);
      expect(state[STORAGE_KEYS.ACTIVE_CURSES]).toHaveLength(1);
      expect(state[STORAGE_KEYS.ACTIVE_CURSES][0]).toEqual(curse);
      expect(handler).toHaveBeenCalled();
    });

    it('updateActiveCurse updates curse at index', () => {
      const curse = { name: 'Test Curse', requirement: 'Read 5 books' };
      adapter.addActiveCurse(curse);
      
      const updated = { name: 'Updated Curse', requirement: 'Read 10 books' };
      const result = adapter.updateActiveCurse(0, updated);

      expect(result).toEqual(updated);
      expect(state[STORAGE_KEYS.ACTIVE_CURSES][0]).toEqual(updated);
    });

    it('removeActiveCurse removes curse at index', () => {
      adapter.addActiveCurse({ name: 'Curse 1' });
      adapter.addActiveCurse({ name: 'Curse 2' });
      const handler = jest.fn();
      adapter.on(STATE_EVENTS.ACTIVE_CURSES_CHANGED, handler);

      const removed = adapter.removeActiveCurse(0);

      expect(removed).toEqual({ name: 'Curse 1' });
      expect(state[STORAGE_KEYS.ACTIVE_CURSES]).toHaveLength(1);
      expect(state[STORAGE_KEYS.ACTIVE_CURSES][0].name).toBe('Curse 2');
      expect(handler).toHaveBeenCalled();
    });

    it('moveCurseToCompleted moves curse between lists', () => {
      const curse = { name: 'Active Curse', requirement: 'Complete quest' };
      adapter.addActiveCurse(curse);
      const activeHandler = jest.fn();
      const completedHandler = jest.fn();
      adapter.on(STATE_EVENTS.ACTIVE_CURSES_CHANGED, activeHandler);
      adapter.on(STATE_EVENTS.COMPLETED_CURSES_CHANGED, completedHandler);

      const moved = adapter.moveCurseToCompleted(0);

      expect(moved).toEqual(curse);
      expect(state[STORAGE_KEYS.ACTIVE_CURSES]).toHaveLength(0);
      expect(state[STORAGE_KEYS.COMPLETED_CURSES]).toHaveLength(1);
      expect(state[STORAGE_KEYS.COMPLETED_CURSES][0]).toEqual(curse);
      expect(activeHandler).toHaveBeenCalled();
      expect(completedHandler).toHaveBeenCalled();
    });

    it('removeCompletedCurse removes completed curse', () => {
      adapter.addActiveCurse({ name: 'Curse' });
      adapter.moveCurseToCompleted(0);
      const handler = jest.fn();
      adapter.on(STATE_EVENTS.COMPLETED_CURSES_CHANGED, handler);

      const removed = adapter.removeCompletedCurse(0);

      expect(removed).toBeTruthy();
      expect(state[STORAGE_KEYS.COMPLETED_CURSES]).toHaveLength(0);
      expect(handler).toHaveBeenCalled();
    });
  });

  describe('Temporary Buffs', () => {
    it('addTemporaryBuff adds buff and emits event', () => {
      const handler = jest.fn();
      adapter.on(STATE_EVENTS.TEMPORARY_BUFFS_CHANGED, handler);

      const buff = { name: 'Power Boost', duration: 'two-months', monthsRemaining: 2, status: 'active' };
      const result = adapter.addTemporaryBuff(buff);

      expect(result).toEqual(buff);
      expect(state[STORAGE_KEYS.TEMPORARY_BUFFS]).toHaveLength(1);
      expect(handler).toHaveBeenCalled();
    });

    it('removeTemporaryBuff removes buff at index', () => {
      adapter.addTemporaryBuff({ name: 'Buff 1' });
      adapter.addTemporaryBuff({ name: 'Buff 2' });
      const handler = jest.fn();
      adapter.on(STATE_EVENTS.TEMPORARY_BUFFS_CHANGED, handler);

      const removed = adapter.removeTemporaryBuff(0);

      expect(removed).toEqual({ name: 'Buff 1' });
      expect(state[STORAGE_KEYS.TEMPORARY_BUFFS]).toHaveLength(1);
      expect(handler).toHaveBeenCalled();
    });

    it('updateTemporaryBuff updates buff properties', () => {
      adapter.addTemporaryBuff({ name: 'Buff', status: 'active' });
      const handler = jest.fn();
      adapter.on(STATE_EVENTS.TEMPORARY_BUFFS_CHANGED, handler);

      const result = adapter.updateTemporaryBuff(0, { status: 'used' });

      expect(result.status).toBe('used');
      expect(state[STORAGE_KEYS.TEMPORARY_BUFFS][0].status).toBe('used');
      expect(handler).toHaveBeenCalled();
    });
  });

  describe('Learned Abilities', () => {
    it('addLearnedAbility adds ability and emits event', () => {
      const handler = jest.fn();
      adapter.on(STATE_EVENTS.LEARNED_ABILITIES_CHANGED, handler);

      const result = adapter.addLearnedAbility('Master Reader');

      expect(result).toBe('Master Reader');
      expect(state[STORAGE_KEYS.LEARNED_ABILITIES]).toContain('Master Reader');
      expect(handler).toHaveBeenCalled();
    });

    it('addLearnedAbility prevents duplicates', () => {
      adapter.addLearnedAbility('Ability');
      const handler = jest.fn();
      adapter.on(STATE_EVENTS.LEARNED_ABILITIES_CHANGED, handler);

      const result = adapter.addLearnedAbility('Ability');

      expect(result).toBeNull();
      expect(state[STORAGE_KEYS.LEARNED_ABILITIES]).toHaveLength(1);
      expect(handler).not.toHaveBeenCalled();
    });

    it('removeLearnedAbility removes ability at index', () => {
      adapter.addLearnedAbility('Ability 1');
      adapter.addLearnedAbility('Ability 2');
      const handler = jest.fn();
      adapter.on(STATE_EVENTS.LEARNED_ABILITIES_CHANGED, handler);

      const removed = adapter.removeLearnedAbility(0);

      expect(removed).toBe('Ability 1');
      expect(state[STORAGE_KEYS.LEARNED_ABILITIES]).toEqual(['Ability 2']);
      expect(handler).toHaveBeenCalled();
    });
  });

  describe('Atmospheric Buffs', () => {
    it('getAtmosphericBuffs returns copy of buffs object', () => {
      state[STORAGE_KEYS.ATMOSPHERIC_BUFFS] = { 'Buff1': { daysUsed: 5, isActive: true } };
      
      const buffs = adapter.getAtmosphericBuffs();

      expect(buffs).toEqual({ 'Buff1': { daysUsed: 5, isActive: true } });
      expect(buffs).not.toBe(state[STORAGE_KEYS.ATMOSPHERIC_BUFFS]); // Should be a copy
    });

    it('updateAtmosphericBuff creates buff if it does not exist', () => {
      const handler = jest.fn();
      adapter.on(STATE_EVENTS.ATMOSPHERIC_BUFFS_CHANGED, handler);

      const result = adapter.updateAtmosphericBuff('New Buff', { daysUsed: 3, isActive: true });

      expect(result).toEqual({ daysUsed: 3, isActive: true });
      expect(state[STORAGE_KEYS.ATMOSPHERIC_BUFFS]['New Buff']).toEqual({ daysUsed: 3, isActive: true });
      expect(handler).toHaveBeenCalled();
    });

    it('setAtmosphericBuffActive updates active status', () => {
      adapter.updateAtmosphericBuff('Test Buff', { daysUsed: 0, isActive: false });
      const handler = jest.fn();
      adapter.on(STATE_EVENTS.ATMOSPHERIC_BUFFS_CHANGED, handler);

      const result = adapter.setAtmosphericBuffActive('Test Buff', true);

      expect(result.isActive).toBe(true);
      expect(state[STORAGE_KEYS.ATMOSPHERIC_BUFFS]['Test Buff'].isActive).toBe(true);
      expect(handler).toHaveBeenCalled();
    });

    it('setAtmosphericBuffDaysUsed updates days used', () => {
      adapter.updateAtmosphericBuff('Test Buff', { daysUsed: 0, isActive: true });
      const handler = jest.fn();
      adapter.on(STATE_EVENTS.ATMOSPHERIC_BUFFS_CHANGED, handler);

      const result = adapter.setAtmosphericBuffDaysUsed('Test Buff', 7);

      expect(result.daysUsed).toBe(7);
      expect(state[STORAGE_KEYS.ATMOSPHERIC_BUFFS]['Test Buff'].daysUsed).toBe(7);
      expect(handler).toHaveBeenCalled();
    });
  });

  describe('Buff Month Counter', () => {
    it('getBuffMonthCounter returns current counter value', () => {
      state[STORAGE_KEYS.BUFF_MONTH_COUNTER] = 5;
      
      expect(adapter.getBuffMonthCounter()).toBe(5);
    });

    it('getBuffMonthCounter returns 0 if not set', () => {
      expect(adapter.getBuffMonthCounter()).toBe(0);
    });

    it('incrementBuffMonthCounter increments and persists', () => {
      state[STORAGE_KEYS.BUFF_MONTH_COUNTER] = 2;

      const result = adapter.incrementBuffMonthCounter();

      expect(result).toBe(3);
      expect(state[STORAGE_KEYS.BUFF_MONTH_COUNTER]).toBe(3);
    });
  });

  describe('Genre Dice Selection', () => {
    it('getGenreDiceSelection returns current dice selection', () => {
      state[STORAGE_KEYS.GENRE_DICE_SELECTION] = 'd8';
      
      expect(adapter.getGenreDiceSelection()).toBe('d8');
    });

    it('getGenreDiceSelection returns d6 if not set', () => {
      expect(adapter.getGenreDiceSelection()).toBe('d6');
    });

    it('setGenreDiceSelection persists valid dice type', () => {
      const result = adapter.setGenreDiceSelection('d10');

      expect(result).toBe('d10');
      expect(state[STORAGE_KEYS.GENRE_DICE_SELECTION]).toBe('d10');
      expect(JSON.parse(localStorage.getItem(STORAGE_KEYS.GENRE_DICE_SELECTION))).toBe('d10');
    });

    it('setGenreDiceSelection accepts all valid dice types', () => {
      const validDice = ['d4', 'd6', 'd8', 'd10', 'd12', 'd20'];
      
      validDice.forEach(dice => {
        const result = adapter.setGenreDiceSelection(dice);
        expect(result).toBe(dice);
        expect(state[STORAGE_KEYS.GENRE_DICE_SELECTION]).toBe(dice);
      });
    });

    it('setGenreDiceSelection defaults to d6 for invalid dice type', () => {
      const result = adapter.setGenreDiceSelection('invalid');

      expect(result).toBe('d6');
      expect(state[STORAGE_KEYS.GENRE_DICE_SELECTION]).toBe('d6');
    });

    it('setGenreDiceSelection defaults to d6 for null/undefined', () => {
      expect(adapter.setGenreDiceSelection(null)).toBe('d6');
      expect(adapter.setGenreDiceSelection(undefined)).toBe('d6');
    });
  });

  describe('Dungeon completion draws', () => {
    it('getClaimedRoomRewards returns empty array when none claimed', () => {
      expect(adapter.getClaimedRoomRewards()).toEqual([]);
    });

    it('addClaimedRoomReward adds room and getDungeonCompletionDrawsAvailable increases', () => {
      adapter.addClaimedRoomReward('1');
      expect(adapter.getClaimedRoomRewards()).toEqual(['1']);
      expect(adapter.getDungeonCompletionDrawsAvailable()).toBe(1);
      expect(adapter.getDungeonCompletionDrawsRedeemed()).toBe(0);
    });

    it('getDungeonCompletionDrawsRedeemed returns 0 when not set', () => {
      expect(adapter.getDungeonCompletionDrawsRedeemed()).toBe(0);
    });

    it('redeemDungeonCompletionDraw consumes one draw and returns true when available', () => {
      adapter.addClaimedRoomReward('1');
      expect(adapter.getDungeonCompletionDrawsAvailable()).toBe(1);
      const result = adapter.redeemDungeonCompletionDraw();
      expect(result).toBe(true);
      expect(adapter.getDungeonCompletionDrawsRedeemed()).toBe(1);
      expect(adapter.getDungeonCompletionDrawsAvailable()).toBe(0);
    });

    it('redeemDungeonCompletionDraw returns false when no draws available', () => {
      const result = adapter.redeemDungeonCompletionDraw();
      expect(result).toBe(false);
      expect(adapter.getDungeonCompletionDrawsRedeemed()).toBe(0);
    });

    it('getDungeonCompletionDrawsAvailable is claimed minus redeemed', () => {
      adapter.addClaimedRoomReward('1');
      adapter.addClaimedRoomReward('2');
      expect(adapter.getDungeonCompletionDrawsAvailable()).toBe(2);
      adapter.redeemDungeonCompletionDraw();
      expect(adapter.getDungeonCompletionDrawsAvailable()).toBe(1);
      adapter.redeemDungeonCompletionDraw();
      expect(adapter.getDungeonCompletionDrawsAvailable()).toBe(0);
    });

    it('refundDungeonCompletionDraw restores one draw when already owned case', () => {
      adapter.addClaimedRoomReward('1');
      adapter.redeemDungeonCompletionDraw();
      expect(adapter.getDungeonCompletionDrawsRedeemed()).toBe(1);
      expect(adapter.getDungeonCompletionDrawsAvailable()).toBe(0);
      const result = adapter.refundDungeonCompletionDraw();
      expect(result).toBe(true);
      expect(adapter.getDungeonCompletionDrawsRedeemed()).toBe(0);
      expect(adapter.getDungeonCompletionDrawsAvailable()).toBe(1);
    });

    it('refundDungeonCompletionDraw returns false when none redeemed', () => {
      expect(adapter.refundDungeonCompletionDraw()).toBe(false);
      expect(adapter.getDungeonCompletionDrawsRedeemed()).toBe(0);
    });
  });

  describe('book box subscription thumbs summary', () => {
    it('getSubscriptionThumbsSummary returns thumbsUp and ratedMonths only for entries with reaction', () => {
      state[STORAGE_KEYS.BOOK_BOX_SUBSCRIPTIONS] = {
        sub1: { id: 'sub1', company: 'Fairyloot', tier: 'Adult', defaultMonthlyCost: 30, skipsAllowedPerYear: 2 }
      };
      state[STORAGE_KEYS.BOOK_BOX_HISTORY] = [
        { id: 'e1', subscriptionId: 'sub1', month: '01', year: '2025', type: 'purchased', reaction: 'thumbsUp' },
        { id: 'e2', subscriptionId: 'sub1', month: '02', year: '2025', type: 'purchased', reaction: 'thumbsDown' },
        { id: 'e3', subscriptionId: 'sub1', month: '03', year: '2025', type: 'purchased' }
      ];
      const summary = adapter.getSubscriptionThumbsSummary('sub1');
      expect(summary.thumbsUp).toBe(1);
      expect(summary.ratedMonths).toBe(2);
    });

    it('getSubscriptionThumbsSummary ignores unrated months (no reaction)', () => {
      state[STORAGE_KEYS.BOOK_BOX_SUBSCRIPTIONS] = {
        sub1: { id: 'sub1', company: 'Test', tier: 'Adult', defaultMonthlyCost: null, skipsAllowedPerYear: 0 }
      };
      state[STORAGE_KEYS.BOOK_BOX_HISTORY] = [
        { id: 'a', subscriptionId: 'sub1', month: '01', year: '2025', type: 'purchased' },
        { id: 'b', subscriptionId: 'sub1', month: '02', year: '2025', type: 'purchased' }
      ];
      const summary = adapter.getSubscriptionThumbsSummary('sub1');
      expect(summary.thumbsUp).toBe(0);
      expect(summary.ratedMonths).toBe(0);
    });

    it('getSubscriptionThumbsSummary returns zero for unknown subscription', () => {
      const summary = adapter.getSubscriptionThumbsSummary('nonexistent');
      expect(summary.thumbsUp).toBe(0);
      expect(summary.ratedMonths).toBe(0);
    });
  });

  describe('curse helpers (Worn Page mitigation)', () => {
    it('getCurseHelperState returns a copy of persisted helper state', () => {
      state[STORAGE_KEYS.CURSE_HELPER_STATE] = { 'item:equipped:0|Chalice': { used: true } };
      const result = adapter.getCurseHelperState();
      expect(result).toEqual({ 'item:equipped:0|Chalice': { used: true } });
      expect(result).not.toBe(state[STORAGE_KEYS.CURSE_HELPER_STATE]);
    });

    it('getCurseHelperState returns empty object when not set', () => {
      state[STORAGE_KEYS.CURSE_HELPER_STATE] = undefined;
      expect(adapter.getCurseHelperState()).toEqual({});
    });

    it('getCurseHelpers discovers item in equipped slot with Worn Page mitigation', () => {
      state[STORAGE_KEYS.EQUIPPED_ITEMS] = [{ name: 'Chalice of Restoration' }];
      const catalogs = {
        allItems: {
          'Chalice of Restoration': {
            name: 'Chalice of Restoration',
            bonus: 'Once per month, you may use this item to remove a Worn Page penalty.'
          }
        },
        temporaryBuffs: {},
        masteryAbilities: {},
        schoolBenefits: {},
        seriesExpedition: { stops: [] }
      };
      const helpers = adapter.getCurseHelpers(catalogs, {});
      expect(helpers).toHaveLength(1);
      expect(helpers[0].sourceType).toBe('item');
      expect(helpers[0].slotMode).toBe('equipped');
      expect(helpers[0].name).toBe('Chalice of Restoration');
      expect(helpers[0].cadence).toBe('monthly');
      expect(helpers[0].sourceId).toMatch(/^item:equipped:/);
    });

    it('getCurseHelpers discovers learned ability with Worn Page mitigation', () => {
      state[STORAGE_KEYS.LEARNED_ABILITIES] = ['Ward Against the Shroud'];
      const catalogs = {
        allItems: {},
        temporaryBuffs: {},
        masteryAbilities: {
          'Ward Against the Shroud': {
            name: 'Ward Against the Shroud',
            benefit: 'Once per month, when you would gain a Worn Page penalty for an uncompleted quest, you may choose to completely negate it.'
          }
        },
        schoolBenefits: {},
        seriesExpedition: { stops: [] }
      };
      const helpers = adapter.getCurseHelpers(catalogs, {});
      expect(helpers).toHaveLength(1);
      expect(helpers[0].sourceType).toBe('ability');
      expect(helpers[0].name).toBe('Ward Against the Shroud');
      expect(helpers[0].cadence).toBe('monthly');
      expect(helpers[0].sourceId).toBe('ability:Ward Against the Shroud');
    });

    it('getCurseHelpers discovers school passive when school option provided', () => {
      const catalogs = {
        allItems: {},
        temporaryBuffs: {},
        masteryAbilities: {},
        schoolBenefits: {
          Abjuration: {
            benefit: 'Once per month, when you would gain a Worn Page penalty, you may instead draw a card from the deck and choose a quest from that draw to complete.'
          }
        },
        seriesExpedition: { stops: [] }
      };
      const helpers = adapter.getCurseHelpers(catalogs, { school: 'Abjuration' });
      expect(helpers).toHaveLength(1);
      expect(helpers[0].sourceType).toBe('school');
      expect(helpers[0].name).toBe('Abjuration');
      expect(helpers[0].cadence).toBe('monthly');
    });

    it('getCurseHelpers returns empty when no sources and no school', () => {
      const catalogs = { allItems: {}, temporaryBuffs: {}, masteryAbilities: {}, schoolBenefits: {}, seriesExpedition: { stops: [] } };
      expect(adapter.getCurseHelpers(catalogs, {})).toEqual([]);
    });
  });
});

