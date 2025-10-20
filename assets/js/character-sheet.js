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

    // --- STATE FOR EDITING ---
    let editingQuestInfo = null; // { list: 'activeAssignments', index: 0 }

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
        } else if (selectedType === '♥ Genre Quest') {
            genreContainer.style.display = 'flex';
            genreQuestSelect.innerHTML = '<option value="">-- Select a Genre Quest --</option>';
            for (const key in data.genreQuests) {
                const option = document.createElement('option');
                option.value = data.genreQuests[key];
                option.textContent = `${key}: ${data.genreQuests[key].split(':')[0]}`;
                genreQuestSelect.appendChild(option);
            }
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

        if (selectedRoomNumber && data.dungeonRooms[selectedRoomNumber].encounters.length > 0) {
            data.dungeonRooms[selectedRoomNumber].encounters.forEach(encounterText => {
                const option = document.createElement('option');
                option.value = encounterText;
                option.textContent = encounterText.split(':')[0]; // Show only the name
                dungeonEncounterSelect.appendChild(option);
            });
            dungeonEncounterSelect.style.display = 'block';
        } else {
            dungeonEncounterSelect.style.display = 'none';
        }
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
            if (type === '♠ Dungeon Crawl') {
                const roomNumber = dungeonRoomSelect.value;
                if (!roomNumber) {
                    alert('Please select a dungeon room to update.');
                    return;
                }
                prompt = data.dungeonRooms[roomNumber].challenge;
            } else if (type === '♥ Genre Quest') {
                prompt = genreQuestSelect.value;
            } else if (type === '♣ Side Quest') {
                prompt = sideQuestSelect.value;
            } else {
                prompt = document.getElementById('new-quest-prompt').value;
            }

            if (!prompt) {
                    alert('Please fill in the Prompt field.');
                    return;
                }
            // Update the quest in the state
            characterState[editingQuestInfo.list][editingQuestInfo.index] = { month, year, type, prompt, book, notes };
            
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
                const encounterPrompt = dungeonEncounterSelect.value;

                if (!roomNumber || !book || !month || !year) {
                    alert('Please fill in Month, Year, Book, and select a Room.');
                    return;
                }
                if (roomData.encounters.length > 0 && !encounterPrompt) {
                    alert('Please select an Encounter for this room.');
                    return;
                }
                const roomQuest = { month, year, type, prompt: roomData.challenge, book, notes };
                const encounterQuest = { month, year, type, prompt: encounterPrompt, book, notes };

                characterState.activeAssignments.push(roomQuest, encounterQuest);
                ui.renderActiveAssignments();
                saveState(form);
                resetQuestForm();
                return; // Exit after handling dungeon
            }

            if (type === '♥ Genre Quest') {
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
                // We don't re-select the dropdowns for dungeon, user must re-select if they want to change it.
            } else if (quest.type === '♥ Genre Quest') {
                genreQuestSelect.value = quest.prompt;
            } else if (quest.type === '♣ Side Quest') {
                sideQuestSelect.value = quest.prompt;
            } else {
                // Editing dungeon quests is simplified; we don't try to re-select the dropdowns.
                // The user can change the type or re-select a new dungeon room.
            }

            // Set editing state
            editingQuestInfo = { list, index };
            addQuestButton.textContent = 'Update Quest';
            document.getElementById('new-quest-status').style.display = 'none'; // Hide status dropdown
            cancelEditQuestButton.style.display = 'inline-block';
            addQuestButton.style.width = '50%';
            cancelEditQuestButton.style.width = '50%';

            addQuestButton.scrollIntoView({ behavior: 'smooth', block: 'center' });
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
}

// Run the initialization when the DOM is fully loaded
document.addEventListener('DOMContentLoaded', initializeCharacterSheet);