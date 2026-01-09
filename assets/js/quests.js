import * as data from './character-sheet/data.js';
import { STORAGE_KEYS } from './character-sheet/storageKeys.js';
import { safeGetJSON, safeSetJSON } from './utils/storage.js';
import { parseIntOr } from './utils/helpers.js';
import { toast } from './ui/toast.js';

// Map dice types to their max values
const DICE_LIMITS = {
    'd4': 4,
    'd6': 6,
    'd8': 8,
    'd10': 10,
    'd12': 12,
    'd20': 20
};

// Get the maximum number of genres for a dice type
function getMaxGenres(diceType) {
    return DICE_LIMITS[diceType] || 6;
}

// Get all available genres as an array
function getAllGenres() {
    return Object.keys(data.allGenres);
}

export function initializeQuestsPage() {
    // Check if we're on the quests page
    const genreSelector = document.getElementById('genre-selector');
    const addGenreButton = document.getElementById('add-genre-button');
    
    if (!genreSelector || !addGenreButton) {
        return; // Not on the quests page
    }

    // Initialize genre selection
    initializeGenreSelection();
    renderCustomGenreQuests();
    
    // Set up event listeners
    setupEventListeners();
}

function initializeGenreSelection() {
    const genreSelector = document.getElementById('genre-selector');
    const addGenreButton = document.getElementById('add-genre-button');
    const diceSelector = document.getElementById('genre-dice-selector');
    
    if (!genreSelector || !addGenreButton) return;
    
    // Populate genre selector dropdown
    genreSelector.innerHTML = '<option value="">-- Select a genre to add --</option>';
    for (const genre in data.allGenres) {
        const option = document.createElement('option');
        option.value = genre;
        option.textContent = genre;
        genreSelector.appendChild(option);
    }
    
    // Load saved dice selection (default to d6)
    const savedDiceSelection = safeGetJSON(STORAGE_KEYS.GENRE_DICE_SELECTION, 'd6');
    
    // Set dice selector value
    if (diceSelector) {
        diceSelector.value = savedDiceSelection;
    }
    
    // Load saved genre selection
    const selectedGenres = safeGetJSON(STORAGE_KEYS.SELECTED_GENRES, []);
    const maxGenres = getMaxGenres(savedDiceSelection);
    
    // If d20 is selected, auto-select all genres
    if (savedDiceSelection === 'd20') {
        const allGenres = getAllGenres();
        const allSelected = allGenres.every(genre => selectedGenres.includes(genre));
        if (!allSelected) {
            // Select all genres that aren't already selected
            const genresToAdd = allGenres.filter(genre => !selectedGenres.includes(genre));
            selectedGenres.push(...genresToAdd);
            safeSetJSON(STORAGE_KEYS.SELECTED_GENRES, selectedGenres);
        }
    }
    
    renderSelectedGenres(selectedGenres, savedDiceSelection);
    updateGenreQuestDropdown(selectedGenres);
    updateGenreSelectorDropdown(selectedGenres);
}

function renderSelectedGenres(selectedGenres, diceType = 'd6') {
    const display = document.getElementById('selected-genres-display');
    const summary = document.getElementById('genre-selection-title');
    const maxGenres = getMaxGenres(diceType);
    
    if (!display) return;
    
    display.innerHTML = '';
    
    // Update title
    if (summary) {
        if (diceType === 'd20') {
            summary.textContent = `📚 Choose Your Genres (${selectedGenres.length}/${getAllGenres().length})`;
        } else {
            summary.textContent = `📚 Choose Your Genres (${selectedGenres.length}/${maxGenres})`;
        }
    }
    
    if (selectedGenres.length === 0) {
        display.innerHTML = `<p class="no-genres">No genres selected yet. Choose ${diceType === 'd20' ? 'all' : maxGenres} ${maxGenres === 1 ? 'genre' : 'genres'} to customize your quests.</p>`;
        return;
    }
    
    selectedGenres.forEach((genre, index) => {
        const genreDiv = document.createElement('div');
        genreDiv.className = 'selected-genre-item';
        genreDiv.innerHTML = `
            <span class="genre-name">${genre}</span>
            <button type="button" class="remove-genre-btn" data-index="${index}">×</button>
        `;
        display.appendChild(genreDiv);
    });
    
    // Update add button state
    const addGenreButton = document.getElementById('add-genre-button');
    if (addGenreButton) {
        const isAtMax = diceType === 'd20' 
            ? selectedGenres.length >= getAllGenres().length
            : selectedGenres.length >= maxGenres;
        addGenreButton.disabled = isAtMax;
    }
}

function updateGenreQuestDropdown(selectedGenres) {
    // This function is for the character sheet, but we need to update the table
    // renderCustomGenreQuests(selectedGenres);
}

// Update the genre selector dropdown to disable already selected genres
function updateGenreSelectorDropdown(selectedGenres = null) {
    const genreSelector = document.getElementById('genre-selector');
    if (!genreSelector) return;
    
    if (selectedGenres === null) {
        selectedGenres = safeGetJSON(STORAGE_KEYS.SELECTED_GENRES, []);
    }
    
    // Update all options to enable/disable based on selection
    const options = genreSelector.querySelectorAll('option');
    options.forEach(option => {
        if (option.value === '') {
            // Keep the placeholder option enabled
            option.disabled = false;
        } else {
            // Disable if already selected, enable if not
            option.disabled = selectedGenres.includes(option.value);
        }
    });
}

