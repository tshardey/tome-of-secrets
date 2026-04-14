/**
 * Consolidated deck action button wiring.
 * Wires "Add selected" and "Clear draw" buttons across all deck controllers.
 */

export function createUpdateDeckActionsLabel(addSelectedBtn, deckControllers) {
    return function updateDeckActionsLabel() {
        if (!addSelectedBtn) return;
        const n = (deckControllers.genreQuestDeck.selectedIndices?.size ?? 0) +
            (deckControllers.sideQuestDeck.selectedIndices?.size ?? 0) +
            (deckControllers.atmosphericBuffDeck.selectedIndices?.size ?? 0) +
            (deckControllers.dungeonDeck.selectedIndices?.size ?? 0) +
            (deckControllers.otherQuestDeck.selectedIndices?.size ?? 0) +
            (deckControllers.otherQuestDeck.selectedIndicesExtraCredit?.size ?? 0);
        addSelectedBtn.textContent = n > 0 ? `Add selected (${n})` : 'Add selected';
        addSelectedBtn.disabled = n === 0;
    };
}

export function initializeDeckActions(deckControllers) {
    const addSelectedBtn = document.getElementById('add-selected-cards-btn');
    const clearDrawBtn = document.getElementById('clear-drawn-cards-btn');

    if (addSelectedBtn) {
        addSelectedBtn.addEventListener('click', () => {
            deckControllers.genreQuestDeck.handleAddQuestFromCard();
            deckControllers.sideQuestDeck.handleAddQuestFromCard();
            deckControllers.atmosphericBuffDeck.handleActivateBuff();
            deckControllers.dungeonDeck.handleAddQuestFromCards();
            deckControllers.otherQuestDeck.handleAddExtraCreditFromCard();
            deckControllers.otherQuestDeck.handleAddRestorationFromCard();
        });
    }

    if (clearDrawBtn) {
        clearDrawBtn.addEventListener('click', () => {
            deckControllers.genreQuestDeck.handleClearDraw();
            deckControllers.sideQuestDeck.handleClearDraw();
            deckControllers.atmosphericBuffDeck.handleClearDraw();
            deckControllers.dungeonDeck.handleClearDraw();
            deckControllers.otherQuestDeck.handleClearDraw();
        });
    }

    const updateDeckActionsLabel = createUpdateDeckActionsLabel(addSelectedBtn, deckControllers);
    updateDeckActionsLabel();

    return updateDeckActionsLabel;
}
