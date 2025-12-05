import * as data from './data.js';
import { characterState } from './state.js';
import { keeperBackgrounds } from './data.js';
import { parseIntOr } from '../utils/helpers.js';
import { escapeHtml } from '../utils/sanitize.js';
import { clearElement, appendHTML } from '../utils/domHelpers.js';
import { safeGetJSON } from '../utils/storage.js';
import { STORAGE_KEYS } from './storageKeys.js';
import { 
    renderQuestRow,
    renderQuestCard, 
    renderItemCard, 
    renderEmptySlot, 
    renderCurseRow, 
    renderTemporaryBuffRow,
    renderAbilityCard
} from './renderComponents.js';

export function updateXpNeeded(levelInput, xpNeededInput) {
    const currentLevel = parseIntOr(levelInput.value, 1);
    xpNeededInput.value = data.xpLevels[currentLevel] || "Max";
}

export function renderPermanentBonuses(levelInput) {
    const bonusList = document.getElementById('permanentBonusesList');
    const currentLevel = parseIntOr(levelInput.value, 1);
    clearElement(bonusList);
    let bonusesFound = false;

    for (const level in data.permanentBonuses) {
        if (currentLevel >= level) {
            bonusesFound = true;
            const li = document.createElement('li');
            // Permanent bonuses from JSON are trusted content
            li.innerHTML = data.permanentBonuses[level];
            bonusList.appendChild(li);
        }
    }

    if (!bonusesFound) {
        const li = document.createElement('li');
        li.textContent = '-- No bonuses unlocked at this level --';
        bonusList.appendChild(li);
    }
}

export function renderBenefits(wizardSchoolSelect, librarySanctumSelect, keeperBackgroundSelect) {
    // Render Keeper Background
    const backgroundDescriptionDisplay = document.getElementById('keeperBackgroundDescriptionDisplay');
    const backgroundBenefitDisplay = document.getElementById('keeperBackgroundBenefitDisplay');
    
    const selectedBackground = keeperBackgroundSelect ? keeperBackgroundSelect.value : '';
    if (selectedBackground && keeperBackgrounds[selectedBackground]) {
        // JSON data is trusted content
        backgroundDescriptionDisplay.innerHTML = keeperBackgrounds[selectedBackground].description;
        backgroundBenefitDisplay.innerHTML = keeperBackgrounds[selectedBackground].benefit;
    } else {
        backgroundDescriptionDisplay.textContent = '-- Select a background to see its description --';
        backgroundBenefitDisplay.textContent = '-- Select a background to see its benefit --';
    }

    // Render School Benefits
    const schoolDescriptionDisplay = document.getElementById('magicalSchoolDescriptionDisplay');
    const schoolBenefitDisplay = document.getElementById('magicalSchoolBenefitDisplay');

    const selectedSchool = wizardSchoolSelect.value;
    if (selectedSchool && data.schoolBenefits[selectedSchool]) {
        // JSON data is trusted content
        schoolDescriptionDisplay.innerHTML = data.schoolBenefits[selectedSchool].description;
        schoolBenefitDisplay.innerHTML = data.schoolBenefits[selectedSchool].benefit;
    } else {
        schoolDescriptionDisplay.textContent = '-- Select a school to see its description --';
        schoolBenefitDisplay.textContent = '-- Select a school to see its benefit --';
    }

    // Render Sanctum Benefits
    const sanctumDescriptionDisplay = document.getElementById('librarySanctumDescriptionDisplay');
    const sanctumBenefitDisplay = document.getElementById('librarySanctumBenefitDisplay');
    
    const selectedSanctum = librarySanctumSelect.value;
    if (selectedSanctum && data.sanctumBenefits[selectedSanctum]) {
        // JSON data is trusted content
        sanctumDescriptionDisplay.innerHTML = data.sanctumBenefits[selectedSanctum].description;
        sanctumBenefitDisplay.innerHTML = data.sanctumBenefits[selectedSanctum].benefit;
    } else {
        sanctumDescriptionDisplay.textContent = '-- Select a sanctum to see its description --';
        sanctumBenefitDisplay.textContent = '-- Select a sanctum to see its benefit --';
    }
}

