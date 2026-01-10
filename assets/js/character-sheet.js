/**
 * Character Sheet Initialization - Controller-based architecture
 * 
 * This file orchestrates all controllers and provides the main initialization
 * function for the character sheet.
 */

import * as dataModule from './character-sheet/data.js';
import * as ui from './character-sheet/ui.js';
import { characterState, loadState, saveState } from './character-sheet/state.js';
import { STORAGE_KEYS } from './character-sheet/storageKeys.js';
import { StateAdapter, STATE_EVENTS } from './character-sheet/stateAdapter.js';
import { safeGetJSON, safeSetJSON } from './utils/storage.js';
import { parseIntOr, trimOrEmpty } from './utils/helpers.js';
import { initializeFormPersistence, showSaveIndicator } from './character-sheet/formPersistence.js';
import { runAllRepairs } from './character-sheet/postLoadRepair.js';

// Import controllers
import { CharacterController } from './controllers/CharacterController.js';
import { AbilityController } from './controllers/AbilityController.js';
import { InventoryController } from './controllers/InventoryController.js';
import { QuestController } from './controllers/QuestController.js';
import { CurseController } from './controllers/CurseController.js';
import { BuffController } from './controllers/BuffController.js';
import { EndOfMonthController } from './controllers/EndOfMonthController.js';

// Track unique books completed for XP calculation
let completedBooksSet = new Set();

