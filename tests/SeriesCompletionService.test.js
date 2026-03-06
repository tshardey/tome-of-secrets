/**
 * @jest-environment jsdom
 *
 * Tests for SeriesCompletionService: canClaim, claim flow, reward by roll, apply reward.
 */
import { StateAdapter } from '../assets/js/character-sheet/stateAdapter.js';
import { STORAGE_KEYS, createEmptyCharacterState } from '../assets/js/character-sheet/storageKeys.js';
import {
  canClaimSeriesCompletionReward,
  claimSeriesCompletionReward,
  getSeriesCompletionRewardByRoll,
  applySeriesCompletionReward
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
    it('returns false when series is not complete', () => {
      const b1 = adapter.addBook({ title: 'B1', author: 'A' });
      const s = adapter.addSeries({ name: 'S', bookIds: [b1.id] });
      expect(canClaimSeriesCompletionReward(s.id, adapter)).toBe(false);
    });

    it('returns false when already claimed', () => {
      const b1 = adapter.addBook({ title: 'B1', author: 'A' });
      adapter.updateBook(b1.id, { status: 'completed' });
      const s = adapter.addSeries({ name: 'S', bookIds: [b1.id] });
      adapter.addClaimedSeriesReward(s.id);
      expect(canClaimSeriesCompletionReward(s.id, adapter)).toBe(false);
    });

    it('returns true when series is complete and not claimed', () => {
      const b1 = adapter.addBook({ title: 'B1', author: 'A' });
      adapter.updateBook(b1.id, { status: 'completed' });
      const s = adapter.addSeries({ name: 'S', bookIds: [b1.id] });
      expect(canClaimSeriesCompletionReward(s.id, adapter)).toBe(true);
    });
  });

  describe('getSeriesCompletionRewardByRoll', () => {
    it('returns reward for roll 1-10', () => {
      expect(getSeriesCompletionRewardByRoll(1).name).toContain('Souvenir');
      expect(getSeriesCompletionRewardByRoll(10).name).toContain('Souvenir');
    });
    it('clamps roll to 1-10', () => {
      expect(getSeriesCompletionRewardByRoll(0)).toBeTruthy();
      expect(getSeriesCompletionRewardByRoll(11)).toBeTruthy();
    });
  });

  describe('claimSeriesCompletionReward', () => {
    it('returns claimed: false when series not complete', () => {
      const s = adapter.addSeries({ name: 'S', bookIds: ['nonexistent'] });
      const result = claimSeriesCompletionReward(s.id, adapter, { updateCurrency });
      expect(result.claimed).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('returns claimed: true and applies reward when complete', () => {
      const b1 = adapter.addBook({ title: 'B1', author: 'A' });
      adapter.updateBook(b1.id, { status: 'completed' });
      const s = adapter.addSeries({ name: 'S', bookIds: [b1.id] });
      const result = claimSeriesCompletionReward(s.id, adapter, { updateCurrency }, 1);
      expect(result.claimed).toBe(true);
      expect(result.reward).toBeDefined();
      expect(adapter.hasClaimedSeriesReward(s.id)).toBe(true);
    });

    it('second claim returns claimed: false', () => {
      const b1 = adapter.addBook({ title: 'B1', author: 'A' });
      adapter.updateBook(b1.id, { status: 'completed' });
      const s = adapter.addSeries({ name: 'S', bookIds: [b1.id] });
      claimSeriesCompletionReward(s.id, adapter, { updateCurrency }, 1);
      const second = claimSeriesCompletionReward(s.id, adapter, { updateCurrency }, 2);
      expect(second.claimed).toBe(false);
    });
  });

  describe('applySeriesCompletionReward', () => {
    it('applies currency reward (Bookmark)', () => {
      const reward = getSeriesCompletionRewardByRoll(1);
      applySeriesCompletionReward(reward, { stateAdapter: adapter, updateCurrency });
      expect(updateCurrency).toHaveBeenCalledWith({ inkDrops: 50, paperScraps: 5 });
    });
  });
});
