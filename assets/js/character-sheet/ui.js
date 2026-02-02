import * as data from './data.js';
import { characterState } from './state.js';
import { keeperBackgrounds, allItems } from './data.js';
import { parseIntOr } from '../utils/helpers.js';
import { escapeHtml } from '../utils/sanitize.js';
import { clearElement, appendHTML } from '../utils/domHelpers.js';
import { safeGetJSON, safeSetJSON } from '../utils/storage.js';
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
import { toLocalOrCdnUrl } from '../utils/imageCdn.js';
import { createInventoryViewModel } from '../viewModels/inventoryViewModel.js';
import { getSlotLimits as slotServiceGetSlotLimits } from '../services/SlotService.js';
import { createQuestListViewModel } from '../viewModels/questViewModel.js';
import { createDungeonArchiveCardsViewModel } from '../viewModels/dungeonArchiveCardsViewModel.js';
import { renderDungeonArchiveCard, renderQuestArchiveCard } from './cardRenderer.js';
import { createGenreQuestArchiveCardsViewModel, createSideQuestArchiveCardsViewModel } from '../viewModels/questArchiveCardsViewModel.js';
import { createCurseListViewModel } from '../viewModels/curseViewModel.js';
import { createAbilityViewModel } from '../viewModels/abilityViewModel.js';
import { createAtmosphericBuffViewModel } from '../viewModels/atmosphericBuffViewModel.js';
import { createPermanentBonusesViewModel, createBenefitsViewModel } from '../viewModels/generalInfoViewModel.js';
import { shouldExcludeFromQuestBonuses } from '../services/AtmosphericBuffService.js';

export function updateXpNeeded(levelInput, xpNeededInput) {
    const currentLevel = parseIntOr(levelInput?.value || levelInput, 1);
    // xpLevels is keyed by strings ("1", "2", ...) from JSON
    const xpNeeded = data.xpLevels[String(currentLevel)] ?? 0;
    if (xpNeededInput) {
        const xpNeededText = xpNeeded === 0 ? "Max" : xpNeeded.toString();
        // Handle both input and span elements
        if (xpNeededInput.tagName === 'INPUT') {
            xpNeededInput.value = xpNeededText;
        } else {
            xpNeededInput.textContent = xpNeededText;
        }
    }
    // Update XP progress bar
    updateXpProgressBar();
}

/**
 * Update the RPG-styled XP progress bar
 */
export function updateXpProgressBar() {
    const xpCurrentInput = document.getElementById('xp-current');
    const xpNeededElement = document.getElementById('xp-needed');
    const levelInput = document.getElementById('level');
    const progressFill = document.getElementById('rpg-xp-progress-fill');
    const progressText = document.getElementById('rpg-xp-progress-text');
    const levelBadge = document.getElementById('rpg-level-badge');
    const levelNumber = document.getElementById('rpg-level-number');

    if (!xpCurrentInput || !levelInput) return;

    const currentXP = parseIntOr(xpCurrentInput.value, 0);
    const currentLevel = parseIntOr(levelInput.value, 1);
    // xpLevels is keyed by strings ("1", "2", ...) from JSON
    const xpNeeded = data.xpLevels[String(currentLevel)] ?? 0;

    // Update level badge
    if (levelBadge && levelNumber) {
        levelNumber.textContent = currentLevel;
    }

    // Update XP needed display
    if (xpNeededElement) {
        const xpNeededText = xpNeeded === 0 ? "Max" : xpNeeded.toString();
        if (xpNeededElement.tagName === 'INPUT') {
            xpNeededElement.value = xpNeededText;
        } else {
            xpNeededElement.textContent = xpNeededText;
        }
    }

    // Update progress bar
    if (progressFill && progressText) {
        if (xpNeeded === 0 || xpNeeded === "Max") {
            // Max level - show 100%
            progressFill.style.width = '100%';
            progressText.textContent = `Level ${currentLevel} (Max)`;
        } else {
            const percentage = Math.min(100, Math.max(0, (currentXP / xpNeeded) * 100));
            progressFill.style.width = `${percentage}%`;
            progressText.textContent = `${currentXP} / ${xpNeeded} XP`;
        }
    }

    // Update Level Up button state
    const levelUpBtn = document.getElementById('level-up-btn');
    if (levelUpBtn) {
        if (xpNeeded === 0 || xpNeeded === "Max" || currentXP < xpNeeded) {
            // Disable if max level or not enough XP
            levelUpBtn.disabled = true;
        } else {
            // Enable if enough XP to level up
            levelUpBtn.disabled = false;
        }
    }
}

export function renderPermanentBonuses(levelInput) {
    const bonusList = document.getElementById('permanentBonusesList');
    const currentLevel = parseIntOr(levelInput.value, 1);
    clearElement(bonusList);
    
    // Create view model
    const viewModel = createPermanentBonusesViewModel(currentLevel);
    
    if (viewModel.hasBonuses) {
        viewModel.bonuses.forEach(({ content }) => {
            const li = document.createElement('li');
            // Permanent bonuses from JSON are trusted content
            li.innerHTML = content;
            bonusList.appendChild(li);
        });
    } else {
        const li = document.createElement('li');
        li.textContent = '-- No bonuses unlocked at this level --';
        bonusList.appendChild(li);
    }
}