export async function initializeCharacterSheet() {
    // --- FORM ELEMENTS ---
    const form = document.getElementById('character-sheet');
    if (!form) {
        // If the form isn't on the page, don't try to add listeners.
        // This is important for testing and for other pages on the site.
        return;
    }

    // --- POPULATE DROPDOWNS FIRST (before loadState) ---
    // Populate keeper background dropdown
    ui.populateBackgroundDropdown();

    // Populate wizard school dropdown
    const wizardSchoolSelect = document.getElementById('wizardSchool');
    if (wizardSchoolSelect && dataModule.schoolBenefits) {
        wizardSchoolSelect.innerHTML = '<option value="">-- Select a School --</option>';
        Object.keys(dataModule.schoolBenefits).forEach(schoolName => {
            const opt = document.createElement('option');
            opt.value = schoolName;
            opt.textContent = schoolName;
            wizardSchoolSelect.appendChild(opt);
        });
    }

    // Populate library sanctum dropdown
    const librarySanctumSelect = document.getElementById('librarySanctum');
    if (librarySanctumSelect && dataModule.sanctumBenefits) {
        librarySanctumSelect.innerHTML = '<option value="">-- Select a Sanctum --</option>';
        Object.keys(dataModule.sanctumBenefits).forEach(sanctumName => {
            const opt = document.createElement('option');
            opt.value = sanctumName;
            opt.textContent = sanctumName;
            librarySanctumSelect.appendChild(opt);
        });
    }

    // --- INITIAL LOAD (may be async due to IndexedDB-backed storage) ---
    await loadState(form);

    // Initialize form persistence (auto-save on input/change)
    initializeFormPersistence(form);

    const stateAdapter = new StateAdapter(characterState);

    // --- HELPER FUNCTIONS ---
    function initializeCompletedBooksSet() {
        completedBooksSet.clear();
        const monthlyBooks = safeGetJSON(STORAGE_KEYS.MONTHLY_COMPLETED_BOOKS, []);
        monthlyBooks.forEach(bookName => completedBooksSet.add(bookName));
    }

    function saveCompletedBooksSet() {
        const booksArray = Array.from(completedBooksSet);
        safeSetJSON(STORAGE_KEYS.MONTHLY_COMPLETED_BOOKS, booksArray);
    }


    function updateCurrency(rewards) {
        if (!rewards) return;
        const xpCurrent = document.getElementById('xp-current');
        const inkDrops = document.getElementById('inkDrops');
        const paperScraps = document.getElementById('paperScraps');
        const dustyBlueprints = document.getElementById('dustyBlueprints');

        if (xpCurrent && rewards.xp > 0) {
            const currentXP = parseIntOr(xpCurrent.value, 0);
            xpCurrent.value = currentXP + rewards.xp;
        }

        if (inkDrops && rewards.inkDrops > 0) {
            const currentInk = parseIntOr(inkDrops.value, 0);
            inkDrops.value = currentInk + rewards.inkDrops;
        }

        // Note: blueprints are awarded via stateAdapter, so we sync from characterState
        if (dustyBlueprints) {
            dustyBlueprints.value = characterState[STORAGE_KEYS.DUSTY_BLUEPRINTS] || 0;
        }

        if (paperScraps && rewards.paperScraps > 0) {
            const currentPaper = parseIntOr(paperScraps.value, 0);
            paperScraps.value = currentPaper + rewards.paperScraps;
        }

        // Handle items and temp buffs from rewards
        if (rewards.items && rewards.items.length > 0) {
            rewards.items.forEach(itemName => {
                // Check temporaryBuffs first (new source), then temporaryBuffsFromRewards (legacy)
                let buffData = dataModule.temporaryBuffs?.[itemName] || dataModule.temporaryBuffsFromRewards?.[itemName];
                if (buffData) {
                    let monthsRemaining = 0;
                    if (buffData.duration === 'two-months') {
                        monthsRemaining = 2;
                    } else if (buffData.duration === 'until-end-month') {
                        monthsRemaining = 1;
                    }

                    stateAdapter.addTemporaryBuff({
                        name: itemName,
                        description: buffData.description,
                        duration: buffData.duration,
                        monthsRemaining,
                        status: 'active'
                    });

                    ui.renderTemporaryBuffs();
                    const wearableSlotsInput = document.getElementById('wearable-slots');
                    const nonWearableSlotsInput = document.getElementById('non-wearable-slots');
                    const familiarSlotsInput = document.getElementById('familiar-slots');
                    ui.updateQuestBuffsDropdown(wearableSlotsInput, nonWearableSlotsInput, familiarSlotsInput);
                } else if (dataModule.allItems[itemName]) {
                    stateAdapter.addInventoryItem({ name: itemName, ...dataModule.allItems[itemName] });
                }
            });
        }

        // Auto-detect temporary buffs from reward text
        // Check if any reward text contains temporary buff names
        const checkRewardTextForBuffs = (rewardText) => {
            if (!rewardText || !dataModule.temporaryBuffs) return;
            
            for (const [buffName, buffData] of Object.entries(dataModule.temporaryBuffs)) {
                // Check if reward text contains the buff name (case-insensitive)
                if (rewardText.toLowerCase().includes(buffName.toLowerCase())) {
                    // Check if buff is already added
                    const existingBuffs = stateAdapter.getTemporaryBuffs();
                    const alreadyAdded = existingBuffs.some(buff => buff.name === buffName && buff.status === 'active');
                    if (!alreadyAdded) {
                        let monthsRemaining = 0;
                        if (buffData.duration === 'two-months') {
                            monthsRemaining = 2;
                        } else if (buffData.duration === 'until-end-month') {
                            monthsRemaining = 1;
                        }

                        stateAdapter.addTemporaryBuff({
                            name: buffName,
                            description: buffData.description,
                            duration: buffData.duration,
                            monthsRemaining,
                            status: 'active'
                        });

                        ui.renderTemporaryBuffs();
                        const wearableSlotsInput = document.getElementById('wearable-slots');
                        const nonWearableSlotsInput = document.getElementById('non-wearable-slots');
                        const familiarSlotsInput = document.getElementById('familiar-slots');
                        ui.updateQuestBuffsDropdown(wearableSlotsInput, nonWearableSlotsInput, familiarSlotsInput);
                    }
                }
            }
        };

        // Check items array for buff names
        if (rewards.items && rewards.items.length > 0) {
            const rewardText = rewards.items.join(' ');
            checkRewardTextForBuffs(rewardText);
        }
    }

    // Genre quest dropdown management
    function updateGenreQuestDropdown() {
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
            // Fallback to default genres
            for (const key in dataModule.genreQuests) {
                const option = document.createElement('option');
                option.value = `${dataModule.genreQuests[key].genre}: ${dataModule.genreQuests[key].description}`;
                option.textContent = `${key}: ${dataModule.genreQuests[key].genre}`;
                genreQuestSelect.appendChild(option);
            }
        }
    }

    // Shared dependencies for all controllers
    const dependencies = {
        ui,
        data: dataModule,
        saveState
    };

    // --- CONTROLLERS ---
    const characterController = new CharacterController(stateAdapter, form, dependencies);
    const abilityController = new AbilityController(stateAdapter, form, dependencies);
    const inventoryController = new InventoryController(stateAdapter, form, dependencies);
    const questController = new QuestController(stateAdapter, form, dependencies);
    const curseController = new CurseController(stateAdapter, form, dependencies);
    const buffController = new BuffController(stateAdapter, form, dependencies);
    const endOfMonthController = new EndOfMonthController(stateAdapter, form, dependencies);

    // Initialize controllers
    characterController.initialize();
    abilityController.initialize();
    inventoryController.initialize();
    questController.initialize(completedBooksSet, saveCompletedBooksSet, updateCurrency, updateGenreQuestDropdown);
    curseController.initialize();
    buffController.initialize(updateCurrency);
    endOfMonthController.initialize(completedBooksSet, saveCompletedBooksSet, updateCurrency);

    // --- GENRE SELECTION FUNCTIONALITY ---
    function initializeGenreSelection() {
        stateAdapter.syncSelectedGenresFromStorage();

        const handleGenresChanged = () => {
            updateGenreQuestDropdown();
            displaySelectedGenres();
        };

        handleGenresChanged();
        stateAdapter.on(STATE_EVENTS.SELECTED_GENRES_CHANGED, handleGenresChanged);
    }

    function displaySelectedGenres() {
        const display = document.getElementById('selected-genres-display');
        if (!display) return;

        const selectedGenres = stateAdapter.getSelectedGenres();

        if (selectedGenres.length === 0) {
            display.innerHTML = '<p class="no-genres">No genres selected yet. Open the Quests tab and click “♥ View Genre Quests” to choose your genres.</p>';
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

    // --- MAIN EVENT HANDLERS ---
    const printButton = document.getElementById('print-button');
    if (printButton) {
        // Store the original active tab before printing (captured once, never overwritten)
        let originalActiveTab = null;
        let isPrinting = false;
        
        // Prepare for printing: show all tabs
        const prepareForPrint = () => {
            const tabContainer = document.querySelector('.tab-container');
            if (tabContainer) {
                tabContainer.classList.add('printing');
            }
            
            // Only capture the active tab if we haven't already stored it
            // This prevents overwriting if beforeprint fires after a tab change
            if (!isPrinting) {
                // Get the currently active tab from the DOM, not localStorage
                const activePanel = document.querySelector('[data-tab-panel].active');
                originalActiveTab = activePanel ? activePanel.dataset.tabPanel : 'character';
                isPrinting = true;
            }
            
            // Ensure all tab panels are visible for printing
            const tabPanels = document.querySelectorAll('[data-tab-panel]');
            tabPanels.forEach(panel => {
                panel.classList.add('active');
            });
        };
        
        // Restore state after printing
        const restoreAfterPrint = () => {
            const tabContainer = document.querySelector('.tab-container');
            if (tabContainer) {
                tabContainer.classList.remove('printing');
            }
            
            // Restore the original active tab
            if (originalActiveTab) {
                const tabPanels = document.querySelectorAll('[data-tab-panel]');
                tabPanels.forEach(panel => {
                    panel.classList.remove('active');
                });
                
                // Try to restore the original tab, with fallback to first tab if it doesn't exist
                let activePanel = document.querySelector(`[data-tab-panel="${originalActiveTab}"]`);
                if (!activePanel) {
                    // Fallback: activate the first tab if the stored tab doesn't exist
                    const firstPanel = tabPanels[0];
                    if (firstPanel) {
                        activePanel = firstPanel;
                        originalActiveTab = firstPanel.dataset.tabPanel;
                    }
                }
                
                if (activePanel) {
                    activePanel.classList.add('active');
                    // Update localStorage to match the restored tab
                    localStorage.setItem('activeCharacterTab', originalActiveTab);
                }
                
                originalActiveTab = null;
                isPrinting = false;
            }
        };
        
        // Use beforeprint and afterprint events for better reliability
        window.addEventListener('beforeprint', prepareForPrint);
        window.addEventListener('afterprint', restoreAfterPrint);
        
        // Also handle the print button click
        printButton.addEventListener('click', () => {
            // Capture the active tab immediately when button is clicked
            const activePanel = document.querySelector('[data-tab-panel].active');
            originalActiveTab = activePanel ? activePanel.dataset.tabPanel : 'character';
            isPrinting = true;
            
            prepareForPrint();
            // Small delay to ensure DOM is updated before print dialog opens
            setTimeout(() => {
                window.print();
            }, 50);
        });
    }

    // Form submit handler
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        await saveState(form);
        showSaveIndicator();
        // Hide currency warning after save
        checkCurrencyUnsavedChanges();
    });

    // --- CURRENCY UNSAVED CHANGES WARNING ---
    function checkCurrencyUnsavedChanges() {
        const warningEl = document.getElementById('currency-unsaved-warning');
        if (!warningEl) return;
        
        const inkDropsEl = document.getElementById('inkDrops');
        const paperScrapsEl = document.getElementById('paperScraps');
        if (!inkDropsEl || !paperScrapsEl) return;
        
        // Get saved values from localStorage
        const savedData = safeGetJSON(STORAGE_KEYS.CHARACTER_SHEET_FORM, {});

        // Compare numerically so missing/empty saved values behave like 0 and
        // don't trigger a warning on initial load.
        const savedInkDrops = parseIntOr(savedData.inkDrops, 0);
        const savedPaperScraps = parseIntOr(savedData.paperScraps, 0);

        const currentInkDrops = parseIntOr(inkDropsEl.value, 0);
        const currentPaperScraps = parseIntOr(paperScrapsEl.value, 0);

        const hasUnsavedChanges = (currentInkDrops !== savedInkDrops) || (currentPaperScraps !== savedPaperScraps);
        
        // Show or hide warning
        if (hasUnsavedChanges) {
            warningEl.style.display = 'block';
        } else {
            warningEl.style.display = 'none';
        }
    }
    
    // Check for unsaved changes on currency field changes
    const inkDropsEl = document.getElementById('inkDrops');
    const paperScrapsEl = document.getElementById('paperScraps');
    
    if (inkDropsEl) {
        inkDropsEl.addEventListener('input', checkCurrencyUnsavedChanges);
        inkDropsEl.addEventListener('change', checkCurrencyUnsavedChanges);
    }
    
    if (paperScrapsEl) {
        paperScrapsEl.addEventListener('input', checkCurrencyUnsavedChanges);
        paperScrapsEl.addEventListener('change', checkCurrencyUnsavedChanges);
    }

    // Ensure warning reflects current saved vs form values on initial load
    checkCurrencyUnsavedChanges();

    // Delegated click handler for all interactive elements
    form.addEventListener('click', (e) => {
        const target = e.target;
        // Allow buttons without index if they're special buttons (delete-ability-btn, remove-passive-item-btn, equip-from-passive-btn)
        if (!target.dataset.index && 
            !target.classList.contains('delete-ability-btn') && 
            !target.classList.contains('remove-passive-item-btn') &&
            !target.classList.contains('equip-from-passive-btn')) {
            return;
        }

        // Route to appropriate controller
        if (abilityController.handleDeleteAbilityClick && abilityController.handleDeleteAbilityClick(target)) {
            return;
        }
        if (inventoryController.handleClick && inventoryController.handleClick(target)) {
            return;
        }
        if (questController.handleClick && questController.handleClick(target)) {
            return;
        }
        if (curseController.handleClick && curseController.handleClick(target)) {
            return;
        }
        if (buffController.handleClick && buffController.handleClick(target)) {
            return;
        }
    });

    // --- INITIALIZE DROPDOWNS ---
    // Populate item select dropdown
    const itemSelect = document.getElementById('item-select');
    if (itemSelect) {
        for (const name in dataModule.allItems) {
            const option = document.createElement('option');
            option.value = name;
            option.textContent = name;
            itemSelect.appendChild(option);
        }
    }

    // --- INITIALIZE STATE-DEPENDENT UI ---
    initializeCompletedBooksSet();
    
    // Run post-load repairs to fix any inconsistencies in saved data
    runAllRepairs(stateAdapter, ui);
    
    // Sync dusty blueprints input from characterState (stored separately from form)
    const dustyBlueprintsInput = document.getElementById('dustyBlueprints');
    if (dustyBlueprintsInput) {
        dustyBlueprintsInput.value = characterState[STORAGE_KEYS.DUSTY_BLUEPRINTS] || 0;
        
        // Sync characterState when input changes
        dustyBlueprintsInput.addEventListener('change', () => {
            const newValue = parseIntOr(dustyBlueprintsInput.value, 0);
            characterState[STORAGE_KEYS.DUSTY_BLUEPRINTS] = newValue;
            stateAdapter.state[STORAGE_KEYS.DUSTY_BLUEPRINTS] = newValue;
            safeSetJSON(STORAGE_KEYS.DUSTY_BLUEPRINTS, newValue);
        });
    }
    
    // Initialize shelf books visualization
    const booksCompletedInput = document.getElementById('books-completed-month');
    const booksCompleted = booksCompletedInput ? parseIntOr(booksCompletedInput.value, 0) : 0;
    const shelfColors = safeGetJSON(STORAGE_KEYS.SHELF_BOOK_COLORS, []);
    ui.renderShelfBooks(booksCompleted, shelfColors);
    
    // Handle manual changes to books completed input
    if (booksCompletedInput) {
        booksCompletedInput.addEventListener('change', () => {
            let newCount = parseIntOr(booksCompletedInput.value, 0);
            // Enforce maximum of 10 books
            if (newCount > 10) {
                newCount = 10;
                booksCompletedInput.value = 10;
            }
            
            let currentColors = safeGetJSON(STORAGE_KEYS.SHELF_BOOK_COLORS, []);
            
            // Add new colors if count increased (but don't exceed 10)
            while (currentColors.length < newCount && currentColors.length < 10) {
                currentColors.push(ui.getRandomShelfColor());
            }
            
            // Trim colors if count decreased
            if (currentColors.length > newCount) {
                currentColors = currentColors.slice(0, newCount);
            }
            
            // Update both localStorage and characterState to keep them in sync
            safeSetJSON(STORAGE_KEYS.SHELF_BOOK_COLORS, currentColors);
            characterState[STORAGE_KEYS.SHELF_BOOK_COLORS] = currentColors;
            ui.renderShelfBooks(newCount, currentColors);
        });
    }
    
    // Check for unsaved currency changes AFTER state is loaded
    // Use setTimeout to ensure form values are fully populated
    setTimeout(() => {
        checkCurrencyUnsavedChanges();
    }, 0);

    const levelInput = document.getElementById('level');
    const xpNeededInput = document.getElementById('xp-needed');
    const smpInput = document.getElementById('smp');
    const wearableSlotsInput = document.getElementById('wearable-slots');
    const nonWearableSlotsInput = document.getElementById('non-wearable-slots');
    const familiarSlotsInput = document.getElementById('familiar-slots');

    ui.renderAll(levelInput, xpNeededInput, wizardSchoolSelect, librarySanctumSelect, smpInput, wearableSlotsInput, nonWearableSlotsInput, familiarSlotsInput);
    // Update RPG-styled XP progress bar after state is loaded
    ui.updateXpProgressBar();
    initializeGenreSelection();
    
    // Initialize rolling tables in Quests tab
    await initializeRollingTables();
    await initializeQuestInfoDrawers();
}

