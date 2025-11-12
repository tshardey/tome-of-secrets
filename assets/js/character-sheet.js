import * as data from './character-sheet/data.js';
import * as ui from './character-sheet/ui.js';
import { characterState, loadState, saveState } from './character-sheet/state.js';
import { STORAGE_KEYS } from './character-sheet/storageKeys.js';
import { RewardCalculator, Reward } from './services/RewardCalculator.js';
import { QuestHandlerFactory } from './quest-handlers/QuestHandlerFactory.js';
import { BaseQuestHandler } from './quest-handlers/BaseQuestHandler.js';

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
        const monthlyBooks = JSON.parse(localStorage.getItem(STORAGE_KEYS.MONTHLY_COMPLETED_BOOKS)) || [];
        monthlyBooks.forEach(bookName => completedBooksSet.add(bookName));
    }
    
    // Save the monthly completed books set to localStorage
    function saveCompletedBooksSet() {
        const booksArray = Array.from(completedBooksSet);
        localStorage.setItem(STORAGE_KEYS.MONTHLY_COMPLETED_BOOKS, JSON.stringify(booksArray));
    }

    function updateCurrency(rewards) {
        if (!rewards) return;
        const xpCurrent = document.getElementById('xp-current');
        const inkDrops = document.getElementById('inkDrops');
        const paperScraps = document.getElementById('paperScraps');
        
        if (xpCurrent && rewards.xp > 0) {
            const currentXP = parseInt(xpCurrent.value, 10) || 0;
            xpCurrent.value = currentXP + rewards.xp;
        }
        
        if (inkDrops && rewards.inkDrops > 0) {
            const currentInk = parseInt(inkDrops.value, 10) || 0;
            inkDrops.value = currentInk + rewards.inkDrops;
        }
        
        if (paperScraps && rewards.paperScraps > 0) {
            const currentPaper = parseInt(paperScraps.value, 10) || 0;
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
                    characterState.temporaryBuffs.push({
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
                    characterState.inventoryItems.push({ name: itemName, ...data.allItems[itemName] });
                }
            });
        }
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
        let currentSmp = parseInt(smpInput.value, 10) || 0;
        if (currentSmp >= ability.cost) {
            smpInput.value = currentSmp - ability.cost;
            characterState.learnedAbilities.push(abilityName);
            ui.renderMasteryAbilities(smpInput);
            saveState(form);
        } else {
            alert('Not enough School Mastery Points to learn this ability!');
        }
    });

    document.getElementById('add-item-button').addEventListener('click', () => {
        const itemName = itemSelect.value;
        if (itemName && data.allItems[itemName]) {
            characterState.inventoryItems.push({ name: itemName, ...data.allItems[itemName] });
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
            const originalQuest = characterState[editingQuestInfo.list][editingQuestInfo.index];
            
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
            Object.assign(originalQuest, { 
                month, 
                year, 
                type, 
                prompt, 
                book, 
                notes, 
                buffs: selectedBuffs 
            });
            
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
                    quests.forEach(quest => characterState.activeAssignments.push(quest));
                    ui.renderActiveAssignments();
                } else if (status === 'completed') {
                    // Track if this is a new book
                    const bookName = book ? book.trim() : '';
                    const isNewBook = bookName && !completedBooksSet.has(bookName);

                    // Add to completed quests
                    quests.forEach(quest => {
                        characterState.completedQuests.push(quest);
                        // Update currency with the quest's rewards
                        updateCurrency(quest.rewards);
                    });

                    // Update book counter if new book
                    if (isNewBook) {
                        completedBooksSet.add(bookName);
                        saveCompletedBooksSet();
                        
                        const booksCompleted = document.getElementById('books-completed-month');
                        if (booksCompleted) {
                            const currentBooks = parseInt(booksCompleted.value, 10) || 0;
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
            characterState.activeCurses[editingCurseInfo.index] = {
                name: curseName,
                requirement: curseData.requirement,
                book: bookTitle
            };
            ui.renderActiveCurses();
            saveState(form);
            resetCurseForm();
        } else {
            // Adding new curse
            const curseData = data.curseTable[curseName];
            characterState.activeCurses.push({
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
            const name = tempBuffNameInput.value.trim();
            const description = tempBuffDescInput.value.trim();
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

            characterState.temporaryBuffs.push({
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
        // Load selected genres from localStorage (set by quests page)
        let selectedGenres = Array.isArray(characterState[STORAGE_KEYS.SELECTED_GENRES])
            ? characterState[STORAGE_KEYS.SELECTED_GENRES]
            : [];

        if (selectedGenres.length === 0) {
            try {
                selectedGenres = JSON.parse(localStorage.getItem(STORAGE_KEYS.SELECTED_GENRES) || '[]');
            } catch (e) {
                selectedGenres = [];
            }
            characterState[STORAGE_KEYS.SELECTED_GENRES] = selectedGenres;
        }
        
        updateGenreQuestDropdown();
        displaySelectedGenres();
    }

    function displaySelectedGenres() {
        const display = document.getElementById('selected-genres-display');
        if (!display) return;
        
        if (characterState.selectedGenres.length === 0) {
            display.innerHTML = '<p class="no-genres">No genres selected yet. <a href="{{ site.baseurl }}/quests.html">Choose your genres here</a>.</p>';
            return;
        }
        
        let html = '<div class="selected-genres-list">';
        characterState.selectedGenres.forEach((genre, index) => {
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
        
        if (characterState.selectedGenres.length > 0) {
            characterState.selectedGenres.forEach((genre, index) => {
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
            
            if (!characterState.atmosphericBuffs[buffName]) {
                characterState.atmosphericBuffs[buffName] = { daysUsed: 0, isActive: false };
            }
            characterState.atmosphericBuffs[buffName].isActive = e.target.checked;
            // No need to save state on every check, it's temporary for the day
            return; // prevent other handlers from firing
        }

        // Handle other clicks
        const target = e.target;
        if (target.dataset.index === undefined) return;
        const index = parseInt(target.dataset.index, 10);

        if (target.classList.contains('delete-ability-btn')) {
            const abilityName = characterState.learnedAbilities[index];
            if (confirm(`Are you sure you want to forget "${abilityName}"? This will refund ${data.masteryAbilities[abilityName].cost} SMP.`)) {
                let currentSmp = parseInt(smpInput.value, 10) || 0;
                smpInput.value = currentSmp + data.masteryAbilities[abilityName].cost;
                characterState.learnedAbilities.splice(index, 1);
                ui.renderMasteryAbilities(smpInput);
                saveState(form);
            }
        } else if (target.classList.contains('equip-btn')) {
            const itemToEquip = characterState.inventoryItems[index];
            const slotLimits = ui.getSlotLimits(wearableSlotsInput, nonWearableSlotsInput, familiarSlotsInput);
            const equippedCountForType = characterState.equippedItems.filter(item => item.type === itemToEquip.type).length;
            if (equippedCountForType < slotLimits[itemToEquip.type]) {
                characterState.equippedItems.push(characterState.inventoryItems.splice(index, 1)[0]);
                renderLoadout();
                ui.updateQuestBuffsDropdown(wearableSlotsInput, nonWearableSlotsInput, familiarSlotsInput);
                saveState(form);
            } else {
                alert(`No empty ${itemToEquip.type} slots available!`);
            }
        } else if (target.classList.contains('unequip-btn')) {
            characterState.inventoryItems.push(characterState.equippedItems.splice(index, 1)[0]);
            renderLoadout();
            ui.updateQuestBuffsDropdown(wearableSlotsInput, nonWearableSlotsInput, familiarSlotsInput);
            saveState(form);
        } else if (target.classList.contains('delete-item-btn')) {
            if (confirm(`Are you sure you want to permanently delete ${characterState.inventoryItems[index].name}?`)) {
                characterState.inventoryItems.splice(index, 1);
                renderLoadout();
                saveState(form);
            }
        } else if (target.classList.contains('complete-quest-btn')) {
            const questToMove = characterState.activeAssignments.splice(index, 1)[0];
            
            // Check if this is a new book
            const bookName = questToMove.book ? questToMove.book.trim() : '';
            const isNewBook = bookName && !completedBooksSet.has(bookName);
            
            // Use the BaseQuestHandler helper to finalize rewards
            const background = keeperBackgroundSelect ? keeperBackgroundSelect.value : '';
            const completedQuest = BaseQuestHandler.completeActiveQuest(questToMove, background);
            
            // Add to completed quests
            characterState.completedQuests.push(completedQuest);
            
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
                    const currentBooks = parseInt(booksCompleted.value, 10) || 0;
                    booksCompleted.value = currentBooks + 1;
                }
            }
            
            ui.renderActiveAssignments();
            ui.renderCompletedQuests();
            saveState(form);
        } else if (target.classList.contains('discard-quest-btn')) {
            const questToMove = characterState.activeAssignments.splice(index, 1)[0];
            characterState.discardedQuests.push(questToMove);
            ui.renderActiveAssignments();
            ui.renderDiscardedQuests();
            saveState(form);
        } else if (target.classList.contains('delete-btn')) {
            const list = target.dataset.list;
            if (list === 'active') {
                characterState.activeAssignments.splice(index, 1); ui.renderActiveAssignments();
            } else if (list === 'completed') {
                characterState.completedQuests.splice(index, 1); ui.renderCompletedQuests();
            } else if (list === 'discarded') {
                characterState.discardedQuests.splice(index, 1); ui.renderDiscardedQuests();
            }
            saveState(form);
        } else if (target.classList.contains('edit-quest-btn')) {
            const list = target.dataset.list;
            const index = parseInt(target.dataset.index, 10);
            const quest = characterState[list][index];

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
            const curseToMove = characterState.activeCurses.splice(index, 1)[0];
            characterState.completedCurses.push(curseToMove);
            
            // Completing a curse removes the penalty - no rewards are granted

            ui.renderActiveCurses();
            ui.renderCompletedCurses();
            saveState(form);
        } else if (target.classList.contains('edit-curse-btn')) {
            const curse = characterState.activeCurses[index];
            cursePenaltySelect.value = curse.name;
            curseBookTitle.value = curse.book || '';
            editingCurseInfo = { index };
            addCurseButton.textContent = 'Update Curse';
            // Don't save state here - just populate the form
        } else if (target.classList.contains('delete-curse-btn')) {
            const list = target.dataset.list;
            if (list === 'completed') {
                if (confirm(`Are you sure you want to delete this completed curse penalty?`)) {
                    characterState.completedCurses.splice(index, 1);
                    ui.renderCompletedCurses();
                    saveState(form);
                }
            } else {
                if (confirm(`Are you sure you want to delete this curse penalty?`)) {
                    characterState.activeCurses.splice(index, 1);
                    ui.renderActiveCurses();
                    saveState(form);
                }
            }
        } else if (target.classList.contains('mark-buff-used-btn')) {
            const buffIndex = parseInt(target.dataset.index, 10);
            if (characterState.temporaryBuffs[buffIndex]) {
                characterState.temporaryBuffs[buffIndex].status = 'used';
                ui.renderTemporaryBuffs();
                ui.updateQuestBuffsDropdown(wearableSlotsInput, nonWearableSlotsInput, familiarSlotsInput);
                saveState(form);
            }
        } else if (target.classList.contains('remove-buff-btn')) {
            const buffIndex = parseInt(target.dataset.index, 10);
            if (confirm('Are you sure you want to remove this buff?')) {
                characterState.temporaryBuffs.splice(buffIndex, 1);
                ui.renderTemporaryBuffs();
                ui.updateQuestBuffsDropdown(wearableSlotsInput, nonWearableSlotsInput, familiarSlotsInput);
                saveState(form);
            }
        }
    }); // End of form event listener

    document.getElementById('atmospheric-buffs-body').addEventListener('input', (e) => {
        if (e.target.classList.contains('buff-days-input')) {
            const buffName = e.target.dataset.buffName;
            const daysUsed = parseInt(e.target.value, 10) || 0;

            if (!characterState.atmosphericBuffs[buffName]) {
                characterState.atmosphericBuffs[buffName] = { daysUsed: 0, isActive: false };
            }
            characterState.atmosphericBuffs[buffName].daysUsed = daysUsed;
            ui.updateBuffTotal(e.target);
        }
    });

    // End of Month button - processes atmospheric buffs and book completion XP
    // Centralized End of Month handler function
    const handleEndOfMonth = () => {
        // Process atmospheric buffs to ink drops
        let totalInkDrops = 0;
        const selectedSanctum = librarySanctumSelect.value;
        const associatedBuffs = (selectedSanctum && data.sanctumBenefits[selectedSanctum]?.associatedBuffs) || [];
        
        for (const buffName in characterState.atmosphericBuffs) {
            const buff = characterState.atmosphericBuffs[buffName];
            
            // Only process buffs that were marked as active
            if (buff.isActive) {
                const isAssociated = associatedBuffs.includes(buffName);
                const dailyValue = isAssociated ? 2 : 1;
                const buffTotal = buff.daysUsed * dailyValue;
                totalInkDrops += buffTotal;
            }
            
            // Reset the days used and active status for all buffs
            buff.daysUsed = 0;
            
            // Keep Grove Tender's "Soaking in Nature" active, reset others
            const background = keeperBackgroundSelect ? keeperBackgroundSelect.value : '';
            const isGroveTenderBuff = background === 'groveTender' && buffName === 'The Soaking in Nature';
            if (!isGroveTenderBuff) {
                buff.isActive = false;
            }
        }
        
        // Add atmospheric buff ink drops
        const inkDropsInput = document.getElementById('inkDrops');
        if (inkDropsInput && totalInkDrops > 0) {
            const currentInk = parseInt(inkDropsInput.value, 10) || 0;
            inkDropsInput.value = currentInk + totalInkDrops;
        }
        
        // Calculate and add book completion XP (15 XP per unique book)
        const booksCompletedInput = document.getElementById('books-completed-month');
        if (booksCompletedInput) {
            const booksCompleted = parseInt(booksCompletedInput.value, 10) || 0;
            const bookCompletionXP = booksCompleted * 15;
            
            if (bookCompletionXP > 0) {
                const xpCurrent = document.getElementById('xp-current');
                if (xpCurrent) {
                    const currentXP = parseInt(xpCurrent.value, 10) || 0;
                    xpCurrent.value = currentXP + bookCompletionXP;
                }
            }
            
            // Reset books completed counter to 0
            booksCompletedInput.value = 0;
        }
        
        // Calculate and add journal entries paper scraps (5 Paper Scraps per entry, +3 for Scribe's Acolyte)
        const journalEntriesInput = document.getElementById('journal-entries-completed');
        if (journalEntriesInput) {
            const journalEntries = parseInt(journalEntriesInput.value, 10) || 0;
            const background = keeperBackgroundSelect ? keeperBackgroundSelect.value : '';
            
            // Base 5 Paper Scraps per entry, +3 if Scribe's Acolyte
            let papersPerEntry = 5;
            if (background === 'scribe') {
                papersPerEntry += 3;
            }
            
            const journalPaperScraps = journalEntries * papersPerEntry;
            
            if (journalPaperScraps > 0) {
                const paperScrapsInput = document.getElementById('paperScraps');
                if (paperScrapsInput) {
                    const currentPaperScraps = parseInt(paperScrapsInput.value, 10) || 0;
                    paperScrapsInput.value = currentPaperScraps + journalPaperScraps;
                }
                
                // Show notification of bonus if applicable
                if (background === 'scribe') {
                    alert(`Journal entries rewarded: ${journalPaperScraps} Paper Scraps (${journalEntries} × ${papersPerEntry} with Scribe's Acolyte bonus)`);
                }
            }
            
            // Reset journal entries counter to 0
            journalEntriesInput.value = 0;
        }
        
        // Clear the completed books set for the new month
        completedBooksSet.clear();
        saveCompletedBooksSet(); // Save the cleared set
        
        // Process temporary buffs - decrement monthsRemaining and remove expired
        if (characterState.temporaryBuffs) {
            characterState.temporaryBuffs = characterState.temporaryBuffs.filter(buff => {
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
            
            // Increment buff month counter
            characterState.buffMonthCounter = (characterState.buffMonthCounter || 0) + 1;
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
    
    // Initial Load
    loadState(form);
    initializeCompletedBooksSet();
    ui.renderAll(levelInput, xpNeededInput, wizardSchoolSelect, librarySanctumSelect, smpInput, wearableSlotsInput, nonWearableSlotsInput, familiarSlotsInput);
    initializeGenreSelection();
}

// Run the initialization when the DOM is fully loaded
// document.addEventListener('DOMContentLoaded', initializeCharacterSheet);