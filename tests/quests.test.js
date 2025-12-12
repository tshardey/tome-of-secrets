/**
 * @jest-environment jsdom
 */
import { initializeQuestsPage } from '../assets/js/quests.js';
import { STORAGE_KEYS } from '../assets/js/character-sheet/storageKeys.js';
import * as data from '../assets/js/character-sheet/data.js';

describe('Quests Page - Genre Selection', () => {
  beforeEach(() => {
    // Clear localStorage before each test
    localStorage.clear();
    
    // Set up the DOM with the required elements
    document.body.innerHTML = `
      <div class="genre-selection-container">
        <h3 id="genre-selection-title">📚 Choose Your Genres</h3>
        <p class="description">Select how many genres you want for your "Organize the Stacks" quests.</p>
        
        <div class="dice-selection-controls">
          <label for="genre-dice-selector"><strong>Number of Genres (Dice Type):</strong></label>
          <select id="genre-dice-selector">
            <option value="d4">d4 (4 genres)</option>
            <option value="d6" selected>d6 (6 genres)</option>
            <option value="d8">d8 (8 genres)</option>
            <option value="d10">d10 (10 genres)</option>
            <option value="d12">d12 (12 genres)</option>
            <option value="d20">d20 (all genres)</option>
          </select>
        </div>
        
        <div class="selected-genres-grid" id="selected-genres-display">
          <!-- Selected genres will be displayed here -->
        </div>
        
        <div class="genre-selection-controls">
          <label for="genre-selector"><strong>Add Genre:</strong></label>
          <select id="genre-selector">
            <option value="">-- Select a genre to add --</option>
          </select>
          <button type="button" id="add-genre-button">Add Genre</button>
        </div>
        
        <div class="genre-quests-preview">
          <h3 id="genre-quests-title">Your Custom Genre Quests (Roll a d6)</h3>
          <div id="custom-genre-quests-display">
            <!-- Custom genre quests will be displayed here -->
          </div>
        </div>
      </div>
    `;
    
    // Initialize the quests page functionality
    initializeQuestsPage();
  });

  describe('Genre Selection Interface', () => {
    it('should populate the genre selector dropdown with all available genres', () => {
      const genreSelector = document.getElementById('genre-selector');
      const options = Array.from(genreSelector.options).map(option => option.value);
      const expectedGenres = Object.keys(data.allGenres);

      // Should have the default empty option plus all available genres
      expect(options).toContain('');
      expectedGenres.forEach(genre => {
        expect(options).toContain(genre);
      });
      
      expect(options.length).toBe(expectedGenres.length + 1);
    });

    it('should include all new genres (Comics/Manga/Graphic Novels, History, Philosophy)', () => {
      const genreSelector = document.getElementById('genre-selector');
      const options = Array.from(genreSelector.options).map(option => option.value);
      
      expect(options).toContain('Comics/Manga/Graphic Novels');
      expect(options).toContain('History');
      expect(options).toContain('Philosophy');
    });

    it('should have renamed genres (Thriller/Mystery, Fiction, Comedy)', () => {
      const genreSelector = document.getElementById('genre-selector');
      const options = Array.from(genreSelector.options).map(option => option.value);
      
      expect(options).toContain('Thriller/Mystery');
      expect(options).toContain('Fiction');
      expect(options).toContain('Comedy');
      
      // Old names should not exist
      expect(options).not.toContain('Thriller');
      expect(options).not.toContain('Literary Fiction');
      expect(options).not.toContain('LitRPG');
    });

    it('should display placeholder text when no genres are selected', () => {
      const display = document.getElementById('selected-genres-display');
      const title = document.getElementById('genre-selection-title');
      
      expect(display.textContent).toContain('No genres selected yet');
      expect(title.textContent).toContain('(0/6)');
    });

    it('should enable the Add Genre button initially', () => {
      const addButton = document.getElementById('add-genre-button');
      expect(addButton.disabled).toBe(false);
    });

    it('should have dice selector with default value d6', () => {
      const diceSelector = document.getElementById('genre-dice-selector');
      expect(diceSelector).toBeTruthy();
      expect(diceSelector.value).toBe('d6');
    });
  });

  describe('Dice Selection', () => {
    it('should enforce d4 limit of 4 genres', () => {
      const diceSelector = document.getElementById('genre-dice-selector');
      const addButton = document.getElementById('add-genre-button');
      const genreSelector = document.getElementById('genre-selector');
      
      // Change to d4
      diceSelector.value = 'd4';
      diceSelector.dispatchEvent(new Event('change'));
      
      // Add 4 genres
      const genres = ['Fantasy', 'Sci-Fi', 'Romance', 'Horror'];
      genres.forEach(genre => {
        genreSelector.value = genre;
        addButton.click();
      });
      
      // Try to add a 5th genre - should be disabled
      expect(addButton.disabled).toBe(true);
      
      // Check localStorage has exactly 4
      const selectedGenres = JSON.parse(localStorage.getItem(STORAGE_KEYS.SELECTED_GENRES) || '[]');
      expect(selectedGenres.length).toBe(4);
    });

    it('should enforce d8 limit of 8 genres', () => {
      const diceSelector = document.getElementById('genre-dice-selector');
      const addButton = document.getElementById('add-genre-button');
      const genreSelector = document.getElementById('genre-selector');
      
      diceSelector.value = 'd8';
      diceSelector.dispatchEvent(new Event('change'));
      
      // Add 8 unique genres
      const genres = ['Fantasy', 'Sci-Fi', 'Romance', 'Horror', 'Comedy', 'Crime', 'Drama', 'Classic'];
      genres.forEach(genre => {
        genreSelector.value = genre;
        addButton.click();
      });
      
      // Should be disabled at 8
      expect(addButton.disabled).toBe(true);
    });

    it('should auto-select all genres when d20 is selected', () => {
      const diceSelector = document.getElementById('genre-dice-selector');
      const allGenres = Object.keys(data.allGenres);
      
      // Change to d20
      diceSelector.value = 'd20';
      diceSelector.dispatchEvent(new Event('change'));
      
      // Check immediately (synchronous operation)
      const selectedGenres = JSON.parse(localStorage.getItem(STORAGE_KEYS.SELECTED_GENRES) || '[]');
      expect(selectedGenres.length).toBe(allGenres.length);
      
      allGenres.forEach(genre => {
        expect(selectedGenres).toContain(genre);
      });
      
      // Add button should be disabled
      const addButton = document.getElementById('add-genre-button');
      expect(addButton.disabled).toBe(true);
      
      // Title should show all genres count
      const title = document.getElementById('genre-selection-title');
      expect(title.textContent).toContain(`${allGenres.length}/${allGenres.length}`);
    });

    it('should update title when dice selection changes', () => {
      const diceSelector = document.getElementById('genre-dice-selector');
      const title = document.getElementById('genre-selection-title');
      
      diceSelector.value = 'd4';
      diceSelector.dispatchEvent(new Event('change'));
      expect(title.textContent).toContain('(0/4)');
      
      diceSelector.value = 'd10';
      diceSelector.dispatchEvent(new Event('change'));
      expect(title.textContent).toContain('(0/10)');
    });

    it('should save dice selection to localStorage', () => {
      const diceSelector = document.getElementById('genre-dice-selector');
      
      diceSelector.value = 'd8';
      diceSelector.dispatchEvent(new Event('change'));
      
      const savedDice = JSON.parse(localStorage.getItem(STORAGE_KEYS.GENRE_DICE_SELECTION) || '"d6"');
      expect(savedDice).toBe('d8');
    });

    it('should load saved dice selection on initialization', () => {
      localStorage.setItem(STORAGE_KEYS.GENRE_DICE_SELECTION, JSON.stringify('d12'));
      
      // Re-initialize
      initializeQuestsPage();
      
      const diceSelector = document.getElementById('genre-dice-selector');
      expect(diceSelector.value).toBe('d12');
    });

    it('should trim genres when switching from higher to lower dice', () => {
      const diceSelector = document.getElementById('genre-dice-selector');
      const addButton = document.getElementById('add-genre-button');
      const genreSelector = document.getElementById('genre-selector');
      
      // Set to d10 and add 10 genres
      diceSelector.value = 'd10';
      diceSelector.dispatchEvent(new Event('change'));
      
      const genres = Object.keys(data.allGenres).slice(0, 10);
      genres.forEach(genre => {
        genreSelector.value = genre;
        addButton.click();
      });
      
      // Switch to d4 - should trim to 4
      diceSelector.value = 'd4';
      diceSelector.dispatchEvent(new Event('change'));
      
      const selectedGenres = JSON.parse(localStorage.getItem(STORAGE_KEYS.SELECTED_GENRES) || '[]');
      expect(selectedGenres.length).toBe(4);
    });

    it('should update quest table title with dice type', () => {
      const diceSelector = document.getElementById('genre-dice-selector');
      const title = document.getElementById('genre-quests-title');
      
      diceSelector.value = 'd8';
      diceSelector.dispatchEvent(new Event('change'));
      
      expect(title.textContent).toContain('D8');
    });
  });

  describe('Adding Genres', () => {
    it('should add a genre when selected and button is clicked', () => {
      const genreSelector = document.getElementById('genre-selector');
      const addButton = document.getElementById('add-genre-button');
      const display = document.getElementById('selected-genres-display');
      
      // Select a genre and click add
      genreSelector.value = 'Fantasy';
      addButton.click();
      
      // Check that the genre was added to localStorage
      const selectedGenres = JSON.parse(localStorage.getItem(STORAGE_KEYS.SELECTED_GENRES) || '[]');
      expect(selectedGenres).toContain('Fantasy');
      
      // Check that the display was updated
      expect(display.textContent).toContain('Fantasy');
    });

    it('should clear the selector after adding a genre', () => {
      const genreSelector = document.getElementById('genre-selector');
      const addButton = document.getElementById('add-genre-button');
      
      genreSelector.value = 'Fantasy';
      addButton.click();
      
      expect(genreSelector.value).toBe('');
    });

    it('should prevent adding duplicate genres', () => {
      const genreSelector = document.getElementById('genre-selector');
      const addButton = document.getElementById('add-genre-button');
      
      genreSelector.value = 'Fantasy';
      addButton.click();
      genreSelector.value = 'Fantasy';
      addButton.click();
      
      const selectedGenres = JSON.parse(localStorage.getItem(STORAGE_KEYS.SELECTED_GENRES) || '[]');
      expect(selectedGenres.filter(g => g === 'Fantasy').length).toBe(1);
    });

    it('should disable add button when limit is reached', () => {
      const diceSelector = document.getElementById('genre-dice-selector');
      const addButton = document.getElementById('add-genre-button');
      const genreSelector = document.getElementById('genre-selector');
      
      diceSelector.value = 'd4';
      diceSelector.dispatchEvent(new Event('change'));
      
      // Add 4 genres
      const genres = ['Fantasy', 'Sci-Fi', 'Romance', 'Horror'];
      genres.forEach(genre => {
        genreSelector.value = genre;
        addButton.click();
      });
      
      expect(addButton.disabled).toBe(true);
    });
  });

  describe('Custom Genre Quests Display', () => {
    it('should display placeholder text when no genres are selected', () => {
      const display = document.getElementById('custom-genre-quests-display');
      expect(display.textContent).toContain('Select genres above to see your custom quests');
    });

    it('should display genre quests table when genres are selected', () => {
      const genres = ['Fantasy', 'Sci-Fi'];
      localStorage.setItem(STORAGE_KEYS.SELECTED_GENRES, JSON.stringify(genres));
      
      initializeQuestsPage();
      
      const display = document.getElementById('custom-genre-quests-display');
      expect(display.innerHTML).toContain('<table');
      expect(display.textContent).toContain('Fantasy');
      expect(display.textContent).toContain('Sci-Fi');
    });
  });

  describe('Data Persistence', () => {
    it('should load previously selected genres from localStorage', () => {
      // Set up some genres in localStorage
      const genres = ['Fantasy', 'Sci-Fi', 'Romance'];
      localStorage.setItem(STORAGE_KEYS.SELECTED_GENRES, JSON.stringify(genres));
      
      // Re-initialize
      initializeQuestsPage();
      
      // Check that the genres are displayed
      const display = document.getElementById('selected-genres-display');
      expect(display.textContent).toContain('Fantasy');
      expect(display.textContent).toContain('Sci-Fi');
      expect(display.textContent).toContain('Romance');
    });

    it('should handle empty localStorage gracefully', () => {
      localStorage.clear();
      initializeQuestsPage();
      
      const display = document.getElementById('selected-genres-display');
      expect(display.textContent).toContain('No genres selected yet');
    });
  });
});
