/**
 * SideQuestDeckController - Handles side quest deck card draw functionality
 * 
 * Manages:
 * - Side quest deck UI
 * - Card drawing
 * - Quest creation from drawn card
 * - Deck state updates on quest completion
 */

import { BaseController } from './BaseController.js';
import { STATE_EVENTS } from '../character-sheet/stateAdapter.js';
import { STORAGE_KEYS } from '../character-sheet/storageKeys.js';
import { characterState } from '../character-sheet/state.js';
import { RewardCalculator } from '../services/RewardCalculator.js';
import {
    getAvailableSideQuests,
    drawRandomSideQuest
} from '../services/SideQuestDeckService.js';
import { createSideQuestDeckViewModel } from '../viewModels/questDeckViewModel.js';
import { renderCardback, renderSideQuestCard } from '../character-sheet/cardRenderer.js';
import { clearElement } from '../utils/domHelpers.js';
import { toast } from '../ui/toast.js';

export class SideQuestDeckController extends BaseController {
    constructor(stateAdapter, form, dependencies) {
        super(stateAdapter, form, dependencies);
        this.drawnQuest = null;
    }

    initialize() {
        const { stateAdapter, form } = this;
        const { ui: uiModule } = this.dependencies;

        if (!uiModule) return;

        // Get DOM elements
        const deckContainer = document.getElementById('side-quest-deck-container');
        const drawnCardDisplay = document.getElementById('side-quest-drawn-card-display');
        const addQuestButton = document.getElementById('add-side-quest-btn');
        const clearDrawButton = document.getElementById('clear-side-quest-draw-btn');

        if (!deckContainer || !drawnCardDisplay) return;

        // Store elements
        this.deckContainer = deckContainer;
        this.drawnCardDisplay = drawnCardDisplay;
        this.addQuestButton = addQuestButton;
        this.clearDrawButton = clearDrawButton;

        // Initial render
        this.renderDeck();

        // Deck click handler
        this.addEventListener(deckContainer, 'click', () => {
            this.handleDeckClick();
        });

        // Add quest button
        if (addQuestButton) {
            this.addEventListener(addQuestButton, 'click', () => {
                this.handleAddQuestFromCard();
            });
        }

        // Clear draw button
        if (clearDrawButton) {
            this.addEventListener(clearDrawButton, 'click', () => {
                this.handleClearDraw();
            });
        }

        // Listen to quest completion events to update deck
        stateAdapter.on(STATE_EVENTS.COMPLETED_QUESTS_CHANGED, () => {
            this.renderDeck();
        });

        stateAdapter.on(STATE_EVENTS.ACTIVE_ASSIGNMENTS_CHANGED, () => {
            this.renderDeck();
        });
    }

    /**
     * Render deck UI (cardback and drawn card)
     */
    renderDeck() {
        const viewModel = createSideQuestDeckViewModel(characterState, this.drawnQuest);
        
        // Render deck
        clearElement(this.deckContainer);
        const deck = renderCardback(
            viewModel.deck.cardbackImage,
            viewModel.deck.available,
            viewModel.deck.availableCount
        );
        this.deckContainer.appendChild(deck);

        // Render drawn card if any
        this.renderDrawnCard();
    }

    /**
     * Render drawn card
     */
    renderDrawnCard() {
        clearElement(this.drawnCardDisplay);
        
        if (!this.drawnQuest) {
            if (this.addQuestButton) this.addQuestButton.style.display = 'none';
            if (this.clearDrawButton) this.clearDrawButton.style.display = 'none';
            return;
        }

        const viewModel = createSideQuestDeckViewModel(characterState, this.drawnQuest);
        
        // Render quest card
        if (viewModel.drawnQuest) {
            const questCard = renderSideQuestCard(viewModel.drawnQuest);
            if (questCard) {
                this.drawnCardDisplay.appendChild(questCard);
            }
        }

        // Show action buttons
        if (this.addQuestButton) this.addQuestButton.style.display = 'block';
        if (this.clearDrawButton) this.clearDrawButton.style.display = 'block';
    }

    /**
     * Handle deck click - draw a random quest
     */
    handleDeckClick() {
        const availableQuests = getAvailableSideQuests(characterState);
        if (availableQuests.length === 0) return;

        const drawnQuest = drawRandomSideQuest(availableQuests);
        if (!drawnQuest) return;

        this.drawnQuest = drawnQuest;
        this.renderDeck();
    }

    /**
     * Check if a quest already exists in active assignments
     * @param {Object} quest - Quest object to check
     * @param {Array} activeQuests - Array of active quest objects
     * @returns {boolean} True if quest already exists
     */
    isQuestDuplicate(quest, activeQuests) {
        for (const existingQuest of activeQuests) {
            if (existingQuest.type !== quest.type) continue;
            
            // Match by prompt
            if (quest.prompt && existingQuest.prompt && quest.prompt === existingQuest.prompt) {
                return true;
            }
        }
        return false;
    }

    /**
     * Handle "Add Quest" button - create quest from drawn card
     */
    handleAddQuestFromCard() {
        if (!this.drawnQuest) return;

        const activeQuests = characterState[STORAGE_KEYS.ACTIVE_ASSIGNMENTS] || [];
        
        // Build prompt: name + prompt
        const prompt = `${this.drawnQuest.name}: ${this.drawnQuest.prompt}`;
        
        const rewards = RewardCalculator.getBaseRewards('♣ Side Quest', prompt);

        const quest = {
            type: '♣ Side Quest',
            prompt: prompt,
            rewards: rewards,
            buffs: []
        };

        // Check if quest is duplicate
        if (this.isQuestDuplicate(quest, activeQuests)) {
            toast.warning('This side quest is already in your quest log.');
            return;
        }

        // Convert rewards to JSON (for storage)
        const questJSON = {
            ...quest,
            rewards: rewards.toJSON ? rewards.toJSON() : rewards
        };

        // Add quest to active assignments
        this.stateAdapter.addActiveQuests([questJSON]);
        
        // Update UI to show newly added quest
        if (this.dependencies.ui) {
            this.dependencies.ui.renderActiveAssignments();
        }

        // Clear drawn card
        this.handleClearDraw();

        // Save state
        this.saveState();
    }

    /**
     * Handle "Clear Draw" button - clear drawn card
     */
    handleClearDraw() {
        this.drawnQuest = null;
        this.renderDeck();
    }
}
