/**
 * @jest-environment jsdom
 *
 * Tests for SeriesCompletionService: canClaim, expedition advancement, typed reward application.
 */
import { StateAdapter } from '../assets/js/character-sheet/stateAdapter.js';
import { STORAGE_KEYS, createEmptyCharacterState } from '../assets/js/character-sheet/storageKeys.js';
import {
  canClaimSeriesCompletionReward,
  claimSeriesCompletionReward,
  getSeriesCompletionRewardByRoll,
  applySeriesCompletionReward,
  getSeriesExpedition,
  getNextSeriesExpeditionStop,
  advanceSeriesExpedition
} from '../assets/js/services/SeriesCompletionService.js';

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
      const b1 = adapter.addBook({ title: 'B1', author: 'A' });
      const s = adapter.addSeries({ name: 'S', bookIds: [b1.id], releasedCount: 1, expectedCount: 1, isCompletedSeries: true });
      expect(canClaimSeriesCompletionReward(s.id, adapter)).toBe(false);
    });

    it('returns false when already claimed', () => {
      const b1 = adapter.addBook({ title: 'B1', author: 'A' });
      adapter.updateBook(b1.id, { status: 'completed' });
      const s = adapter.addSeries({ name: 'S', bookIds: [b1.id], releasedCount: 1, expectedCount: 1, isCompletedSeries: true });
      adapter.addClaimedSeriesReward(s.id);
      expect(canClaimSeriesCompletionReward(s.id, adapter)).toBe(false);
    });

    it('returns true when author finished, counts match, keeper read all, and not claimed', () => {
      const b1 = adapter.addBook({ title: 'B1', author: 'A' });
      adapter.updateBook(b1.id, { status: 'completed' });
      const s = adapter.addSeries({ name: 'S', bookIds: [b1.id], releasedCount: 1, expectedCount: 1, isCompletedSeries: true });
      expect(canClaimSeriesCompletionReward(s.id, adapter)).toBe(true);
    });

    it('returns false when author has not finished (isCompletedSeries false)', () => {
      const b1 = adapter.addBook({ title: 'B1', author: 'A' });
      adapter.updateBook(b1.id, { status: 'completed' });
      const s = adapter.addSeries({ name: 'S', bookIds: [b1.id], releasedCount: 1, expectedCount: 1, isCompletedSeries: false });
      expect(canClaimSeriesCompletionReward(s.id, adapter)).toBe(false);
    });

    it('returns false when releasedCount !== expectedCount', () => {
      const b1 = adapter.addBook({ title: 'B1', author: 'A' });
      adapter.updateBook(b1.id, { status: 'completed' });
      const s = adapter.addSeries({ name: 'S', bookIds: [b1.id], releasedCount: 1, expectedCount: 3, isCompletedSeries: true });
      expect(canClaimSeriesCompletionReward(s.id, adapter)).toBe(false);
    });

    it('returns false when keeper has only partially read (completedCount < releasedCount)', () => {
      const b1 = adapter.addBook({ title: 'B1', author: 'A' });
      const b2 = adapter.addBook({ title: 'B2', author: 'A' });
      adapter.updateBook(b1.id, { status: 'completed' });
      const s = adapter.addSeries({ name: 'S', bookIds: [b1.id, b2.id], releasedCount: 2, expectedCount: 2, isCompletedSeries: true });
      expect(canClaimSeriesCompletionReward(s.id, adapter)).toBe(false);
    });

    it('returns true only when author finished, counts match, keeper read all released, and not claimed', () => {
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
      expect(first.reward).toBeDefined();
      expect(first.reward.type).toBeDefined();
    });
  });

  describe('getSeriesCompletionRewardByRoll', () => {
    it('returns reward entry for roll 1-10 (legacy API)', () => {
      expect(getSeriesCompletionRewardByRoll(1).name).toBeTruthy();
      expect(getSeriesCompletionRewardByRoll(10).name).toBeTruthy();
    });
    it('clamps roll to valid stop index', () => {
      expect(getSeriesCompletionRewardByRoll(0)).toBeTruthy();
      expect(getSeriesCompletionRewardByRoll(11)).toBeTruthy();
    });
  });

  describe('claimSeriesCompletionReward', () => {
    it('returns claimed: false when series not complete', () => {
      const s = adapter.addSeries({ name: 'S', bookIds: ['nonexistent'], releasedCount: 1, expectedCount: 1, isCompletedSeries: true });
      const result = claimSeriesCompletionReward(s.id, adapter, { updateCurrency });
      expect(result.claimed).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('returns claimed: false with error when author has not finished (isCompletedSeries false)', () => {
      const b1 = adapter.addBook({ title: 'B1', author: 'A' });
      adapter.updateBook(b1.id, { status: 'completed' });
      const s = adapter.addSeries({ name: 'S', bookIds: [b1.id], releasedCount: 1, expectedCount: 1, isCompletedSeries: false });
      const result = claimSeriesCompletionReward(s.id, adapter, { updateCurrency });
      expect(result.claimed).toBe(false);
      expect(result.error).toBe('Series not complete.');
    });

    it('returns claimed: false when releasedCount !== expectedCount', () => {
      const b1 = adapter.addBook({ title: 'B1', author: 'A' });
      adapter.updateBook(b1.id, { status: 'completed' });
      const s = adapter.addSeries({ name: 'S', bookIds: [b1.id], releasedCount: 1, expectedCount: 3, isCompletedSeries: true });
      const result = claimSeriesCompletionReward(s.id, adapter, { updateCurrency });
      expect(result.claimed).toBe(false);
      expect(result.error).toBe('Series not complete.');
    });

    it('returns claimed: false when keeper has only partially read', () => {
      const b1 = adapter.addBook({ title: 'B1', author: 'A' });
      const b2 = adapter.addBook({ title: 'B2', author: 'A' });
      adapter.updateBook(b1.id, { status: 'completed' });
      const s = adapter.addSeries({ name: 'S', bookIds: [b1.id, b2.id], releasedCount: 2, expectedCount: 2, isCompletedSeries: true });
      const result = claimSeriesCompletionReward(s.id, adapter, { updateCurrency });
      expect(result.claimed).toBe(false);
      expect(result.error).toBe('Series not complete.');
    });

    it('returns claimed: true and applies reward when author finished and keeper read all', () => {
      const b1 = adapter.addBook({ title: 'B1', author: 'A' });
      adapter.updateBook(b1.id, { status: 'completed' });
      const s = adapter.addSeries({ name: 'S', bookIds: [b1.id], releasedCount: 1, expectedCount: 1, isCompletedSeries: true });
      const result = claimSeriesCompletionReward(s.id, adapter, { updateCurrency });
      expect(result.claimed).toBe(true);
      expect(result.reward).toBeDefined();
      expect(result.reward.name).toBeTruthy();
      expect(adapter.hasClaimedSeriesReward(s.id)).toBe(true);
    });

    it('second claim returns claimed: false (same series cannot advance twice)', () => {
      const b1 = adapter.addBook({ title: 'B1', author: 'A' });
      adapter.updateBook(b1.id, { status: 'completed' });
      const s = adapter.addSeries({ name: 'S', bookIds: [b1.id], releasedCount: 1, expectedCount: 1, isCompletedSeries: true });
      claimSeriesCompletionReward(s.id, adapter, { updateCurrency });
      const second = claimSeriesCompletionReward(s.id, adapter, { updateCurrency });
      expect(second.claimed).toBe(false);
    });

    it('advances expedition by one stop and applies typed reward', () => {
      const b1 = adapter.addBook({ title: 'B1', author: 'A' });
      adapter.updateBook(b1.id, { status: 'completed' });
      const s = adapter.addSeries({ name: 'S', bookIds: [b1.id], releasedCount: 1, expectedCount: 1, isCompletedSeries: true });
      const nextBefore = getNextSeriesExpeditionStop(adapter);
      expect(nextBefore).toBeTruthy();
      const result = advanceSeriesExpedition(s.id, adapter, { updateCurrency });
      expect(result.advanced).toBe(true);
      expect(result.stop).toBeDefined();
      expect(result.stop.id).toBe(nextBefore.id);
      expect(result.applied).toBeDefined();
      expect(result.applied.applied).toBe(true);
      if (result.stop.reward.type === 'currency') {
        expect(updateCurrency).toHaveBeenCalled();
      }
    });
  });

  describe('applySeriesCompletionReward', () => {
    it('applies typed currency reward from first expedition stop', () => {
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
