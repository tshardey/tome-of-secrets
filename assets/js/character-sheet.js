import * as data from '/tome-of-secrets/assets/js/character-sheet/data.js';
import * as ui from '/tome-of-secrets/assets/js/character-sheet/ui.js';
import { characterState, loadState, saveState } from '/tome-of-secrets/assets/js/character-sheet/state.js';

document.addEventListener('DOMContentLoaded', function() {
    // --- FORM ELEMENTS ---
    const form = document.getElementById('character-sheet');
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

    // --- EVENT LISTENERS ---
    levelInput.addEventListener('change', () => {
        ui.updateXpNeeded(levelInput, xpNeededInput);
        ui.renderPermanentBonuses(levelInput);
    });

    wizardSchoolSelect.addEventListener('change', () => ui.renderBenefits(wizardSchoolSelect, librarySanctumSelect));
    librarySanctumSelect.addEventListener('change', () => ui.renderBenefits(wizardSchoolSelect, librarySanctumSelect));
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

    addQuestButton.addEventListener('click', () => {
        const status = document.getElementById('new-quest-status').value;
        const type = document.getElementById('new-quest-type').value;
        const prompt = document.getElementById('new-quest-prompt').value;
        const book = document.getElementById('new-quest-book').value;
        const notes = document.getElementById('new-quest-notes').value;
        const month = document.getElementById('quest-month').value;
        const year = document.getElementById('quest-year').value;
        if (!prompt || !book || !month || !year) { alert('Please fill in the Month, Year, Prompt, and Book Title.'); return; }

        const newQuest = { month, year, type, prompt, book, notes };
        if (status === 'active') {
            characterState.activeAssignments.push(newQuest); ui.renderActiveAssignments();
        } else if (status === 'completed') {
            characterState.completedQuests.push(newQuest); ui.renderCompletedQuests();
        }

        saveState(form);
        document.getElementById('new-quest-prompt').value = '';
        document.getElementById('new-quest-book').value = '';
        document.getElementById('new-quest-notes').value = '';
    });
    
    form.addEventListener('submit', (e) => { e.preventDefault(); saveState(form); alert('Character sheet saved!'); });
    printButton.addEventListener('click', () => window.print());

    document.querySelector('main').addEventListener('click', (e) => {
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
});