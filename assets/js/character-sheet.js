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
import { DataExportController } from './controllers/DataExportController.js';

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

    /**
     * Fix completed restoration projects that don't have passive slots created yet
     * This handles cases where projects were completed before the slot creation logic was added
     */
    function fixCompletedRestorationProjects() {
        const completedProjects = characterState[STORAGE_KEYS.COMPLETED_RESTORATION_PROJECTS] || [];
        const passiveItemSlots = characterState[STORAGE_KEYS.PASSIVE_ITEM_SLOTS] || [];
        const passiveFamiliarSlots = characterState[STORAGE_KEYS.PASSIVE_FAMILIAR_SLOTS] || [];
        
        // Track which projects already have slots
        const projectsWithSlots = new Set();
        [...passiveItemSlots, ...passiveFamiliarSlots].forEach(slot => {
            if (slot.unlockedFrom) {
                projectsWithSlots.add(slot.unlockedFrom);
            }
        });

        // Check each completed project
        let fixedCount = 0;
        for (const projectId of completedProjects) {
            // Skip if already has a slot
            if (projectsWithSlots.has(projectId)) continue;

            // Get project data
            const project = dataModule.restorationProjects?.[projectId];
            if (!project || !project.reward) continue;

            // Create the slot based on reward type
            if (project.reward.type === 'passiveItemSlot') {
                const slotId = `item-slot-${projectId}`;
                stateAdapter.addPassiveItemSlot(slotId, projectId);
                fixedCount++;
            } else if (project.reward.type === 'passiveFamiliarSlot') {
                const slotId = `familiar-slot-${projectId}`;
                stateAdapter.addPassiveFamiliarSlot(slotId, projectId);
                fixedCount++;
            }
        }

        if (fixedCount > 0) {
            console.log(`Fixed ${fixedCount} completed restoration project(s) by creating missing passive slots.`);
            // Refresh passive equipment display if it exists
            if (ui.renderPassiveEquipment) {
                ui.renderPassiveEquipment();
            }
        }
    }

    /**
     * Fix completed familiar encounters that don't have familiars in rewards
     * This handles cases where familiars were befriended before the fix was applied
     */
    function fixCompletedFamiliarEncounters() {
        const completedQuests = characterState[STORAGE_KEYS.COMPLETED_QUESTS] || [];
        const inventoryItems = characterState[STORAGE_KEYS.INVENTORY_ITEMS] || [];
        const equippedItems = characterState[STORAGE_KEYS.EQUIPPED_ITEMS] || [];
        const ownedItemNames = new Set([...inventoryItems, ...equippedItems].map(item => item.name));
        
        let fixedCount = 0;
        let checkedQuests = 0;
        let encounterQuests = 0;
        
        // Check all rooms for familiar encounters
        for (const roomNumber in dataModule.dungeonRooms) {
            const room = dataModule.dungeonRooms[roomNumber];
            if (!room.encountersDetailed) continue;
            
            for (const encounter of room.encountersDetailed) {
                if (encounter.type !== 'Familiar') continue;
                
                const encounterName = encounter.name;
                if (!encounterName || !dataModule.allItems[encounterName]) continue;
                
                // Skip if already owned
                if (ownedItemNames.has(encounterName)) continue;
                
                // Try to find a completed quest for this encounter
                // Check both by encounterName and by prompt (for older quests)
                let foundQuest = false;
                for (const quest of completedQuests) {
                    checkedQuests++;
                    if (quest.type !== '♠ Dungeon Crawl') continue;
                    
                    encounterQuests++;
                    const isEncounter = quest.isEncounter === true || quest.isEncounter === 'true';
                    
                    // Check if this quest matches the encounter
                    const matchesByName = isEncounter && quest.encounterName === encounterName;
                    // Relaxed prompt matching - just check if the encounter name is in the prompt
                    const matchesByPrompt = quest.prompt && quest.prompt.includes(encounterName);
                    
                    if (matchesByName || matchesByPrompt) {
                        // Check if it was a befriend action (default true if not specified, for familiars)
                        // If it's a Coffee Elemental, assume befriend if not explicitly defeat
                        const isBefriend = quest.isBefriend !== false;
                        
                        if (isBefriend) {
                            foundQuest = true;
                            // Add the familiar to inventory
                            stateAdapter.addInventoryItem({ 
                                name: encounterName, 
                                ...dataModule.allItems[encounterName] 
                            });
                            ownedItemNames.add(encounterName);
                            fixedCount++;
                            console.log(`Fixed: Added missing familiar "${encounterName}" to inventory from completed encounter quest.`);
                            break;
                        }
                    }
                }
            }
        }
        
        if (fixedCount > 0) {
            console.log(`Fixed ${fixedCount} completed familiar encounter(s) by adding missing familiars to inventory.`);
            // Refresh inventory display
            const wearableSlotsInput = document.getElementById('wearable-slots');
            const nonWearableSlotsInput = document.getElementById('non-wearable-slots');
            const familiarSlotsInput = document.getElementById('familiar-slots');
            if (wearableSlotsInput && ui.renderLoadout) {
                ui.renderLoadout(wearableSlotsInput, nonWearableSlotsInput, familiarSlotsInput);
                // Also refresh passive equipment
                if (ui.renderPassiveEquipment) {
                    ui.renderPassiveEquipment();
                }
            }
        } else {
            console.log(`Checked ${checkedQuests} completed quests (${encounterQuests} dungeon encounters) for missing familiars - none found.`);
        }
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
    const dataExportController = new DataExportController(stateAdapter, form, dependencies);

    // Initialize controllers
    characterController.initialize();
    abilityController.initialize();
    inventoryController.initialize();
    questController.initialize(completedBooksSet, saveCompletedBooksSet, updateCurrency, updateGenreQuestDropdown);
    curseController.initialize();
    buffController.initialize(updateCurrency);
    endOfMonthController.initialize(completedBooksSet, saveCompletedBooksSet, updateCurrency);
    dataExportController.initialize();

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
    
    // Fix any completed restoration projects that don't have passive slots created
    fixCompletedRestorationProjects();
    
    // Fix any completed familiar encounters that are missing familiars from rewards
    fixCompletedFamiliarEncounters();
    
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
    initializeGenreSelection();
}

// Run the initialization when the DOM is fully loaded
// document.addEventListener('DOMContentLoaded', initializeCharacterSheet);
