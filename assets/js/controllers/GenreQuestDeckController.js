/**
 * GenreQuestDeckController - Handles genre quest deck card draw functionality
 * 
 * Manages:
 * - Genre quest deck UI
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
    getAvailableGenreQuests,
    drawRandomGenreQuest
} from '../services/GenreQuestDeckService.js';
import { createGenreQuestDeckViewModel } from '../viewModels/questDeckViewModel.js';
import { renderCardback, renderGenreQuestCard } from '../character-sheet/cardRenderer.js';
import { clearElement } from '../utils/domHelpers.js';
import { toast } from '../ui/toast.js';

export class GenreQuestDeckController extends BaseController {
    constructor(stateAdapter, form, dependencies) {
        super(stateAdapter, form, dependencies);
        this.drawnQuest = null;
    }

    initialize() {
        const { stateAdapter, form } = this;
        const { ui: uiModule } = this.dependencies;

        if (!uiModule) return;

        // Get DOM elements
        const deckContainer = document.getElementById('genre-quest-deck-container');
        const drawnCardDisplay = document.getElementById('genre-quest-drawn-card-display');
        const addQuestButton = document.getElementById('add-genre-quest-btn');
        const clearDrawButton = document.getElementById('clear-genre-quest-draw-btn');

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

        // Listen to genre selection changes to update deck
        stateAdapter.on(STATE_EVENTS.SELECTED_GENRES_CHANGED, () => {
            // Use setTimeout to ensure state has fully updated
            setTimeout(() => {
                this.renderDeck();
            }, 0);
        });

        // Also listen for DOM custom event as a fallback
        document.addEventListener('genre-selection-changed', () => {
            this.renderDeck();
        });
    }

    /**
     * Render deck UI (cardback and drawn card)
     */
    renderDeck() {
        const viewModel = createGenreQuestDeckViewModel(characterState, this.drawnQuest);
        
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

        const viewModel = createGenreQuestDeckViewModel(characterState, this.drawnQuest);
        
        // Render quest card
        if (viewModel.drawnQuest) {
            const questCard = renderGenreQuestCard(viewModel.drawnQuest);
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
        const availableQuests = getAvailableGenreQuests(characterState);
        if (availableQuests.length === 0) return;

        const drawnQuest = drawRandomGenreQuest(availableQuests);
        if (!drawnQuest) return;

        this.drawnQuest = drawnQuest;
        this.renderDeck();
    }

    /**
     * Handle "Add Quest" button - create quest from drawn card
     */
    handleAddQuestFromCard() {
        if (!this.drawnQuest) return;
        
        // Build prompt: genre + description
        const prompt = `${this.drawnQuest.genre}: ${this.drawnQuest.description}`;
        
        const rewards = RewardCalculator.getBaseRewards('♥ Organize the Stacks', prompt);

        const quest = {
            type: '♥ Organize the Stacks',
            prompt: prompt,
            rewards: rewards,
            buffs: []
        };

        // Genre quests are fully repeatable - no duplicate check needed
        // Players can read multiple books in the same genre

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