/**
 * Initialize rolling tables as side overlays
 */
async function initializeRollingTables() {
    // Import table renderer functions
    const tableRenderer = await import('./table-renderer.js');
    const { renderGenreQuestsTable, renderAtmosphericBuffsTable, renderSideQuestsTable, renderDungeonRoomsTable } = tableRenderer;
    
    // Import state adapter for genre selection
    const { StateAdapter } = await import('./character-sheet/stateAdapter.js');
    const { characterState } = await import('./character-sheet/state.js');
    const stateAdapter = new StateAdapter(characterState);
    
    // Import data module for allGenres
    const dataModule = await import('./character-sheet/data.js');
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
    
    // Table titles mapping
    const tableTitles = {
        'genre-quests': 'Genre Quests Table',
        'atmospheric-buffs': 'Atmospheric Buffs Table',
        'side-quests': 'Side Quests Table (d8)',
        'dungeon-rooms': 'Dungeon Rooms Table (d12)'
    };
    
    // Import storage utilities
    const { safeGetJSON, safeSetJSON } = await import('./utils/storage.js');
    const { STORAGE_KEYS } = await import('./character-sheet/storageKeys.js');
    
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
        const diceType = safeGetJSON(STORAGE_KEYS.GENRE_DICE_SELECTION, 'd6');
        const allGenreKeys = Object.keys(allGenres);
        const DICE_LIMITS = { 'd4': 4, 'd6': 6, 'd8': 8, 'd10': 10, 'd12': 12, 'd20': 20 };
        const maxGenres = diceType === 'd20' ? allGenreKeys.length : DICE_LIMITS[diceType] || 6;
        
        // Get available genres (not yet selected)
        const availableGenres = allGenreKeys.filter(g => !selectedGenres.includes(g));
        
        let html = `
            <div class="genre-selection-overlay-section">
                <h3>📚 Choose Your Genres</h3>
                <p class="description">Select how many genres you want for your "Organize the Stacks" quests. Choose a dice type to determine how many genres you can select. If you choose d20, all genres will be automatically selected.</p>
                
                <div class="dice-selection-controls" style="margin-bottom: 15px;">
                    <label for="overlay-genre-dice-selector"><strong>Number of Genres (Dice Type):</strong></label>
                    <select id="overlay-genre-dice-selector" style="padding: 5px; margin-left: 10px;">
                        <option value="d4" ${diceType === 'd4' ? 'selected' : ''}>d4 (4 genres)</option>
                        <option value="d6" ${diceType === 'd6' ? 'selected' : ''}>d6 (6 genres)</option>
                        <option value="d8" ${diceType === 'd8' ? 'selected' : ''}>d8 (8 genres)</option>
                        <option value="d10" ${diceType === 'd10' ? 'selected' : ''}>d10 (10 genres)</option>
                        <option value="d12" ${diceType === 'd12' ? 'selected' : ''}>d12 (12 genres)</option>
                        <option value="d20" ${diceType === 'd20' ? 'selected' : ''}>d20 (all genres)</option>
                    </select>
                </div>
                
                <div class="selected-genres-display-overlay" style="margin-bottom: 15px; min-height: 50px; padding: 10px; background: rgba(84, 72, 59, 0.2); border-radius: 4px;">
                    <strong>Selected Genres (${selectedGenres.length}/${maxGenres}):</strong>
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
                    <button type="button" id="overlay-add-genre-button" ${selectedGenres.length >= maxGenres ? 'disabled' : ''} style="padding: 5px 15px; background: rgba(184, 159, 98, 0.3); border: 1px solid #b89f62; color: #b89f62; border-radius: 4px; cursor: pointer;">Add Genre</button>
                </div>
            </div>
        `;
        
        return html;
    }
    
    // Function to open overlay with a specific table
    function openTableOverlay(tableId) {
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
        
        // Render table in overlay
        let contentHtml = `
            <div class="table-overlay-header">
                <h2>${title}</h2>
            </div>
            <div class="table-overlay-body">
                ${tableHtml}
            </div>
        `;
        
        // Add genre selection UI if needed
        if (showGenreSelection) {
            contentHtml += renderGenreSelectionUI();
        }
        
        overlayContent.innerHTML = contentHtml;
        
        // Set up genre selection event listeners if needed
        if (showGenreSelection) {
            setupGenreSelectionListeners();
        }
        
        // Show overlay and backdrop
        if (overlayBackdrop) {
            overlayBackdrop.classList.add('active');
        }
        overlayPanel.style.display = 'block';
        document.body.style.overflow = 'hidden'; // Prevent background scrolling
    }
    
    // Track if we're currently processing a removal to prevent double-firing
    // This needs to be outside the function so it persists across calls
    let isRemovingGenre = false;
    
    // Function to setup genre selection event listeners
    function setupGenreSelectionListeners() {
        const diceSelector = document.getElementById('overlay-genre-dice-selector');
        const genreSelector = document.getElementById('overlay-genre-selector');
        const addButton = document.getElementById('overlay-add-genre-button');
        
        const DICE_LIMITS = { 'd4': 4, 'd6': 6, 'd8': 8, 'd10': 10, 'd12': 12, 'd20': 20 };
        const allGenreKeys = Object.keys(allGenres);
        
        function updateGenreSelectionUI() {
            const selectedGenres = stateAdapter.getSelectedGenres();
            const diceType = safeGetJSON(STORAGE_KEYS.GENRE_DICE_SELECTION, 'd6');
            const maxGenres = diceType === 'd20' ? allGenreKeys.length : DICE_LIMITS[diceType] || 6;
            const availableGenres = allGenreKeys.filter(g => !selectedGenres.includes(g));
            
            // Update selected genres display
            const displayDiv = document.querySelector('.selected-genres-display-overlay');
            if (displayDiv) {
                displayDiv.innerHTML = `
                    <strong>Selected Genres (${selectedGenres.length}/${maxGenres}):</strong>
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
            
            // Update add button state
            if (addButton) {
                addButton.disabled = selectedGenres.length >= maxGenres;
            }
        }
        
        // Remove previous listeners if they exist
        if (diceSelector && diceSelector._diceChangeHandler) {
            diceSelector.removeEventListener('change', diceSelector._diceChangeHandler);
        }
        if (addButton && addButton._addButtonHandler) {
            addButton.removeEventListener('click', addButton._addButtonHandler);
        }
        if (genreSelector && genreSelector._genreSelectorChangeHandler) {
            genreSelector.removeEventListener('change', genreSelector._genreSelectorChangeHandler);
        }
        
        // Dice selector change
        if (diceSelector) {
            diceSelector._diceChangeHandler = () => {
                const newDiceType = diceSelector.value;
                safeSetJSON(STORAGE_KEYS.GENRE_DICE_SELECTION, newDiceType);
                
                let selectedGenres = stateAdapter.getSelectedGenres();
                const maxGenres = newDiceType === 'd20' ? allGenreKeys.length : DICE_LIMITS[newDiceType] || 6;
                
                // If d20, auto-select all genres
                if (newDiceType === 'd20') {
                    const genresToAdd = allGenreKeys.filter(g => !selectedGenres.includes(g));
                    selectedGenres.push(...genresToAdd);
                    stateAdapter.setSelectedGenres(selectedGenres);
                } else if (selectedGenres.length > maxGenres) {
                    // Trim to new max
                    selectedGenres.splice(maxGenres);
                    stateAdapter.setSelectedGenres(selectedGenres);
                }
                
                updateGenreSelectionUI();
                // Re-render table
                const tableHtml = processLinks(renderSelectedGenresTable());
                const tableBody = document.querySelector('.table-overlay-body');
                if (tableBody) {
                    tableBody.innerHTML = tableHtml;
                }
            };
            diceSelector.addEventListener('change', diceSelector._diceChangeHandler);
        }
        
        // Add genre button
        if (addButton && genreSelector) {
            addButton._addButtonHandler = async () => {
                const selectedGenre = genreSelector.value;
                if (!selectedGenre) return;
                
                const selectedGenres = stateAdapter.getSelectedGenres();
                const diceType = safeGetJSON(STORAGE_KEYS.GENRE_DICE_SELECTION, 'd6');
                const maxGenres = diceType === 'd20' ? allGenreKeys.length : DICE_LIMITS[diceType] || 6;
                
                // Check if already at max (even if button is enabled, check again)
                if (selectedGenres.length >= maxGenres) {
                    const { toast } = await import('./ui/toast.js');
                    toast.warning(`You can only select ${diceType === 'd20' ? 'all' : maxGenres} ${maxGenres === 1 ? 'genre' : 'genres'} maximum.`);
                    return;
                }
                
                if (selectedGenres.includes(selectedGenre)) {
                    const { toast } = await import('./ui/toast.js');
                    toast.warning('This genre is already selected.');
                    return;
                }
                
                selectedGenres.push(selectedGenre);
                stateAdapter.setSelectedGenres(selectedGenres);
                genreSelector.value = '';
                updateGenreSelectionUI();
                // Re-render table
                const tableHtml = processLinks(renderSelectedGenresTable());
                const tableBody = document.querySelector('.table-overlay-body');
                if (tableBody) {
                    tableBody.innerHTML = tableHtml;
                }
            };
            addButton.addEventListener('click', addButton._addButtonHandler);
            
            // Also check on genre selector change to show toast if trying to add when at max
            genreSelector._genreSelectorChangeHandler = async () => {
                const selectedGenre = genreSelector.value;
                if (!selectedGenre) return;
                
                const selectedGenres = stateAdapter.getSelectedGenres();
                const diceType = safeGetJSON(STORAGE_KEYS.GENRE_DICE_SELECTION, 'd6');
                const maxGenres = diceType === 'd20' ? allGenreKeys.length : DICE_LIMITS[diceType] || 6;
                
                // If at max and trying to select a genre, show warning
                if (selectedGenres.length >= maxGenres && !selectedGenres.includes(selectedGenre)) {
                    const { toast } = await import('./ui/toast.js');
                    toast.warning(`You can only select ${diceType === 'd20' ? 'all' : maxGenres} ${maxGenres === 1 ? 'genre' : 'genres'} maximum. Remove a genre first to add a new one.`);
                    genreSelector.value = '';
                }
            };
            genreSelector.addEventListener('change', genreSelector._genreSelectorChangeHandler);
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
    
    // Function to close overlay
    function closeTableOverlay() {
        if (overlayBackdrop) {
            overlayBackdrop.classList.remove('active');
        }
        overlayPanel.style.display = 'none';
        document.body.style.overflow = ''; // Restore scrolling
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
    
    // Set up close button
    if (closeButton) {
        closeButton.addEventListener('click', closeTableOverlay);
    }
    
    // Close overlay when clicking on backdrop
    if (overlayBackdrop) {
        overlayBackdrop.addEventListener('click', closeTableOverlay);
    }
    
    // Close overlay when clicking outside panel (on panel itself, not content)
    overlayPanel.addEventListener('click', (e) => {
        if (e.target === overlayPanel) {
            closeTableOverlay();
        }
    });
    
    // Close overlay on Escape key
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && overlayPanel.style.display === 'block') {
            closeTableOverlay();
        }
    });
}

// Initialize Quest Info Drawers
async function initializeQuestInfoDrawers() {
    const { renderGenreQuestsTable, renderAtmosphericBuffsTable, renderSideQuestsTable, renderDungeonRewardsTable, renderDungeonRoomsTable, renderDungeonCompletionRewardsTable, processLinks } = await import('./table-renderer.js');
    const { StateAdapter } = await import('./character-sheet/stateAdapter.js');
    const { characterState } = await import('./character-sheet/state.js');
    const { safeGetJSON, safeSetJSON } = await import('./utils/storage.js');
    const { STORAGE_KEYS } = await import('./character-sheet/storageKeys.js');
    const dataModule = await import('./character-sheet/data.js');
    const allGenres = dataModule.allGenres;
    const stateAdapter = new StateAdapter(characterState);
    
    // Helper function to process links
    function processLinksHelper(html) {
        const metaBase = document.querySelector('meta[name="baseurl"]');
        const baseurl = metaBase ? metaBase.content : '';
        return html.replace(/\{\{\s*site\.baseurl\s*\}\}/g, baseurl);
    }
    
    // Function to render selected genres table
    function renderSelectedGenresTable() {
        const selectedGenres = stateAdapter.getSelectedGenres();
        
        if (selectedGenres.length === 0) {
            return '<p class="no-genres-message">No genres selected. Use the genre selection controls below to add genres.</p>';
        }
        
        let html = `<table class="tracker-table">
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
        const diceType = safeGetJSON(STORAGE_KEYS.GENRE_DICE_SELECTION, 'd6');
        const allGenreKeys = Object.keys(allGenres);
        const DICE_LIMITS = { 'd4': 4, 'd6': 6, 'd8': 8, 'd10': 10, 'd12': 12, 'd20': 20 };
        const maxGenres = diceType === 'd20' ? allGenreKeys.length : DICE_LIMITS[diceType] || 6;
        
        // Get available genres (not yet selected)
        const availableGenres = allGenreKeys.filter(g => !selectedGenres.includes(g));
        
        let html = `
            <div class="genre-selection-overlay-section" style="margin-top: 24px; padding-top: 24px; border-top: 2px solid #54483b;">
                <h3>📚 Choose Your Genres</h3>
                <p class="description">Select how many genres you want for your "Organize the Stacks" quests. Choose a dice type to determine how many genres you can select. If you choose d20, all genres will be automatically selected.</p>
                
                <div class="dice-selection-controls" style="margin-bottom: 15px;">
                    <label for="drawer-genre-dice-selector"><strong>Number of Genres (Dice Type):</strong></label>
                    <select id="drawer-genre-dice-selector" class="rpg-select" style="padding: 5px; margin-left: 10px;">
                        <option value="d4" ${diceType === 'd4' ? 'selected' : ''}>d4 (4 genres)</option>
                        <option value="d6" ${diceType === 'd6' ? 'selected' : ''}>d6 (6 genres)</option>
                        <option value="d8" ${diceType === 'd8' ? 'selected' : ''}>d8 (8 genres)</option>
                        <option value="d10" ${diceType === 'd10' ? 'selected' : ''}>d10 (10 genres)</option>
                        <option value="d12" ${diceType === 'd12' ? 'selected' : ''}>d12 (12 genres)</option>
                        <option value="d20" ${diceType === 'd20' ? 'selected' : ''}>d20 (all genres)</option>
                    </select>
                </div>
                
                <div class="selected-genres-display-overlay" style="margin-bottom: 15px; min-height: 50px; padding: 10px; background: rgba(84, 72, 59, 0.2); border-radius: 4px;">
                    <strong>Selected Genres (${selectedGenres.length}/${maxGenres}):</strong>
                    <div style="display: flex; flex-wrap: wrap; gap: 8px; margin-top: 8px;">
                        ${selectedGenres.length === 0 
                            ? '<span style="color: #999; font-style: italic;">No genres selected yet.</span>'
                            : selectedGenres.map((genre, idx) => `
                                <span class="selected-genre-tag" style="display: inline-flex; align-items: center; gap: 5px; padding: 5px 10px; background: rgba(184, 159, 98, 0.3); border: 1px solid #b89f62; border-radius: 4px;">
                                    ${genre}
                                    <button type="button" class="remove-genre-drawer-btn" data-index="${idx}" style="background: none; border: none; color: #b89f62; cursor: pointer; font-size: 1.2em; padding: 0; width: 20px; height: 20px; line-height: 1;">×</button>
                                </span>
                            `).join('')
                        }
                    </div>
                </div>
                
                <div class="add-genre-controls" style="display: flex; gap: 10px; align-items: center;">
                    <select id="drawer-genre-selector" class="rpg-select" style="flex: 1;">
                        <option value="">-- Select a genre to add --</option>
                        ${availableGenres.map(genre => `<option value="${genre}">${genre}</option>`).join('')}
                    </select>
                    <button type="button" id="drawer-add-genre-button" class="rpg-btn rpg-btn-primary" ${selectedGenres.length >= maxGenres ? 'disabled' : ''}>Add Genre</button>
                </div>
            </div>`;
        
        return html;
    }
    
    // Function to setup genre selection listeners for drawer
    function setupGenreSelectionListenersDrawer(container) {
        const diceSelector = container.querySelector('#drawer-genre-dice-selector');
        const genreSelector = container.querySelector('#drawer-genre-selector');
        const addButton = container.querySelector('#drawer-add-genre-button');
        
        const DICE_LIMITS = { 'd4': 4, 'd6': 6, 'd8': 8, 'd10': 10, 'd12': 12, 'd20': 20 };
        const allGenreKeys = Object.keys(allGenres);
        
        function updateGenreSelectionUI() {
            const selectedGenres = stateAdapter.getSelectedGenres();
            const diceType = safeGetJSON(STORAGE_KEYS.GENRE_DICE_SELECTION, 'd6');
            const maxGenres = diceType === 'd20' ? allGenreKeys.length : DICE_LIMITS[diceType] || 6;
            const availableGenres = allGenreKeys.filter(g => !selectedGenres.includes(g));
            
            // Update selected genres display
            const displayDiv = container.querySelector('.selected-genres-display-overlay');
            if (displayDiv) {
                displayDiv.innerHTML = `
                    <strong>Selected Genres (${selectedGenres.length}/${maxGenres}):</strong>
                    <div style="display: flex; flex-wrap: wrap; gap: 8px; margin-top: 8px;">
                        ${selectedGenres.length === 0 
                            ? '<span style="color: #999; font-style: italic;">No genres selected yet.</span>'
                            : selectedGenres.map((genre, idx) => `
                                <span class="selected-genre-tag" style="display: inline-flex; align-items: center; gap: 5px; padding: 5px 10px; background: rgba(184, 159, 98, 0.3); border: 1px solid #b89f62; border-radius: 4px;">
                                    ${genre}
                                    <button type="button" class="remove-genre-drawer-btn" data-index="${idx}" style="background: none; border: none; color: #b89f62; cursor: pointer; font-size: 1.2em; padding: 0; width: 20px; height: 20px; line-height: 1;">×</button>
                                </span>
                            `).join('')
                        }
                    </div>`;
                
                // Re-attach remove button listeners
                displayDiv.querySelectorAll('.remove-genre-drawer-btn').forEach(btn => {
                    btn.addEventListener('click', () => {
                        const index = parseInt(btn.dataset.index);
                        const selectedGenres = stateAdapter.getSelectedGenres();
                        selectedGenres.splice(index, 1);
                        stateAdapter.setSelectedGenres(selectedGenres);
                        updateGenreSelectionUI();
                        // Re-render table
                        const tableContainer = container.querySelector('#genre-quests-table-container');
                        if (tableContainer) {
                            tableContainer.innerHTML = processLinksHelper(renderSelectedGenresTable());
                        }
                    });
                });
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
            
            // Update add button state
            if (addButton) {
                addButton.disabled = selectedGenres.length >= maxGenres;
            }
        }
        
        // Dice selector change handler
        if (diceSelector) {
            diceSelector.addEventListener('change', () => {
                const diceType = diceSelector.value;
                safeSetJSON(STORAGE_KEYS.GENRE_DICE_SELECTION, diceType);
                
                const maxGenres = diceType === 'd20' ? allGenreKeys.length : DICE_LIMITS[diceType] || 6;
                const selectedGenres = stateAdapter.getSelectedGenres();
                
                // If d20, auto-select all genres
                if (diceType === 'd20') {
                    stateAdapter.setSelectedGenres(allGenreKeys);
                } else {
                    // Trim to max if over limit
                    if (selectedGenres.length > maxGenres) {
                        stateAdapter.setSelectedGenres(selectedGenres.slice(0, maxGenres));
                    }
                }
                
                updateGenreSelectionUI();
                const tableContainer = container.querySelector('#genre-quests-table-container');
                if (tableContainer) {
                    tableContainer.innerHTML = processLinksHelper(renderSelectedGenresTable());
                }
            });
        }
        
        // Add genre button handler
        if (addButton) {
            addButton.addEventListener('click', () => {
                if (!genreSelector || !genreSelector.value) return;
                
                const selectedGenres = stateAdapter.getSelectedGenres();
                const diceType = safeGetJSON(STORAGE_KEYS.GENRE_DICE_SELECTION, 'd6');
                const maxGenres = diceType === 'd20' ? allGenreKeys.length : DICE_LIMITS[diceType] || 6;
                
                if (selectedGenres.length >= maxGenres) return;
                
                selectedGenres.push(genreSelector.value);
                stateAdapter.setSelectedGenres(selectedGenres);
                genreSelector.value = '';
                
                updateGenreSelectionUI();
                const tableContainer = container.querySelector('#genre-quests-table-container');
                if (tableContainer) {
                    tableContainer.innerHTML = processLinksHelper(renderSelectedGenresTable());
                }
            });
        }
        
        // Initial UI update
        updateGenreSelectionUI();
    }
    
    // Drawer configuration
    const drawerConfig = {
        'genre-quests': {
            backdrop: 'genre-quests-backdrop',
            drawer: 'genre-quests-drawer',
            closeBtn: 'close-genre-quests',
            container: 'genre-quests-table-container',
            renderTable: () => processLinksHelper(renderSelectedGenresTable()),
            renderGenreUI: () => renderGenreSelectionUI(),
            setupGenreListeners: (container) => setupGenreSelectionListenersDrawer(container)
        },
        'atmospheric-buffs': {
            backdrop: 'atmospheric-buffs-info-backdrop',
            drawer: 'atmospheric-buffs-info-drawer',
            closeBtn: 'close-atmospheric-buffs-info',
            container: 'atmospheric-buffs-table-container',
            renderTable: () => processLinksHelper(renderAtmosphericBuffsTable())
        },
        'side-quests': {
            backdrop: 'side-quests-info-backdrop',
            drawer: 'side-quests-info-drawer',
            closeBtn: 'close-side-quests-info',
            container: 'side-quests-table-container',
            renderTable: () => processLinksHelper(renderSideQuestsTable())
        },
        'dungeons': {
            backdrop: 'dungeons-info-backdrop',
            drawer: 'dungeons-info-drawer',
            closeBtn: 'close-dungeons-info',
            containers: {
                rewards: 'dungeon-rewards-table-container',
                rooms: 'dungeon-rooms-table-container',
                completion: 'dungeon-completion-rewards-table-container'
            },
            renderTables: () => ({
                rewards: processLinksHelper(renderDungeonRewardsTable()),
                rooms: processLinksHelper(renderDungeonRoomsTable()),
                completion: processLinksHelper(renderDungeonCompletionRewardsTable())
            })
        }
    };
    
    function openDrawer(drawerId) {
        const config = drawerConfig[drawerId];
        if (!config) return;
        
        const backdrop = document.getElementById(config.backdrop);
        const drawer = document.getElementById(config.drawer);
        if (!backdrop || !drawer) return;
        
        // Render tables
        if (drawerId === 'dungeons') {
            const tables = config.renderTables();
            const rewardsContainer = document.getElementById(config.containers.rewards);
            const roomsContainer = document.getElementById(config.containers.rooms);
            const completionContainer = document.getElementById(config.containers.completion);
            if (rewardsContainer) rewardsContainer.innerHTML = tables.rewards;
            if (roomsContainer) roomsContainer.innerHTML = tables.rooms;
            if (completionContainer) completionContainer.innerHTML = tables.completion;
        } else if (drawerId === 'genre-quests') {
            const container = document.getElementById(config.container);
            if (container) {
                container.innerHTML = config.renderTable();
                // Add genre selection UI
                if (config.renderGenreUI) {
                    container.insertAdjacentHTML('afterend', config.renderGenreUI());
                }
                // Setup genre selection listeners
                if (config.setupGenreListeners) {
                    const drawerBody = drawer.querySelector('.info-drawer-body');
                    if (drawerBody) {
                        config.setupGenreListeners(drawerBody);
                    }
                }
            }
        } else {
            const container = document.getElementById(config.container);
            if (container) {
                container.innerHTML = config.renderTable();
            }
        }
        
        // Show drawer
        drawer.style.display = 'flex';
        backdrop.classList.add('active');
        document.body.style.overflow = 'hidden';
    }
    
    function closeDrawer(drawerId) {
        const config = drawerConfig[drawerId];
        if (!config) return;
        
        const backdrop = document.getElementById(config.backdrop);
        const drawer = document.getElementById(config.drawer);
        if (!backdrop || !drawer) return;
        
        drawer.style.display = 'none';
        backdrop.classList.remove('active');
        document.body.style.overflow = '';
    }
    
    // Set up open buttons
    const openButtons = document.querySelectorAll('.open-quest-info-drawer-btn');
    openButtons.forEach(button => {
        button.addEventListener('click', () => {
            const drawerId = button.dataset.drawer;
            if (drawerId) {
                openDrawer(drawerId);
            }
        });
    });
    
    // Set up close buttons and backdrop clicks
    Object.keys(drawerConfig).forEach(drawerId => {
        const config = drawerConfig[drawerId];
        const closeBtn = document.getElementById(config.closeBtn);
        const backdrop = document.getElementById(config.backdrop);
        
        if (closeBtn) {
            closeBtn.addEventListener('click', () => closeDrawer(drawerId));
        }
        
        if (backdrop) {
            backdrop.addEventListener('click', () => closeDrawer(drawerId));
        }
    });
    
    // Close drawers on Escape key
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            Object.keys(drawerConfig).forEach(drawerId => {
                const drawer = document.getElementById(drawerConfig[drawerId].drawer);
                if (drawer && drawer.style.display === 'flex') {
                    closeDrawer(drawerId);
                }
            });
        }
    });
}

// Run the initialization when the DOM is fully loaded
// document.addEventListener('DOMContentLoaded', initializeCharacterSheet);
