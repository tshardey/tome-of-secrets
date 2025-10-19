import * as data from '/tome-of-secrets/assets/js/character-sheet/data.js';
import { characterState } from '/tome-of-secrets/assets/js/character-sheet/state.js';

export function updateXpNeeded(levelInput, xpNeededInput) {
    const currentLevel = parseInt(levelInput.value, 10) || 1;
    xpNeededInput.value = data.xpLevels[currentLevel] || "Max";
}

export function renderPermanentBonuses(levelInput) {
    const bonusList = document.getElementById('permanentBonusesList');
    const currentLevel = parseInt(levelInput.value, 10) || 1;
    bonusList.innerHTML = '';
    let bonusesFound = false;

    for (const level in data.permanentBonuses) {
        if (currentLevel >= level) {
            bonusesFound = true;
            const li = document.createElement('li');
            li.innerHTML = data.permanentBonuses[level];
            bonusList.appendChild(li);
        }
    }

    if (!bonusesFound) {
        bonusList.innerHTML = '<li>-- No bonuses unlocked at this level --</li>';
    }
}

export function renderBenefits(wizardSchoolSelect, librarySanctumSelect) {
    const schoolDescriptionDisplay = document.getElementById('magicalSchoolDescriptionDisplay');
    const schoolBenefitDisplay = document.getElementById('magicalSchoolBenefitDisplay');
    const sanctumDescriptionDisplay = document.getElementById('librarySanctumDescriptionDisplay');
    const sanctumBenefitDisplay = document.getElementById('librarySanctumBenefitDisplay');

    const selectedSchool = wizardSchoolSelect.value;
    if (selectedSchool && data.schoolBenefits[selectedSchool]) {
        schoolDescriptionDisplay.innerHTML = data.schoolBenefits[selectedSchool].description;
        schoolBenefitDisplay.innerHTML = data.schoolBenefits[selectedSchool].benefit;
    } else {
        schoolDescriptionDisplay.innerHTML = '-- Select a school to see its description --';
        schoolBenefitDisplay.innerHTML = '-- Select a school to see its benefit --';
    }

    const selectedSanctum = librarySanctumSelect.value;
    if (selectedSanctum && data.sanctumBenefits[selectedSanctum]) {
        sanctumDescriptionDisplay.innerHTML = data.sanctumBenefits[selectedSanctum].description;
        sanctumBenefitDisplay.innerHTML = data.sanctumBenefits[selectedSanctum].benefit;
    } else {
        sanctumDescriptionDisplay.innerHTML = '-- Select a sanctum to see its description --';
        sanctumBenefitDisplay.innerHTML = '-- Select a sanctum to see its benefit --';
    }
}

export function renderMasteryAbilities(smpInput) {
    const smpDisplay = document.getElementById('smp-display');
    const abilitySelect = document.getElementById('ability-select');
    const learnedList = document.getElementById('learned-abilities-list');
    const currentSmp = parseInt(smpInput.value, 10) || 0;
    
    smpDisplay.textContent = currentSmp;
    learnedList.innerHTML = '';
    abilitySelect.innerHTML = '<option value="">-- Select an ability to learn --</option>';

    characterState.learnedAbilities.forEach((abilityName, index) => {
        const ability = data.masteryAbilities[abilityName];
        learnedList.innerHTML += `<div class="item-card"><div class="item-info"><h4>${abilityName}</h4><p>${ability.benefit}</p><p class="ability-cost"><strong>School:</strong> ${ability.school} | <strong>Cost:</strong> ${ability.cost} SMP</p><button class="delete-ability-btn" data-index="${index}">Forget</button></div></div>`;
    });

    for (const name in data.masteryAbilities) {
        if (!characterState.learnedAbilities.includes(name)) {
            const option = document.createElement('option');
            option.value = name;
            option.textContent = `${name} (${data.masteryAbilities[name].school}, ${data.masteryAbilities[name].cost} SMP)`;
            abilitySelect.appendChild(option);
        }
    }
}

