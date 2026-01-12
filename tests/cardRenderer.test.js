/**
 * @jest-environment jsdom
 */
describe('cardRenderer', () => {
  let cardRenderer;
  let mockDomHelpers;
  let mockSanitize;

  beforeEach(() => {
    jest.isolateModules(() => {
      mockDomHelpers = {
        createElement: jest.fn((tag, attrs) => {
          const element = document.createElement(tag);
          if (attrs) {
            Object.keys(attrs).forEach(key => {
              if (key === 'class') {
                element.className = attrs[key];
              } else {
                element.setAttribute(key, attrs[key]);
              }
            });
          }
          return element;
        }),
      };

      mockSanitize = {
        escapeHtml: jest.fn((str) => str?.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;') || ''),
      };

      jest.doMock('../assets/js/utils/domHelpers.js', () => mockDomHelpers);
      jest.doMock('../assets/js/utils/sanitize.js', () => mockSanitize);
      cardRenderer = require('../assets/js/character-sheet/cardRenderer.js');
    });
  });

  describe('renderAtmosphericBuffCard', () => {
    it('returns null for null input', () => {
      expect(cardRenderer.renderAtmosphericBuffCard(null)).toBeNull();
    });

    it('returns null for undefined input', () => {
      expect(cardRenderer.renderAtmosphericBuffCard(undefined)).toBeNull();
    });

    it('creates card with quest-card class', () => {
      const buffData = { name: 'Test Buff', cardImage: 'test.png' };
      const card = cardRenderer.renderAtmosphericBuffCard(buffData);
      
      expect(card).toBeTruthy();
      expect(card.className).toContain('quest-card');
      expect(card.className).toContain('card');
    });

    it('renders card image when provided', () => {
      const buffData = { name: 'Test Buff', cardImage: 'test.png' };
      const card = cardRenderer.renderAtmosphericBuffCard(buffData);
      
      const img = card.querySelector('img');
      expect(img).toBeTruthy();
      expect(img.src).toContain('test.png');
      expect(img.className).toBe('card-image');
      expect(img.alt).toBe('Test Buff');
    });

    it('renders buff name in title', () => {
      const buffData = { name: 'The Candlelight Study', cardImage: 'test.png' };
      const card = cardRenderer.renderAtmosphericBuffCard(buffData);
      
      const title = card.querySelector('h3.card-title');
      expect(title).toBeTruthy();
      expect(title.textContent).toBe('The Candlelight Study');
    });

    it('renders buff description when provided', () => {
      const buffData = {
        name: 'Test Buff',
        description: 'A test description',
        cardImage: 'test.png',
      };
      const card = cardRenderer.renderAtmosphericBuffCard(buffData);
      
      const desc = card.querySelector('p.card-description');
      expect(desc).toBeTruthy();
      expect(desc.textContent).toBe('A test description');
    });

    it('does not render description when missing', () => {
      const buffData = { name: 'Test Buff', cardImage: 'test.png' };
      const card = cardRenderer.renderAtmosphericBuffCard(buffData);
      
      const desc = card.querySelector('p.card-description');
      expect(desc).toBeFalsy();
    });

    it('handles missing card image gracefully', () => {
      const buffData = { name: 'Test Buff' };
      const card = cardRenderer.renderAtmosphericBuffCard(buffData);
      
      expect(card).toBeTruthy();
      const img = card.querySelector('img');
      expect(img).toBeFalsy();
    });
  });

  describe('renderGenreQuestCard', () => {
    it('returns null for null input', () => {
      expect(cardRenderer.renderGenreQuestCard(null)).toBeNull();
    });

    it('returns null for undefined input', () => {
      expect(cardRenderer.renderGenreQuestCard(undefined)).toBeNull();
    });

    it('creates card with quest-card class', () => {
      const questData = { genre: 'Fantasy', cardImage: 'test.png' };
      const card = cardRenderer.renderGenreQuestCard(questData);
      
      expect(card).toBeTruthy();
      expect(card.className).toContain('quest-card');
      expect(card.className).toContain('card');
    });

    it('renders card image when provided', () => {
      const questData = { genre: 'Fantasy', cardImage: 'test.png' };
      const card = cardRenderer.renderGenreQuestCard(questData);
      
      const img = card.querySelector('img');
      expect(img).toBeTruthy();
      expect(img.src).toContain('test.png');
      expect(img.className).toBe('card-image');
      expect(img.alt).toBe('Fantasy');
    });

    it('renders genre name in title', () => {
      const questData = { genre: 'Mystery', cardImage: 'test.png' };
      const card = cardRenderer.renderGenreQuestCard(questData);
      
      const title = card.querySelector('h3.card-title');
      expect(title).toBeTruthy();
      expect(title.textContent).toBe('Mystery');
    });

    it('renders genre description when provided', () => {
      const questData = {
        genre: 'Fantasy',
        description: 'Read a fantasy book',
        cardImage: 'test.png',
      };
      const card = cardRenderer.renderGenreQuestCard(questData);
      
      const desc = card.querySelector('p.card-description');
      expect(desc).toBeTruthy();
      expect(desc.textContent).toBe('Read a fantasy book');
    });

    it('does not render description when missing', () => {
      const questData = { genre: 'Fantasy', cardImage: 'test.png' };
      const card = cardRenderer.renderGenreQuestCard(questData);
      
      const desc = card.querySelector('p.card-description');
      expect(desc).toBeFalsy();
    });
  });

  describe('renderSideQuestCard', () => {
    it('returns null for null input', () => {
      expect(cardRenderer.renderSideQuestCard(null)).toBeNull();
    });

    it('returns null for undefined input', () => {
      expect(cardRenderer.renderSideQuestCard(undefined)).toBeNull();
    });

    it('creates card with quest-card class', () => {
      const questData = { name: 'Test Quest', cardImage: 'test.png' };
      const card = cardRenderer.renderSideQuestCard(questData);
      
      expect(card).toBeTruthy();
      expect(card.className).toContain('quest-card');
      expect(card.className).toContain('card');
    });

    it('renders card image when provided', () => {
      const questData = { name: 'Test Quest', cardImage: 'test.png' };
      const card = cardRenderer.renderSideQuestCard(questData);
      
      const img = card.querySelector('img');
      expect(img).toBeTruthy();
      expect(img.src).toContain('test.png');
      expect(img.className).toBe('card-image');
      expect(img.alt).toBe('Test Quest');
    });

    it('renders quest name in title', () => {
      const questData = { name: 'The Arcane Grimoire', cardImage: 'test.png' };
      const card = cardRenderer.renderSideQuestCard(questData);
      
      const title = card.querySelector('h3.card-title');
      expect(title).toBeTruthy();
      expect(title.textContent).toBe('The Arcane Grimoire');
    });

    it('renders quest description when provided', () => {
      const questData = {
        name: 'Test Quest',
        description: 'A test description',
        cardImage: 'test.png',
      };
      const card = cardRenderer.renderSideQuestCard(questData);
      
      const desc = card.querySelector('p.card-description');
      expect(desc).toBeTruthy();
      expect(desc.textContent).toBe('A test description');
    });

    it('renders quest prompt when provided', () => {
      const questData = {
        name: 'Test Quest',
        prompt: 'Read a book',
        cardImage: 'test.png',
      };
      const card = cardRenderer.renderSideQuestCard(questData);
      
      const prompt = card.querySelector('div.card-prompt');
      expect(prompt).toBeTruthy();
      expect(prompt.innerHTML).toContain('Read a book');
      expect(prompt.innerHTML).toContain('Prompt:');
    });

    it('does not render prompt when missing', () => {
      const questData = { name: 'Test Quest', cardImage: 'test.png' };
      const card = cardRenderer.renderSideQuestCard(questData);
      
      const prompt = card.querySelector('div.card-prompt');
      expect(prompt).toBeFalsy();
    });
  });

  describe('renderQuestArchiveCard', () => {
    it('creates card with dungeon-archive-card class', () => {
      const quest = { type: '♥ Organize the Stacks', prompt: 'Fantasy: Read' };
      const card = cardRenderer.renderQuestArchiveCard(quest, 0, 'test.png', 'Fantasy');
      
      expect(card).toBeTruthy();
      expect(card.className).toContain('dungeon-archive-card');
    });

    it('sets data attributes for click handler', () => {
      const quest = { type: '♥ Organize the Stacks', prompt: 'Fantasy: Read' };
      const card = cardRenderer.renderQuestArchiveCard(quest, 5, 'test.png', 'Fantasy');
      
      expect(card.dataset.questIndex).toBe('5');
      expect(card.dataset.list).toBe('completedQuests');
    });

    it('renders card image when provided', () => {
      const quest = { type: '♥ Organize the Stacks', prompt: 'Fantasy: Read' };
      const card = cardRenderer.renderQuestArchiveCard(quest, 0, 'test.png', 'Fantasy');
      
      const img = card.querySelector('img.archive-card-image');
      expect(img).toBeTruthy();
      expect(img.src).toContain('test.png');
      expect(img.alt).toBe('Fantasy');
    });

    it('renders book name overlay when quest has book property', () => {
      const quest = {
        type: '♥ Organize the Stacks',
        prompt: 'Fantasy: Read',
        book: 'Test Book',
      };
      const card = cardRenderer.renderQuestArchiveCard(quest, 0, 'test.png', 'Fantasy');
      
      const overlay = card.querySelector('.archive-card-book-overlay');
      expect(overlay).toBeTruthy();
      expect(overlay.textContent).toBe('Test Book');
    });

    it('does not render book overlay when book is missing', () => {
      const quest = { type: '♥ Organize the Stacks', prompt: 'Fantasy: Read' };
      const card = cardRenderer.renderQuestArchiveCard(quest, 0, 'test.png', 'Fantasy');
      
      const overlay = card.querySelector('.archive-card-book-overlay');
      expect(overlay).toBeFalsy();
    });

    it('renders title overlay', () => {
      const quest = { type: '♥ Organize the Stacks', prompt: 'Fantasy: Read' };
      const card = cardRenderer.renderQuestArchiveCard(quest, 0, 'test.png', 'Fantasy');
      
      const title = card.querySelector('.archive-card-title');
      expect(title).toBeTruthy();
      expect(title.textContent).toBe('Fantasy');
    });

    it('handles empty title gracefully', () => {
      const quest = { type: '♥ Organize the Stacks', prompt: 'Fantasy: Read' };
      const card = cardRenderer.renderQuestArchiveCard(quest, 0, 'test.png', '');
      
      const title = card.querySelector('.archive-card-title');
      expect(title).toBeTruthy();
      expect(title.textContent).toBe('');
    });
  });

  describe('renderDungeonArchiveCard with book overlay', () => {
    it('renders book name overlay when quest has book property', () => {
      const quest = {
        type: '♠ Dungeon Crawl',
        roomNumber: '1',
        book: 'Test Book',
      };
      const card = cardRenderer.renderDungeonArchiveCard(quest, 0, 'test.png', 'Room 1');
      
      const overlay = card.querySelector('.archive-card-book-overlay');
      expect(overlay).toBeTruthy();
      expect(overlay.textContent).toBe('Test Book');
    });

    it('does not render book overlay when book is missing', () => {
      const quest = {
        type: '♠ Dungeon Crawl',
        roomNumber: '1',
      };
      const card = cardRenderer.renderDungeonArchiveCard(quest, 0, 'test.png', 'Room 1');
      
      const overlay = card.querySelector('.archive-card-book-overlay');
      expect(overlay).toBeFalsy();
    });
  });
});
