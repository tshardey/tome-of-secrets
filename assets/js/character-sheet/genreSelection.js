/**
 * Genre selection functionality.
 * Manages the genre quest dropdown and selected genres display.
 */

import { STATE_EVENTS } from './stateAdapter.js';

export function updateGenreQuestDropdown(stateAdapter, dataModule) {
    const genreQuestSelect = document.getElementById('genre-quest-select');
    if (!genreQuestSelect) return;

    genreQuestSelect.innerHTML = '<option value="">-- Select a Genre Quest --</option>';
    const selectedGenres = stateAdapter.getSelectedGenres();

    if (selectedGenres.length > 0) {
        selectedGenres.forEach((genre, index) => {
            const option = document.createElement('option');
            option.value = `${genre}: ${dataModule.allGenres[genre]}`;
            option.textContent = `${index + 1}: ${genre}`;
            genreQuestSelect.appendChild(option);
        });
    } else {
        for (const key in dataModule.genreQuests) {
            const option = document.createElement('option');
            option.value = `${dataModule.genreQuests[key].genre}: ${dataModule.genreQuests[key].description}`;
            option.textContent = `${key}: ${dataModule.genreQuests[key].genre}`;
            genreQuestSelect.appendChild(option);
        }
    }
}

export function displaySelectedGenres(stateAdapter) {
    const display = document.getElementById('selected-genres-display');
    if (!display) return;

    const selectedGenres = stateAdapter.getSelectedGenres();

    if (selectedGenres.length === 0) {
        display.innerHTML = '<p class="no-genres">No genres selected yet. Open the Quests tab and click "\u2665 View Genre Quests" to choose your genres.</p>';
        return;
    }

    let html = '<div class="selected-genres-list">';
    selectedGenres.forEach((genre, index) => {
        html += `
            <div class="selected-genre-item">
                <span class="genre-number">${index + 1}.</span>
                <span class="genre-name">${genre}</span>
            </div>
        `;
    });
    html += '</div>';
    display.innerHTML = html;
}

export function initializeGenreSelection(stateAdapter, dataModule) {
    stateAdapter.syncSelectedGenresFromStorage();

    const handleGenresChanged = () => {
        updateGenreQuestDropdown(stateAdapter, dataModule);
        displaySelectedGenres(stateAdapter);
    };

    handleGenresChanged();
    stateAdapter.on(STATE_EVENTS.SELECTED_GENRES_CHANGED, handleGenresChanged);
}