export function renderBenefits(wizardSchoolSelect, librarySanctumSelect, keeperBackgroundSelect) {
    const selectedBackground = keeperBackgroundSelect ? keeperBackgroundSelect.value : '';
    const selectedSchool = wizardSchoolSelect ? wizardSchoolSelect.value : '';
    const selectedSanctum = librarySanctumSelect ? librarySanctumSelect.value : '';
    
    // Create view model
    const viewModel = createBenefitsViewModel(selectedBackground, selectedSchool, selectedSanctum);
    
    // Render Keeper Background
    const backgroundDescriptionDisplay = document.getElementById('keeperBackgroundDescriptionDisplay');
    const backgroundBenefitDisplay = document.getElementById('keeperBackgroundBenefitDisplay');
    if (backgroundDescriptionDisplay && backgroundBenefitDisplay) {
        if (viewModel.background.hasSelection) {
            // JSON data is trusted content
            backgroundDescriptionDisplay.innerHTML = viewModel.background.description;
            backgroundBenefitDisplay.innerHTML = viewModel.background.benefit;
        } else {
            backgroundDescriptionDisplay.textContent = viewModel.background.description;
            backgroundBenefitDisplay.textContent = viewModel.background.benefit;
        }
    }

    // Render School Benefits
    const schoolDescriptionDisplay = document.getElementById('magicalSchoolDescriptionDisplay');
    const schoolBenefitDisplay = document.getElementById('magicalSchoolBenefitDisplay');
    if (schoolDescriptionDisplay && schoolBenefitDisplay) {
        if (viewModel.school.hasSelection) {
            // JSON data is trusted content
            schoolDescriptionDisplay.innerHTML = viewModel.school.description;
            schoolBenefitDisplay.innerHTML = viewModel.school.benefit;
        } else {
            schoolDescriptionDisplay.textContent = viewModel.school.description;
            schoolBenefitDisplay.textContent = viewModel.school.benefit;
        }
    }

    // Render Sanctum Benefits
    const sanctumDescriptionDisplay = document.getElementById('librarySanctumDescriptionDisplay');
    const sanctumBenefitDisplay = document.getElementById('librarySanctumBenefitDisplay');
    if (sanctumDescriptionDisplay && sanctumBenefitDisplay) {
        if (viewModel.sanctum.hasSelection) {
            // JSON data is trusted content
            sanctumDescriptionDisplay.innerHTML = viewModel.sanctum.description;
            sanctumBenefitDisplay.innerHTML = viewModel.sanctum.benefit;
        } else {
            sanctumDescriptionDisplay.textContent = viewModel.sanctum.description;
            sanctumBenefitDisplay.textContent = viewModel.sanctum.benefit;
        }
    }
}

export function renderMasteryAbilities(smpInput) {
    const smpDisplay = document.getElementById('smp-display');
    const abilitySelect = document.getElementById('ability-select');
    const learnedList = document.getElementById('learned-abilities-list');
    const currentSmp = parseIntOr(smpInput.value, 0);
    
    // Create view model
    const viewModel = createAbilityViewModel(characterState, currentSmp);
    
    // Update SMP display
    smpDisplay.textContent = viewModel.currentSmp;
    
    // Clear and reset ability select
    clearElement(abilitySelect);
    const defaultOption = document.createElement('option');
    defaultOption.value = '';
    defaultOption.textContent = '-- Select an ability to learn --';
    abilitySelect.appendChild(defaultOption);
    
    // Clear learned abilities list
    clearElement(learnedList);

    // Render learned abilities using component
    viewModel.learnedAbilities.forEach(({ name, ability, index }) => {
        const card = renderAbilityCard(name, ability, index);
        learnedList.appendChild(card);
    });

    // Populate dropdown with unlearned abilities
    viewModel.unlearnedOptions.forEach(optionData => {
        const option = document.createElement('option');
        option.value = optionData.value;
        option.textContent = escapeHtml(optionData.text);
        abilitySelect.appendChild(option);
    });
}

/**
 * Get slot limits from form inputs
 * @deprecated Use SlotService.getSlotLimits instead
 */
export function getSlotLimits(wearableSlotsInput, nonWearableSlotsInput, familiarSlotsInput) {
    return slotServiceGetSlotLimits(wearableSlotsInput, nonWearableSlotsInput, familiarSlotsInput);
}

/**
 * Render loadout (equipped items and inventory) - Pure rendering function
 * Accepts view model, performs no calculations
 * @param {Object} viewModel - View model from createInventoryViewModel
 */
function renderLoadoutPure(viewModel) {
    const equippedList = document.getElementById('equipped-items-list');
    const inventoryList = document.getElementById('inventory-list');
    const slotManagement = document.querySelector('.slot-management');
    clearElement(equippedList);
    clearElement(inventoryList);

    // Render equipped items using component
    viewModel.equippedItems.forEach((item, index) => {
        const card = renderItemCard(item, index, { showUnequip: true });
        equippedList.appendChild(card);
    });

    // Render empty slots
    for (let i = viewModel.equippedCounts['Wearable']; i < viewModel.slotLimits['Wearable']; i++) {
        equippedList.appendChild(renderEmptySlot('Wearable'));
    }
    for (let i = viewModel.equippedCounts['Non-Wearable']; i < viewModel.slotLimits['Non-Wearable']; i++) {
        equippedList.appendChild(renderEmptySlot('Non-Wearable'));
    }
    for (let i = viewModel.equippedCounts['Familiar']; i < viewModel.slotLimits['Familiar']; i++) {
        equippedList.appendChild(renderEmptySlot('Familiar'));
    }

    // Render inventory items
    if (viewModel.inventoryItems.length > 0) {
        // Find original index in raw inventory for button handlers
        // Note: This is a temporary workaround until we refactor button handlers to use item names instead of indices
        const rawInventoryItems = characterState[STORAGE_KEYS.INVENTORY_ITEMS] || [];
        const itemsInPassiveSlots = new Set([
            ...viewModel.passiveItemSlots.map(slot => slot.itemName).filter(Boolean),
            ...viewModel.passiveFamiliarSlots.map(slot => slot.itemName).filter(Boolean)
        ]);
        
        viewModel.inventoryItems.forEach((item) => {
            // Find original index in raw inventory
            const originalIndex = rawInventoryItems.findIndex(i => i.name === item.name);
            if (originalIndex === -1) return; // Skip if not found (shouldn't happen)

            const showDisplay = viewModel.hasAvailableItemSlots && !viewModel.equippedItemNames.has(item.name);
            const showAdopt = viewModel.hasAvailableFamiliarSlots && !viewModel.equippedItemNames.has(item.name);
            
            const card = renderItemCard(item, originalIndex, { 
                showEquip: true, 
                showDelete: true,
                showDisplay,
                showAdopt
            });
            inventoryList.appendChild(card);
        });
    } else {
        const message = document.createElement('p');
        message.id = 'empty-inventory-message';
        message.textContent = 'Your inventory is empty. Add items using the dropdown above.';
        inventoryList.appendChild(message);
    }
    
    // Update equipped summary
    const equippedSummary = document.getElementById('equipped-summary');
    if (equippedSummary) {
        equippedSummary.textContent = `Equipped Items (${viewModel.totalEquippedSlots}/${viewModel.slotLimits.total} Slots Used)`;
    }
    
    // Remove existing note if present
    const existingNote = document.getElementById('unallocated-slots-note');
    if (existingNote) {
        existingNote.remove();
    }
    
    // Add note if there are unallocated slots
    if (viewModel.unallocatedSlots > 0 && slotManagement) {
        const note = document.createElement('p');
        note.id = 'unallocated-slots-note';
        note.className = 'unallocated-slots-note';
        note.style.cssText = 'color: #b89f62; font-weight: bold; margin-top: 10px; padding: 10px; background: rgba(184, 159, 98, 0.1); border: 1px solid #b89f62; border-radius: 4px;';
        note.textContent = `⚠️ You have ${viewModel.unallocatedSlots} unallocated inventory slot${viewModel.unallocatedSlots > 1 ? 's' : ''} available. Increase one of your slot types above to allocate ${viewModel.unallocatedSlots > 1 ? 'them' : 'it'}.`;
        slotManagement.appendChild(note);
    }
}

