/**
 * @jest-environment jsdom
 */
import { initializeQuestsPage } from '../assets/js/quests.js';
import * as data from '../assets/js/character-sheet/data.js';

describe('Quests Page - Genre Selection', () => {
  beforeEach(() => {
    // Clear localStorage before each test
    localStorage.clear();
    
    // Set up the DOM with the required elements
    document.body.innerHTML = `
      <div class="genre-selection-container">
        <h3>📚 Choose Your 6 Favorite Genres (0/6)</h3>
        <p class="description">Select your 6 favorite genres for your "Organize the Stacks" quests. You can change these anytime without affecting your existing quest tracker entries.</p>
        
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
          <h3>Your Custom Genre Quests</h3>
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
      
      // Should have the default empty option plus all 12 genres
      expect(options).toContain('');
      expect(options).toContain('Historical Fiction');
      expect(options).toContain('Fantasy');
      expect(options).toContain('Romantasy');
      expect(options).toContain('Sci-Fi');
      expect(options).toContain('Thriller');
      expect(options).toContain('Classic');
      expect(options).toContain('Literary Fiction');
      expect(options).toContain('Speculative Fiction');
      expect(options).toContain('Romance');
      expect(options).toContain('Memoirs/Biographies');
      expect(options).toContain('Non-Fiction');
      expect(options).toContain('Crime');
      
      // Should have exactly 13 options (1 empty + 12 genres)
      expect(options.length).toBe(13);
    });

    it('should display placeholder text when no genres are selected', () => {
      const display = document.getElementById('selected-genres-display');
      const summary = display.parentElement.querySelector('h3');
      
      expect(display.textContent).toContain('No genres selected yet');
      expect(summary.textContent).toContain('(0/6)');
    });

    it('should enable the Add Genre button initially', () => {
      const addButton = document.getElementById('add-genre-button');
      expect(addButton.disabled).toBe(false);
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
      const selectedGenres = JSON.parse(localStorage.getItem('selectedGenres') || '[]');
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
  });

  describe('Removing Genres', () => {
    beforeEach(() => {
      // Pre-populate with some genres
      const genres = ['Fantasy', 'Sci-Fi', 'Romance'];
      localStorage.setItem('selectedGenres', JSON.stringify(genres));
      
      // Re-initialize to load the pre-populated genres
      initializeQuestsPage();
    });

    it('should display pre-populated genres', () => {
      const display = document.getElementById('selected-genres-display');
      
      // Should display the pre-populated genres
      expect(display.textContent).toContain('Fantasy');
      expect(display.textContent).toContain('Sci-Fi');
      expect(display.textContent).toContain('Romance');
    });
  });

  describe('Custom Genre Quests Display', () => {
    it('should display placeholder text when no genres are selected', () => {
      const display = document.getElementById('custom-genre-quests-display');
      expect(display.textContent).toContain('Select genres above to see your custom quests');
    });
  });

  describe('Data Persistence', () => {
    it('should load previously selected genres from localStorage', () => {
      // Set up some genres in localStorage
      const genres = ['Fantasy', 'Sci-Fi', 'Romance'];
      localStorage.setItem('selectedGenres', JSON.stringify(genres));
      
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
