import * as data from './data.js';
import { characterState } from './state.js';
import { keeperBackgrounds } from './data.js';

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

export function renderBenefits(wizardSchoolSelect, librarySanctumSelect, keeperBackgroundSelect) {
    // Render Keeper Background
    const backgroundDescriptionDisplay = document.getElementById('keeperBackgroundDescriptionDisplay');
    const backgroundBenefitDisplay = document.getElementById('keeperBackgroundBenefitDisplay');
    
    const selectedBackground = keeperBackgroundSelect ? keeperBackgroundSelect.value : '';
    if (selectedBackground && keeperBackgrounds[selectedBackground]) {
        backgroundDescriptionDisplay.innerHTML = keeperBackgrounds[selectedBackground].description;
        backgroundBenefitDisplay.innerHTML = keeperBackgrounds[selectedBackground].benefit;
    } else {
        backgroundDescriptionDisplay.innerHTML = '-- Select a background to see its description --';
        backgroundBenefitDisplay.innerHTML = '-- Select a background to see its benefit --';
    }

    // Render School Benefits
    const schoolDescriptionDisplay = document.getElementById('magicalSchoolDescriptionDisplay');
    const schoolBenefitDisplay = document.getElementById('magicalSchoolBenefitDisplay');

    const selectedSchool = wizardSchoolSelect.value;
    if (selectedSchool && data.schoolBenefits[selectedSchool]) {
        schoolDescriptionDisplay.innerHTML = data.schoolBenefits[selectedSchool].description;
        schoolBenefitDisplay.innerHTML = data.schoolBenefits[selectedSchool].benefit;
    } else {
        schoolDescriptionDisplay.innerHTML = '-- Select a school to see its description --';
        schoolBenefitDisplay.innerHTML = '-- Select a school to see its benefit --';
    }

    // Render Sanctum Benefits
    const sanctumDescriptionDisplay = document.getElementById('librarySanctumDescriptionDisplay');
    const sanctumBenefitDisplay = document.getElementById('librarySanctumBenefitDisplay');
    
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

        // Disable checkbox for Grove Tender's automatic buff
        const checkboxDisabled = isGroveBuffActive ? 'disabled' : '';
        const checkboxTitle = isGroveBuffActive ? 'title="Always active (Grove Tender)"' : '';

        row.innerHTML = `
            <td>${buffName}${isGroveBuffActive ? ' <span style="color: #b89f62;">★</span>' : ''}</td>
            <td>${dailyValue}</td>
            <td><input type="checkbox" class="buff-active-check" data-buff-name="${buffName}" ${isActive ? 'checked' : ''} ${checkboxDisabled} ${checkboxTitle}></td>
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
        const rewards = quest.rewards || {};
        // Format buffs to remove [Buff], [Item], and [Background] prefixes for display
        const buffs = quest.buffs && quest.buffs.length > 0 
            ? quest.buffs.map(b => b.replace(/^\[(Buff|Item|Background)\] /, '')).join(', ') 
            : '-';
        
        // Add indicator if quest will receive buffs
        const buffIndicator = (quest.buffs && quest.buffs.length > 0) ? ' <span style="color: #b89f62;">*</span>' : '';
        
        // For Extra Credit, don't show prompt
        const promptDisplay = quest.type === '⭐ Extra Credit' ? '-' : quest.prompt;
        
        row.innerHTML = `<td>${quest.month}</td>
                         <td>${quest.year}</td>
                         <td>${quest.type}</td>
                         <td>${promptDisplay}</td>
                         <td>${quest.book}</td>
                         <td>${rewards.xp > 0 ? `+${rewards.xp}${buffIndicator}` : '-'}</td>
                         <td>${rewards.paperScraps > 0 ? `+${rewards.paperScraps}${buffIndicator}` : '-'}</td>
                         <td>${rewards.inkDrops > 0 ? `+${rewards.inkDrops}${buffIndicator}` : '-'}</td>
                         <td>${rewards.items && rewards.items.length > 0 ? rewards.items.join(', ') : '-'}</td>
                         <td>${buffs}</td>
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
        const rewards = quest.rewards || {};
        // Format buffs to remove [Buff], [Item], and [Background] prefixes for display
        const buffs = quest.buffs && quest.buffs.length > 0 
            ? quest.buffs.map(b => b.replace(/^\[(Buff|Item|Background)\] /, '')).join(', ') 
            : '-';
        
        // Show modified rewards with indicator if they were modified
        const modifiedIndicator = (rewards.modifiedBy && rewards.modifiedBy.length > 0) 
            ? ` <span style="color: #b89f62;" title="Modified by: ${rewards.modifiedBy.join(', ')}">✓</span>` 
            : '';
        
        // For Extra Credit, don't show prompt
        const promptDisplay = quest.type === '⭐ Extra Credit' ? '-' : quest.prompt;
        
        row.innerHTML = `<td>${quest.month}</td><td>${quest.year}</td><td>${quest.type}</td><td>${promptDisplay}</td><td>${quest.book}</td><td>${rewards.xp > 0 ? `+${rewards.xp}${modifiedIndicator}` : '-'}</td><td>${rewards.paperScraps > 0 ? `+${rewards.paperScraps}${modifiedIndicator}` : '-'}</td><td>${rewards.inkDrops > 0 ? `+${rewards.inkDrops}${modifiedIndicator}` : '-'}</td><td>${rewards.items && rewards.items.length > 0 ? rewards.items.join(', ') : '-'}</td><td>${buffs}</td><td>${quest.notes || ''}</td><td class="no-print action-cell"><button class="delete-btn" data-index="${index}" data-list="completed">Delete</button></td>`;
        row.querySelector('.action-cell').prepend(createEditButton(index, 'completedQuests'));
    });
    document.getElementById('completed-summary').innerText = `Completed Quests (${characterState.completedQuests.length} Books Read)`;
}

