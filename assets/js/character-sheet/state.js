import { STORAGE_KEYS, CHARACTER_STATE_KEYS, createEmptyCharacterState } from './storageKeys.js';
import { GAME_CONFIG } from '../config/gameConfig.js';
import { safeGetJSON, safeSetJSON } from '../utils/storage.js';

export const characterState = createEmptyCharacterState();

function getQuestRewardsLegacy(type, prompt, isEncounter = false) {
    // Default reward for any quest completion
    let rewards = {
        xp: GAME_CONFIG.rewards.defaultQuestCompletion.xp,
        inkDrops: GAME_CONFIG.rewards.defaultQuestCompletion.inkDrops,
        paperScraps: GAME_CONFIG.rewards.defaultQuestCompletion.paperScraps,
        items: []
    };

    if (type === '♥ Organize the Stacks') {
        rewards = {
            xp: GAME_CONFIG.rewards.organizeTheStacks.xp,
            inkDrops: GAME_CONFIG.rewards.organizeTheStacks.inkDrops,
            paperScraps: 0,
            items: []
        };
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
    const characterData = safeGetJSON(STORAGE_KEYS.CHARACTER_SHEET_FORM, null);
    if (characterData) {
        for (const key in characterData) {
            if (form.elements[key]) form.elements[key].value = characterData[key];
        }
    }
    const activeAssignments = safeGetJSON(STORAGE_KEYS.ACTIVE_ASSIGNMENTS, []);
    const completedQuests = safeGetJSON(STORAGE_KEYS.COMPLETED_QUESTS, []);
    const discardedQuests = safeGetJSON(STORAGE_KEYS.DISCARDED_QUESTS, []);
    
    // Migrate old quests to include reward data
    characterState[STORAGE_KEYS.ACTIVE_ASSIGNMENTS] = migrateOldQuests(activeAssignments);
    characterState[STORAGE_KEYS.COMPLETED_QUESTS] = migrateOldQuests(completedQuests);
    characterState[STORAGE_KEYS.DISCARDED_QUESTS] = migrateOldQuests(discardedQuests);
    
    characterState[STORAGE_KEYS.EQUIPPED_ITEMS] = safeGetJSON(STORAGE_KEYS.EQUIPPED_ITEMS, []);
    characterState[STORAGE_KEYS.INVENTORY_ITEMS] = safeGetJSON(STORAGE_KEYS.INVENTORY_ITEMS, []);
    characterState[STORAGE_KEYS.LEARNED_ABILITIES] = safeGetJSON(STORAGE_KEYS.LEARNED_ABILITIES, []);
    characterState[STORAGE_KEYS.ATMOSPHERIC_BUFFS] = safeGetJSON(STORAGE_KEYS.ATMOSPHERIC_BUFFS, {});
    characterState[STORAGE_KEYS.ACTIVE_CURSES] = safeGetJSON(STORAGE_KEYS.ACTIVE_CURSES, []);
    characterState[STORAGE_KEYS.COMPLETED_CURSES] = safeGetJSON(STORAGE_KEYS.COMPLETED_CURSES, []);
    characterState[STORAGE_KEYS.TEMPORARY_BUFFS] = safeGetJSON(STORAGE_KEYS.TEMPORARY_BUFFS, []);
    characterState[STORAGE_KEYS.BUFF_MONTH_COUNTER] = safeGetJSON(STORAGE_KEYS.BUFF_MONTH_COUNTER, 0);

    const selectedGenres = safeGetJSON(STORAGE_KEYS.SELECTED_GENRES, []);
    // Ensure it's an array (safeGetJSON already handles this, but being explicit for safety)
    characterState[STORAGE_KEYS.SELECTED_GENRES] = Array.isArray(selectedGenres) ? selectedGenres : [];
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
    safeSetJSON(STORAGE_KEYS.CHARACTER_SHEET_FORM, characterData);
    CHARACTER_STATE_KEYS.forEach(key => {
        safeSetJSON(key, characterState[key]);
    });
}