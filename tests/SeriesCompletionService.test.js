/**
 * @jest-environment jsdom
 *
 * Tests for SeriesCompletionService: sequential stop advancement, reward application,
 * and expedition progress. Validates that eligible series advance the shared track
 * by exactly one stop, rewards apply in deterministic order, and the same series
 * cannot advance twice.
 */
import { StateAdapter } from '../assets/js/character-sheet/stateAdapter.js';
import { createEmptyCharacterState } from '../assets/js/character-sheet/storageKeys.js';
import {
  canClaimSeriesCompletionReward,
  claimSeriesCompletionReward,
  getSeriesCompletionRewardByRoll,
  applySeriesCompletionReward,
  applyTypedReward,
  getSeriesExpedition,
  getNextSeriesExpeditionStop,
  getCurrentSeriesExpeditionStop,
  getSeriesExpeditionStopIndex,
  getExpeditionPassiveBonuses,
  advanceSeriesExpedition
} from '../assets/js/services/SeriesCompletionService.js';

/** Create a completed series (one book, completed; series releasedCount=expectedCount=1, isCompletedSeries=true). */
function createCompletedSeries(adapter, name = 'S') {
  const b = adapter.addBook({ title: 'B', author: 'A' });
  adapter.updateBook(b.id, { status: 'completed' });
  const s = adapter.addSeries({
    name,
    bookIds: [b.id],
    releasedCount: 1,
    expectedCount: 1,
    isCompletedSeries: true
  });
  return s;
}

/** Create multiple completed series for testing sequential advancement. */
function createCompletedSeriesList(adapter, count) {
  const list = [];
  for (let i = 0; i < count; i++) {
    const b = adapter.addBook({ title: `B${i}`, author: 'A' });
    adapter.updateBook(b.id, { status: 'completed' });
    const s = adapter.addSeries({
      name: `Series ${i}`,
      bookIds: [b.id],
      releasedCount: 1,
      expectedCount: 1,
      isCompletedSeries: true
    });
    list.push(s);
  }
  return list;
}

