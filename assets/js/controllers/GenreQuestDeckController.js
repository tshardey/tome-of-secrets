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
import { characterState } from '../character-sheet/state.js';
import { RewardCalculator } from '../services/RewardCalculator.js';
import { assignQuestToPeriod, PERIOD_TYPES } from '../services/PeriodService.js';
import {
    getAvailableGenreQuests,
    drawRandomGenreQuest
} from '../services/GenreQuestDeckService.js';
import { createGenreQuestDeckViewModel } from '../viewModels/questDeckViewModel.js';
import { renderCardback, renderGenreQuestCard, wrapCardSelectable } from '../character-sheet/cardRenderer.js';
import { clearElement } from '../utils/domHelpers.js';
import { toast } from '../ui/toast.js';
import {
    computeQuestDeckDrawCount,
    QUEST_DECK_GENRE,
    DIVINATION_DIE_HELPER_TOAST,
    consumedHelperIsDivinationSchoolDie
} from '../services/QuestDrawBoost.js';

export class GenreQuestDeckController extends BaseController {
    constructor(stateAdapter, form, dependencies) {
        super(stateAdapter, form, dependencies);
        /** @type {Array<Object>} */
        this.drawnQuests = [];
        /** @type {Set<number>} */
        this.selectedIndices = new Set();
    }

    initialize() {
        const { stateAdapter, form } = this;
        const { ui: uiModule } = this.dependencies;

        if (!uiModule) return;

        const deckContainer = document.getElementById('genre-quest-deck-container');
        const drawnCardDisplay = document.getElementById('genre-quest-drawn-card-display');

        if (!deckContainer || !drawnCardDisplay) return;

        this.deckContainer = deckContainer;
        this.drawnCardDisplay = drawnCardDisplay;

        this.renderDeck();

        this.addEventListener(deckContainer, 'click', () => {
            this.handleDeckClick();
        });

        // Add/clear are handled by shared buttons in character-sheet.js

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
     * Render deck UI (cardback and drawn cards)
     */
    renderDeck() {
        const viewModel = createGenreQuestDeckViewModel(characterState, this.drawnQuests);

        clearElement(this.deckContainer);
        const deck = renderCardback(
            viewModel.deck.cardbackImage,
            viewModel.deck.available,
            viewModel.deck.availableCount
        );
        this.deckContainer.appendChild(deck);
        this.renderDrawnCard();
    }

    /**
     * Render drawn cards with click/ctrl+click selection
     */
    renderDrawnCard() {
        clearElement(this.drawnCardDisplay);

        if (this.drawnQuests.length === 0) {
            this.dependencies.updateDeckActionsLabel?.();
            return;
        }

        const viewModel = createGenreQuestDeckViewModel(characterState, this.drawnQuests);
        viewModel.drawnQuests.forEach((cardData, index) => {
            const card = renderGenreQuestCard(cardData);
            if (!card) return;
            const wrapper = wrapCardSelectable(card, index, this.selectedIndices.has(index), (idx, ev) => {
                if (ev.ctrlKey || ev.metaKey) {
                    if (this.selectedIndices.has(idx)) this.selectedIndices.delete(idx);
                    else this.selectedIndices.add(idx);
                } else {
                    this.selectedIndices = new Set([idx]);
                }
                this.renderDrawnCard();
            });
            this.drawnCardDisplay.appendChild(wrapper);
        });
        this.dependencies.updateDeckActionsLabel?.();
    }

    /**
     * Handle deck click - draw one more quest and add to list (excludes already-drawn)
     */
    handleDeckClick() {
        const availableQuests = getAvailableGenreQuests(characterState);
        const drawnKeys = new Set(this.drawnQuests.map((q) => q.key));
        const pool = availableQuests.filter((q) => !drawnKeys.has(q.key));
        if (pool.length === 0) return;

        const { drawCount, consumedHelper } = computeQuestDeckDrawCount(
            this.stateAdapter,
            QUEST_DECK_GENRE
        );
        const n = Math.max(1, drawCount);
        for (let i = 0; i < n; i++) {
            const remainingPool = availableQuests.filter((q) => !drawnKeys.has(q.key));
            if (remainingPool.length === 0) break;
            const drawn = drawRandomGenreQuest(remainingPool);
            if (!drawn) break;
            drawnKeys.add(drawn.key);
            this.drawnQuests.push(drawn);
            this.selectedIndices.add(this.drawnQuests.length - 1);
        }
        if (consumedHelper) {
            const msg = consumedHelperIsDivinationSchoolDie(consumedHelper)
                ? DIVINATION_DIE_HELPER_TOAST
                : `Monthly draw helper used: ${consumedHelper.name} (${n} genre card${n !== 1 ? 's' : ''})`;
            toast.info(msg);
            this.dependencies.ui?.renderQuestDrawHelpers?.();
            this.saveState();
        }
        this.renderDeck();
    }

    /**
     * Handle "Add selected" - add only selected quests to pool
     */
    handleAddQuestFromCard() {
        const toAdd = Array.from(this.selectedIndices)
            .filter((i) => i >= 0 && i < this.drawnQuests.length)
            .map((i) => this.drawnQuests[i]);
        if (toAdd.length === 0) return;

        const questJSONs = toAdd.map((questData) => {
            const prompt = `${questData.genre}: ${questData.description}`;
            const rewards = RewardCalculator.getBaseRewards('♥ Organize the Stacks', prompt);
            const blueprintReward = questData.blueprintReward ?? 0;
            if (blueprintReward > 0) {
                rewards.blueprints = blueprintReward;
                rewards.receipt.base.blueprints = blueprintReward;
                rewards.receipt.final.blueprints = blueprintReward;
            }
            const quest = {
                type: '♥ Organize the Stacks',
                prompt,
                rewards: rewards.toJSON ? rewards.toJSON() : rewards,
                buffs: [],
                dateAdded: new Date().toISOString()
            };
            const assigned = assignQuestToPeriod(quest, PERIOD_TYPES.MONTHLY);
            return { ...quest, month: assigned.month, year: assigned.year };
        });

        this.stateAdapter.addActiveQuests(questJSONs);
        if (this.dependencies.ui) this.dependencies.ui.renderActiveAssignments();
        this.handleClearDraw();
        this.saveState();
    }

    /**
     * Handle "Clear Draw" - clear all drawn cards
     */
    handleClearDraw() {
        this.drawnQuests = [];
        this.selectedIndices = new Set();
        this.renderDeck();
    }
}
