import * as data from './character-sheet/data.js';
import * as ui from './character-sheet/ui.js';
import { characterState, loadState, saveState } from './character-sheet/state.js';

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

    // --- EVENT LISTENERS ---
    levelInput.addEventListener('change', () => {
        ui.updateXpNeeded(levelInput, xpNeededInput);
        ui.renderPermanentBonuses(levelInput);
    });

    const onSanctumChange = () => {
        ui.renderBenefits(wizardSchoolSelect, librarySanctumSelect);
        ui.renderAtmosphericBuffs(librarySanctumSelect);
    };
    wizardSchoolSelect.addEventListener('change', () => ui.renderBenefits(wizardSchoolSelect, librarySanctumSelect));
    librarySanctumSelect.addEventListener('change', onSanctumChange);
    smpInput.addEventListener('input', () => ui.renderMasteryAbilities(smpInput));
    
    const renderLoadout = () => ui.renderLoadout(wearableSlotsInput, nonWearableSlotsInput, familiarSlotsInput);
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
        let prompt = '';

        if (editingQuestInfo) {
            // Determine the prompt source based on the quest type
            const originalQuest = characterState[editingQuestInfo.list][editingQuestInfo.index];
            prompt = originalQuest.prompt; // Default to the original prompt

            if (type === '♠ Dungeon Crawl' && originalQuest.isEncounter && dungeonEncounterSelect.value) {
                const roomNumber = dungeonRoomSelect.value;
                const encounterName = dungeonEncounterSelect.value;
                const encounterData = data.dungeonRooms[roomNumber].encounters[encounterName];
                
                if (encounterData.defeat && encounterData.befriend) {
                    prompt = dungeonActionToggle.checked ? encounterData.befriend : encounterData.defeat;
                } else {
                    prompt = encounterData.defeat || encounterData.befriend;
                }

            } else if (type === '♠ Dungeon Crawl') {
                const roomNumber = dungeonRoomSelect.value;
                if (roomNumber) {
                    // If a new room was selected, update the prompt
                    prompt = data.dungeonRooms[roomNumber].challenge;
                }
            }
            else if (type === '♥ Organize the Stacks') {
                prompt = genreQuestSelect.value;
            } else if (type === '♣ Side Quest') {
                prompt = sideQuestSelect.value;
            } else {
                prompt = document.getElementById('new-quest-prompt').value;
            }

            // Update the quest in the state
            Object.assign(characterState[editingQuestInfo.list][editingQuestInfo.index], { month, year, type, prompt, book, notes });
            
            // Re-render the correct list
            if (editingQuestInfo.list === 'activeAssignments') ui.renderActiveAssignments();
            else if (editingQuestInfo.list === 'completedQuests') ui.renderCompletedQuests();
            else if (editingQuestInfo.list === 'discardedQuests') ui.renderDiscardedQuests();

            resetQuestForm();
        } else {
            // Handle special case for adding a new Dungeon Crawl
            if (type === '♠ Dungeon Crawl') {
                const roomNumber = dungeonRoomSelect.value;
                const roomData = data.dungeonRooms[roomNumber];
                const encounterName = dungeonEncounterSelect.value;
                let encounterPrompt = '';

                if (!roomNumber || !book || !month || !year) {
                    alert('Please fill in Month, Year, Book, and select a Room.');
                    return;
                }
                if (Object.keys(roomData.encounters).length > 0 && !encounterName) {
                    alert('Please select an Encounter for this room.');
                    return;
                }
                if (encounterName) {
                    const encounterData = roomData.encounters[encounterName];
                    const isBefriend = dungeonActionToggle.checked;
                    encounterPrompt = (isBefriend && encounterData.befriend) ? encounterData.befriend : (encounterData.defeat || encounterData.befriend);
                }

                const roomQuest = { month, year, type, prompt: roomData.challenge, book, notes, isEncounter: false };
                const encounterQuest = { month, year, type, prompt: encounterPrompt, book, notes, isEncounter: true };

                characterState.activeAssignments.push(roomQuest, encounterQuest);
                ui.renderActiveAssignments();
                saveState(form);
                resetQuestForm();
                return; // Exit after handling dungeon
            }

            if (type === '♥ Organize the Stacks') {
                prompt = genreQuestSelect.value;
            } else if (type === '♣ Side Quest') {
                prompt = sideQuestSelect.value;
            } else {
                prompt = document.getElementById('new-quest-prompt').value;
            }

            if (!prompt || !book || !month || !year) {
                alert('Please fill in the Month, Year, Prompt, and Book Title.');
                return;
            }

            // For dropdowns, the prompt is already the full text. For standard, it's just the input value.
            const questData = { month, year, type, prompt, book, notes };
            // Add new quest
            const status = document.getElementById('new-quest-status').value;
            if (status === 'active') {
                characterState.activeAssignments.push(questData); 
                ui.renderActiveAssignments();
            } else if (status === 'completed') {
                characterState.completedQuests.push(questData); 
                ui.renderCompletedQuests();
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

    // --- GENRE SELECTION FUNCTIONALITY ---
    function initializeGenreSelection() {
        // Load selected genres from localStorage (set by quests page)
        let selectedGenres = [];
        try {
            selectedGenres = JSON.parse(localStorage.getItem('selectedGenres') || '[]');
        } catch (e) {
            selectedGenres = [];
        }
        characterState.selectedGenres = selectedGenres;
        
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
                saveState(form);
            } else {
                alert(`No empty ${itemToEquip.type} slots available!`);
            }
        } else if (target.classList.contains('unequip-btn')) {
            characterState.inventoryItems.push(characterState.equippedItems.splice(index, 1)[0]);
            renderLoadout();
            saveState(form);
        } else if (target.classList.contains('delete-item-btn')) {
            if (confirm(`Are you sure you want to permanently delete ${characterState.inventoryItems[index].name}?`)) {
                characterState.inventoryItems.splice(index, 1);
                renderLoadout();
                saveState(form);
            }
        } else if (target.classList.contains('complete-quest-btn')) {
            const questToMove = characterState.activeAssignments.splice(index, 1)[0];
            characterState.completedQuests.push(questToMove);
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

    if(itemSelect) {
        for (const name in data.allItems) {
            const option = document.createElement('option');
            option.value = name;
            option.textContent = name;
            itemSelect.appendChild(option);
        }
    }
    
    // Initial Load
    loadState(form);
    ui.renderAll(levelInput, xpNeededInput, wizardSchoolSelect, librarySanctumSelect, smpInput, wearableSlotsInput, nonWearableSlotsInput, familiarSlotsInput);
    initializeGenreSelection();
}

// Run the initialization when the DOM is fully loaded
// document.addEventListener('DOMContentLoaded', initializeCharacterSheet);