export function renderMasteryAbilities(smpInput) {
    const smpDisplay = document.getElementById('smp-display');
    const abilitySelect = document.getElementById('ability-select');
    const learnedList = document.getElementById('learned-abilities-list');
    const currentSmp = parseIntOr(smpInput.value, 0);
    
    smpDisplay.textContent = currentSmp;
    clearElement(learnedList);
    
    // Clear and reset ability select
    clearElement(abilitySelect);
    const defaultOption = document.createElement('option');
    defaultOption.value = '';
    defaultOption.textContent = '-- Select an ability to learn --';
    abilitySelect.appendChild(defaultOption);

    // Render learned abilities using component
    characterState.learnedAbilities.forEach((abilityName, index) => {
        const ability = data.masteryAbilities[abilityName];
        if (ability) {
            const card = renderAbilityCard(abilityName, ability, index);
            learnedList.appendChild(card);
        }
    });

    // Populate dropdown with unlearned abilities
    for (const name in data.masteryAbilities) {
        if (!characterState.learnedAbilities.includes(name)) {
            const option = document.createElement('option');
            option.value = name;
            const ability = data.masteryAbilities[name];
            option.textContent = `${escapeHtml(name)} (${escapeHtml(ability.school)}, ${ability.cost} SMP)`;
            abilitySelect.appendChild(option);
        }
    }
}

export function getSlotLimits(wearableSlotsInput, nonWearableSlotsInput, familiarSlotsInput) {
    const wearable = parseIntOr(wearableSlotsInput.value, 0);
    const nonWearable = parseIntOr(nonWearableSlotsInput.value, 0);
    const familiar = parseIntOr(familiarSlotsInput.value, 0);
    return { 'Wearable': wearable, 'Non-Wearable': nonWearable, 'Familiar': familiar, 'total': wearable + nonWearable + familiar };
}

export function renderLoadout(wearableSlotsInput, nonWearableSlotsInput, familiarSlotsInput) {
    const equippedList = document.getElementById('equipped-items-list');
    const inventoryList = document.getElementById('inventory-list');
    const slotManagement = document.querySelector('.slot-management');
    clearElement(equippedList);
    clearElement(inventoryList);

    const slotLimits = getSlotLimits(wearableSlotsInput, nonWearableSlotsInput, familiarSlotsInput);
    const equippedCounts = { 'Wearable': 0, 'Non-Wearable': 0, 'Familiar': 0 };

    // Render equipped items using component
    characterState.equippedItems.forEach((item, index) => {
        equippedCounts[item.type]++;
        const card = renderItemCard(item, index, { showUnequip: true });
        equippedList.appendChild(card);
    });

    // Render empty slots
    for (let i = equippedCounts['Wearable']; i < slotLimits['Wearable']; i++) {
        equippedList.appendChild(renderEmptySlot('Wearable'));
    }
    for (let i = equippedCounts['Non-Wearable']; i < slotLimits['Non-Wearable']; i++) {
        equippedList.appendChild(renderEmptySlot('Non-Wearable'));
    }
    for (let i = equippedCounts['Familiar']; i < slotLimits['Familiar']; i++) {
        equippedList.appendChild(renderEmptySlot('Familiar'));
    }

    // Render inventory items
    if (characterState.inventoryItems.length > 0) {
        characterState.inventoryItems.forEach((item, index) => {
            const card = renderItemCard(item, index, { showEquip: true, showDelete: true });
            inventoryList.appendChild(card);
        });
    } else {
        const message = document.createElement('p');
        message.id = 'empty-inventory-message';
        message.textContent = 'Your inventory is empty. Add items using the dropdown above.';
        inventoryList.appendChild(message);
    }
    
    document.getElementById('equipped-summary').textContent = `Equipped Items (${characterState.equippedItems.length}/${slotLimits.total} Slots Used)`;
    
    // Calculate expected vs actual slots to show unallocated slots warning
    const formData = safeGetJSON(STORAGE_KEYS.CHARACTER_SHEET_FORM, {});
    const currentLevel = parseIntOr(formData.level || document.getElementById('level')?.value, 1);
    
    // Calculate expected total slots: base 3 at level 1, plus slots from leveling
    let expectedTotalSlots = 3; // Starting slots at level 1
    if (data.levelRewards && currentLevel > 1) {
        for (let level = 2; level <= currentLevel; level++) {
            const levelStr = String(level);
            const rewards = data.levelRewards[levelStr];
            if (rewards && rewards.inventorySlot) {
                expectedTotalSlots += rewards.inventorySlot;
            }
        }
    }
    
    // Calculate current total slots
    const currentTotalSlots = slotLimits.total;
    
    // Calculate unallocated slots (difference between expected and current)
    const unallocatedSlots = expectedTotalSlots - currentTotalSlots;
    
    // Remove existing note if present
    const existingNote = document.getElementById('unallocated-slots-note');
    if (existingNote) {
        existingNote.remove();
    }
    
    // Add note if there are unallocated slots
    if (unallocatedSlots > 0 && slotManagement) {
        const note = document.createElement('p');
        note.id = 'unallocated-slots-note';
        note.className = 'unallocated-slots-note';
        note.style.cssText = 'color: #b89f62; font-weight: bold; margin-top: 10px; padding: 10px; background: rgba(184, 159, 98, 0.1); border: 1px solid #b89f62; border-radius: 4px;';
        note.textContent = `⚠️ You have ${unallocatedSlots} unallocated inventory slot${unallocatedSlots > 1 ? 's' : ''} available. Increase one of your slot types above to allocate ${unallocatedSlots > 1 ? 'them' : 'it'}.`;
        slotManagement.appendChild(note);
    }
}

