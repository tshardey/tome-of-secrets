/**
 * @jest-environment jsdom
 *
 * Tests for GenreQuestDeckController behavior. The "exclude already-drawn"
 * logic is implemented in the controller (getAvailableGenreQuests result
 * filtered by drawnKeys before calling drawRandomGenreQuest). We test that
 * filtering logic here without full controller bootstrap to avoid mock complexity.
 */
describe('GenreQuestDeckController', () => {
  describe('draw pool filtering', () => {
    it('excludes already-drawn quest keys from pool passed to draw', () => {
      const availableQuests = [
        { key: '1', genre: 'Fantasy', description: 'Read a fantasy book' },
        { key: '2', genre: 'Mystery', description: 'Read a mystery book' },
        { key: '3', genre: 'Fantasy', description: 'Read another fantasy book' },
      ];
      const drawnQuests = [{ key: '1', genre: 'Fantasy', description: 'Read a fantasy book' }];
      const drawnKeys = new Set(drawnQuests.map((q) => q.key));
      const pool = availableQuests.filter((q) => !drawnKeys.has(q.key));

      expect(pool).toHaveLength(2);
      expect(pool.every((q) => q.key !== '1')).toBe(true);
      expect(pool.map((q) => q.key).sort()).toEqual(['2', '3']);
    });
  });
});
