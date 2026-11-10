/**
 * @jest-environment jsdom
 */
import { StateAdapter, STATE_EVENTS } from '../assets/js/character-sheet/stateAdapter.js';
import { STORAGE_KEYS, CHARACTER_STATE_KEYS, createEmptyCharacterState } from '../assets/js/character-sheet/storageKeys.js';
import { LARGE_STATE_KEYS } from '../assets/js/character-sheet/persistence.js';

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

  it('updateActiveQuest merges updates into matching quest and emits event', () => {
    const quest = { id: 'quest-1', type: 'Book Quest' };
    adapter.addActiveQuests([quest]);
    const handler = jest.fn();
    adapter.on(STATE_EVENTS.ACTIVE_ASSIGNMENTS_CHANGED, handler);

    const result = adapter.updateActiveQuest('quest-1', { bookId: 'book-42', book: 'Dune' });

    expect(result).toBe(true);
    expect(state[STORAGE_KEYS.ACTIVE_ASSIGNMENTS][0]).toMatchObject({ id: 'quest-1', type: 'Book Quest', bookId: 'book-42', book: 'Dune' });
    expect(handler).toHaveBeenCalledWith(state[STORAGE_KEYS.ACTIVE_ASSIGNMENTS]);
  });

  it('updateActiveQuest returns false when quest id is not found', () => {
    adapter.addActiveQuests([{ id: 'quest-1', type: 'Book Quest' }]);
    const handler = jest.fn();
    adapter.on(STATE_EVENTS.ACTIVE_ASSIGNMENTS_CHANGED, handler);

    const result = adapter.updateActiveQuest('quest-999', { bookId: 'book-42' });

    expect(result).toBe(false);
    expect(handler).not.toHaveBeenCalled();
  });

  it('updateActiveQuest preserves existing quest fields not in updates', () => {
    const quest = { id: 'quest-2', type: 'Reading Quest', prompt: 'Read something' };
    adapter.addActiveQuests([quest]);

    adapter.updateActiveQuest('quest-2', { bookId: 'book-7' });

    expect(state[STORAGE_KEYS.ACTIVE_ASSIGNMENTS][0]).toMatchObject({ id: 'quest-2', type: 'Reading Quest', prompt: 'Read something', bookId: 'book-7' });
  });

  it('addActiveQuests invokes applyQuestDraftedEffects when assigned', () => {
    const hook = jest.fn();
    adapter.applyQuestDraftedEffects = hook;
    adapter.addActiveQuests([{ type: '♠ Dungeon Crawl' }]);
    expect(hook).toHaveBeenCalledWith(expect.any(Array));
  });

  it('addActiveQuests skips quest drafted hook when skipQuestDraftedEffects', () => {
    const hook = jest.fn();
    adapter.applyQuestDraftedEffects = hook;
    adapter.addActiveQuests([{ type: '♠ Dungeon Crawl' }], { skipQuestDraftedEffects: true });
    expect(hook).not.toHaveBeenCalled();
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

  it('addCompletedQuests prevents exact duplicate completed quest entries', () => {
    const quest = { id: 'restore-front-desk', type: '🔨 Restoration Project', prompt: 'Front Desk: Restore it' };
    adapter.addCompletedQuests(quest);

    const result = adapter.addCompletedQuests({ ...quest });

    expect(result).toEqual([]);
    expect(state[STORAGE_KEYS.COMPLETED_QUESTS]).toHaveLength(1);
    expect(state[STORAGE_KEYS.COMPLETED_QUESTS][0].id).toBe('restore-front-desk');
  });

  it('addCompletedQuests keeps distinct quests even if ids collide', () => {
    const sharedId = 'quest-collision';
    adapter.addCompletedQuests({
      id: sharedId,
      type: '🔨 Restoration Project',
      prompt: 'Repair Front Desk: Complete this project',
      month: 'March',
      year: '2026',
      restorationData: { projectId: 'repair-front-desk' }
    });

    const result = adapter.addCompletedQuests({
      id: sharedId,
      type: '🔨 Restoration Project',
      prompt: 'Restore Grand Entrance: Complete this project',
      month: 'March',
      year: '2026',
      restorationData: { projectId: 'restore-grand-entrance' }
    });

    expect(result).toHaveLength(1);
    expect(state[STORAGE_KEYS.COMPLETED_QUESTS]).toHaveLength(2);
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

  describe('Fund', () => {
    it('addFunds adds whole dollars as cents and emits FUND_CHANGED', () => {
      const handler = jest.fn();
      adapter.on(STATE_EVENTS.FUND_CHANGED, handler);
      expect(adapter.addFunds(15)).toBe(1500);
      expect(adapter.getFundBalanceCents()).toBe(1500);
      expect(JSON.parse(localStorage.getItem(STORAGE_KEYS.FUND_BALANCE_CENTS))).toBe(1500);
      expect(handler).toHaveBeenCalledWith({ balanceCents: 1500 });
    });

    it('addFunds ignores non-positive and non-numeric values', () => {
      adapter.addFunds(15);
      expect(adapter.addFunds(-5)).toBe(1500);
      expect(adapter.addFunds(0)).toBe(1500);
      expect(adapter.addFunds('10')).toBe(1500);
      expect(adapter.addFunds(NaN)).toBe(1500);
      expect(adapter.getFundBalanceCents()).toBe(1500);
    });

    it('deductFunds appends to the ledger and may take the balance negative; deleteFundDeduction refunds', () => {
      adapter.addFunds(15);
      const entry = adapter.deductFunds({ amountCents: 3200, note: 'x', date: '2026-11-08' });
      expect(entry).toEqual(expect.objectContaining({ amountCents: 3200, note: 'x', date: '2026-11-08' }));
      expect(typeof entry.id).toBe('string');
      expect(adapter.getFundBalanceCents()).toBe(-1700);
      expect(adapter.getFundLedger()).toHaveLength(1);

      expect(adapter.deleteFundDeduction(entry.id)).toBe(true);
      expect(adapter.getFundBalanceCents()).toBe(1500);
      expect(adapter.getFundLedger()).toEqual([]);
      expect(adapter.deleteFundDeduction(entry.id)).toBe(false);
    });

    it('deductFunds rejects non-positive or non-integer amounts', () => {
      expect(adapter.deductFunds({ amountCents: 0 })).toBeNull();
      expect(adapter.deductFunds({ amountCents: -100 })).toBeNull();
      expect(adapter.deductFunds({ amountCents: 12.5 })).toBeNull();
      expect(adapter.deductFunds({})).toBeNull();
      expect(adapter.getFundLedger()).toEqual([]);
      expect(adapter.getFundBalanceCents()).toBe(0);
    });

    it('deductFunds defaults the date to today', () => {
      const entry = adapter.deductFunds({ amountCents: 100 });
      expect(entry.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(entry.note).toBe('');
    });

    it('setFundBalanceCents rounds to an integer', () => {
      expect(adapter.setFundBalanceCents(1234.6)).toBe(1235);
      expect(adapter.getFundBalanceCents()).toBe(1235);
    });

    it('deductFunds and deleteFundDeduction emit FUND_CHANGED with the new balance', () => {
      const handler = jest.fn();
      adapter.on(STATE_EVENTS.FUND_CHANGED, handler);
      const entry = adapter.deductFunds({ amountCents: 500, date: '2026-11-08' });
      expect(handler).toHaveBeenLastCalledWith({ balanceCents: -500 });
      adapter.deleteFundDeduction(entry.id);
      expect(handler).toHaveBeenLastCalledWith({ balanceCents: 0 });
    });

    it('fund ledger is IndexedDB-backed and the balance is a cloud-synced character key', () => {
      expect(LARGE_STATE_KEYS.has(STORAGE_KEYS.FUND_LEDGER)).toBe(true);
      expect(LARGE_STATE_KEYS.has(STORAGE_KEYS.FUND_BALANCE_CENTS)).toBe(false);
      expect(CHARACTER_STATE_KEYS).toEqual(expect.arrayContaining([STORAGE_KEYS.FUND_BALANCE_CENTS, STORAGE_KEYS.FUND_LEDGER]));
    });

    it('getFundLedger returns a copy', () => {
      adapter.deductFunds({ amountCents: 100, date: '2026-11-08' });
      adapter.getFundLedger().pop();
      expect(adapter.getFundLedger()).toHaveLength(1);
    });
  });

  describe('quest draw helpers (monthly pool / dice)', () => {
    it('getQuestDrawHelperState returns a copy of persisted helper state', () => {
      state[STORAGE_KEYS.QUEST_DRAW_HELPER_STATE] = { 'school:Divination': { used: true } };
      const result = adapter.getQuestDrawHelperState();
      expect(result).toEqual({ 'school:Divination': { used: true } });
      expect(result).not.toBe(state[STORAGE_KEYS.QUEST_DRAW_HELPER_STATE]);
    });

    it('getQuestDrawHelperState returns empty object when not set', () => {
      state[STORAGE_KEYS.QUEST_DRAW_HELPER_STATE] = undefined;
      expect(adapter.getQuestDrawHelperState()).toEqual({});
    });

    it('getQuestDrawHelpers discovers Divination school benefit', () => {
      const catalogs = {
        allItems: {},
        temporaryBuffs: {},
        masteryAbilities: {},
        schoolBenefits: {
          Divination: {
            benefit:
              'Once per month, you may roll 2 dice instead of 1 for a Monthly Quest, and choose which result you want to use.'
          }
        },
        seriesExpedition: { stops: [] },
        permanentBonuses: {}
      };
      const helpers = adapter.getQuestDrawHelpers(catalogs, { school: 'Divination' });
      expect(helpers).toHaveLength(1);
      expect(helpers[0].sourceType).toBe('school');
      expect(helpers[0].cadence).toBe('monthly');
    });

    it('markQuestDrawHelperUsed sets used and returns true on first use', () => {
      const sourceId = 'school:Divination';
      const result = adapter.markQuestDrawHelperUsed(sourceId, { cadence: 'monthly' });
      expect(result).toBe(true);
      expect(adapter.getQuestDrawHelperState()[sourceId]).toEqual({ used: true });
    });

    it('markQuestDrawHelperUsed returns false for cadence always', () => {
      const sourceId = 'ability:Flicker of Prophecy';
      expect(adapter.markQuestDrawHelperUsed(sourceId, { cadence: 'always' })).toBe(false);
      expect(adapter.getQuestDrawHelperState()[sourceId]).toBeUndefined();
    });

    it('markQuestDrawHelperUsed returns false when already used', () => {
      const sourceId = 'item:equipped:0_Lantern';
      adapter.markQuestDrawHelperUsed(sourceId, {});
      expect(adapter.markQuestDrawHelperUsed(sourceId, {})).toBe(false);
    });

    it('markQuestDrawHelperUsed with cadence every-2-months sets cooldownCyclesRemaining to 2', () => {
      const sourceId = 'item:inventory:0_Spellbook';
      adapter.markQuestDrawHelperUsed(sourceId, { cadence: 'every-2-months' });
      expect(adapter.getQuestDrawHelperState()[sourceId]).toEqual({
        used: true,
        cooldownCyclesRemaining: 2
      });
    });

    it('refreshQuestDrawHelpersAtEndOfMonth restores monthly helper', () => {
      const sourceId = 'school:Divination';
      adapter.markQuestDrawHelperUsed(sourceId, { cadence: 'monthly' });
      const helpers = [{ sourceId, cadence: 'monthly' }];
      expect(adapter.refreshQuestDrawHelpersAtEndOfMonth(helpers)).toBe(true);
      expect(adapter.getQuestDrawHelperState()[sourceId].used).toBe(false);
    });

    it('refreshQuestDrawHelpersAtEndOfMonth decrements every-2-months cooldown', () => {
      const sourceId = 'ability:Test';
      adapter.markQuestDrawHelperUsed(sourceId, { cadence: 'every-2-months' });
      const helpers = [{ sourceId, cadence: 'every-2-months' }];
      adapter.refreshQuestDrawHelpersAtEndOfMonth(helpers);
      expect(adapter.getQuestDrawHelperState()[sourceId].cooldownCyclesRemaining).toBe(1);
      adapter.refreshQuestDrawHelpersAtEndOfMonth(helpers);
      expect(adapter.getQuestDrawHelperState()[sourceId].cooldownCyclesRemaining).toBe(0);
      expect(adapter.getQuestDrawHelperState()[sourceId].used).toBe(false);
    });

    it('removeUsedOneTimeQuestDrawTempBuffsAtEOM removes used one-time matching buff', () => {
      state[STORAGE_KEYS.TEMPORARY_BUFFS] = [
        { name: 'ArchivistFavorTest', description: 'Choose one: reroll a prompt, or gain +100 XP.' }
      ];
      const catalogs = {
        allItems: {},
        temporaryBuffs: {
          ArchivistFavorTest: {
            name: 'ArchivistFavorTest',
            description: 'Choose one: reroll a prompt, or gain +100 XP.'
          }
        },
        masteryAbilities: {},
        schoolBenefits: {},
        seriesExpedition: { stops: [] },
        permanentBonuses: {}
      };
      const helpers = adapter.getQuestDrawHelpers(catalogs, {});
      expect(helpers).toHaveLength(1);
      expect(helpers[0].cadence).toBe('one-time');
      adapter.markQuestDrawHelperUsed(helpers[0].sourceId, {});
      const removed = adapter.removeUsedOneTimeQuestDrawTempBuffsAtEOM(helpers);
      expect(removed).toBe(true);
      expect(state[STORAGE_KEYS.TEMPORARY_BUFFS]).toHaveLength(0);
      expect(adapter.getQuestDrawHelperState()[helpers[0].sourceId]).toBeUndefined();
    });

    it('undoQuestDrawHelperUsed clears used flag', () => {
      const sourceId = 'school:Divination';
      adapter.markQuestDrawHelperUsed(sourceId, { cadence: 'monthly' });
      expect(adapter.undoQuestDrawHelperUsed(sourceId)).toBe(true);
      expect(adapter.getQuestDrawHelperState()[sourceId].used).toBe(false);
    });

    it('undoQuestDrawHelperUsed returns false when not used', () => {
      expect(adapter.undoQuestDrawHelperUsed('school:Divination')).toBe(false);
    });
  });
});

