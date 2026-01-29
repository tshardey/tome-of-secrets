/**
 * @jest-environment jsdom
 */
describe('questArchiveCardsViewModel', () => {
  let questArchiveCardsViewModel;
  let mockData;
  let mockQuestCardImage;

  beforeEach(() => {
    jest.isolateModules(() => {
      mockData = {
        genreQuests: {
          '1': { genre: 'Fantasy', description: 'Read a fantasy book' },
          '2': { genre: 'Mystery', description: 'Read a mystery book' },
        },
        sideQuestsDetailed: {
          '1': { name: 'The Arcane Grimoire', description: 'A mysterious quest' },
          '2': { name: 'The Lost Tome', description: 'Find the lost tome' },
        },
      };

      mockQuestCardImage = {
        getGenreQuestCardImage: jest.fn((name) => `assets/images/genre-quests/${name?.toLowerCase() || 'default'}.png`),
        getSideQuestCardImage: jest.fn((name) => `assets/images/side-quests/${name?.toLowerCase() || 'default'}.png`),
      };

      jest.doMock('../assets/js/character-sheet/data.js', () => mockData);
      jest.doMock('../assets/js/utils/questCardImage.js', () => mockQuestCardImage);
      questArchiveCardsViewModel = require('../assets/js/viewModels/questArchiveCardsViewModel.js');
    });
  });

  describe('createGenreQuestArchiveCardsViewModel', () => {
    it('returns empty array when no genre quests are present', () => {
      const completedQuests = [
        { type: '♠ Dungeon Crawl', prompt: 'Some dungeon quest' },
        { type: '♣ Side Quest', prompt: 'Some side quest' },
      ];

      const result = questArchiveCardsViewModel.createGenreQuestArchiveCardsViewModel(completedQuests);
      expect(result).toEqual([]);
    });

    it('filters and creates view models for genre quests', () => {
      const completedQuests = [
        {
          type: '♥ Organize the Stacks',
          prompt: 'Fantasy: Read a fantasy book',
          book: 'Test Book',
        },
        {
          type: '♥ Organize the Stacks',
          prompt: 'Mystery: Read a mystery book',
        },
        { type: '♠ Dungeon Crawl', prompt: 'Some dungeon quest' },
      ];

      const result = questArchiveCardsViewModel.createGenreQuestArchiveCardsViewModel(completedQuests);
      expect(result).toHaveLength(2);

      const fantasyVm = result[0];
      expect(fantasyVm.quest).toEqual(completedQuests[0]);
      expect(fantasyVm.title).toBe('Fantasy');
      expect(fantasyVm.cardImage).toBe('assets/images/genre-quests/fantasy.png');
      expect(fantasyVm.questData).toEqual(mockData.genreQuests['1']);

      const mysteryVm = result[1];
      expect(mysteryVm.quest).toEqual(completedQuests[1]);
      expect(mysteryVm.title).toBe('Mystery');
      expect(mysteryVm.cardImage).toBe('assets/images/genre-quests/mystery.png');
      expect(mysteryVm.questData).toEqual(mockData.genreQuests['2']);
    });

    it('extracts genre name from prompt correctly', () => {
      const completedQuests = [
        {
          type: '♥ Organize the Stacks',
          prompt: 'Fantasy: Read a fantasy book',
        },
      ];

      const result = questArchiveCardsViewModel.createGenreQuestArchiveCardsViewModel(completedQuests);
      expect(result[0].title).toBe('Fantasy');
    });

    it('uses prompt as fallback title when genre name cannot be extracted', () => {
      const completedQuests = [
        {
          type: '♥ Organize the Stacks',
          prompt: 'No colon in prompt',
        },
      ];

      const result = questArchiveCardsViewModel.createGenreQuestArchiveCardsViewModel(completedQuests);
      expect(result[0].title).toBe('No colon in prompt');
    });

    it('uses default title when prompt is missing', () => {
      const completedQuests = [
        {
          type: '♥ Organize the Stacks',
        },
      ];

      const result = questArchiveCardsViewModel.createGenreQuestArchiveCardsViewModel(completedQuests);
      expect(result[0].title).toBe('Genre Quest');
    });

    it('finds matching genre quest data by genre name', () => {
      const completedQuests = [
        {
          type: '♥ Organize the Stacks',
          prompt: 'Fantasy: Read a fantasy book',
        },
      ];

      const result = questArchiveCardsViewModel.createGenreQuestArchiveCardsViewModel(completedQuests);
      expect(result[0].questData).toEqual(mockData.genreQuests['1']);
    });

    it('handles genre quests without matching data', () => {
      const completedQuests = [
        {
          type: '♥ Organize the Stacks',
          prompt: 'Unknown Genre: Some description',
        },
      ];

      const result = questArchiveCardsViewModel.createGenreQuestArchiveCardsViewModel(completedQuests);
      expect(result[0].questData).toBeNull();
      expect(result[0].title).toBe('Unknown Genre');
    });

    it('calls getGenreQuestCardImage with genre name', () => {
      const completedQuests = [
        {
          type: '♥ Organize the Stacks',
          prompt: 'Fantasy: Read a fantasy book',
        },
      ];

      questArchiveCardsViewModel.createGenreQuestArchiveCardsViewModel(completedQuests);
      expect(mockQuestCardImage.getGenreQuestCardImage).toHaveBeenCalledWith('Fantasy');
    });
  });

  describe('createSideQuestArchiveCardsViewModel', () => {
    it('returns empty array when no side quests are present', () => {
      const completedQuests = [
        { type: '♠ Dungeon Crawl', prompt: 'Some dungeon quest' },
        { type: '♥ Organize the Stacks', prompt: 'Some genre quest' },
      ];

      const result = questArchiveCardsViewModel.createSideQuestArchiveCardsViewModel(completedQuests);
      expect(result).toEqual([]);
    });

    it('filters and creates view models for side quests', () => {
      const completedQuests = [
        {
          type: '♣ Side Quest',
          prompt: 'The Arcane Grimoire: A mysterious quest',
          book: 'Test Book',
        },
        {
          type: '♣ Side Quest',
          prompt: 'The Lost Tome: Find the lost tome',
        },
        { type: '♠ Dungeon Crawl', prompt: 'Some dungeon quest' },
      ];

      const result = questArchiveCardsViewModel.createSideQuestArchiveCardsViewModel(completedQuests);
      expect(result).toHaveLength(2);

      const arcaneVm = result[0];
      expect(arcaneVm.quest).toEqual(completedQuests[0]);
      expect(arcaneVm.title).toBe('The Arcane Grimoire');
      expect(arcaneVm.cardImage).toBe('assets/images/side-quests/the arcane grimoire.png');
      expect(arcaneVm.questData).toEqual(mockData.sideQuestsDetailed['1']);

      const lostTomeVm = result[1];
      expect(lostTomeVm.quest).toEqual(completedQuests[1]);
      expect(lostTomeVm.title).toBe('The Lost Tome');
      expect(lostTomeVm.cardImage).toBe('assets/images/side-quests/the lost tome.png');
      expect(lostTomeVm.questData).toEqual(mockData.sideQuestsDetailed['2']);
    });

    it('extracts quest name from prompt correctly', () => {
      const completedQuests = [
        {
          type: '♣ Side Quest',
          prompt: 'The Arcane Grimoire: A mysterious quest',
        },
      ];

      const result = questArchiveCardsViewModel.createSideQuestArchiveCardsViewModel(completedQuests);
      expect(result[0].title).toBe('The Arcane Grimoire');
    });

    it('uses prompt as fallback title when quest name cannot be extracted', () => {
      const completedQuests = [
        {
          type: '♣ Side Quest',
          prompt: 'No colon in prompt',
        },
      ];

      const result = questArchiveCardsViewModel.createSideQuestArchiveCardsViewModel(completedQuests);
      expect(result[0].title).toBe('No colon in prompt');
    });

    it('uses default title when prompt is missing', () => {
      const completedQuests = [
        {
          type: '♣ Side Quest',
        },
      ];

      const result = questArchiveCardsViewModel.createSideQuestArchiveCardsViewModel(completedQuests);
      expect(result[0].title).toBe('Side Quest');
    });

    it('finds matching side quest data by quest name', () => {
      const completedQuests = [
        {
          type: '♣ Side Quest',
          prompt: 'The Arcane Grimoire: A mysterious quest',
        },
      ];

      const result = questArchiveCardsViewModel.createSideQuestArchiveCardsViewModel(completedQuests);
      expect(result[0].questData).toEqual(mockData.sideQuestsDetailed['1']);
    });

    it('handles side quests without matching data', () => {
      const completedQuests = [
        {
          type: '♣ Side Quest',
          prompt: 'Unknown Quest: Some description',
        },
      ];

      const result = questArchiveCardsViewModel.createSideQuestArchiveCardsViewModel(completedQuests);
      expect(result[0].questData).toBeNull();
      expect(result[0].title).toBe('Unknown Quest');
    });

    it('calls getSideQuestCardImage with quest name', () => {
      const completedQuests = [
        {
          type: '♣ Side Quest',
          prompt: 'The Arcane Grimoire: A mysterious quest',
        },
      ];

      questArchiveCardsViewModel.createSideQuestArchiveCardsViewModel(completedQuests);
      expect(mockQuestCardImage.getSideQuestCardImage).toHaveBeenCalledWith('The Arcane Grimoire');
    });
  });
});