describe('SeriesCompletionService', () => {
  let adapter;
  let state;
  let updateCurrency;

  beforeEach(() => {
    localStorage.clear();
    state = createEmptyCharacterState();
    adapter = new StateAdapter(state);
    updateCurrency = jest.fn();
  });

  describe('canClaimSeriesCompletionReward', () => {
    it('returns false when seriesId or adapter is missing', () => {
      expect(canClaimSeriesCompletionReward(null, adapter)).toBe(false);
      expect(canClaimSeriesCompletionReward('s1', null)).toBe(false);
    });

    it('returns false when series is not complete (book not completed)', () => {
      const s = createCompletedSeries(adapter);
      const bookId = adapter.getSeries(s.id).bookIds[0];
      adapter.updateBook(bookId, { status: 'reading' });
      expect(canClaimSeriesCompletionReward(s.id, adapter)).toBe(false);
    });

    it('returns false when already claimed (claimedSeriesRewards)', () => {
      const s = createCompletedSeries(adapter);
      adapter.addClaimedSeriesReward(s.id);
      expect(canClaimSeriesCompletionReward(s.id, adapter)).toBe(false);
    });

    it('returns false when series already advanced expedition', () => {
      const s = createCompletedSeries(adapter);
      advanceSeriesExpedition(s.id, adapter, { updateCurrency });
      expect(canClaimSeriesCompletionReward(s.id, adapter)).toBe(false);
    });

    it('returns true when author finished, counts match, keeper read all, and not claimed', () => {
      const s = createCompletedSeries(adapter);
      expect(canClaimSeriesCompletionReward(s.id, adapter)).toBe(true);
    });

    it('returns false when author has not finished (isCompletedSeries false)', () => {
      const b = adapter.addBook({ title: 'B1', author: 'A' });
      adapter.updateBook(b.id, { status: 'completed' });
      const s = adapter.addSeries({
        name: 'S',
        bookIds: [b.id],
        releasedCount: 1,
        expectedCount: 1,
        isCompletedSeries: false
      });
      expect(canClaimSeriesCompletionReward(s.id, adapter)).toBe(false);
    });

    it('returns false when releasedCount !== expectedCount', () => {
      const b = adapter.addBook({ title: 'B1', author: 'A' });
      adapter.updateBook(b.id, { status: 'completed' });
      const s = adapter.addSeries({
        name: 'S',
        bookIds: [b.id],
        releasedCount: 1,
        expectedCount: 3,
        isCompletedSeries: true
      });
      expect(canClaimSeriesCompletionReward(s.id, adapter)).toBe(false);
    });

    it('returns false when keeper has only partially read', () => {
      const b1 = adapter.addBook({ title: 'B1', author: 'A' });
      const b2 = adapter.addBook({ title: 'B2', author: 'A' });
      adapter.updateBook(b1.id, { status: 'completed' });
      const s = adapter.addSeries({
        name: 'S',
        bookIds: [b1.id, b2.id],
        releasedCount: 2,
        expectedCount: 2,
        isCompletedSeries: true
      });
      expect(canClaimSeriesCompletionReward(s.id, adapter)).toBe(false);
    });

    it('returns true when author finished, counts match, keeper read all released, and not claimed', () => {
      const b1 = adapter.addBook({ title: 'B1', author: 'A' });
      const b2 = adapter.addBook({ title: 'B2', author: 'A' });
      adapter.updateBook(b1.id, { status: 'completed' });
      adapter.updateBook(b2.id, { status: 'completed' });
      const s = adapter.addSeries({
        name: 'S',
        bookIds: [b1.id, b2.id],
        releasedCount: 2,
        expectedCount: 2,
        isCompletedSeries: true
      });
      expect(canClaimSeriesCompletionReward(s.id, adapter)).toBe(true);
    });
  });

  describe('getSeriesExpedition', () => {
    it('returns expedition with ordered stops array', () => {
      const expedition = getSeriesExpedition();
      expect(expedition.stops).toBeDefined();
      expect(Array.isArray(expedition.stops)).toBe(true);
      expect(expedition.stops.length).toBeGreaterThan(0);
      const first = expedition.stops[0];
      expect(first.id).toBeDefined();
      expect(first.order).toBe(1);
      expect(first.name).toBeTruthy();
      expect(first.story).toBeDefined();
      expect(first.position).toBeDefined();
      expect(first.position.x).toBeDefined();
      expect(first.position.y).toBeDefined();
      expect(first.reward).toBeDefined();
      expect(first.reward.type).toBeDefined();
    });
  });

  describe('sequential stop advancement', () => {
    it('eligible series advances the expedition by exactly one stop', () => {
      const s = createCompletedSeries(adapter);
      expect(getSeriesExpeditionStopIndex(adapter)).toBe(0);
      const nextBefore = getNextSeriesExpeditionStop(adapter);
      expect(nextBefore).toBeTruthy();
      expect(nextBefore.order).toBe(1);

      const result = advanceSeriesExpedition(s.id, adapter, { updateCurrency });
      expect(result.advanced).toBe(true);
      expect(result.stop).toBeDefined();
      expect(result.stop.id).toBe(nextBefore.id);
      expect(result.stop.order).toBe(1);

      expect(getSeriesExpeditionStopIndex(adapter)).toBe(1);
      expect(getCurrentSeriesExpeditionStop(adapter)).toBeTruthy();
      expect(getCurrentSeriesExpeditionStop(adapter).id).toBe(nextBefore.id);
      const nextAfter = getNextSeriesExpeditionStop(adapter);
      expect(nextAfter).toBeTruthy();
      expect(nextAfter.order).toBe(2);
    });

    it('the same series cannot advance progress twice', () => {
      const s = createCompletedSeries(adapter);
      const first = advanceSeriesExpedition(s.id, adapter, { updateCurrency });
      expect(first.advanced).toBe(true);

      const second = advanceSeriesExpedition(s.id, adapter, { updateCurrency });
      expect(second.advanced).toBe(false);
      expect(second.error).toMatch(/already claimed/i);

      expect(getSeriesExpeditionStopIndex(adapter)).toBe(1);
    });

    it('rewards apply in deterministic stop order across multiple series', () => {
      const [s1, s2] = createCompletedSeriesList(adapter, 2);
      const expedition = getSeriesExpedition();
      const stop1 = expedition.stops[0];
      const stop2 = expedition.stops[1];

      const r1 = advanceSeriesExpedition(s1.id, adapter, { updateCurrency });
      expect(r1.advanced).toBe(true);
      expect(r1.stop.id).toBe(stop1.id);
      expect(r1.stop.order).toBe(1);

      const r2 = advanceSeriesExpedition(s2.id, adapter, { updateCurrency });
      expect(r2.advanced).toBe(true);
      expect(r2.stop.id).toBe(stop2.id);
      expect(r2.stop.order).toBe(2);

      const progress = adapter.getSeriesExpeditionProgress();
      expect(progress).toHaveLength(2);
      expect(progress[0].stopId).toBe(stop1.id);
      expect(progress[1].stopId).toBe(stop2.id);
      expect(getCurrentSeriesExpeditionStop(adapter).id).toBe(stop2.id);
    });

    it('expedition stops at the final stop without overflow', () => {
      const seriesList = createCompletedSeriesList(adapter, 11);
      const expedition = getSeriesExpedition();
      const numStops = expedition.stops.length;
      expect(numStops).toBeGreaterThanOrEqual(10);

      for (let i = 0; i < numStops; i++) {
        const result = advanceSeriesExpedition(seriesList[i].id, adapter, { updateCurrency });
        expect(result.advanced).toBe(true);
        expect(result.stop.order).toBe(i + 1);
      }

      const overflow = advanceSeriesExpedition(seriesList[numStops].id, adapter, { updateCurrency });
      expect(overflow.advanced).toBe(false);
      expect(overflow.error).toMatch(/expedition complete|no further stops/i);
      expect(getSeriesExpeditionStopIndex(adapter)).toBe(numStops);
    });
  });

  describe('reward application by type', () => {
    it('applies currency reward and calls updateCurrency', () => {
      const reward = {
        type: 'currency',
        xp: 10,
        inkDrops: 50,
        paperScraps: 5,
        text: 'Gain +10 XP, +50 Ink Drops, +5 Paper Scraps.'
      };
      const result = applyTypedReward(reward, { stateAdapter: adapter, updateCurrency });
      expect(result.applied).toBe(true);
      expect(result.rewardText).toBe(reward.text);
      expect(updateCurrency).toHaveBeenCalledWith({
        xp: 10,
        inkDrops: 50,
        paperScraps: 5
      });
    });

    it('does not call updateCurrency when currency reward has all zeros', () => {
      const reward = {
        type: 'currency',
        xp: 0,
        inkDrops: 0,
        paperScraps: 0,
        text: 'No gain.'
      };
      applyTypedReward(reward, { stateAdapter: adapter, updateCurrency });
      expect(updateCurrency).not.toHaveBeenCalled();
    });

    it('handles missing updateCurrency in deps (currency still returns applied)', () => {
      const reward = {
        type: 'currency',
        xp: 10,
        inkDrops: 0,
        paperScraps: 0,
        text: 'Gain +10 XP.'
      };
      const result = applyTypedReward(reward, { stateAdapter: adapter });
      expect(result.applied).toBe(true);
      expect(result.rewardText).toBe(reward.text);
    });

    it('handles null or invalid reward without throwing', () => {
      expect(applyTypedReward(null, { stateAdapter: adapter, updateCurrency })).toEqual(
        expect.objectContaining({ applied: true, rewardText: '' })
      );
      expect(applyTypedReward({}, { stateAdapter: adapter, updateCurrency })).toEqual(
        expect.objectContaining({ applied: true, rewardText: '' })
      );
    });

    it('applies item-slot-bonus via addPassiveItemSlot', () => {
      const addPassiveItemSlot = jest.fn();
      const reward = {
        type: 'item-slot-bonus',
        slotId: 'test-slot',
        text: '+1 Display Slot.'
      };
      applyTypedReward(reward, { stateAdapter: { addPassiveItemSlot }, updateCurrency });
      expect(addPassiveItemSlot).toHaveBeenCalledWith('test-slot', 'series-expedition');
    });

    it('applies familiar-slot-bonus via addPassiveFamiliarSlot', () => {
      const addPassiveFamiliarSlot = jest.fn();
      const reward = {
        type: 'familiar-slot-bonus',
        slotId: 'test-familiar-slot',
        text: '+1 Adoption Slot.'
      };
      applyTypedReward(reward, { stateAdapter: { addPassiveFamiliarSlot }, updateCurrency });
      expect(addPassiveFamiliarSlot).toHaveBeenCalledWith('test-familiar-slot', 'series-expedition');
    });

    it('applies temporary-buff via addTemporaryBuff', () => {
      const addTemporaryBuff = jest.fn();
      const reward = {
        type: 'temporary-buff',
        buffName: 'Test Buff',
        description: 'A test.',
        monthsRemaining: 2,
        text: 'Gain Test Buff for 2 months.'
      };
      applyTypedReward(reward, { stateAdapter: { addTemporaryBuff }, updateCurrency });
      expect(addTemporaryBuff).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Test Buff',
          description: 'A test.',
          monthsRemaining: 2,
          status: 'active'
        })
      );
    });

    it('applies passive-rule-modifier (narrative-only, no side effect)', () => {
      const reward = {
        type: 'passive-rule-modifier',
        text: 'Permanent Passive: Some rule.'
      };
      const result = applyTypedReward(reward, { stateAdapter: adapter, updateCurrency });
      expect(result.applied).toBe(true);
      expect(result.rewardText).toBe(reward.text);
      expect(updateCurrency).not.toHaveBeenCalled();
    });

    it('applies narrative reward (text only)', () => {
      const reward = { type: 'narrative', text: 'You feel inspired.' };
      const result = applyTypedReward(reward, { stateAdapter: adapter, updateCurrency });
      expect(result.applied).toBe(true);
      expect(result.rewardText).toBe('You feel inspired.');
    });

    it('curse-removal moves one active curse to completed when present', () => {
      const moveQuest = jest.fn();
      const getActiveCurses = jest.fn().mockReturnValue([{ id: 'c1', name: 'Curse' }]);
      const reward = { type: 'curse-removal', text: 'Remove one curse.' };
      applyTypedReward(reward, {
        stateAdapter: { getActiveCurses, moveQuest },
        updateCurrency
      });
      expect(getActiveCurses).toHaveBeenCalled();
      expect(moveQuest).toHaveBeenCalled();
    });

    it('curse-removal does not call moveQuest when no active curses', () => {
      const moveQuest = jest.fn();
      const getActiveCurses = jest.fn().mockReturnValue([]);
      const reward = { type: 'curse-removal', text: 'Remove one curse.' };
      applyTypedReward(reward, {
        stateAdapter: { getActiveCurses, moveQuest },
        updateCurrency
      });
      expect(getActiveCurses).toHaveBeenCalled();
      expect(moveQuest).not.toHaveBeenCalled();
    });
  });

  describe('rewards from stop advancement (integration)', () => {
    it('first advance applies first stop reward: currency with exact payload from data', () => {
      const expedition = getSeriesExpedition();
      const stop1 = expedition.stops[0];
      expect(stop1.reward.type).toBe('currency');

      const s = createCompletedSeries(adapter);
      const result = advanceSeriesExpedition(s.id, adapter, { updateCurrency });

      expect(result.advanced).toBe(true);
      expect(result.stop.id).toBe(stop1.id);
      expect(result.applied.applied).toBe(true);
      expect(result.applied.rewardText).toBe(stop1.reward.text);
      expect(updateCurrency).toHaveBeenCalledTimes(1);
      expect(updateCurrency).toHaveBeenCalledWith(
        expect.objectContaining({
          xp: stop1.reward.xp,
          inkDrops: stop1.reward.inkDrops,
          paperScraps: stop1.reward.paperScraps
        })
      );
    });

    it('second advance applies second stop reward (passive-rule-modifier, no updateCurrency)', () => {
      const [s1, s2] = createCompletedSeriesList(adapter, 2);
      const expedition = getSeriesExpedition();
      const stop2 = expedition.stops[1];
      expect(stop2.reward.type).toBe('passive-rule-modifier');

      advanceSeriesExpedition(s1.id, adapter, { updateCurrency });
      updateCurrency.mockClear();
      const result = advanceSeriesExpedition(s2.id, adapter, { updateCurrency });

      expect(result.advanced).toBe(true);
      expect(result.stop.id).toBe(stop2.id);
      expect(result.applied.rewardText).toBe(stop2.reward.text);
      expect(updateCurrency).not.toHaveBeenCalled();
    });

    it('third advance applies third stop reward: XP currency', () => {
      const seriesList = createCompletedSeriesList(adapter, 3);
      const expedition = getSeriesExpedition();
      const stop3 = expedition.stops[2];
      expect(stop3.reward.type).toBe('currency');

      advanceSeriesExpedition(seriesList[0].id, adapter, { updateCurrency });
      advanceSeriesExpedition(seriesList[1].id, adapter, { updateCurrency });
      advanceSeriesExpedition(seriesList[2].id, adapter, { updateCurrency });

      expect(updateCurrency).toHaveBeenNthCalledWith(1, expect.objectContaining({
        xp: 0,
        inkDrops: 50,
        paperScraps: 10
      }));
      expect(updateCurrency).toHaveBeenNthCalledWith(2, expect.objectContaining({
        xp: stop3.reward.xp,
        inkDrops: 0,
        paperScraps: 0
      }));
    });

    it('advancing to item-slot-bonus stop adds passive item slot to state', () => {
      const expedition = getSeriesExpedition();
      const slotStop = expedition.stops.find(s => s.reward && s.reward.type === 'item-slot-bonus');
      if (!slotStop) return;
      const stopIndex = expedition.stops.indexOf(slotStop);
      const seriesList = createCompletedSeriesList(adapter, stopIndex + 1);

      for (let i = 0; i <= stopIndex; i++) {
        const r = advanceSeriesExpedition(seriesList[i].id, adapter, { updateCurrency });
        expect(r.advanced).toBe(true);
        expect(r.stop.id).toBe(expedition.stops[i].id);
      }

      const slots = adapter.getPassiveItemSlots();
      expect(slots.some(slot => slot.slotId === slotStop.reward.slotId)).toBe(true);
      expect(slots.find(s => s.slotId === slotStop.reward.slotId).unlockedFrom).toBe('series-expedition');
    });

    it('advancing to familiar-slot-bonus stop adds passive familiar slot to state', () => {
      const expedition = getSeriesExpedition();
      const famStop = expedition.stops.find(s => s.reward && s.reward.type === 'familiar-slot-bonus');
      if (!famStop) return;
      const stopIndex = expedition.stops.indexOf(famStop);
      const seriesList = createCompletedSeriesList(adapter, stopIndex + 1);

      for (let i = 0; i <= stopIndex; i++) {
        const r = advanceSeriesExpedition(seriesList[i].id, adapter, { updateCurrency });
        expect(r.advanced).toBe(true);
      }

      const slots = adapter.getPassiveFamiliarSlots();
      expect(slots.some(slot => slot.slotId === famStop.reward.slotId)).toBe(true);
      expect(slots.find(s => s.slotId === famStop.reward.slotId).unlockedFrom).toBe('series-expedition');
    });

    it('each advance returns applied.rewardText matching the stop reward text', () => {
      const [s1, s2] = createCompletedSeriesList(adapter, 2);
      const expedition = getSeriesExpedition();

      const r1 = advanceSeriesExpedition(s1.id, adapter, { updateCurrency });
      expect(r1.applied.rewardText).toBe(r1.stop.reward.text);
      expect(r1.stop.reward.text).toBe(expedition.stops[0].reward.text);

      const r2 = advanceSeriesExpedition(s2.id, adapter, { updateCurrency });
      expect(r2.applied.rewardText).toBe(r2.stop.reward.text);
      expect(r2.stop.reward.text).toBe(expedition.stops[1].reward.text);
    });

    it('advance does not apply reward when advancement fails (not eligible)', () => {
      const s = createCompletedSeries(adapter);
      advanceSeriesExpedition(s.id, adapter, { updateCurrency });
      const callCountAfterFirst = updateCurrency.mock.calls.length;
      const result = advanceSeriesExpedition(s.id, adapter, { updateCurrency });
      expect(result.advanced).toBe(false);
      expect(updateCurrency.mock.calls.length).toBe(callCountAfterFirst);
    });

    it('advance does not apply reward when expedition is already at final stop', () => {
      const expedition = getSeriesExpedition();
      const seriesList = createCompletedSeriesList(adapter, expedition.stops.length + 1);
      for (let i = 0; i < expedition.stops.length; i++) {
        advanceSeriesExpedition(seriesList[i].id, adapter, { updateCurrency });
      }
      const callCountBeforeOverflow = updateCurrency.mock.calls.length;
      const result = advanceSeriesExpedition(seriesList[expedition.stops.length].id, adapter, { updateCurrency });
      expect(result.advanced).toBe(false);
      expect(result.error).toMatch(/no further stops|expedition complete/i);
      expect(updateCurrency.mock.calls.length).toBe(callCountBeforeOverflow);
    });
  });

  describe('returned payload for UI (toast/detail)', () => {
    it('advanceSeriesExpedition returns stop and applied with name, story, reward text', () => {
      const s = createCompletedSeries(adapter);
      const result = advanceSeriesExpedition(s.id, adapter, { updateCurrency });
      expect(result.advanced).toBe(true);
      expect(result.stop).toBeDefined();
      expect(typeof result.stop.name).toBe('string');
      expect(result.stop.name.length).toBeGreaterThan(0);
      expect(typeof result.stop.story).toBe('string');
      expect(typeof result.stop.id).toBe('string');
      expect(result.stop.position).toBeDefined();
      expect(typeof result.stop.position.x).toBe('number');
      expect(typeof result.stop.position.y).toBe('number');
      expect(result.stop.reward).toBeDefined();
      expect(typeof result.stop.reward.text).toBe('string');
      expect(result.applied).toBeDefined();
      expect(result.applied.applied).toBe(true);
      expect(typeof result.applied.rewardText).toBe('string');
    });

    it('claimSeriesCompletionReward returns reward and applied for display', () => {
      const s = createCompletedSeries(adapter);
      const result = claimSeriesCompletionReward(s.id, adapter, { updateCurrency });
      expect(result.claimed).toBe(true);
      expect(result.reward).toBeDefined();
      expect(result.reward.name).toBeTruthy();
      expect(typeof result.reward.reward).toBe('string');
      expect(result.applied).toBeDefined();
      expect(result.applied.rewardName).toBeTruthy();
      expect(typeof result.applied.rewardText).toBe('string');
    });
  });

  describe('getExpeditionPassiveBonuses', () => {
    it('returns reward text for passive-rule-modifier stops in progress', () => {
      const expedition = getSeriesExpedition();
      const passiveStop = expedition.stops.find(s => s.reward && s.reward.type === 'passive-rule-modifier');
      if (!passiveStop) return;
      const progress = [
        { seriesId: 's1', stopId: passiveStop.id, claimedAt: new Date().toISOString() }
      ];
      const bonuses = getExpeditionPassiveBonuses(progress);
      expect(Array.isArray(bonuses)).toBe(true);
      expect(bonuses).toContain(passiveStop.reward.text);
    });

    it('returns empty array when progress is empty', () => {
      expect(getExpeditionPassiveBonuses([])).toEqual([]);
      expect(getExpeditionPassiveBonuses(null)).toEqual([]);
    });
  });

  describe('legacy API', () => {
    it('getSeriesCompletionRewardByRoll returns reward entry for roll 1-10', () => {
      expect(getSeriesCompletionRewardByRoll(1).name).toBeTruthy();
      expect(getSeriesCompletionRewardByRoll(10).name).toBeTruthy();
    });

    it('getSeriesCompletionRewardByRoll clamps roll to valid stop index', () => {
      expect(getSeriesCompletionRewardByRoll(0)).toBeTruthy();
      expect(getSeriesCompletionRewardByRoll(11)).toBeTruthy();
    });

    it('claimSeriesCompletionReward returns claimed: false when series not complete', () => {
      const s = adapter.addSeries({
        name: 'S',
        bookIds: ['nonexistent'],
        releasedCount: 1,
        expectedCount: 1,
        isCompletedSeries: true
      });
      const result = claimSeriesCompletionReward(s.id, adapter, { updateCurrency });
      expect(result.claimed).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('claimSeriesCompletionReward returns claimed: false when already claimed', () => {
      const s = createCompletedSeries(adapter);
      claimSeriesCompletionReward(s.id, adapter, { updateCurrency });
      const second = claimSeriesCompletionReward(s.id, adapter, { updateCurrency });
      expect(second.claimed).toBe(false);
    });

    it('applySeriesCompletionReward applies typed currency from first stop', () => {
      const reward = getSeriesCompletionRewardByRoll(1);
      applySeriesCompletionReward(reward, { stateAdapter: adapter, updateCurrency });
      expect(updateCurrency).toHaveBeenCalledWith(
        expect.objectContaining({
          inkDrops: 50,
          paperScraps: 10
        })
      );
    });
  });
});
