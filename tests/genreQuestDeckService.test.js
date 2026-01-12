/**
 * @jest-environment jsdom
 */
describe('GenreQuestDeckService', () => {
  let GenreQuestDeckService;
  let mockData;

  beforeEach(() => {
    jest.isolateModules(() => {
      mockData = {
        genreQuests: {
          '1': { genre: 'Fantasy', description: 'Read a fantasy book' },
          '2': { genre: 'Mystery', description: 'Read a mystery book' },
          '3': { genre: 'Fantasy', description: 'Read another fantasy book' },
          '4': { genre: 'Sci-Fi', description: 'Read a sci-fi book' },
        },
      };

      jest.doMock('../assets/js/character-sheet/data.js', () => mockData);
      const { STORAGE_KEYS } = require('../assets/js/character-sheet/storageKeys.js');
      GenreQuestDeckService = require('../assets/js/services/GenreQuestDeckService.js');
    });
  });

  describe('isGenreQuestCompleted', () => {
    it('returns true when quest is completed with exact prompt match', () => {
      const completedQuests = [
        {
          type: '♥ Organize the Stacks',
          prompt: 'Fantasy: Read a fantasy book',
        },
      ];

      const result = GenreQuestDeckService.isGenreQuestCompleted('1', completedQuests);
      expect(result).toBe(true);
    });

    it('returns true when quest is completed with genre name match', () => {
      const completedQuests = [
        {
          type: '♥ Organize the Stacks',
          prompt: 'Fantasy: Some other description',
        },
      ];

      const result = GenreQuestDeckService.isGenreQuestCompleted('1', completedQuests);
      expect(result).toBe(true);
    });

    it('returns false when quest is not completed', () => {
      const completedQuests = [
        {
          type: '♥ Organize the Stacks',
          prompt: 'Mystery: Read a mystery book',
        },
      ];

      const result = GenreQuestDeckService.isGenreQuestCompleted('1', completedQuests);
      expect(result).toBe(false);
    });

    it('returns false when quest type does not match', () => {
      const completedQuests = [
        {
          type: '♠ Dungeon Crawl',
          prompt: 'Fantasy: Read a fantasy book',
        },
      ];

      const result = GenreQuestDeckService.isGenreQuestCompleted('1', completedQuests);
      expect(result).toBe(false);
    });

    it('returns false when quest key does not exist', () => {
      const completedQuests = [];
      const result = GenreQuestDeckService.isGenreQuestCompleted('999', completedQuests);
      expect(result).toBe(false);
    });
  });

  describe('isGenreQuestActive', () => {
    it('returns true when quest is active with exact prompt match', () => {
      const activeQuests = [
        {
          type: '♥ Organize the Stacks',
          prompt: 'Fantasy: Read a fantasy book',
        },
      ];

      const result = GenreQuestDeckService.isGenreQuestActive('1', activeQuests);
      expect(result).toBe(true);
    });

    it('returns true when quest is active with genre name match', () => {
      const activeQuests = [
        {
          type: '♥ Organize the Stacks',
          prompt: 'Fantasy: Some other description',
        },
      ];

      const result = GenreQuestDeckService.isGenreQuestActive('1', activeQuests);
      expect(result).toBe(true);
    });

    it('returns false when quest is not active', () => {
      const activeQuests = [
        {
          type: '♥ Organize the Stacks',
          prompt: 'Mystery: Read a mystery book',
        },
      ];

      const result = GenreQuestDeckService.isGenreQuestActive('1', activeQuests);
      expect(result).toBe(false);
    });

    it('returns false when quest type does not match', () => {
      const activeQuests = [
        {
          type: '♠ Dungeon Crawl',
          prompt: 'Fantasy: Read a fantasy book',
        },
      ];

      const result = GenreQuestDeckService.isGenreQuestActive('1', activeQuests);
      expect(result).toBe(false);
    });

    it('returns false when quest key does not exist', () => {
      const activeQuests = [];
      const result = GenreQuestDeckService.isGenreQuestActive('999', activeQuests);
      expect(result).toBe(false);
    });
  });

  describe('getAvailableGenreQuests', () => {
    const { STORAGE_KEYS } = require('../assets/js/character-sheet/storageKeys.js');

    it('returns empty array when no genres are selected', () => {
      const state = {
        [STORAGE_KEYS.SELECTED_GENRES]: [],
        [STORAGE_KEYS.COMPLETED_QUESTS]: [],
        [STORAGE_KEYS.ACTIVE_ASSIGNMENTS]: [],
      };

      const result = GenreQuestDeckService.getAvailableGenreQuests(state);
      expect(result).toEqual([]);
    });

    it('returns only quests for selected genres', () => {
      const state = {
        [STORAGE_KEYS.SELECTED_GENRES]: ['Fantasy'],
        [STORAGE_KEYS.COMPLETED_QUESTS]: [],
        [STORAGE_KEYS.ACTIVE_ASSIGNMENTS]: [],
      };

      const result = GenreQuestDeckService.getAvailableGenreQuests(state);
      expect(result).toHaveLength(2);
      expect(result.map(q => q.key)).toEqual(['1', '3']);
      expect(result.every(q => q.genre === 'Fantasy')).toBe(true);
    });

    it('excludes completed quests', () => {
      const state = {
        [STORAGE_KEYS.SELECTED_GENRES]: ['Fantasy', 'Mystery'],
        [STORAGE_KEYS.COMPLETED_QUESTS]: [
          {
            type: '♥ Organize the Stacks',
            prompt: 'Fantasy: Read a fantasy book',
          },
        ],
        [STORAGE_KEYS.ACTIVE_ASSIGNMENTS]: [],
      };

      const result = GenreQuestDeckService.getAvailableGenreQuests(state);
      // When a Fantasy quest is completed, all Fantasy quests are excluded (fallback matching by genre name)
      expect(result).toHaveLength(1);
      expect(result.map(q => q.key)).toEqual(['2']);
      expect(result.find(q => q.key === '1')).toBeUndefined();
      expect(result.find(q => q.key === '3')).toBeUndefined();
    });

    it('excludes active quests', () => {
      const state = {
        [STORAGE_KEYS.SELECTED_GENRES]: ['Fantasy', 'Mystery'],
        [STORAGE_KEYS.COMPLETED_QUESTS]: [],
        [STORAGE_KEYS.ACTIVE_ASSIGNMENTS]: [
          {
            type: '♥ Organize the Stacks',
            prompt: 'Fantasy: Read a fantasy book',
          },
        ],
      };

      const result = GenreQuestDeckService.getAvailableGenreQuests(state);
      // When a Fantasy quest is active, all Fantasy quests are excluded (fallback matching by genre name)
      expect(result).toHaveLength(1);
      expect(result.map(q => q.key)).toEqual(['2']);
      expect(result.find(q => q.key === '1')).toBeUndefined();
      expect(result.find(q => q.key === '3')).toBeUndefined();
    });

    it('excludes both completed and active quests', () => {
      const state = {
        [STORAGE_KEYS.SELECTED_GENRES]: ['Fantasy', 'Mystery'],
        [STORAGE_KEYS.COMPLETED_QUESTS]: [
          {
            type: '♥ Organize the Stacks',
            prompt: 'Fantasy: Read a fantasy book',
          },
        ],
        [STORAGE_KEYS.ACTIVE_ASSIGNMENTS]: [
          {
            type: '♥ Organize the Stacks',
            prompt: 'Mystery: Read a mystery book',
          },
        ],
      };

      const result = GenreQuestDeckService.getAvailableGenreQuests(state);
      // Fantasy quests excluded (completed), Mystery quests excluded (active)
      expect(result).toHaveLength(0);
    });

    it('returns empty array when genreQuests data is missing', () => {
      jest.isolateModules(() => {
        jest.doMock('../assets/js/character-sheet/data.js', () => ({}));
        const GenreQuestDeckService2 = require('../assets/js/services/GenreQuestDeckService.js');
        const { STORAGE_KEYS } = require('../assets/js/character-sheet/storageKeys.js');

        const state = {
          [STORAGE_KEYS.SELECTED_GENRES]: ['Fantasy'],
          [STORAGE_KEYS.COMPLETED_QUESTS]: [],
          [STORAGE_KEYS.ACTIVE_ASSIGNMENTS]: [],
        };

        const result = GenreQuestDeckService2.getAvailableGenreQuests(state);
        expect(result).toEqual([]);
      });
    });

    it('includes quest key and full quest data in result', () => {
      const state = {
        [STORAGE_KEYS.SELECTED_GENRES]: ['Fantasy'],
        [STORAGE_KEYS.COMPLETED_QUESTS]: [],
        [STORAGE_KEYS.ACTIVE_ASSIGNMENTS]: [],
      };

      const result = GenreQuestDeckService.getAvailableGenreQuests(state);
      expect(result[0]).toHaveProperty('key', '1');
      expect(result[0]).toHaveProperty('genre', 'Fantasy');
      expect(result[0]).toHaveProperty('description', 'Read a fantasy book');
    });
  });

  describe('drawRandomGenreQuest', () => {
    it('returns null when no quests are available', () => {
      const result = GenreQuestDeckService.drawRandomGenreQuest([]);
      expect(result).toBeNull();
    });

    it('returns null when quests array is null', () => {
      const result = GenreQuestDeckService.drawRandomGenreQuest(null);
      expect(result).toBeNull();
    });

    it('returns null when quests array is undefined', () => {
      const result = GenreQuestDeckService.drawRandomGenreQuest(undefined);
      expect(result).toBeNull();
    });

    it('returns a quest from available quests', () => {
      const availableQuests = [
        { key: '1', genre: 'Fantasy', description: 'Read a fantasy book' },
        { key: '2', genre: 'Mystery', description: 'Read a mystery book' },
      ];

      const result = GenreQuestDeckService.drawRandomGenreQuest(availableQuests);
      expect(result).toBeDefined();
      expect(['1', '2']).toContain(result.key);
      expect(['Fantasy', 'Mystery']).toContain(result.genre);
    });

    it('returns the only quest when one is available', () => {
      const availableQuests = [
        { key: '1', genre: 'Fantasy', description: 'Read a fantasy book' },
      ];

      const result = GenreQuestDeckService.drawRandomGenreQuest(availableQuests);
      expect(result).toEqual(availableQuests[0]);
    });
  });
});
