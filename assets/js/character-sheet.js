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

export function initializeCharacterSheet() {
    // --- FORM ELEMENTS ---
    const form = document.getElementById('character-sheet');
    if (!form) {
        // If the form isn't on the page, don't try to add listeners.
        // This is important for testing and for other pages on the site.
        return;
    }

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

        if (xpCurrent && rewards.xp > 0) {
            const currentXP = parseIntOr(xpCurrent.value, 0);
            xpCurrent.value = currentXP + rewards.xp;
        }

        if (inkDrops && rewards.inkDrops > 0) {
            const currentInk = parseIntOr(inkDrops.value, 0);
            inkDrops.value = currentInk + rewards.inkDrops;
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
            display.innerHTML = '<p class="no-genres">No genres selected yet. <a href="{{ site.baseurl }}/quests.html">Choose your genres here</a>.</p>';
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
    form.addEventListener('submit', (e) => {
        e.preventDefault();
        saveState(form);
        alert('Character sheet saved!');
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
        
        // Normalize values for comparison (handle empty strings, undefined, null, and number/string mismatches)
        const normalizeValue = (value) => {
            if (value === null || value === undefined || value === '') return '';
            return String(value).trim();
        };
        
        const savedInkDrops = normalizeValue(savedData.inkDrops);
        const savedPaperScraps = normalizeValue(savedData.paperScraps);
        
        // Get current form values and normalize
        const currentInkDrops = normalizeValue(inkDropsEl.value);
        const currentPaperScraps = normalizeValue(paperScrapsEl.value);
        
        // Check if there are unsaved changes
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

    // Delegated click handler for all interactive elements
    form.addEventListener('click', (e) => {
        const target = e.target;
        if (!target.dataset.index && !target.classList.contains('delete-ability-btn')) return;

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

    // --- INITIAL LOAD ---
    loadState(form);
    initializeCompletedBooksSet();
    
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
    initializeGenreSelection();
}

// Run the initialization when the DOM is fully loaded
// document.addEventListener('DOMContentLoaded', initializeCharacterSheet);