export function getSlotLimits(wearableSlotsInput, nonWearableSlotsInput, familiarSlotsInput) {
    const wearable = parseInt(wearableSlotsInput.value, 10) || 0;
    const nonWearable = parseInt(nonWearableSlotsInput.value, 10) || 0;
    const familiar = parseInt(familiarSlotsInput.value, 10) || 0;
    return { 'Wearable': wearable, 'Non-Wearable': nonWearable, 'Familiar': familiar, 'total': wearable + nonWearable + familiar };
}

export function renderLoadout(wearableSlotsInput, nonWearableSlotsInput, familiarSlotsInput) {
    const equippedList = document.getElementById('equipped-items-list');
    const inventoryList = document.getElementById('inventory-list');
    equippedList.innerHTML = '';
    inventoryList.innerHTML = '';

    const slotLimits = getSlotLimits(wearableSlotsInput, nonWearableSlotsInput, familiarSlotsInput);
    const equippedCounts = { 'Wearable': 0, 'Non-Wearable': 0, 'Familiar': 0 };

    characterState.equippedItems.forEach((item, index) => {
        equippedCounts[item.type]++;
        equippedList.innerHTML += `<div class="item-card"><img src="${item.img}" alt="${item.name}"><div class="item-info"><h4>${item.name}</h4><p><strong>Type:</strong> ${item.type}</p><p>${item.bonus}</p><button class="unequip-btn" data-index="${index}">Unequip</button></div></div>`;
    });

    for (let i = equippedCounts['Wearable']; i < slotLimits['Wearable']; i++) { equippedList.innerHTML += `<div class="item-card empty-slot"><p>Empty Wearable Slot</p></div>`; }
    for (let i = equippedCounts['Non-Wearable']; i < slotLimits['Non-Wearable']; i++) { equippedList.innerHTML += `<div class="item-card empty-slot"><p>Empty Non-Wearable Slot</p></div>`; }
    for (let i = equippedCounts['Familiar']; i < slotLimits['Familiar']; i++) { equippedList.innerHTML += `<div class="item-card empty-slot"><p>Empty Familiar Slot</p></div>`; }

    if (characterState.inventoryItems.length > 0) {
        characterState.inventoryItems.forEach((item, index) => {
            inventoryList.innerHTML += `<div class="item-card"><img src="${item.img}" alt="${item.name}"><div class="item-info"><h4>${item.name}</h4><p><strong>Type:</strong> ${item.type}</p><p>${item.bonus}</p><button class="equip-btn" data-index="${index}">Equip</button><button class="delete-item-btn" data-index="${index}">Delete</button></div></div>`;
        });
    } else {
        inventoryList.innerHTML = `<p id="empty-inventory-message">Your inventory is empty. Add items using the dropdown above.</p>`;
    }
    
    document.getElementById('equipped-summary').innerText = `Equipped Items (${characterState.equippedItems.length}/${slotLimits.total} Slots Used)`;
}

export function renderAtmosphericBuffs(librarySanctumSelect) {
    const tbody = document.getElementById('atmospheric-buffs-body');
    tbody.innerHTML = '';

    const selectedSanctum = librarySanctumSelect.value;
    const associatedBuffs = (selectedSanctum && data.sanctumBenefits[selectedSanctum]?.associatedBuffs) || [];

    for (const buffName in data.atmosphericBuffs) {
        const isAssociated = associatedBuffs.includes(buffName);
        const dailyValue = isAssociated ? 2 : 1;
        const daysUsed = characterState.atmosphericBuffs[buffName]?.daysUsed || 0;
        const isActive = characterState.atmosphericBuffs[buffName]?.isActive || false;

        const row = tbody.insertRow();
        if (isAssociated) {
            row.classList.add('highlight');
        }

        row.innerHTML = `
            <td>${buffName}</td>
            <td>${dailyValue}</td>
            <td><input type="checkbox" class="buff-active-check" data-buff-name="${buffName}" ${isActive ? 'checked' : ''}></td>
            <td><input type="number" class="buff-days-input" value="${daysUsed}" min="0" data-buff-name="${buffName}" data-daily-value="${dailyValue}"></td>
            <td id="total-${buffName.replace(/\s+/g, '')}">${daysUsed * dailyValue}</td>
        `;
    }
}