export function renderAtmosphericBuffs(librarySanctumSelect) {
    const tbody = document.getElementById('atmospheric-buffs-body');
    clearElement(tbody);

    const selectedSanctum = librarySanctumSelect.value;
    const associatedBuffs = (selectedSanctum && data.sanctumBenefits[selectedSanctum]?.associatedBuffs) || [];
    
    // Check if Grove Tender background is selected
    const keeperBackgroundSelect = document.getElementById('keeperBackground');
    const isGroveTender = keeperBackgroundSelect && keeperBackgroundSelect.value === 'groveTender';

    for (const buffName in data.atmosphericBuffs) {
        const isAssociated = associatedBuffs.includes(buffName);
        const dailyValue = isAssociated ? 2 : 1;
        const daysUsed = characterState.atmosphericBuffs[buffName]?.daysUsed || 0;
        let isActive = characterState.atmosphericBuffs[buffName]?.isActive || false;
        
        // Grove Tender always has "The Soaking in Nature" active
        const isGroveBuffActive = isGroveTender && buffName === 'The Soaking in Nature';
        if (isGroveBuffActive) {
            isActive = true;
        }

        const row = tbody.insertRow();
        if (isAssociated || isGroveBuffActive) {
            row.classList.add('highlight');
        }

        // Buff name cell
        const nameCell = document.createElement('td');
        nameCell.textContent = buffName;
        if (isGroveBuffActive) {
            const star = document.createElement('span');
            star.style.color = '#b89f62';
            star.textContent = ' ★';
            nameCell.appendChild(star);
        }
        row.appendChild(nameCell);

        // Daily value cell
        const valueCell = document.createElement('td');
        valueCell.textContent = dailyValue;
        row.appendChild(valueCell);

        // Checkbox cell
        const checkboxCell = document.createElement('td');
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.className = 'buff-active-check';
        checkbox.dataset.buffName = buffName;
        checkbox.checked = isActive;
        if (isGroveBuffActive) {
            checkbox.disabled = true;
            checkbox.title = 'Always active (Grove Tender)';
        }
        checkboxCell.appendChild(checkbox);
        row.appendChild(checkboxCell);

        // Days input cell
        const daysCell = document.createElement('td');
        const daysInput = document.createElement('input');
        daysInput.type = 'number';
        daysInput.className = 'buff-days-input';
        daysInput.value = daysUsed;
        daysInput.min = 0;
        daysInput.dataset.buffName = buffName;
        daysInput.dataset.dailyValue = dailyValue;
        daysCell.appendChild(daysInput);
        row.appendChild(daysCell);

        // Total cell
        const totalCell = document.createElement('td');
        totalCell.id = `total-${buffName.replace(/\s+/g, '')}`;
        totalCell.textContent = daysUsed * dailyValue;
        row.appendChild(totalCell);
    }
}

export function updateBuffTotal(inputElement) {
    const buffName = inputElement.dataset.buffName;
    const daysUsed = parseIntOr(inputElement.value, 0);
    const dailyValue = parseIntOr(inputElement.dataset.dailyValue, 0);
    document.getElementById(`total-${buffName.replace(/\s+/g, '')}`).textContent = daysUsed * dailyValue;
}