/**
 * Render loadout - maintains backward compatibility with existing callers
 * Creates view model internally and calls pure renderer
 * @param {HTMLInputElement} wearableSlotsInput - Wearable slots input element
 * @param {HTMLInputElement} nonWearableSlotsInput - Non-wearable slots input element
 * @param {HTMLInputElement} familiarSlotsInput - Familiar slots input element
 */
export function renderLoadout(wearableSlotsInput, nonWearableSlotsInput, familiarSlotsInput) {
    const formData = safeGetJSON(STORAGE_KEYS.CHARACTER_SHEET_FORM, {});
    const viewModel = createInventoryViewModel(characterState, formData, wearableSlotsInput, nonWearableSlotsInput, familiarSlotsInput);
    renderLoadoutPure(viewModel);
}

export function renderAtmosphericBuffs(librarySanctumSelect) {
    const tbody = document.getElementById('atmospheric-buffs-body');
    clearElement(tbody);

    const selectedSanctum = librarySanctumSelect.value;
    
    // Get background from DOM
    const keeperBackgroundSelect = document.getElementById('keeperBackground');
    const background = keeperBackgroundSelect ? keeperBackgroundSelect.value : '';
    
    // Create view model
    const buffViewModels = createAtmosphericBuffViewModel(characterState, selectedSanctum, background);

    // Render each buff row using view model
    buffViewModels.forEach(buffVM => {
        const row = tbody.insertRow();
        if (buffVM.isHighlighted) {
            row.classList.add('highlight');
        }

        // Buff name cell
        const nameCell = document.createElement('td');
        nameCell.textContent = buffVM.name;
        if (buffVM.isGroveBuff) {
            const star = document.createElement('span');
            star.style.color = '#b89f62';
            star.textContent = ' ★';
            nameCell.appendChild(star);
        }
        row.appendChild(nameCell);

        // Daily value cell
        const valueCell = document.createElement('td');
        valueCell.textContent = buffVM.dailyValue;
        row.appendChild(valueCell);

        // Checkbox cell
        const checkboxCell = document.createElement('td');
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.className = 'buff-active-check';
        checkbox.dataset.buffName = buffVM.name;
        checkbox.checked = buffVM.isActive;
        if (buffVM.isDisabled) {
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
        daysInput.value = buffVM.daysUsed;
        daysInput.min = 0;
        daysInput.dataset.buffName = buffVM.name;
        daysInput.dataset.dailyValue = buffVM.dailyValue;
        daysCell.appendChild(daysInput);
        row.appendChild(daysCell);

        // Total cell
        const totalCell = document.createElement('td');
        totalCell.id = `total-${buffVM.name.replace(/\s+/g, '')}`;
        totalCell.textContent = buffVM.total;
        row.appendChild(totalCell);
    });
}

export function updateBuffTotal(inputElement) {
    const buffName = inputElement.dataset.buffName;
    const daysUsed = parseIntOr(inputElement.value, 0);
    const dailyValue = parseIntOr(inputElement.dataset.dailyValue, 0);
    document.getElementById(`total-${buffName.replace(/\s+/g, '')}`).textContent = daysUsed * dailyValue;
}

export function renderActiveAssignments() {
    // Prefer the explicit container id, but fall back to the RPG panel selector in case markup changes.
    // This keeps rendering working even if the surrounding layout is refactored.
    const container =
        document.getElementById('active-assignments-container') ||
        document.querySelector('.rpg-active-quests-panel');
    const cardsContainer = container?.querySelector('.quest-cards-container');
    if (!cardsContainer) return;
    
    clearElement(cardsContainer);
    
    // Get background and wizard school from DOM for receipt calculations
    const bgSelect = document.getElementById('keeperBackground');
    const schoolSelect = document.getElementById('wizardSchool');
    const background = bgSelect ? bgSelect.value : '';
    const wizardSchool = schoolSelect ? schoolSelect.value : '';
    
    // Get quests from state using storage key
    // Ensure we're reading from characterState directly
    let activeQuests = Array.isArray(characterState[STORAGE_KEYS.ACTIVE_ASSIGNMENTS]) 
        ? characterState[STORAGE_KEYS.ACTIVE_ASSIGNMENTS] 
        : [];
    
    // Debug: log what we found
    if (activeQuests.length > 0) {
        console.log(`renderActiveAssignments: Found ${activeQuests.length} active quests in characterState`);
    } else {
        console.warn(`renderActiveAssignments: No active quests found. characterState[${STORAGE_KEYS.ACTIVE_ASSIGNMENTS}] =`, characterState[STORAGE_KEYS.ACTIVE_ASSIGNMENTS]);
    }
    
    // Create view models for all active quests
    const viewModels = createQuestListViewModel(activeQuests, 'active', background, wizardSchool);
    
    // Render using view models (renderQuestCard still accepts quest directly for now)
    viewModels.forEach((viewModel) => {
        const card = renderQuestCard(viewModel.quest, viewModel.index, 'active');
        cardsContainer.appendChild(card);
    });
    
    const summary = document.getElementById('active-summary');
    if (summary) {
        summary.textContent = `Active Book Assignments (${activeQuests.length} Remaining)`;
    }
}

export function renderCompletedQuests() {
    const container = document.getElementById('completed-quests-container');
    if (!container) return;
    
    // Get containers
    const dungeonRoomsContainer = container.querySelector('#dungeon-rooms-archive-container');
    const dungeonEncountersContainer = container.querySelector('#dungeon-encounters-archive-container');
    const genreQuestsContainer = container.querySelector('#genre-quests-archive-container');
    const sideQuestsContainer = container.querySelector('#side-quests-archive-container');
    const cardsContainer = container.querySelector('.quest-cards-container');
    // Only require essential containers - genre/side quest containers are optional (for backwards compatibility)
    if (!dungeonRoomsContainer || !dungeonEncountersContainer || !cardsContainer) return;
    
    // Clear containers (only clear if they exist)
    if (dungeonRoomsContainer) clearElement(dungeonRoomsContainer);
    if (dungeonEncountersContainer) clearElement(dungeonEncountersContainer);
    if (genreQuestsContainer) clearElement(genreQuestsContainer);
    if (sideQuestsContainer) clearElement(sideQuestsContainer);
    if (cardsContainer) clearElement(cardsContainer);
    
    // Get background and wizard school from DOM for receipt calculations
    const bgSelect = document.getElementById('keeperBackground');
    const schoolSelect = document.getElementById('wizardSchool');
    const background = bgSelect ? bgSelect.value : '';
    const wizardSchool = schoolSelect ? schoolSelect.value : '';
    
    // Get quests from state using storage key
    const completedQuests = characterState[STORAGE_KEYS.COMPLETED_QUESTS] || [];
    
    // Separate quests by type
    const dungeonQuests = completedQuests.filter(quest => quest.type === '♠ Dungeon Crawl');
    const genreQuests = completedQuests.filter(quest => quest.type === '♥ Organize the Stacks');
    const sideQuests = completedQuests.filter(quest => quest.type === '♣ Side Quest');
    const otherQuests = completedQuests.filter(quest => 
        quest.type !== '♠ Dungeon Crawl' && 
        quest.type !== '♥ Organize the Stacks' && 
        quest.type !== '♣ Side Quest'
    );
    
    // Create view models for all dungeon quests (handles legacy quests without roomNumber/isEncounter)
    const allDungeonViewModels = createDungeonArchiveCardsViewModel(dungeonQuests);
    
    // Separate into rooms and encounters based on view model analysis
    const roomViewModels = allDungeonViewModels.filter(vm => !vm.isEncounter);
    const encounterViewModels = allDungeonViewModels.filter(vm => vm.isEncounter);
    
    // Render dungeon room cards
    if (roomViewModels.length > 0) {
        roomViewModels.forEach((viewModel) => {
            // Find the original index in completedQuests array
            const originalIndex = completedQuests.findIndex(q => q === viewModel.quest);
            const card = renderDungeonArchiveCard(viewModel.quest, originalIndex, viewModel.cardImage, viewModel.title, 'room');
            
            // Click handler will be handled by delegated handler via hidden edit button
            
            dungeonRoomsContainer.appendChild(card);
        });
    }
    
    // Render dungeon encounter cards
    if (encounterViewModels.length > 0) {
        encounterViewModels.forEach((viewModel) => {
            // Find the original index in completedQuests array
            const originalIndex = completedQuests.findIndex(q => q === viewModel.quest);
            const card = renderDungeonArchiveCard(viewModel.quest, originalIndex, viewModel.cardImage, viewModel.title, 'encounter');
            
            // Click handler will be handled by delegated handler via hidden edit button
            
            dungeonEncountersContainer.appendChild(card);
        });
    }
    
    // Render genre quest cards (if container exists, otherwise fall back to other quests)
    if (genreQuestsContainer && genreQuests.length > 0) {
        const genreViewModels = createGenreQuestArchiveCardsViewModel(genreQuests);
        genreViewModels.forEach((viewModel) => {
            // Find the original index in completedQuests array
            const originalIndex = completedQuests.findIndex(q => q === viewModel.quest);
            const card = renderQuestArchiveCard(viewModel.quest, originalIndex, viewModel.cardImage, viewModel.title);
            genreQuestsContainer.appendChild(card);
        });
    }
    
    // Render side quest cards (if container exists, otherwise fall back to other quests)
    if (sideQuestsContainer && sideQuests.length > 0) {
        const sideViewModels = createSideQuestArchiveCardsViewModel(sideQuests);
        sideViewModels.forEach((viewModel) => {
            // Find the original index in completedQuests array
            const originalIndex = completedQuests.findIndex(q => q === viewModel.quest);
            const card = renderQuestArchiveCard(viewModel.quest, originalIndex, viewModel.cardImage, viewModel.title);
            sideQuestsContainer.appendChild(card);
        });
    }
    
    // Render other quest cards (includes genre/side quests if their containers don't exist)
    // If specialized containers don't exist, render genre and side quests in the "other quests" container
    const questsToRenderInOther = genreQuestsContainer && sideQuestsContainer 
        ? otherQuests 
        : [
            ...otherQuests, 
            ...(!genreQuestsContainer ? genreQuests : []), 
            ...(!sideQuestsContainer ? sideQuests : [])
        ];
    
    if (questsToRenderInOther.length > 0) {
        // Create view models for other quests (need to map to original indices)
        const otherViewModels = questsToRenderInOther.map(quest => {
            const originalIndex = completedQuests.findIndex(q => q === quest);
            const viewModels = createQuestListViewModel([quest], 'completed', background, wizardSchool);
            return { ...viewModels[0], index: originalIndex };
        });
        
        otherViewModels.forEach((viewModel) => {
            const card = renderQuestCard(viewModel.quest, viewModel.index, 'completed');
            cardsContainer.appendChild(card);
        });
    }
    
    const summary = document.getElementById('completed-summary');
    if (summary) {
        summary.textContent = `Completed Quests (${completedQuests.length} Books Read)`;
    }
}

export function renderDiscardedQuests() {
    const container = document.getElementById('discarded-quests-container');
    const cardsContainer = container?.querySelector('.quest-cards-container');
    if (!cardsContainer) return;
    
    clearElement(cardsContainer);
    
    // Get quests from state using storage key
    const discardedQuests = characterState[STORAGE_KEYS.DISCARDED_QUESTS] || [];
    
    // Create view models for all discarded quests
    const viewModels = createQuestListViewModel(discardedQuests, 'discarded');
    
    // Render using view models (renderQuestCard still accepts quest directly for now)
    viewModels.forEach((viewModel) => {
        const card = renderQuestCard(viewModel.quest, viewModel.index, 'discarded');
        cardsContainer.appendChild(card);
    });
    
    const summary = document.getElementById('discarded-summary');
    if (summary) {
        summary.textContent = `Discarded Quests (${discardedQuests.length})`;
    }
}

// createEditButton is now handled by renderQuestRow component

export function renderActiveCurses() {
    const tbody = document.getElementById('active-curses-body');
    clearElement(tbody);
    
    // Get curses from state using storage key
    const activeCurses = characterState[STORAGE_KEYS.ACTIVE_CURSES] || [];
    
    // Create view model
    const viewModel = createCurseListViewModel(activeCurses, 'Active');
    
    // Render using view model
    viewModel.curses.forEach(({ curse, index, listType }) => {
        const row = renderCurseRow(curse, index, listType);
        tbody.appendChild(row);
    });
    
    // Update summary
    const summaryEl = document.getElementById('active-curses-summary');
    if (summaryEl) {
        summaryEl.textContent = viewModel.summaryText;
    }
}

export function renderCompletedCurses() {
    const tbody = document.getElementById('completed-curses-body');
    clearElement(tbody);
    
    // Get curses from state using storage key
    const completedCurses = characterState[STORAGE_KEYS.COMPLETED_CURSES] || [];
    
    // Create view model
    const viewModel = createCurseListViewModel(completedCurses, 'Completed');
    
    // Render using view model
    viewModel.curses.forEach(({ curse, index, listType }) => {
        const row = renderCurseRow(curse, index, listType);
        tbody.appendChild(row);
    });
    
    // Update summary
    const summaryEl = document.getElementById('completed-curses-summary');
    if (summaryEl) {
        summaryEl.textContent = viewModel.summaryText;
    }
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

/**
 * Render a bonus card element
 */
function createBonusCard(bonus, value, containerId) {
    const card = document.createElement('div');
    card.className = 'quest-bonus-card';
    card.dataset.value = value;
    card.dataset.containerId = containerId;
    
    const header = document.createElement('div');
    header.className = 'quest-bonus-card-header';
    
    // Try to get image for items
    let imageSrc = null;
    if (bonus.type === 'item' && bonus.itemData && bonus.itemData.img) {
        const baseurl = (window.__BASEURL || '').replace(/\/+$/, '');
        imageSrc = toLocalOrCdnUrl(bonus.itemData.img, baseurl);
    }
    
    if (imageSrc) {
        const img = document.createElement('img');
        img.className = 'quest-bonus-card-image';
        img.src = imageSrc;
        img.alt = bonus.name;
        header.appendChild(img);
    } else {
        card.classList.add('no-image');
    }
    
    const titleDiv = document.createElement('div');
    titleDiv.style.flex = '1';
    
    const title = document.createElement('h4');
    title.className = 'quest-bonus-card-title';
    title.textContent = bonus.name;
    titleDiv.appendChild(title);
    
    const type = document.createElement('div');
    type.className = 'quest-bonus-card-type';
    type.textContent = bonus.typeLabel || bonus.type;
    titleDiv.appendChild(type);
    
    header.appendChild(titleDiv);
    card.appendChild(header);
    
    const description = document.createElement('p');
    description.className = 'quest-bonus-card-description';
    description.textContent = bonus.description;
    card.appendChild(description);
    
    // Handle click to toggle selection
    card.addEventListener('click', () => {
        card.classList.toggle('selected');
        updateBonusSelection(containerId);
    });
    
    return card;
}

/**
 * Update the hidden input with selected bonus values
 */
function updateBonusSelection(containerId) {
    const container = document.getElementById(containerId);
    const hiddenInput = containerId === 'quest-bonus-selection-container' 
        ? document.getElementById('quest-buffs-select')
        : document.getElementById('edit-quest-buffs-select');
    
    if (!container || !hiddenInput) return;
    
    const selectedCards = container.querySelectorAll('.quest-bonus-card.selected');
    const selectedValues = Array.from(selectedCards).map(card => card.dataset.value);
    hiddenInput.value = JSON.stringify(selectedValues);
}

/**
 * Render bonus selection cards for a specific container
 */
function renderBonusCards(containerId, hiddenInputId, selectedValues = []) {
    const container = document.getElementById(containerId);
    const hiddenInput = document.getElementById(hiddenInputId);
    if (!container || !hiddenInput) return;
    
    container.innerHTML = '';
    
    const bonuses = [];
    const baseurl = (window.__BASEURL || '').replace(/\/+$/, '');
    
    // Add keeper background bonuses
    const keeperBackgroundSelect = document.getElementById('keeperBackground');
    const background = keeperBackgroundSelect ? keeperBackgroundSelect.value : '';
    
    if (background) {
        if (background === 'archivist') {
            bonuses.push({
                value: '[Background] Archivist Bonus',
                name: 'Archivist Bonus',
                description: '+10 Ink Drops (Non-Fiction/Historical Fiction)',
                type: 'background',
                typeLabel: 'Background Bonus'
            });
        }
        
        if (background === 'prophet') {
            bonuses.push({
                value: '[Background] Prophet Bonus',
                name: 'Prophet Bonus',
                description: '+10 Ink Drops (Religious/Spiritual/Mythological)',
                type: 'background',
                typeLabel: 'Background Bonus'
            });
        }
        
        if (background === 'cartographer') {
            bonuses.push({
                value: '[Background] Cartographer Bonus',
                name: 'Cartographer Bonus',
                description: '+10 Ink Drops (First Dungeon Crawl this month)',
                type: 'background',
                typeLabel: 'Background Bonus'
            });
        }
    }
    
    // Add active temporary buffs
    const activeBuffs = characterState.temporaryBuffs.filter(buff => buff.status === 'active');
    activeBuffs.forEach((buff) => {
        bonuses.push({
            value: `[Buff] ${buff.name}`,
            name: buff.name,
            description: buff.description || 'Temporary buff',
            type: 'buff',
            typeLabel: 'Temporary Buff'
        });
    });
    
    // Add equipped items (filter out excluded items)
    if (characterState.equippedItems && characterState.equippedItems.length > 0) {
        characterState.equippedItems.forEach((item) => {
            const itemData = allItems[item.name];
            // Skip items that should be excluded from quest bonuses
            if (itemData && !shouldExcludeFromQuestBonuses(itemData)) {
                bonuses.push({
                    value: `[Item] ${item.name}`,
                    name: item.name,
                    description: item.bonus || 'Equipped item',
                    type: 'item',
                    typeLabel: 'Equipped Item',
                    itemData: itemData
                });
            }
        });
    }
    
    // Add passive item slot items (filter out excluded items)
    const passiveItemSlots = characterState[STORAGE_KEYS.PASSIVE_ITEM_SLOTS] || [];
    const passiveItemsWithNames = passiveItemSlots.filter(slot => slot.itemName);
    passiveItemsWithNames.forEach((slot) => {
        const itemData = allItems[slot.itemName];
        if (itemData && itemData.passiveBonus && !shouldExcludeFromQuestBonuses(itemData)) {
            bonuses.push({
                value: `[Item] ${slot.itemName}`,
                name: slot.itemName,
                description: itemData.passiveBonus,
                type: 'item',
                typeLabel: 'Passive Item',
                itemData: itemData
            });
        }
    });
    
    // Add passive familiar slot familiars (filter out excluded items)
    const passiveFamiliarSlots = characterState[STORAGE_KEYS.PASSIVE_FAMILIAR_SLOTS] || [];
    const passiveFamiliarsWithNames = passiveFamiliarSlots.filter(slot => slot.itemName);
    passiveFamiliarsWithNames.forEach((slot) => {
        const itemData = allItems[slot.itemName];
        if (itemData && itemData.passiveBonus && !shouldExcludeFromQuestBonuses(itemData)) {
            bonuses.push({
                value: `[Item] ${slot.itemName}`,
                name: slot.itemName,
                description: itemData.passiveBonus,
                type: 'item',
                typeLabel: 'Passive Familiar',
                itemData: itemData
            });
        }
    });
    
    if (bonuses.length === 0) {
        const message = document.createElement('p');
        message.className = 'no-bonuses-message';
        message.textContent = 'No bonuses available. Equip items or activate buffs to see them here.';
        container.appendChild(message);
        hiddenInput.value = JSON.stringify([]);
        return;
    }
    
    // Render bonus cards
    bonuses.forEach(bonus => {
        const card = createBonusCard(bonus, bonus.value, containerId);
        
        // Restore selection state
        if (selectedValues.includes(bonus.value)) {
            card.classList.add('selected');
        }
        
        container.appendChild(card);
    });
    
    // Update hidden input with current selection
    updateBonusSelection(containerId);
}

/**
 * Render bonus selection cards
 */
export function updateQuestBuffsDropdown(wearableSlotsInput, nonWearableSlotsInput, familiarSlotsInput) {
    const hiddenInput = document.getElementById('quest-buffs-select');
    const currentSelection = hiddenInput && hiddenInput.value ? JSON.parse(hiddenInput.value) : [];
    renderBonusCards('quest-bonus-selection-container', 'quest-buffs-select', currentSelection);
}

/**
 * Update bonus selection for edit quest drawer
 */
export function updateEditQuestBuffsDropdown(selectedValues = []) {
    renderBonusCards('edit-quest-bonus-selection-container', 'edit-quest-buffs-select', selectedValues);
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
    renderPassiveEquipment();
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

/**
 * Render passive equipment section (from restoration projects)
 */
export function renderPassiveEquipment() {
    renderPassiveItemSlots();
    renderPassiveFamiliarSlots();
}

/**
 * Render passive item slots in character sheet
 */
function renderPassiveItemSlots() {
    const container = document.getElementById('passive-item-slots-character-sheet');
    if (!container) return;

    const passiveSlots = characterState[STORAGE_KEYS.PASSIVE_ITEM_SLOTS] || [];
    
    clearElement(container);

    if (passiveSlots.length === 0) {
        const message = document.createElement('p');
        message.className = 'no-slots-message';
        message.textContent = 'Complete restoration projects to unlock display slots.';
        container.appendChild(message);
        return;
    }

    passiveSlots.forEach(slot => {
        const card = createPassiveSlotCard(slot, [], 'item');
        container.appendChild(card);
    });
}

/**
 * Render passive familiar slots in character sheet
 */
function renderPassiveFamiliarSlots() {
    const container = document.getElementById('passive-familiar-slots-character-sheet');
    if (!container) return;

    const passiveSlots = characterState[STORAGE_KEYS.PASSIVE_FAMILIAR_SLOTS] || [];
    
    clearElement(container);

    if (passiveSlots.length === 0) {
        const message = document.createElement('p');
        message.className = 'no-slots-message';
        message.textContent = 'Complete restoration projects to unlock adoption slots.';
        container.appendChild(message);
        return;
    }

    passiveSlots.forEach(slot => {
        const card = createPassiveSlotCard(slot, [], 'familiar');
        container.appendChild(card);
    });
}

/**
 * Create a passive slot card element
 */
function createPassiveSlotCard(slot, availableItems, slotType) {
    const card = document.createElement('div');
    card.className = 'passive-slot-card';
    card.setAttribute('data-slot-id', slot.slotId);
    card.setAttribute('data-slot-type', slotType);

    const currentItem = slot.itemName;
    // Try to find item data - check exact match first, then case-insensitive
    let itemData = currentItem && allItems[currentItem];
    if (currentItem && !itemData) {
        // Fallback: try case-insensitive lookup
        const itemKey = Object.keys(allItems).find(key => 
            key.toLowerCase() === currentItem.toLowerCase()
        );
        if (itemKey) {
            itemData = allItems[itemKey];
        }
    }

    const source = document.createElement('div');
    source.className = 'slot-source';
    source.textContent = `From: ${slot.unlockedFrom || 'Unknown'}`;
    card.appendChild(source);

    if (currentItem) {
        if (itemData) {
            // Show the item card (will display passive bonus since isInPassiveSlot is true)
            // Add special data attributes to identify this as a passive slot item for button handlers
            const itemCard = renderItemCard(
                { name: currentItem, ...itemData },
                -1, // No index needed for passive slot items
                { 
                    showDelete: false, 
                    isInPassiveSlot: true,
                    showEquip: true // Show equip button on passive slot items
                }
            );
            
            // Mark buttons with special attributes for passive slot items
            const equipBtn = itemCard.querySelector('.equip-btn');
            if (equipBtn) {
                equipBtn.classList.add('equip-from-passive-btn');
                equipBtn.setAttribute('data-passive-slot-id', slot.slotId);
                equipBtn.setAttribute('data-passive-slot-type', slotType);
                equipBtn.removeAttribute('data-index'); // Remove index since this isn't from inventory
            }
            
            card.appendChild(itemCard);
        } else {
            // Item name exists but data not found - show error state
            const errorCard = document.createElement('div');
            errorCard.className = 'item-card';
            errorCard.style.opacity = '0.7';
            
            const errorInfo = document.createElement('div');
            errorInfo.className = 'item-info';
            
            const errorName = document.createElement('h4');
            errorName.textContent = currentItem || 'Unknown Item';
            errorInfo.appendChild(errorName);
            
            const errorMsg = document.createElement('p');
            errorMsg.style.color = '#8a6262';
            errorMsg.textContent = 'Item data not found. This item may have been removed or renamed.';
            errorInfo.appendChild(errorMsg);
            
            errorCard.appendChild(errorInfo);
            card.appendChild(errorCard);
        }
        
        // Add remove button - styled like other action buttons (always show if item name exists)
        const removeBtn = document.createElement('button');
        removeBtn.type = 'button';
        removeBtn.className = 'remove-passive-item-btn action-btn';
        removeBtn.textContent = 'Remove';
        removeBtn.setAttribute('data-slot-id', slot.slotId);
        removeBtn.setAttribute('data-slot-type', slotType);
        card.appendChild(removeBtn);
    } else {
        // Empty slot - show placeholder
        const emptySlot = document.createElement('div');
        emptySlot.className = 'empty-passive-slot';
        emptySlot.textContent = `Empty ${slotType === 'item' ? 'item' : 'familiar'} slot`;
        card.appendChild(emptySlot);
    }

    return card;
}

// Dark academia color palette for shelf books
const SHELF_COLORS = Object.freeze([
    '#722F37', // Deep Burgundy
    '#2D4739', // Forest Green
    '#2C3E50', // Navy Blue
    '#4A3728'  // Plum
]);

const TOTAL_SHELF_BOOKS = 10;

/**
 * Get a random color from the shelf color palette
 * @returns {string} - Random hex color from the palette
 */
export function getRandomShelfColor() {
    return SHELF_COLORS[Math.floor(Math.random() * SHELF_COLORS.length)];
}

/**
 * Render the completed reads shelf visualization by setting SVG fill colors
 * @param {number} booksCompleted - Number of books completed this month
 * @param {Array} shelfColors - Array of assigned colors for each book slot
 */
export function renderShelfBooks(booksCompleted, shelfColors = []) {
    const svg = document.getElementById('completed-reads-shelf');
    if (!svg) return;
    
    for (let i = 0; i < TOTAL_SHELF_BOOKS; i++) {
        const bookPath = document.getElementById(`shelf-book-${i}`);
        if (!bookPath) continue;
        
        // Color the book if it's within the completed count and has an assigned color
        if (i < booksCompleted && shelfColors[i]) {
            bookPath.setAttribute('fill', shelfColors[i]);
        } else {
            bookPath.setAttribute('fill', 'transparent');
        }
    }
}

/**
 * Display calculation receipt breakdown for a completed quest
 * @param {Object} receipt - Receipt object from Reward.getReceipt()
 * @param {string} questType - Quest type for context
 * @param {string} questPrompt - Quest prompt for context
 */
export function displayCalculationReceipt(receipt, questType = '', questPrompt = '') {
    if (!receipt || !receipt.base) {
        return; // No receipt to display
    }

    // Create receipt container
    const receiptContainer = document.createElement('div');
    receiptContainer.className = 'calculation-receipt';
    receiptContainer.style.cssText = `
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        background: #2C1810;
        border: 2px solid #8B7355;
        border-radius: 8px;
        padding: 20px;
        max-width: 600px;
        max-height: 80vh;
        overflow-y: auto;
        z-index: 10000;
        box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5);
        font-family: 'Crimson Text', serif;
        color: #E8DCC6;
    `;

    // Header
    const header = document.createElement('div');
    header.style.cssText = 'display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px; border-bottom: 1px solid #8B7355; padding-bottom: 10px;';
    
    const title = document.createElement('h3');
    title.textContent = 'Reward Calculation Breakdown';
    title.style.cssText = 'margin: 0; color: #D4A574; font-size: 1.2em;';
    header.appendChild(title);

    const closeBtn = document.createElement('button');
    closeBtn.textContent = '×';
    closeBtn.style.cssText = `
        background: transparent;
        border: 1px solid #8B7355;
        color: #E8DCC6;
        width: 30px;
        height: 30px;
        border-radius: 4px;
        cursor: pointer;
        font-size: 1.5em;
        line-height: 1;
    `;
    closeBtn.onclick = () => receiptContainer.remove();
    closeBtn.onmouseover = () => closeBtn.style.background = '#8B7355';
    closeBtn.onmouseout = () => closeBtn.style.background = 'transparent';
    header.appendChild(closeBtn);

    receiptContainer.appendChild(header);

    // Quest info (if provided)
    if (questType || questPrompt) {
        const questInfo = document.createElement('div');
        questInfo.style.cssText = 'margin-bottom: 15px; padding: 10px; background: rgba(139, 115, 85, 0.2); border-radius: 4px;';
        if (questType) {
            const typeEl = document.createElement('div');
            typeEl.textContent = `Quest: ${questType}`;
            typeEl.style.cssText = 'font-weight: bold; margin-bottom: 5px;';
            questInfo.appendChild(typeEl);
        }
        if (questPrompt) {
            const promptEl = document.createElement('div');
            promptEl.textContent = `Prompt: ${questPrompt}`;
            promptEl.style.cssText = 'font-style: italic; color: #D4A574;';
            questInfo.appendChild(promptEl);
        }
        receiptContainer.appendChild(questInfo);
    }

    // Base rewards
    const baseSection = document.createElement('div');
    baseSection.style.cssText = 'margin-bottom: 15px;';
    const baseTitle = document.createElement('h4');
    baseTitle.textContent = 'Base Rewards';
    baseTitle.style.cssText = 'margin: 0 0 10px 0; color: #D4A574; font-size: 1em;';
    baseSection.appendChild(baseTitle);

    const baseList = document.createElement('ul');
    baseList.style.cssText = 'list-style: none; padding: 0; margin: 0;';
    
    if (receipt.base.xp > 0) {
        const li = document.createElement('li');
        li.textContent = `XP: +${receipt.base.xp}`;
        li.style.cssText = 'padding: 5px 0;';
        baseList.appendChild(li);
    }
    if (receipt.base.inkDrops > 0) {
        const li = document.createElement('li');
        li.textContent = `Ink Drops: +${receipt.base.inkDrops}`;
        li.style.cssText = 'padding: 5px 0;';
        baseList.appendChild(li);
    }
    if (receipt.base.paperScraps > 0) {
        const li = document.createElement('li');
        li.textContent = `Paper Scraps: +${receipt.base.paperScraps}`;
        li.style.cssText = 'padding: 5px 0;';
        baseList.appendChild(li);
    }
    if (receipt.base.blueprints > 0) {
        const li = document.createElement('li');
        li.textContent = `Dusty Blueprints: +${receipt.base.blueprints}`;
        li.style.cssText = 'padding: 5px 0;';
        baseList.appendChild(li);
    }
    if (baseList.children.length === 0) {
        const li = document.createElement('li');
        li.textContent = 'No base rewards';
        li.style.cssText = 'padding: 5px 0; color: #8B7355; font-style: italic;';
        baseList.appendChild(li);
    }

    baseSection.appendChild(baseList);
    receiptContainer.appendChild(baseSection);

    // Modifiers
    if (receipt.modifiers && receipt.modifiers.length > 0) {
        const modifiersSection = document.createElement('div');
        modifiersSection.style.cssText = 'margin-bottom: 15px;';
        const modifiersTitle = document.createElement('h4');
        modifiersTitle.textContent = 'Applied Modifiers';
        modifiersTitle.style.cssText = 'margin: 0 0 10px 0; color: #D4A574; font-size: 1em;';
        modifiersSection.appendChild(modifiersTitle);

        const modifiersList = document.createElement('ul');
        modifiersList.style.cssText = 'list-style: none; padding: 0; margin: 0;';

        receipt.modifiers.forEach(modifier => {
            const li = document.createElement('li');
            li.style.cssText = 'padding: 8px; margin-bottom: 5px; background: rgba(139, 115, 85, 0.15); border-left: 3px solid #D4A574; border-radius: 4px;';
            
            const source = document.createElement('div');
            source.textContent = modifier.source;
            source.style.cssText = 'font-weight: bold; color: #D4A574; margin-bottom: 3px;';
            li.appendChild(source);

            const description = document.createElement('div');
            description.textContent = modifier.description;
            description.style.cssText = 'font-size: 0.9em; color: #E8DCC6;';
            li.appendChild(description);

            modifiersList.appendChild(li);
        });

        modifiersSection.appendChild(modifiersList);
        receiptContainer.appendChild(modifiersSection);
    }

    // Final rewards
    const finalSection = document.createElement('div');
    finalSection.style.cssText = 'margin-top: 15px; padding: 15px; background: rgba(212, 165, 116, 0.1); border-radius: 4px; border: 1px solid #D4A574;';
    const finalTitle = document.createElement('h4');
    finalTitle.textContent = 'Final Rewards';
    finalTitle.style.cssText = 'margin: 0 0 10px 0; color: #D4A574; font-size: 1.1em;';
    finalSection.appendChild(finalTitle);

    const finalList = document.createElement('ul');
    finalList.style.cssText = 'list-style: none; padding: 0; margin: 0;';

    if (receipt.final.xp > 0) {
        const li = document.createElement('li');
        li.textContent = `XP: +${receipt.final.xp}`;
        li.style.cssText = 'padding: 5px 0; font-weight: bold;';
        finalList.appendChild(li);
    }
    if (receipt.final.inkDrops > 0) {
        const li = document.createElement('li');
        li.textContent = `Ink Drops: +${receipt.final.inkDrops}`;
        li.style.cssText = 'padding: 5px 0; font-weight: bold;';
        finalList.appendChild(li);
    }
    if (receipt.final.paperScraps > 0) {
        const li = document.createElement('li');
        li.textContent = `Paper Scraps: +${receipt.final.paperScraps}`;
        li.style.cssText = 'padding: 5px 0; font-weight: bold;';
        finalList.appendChild(li);
    }
    if (receipt.final.blueprints > 0) {
        const li = document.createElement('li');
        li.textContent = `Dusty Blueprints: +${receipt.final.blueprints}`;
        li.style.cssText = 'padding: 5px 0; font-weight: bold;';
        finalList.appendChild(li);
    }
    if (receipt.items && receipt.items.length > 0) {
        const li = document.createElement('li');
        li.textContent = `Items: ${receipt.items.join(', ')}`;
        li.style.cssText = 'padding: 5px 0; font-weight: bold; color: #D4A574;';
        finalList.appendChild(li);
    }

    finalSection.appendChild(finalList);
    receiptContainer.appendChild(finalSection);

    // Add backdrop
    const backdrop = document.createElement('div');
    backdrop.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0, 0, 0, 0.7);
        z-index: 9999;
    `;
    backdrop.onclick = () => {
        backdrop.remove();
        receiptContainer.remove();
    };

    document.body.appendChild(backdrop);
    document.body.appendChild(receiptContainer);

    // Auto-close after 10 seconds (optional)
    setTimeout(() => {
        if (backdrop.parentNode) backdrop.remove();
        if (receiptContainer.parentNode) receiptContainer.remove();
    }, 10000);
}