export function renderDiscardedQuests() {
    const tbody = document.getElementById('discarded-quests-body');
    tbody.innerHTML = '';
    characterState.discardedQuests.forEach((quest, index) => {
        const row = tbody.insertRow();
        const rewards = quest.rewards || {};
        // Format buffs to remove [Buff], [Item], and [Background] prefixes for display
        const buffs = quest.buffs && quest.buffs.length > 0 
            ? quest.buffs.map(b => b.replace(/^\[(Buff|Item|Background)\] /, '')).join(', ') 
            : '-';
        
        // For Extra Credit, don't show prompt
        const promptDisplay = quest.type === '⭐ Extra Credit' ? '-' : quest.prompt;
        
        row.innerHTML = `<td>${quest.month}</td><td>${quest.year}</td><td>${quest.type}</td><td>${promptDisplay}</td><td>${quest.book}</td><td>${rewards.xp > 0 ? `+${rewards.xp}` : '-'}</td><td>${rewards.paperScraps > 0 ? `+${rewards.paperScraps}` : '-'}</td><td>${rewards.inkDrops > 0 ? `+${rewards.inkDrops}` : '-'}</td><td>${rewards.items && rewards.items.length > 0 ? rewards.items.join(', ') : '-'}</td><td>${buffs}</td><td>${quest.notes || ''}</td><td class="no-print action-cell"><button class="delete-btn" data-index="${index}" data-list="discarded">Delete</button></td>`;
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

export function renderActiveCurses() {
    const tbody = document.getElementById('active-curses-body');
    tbody.innerHTML = '';
    characterState.activeCurses.forEach((curse, index) => {
        const row = tbody.insertRow();
        row.innerHTML = `<td>${curse.name}</td>
                         <td>${curse.requirement}</td>
                         <td>${curse.book || ''}</td>
                         <td>Active</td>
                         <td class="no-print action-cell"><button type="button" class="complete-curse-btn" data-index="${index}">Complete</button><button type="button" class="edit-curse-btn" data-index="${index}">Edit</button><button type="button" class="delete-curse-btn" data-index="${index}">Delete</button></td>`;
    });
    document.getElementById('active-curses-summary').innerText = `Active Curse Penalties (${characterState.activeCurses.length})`;
}

export function renderCompletedCurses() {
    const tbody = document.getElementById('completed-curses-body');
    tbody.innerHTML = '';
    characterState.completedCurses.forEach((curse, index) => {
        const row = tbody.insertRow();
        row.innerHTML = `<td>${curse.name}</td>
                         <td>${curse.requirement}</td>
                         <td>${curse.book || ''}</td>
                         <td>Completed</td>
                         <td class="no-print action-cell"><button type="button" class="delete-curse-btn" data-index="${index}" data-list="completed">Delete</button></td>`;
    });
    document.getElementById('completed-curses-summary').innerText = `Completed Curse Penalties (${characterState.completedCurses.length})`;
}

export function renderTemporaryBuffs() {
    const tbody = document.getElementById('active-temp-buffs-body');
    if (!tbody) return;
    
    tbody.innerHTML = '';
    
    if (!characterState.temporaryBuffs || characterState.temporaryBuffs.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align: center;">No active temporary buffs</td></tr>';
        return;
    }
    
    characterState.temporaryBuffs.forEach((buff, index) => {
        const row = tbody.insertRow();
        let durationText = '';
        
        if (buff.duration === 'one-time') {
            durationText = 'One-Time Use';
        } else if (buff.duration === 'until-end-month') {
            durationText = 'Until End of Month';
        } else if (buff.duration === 'two-months') {
            const monthsLeft = buff.monthsRemaining || 2;
            durationText = `${monthsLeft} Month${monthsLeft !== 1 ? 's' : ''} Remaining`;
        }
        
        const statusText = buff.status === 'used' ? 'Used' : 'Active';
        const statusClass = buff.status === 'used' ? 'style="color: #999;"' : '';
        
        row.innerHTML = `
            <td ${statusClass}>${buff.name}</td>
            <td ${statusClass}>${buff.description}</td>
            <td ${statusClass}>${durationText}</td>
            <td ${statusClass}>${statusText}</td>
            <td class="no-print action-cell">
                ${buff.status === 'active' && buff.duration === 'one-time' ? `<button type="button" class="mark-buff-used-btn" data-index="${index}">Mark as Used</button>` : ''}
                ${buff.status === 'active' ? `<button type="button" class="remove-buff-btn" data-index="${index}">Remove</button>` : ''}
                ${buff.status === 'used' ? `<button type="button" class="remove-buff-btn" data-index="${index}">Delete</button>` : ''}
            </td>
        `;
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
    backgroundSelect.innerHTML = '<option value="">-- Select a Background --</option>';
    
    for (const [key, background] of Object.entries(keeperBackgrounds)) {
        if (key === '') continue; // Skip the 'None' entry, it's the default
        const option = document.createElement('option');
        option.value = key;
        option.textContent = background.name;
        backgroundSelect.appendChild(option);
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
    updateQuestBuffsDropdown(wearableSlotsInput, nonWearableSlotsInput, familiarSlotsInput);
    renderActiveAssignments();
    renderCompletedQuests();
    renderDiscardedQuests();
    renderActiveCurses();
    renderCompletedCurses();
}