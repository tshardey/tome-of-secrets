import { STORAGE_KEYS, CHARACTER_STATE_KEYS, createEmptyCharacterState } from './storageKeys.js';

export const characterState = createEmptyCharacterState();

function getQuestRewardsLegacy(type, prompt, isEncounter = false) {
    // Default reward for any quest completion
    let rewards = { xp: 25, inkDrops: 10, paperScraps: 0, items: [] };

    if (type === '♥ Organize the Stacks') {
        rewards = { xp: 15, inkDrops: 10, paperScraps: 0, items: [] };
    }
    // Side quests and dungeon encounters will default to basic rewards for now
    // They'll be calculated properly when edited or completed

    return rewards;
}

function migrateOldQuests(quests) {
    return quests.map(quest => {
        if (!quest.rewards) {
            quest.rewards = getQuestRewardsLegacy(quest.type, quest.prompt, quest.isEncounter);
        }
        return quest;
    });
}

export function loadState(form) {
    const characterData = JSON.parse(localStorage.getItem(STORAGE_KEYS.CHARACTER_SHEET_FORM));
    if (characterData) {
        for (const key in characterData) {
            if (form.elements[key]) form.elements[key].value = characterData[key];
        }
    }
    const activeAssignments = JSON.parse(localStorage.getItem(STORAGE_KEYS.ACTIVE_ASSIGNMENTS)) || [];
    const completedQuests = JSON.parse(localStorage.getItem(STORAGE_KEYS.COMPLETED_QUESTS)) || [];
    const discardedQuests = JSON.parse(localStorage.getItem(STORAGE_KEYS.DISCARDED_QUESTS)) || [];
    
    // Migrate old quests to include reward data
    characterState[STORAGE_KEYS.ACTIVE_ASSIGNMENTS] = migrateOldQuests(activeAssignments);
    characterState[STORAGE_KEYS.COMPLETED_QUESTS] = migrateOldQuests(completedQuests);
    characterState[STORAGE_KEYS.DISCARDED_QUESTS] = migrateOldQuests(discardedQuests);
    
    characterState[STORAGE_KEYS.EQUIPPED_ITEMS] = JSON.parse(localStorage.getItem(STORAGE_KEYS.EQUIPPED_ITEMS)) || [];
    characterState[STORAGE_KEYS.INVENTORY_ITEMS] = JSON.parse(localStorage.getItem(STORAGE_KEYS.INVENTORY_ITEMS)) || [];
    characterState[STORAGE_KEYS.LEARNED_ABILITIES] = JSON.parse(localStorage.getItem(STORAGE_KEYS.LEARNED_ABILITIES)) || [];
    characterState[STORAGE_KEYS.ATMOSPHERIC_BUFFS] = JSON.parse(localStorage.getItem(STORAGE_KEYS.ATMOSPHERIC_BUFFS)) || {};
    characterState[STORAGE_KEYS.ACTIVE_CURSES] = JSON.parse(localStorage.getItem(STORAGE_KEYS.ACTIVE_CURSES)) || [];
    characterState[STORAGE_KEYS.COMPLETED_CURSES] = JSON.parse(localStorage.getItem(STORAGE_KEYS.COMPLETED_CURSES)) || [];
    characterState[STORAGE_KEYS.TEMPORARY_BUFFS] = JSON.parse(localStorage.getItem(STORAGE_KEYS.TEMPORARY_BUFFS)) || [];
    characterState[STORAGE_KEYS.BUFF_MONTH_COUNTER] = JSON.parse(localStorage.getItem(STORAGE_KEYS.BUFF_MONTH_COUNTER)) || 0;

    let selectedGenres = [];
    try {
        selectedGenres = JSON.parse(localStorage.getItem(STORAGE_KEYS.SELECTED_GENRES)) || [];
        if (!Array.isArray(selectedGenres)) {
            selectedGenres = [];
        }
    } catch (error) {
        selectedGenres = [];
    }
    characterState[STORAGE_KEYS.SELECTED_GENRES] = selectedGenres;
}

export function saveState(form) {
    const characterData = {};
    for (const element of form.elements) {
        if (element.id && element.type !== 'button' && !element.id.startsWith('new-quest-') && element.id !== 'item-select' && element.id !== 'ability-select' && element.id !== 'xp-needed') {
            characterData[element.id] = element.value;
        }
    }
    // Explicitly save keeperBackground to ensure it persists
    const keeperBackgroundElement = document.getElementById('keeperBackground');
    if (keeperBackgroundElement) {
        characterData.keeperBackground = keeperBackgroundElement.value;
    }
    localStorage.setItem(STORAGE_KEYS.CHARACTER_SHEET_FORM, JSON.stringify(characterData));
    CHARACTER_STATE_KEYS.forEach(key => {
        localStorage.setItem(key, JSON.stringify(characterState[key]));
    });
}