export function updateBuffTotal(inputElement) {
    const buffName = inputElement.dataset.buffName;
    const daysUsed = parseInt(inputElement.value, 10) || 0;
    const dailyValue = parseInt(inputElement.dataset.dailyValue, 10);
    document.getElementById(`total-${buffName.replace(/\s+/g, '')}`).textContent = daysUsed * dailyValue;
}

export function renderActiveAssignments() {
    const tbody = document.getElementById('active-assignments-body');
    tbody.innerHTML = '';
    characterState.activeAssignments.forEach((quest, index) => {
        const row = tbody.insertRow();
        row.innerHTML = `<td>${quest.month}</td>
                         <td>${quest.year}</td>
                         <td>${quest.type}</td>
                         <td>${quest.prompt}</td>
                         <td>${quest.book}</td>
                         <td>${quest.notes || ''}</td>
                         <td class="no-print action-cell"><button class="complete-quest-btn" data-index="${index}">Complete</button><button class="discard-quest-btn" data-index="${index}">Discard</button><button class="delete-btn" data-index="${index}" data-list="active">Delete</button></td>`;
        row.querySelector('.action-cell').prepend(createEditButton(index, 'activeAssignments'));
    });
    document.getElementById('active-summary').innerText = `Active Book Assignments (${characterState.activeAssignments.length} Remaining)`;
}

export function renderCompletedQuests() {
    const tbody = document.getElementById('completed-quests-body');
    tbody.innerHTML = '';
    characterState.completedQuests.forEach((quest, index) => {
        const row = tbody.insertRow();
        row.innerHTML = `<td>${quest.month}</td><td>${quest.year}</td><td>${quest.type}</td><td>${quest.prompt}</td><td>${quest.book}</td><td>${quest.notes || ''}</td><td class="no-print action-cell"><button class="delete-btn" data-index="${index}" data-list="completed">Delete</button></td>`;
        row.querySelector('.action-cell').prepend(createEditButton(index, 'completedQuests'));
    });
    document.getElementById('completed-summary').innerText = `Completed Quests (${characterState.completedQuests.length} Books Read)`;
}

export function renderDiscardedQuests() {
    const tbody = document.getElementById('discarded-quests-body');
    tbody.innerHTML = '';
    characterState.discardedQuests.forEach((quest, index) => {
        const row = tbody.insertRow();
        row.innerHTML = `<td>${quest.month}</td><td>${quest.year}</td><td>${quest.type}</td><td>${quest.prompt}</td><td>${quest.book}</td><td>${quest.notes || ''}</td><td class="no-print action-cell"><button class="delete-btn" data-index="${index}" data-list="discarded">Delete</button></td>`;
        row.querySelector('.action-cell').prepend(createEditButton(index, 'discardedQuests'));
    });
    document.getElementById('discarded-summary').innerText = `Discarded Quests (${characterState.discardedQuests.length})`;
}

function createEditButton(index, listName) {
    const button = document.createElement('button');
    button.className = 'edit-quest-btn';
    button.type = 'button'; // Prevents form submission
    button.textContent = 'Edit';
    button.dataset.index = index;
    button.dataset.list = listName;
    return button;
}

export function renderAll(levelInput, xpNeededInput, wizardSchoolSelect, librarySanctumSelect, smpInput, wearableSlotsInput, nonWearableSlotsInput, familiarSlotsInput) {
    updateXpNeeded(levelInput, xpNeededInput);
    renderPermanentBonuses(levelInput);
    renderBenefits(wizardSchoolSelect, librarySanctumSelect);
    renderMasteryAbilities(smpInput);
    renderLoadout(wearableSlotsInput, nonWearableSlotsInput, familiarSlotsInput);
    renderAtmosphericBuffs(librarySanctumSelect);
    renderActiveAssignments();
    renderCompletedQuests();
    renderDiscardedQuests();
}