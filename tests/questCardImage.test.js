/**
 * @jest-environment jsdom
 */
describe('questCardImage', () => {
  let questCardImage;
  let mockImageCdn;

  beforeEach(() => {
    jest.isolateModules(() => {
      mockImageCdn = {
        toCdnImageUrlIfConfigured: jest.fn((path) => path),
      };

      jest.doMock('../assets/js/utils/imageCdn.js', () => mockImageCdn);
      questCardImage = require('../assets/js/utils/questCardImage.js');
    });
  });

  describe('getAtmosphericBuffCardImage', () => {
    it('returns null for null input', () => {
      expect(questCardImage.getAtmosphericBuffCardImage(null)).toBeNull();
    });

    it('returns null for undefined input', () => {
      expect(questCardImage.getAtmosphericBuffCardImage(undefined)).toBeNull();
    });

    it('handles string input (buff name)', () => {
      const result = questCardImage.getAtmosphericBuffCardImage('The Candlelight Study');
      expect(result).toBe('assets/images/atmospheric-buffs/candlelight-study.png');
      expect(mockImageCdn.toCdnImageUrlIfConfigured).toHaveBeenCalledWith(
        'assets/images/atmospheric-buffs/candlelight-study.png'
      );
    });

    it('drops "The" prefix from buff name', () => {
      const result = questCardImage.getAtmosphericBuffCardImage('The Midnight Library');
      expect(result).toBe('assets/images/atmospheric-buffs/midnight-library.png');
    });

    it('handles buff name without "The" prefix', () => {
      const result = questCardImage.getAtmosphericBuffCardImage('Candlelight Study');
      expect(result).toBe('assets/images/atmospheric-buffs/candlelight-study.png');
    });

    it('handles object input with name property', () => {
      const result = questCardImage.getAtmosphericBuffCardImage({ name: 'The Candlelight Study' });
      expect(result).toBe('assets/images/atmospheric-buffs/candlelight-study.png');
    });

    it('handles object input with id property', () => {
      const result = questCardImage.getAtmosphericBuffCardImage({ id: 'The Candlelight Study' });
      expect(result).toBe('assets/images/atmospheric-buffs/candlelight-study.png');
    });

    it('returns null when object has no name or id', () => {
      expect(questCardImage.getAtmosphericBuffCardImage({})).toBeNull();
    });

    it('handles special characters and replaces / with -', () => {
      const result = questCardImage.getAtmosphericBuffCardImage('The Study/Reading Room');
      expect(result).toBe('assets/images/atmospheric-buffs/study-reading-room.png');
    });

    it('slugifies buff name correctly', () => {
      const result = questCardImage.getAtmosphericBuffCardImage('The Cozy Reading Nook!');
      expect(result).toBe('assets/images/atmospheric-buffs/cozy-reading-nook.png');
    });
  });

  describe('getGenreQuestCardImage', () => {
    it('returns null for null input', () => {
      expect(questCardImage.getGenreQuestCardImage(null)).toBeNull();
    });

    it('returns null for undefined input', () => {
      expect(questCardImage.getGenreQuestCardImage(undefined)).toBeNull();
    });

    it('handles string input (genre name)', () => {
      const result = questCardImage.getGenreQuestCardImage('Fantasy');
      expect(result).toBe('assets/images/genre-quests/fantasy.png');
      expect(mockImageCdn.toCdnImageUrlIfConfigured).toHaveBeenCalledWith(
        'assets/images/genre-quests/fantasy.png'
      );
    });

    it('keeps "The" prefix in genre name', () => {
      const result = questCardImage.getGenreQuestCardImage('The Arcane Grimoire');
      expect(result).toBe('assets/images/genre-quests/the-arcane-grimoire.png');
    });

    it('handles object input with genre property', () => {
      const result = questCardImage.getGenreQuestCardImage({ genre: 'Fantasy' });
      expect(result).toBe('assets/images/genre-quests/fantasy.png');
    });

    it('handles object input with name property', () => {
      const result = questCardImage.getGenreQuestCardImage({ name: 'Mystery' });
      expect(result).toBe('assets/images/genre-quests/mystery.png');
    });

    it('handles object input with id property', () => {
      const result = questCardImage.getGenreQuestCardImage({ id: 'Sci-Fi' });
      expect(result).toBe('assets/images/genre-quests/sci-fi.png');
    });

    it('returns null when object has no genre, name, or id', () => {
      expect(questCardImage.getGenreQuestCardImage({})).toBeNull();
    });

    it('handles special characters and replaces / with -', () => {
      const result = questCardImage.getGenreQuestCardImage('Fantasy/Sci-Fi');
      expect(result).toBe('assets/images/genre-quests/fantasy-sci-fi.png');
    });

    it('slugifies genre name correctly', () => {
      const result = questCardImage.getGenreQuestCardImage('The Arcane Grimoire!');
      expect(result).toBe('assets/images/genre-quests/the-arcane-grimoire.png');
    });
  });

  describe('getSideQuestCardImage', () => {
    it('returns null for null input', () => {
      expect(questCardImage.getSideQuestCardImage(null)).toBeNull();
    });

    it('returns null for undefined input', () => {
      expect(questCardImage.getSideQuestCardImage(undefined)).toBeNull();
    });

    it('handles string input (quest name)', () => {
      const result = questCardImage.getSideQuestCardImage('The Arcane Grimoire');
      expect(result).toBe('assets/images/side-quests/the-arcane-grimoire.png');
      expect(mockImageCdn.toCdnImageUrlIfConfigured).toHaveBeenCalledWith(
        'assets/images/side-quests/the-arcane-grimoire.png'
      );
    });

    it('keeps "The" prefix in quest name', () => {
      const result = questCardImage.getSideQuestCardImage('The Arcane Grimoire');
      expect(result).toBe('assets/images/side-quests/the-arcane-grimoire.png');
    });

    it('handles object input with name property', () => {
      const result = questCardImage.getSideQuestCardImage({ name: 'The Arcane Grimoire' });
      expect(result).toBe('assets/images/side-quests/the-arcane-grimoire.png');
    });

    it('handles object input with id property', () => {
      const result = questCardImage.getSideQuestCardImage({ id: 'The Arcane Grimoire' });
      expect(result).toBe('assets/images/side-quests/the-arcane-grimoire.png');
    });

    it('returns null when object has no name or id', () => {
      expect(questCardImage.getSideQuestCardImage({})).toBeNull();
    });

    it('handles special characters and replaces / with -', () => {
      const result = questCardImage.getSideQuestCardImage('The Study/Reading Room');
      expect(result).toBe('assets/images/side-quests/the-study-reading-room.png');
    });

    it('slugifies quest name correctly', () => {
      const result = questCardImage.getSideQuestCardImage('The Arcane Grimoire!');
      expect(result).toBe('assets/images/side-quests/the-arcane-grimoire.png');
    });
  });

  describe('getQuestCardbackImage', () => {
    it('returns cardback path for atmospheric-buffs', () => {
      const result = questCardImage.getQuestCardbackImage('atmospheric-buffs');
      expect(result).toBe('assets/images/atmospheric-buffs/tos-cardback-atmospheric-buffs.png');
      expect(mockImageCdn.toCdnImageUrlIfConfigured).toHaveBeenCalledWith(
        'assets/images/atmospheric-buffs/tos-cardback-atmospheric-buffs.png'
      );
    });

    it('returns cardback path for genre-quests', () => {
      const result = questCardImage.getQuestCardbackImage('genre-quests');
      expect(result).toBe('assets/images/genre-quests/tos-cardback-genre-quests.png');
    });

    it('returns cardback path for side-quests', () => {
      const result = questCardImage.getQuestCardbackImage('side-quests');
      expect(result).toBe('assets/images/side-quests/tos-cardback-side-quests.png');
    });
  });
});
