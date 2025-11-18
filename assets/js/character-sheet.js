import * as data from './character-sheet/data.js';
import * as ui from './character-sheet/ui.js';
import { characterState, loadState, saveState } from './character-sheet/state.js';
import { STORAGE_KEYS } from './character-sheet/storageKeys.js';
import { StateAdapter, STATE_EVENTS } from './character-sheet/stateAdapter.js';
import { RewardCalculator, Reward } from './services/RewardCalculator.js';
import { QuestHandlerFactory } from './quest-handlers/QuestHandlerFactory.js';
import { BaseQuestHandler } from './quest-handlers/BaseQuestHandler.js';
import { GAME_CONFIG } from './config/gameConfig.js';
import { parseIntOr, trimOrEmpty } from './utils/helpers.js';
import { safeGetJSON, safeSetJSON } from './utils/storage.js';

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
    const QUEST_LIST_KEY_MAP = {
        active: STORAGE_KEYS.ACTIVE_ASSIGNMENTS,
        activeAssignments: STORAGE_KEYS.ACTIVE_ASSIGNMENTS,
        completed: STORAGE_KEYS.COMPLETED_QUESTS,
        completedQuests: STORAGE_KEYS.COMPLETED_QUESTS,
        discarded: STORAGE_KEYS.DISCARDED_QUESTS,
        discardedQuests: STORAGE_KEYS.DISCARDED_QUESTS
    };
    const resolveQuestListKey = (key) => QUEST_LIST_KEY_MAP[key] || key;
    const printButton = document.getElementById('print-button');
    const levelInput = document.getElementById('level');
    const xpNeededInput = document.getElementById('xp-needed');
    const keeperBackgroundSelect = document.getElementById('keeperBackground');
    const wizardSchoolSelect = document.getElementById('wizardSchool');
    const librarySanctumSelect = document.getElementById('librarySanctum');
    const smpInput = document.getElementById('smp');
    const wearableSlotsInput = document.getElementById('wearable-slots');
    const nonWearableSlotsInput = document.getElementById('non-wearable-slots');
    const familiarSlotsInput = document.getElementById('familiar-slots');
    const itemSelect = document.getElementById('item-select');
    const addQuestButton = document.getElementById('add-quest-button');
    const cancelEditQuestButton = document.getElementById('cancel-edit-quest-button');
    const questTypeSelect = document.getElementById('new-quest-type');
    const dungeonRoomSelect = document.getElementById('dungeon-room-select');
    const dungeonEncounterSelect = document.getElementById('dungeon-encounter-select');
    const genreQuestSelect = document.getElementById('genre-quest-select');
    const sideQuestSelect = document.getElementById('side-quest-select');
    const dungeonActionContainer = document.getElementById('dungeon-action-container');
    const dungeonActionToggle = document.getElementById('dungeon-action-toggle');
    const cursePenaltySelect = document.getElementById('curse-penalty-select');
    const curseBookTitle = document.getElementById('curse-book-title');
    const addCurseButton = document.getElementById('add-curse-button');

    // --- STATE FOR EDITING ---
    let editingQuestInfo = null; // { list: 'activeAssignments', index: 0 }
    let editingCurseInfo = null; // { index: 0 }

    // --- HELPER FUNCTIONS ---
    // Initialize the completed books set from saved monthly tracking
    // This should NOT include all historical completed quests, only books completed this month
    function initializeCompletedBooksSet() {
        completedBooksSet.clear();
        // Load the monthly books set from localStorage
        const monthlyBooks = safeGetJSON(STORAGE_KEYS.MONTHLY_COMPLETED_BOOKS, []);
        monthlyBooks.forEach(bookName => completedBooksSet.add(bookName));
    }
    
    // Save the monthly completed books set to localStorage
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

        // Handle items and temp buffs
        if (rewards.items && rewards.items.length > 0) {
            rewards.items.forEach(itemName => {
                // Check if this is a temp buff first
                if (data.temporaryBuffsFromRewards[itemName]) {
                    const buffData = data.temporaryBuffsFromRewards[itemName];
                    
                    // Calculate initial monthsRemaining based on duration
                    let monthsRemaining = 0;
                    if (buffData.duration === 'two-months') {
                        monthsRemaining = 2;
                    } else if (buffData.duration === 'until-end-month') {
                        monthsRemaining = 1;
                    }
                    
                    // Add to temporary buffs
                    stateAdapter.addTemporaryBuff({
                        name: itemName,
                        description: buffData.description,
                        duration: buffData.duration,
                        monthsRemaining,
                        status: 'active'
                    });
                    
                    ui.renderTemporaryBuffs();
                    ui.updateQuestBuffsDropdown(wearableSlotsInput, nonWearableSlotsInput, familiarSlotsInput);
                }
                // Otherwise add as regular item
                else if (data.allItems[itemName]) {
                    stateAdapter.addInventoryItem({ name: itemName, ...data.allItems[itemName] });
                }
            });
        }
    }

    // Populate Curse Penalty dropdown from JSON (ordered by number)
    if (cursePenaltySelect && Array.isArray(data.curseTableDetailed)) {
        cursePenaltySelect.innerHTML = '<option value="">-- Select Curse Penalty --</option>';
        data.curseTableDetailed
            .slice()
            .sort((a, b) => (a.number || 0) - (b.number || 0))
            .forEach(curse => {
                if (!curse || !curse.name) return;
                const opt = document.createElement('option');
                opt.value = curse.name;
                if (typeof curse.number === 'number') {
                    opt.textContent = `${curse.number}. ${curse.name}`;
                } else {
                    opt.textContent = curse.name;
                }
                cursePenaltySelect.appendChild(opt);
            });
    }

    // --- EVENT LISTENERS ---
    levelInput.addEventListener('change', () => {
        ui.updateXpNeeded(levelInput, xpNeededInput);
        ui.renderPermanentBonuses(levelInput);
    });

    const onSanctumChange = () => {
        ui.renderBenefits(wizardSchoolSelect, librarySanctumSelect, keeperBackgroundSelect);
        ui.renderAtmosphericBuffs(librarySanctumSelect);
    };
    keeperBackgroundSelect.addEventListener('change', () => {
        ui.renderBenefits(wizardSchoolSelect, librarySanctumSelect, keeperBackgroundSelect);
        ui.renderAtmosphericBuffs(librarySanctumSelect); // Re-render to show Grove Tender's automatic buff
        ui.updateQuestBuffsDropdown(wearableSlotsInput, nonWearableSlotsInput, familiarSlotsInput); // Update dropdown with new background bonuses
        saveState(form);
    });
    wizardSchoolSelect.addEventListener('change', () => {
        ui.renderBenefits(wizardSchoolSelect, librarySanctumSelect, keeperBackgroundSelect);
        saveState(form);
    });
    librarySanctumSelect.addEventListener('change', () => {
        onSanctumChange();
        saveState(form);
    });
    smpInput.addEventListener('input', () => ui.renderMasteryAbilities(smpInput));
    
    const renderLoadout = () => {
        ui.renderLoadout(wearableSlotsInput, nonWearableSlotsInput, familiarSlotsInput);
        ui.updateQuestBuffsDropdown(wearableSlotsInput, nonWearableSlotsInput, familiarSlotsInput);
    };
    wearableSlotsInput.addEventListener('change', renderLoadout);
    nonWearableSlotsInput.addEventListener('change', renderLoadout);
    familiarSlotsInput.addEventListener('change', renderLoadout);
    
    document.getElementById('learn-ability-button').addEventListener('click', () => {
        const abilityName = document.getElementById('ability-select').value;
        if (!abilityName) return;
        const ability = data.masteryAbilities[abilityName];
        let currentSmp = parseIntOr(smpInput.value, 0);
        if (currentSmp >= ability.cost) {
            smpInput.value = currentSmp - ability.cost;
            stateAdapter.addLearnedAbility(abilityName);
            ui.renderMasteryAbilities(smpInput);
            saveState(form);
        } else {
            alert('Not enough School Mastery Points to learn this ability!');
        }
    });

    document.getElementById('add-item-button').addEventListener('click', () => {
        const itemName = itemSelect.value;
        if (itemName && data.allItems[itemName]) {
            stateAdapter.addInventoryItem({ name: itemName, ...data.allItems[itemName] });
            renderLoadout();
            // Update quest buffs dropdown in case user wants to assign this new item
            ui.updateQuestBuffsDropdown(wearableSlotsInput, nonWearableSlotsInput, familiarSlotsInput);
            saveState(form);
        }
    });

    questTypeSelect.addEventListener('change', () => {
        const standardContainer = document.getElementById('standard-prompt-container');
        const dungeonContainer = document.getElementById('dungeon-prompt-container');
        const genreContainer = document.getElementById('genre-prompt-container');
        const sideContainer = document.getElementById('side-prompt-container');

        // Hide all prompt containers by default
        standardContainer.style.display = 'none';
        dungeonContainer.style.display = 'none';
        genreContainer.style.display = 'none';
        sideContainer.style.display = 'none';
        dungeonEncounterSelect.style.display = 'none'; // Always hide encounter on type change
        dungeonActionContainer.style.display = 'none'; // Always hide action toggle on type change

        const selectedType = questTypeSelect.value;

        if (selectedType === '♠ Dungeon Crawl') {
            dungeonContainer.style.display = 'flex';
            dungeonRoomSelect.innerHTML = '<option value="">-- Select a Room --</option>';
            for (const roomNumber in data.dungeonRooms) {
                const option = document.createElement('option');
                option.value = roomNumber;
                option.textContent = `${roomNumber}: ${data.dungeonRooms[roomNumber].challenge.split(':')[0]}`;
                dungeonRoomSelect.appendChild(option);
            }
        } else if (selectedType === '♥ Organize the Stacks') {
            genreContainer.style.display = 'flex';
            updateGenreQuestDropdown();
        } else if (selectedType === '♣ Side Quest') {
            sideContainer.style.display = 'flex';
            sideQuestSelect.innerHTML = '<option value="">-- Select a Side Quest --</option>';
            for (const key in data.sideQuests) {
                const option = document.createElement('option');
                option.value = data.sideQuests[key];
                option.textContent = `${key}: ${data.sideQuests[key].split(':')[0]}`;
                sideQuestSelect.appendChild(option);
            }
        } else if (selectedType === '⭐ Extra Credit') {
            // Extra Credit doesn't need a prompt - hide all prompt containers
            // standardContainer remains hidden
        } else {
            // Show standard text input for empty or other types
            standardContainer.style.display = 'flex';
        }
    });

    dungeonRoomSelect.addEventListener('change', () => {
        const selectedRoomNumber = dungeonRoomSelect.value;
        dungeonEncounterSelect.innerHTML = '<option value="">-- Select an Encounter --</option>';

        if (selectedRoomNumber && Object.keys(data.dungeonRooms[selectedRoomNumber].encounters).length > 0) {
            for (const encounterName in data.dungeonRooms[selectedRoomNumber].encounters) {
                const option = document.createElement('option');
                option.value = encounterName;
                option.textContent = encounterName;
                dungeonEncounterSelect.appendChild(option);
            }
            dungeonEncounterSelect.style.display = 'block';
        } else {
            dungeonEncounterSelect.style.display = 'none';
        }
        dungeonActionContainer.style.display = 'none'; // Hide toggle when room changes
    });

    dungeonEncounterSelect.addEventListener('change', () => {
        const roomNumber = dungeonRoomSelect.value;
        const encounterName = dungeonEncounterSelect.value;
        if (!roomNumber || !encounterName) {
            dungeonActionContainer.style.display = 'none';
            return;
        }

        const encounterData = data.dungeonRooms[roomNumber].encounters[encounterName];
        if (encounterData.defeat && encounterData.befriend) {
            dungeonActionContainer.style.display = 'flex';
        } else {
            dungeonActionContainer.style.display = 'none';
        }
    });

    dungeonActionToggle.addEventListener('change', () => {
        const label = document.getElementById('dungeon-action-label');
        label.textContent = dungeonActionToggle.checked ? 'Befriend' : 'Defeat';
    });

    function resetQuestForm() {
        // Clear form fields
        document.getElementById('new-quest-prompt').value = '';
        document.getElementById('new-quest-book').value = '';
        document.getElementById('new-quest-notes').value = '';
        // Reset month/year if desired, or leave them for convenience
        // document.getElementById('quest-month').value = '';
        dungeonRoomSelect.innerHTML = '<option value="">-- Select a Room --</option>';
        dungeonEncounterSelect.innerHTML = '<option value="">-- Select an Encounter --</option>';
        genreQuestSelect.innerHTML = '<option value="">-- Select a Genre Quest --</option>';
        sideQuestSelect.innerHTML = '<option value="">-- Select a Side Quest --</option>';
        dungeonActionContainer.style.display = 'none';
        // document.getElementById('quest-year').value = '';

        // Clear buff selection
        const buffsSelect = document.getElementById('quest-buffs-select');
        if (buffsSelect) {
            Array.from(buffsSelect.options).forEach(option => option.selected = false);
        }

        // Reset editing state
        editingQuestInfo = null;
        addQuestButton.textContent = 'Add Quest';
        document.getElementById('new-quest-status').style.display = 'inline-block';
        cancelEditQuestButton.style.display = 'none';
        addQuestButton.style.width = '100%';

        // Reset prompt visibility
        document.getElementById('standard-prompt-container').style.display = 'flex';
        document.getElementById('genre-prompt-container').style.display = 'none';
        document.getElementById('side-prompt-container').style.display = 'none';
        document.getElementById('dungeon-prompt-container').style.display = 'none';
    }

    addQuestButton.addEventListener('click', () => {
        const type = questTypeSelect.value;
        const book = document.getElementById('new-quest-book').value;
        const notes = document.getElementById('new-quest-notes').value;
        const month = document.getElementById('quest-month').value;
        const year = document.getElementById('quest-year').value;
        
        // Get selected buffs from multi-select
        const buffsSelect = document.getElementById('quest-buffs-select');
        const selectedBuffs = Array.from(buffsSelect.selectedOptions).map(option => option.value);
        
        let prompt = '';

        if (editingQuestInfo) {
            // Update quest using helper method for prompt determination
            const originalQuestList = characterState[resolveQuestListKey(editingQuestInfo.list)] || [];
            const originalQuest = originalQuestList[editingQuestInfo.index];
            if (!originalQuest) {
                resetQuestForm();
                return;
            }
            
            const formElements = {
                dungeonRoomSelect,
                dungeonEncounterSelect,
                dungeonActionToggle,
                genreQuestSelect,
                sideQuestSelect,
                promptInput: document.getElementById('new-quest-prompt')
            };
            
            // Use BaseQuestHandler to determine the correct prompt
            prompt = BaseQuestHandler.determinePromptForEdit(type, originalQuest, formElements, data);

            // Update the quest in the state
            stateAdapter.updateQuest(
                resolveQuestListKey(editingQuestInfo.list),
                editingQuestInfo.index,
                {
                    month,
                    year,
                    type,
                    prompt,
                    book,
                    notes,
                    buffs: selectedBuffs
                }
            );
            
            // Re-render the appropriate list
            const renderMap = {
                activeAssignments: () => ui.renderActiveAssignments(),
                completedQuests: () => ui.renderCompletedQuests(),
                discardedQuests: () => ui.renderDiscardedQuests()
            };
            
            if (renderMap[editingQuestInfo.list]) {
                renderMap[editingQuestInfo.list]();
            }

            resetQuestForm();
        } else {
            // Add new quest using handler pattern
            try {
                // Create form elements object for handler
                const formElements = {
                    monthInput: document.getElementById('quest-month'),
                    yearInput: document.getElementById('quest-year'),
                    bookInput: document.getElementById('new-quest-book'),
                    notesInput: document.getElementById('new-quest-notes'),
                    statusSelect: document.getElementById('new-quest-status'),
                    buffsSelect: document.getElementById('quest-buffs-select'),
                    backgroundSelect: keeperBackgroundSelect,
                    dungeonRoomSelect,
                    dungeonEncounterSelect,
                    dungeonActionToggle,
                    genreQuestSelect,
                    sideQuestSelect
                };

                // Get handler for quest type
                const handler = QuestHandlerFactory.getHandler(type, formElements, data);

                // Validate form
                const validation = handler.validate();
                if (!validation.valid) {
                    alert(validation.error);
                    return;
                }

                // Create quests
                const quests = handler.createQuests();
                const status = formElements.statusSelect.value;

                // Add quests to appropriate list
                if (status === 'active') {
                    stateAdapter.addActiveQuests(quests);
                    ui.renderActiveAssignments();
                } else if (status === 'completed') {
                    // Track if this is a new book
                    const bookName = trimOrEmpty(book);
                    const isNewBook = bookName && !completedBooksSet.has(bookName);

                    // Add to completed quests
                    stateAdapter.addCompletedQuests(quests);
                    quests.forEach(quest => {
                        updateCurrency(quest.rewards);
                    });

                    // Update book counter if new book
                    if (isNewBook) {
                        completedBooksSet.add(bookName);
                        saveCompletedBooksSet();
                        
                        const booksCompleted = document.getElementById('books-completed-month');
                        if (booksCompleted) {
                            const currentBooks = parseIntOr(booksCompleted.value, 0);
                            booksCompleted.value = currentBooks + 1;
                        }
                    }

                    ui.renderCompletedQuests();
                    ui.renderLoadout(wearableSlotsInput, nonWearableSlotsInput, familiarSlotsInput);
                }

                saveState(form);
                resetQuestForm();
            } catch (error) {
                console.error('Error adding quest:', error);
                alert(`Error adding quest: ${error.message}`);
            }
        }

        saveState(form);
        resetQuestForm(); // Clear form after adding
    });
    
    cancelEditQuestButton.addEventListener('click', resetQuestForm);

    // --- CURSE FUNCTIONALITY ---
    function resetCurseForm() {
        cursePenaltySelect.value = '';
        curseBookTitle.value = '';
        editingCurseInfo = null;
        addCurseButton.textContent = 'Add Curse';
    }

    addCurseButton.addEventListener('click', () => {
        const curseName = cursePenaltySelect.value;
        const bookTitle = curseBookTitle.value;
        
        if (!curseName) {
            alert('Please select a curse penalty.');
            return;
        }

        if (editingCurseInfo !== null) {
            // Editing existing curse
            const curseData = data.curseTable[curseName];
            stateAdapter.updateActiveCurse(editingCurseInfo.index, {
                name: curseName,
                requirement: curseData.requirement,
                book: bookTitle
            });
            ui.renderActiveCurses();
            saveState(form);
            resetCurseForm();
        } else {
            // Adding new curse
            const curseData = data.curseTable[curseName];
            stateAdapter.addActiveCurse({
                name: curseName,
                requirement: curseData.requirement,
                book: bookTitle
            });
            ui.renderActiveCurses();
            saveState(form);
            resetCurseForm();
        }
    });

    // --- TEMPORARY BUFFS FUNCTIONALITY ---
    const tempBuffNameInput = document.getElementById('temp-buff-name');
    const tempBuffDescInput = document.getElementById('temp-buff-description');
    const tempBuffDurationSelect = document.getElementById('temp-buff-duration');
    const addTempBuffButton = document.getElementById('add-temp-buff-button');

    // Add custom buff
    if (addTempBuffButton) {
        addTempBuffButton.addEventListener('click', () => {
            const name = trimOrEmpty(tempBuffNameInput.value);
            const description = trimOrEmpty(tempBuffDescInput.value);
            const duration = tempBuffDurationSelect.value;

            if (!name || !description) {
                alert('Please enter both a name and description for the buff.');
                return;
            }

            // Calculate initial monthsRemaining based on duration
            let monthsRemaining = 0;
            if (duration === 'two-months') {
                monthsRemaining = 2;
            } else if (duration === 'until-end-month') {
                monthsRemaining = 1;
            }

            stateAdapter.addTemporaryBuff({
                name,
                description,
                duration,
                monthsRemaining,
                status: 'active'
            });

            // Clear inputs
            tempBuffNameInput.value = '';
            tempBuffDescInput.value = '';
            tempBuffDurationSelect.value = 'two-months';

            ui.renderTemporaryBuffs();
            ui.updateQuestBuffsDropdown(wearableSlotsInput, nonWearableSlotsInput, familiarSlotsInput);
            saveState(form);
        });
    }

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


    function updateGenreQuestDropdown() {
        if (!genreQuestSelect) return;
        
        genreQuestSelect.innerHTML = '<option value="">-- Select a Genre Quest --</option>';
        
        const selectedGenres = stateAdapter.getSelectedGenres();

        if (selectedGenres.length > 0) {
            selectedGenres.forEach((genre, index) => {
                const option = document.createElement('option');
                option.value = `${genre}: ${data.allGenres[genre]}`;
                option.textContent = `${index + 1}: ${genre}`;
                genreQuestSelect.appendChild(option);
            });
        } else {
            // Fallback to default genres
            for (const key in data.genreQuests) {
                const option = document.createElement('option');
                option.value = `${data.genreQuests[key].genre}: ${data.genreQuests[key].description}`;
                option.textContent = `${key}: ${data.genreQuests[key].genre}`;
                genreQuestSelect.appendChild(option);
            }
        }
    }



    form.addEventListener('submit', (e) => { e.preventDefault(); saveState(form); alert('Character sheet saved!'); });
    printButton.addEventListener('click', () => window.print());

    form.addEventListener('click', (e) => {
        // Handle buff active checkbox clicks
        if (e.target.classList.contains('buff-active-check')) {
            const buffName = e.target.dataset.buffName;
            
            // Grove Tender's "Soaking in Nature" is always active and can't be toggled
            const background = keeperBackgroundSelect ? keeperBackgroundSelect.value : '';
            if (background === 'groveTender' && buffName === 'The Soaking in Nature') {
                e.target.checked = true; // Keep it checked
                return;
            }
            
            stateAdapter.setAtmosphericBuffActive(buffName, e.target.checked);
            // No need to save state on every check, it's temporary for the day
            return; // prevent other handlers from firing
        }

        // Handle other clicks
        const target = e.target;
        if (target.dataset.index === undefined) return;
        const index = parseIntOr(target.dataset.index, 0);

        if (target.classList.contains('delete-ability-btn')) {
            const learnedAbilities = stateAdapter.getLearnedAbilities();
            const abilityName = learnedAbilities[index];
            if (confirm(`Are you sure you want to forget "${abilityName}"? This will refund ${data.masteryAbilities[abilityName].cost} SMP.`)) {
                let currentSmp = parseIntOr(smpInput.value, 0);
                smpInput.value = currentSmp + data.masteryAbilities[abilityName].cost;
                stateAdapter.removeLearnedAbility(index);
                ui.renderMasteryAbilities(smpInput);
                saveState(form);
            }
        } else if (target.classList.contains('equip-btn')) {
            const inventoryItems = stateAdapter.getInventoryItems();
            const itemToEquip = inventoryItems[index];
            if (!itemToEquip) return;
            const slotLimits = ui.getSlotLimits(wearableSlotsInput, nonWearableSlotsInput, familiarSlotsInput);
            const equippedCountForType = stateAdapter.getEquippedItems().filter(item => item.type === itemToEquip.type).length;
            if (equippedCountForType < slotLimits[itemToEquip.type]) {
                if (stateAdapter.moveInventoryItemToEquipped(index)) {
                    renderLoadout();
                    ui.updateQuestBuffsDropdown(wearableSlotsInput, nonWearableSlotsInput, familiarSlotsInput);
                    saveState(form);
                }
            } else {
                alert(`No empty ${itemToEquip.type} slots available!`);
            }
        } else if (target.classList.contains('unequip-btn')) {
            if (stateAdapter.moveEquippedItemToInventory(index)) {
                renderLoadout();
                ui.updateQuestBuffsDropdown(wearableSlotsInput, nonWearableSlotsInput, familiarSlotsInput);
                saveState(form);
            }
        } else if (target.classList.contains('delete-item-btn')) {
            const inventoryItems = stateAdapter.getInventoryItems();
            const itemName = inventoryItems[index] ? inventoryItems[index].name : 'this item';
            if (confirm(`Are you sure you want to permanently delete ${itemName}?`)) {
                stateAdapter.removeInventoryItem(index);
                renderLoadout();
                saveState(form);
            }
        } else if (target.classList.contains('complete-quest-btn')) {
            const questToMove = stateAdapter.removeQuest(STORAGE_KEYS.ACTIVE_ASSIGNMENTS, index);
            if (!questToMove) return;
            
            // Check if this is a new book
            const bookName = trimOrEmpty(questToMove.book);
            const isNewBook = bookName && !completedBooksSet.has(bookName);
            
            // Use the BaseQuestHandler helper to finalize rewards
            const background = keeperBackgroundSelect ? keeperBackgroundSelect.value : '';
            const completedQuest = BaseQuestHandler.completeActiveQuest(questToMove, background);
            
            // Add to completed quests
            stateAdapter.addCompletedQuests(completedQuest);
            
            // Add to completed books set if it's a new book
            if (isNewBook) {
                completedBooksSet.add(bookName);
                saveCompletedBooksSet();
            }
            
            // Update currency with finalized rewards
            updateCurrency(completedQuest.rewards);
            ui.renderLoadout(wearableSlotsInput, nonWearableSlotsInput, familiarSlotsInput);
            
            // Increment books completed counter only if this is a new book
            if (isNewBook) {
                const booksCompleted = document.getElementById('books-completed-month');
                if (booksCompleted) {
                    const currentBooks = parseIntOr(booksCompleted.value, 0);
                    booksCompleted.value = currentBooks + 1;
                }
            }
            
            ui.renderActiveAssignments();
            ui.renderCompletedQuests();
            saveState(form);
        } else if (target.classList.contains('discard-quest-btn')) {
            const questToMove = stateAdapter.removeQuest(STORAGE_KEYS.ACTIVE_ASSIGNMENTS, index);
            if (!questToMove) return;
            stateAdapter.addDiscardedQuests(questToMove);
            ui.renderActiveAssignments();
            ui.renderDiscardedQuests();
            saveState(form);
        } else if (target.classList.contains('delete-btn')) {
            const list = target.dataset.list;
            const storageKey = resolveQuestListKey(list);
            if (storageKey === STORAGE_KEYS.ACTIVE_ASSIGNMENTS) {
                stateAdapter.removeQuest(storageKey, index); ui.renderActiveAssignments();
            } else if (storageKey === STORAGE_KEYS.COMPLETED_QUESTS) {
                stateAdapter.removeQuest(storageKey, index); ui.renderCompletedQuests();
            } else if (storageKey === STORAGE_KEYS.DISCARDED_QUESTS) {
                stateAdapter.removeQuest(storageKey, index); ui.renderDiscardedQuests();
            }
            saveState(form);
        } else if (target.classList.contains('edit-quest-btn')) {
            const list = target.dataset.list;
            const index = parseInt(target.dataset.index, 10);
            const storageKey = resolveQuestListKey(list);
            const questList = characterState[storageKey] || [];
            const quest = questList[index];
            if (!quest) return;

            // Populate form
            document.getElementById('quest-month').value = quest.month;
            document.getElementById('quest-year').value = quest.year;
            document.getElementById('new-quest-type').value = quest.type;
            document.getElementById('new-quest-prompt').value = quest.prompt;
            document.getElementById('new-quest-book').value = quest.book;
            document.getElementById('new-quest-notes').value = quest.notes;
            
            // Populate buffs selection
            const buffsSelect = document.getElementById('quest-buffs-select');
            if (buffsSelect && quest.buffs) {
                Array.from(buffsSelect.options).forEach(option => {
                    option.selected = quest.buffs.includes(option.value);
                });
            }

            // Trigger change to show correct prompt containers
            questTypeSelect.dispatchEvent(new Event('change'));

            // Show correct prompt field for editing
            if (quest.type === '♠ Dungeon Crawl') {
                // Find the room number based on the challenge text
                const roomNumber = Object.keys(data.dungeonRooms).find(key => {
                    if (data.dungeonRooms[key].challenge === quest.prompt) return true;
                    for (const encounterName in data.dungeonRooms[key].encounters) {
                        const encounter = data.dungeonRooms[key].encounters[encounterName];
                        if (encounter.defeat === quest.prompt || encounter.befriend === quest.prompt) {
                            return true;
                        }
                    }
                    return false;
                });

                if (roomNumber) {
                    dungeonRoomSelect.value = roomNumber;
                    // Trigger change to populate encounters
                    dungeonRoomSelect.dispatchEvent(new Event('change'));

                    // If it's an encounter quest, select the encounter
                    if (quest.isEncounter) {
                        const encounterName = quest.prompt?.split(':')[0];
                        dungeonEncounterSelect.value = encounterName;
                        dungeonEncounterSelect.dispatchEvent(new Event('change'));
                    }
                }
            } else if (quest.type === '♥ Organize the Stacks') {
                genreQuestSelect.value = quest.prompt;
            } else if (quest.type === '♣ Side Quest') {
                sideQuestSelect.value = quest.prompt;
            }

            // Set editing state
            editingQuestInfo = { list, index };
            addQuestButton.textContent = 'Update Quest';
            document.getElementById('new-quest-status').style.display = 'none'; // Hide status dropdown
            cancelEditQuestButton.style.display = 'inline-block';
            addQuestButton.style.width = '50%';
            cancelEditQuestButton.style.width = '50%';

            if (typeof addQuestButton.scrollIntoView === 'function') {
                addQuestButton.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
        } else if (target.classList.contains('complete-curse-btn')) {
            stateAdapter.moveCurseToCompleted(index);
            
            // Completing a curse removes the penalty - no rewards are granted

            ui.renderActiveCurses();
            ui.renderCompletedCurses();
            saveState(form);
        } else if (target.classList.contains('edit-curse-btn')) {
            const activeCurses = stateAdapter.getActiveCurses();
            const curse = activeCurses[index];
            cursePenaltySelect.value = curse.name;
            curseBookTitle.value = curse.book || '';
            editingCurseInfo = { index };
            addCurseButton.textContent = 'Update Curse';
            // Don't save state here - just populate the form
        } else if (target.classList.contains('delete-curse-btn')) {
            const list = target.dataset.list;
            if (list === 'completed') {
                if (confirm(`Are you sure you want to delete this completed curse penalty?`)) {
                    stateAdapter.removeCompletedCurse(index);
                    ui.renderCompletedCurses();
                    saveState(form);
                }
            } else {
                if (confirm(`Are you sure you want to delete this curse penalty?`)) {
                    stateAdapter.removeActiveCurse(index);
                    ui.renderActiveCurses();
                    saveState(form);
                }
            }
        } else if (target.classList.contains('mark-buff-used-btn')) {
            const buffIndex = parseIntOr(target.dataset.index, 0);
            const temporaryBuffs = stateAdapter.getTemporaryBuffs();
            if (temporaryBuffs[buffIndex]) {
                stateAdapter.updateTemporaryBuff(buffIndex, { status: 'used' });
                ui.renderTemporaryBuffs();
                ui.updateQuestBuffsDropdown(wearableSlotsInput, nonWearableSlotsInput, familiarSlotsInput);
                saveState(form);
            }
        } else if (target.classList.contains('remove-buff-btn')) {
            const buffIndex = parseIntOr(target.dataset.index, 0);
            if (confirm('Are you sure you want to remove this buff?')) {
                stateAdapter.removeTemporaryBuff(buffIndex);
                ui.renderTemporaryBuffs();
                ui.updateQuestBuffsDropdown(wearableSlotsInput, nonWearableSlotsInput, familiarSlotsInput);
                saveState(form);
            }
        }
    }); // End of form event listener

    document.getElementById('atmospheric-buffs-body').addEventListener('input', (e) => {
        if (e.target.classList.contains('buff-days-input')) {
            const buffName = e.target.dataset.buffName;
            const daysUsed = parseIntOr(e.target.value, 0);

            stateAdapter.setAtmosphericBuffDaysUsed(buffName, daysUsed);
            ui.updateBuffTotal(e.target);
        }
    });

    // End of Month button - processes atmospheric buffs and book completion XP
    // Centralized End of Month handler function
    const handleEndOfMonth = () => {
        const selectedSanctum = librarySanctumSelect.value;
        const associatedBuffs = (selectedSanctum && data.sanctumBenefits[selectedSanctum]?.associatedBuffs) || [];
        const atmosphericBuffs = stateAdapter.getAtmosphericBuffs();
        const background = keeperBackgroundSelect ? keeperBackgroundSelect.value : '';
        
        // Calculate atmospheric buff rewards using RewardCalculator
        const atmosphericRewards = RewardCalculator.calculateAtmosphericBuffRewards(atmosphericBuffs, associatedBuffs);
        
        // Reset atmospheric buffs (keep Grove Tender's "Soaking in Nature" active)
        for (const buffName in atmosphericBuffs) {
            const isGroveTenderBuff = background === 'groveTender' && buffName === 'The Soaking in Nature';
            if (isGroveTenderBuff) {
                stateAdapter.setAtmosphericBuffDaysUsed(buffName, 0);
                // Keep it active (already set)
            } else {
                stateAdapter.updateAtmosphericBuff(buffName, { daysUsed: 0, isActive: false });
            }
        }
        
        // Apply atmospheric buff ink drops
        updateCurrency(atmosphericRewards);
        
        // Calculate and add book completion XP using RewardCalculator
        const booksCompletedInput = document.getElementById('books-completed-month');
        if (booksCompletedInput) {
            const booksCompleted = parseIntOr(booksCompletedInput.value, 0);
            const bookRewards = RewardCalculator.calculateBookCompletionRewards(booksCompleted);
            
            updateCurrency(bookRewards);
            
            // Reset books completed counter to 0
            booksCompletedInput.value = 0;
        }
        
        // Calculate and add journal entries paper scraps using RewardCalculator
        const journalEntriesInput = document.getElementById('journal-entries-completed');
        if (journalEntriesInput) {
            const journalEntries = parseIntOr(journalEntriesInput.value, 0);
            const journalRewards = RewardCalculator.calculateJournalEntryRewards(journalEntries, background);
            
            if (journalRewards.paperScraps > 0) {
                updateCurrency(journalRewards);
                
                // Show notification of bonus if applicable
                if (background === 'scribe') {
                    const papersPerEntry = GAME_CONFIG.endOfMonth.journalEntry.basePaperScraps + 
                                          GAME_CONFIG.endOfMonth.journalEntry.scribeBonus;
                    alert(`Journal entries rewarded: ${journalRewards.paperScraps} Paper Scraps (${journalEntries} × ${papersPerEntry} with Scribe's Acolyte bonus)`);
                }
            }
            
            // Reset journal entries counter to 0
            journalEntriesInput.value = 0;
        }
        
        // Clear the completed books set for the new month
        completedBooksSet.clear();
        saveCompletedBooksSet(); // Save the cleared set
        
        // Process temporary buffs - decrement monthsRemaining and remove expired
        const temporaryBuffs = stateAdapter.getTemporaryBuffs();
        if (temporaryBuffs && temporaryBuffs.length > 0) {
            // Filter out expired buffs and update state
            const activeBuffs = temporaryBuffs
                .map(buff => ({ ...buff })) // Create a copy to avoid mutating the original
                .filter(buff => {
                    // Remove one-time buffs that were used
                    if (buff.duration === 'one-time' && buff.status === 'used') {
                        return false;
                    }
                    
                    // Remove end-of-month buffs
                    if (buff.duration === 'until-end-month') {
                        return false;
                    }
                    
                    // Decrement two-month buffs
                    if (buff.duration === 'two-months' && buff.monthsRemaining > 0) {
                        buff.monthsRemaining--;
                        // Remove if no months remaining
                        if (buff.monthsRemaining === 0) {
                            return false;
                        }
                    }
                    
                    return true;
                });
            
            // Replace the entire list with the filtered/updated buffs
            stateAdapter._replaceList(STORAGE_KEYS.TEMPORARY_BUFFS, activeBuffs);
            
            // Increment buff month counter
            stateAdapter.incrementBuffMonthCounter();
        }
        
        // Re-render the atmospheric buffs table to show 0 days used
        ui.renderAtmosphericBuffs(librarySanctumSelect);
        ui.renderTemporaryBuffs();
        ui.updateQuestBuffsDropdown(wearableSlotsInput, nonWearableSlotsInput, familiarSlotsInput);
        saveState(form);
        
        alert('End of Month processed! Rewards distributed and counters reset.');
    };
    
    // Attach the handler to all "End of Month" buttons
    const endOfMonthButtons = document.querySelectorAll('.end-of-month-button');
    endOfMonthButtons.forEach(button => {
        button.addEventListener('click', handleEndOfMonth);
    });

    if(itemSelect) {
        for (const name in data.allItems) {
            const option = document.createElement('option');
            option.value = name;
            option.textContent = name;
            itemSelect.appendChild(option);
        }
    }
    
    // Populate keeper background dropdown
    ui.populateBackgroundDropdown();
    // Populate wizard school dropdown from JSON
    if (wizardSchoolSelect && data.schoolBenefits) {
        wizardSchoolSelect.innerHTML = '<option value="">-- Select a School --</option>';
        Object.keys(data.schoolBenefits).forEach(schoolName => {
            const opt = document.createElement('option');
            opt.value = schoolName;
            opt.textContent = schoolName;
            wizardSchoolSelect.appendChild(opt);
        });
    }
    // Populate library sanctum dropdown from JSON
    if (librarySanctumSelect && data.sanctumBenefits) {
        librarySanctumSelect.innerHTML = '<option value="">-- Select a Sanctum --</option>';
        Object.keys(data.sanctumBenefits).forEach(sanctumName => {
            const opt = document.createElement('option');
            opt.value = sanctumName;
            opt.textContent = sanctumName;
            librarySanctumSelect.appendChild(opt);
        });
    }
    
    // Initial Load
    loadState(form);
    initializeCompletedBooksSet();
    ui.renderAll(levelInput, xpNeededInput, wizardSchoolSelect, librarySanctumSelect, smpInput, wearableSlotsInput, nonWearableSlotsInput, familiarSlotsInput);
    initializeGenreSelection();
}

// Run the initialization when the DOM is fully loaded
// document.addEventListener('DOMContentLoaded', initializeCharacterSheet);