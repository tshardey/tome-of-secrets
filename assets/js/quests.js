import * as data from './character-sheet/data.js';
import { STORAGE_KEYS } from './character-sheet/storageKeys.js';

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
    
    if (!genreSelector || !addGenreButton) return;
    
    // Populate genre selector dropdown
    genreSelector.innerHTML = '<option value="">-- Select a genre to add --</option>';
    for (const genre in data.allGenres) {
        const option = document.createElement('option');
        option.value = genre;
        option.textContent = genre;
        genreSelector.appendChild(option);
    }
    
    // Load saved genre selection
    let selectedGenres = [];
    try {
        selectedGenres = JSON.parse(localStorage.getItem(STORAGE_KEYS.SELECTED_GENRES) || '[]');
    } catch (e) {
        selectedGenres = [];
    }
    
    renderSelectedGenres(selectedGenres);
    updateGenreQuestDropdown(selectedGenres);
}

function renderSelectedGenres(selectedGenres) {
    const display = document.getElementById('selected-genres-display');
    const summary = display.parentElement ? display.parentElement.querySelector('h3') : document.querySelector('h3');
    
    if (!display) return;
    
    display.innerHTML = '';
    
    if (selectedGenres.length === 0) {
        display.innerHTML = '<p class="no-genres">No genres selected yet. Choose 6 genres to customize your quests.</p>';
        if (summary) {
            summary.textContent = '📚 Choose Your 6 Favorite Genres (0/6)';
        }
        return;
    }
    
    if (summary) {
        summary.textContent = `📚 Choose Your 6 Favorite Genres (${selectedGenres.length}/6)`;
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
        addGenreButton.disabled = selectedGenres.length >= 6;
    }
}

function updateGenreQuestDropdown(selectedGenres) {
    // This function is for the character sheet, but we need to update the table
    // renderCustomGenreQuests(selectedGenres);
}

function renderCustomGenreQuests(selectedGenres = null) {
    const display = document.getElementById('custom-genre-quests-display');
    if (!display) return;
    
    if (!selectedGenres) {
        try {
            selectedGenres = JSON.parse(localStorage.getItem(STORAGE_KEYS.SELECTED_GENRES) || '[]');
        } catch (e) {
            selectedGenres = [];
        }
    }
    
    if (selectedGenres.length === 0) {
        display.innerHTML = '<p class="no-quests">Select genres above to see your custom quests.</p>';
        return;
    }
    
    let html = '<table class="custom-quests-table"><thead><tr><th>Roll</th><th>Genre Quest</th></tr></thead><tbody>';
    
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
    
    if (addGenreButton && genreSelector) {
        addGenreButton.addEventListener('click', () => {
            const selectedGenre = genreSelector.value;
            if (!selectedGenre) return;
            
            let selectedGenres = [];
            try {
                selectedGenres = JSON.parse(localStorage.getItem(STORAGE_KEYS.SELECTED_GENRES) || '[]');
            } catch (e) {
                selectedGenres = [];
            }
            
            if (selectedGenres.length >= 6) {
                alert('You can only select 6 genres maximum.');
                return;
            }
            
            if (selectedGenres.includes(selectedGenre)) {
                alert('This genre is already selected.');
                return;
            }
            
            selectedGenres.push(selectedGenre);
            localStorage.setItem(STORAGE_KEYS.SELECTED_GENRES, JSON.stringify(selectedGenres));
            
            renderSelectedGenres(selectedGenres);
            updateGenreQuestDropdown(selectedGenres);
            renderCustomGenreQuests(selectedGenres);
            
            // Clear the selector
            genreSelector.value = '';
        });
    }
    
    // Handle remove genre button clicks
    document.addEventListener('click', (e) => {
        if (e.target.classList.contains('remove-genre-btn')) {
            const index = parseInt(e.target.dataset.index, 10);
            let selectedGenres = [];
            try {
            selectedGenres = JSON.parse(localStorage.getItem(STORAGE_KEYS.SELECTED_GENRES) || '[]');
            } catch (e) {
                selectedGenres = [];
            }
            selectedGenres.splice(index, 1);
            localStorage.setItem(STORAGE_KEYS.SELECTED_GENRES, JSON.stringify(selectedGenres));
            
            renderSelectedGenres(selectedGenres);
            updateGenreQuestDropdown(selectedGenres);
            renderCustomGenreQuests(selectedGenres);
        }
    });
}