function renderCustomGenreQuests(selectedGenres = null, diceType = null) {
    const display = document.getElementById('custom-genre-quests-display');
    const title = document.getElementById('genre-quests-title');
    
    if (!display) return;
    
    if (!selectedGenres) {
        selectedGenres = safeGetJSON(STORAGE_KEYS.SELECTED_GENRES, []);
    }
    
    if (!diceType) {
        diceType = safeGetJSON(STORAGE_KEYS.GENRE_DICE_SELECTION, 'd6');
    }
    
    // Update title with dice type
    if (title) {
        title.textContent = `Your Custom Genre Quests (Roll a ${diceType.toUpperCase()})`;
    }
    
    if (selectedGenres.length === 0) {
        display.innerHTML = '<p class="no-quests">Select genres above to see your custom quests.</p>';
        return;
    }
    
    let html = `<table class="custom-quests-table"><thead><tr><th>Roll</th><th>Genre Quest</th></tr></thead><tbody>`;
    
    selectedGenres.forEach((genre, index) => {
        html += `
            <tr>
                <td><strong>${index + 1}</strong></td>
                <td><strong>${genre}:</strong> ${data.allGenres[genre]}</td>
            </tr>
        `;
    });
    
    html += '</tbody></table>';
    display.innerHTML = html;
}

// Event listeners - set up immediately when module loads
function setupEventListeners() {
    const addGenreButton = document.getElementById('add-genre-button');
    const genreSelector = document.getElementById('genre-selector');
    const diceSelector = document.getElementById('genre-dice-selector');
    
    // Handle dice selection change
    if (diceSelector) {
        diceSelector.addEventListener('change', () => {
            const newDiceType = diceSelector.value;
            const selectedGenres = safeGetJSON(STORAGE_KEYS.SELECTED_GENRES, []);
            const maxGenres = getMaxGenres(newDiceType);
            
            // Save dice selection
            safeSetJSON(STORAGE_KEYS.GENRE_DICE_SELECTION, newDiceType);
            
            // If d20 is selected, auto-select all genres
            if (newDiceType === 'd20') {
                const allGenres = getAllGenres();
                const genresToAdd = allGenres.filter(genre => !selectedGenres.includes(genre));
                selectedGenres.push(...genresToAdd);
                safeSetJSON(STORAGE_KEYS.SELECTED_GENRES, selectedGenres);
            } else {
                // If switching from d20 or reducing limit, trim to new max
                if (selectedGenres.length > maxGenres) {
                    selectedGenres.splice(maxGenres);
                    safeSetJSON(STORAGE_KEYS.SELECTED_GENRES, selectedGenres);
                }
            }
            
            renderSelectedGenres(selectedGenres, newDiceType);
            updateGenreQuestDropdown(selectedGenres);
            updateGenreSelectorDropdown(selectedGenres);
            renderCustomGenreQuests(selectedGenres, newDiceType);
        });
    }
    
    if (addGenreButton && genreSelector) {
        addGenreButton.addEventListener('click', () => {
            const selectedGenre = genreSelector.value;
            if (!selectedGenre) return;
            
            const diceType = safeGetJSON(STORAGE_KEYS.GENRE_DICE_SELECTION, 'd6');
            const maxGenres = getMaxGenres(diceType);
            const selectedGenres = safeGetJSON(STORAGE_KEYS.SELECTED_GENRES, []);
            
            // Check if at max (special handling for d20)
            const isAtMax = diceType === 'd20' 
                ? selectedGenres.length >= getAllGenres().length
                : selectedGenres.length >= maxGenres;
            
            if (isAtMax) {
                toast.warning(`You can only select ${diceType === 'd20' ? 'all' : maxGenres} ${maxGenres === 1 ? 'genre' : 'genres'} maximum.`);
                return;
            }
            
            if (selectedGenres.includes(selectedGenre)) {
                toast.warning('This genre is already selected.');
                return;
            }
            
            selectedGenres.push(selectedGenre);
            safeSetJSON(STORAGE_KEYS.SELECTED_GENRES, selectedGenres);
            
            renderSelectedGenres(selectedGenres, diceType);
            updateGenreQuestDropdown(selectedGenres);
            updateGenreSelectorDropdown(selectedGenres);
            renderCustomGenreQuests(selectedGenres, diceType);
            
            // Clear the selector
            genreSelector.value = '';
        });
    }
    
    // Handle remove genre button clicks
    document.addEventListener('click', (e) => {
        if (e.target.classList.contains('remove-genre-btn')) {
            const diceType = safeGetJSON(STORAGE_KEYS.GENRE_DICE_SELECTION, 'd6');
            const index = parseIntOr(e.target.dataset.index, 0);
            const selectedGenres = safeGetJSON(STORAGE_KEYS.SELECTED_GENRES, []);
            
            // Don't allow removal if d20 is selected and we're at all genres
            if (diceType === 'd20' && selectedGenres.length === getAllGenres().length) {
                // When d20 is selected, removing one genre should allow re-adding it
                // but we need to prevent going below all genres
                // Actually, let's allow removal but re-add when dice selector changes
            }
            
            selectedGenres.splice(index, 1);
            safeSetJSON(STORAGE_KEYS.SELECTED_GENRES, selectedGenres);
            
            renderSelectedGenres(selectedGenres, diceType);
            updateGenreQuestDropdown(selectedGenres);
            updateGenreSelectorDropdown(selectedGenres);
            renderCustomGenreQuests(selectedGenres, diceType);
        }
    });
}