export function renderActiveAssignments() {
    const container = document.getElementById('active-assignments-container');
    const cardsContainer = container?.querySelector('.quest-cards-container');
    if (!cardsContainer) return;
    
    clearElement(cardsContainer);
    
    characterState.activeAssignments.forEach((quest, index) => {
        const card = renderQuestCard(quest, index, 'active');
        cardsContainer.appendChild(card);
    });
    
    const summary = document.getElementById('active-summary');
    if (summary) {
        summary.textContent = `Active Book Assignments (${characterState.activeAssignments.length} Remaining)`;
    }
}

export function renderCompletedQuests() {
    const container = document.getElementById('completed-quests-container');
    const cardsContainer = container?.querySelector('.quest-cards-container');
    if (!cardsContainer) return;
    
    clearElement(cardsContainer);
    
    characterState.completedQuests.forEach((quest, index) => {
        const card = renderQuestCard(quest, index, 'completed');
        cardsContainer.appendChild(card);
    });
    
    const summary = document.getElementById('completed-summary');
    if (summary) {
        summary.textContent = `Completed Quests (${characterState.completedQuests.length} Books Read)`;
    }
}

export function renderDiscardedQuests() {
    const container = document.getElementById('discarded-quests-container');
    const cardsContainer = container?.querySelector('.quest-cards-container');
    if (!cardsContainer) return;
    
    clearElement(cardsContainer);
    
    characterState.discardedQuests.forEach((quest, index) => {
        const card = renderQuestCard(quest, index, 'discarded');
        cardsContainer.appendChild(card);
    });
    
    const summary = document.getElementById('discarded-summary');
    if (summary) {
        summary.textContent = `Discarded Quests (${characterState.discardedQuests.length})`;
    }
}

// createEditButton is now handled by renderQuestRow component

export function renderActiveCurses() {
    const tbody = document.getElementById('active-curses-body');
    clearElement(tbody);
    
    characterState.activeCurses.forEach((curse, index) => {
        const row = renderCurseRow(curse, index, 'Active');
        tbody.appendChild(row);
    });
    
    document.getElementById('active-curses-summary').textContent = `Active Curse Penalties (${characterState.activeCurses.length})`;
}

export function renderCompletedCurses() {
    const tbody = document.getElementById('completed-curses-body');
    clearElement(tbody);
    
    characterState.completedCurses.forEach((curse, index) => {
        const row = renderCurseRow(curse, index, 'Completed');
        tbody.appendChild(row);
    });
    
    document.getElementById('completed-curses-summary').textContent = `Completed Curse Penalties (${characterState.completedCurses.length})`;
}

export function renderTemporaryBuffs() {
    const tbody = document.getElementById('active-temp-buffs-body');
    if (!tbody) return;
    
    clearElement(tbody);
    
    if (!characterState.temporaryBuffs || characterState.temporaryBuffs.length === 0) {
        const row = document.createElement('tr');
        const cell = document.createElement('td');
        cell.colSpan = 5;
        cell.style.textAlign = 'center';
        cell.textContent = 'No active temporary buffs';
        row.appendChild(cell);
        tbody.appendChild(row);
        return;
    }
    
    characterState.temporaryBuffs.forEach((buff, index) => {
        const row = renderTemporaryBuffRow(buff, index);
        tbody.appendChild(row);
    });
}

