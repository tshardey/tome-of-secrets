export let characterState = {
    learnedAbilities: [],
    equippedItems: [],
    inventoryItems: [],
    activeAssignments: [],
    completedQuests: [],
    discardedQuests: [],
    atmosphericBuffs: {},
    activeCurses: [],
    completedCurses: []
};

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
    const characterData = JSON.parse(localStorage.getItem('characterSheet'));
    if (characterData) {
        for (const key in characterData) {
            if (form.elements[key]) form.elements[key].value = characterData[key];
        }
    }
    const activeAssignments = JSON.parse(localStorage.getItem('activeAssignments')) || [];
    const completedQuests = JSON.parse(localStorage.getItem('completedQuests')) || [];
    const discardedQuests = JSON.parse(localStorage.getItem('discardedQuests')) || [];
    
    // Migrate old quests to include reward data
    characterState.activeAssignments = migrateOldQuests(activeAssignments);
    characterState.completedQuests = migrateOldQuests(completedQuests);
    characterState.discardedQuests = migrateOldQuests(discardedQuests);
    
    characterState.equippedItems = JSON.parse(localStorage.getItem('equippedItems')) || [];
    characterState.inventoryItems = JSON.parse(localStorage.getItem('inventoryItems')) || [];
    characterState.learnedAbilities = JSON.parse(localStorage.getItem('learnedAbilities')) || [];
    characterState.atmosphericBuffs = JSON.parse(localStorage.getItem('atmosphericBuffs')) || {};
    characterState.activeCurses = JSON.parse(localStorage.getItem('activeCurses')) || [];
    characterState.completedCurses = JSON.parse(localStorage.getItem('completedCurses')) || [];
}

export function saveState(form) {
    const characterData = {};
    for (const element of form.elements) {
        if (element.id && element.type !== 'button' && !element.id.startsWith('new-quest-') && element.id !== 'item-select' && element.id !== 'ability-select' && element.id !== 'xp-needed') {
            characterData[element.id] = element.value;
        }
    }
    localStorage.setItem('characterSheet', JSON.stringify(characterData));
    Object.keys(characterState).forEach(key => localStorage.setItem(key, JSON.stringify(characterState[key])));
}