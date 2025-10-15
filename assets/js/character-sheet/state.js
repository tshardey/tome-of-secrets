export let characterState = {
    learnedAbilities: [],
    equippedItems: [],
    inventoryItems: [],
    activeAssignments: [],
    completedQuests: [],
    discardedQuests: [],
    atmosphericBuffs: {}
};

export function loadState(form) {
    const characterData = JSON.parse(localStorage.getItem('characterSheet'));
    if (characterData) {
        for (const key in characterData) {
            if (form.elements[key]) form.elements[key].value = characterData[key];
        }
    }
    characterState.activeAssignments = JSON.parse(localStorage.getItem('activeAssignments')) || [];
    characterState.completedQuests = JSON.parse(localStorage.getItem('completedQuests')) || [];
    characterState.discardedQuests = JSON.parse(localStorage.getItem('discardedQuests')) || [];
    characterState.equippedItems = JSON.parse(localStorage.getItem('equippedItems')) || [];
    characterState.inventoryItems = JSON.parse(localStorage.getItem('inventoryItems')) || [];
    characterState.learnedAbilities = JSON.parse(localStorage.getItem('learnedAbilities')) || [];
    characterState.atmosphericBuffs = JSON.parse(localStorage.getItem('atmosphericBuffs')) || {};
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