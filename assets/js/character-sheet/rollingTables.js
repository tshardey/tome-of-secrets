/**
 * Rolling tables overlay initialization.
 * Manages the table overlay panel for genre quests, atmospheric buffs, side quests, and dungeon rooms.
 */

import { DrawerManager } from '../ui/DrawerManager.js';

export async function initializeRollingTables() {
    // Import table renderer functions
    const tableRenderer = await import('../table-renderer.js');
    const { renderGenreQuestsTable, renderAtmosphericBuffsTable, renderSideQuestsTable, renderDungeonRoomsTable } = tableRenderer;

    // Import state adapter for genre selection
    const { StateAdapter } = await import('./stateAdapter.js');
    const { characterState } = await import('./state.js');
    const stateAdapter = new StateAdapter(characterState);

    // Import data module for allGenres
    const dataModule = await import('./data.js');
    const allGenres = dataModule.allGenres;

    // Helper function to process links (similar to processLinks in table-renderer)
    function processLinks(html) {
        const metaBase = document.querySelector('meta[name="baseurl"]');
        const baseurl = metaBase ? metaBase.content : '';
        return html.replace(/\{\{\s*site\.baseurl\s*\}\}/g, baseurl);
    }

    // Get overlay elements
    const overlayBackdrop = document.getElementById('table-overlay-backdrop');
    const overlayPanel = document.getElementById('table-overlay-panel');
    const overlayContent = document.getElementById('table-overlay-content');
    const closeButton = document.getElementById('close-table-overlay');

    if (!overlayPanel || !overlayContent) return;

    let pendingTableId = null;

    const tableOverlayManager = new DrawerManager({
        'table-overlay': {
            backdrop: 'table-overlay-backdrop',
            drawer: 'table-overlay-panel',
            closeBtn: 'close-table-overlay',
            displayStyle: 'block',
            onBeforeOpen: (drawerEl) => {
                const tableId = pendingTableId;
                if (!tableId) return;

                let tableHtml = '';
                let title = tableTitles[tableId] || 'Rolling Table';
                let showGenreSelection = false;

                switch (tableId) {
                    case 'genre-quests':
                        tableHtml = processLinks(renderSelectedGenresTable());
                        showGenreSelection = true;
                        break;
                    case 'atmospheric-buffs':
                        tableHtml = processLinks(renderAtmosphericBuffsTable());
                        break;
                    case 'side-quests':
                        tableHtml = processLinks(renderSideQuestsTable());
                        break;
                    case 'dungeon-rooms':
                        tableHtml = processLinks(renderDungeonRoomsTable());
                        break;
                    default:
                        return;
                }

                let contentHtml = `
                <div class="table-overlay-header">
                    <h2>${title}</h2>
                </div>
                <div class="table-overlay-body">
                    ${tableHtml}
                </div>
            `;

                if (showGenreSelection) {
                    contentHtml += renderGenreSelectionUI();
                }

                overlayContent.innerHTML = contentHtml;

                if (showGenreSelection) {
                    setupGenreSelectionListeners();
                }
            }
        }
    });

    // Table titles mapping
    const tableTitles = {
        'genre-quests': 'Genre Quests Table',
        'atmospheric-buffs': 'Atmospheric Buffs Table',
        'side-quests': 'Side Quests Table (d8)',
        'dungeon-rooms': 'Dungeon Rooms Table (d12)'
    };

    // Import storage utilities
    const { safeGetJSON, safeSetJSON } = await import('../utils/storage.js');
    const { STORAGE_KEYS } = await import('./storageKeys.js');

    // Function to render selected genres table
    function renderSelectedGenresTable() {
        const selectedGenres = stateAdapter.getSelectedGenres();

        if (selectedGenres.length === 0) {
            return '<p class="no-genres-message">No genres selected. Use the genre selection controls below to add genres.</p>';
        }

        let html = `<table>
  <thead>
    <tr>
      <th>Roll</th>
      <th>Quest Description</th>
    </tr>
  </thead>
  <tbody>`;

        selectedGenres.forEach((genre, index) => {
            html += `
    <tr>
      <td><strong>${index + 1}</strong></td>
      <td><strong>${genre}:</strong> ${allGenres[genre] || 'No description'}</td>
    </tr>`;
        });

        html += `
  </tbody>
</table>`;

        return html;
    }

    // Function to render genre selection UI
    function renderGenreSelectionUI() {
        const selectedGenres = stateAdapter.getSelectedGenres();
        const allGenreKeys = Object.keys(allGenres);
        const availableGenres = allGenreKeys.filter(g => !selectedGenres.includes(g));

        let html = `
            <div class="genre-selection-overlay-section">
                <h3>📚 Choose Your Genres</h3>
                <p class="description">Select as many genres as you like for your "Organize the Stacks" quests. Use <strong>Select All</strong> to add every genre, or pick individually.</p>

                <div class="selected-genres-display-overlay" style="margin-bottom: 15px; min-height: 50px; padding: 10px; background: rgba(84, 72, 59, 0.2); border-radius: 4px;">
                    <strong>Selected Genres (${selectedGenres.length}${allGenreKeys.length ? ` of ${allGenreKeys.length}` : ''}):</strong>
                    <div style="display: flex; flex-wrap: wrap; gap: 8px; margin-top: 8px;">
                        ${selectedGenres.length === 0
                            ? '<span style="color: #999; font-style: italic;">No genres selected yet.</span>'
                            : selectedGenres.map((genre, idx) => `
                                <span class="selected-genre-tag" style="display: inline-flex; align-items: center; gap: 5px; padding: 5px 10px; background: rgba(184, 159, 98, 0.3); border: 1px solid #b89f62; border-radius: 4px;">
                                    ${genre}
                                    <button type="button" class="remove-genre-overlay-btn" data-index="${idx}" style="background: none; border: none; color: #b89f62; cursor: pointer; font-size: 1.2em; padding: 0; width: 20px; height: 20px; line-height: 1;">×</button>
                                </span>
                            `).join('')
                        }
                    </div>
                </div>

                <div class="genre-selection-controls-overlay" style="margin-bottom: 15px;">
                    <label for="overlay-genre-selector"><strong>Add Genre:</strong></label>
                    <select id="overlay-genre-selector" style="padding: 5px; margin: 0 10px;">
                        <option value="">-- Select a genre to add --</option>
                        ${availableGenres.map(genre => `<option value="${genre}">${genre}</option>`).join('')}
                    </select>
                    <button type="button" id="overlay-add-genre-button" ${availableGenres.length === 0 ? 'disabled' : ''} style="padding: 5px 15px; background: rgba(184, 159, 98, 0.3); border: 1px solid #b89f62; color: #b89f62; border-radius: 4px; cursor: pointer;">Add Genre</button>
                    <button type="button" id="overlay-select-all-genres-button" ${availableGenres.length === 0 ? 'disabled' : ''} style="padding: 5px 15px; margin-left: 8px; background: rgba(184, 159, 98, 0.3); border: 1px solid #b89f62; color: #b89f62; border-radius: 4px; cursor: pointer;">Select All</button>
                </div>
            </div>
        `;

        return html;
    }

    // Function to open overlay with a specific table
    function openTableOverlay(tableId) {
        pendingTableId = tableId;
        tableOverlayManager.open('table-overlay');
    }

    // Track if we're currently processing a removal to prevent double-firing
    // This needs to be outside the function so it persists across calls
    let isRemovingGenre = false;

    // Function to setup genre selection event listeners
    function setupGenreSelectionListeners() {
        const genreSelector = document.getElementById('overlay-genre-selector');
        const addButton = document.getElementById('overlay-add-genre-button');
        const selectAllButton = document.getElementById('overlay-select-all-genres-button');

        const allGenreKeys = Object.keys(allGenres);

        function updateGenreSelectionUI() {
            const selectedGenres = stateAdapter.getSelectedGenres();
            const availableGenres = allGenreKeys.filter(g => !selectedGenres.includes(g));

            // Update selected genres display
            const displayDiv = document.querySelector('.selected-genres-display-overlay');
            if (displayDiv) {
                displayDiv.innerHTML = `
                    <strong>Selected Genres (${selectedGenres.length}${allGenreKeys.length ? ` of ${allGenreKeys.length}` : ''}):</strong>
                    <div style="display: flex; flex-wrap: wrap; gap: 8px; margin-top: 8px;">
                        ${selectedGenres.length === 0
                            ? '<span style="color: #999; font-style: italic;">No genres selected yet.</span>'
                            : selectedGenres.map((genre, idx) => `
                                <span class="selected-genre-tag" style="display: inline-flex; align-items: center; gap: 5px; padding: 5px 10px; background: rgba(184, 159, 98, 0.3); border: 1px solid #b89f62; border-radius: 4px;">
                                    ${genre}
                                    <button type="button" class="remove-genre-overlay-btn" data-index="${idx}" style="background: none; border: none; color: #b89f62; cursor: pointer; font-size: 1.2em; padding: 0; width: 20px; height: 20px; line-height: 1;">×</button>
                                </span>
                            `).join('')
                        }
                    </div>
                `;
            }

            // Update genre selector dropdown
            if (genreSelector) {
                genreSelector.innerHTML = '<option value="">-- Select a genre to add --</option>';
                availableGenres.forEach(genre => {
                    const option = document.createElement('option');
                    option.value = genre;
                    option.textContent = genre;
                    genreSelector.appendChild(option);
                });
            }

            const allSelected = availableGenres.length === 0;
            if (addButton) addButton.disabled = allSelected;
            if (selectAllButton) selectAllButton.disabled = allSelected;
        }

        // Remove previous listeners if they exist
        if (addButton && addButton._addButtonHandler) {
            addButton.removeEventListener('click', addButton._addButtonHandler);
        }
        if (selectAllButton && selectAllButton._selectAllHandler) {
            selectAllButton.removeEventListener('click', selectAllButton._selectAllHandler);
        }
        if (genreSelector && genreSelector._genreSelectorChangeHandler) {
            genreSelector.removeEventListener('change', genreSelector._genreSelectorChangeHandler);
        }

        // Select All button
        if (selectAllButton) {
            selectAllButton._selectAllHandler = () => {
                stateAdapter.setSelectedGenres([...allGenreKeys]);
                updateGenreSelectionUI();
                const tableHtml = processLinks(renderSelectedGenresTable());
                const tableBody = document.querySelector('.table-overlay-body');
                if (tableBody) tableBody.innerHTML = tableHtml;
            };
            selectAllButton.addEventListener('click', selectAllButton._selectAllHandler);
        }

        // Add genre button
        if (addButton && genreSelector) {
            addButton._addButtonHandler = async () => {
                const selectedGenre = genreSelector.value;
                if (!selectedGenre) return;

                const selectedGenres = stateAdapter.getSelectedGenres();
                if (selectedGenres.includes(selectedGenre)) {
                    const { toast } = await import('../ui/toast.js');
                    toast.warning('This genre is already selected.');
                    return;
                }

                selectedGenres.push(selectedGenre);
                stateAdapter.setSelectedGenres(selectedGenres);
                genreSelector.value = '';
                updateGenreSelectionUI();
                const tableHtml = processLinks(renderSelectedGenresTable());
                const tableBody = document.querySelector('.table-overlay-body');
                if (tableBody) tableBody.innerHTML = tableHtml;
            };
            addButton.addEventListener('click', addButton._addButtonHandler);
        }

        // Remove genre buttons (using event delegation)
        // Use overlayContent for event delegation to handle dynamically created buttons
        // Remove any existing listener first to avoid duplicates
        if (overlayContent._removeGenreHandler) {
            overlayContent.removeEventListener('click', overlayContent._removeGenreHandler);
        }

        overlayContent._removeGenreHandler = (e) => {
            // Check if the clicked element or its parent is the remove button
            let removeBtn = e.target;
            if (!removeBtn.classList || !removeBtn.classList.contains('remove-genre-overlay-btn')) {
                removeBtn = e.target.closest('.remove-genre-overlay-btn');
            }

            if (removeBtn && removeBtn.dataset && removeBtn.dataset.index !== undefined) {
                // Prevent double-firing
                if (isRemovingGenre) {
                    e.preventDefault();
                    e.stopPropagation();
                    return;
                }

                e.preventDefault();
                e.stopPropagation();

                const index = parseInt(removeBtn.dataset.index);
                if (!isNaN(index) && index >= 0) {
                    const selectedGenres = stateAdapter.getSelectedGenres();
                    // Double-check we have genres and the index is valid
                    if (selectedGenres.length > 0 && index < selectedGenres.length) {
                        isRemovingGenre = true;

                        // Create a new array to avoid mutation issues
                        const newGenres = [...selectedGenres];
                        newGenres.splice(index, 1);
                        stateAdapter.setSelectedGenres(newGenres);
                        updateGenreSelectionUI();
                        // Re-render table
                        const tableHtml = processLinks(renderSelectedGenresTable());
                        const tableBody = document.querySelector('.table-overlay-body');
                        if (tableBody) {
                            tableBody.innerHTML = tableHtml;
                        }

                        // Reset flag after a short delay to allow UI to update
                        setTimeout(() => {
                            isRemovingGenre = false;
                        }, 200);
                    }
                }
            }
        };

        // Attach to overlayContent for event delegation
        overlayContent.addEventListener('click', overlayContent._removeGenreHandler);

        // Initial UI update
        updateGenreSelectionUI();
    }

    // Set up open buttons
    const openButtons = document.querySelectorAll('.open-table-overlay-btn');
    openButtons.forEach(button => {
        button.addEventListener('click', () => {
            const tableId = button.dataset.table;
            if (tableId) {
                openTableOverlay(tableId);
            }
        });
    });
}