export function updateQuestBuffsDropdown(wearableSlotsInput, nonWearableSlotsInput, familiarSlotsInput) {
    const select = document.getElementById('quest-buffs-select');
    if (!select) return;
    
    select.innerHTML = '';
    
    let hasOptions = false;
    
    // Add keeper background bonuses (for manual application)
    const keeperBackgroundSelect = document.getElementById('keeperBackground');
    const background = keeperBackgroundSelect ? keeperBackgroundSelect.value : '';
    
    if (background) {
        const backgroundBonuses = [];
        
        if (background === 'archivist') {
            backgroundBonuses.push({
                name: 'Archivist Bonus',
                description: '+10 Ink Drops (Non-Fiction/Historical Fiction)'
            });
        }
        
        if (background === 'prophet') {
            backgroundBonuses.push({
                name: 'Prophet Bonus',
                description: '+10 Ink Drops (Religious/Spiritual/Mythological)'
            });
        }
        
        if (background === 'cartographer') {
            backgroundBonuses.push({
                name: 'Cartographer Bonus',
                description: '+10 Ink Drops (First Dungeon Crawl this month)'
            });
        }
        
        if (backgroundBonuses.length > 0) {
            const bgGroup = document.createElement('optgroup');
            bgGroup.label = 'Background Bonuses (Apply if Eligible)';
            backgroundBonuses.forEach((bonus) => {
                const option = document.createElement('option');
                option.value = `[Background] ${bonus.name}`;
                option.textContent = `${bonus.name} - ${bonus.description}`;
                bgGroup.appendChild(option);
                hasOptions = true;
            });
            select.appendChild(bgGroup);
        }
    }
    
    // Add active temporary buffs
    const activeBuffs = characterState.temporaryBuffs.filter(buff => buff.status === 'active');
    if (activeBuffs.length > 0) {
        // Add optgroup for temporary buffs
        const buffGroup = document.createElement('optgroup');
        buffGroup.label = 'Temporary Buffs';
        activeBuffs.forEach((buff) => {
            const option = document.createElement('option');
            option.value = `[Buff] ${buff.name}`;
            option.textContent = `${buff.name} - ${buff.description}`;
            buffGroup.appendChild(option);
            hasOptions = true;
        });
        select.appendChild(buffGroup);
    }
    
    // Add equipped items
    if (characterState.equippedItems && characterState.equippedItems.length > 0) {
        // Add optgroup for equipped items
        const itemGroup = document.createElement('optgroup');
        itemGroup.label = 'Equipped Items';
        characterState.equippedItems.forEach((item) => {
            const option = document.createElement('option');
            option.value = `[Item] ${item.name}`;
            option.textContent = `${item.name} - ${item.bonus}`;
            itemGroup.appendChild(option);
            hasOptions = true;
        });
        select.appendChild(itemGroup);
    }
    
    if (!hasOptions) {
        const option = document.createElement('option');
        option.value = '';
        option.textContent = 'No active buffs or equipped items';
        option.disabled = true;
        select.appendChild(option);
    }
}

export function populateBackgroundDropdown() {
    const backgroundSelect = document.getElementById('keeperBackground');
    if (!backgroundSelect) return;

    // Keep the default "-- Select a Background --" option
    clearElement(backgroundSelect);
    const defaultOption = document.createElement('option');
    defaultOption.value = '';
    defaultOption.textContent = '-- Select a Background --';
    backgroundSelect.appendChild(defaultOption);
    
    for (const [key, background] of Object.entries(keeperBackgrounds)) {
        if (key === '') continue; // Skip the 'None' entry, it's the default
        const option = document.createElement('option');
        option.value = key;
        option.textContent = background.name;
        backgroundSelect.appendChild(option);
    }
}

export function populateTemporaryBuffDropdown() {
    const select = document.getElementById('temp-buff-select');
    if (!select) return;
    
    // Clear existing options except the first one
    while (select.options.length > 1) {
        select.remove(1);
    }
    
    // Add all temporary buffs from temporaryBuffs.json
    if (data.temporaryBuffs) {
        for (const [name, buff] of Object.entries(data.temporaryBuffs)) {
            const option = document.createElement('option');
            option.value = name;
            option.textContent = `${name} - ${buff.description}`;
            select.appendChild(option);
        }
    }
}

export function renderAll(levelInput, xpNeededInput, wizardSchoolSelect, librarySanctumSelect, smpInput, wearableSlotsInput, nonWearableSlotsInput, familiarSlotsInput) {
    const keeperBackgroundSelect = document.getElementById('keeperBackground');
    updateXpNeeded(levelInput, xpNeededInput);
    renderPermanentBonuses(levelInput);
    renderBenefits(wizardSchoolSelect, librarySanctumSelect, keeperBackgroundSelect);
    renderMasteryAbilities(smpInput);
    renderLoadout(wearableSlotsInput, nonWearableSlotsInput, familiarSlotsInput);
    renderAtmosphericBuffs(librarySanctumSelect);
    renderTemporaryBuffs();
    populateTemporaryBuffDropdown();
    updateQuestBuffsDropdown(wearableSlotsInput, nonWearableSlotsInput, familiarSlotsInput);
    renderActiveAssignments();
    renderCompletedQuests();
    renderDiscardedQuests();
    renderActiveCurses();
    renderCompletedCurses();
}