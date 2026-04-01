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
import { renderCardback, renderSideQuestCard, wrapCardSelectable } from '../character-sheet/cardRenderer.js';
import { clearElement } from '../utils/domHelpers.js';
import { toast } from '../ui/toast.js';
import {
    computeQuestDeckDrawCount,
    QUEST_DECK_SIDE,
    DIVINATION_DIE_HELPER_TOAST,
    consumedHelperIsDivinationSchoolDie
} from '../services/QuestDrawBoost.js';

function getQuestTrackerPeriod() {
    const monthEl = document.getElementById('quest-month');
    const yearEl = document.getElementById('quest-year');
    const month = monthEl?.value?.trim?.() || '';
    const year = yearEl?.value?.trim?.() || '';
    if (month && year) return { month, year };
    const now = new Date();
    const monthNames = [
        'January', 'February', 'March', 'April', 'May', 'June',
        'July', 'August', 'September', 'October', 'November', 'December'
    ];
    return { month: month || monthNames[now.getMonth()], year: year || String(now.getFullYear()) };
}

export class SideQuestDeckController extends BaseController {
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
     * Render deck UI (cardback and drawn cards)
     */
    renderDeck() {
        const viewModel = createSideQuestDeckViewModel(characterState, this.drawnQuests);

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
            if (this.addQuestButton) this.addQuestButton.style.display = 'none';
            if (this.clearDrawButton) this.clearDrawButton.style.display = 'none';
            this.dependencies.updateDeckActionsLabel?.();
            return;
        }

        if (this.addQuestButton) this.addQuestButton.style.display = 'block';
        if (this.clearDrawButton) this.clearDrawButton.style.display = 'block';

        const viewModel = createSideQuestDeckViewModel(characterState, this.drawnQuests);
        viewModel.drawnQuests.forEach((cardData, index) => {
            const card = renderSideQuestCard(cardData);
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
        const availableQuests = getAvailableSideQuests(characterState);
        const drawnKeys = new Set(this.drawnQuests.map((q) => q.key));
        const pool = availableQuests.filter((q) => !drawnKeys.has(q.key));
        if (pool.length === 0) return;

        const { drawCount, consumedHelper } = computeQuestDeckDrawCount(
            this.stateAdapter,
            QUEST_DECK_SIDE
        );
        const count = Math.max(1, drawCount);
        for (let i = 0; i < count; i++) {
            const drawnKeysLoop = new Set(this.drawnQuests.map((q) => q.key));
            const poolLoop = availableQuests.filter((q) => !drawnKeysLoop.has(q.key));
            if (poolLoop.length === 0) break;
            const drawn = drawRandomSideQuest(poolLoop);
            if (!drawn) break;
            this.drawnQuests.push(drawn);
            this.selectedIndices.add(this.drawnQuests.length - 1);
        }
        if (consumedHelper) {
            const msg = consumedHelperIsDivinationSchoolDie(consumedHelper)
                ? DIVINATION_DIE_HELPER_TOAST
                : `Monthly draw helper used: ${consumedHelper.name} (${count} side quest card${count !== 1 ? 's' : ''})`;
            toast.info(msg);
            this.dependencies.ui?.renderQuestDrawHelpers?.();
            this.saveState();
        }
        this.renderDeck();
        this.dependencies.updateDeckActionsLabel?.();
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

            // Prefer stable side quest id when available
            if (quest.sideQuestId && existingQuest.sideQuestId === quest.sideQuestId) {
                return true;
            }
            
            // Match by prompt
            if (quest.prompt && existingQuest.prompt && quest.prompt === existingQuest.prompt) {
                return true;
            }
        }
        return false;
    }

    /**
     * Handle "Add selected" - add only selected quests to pool
     */
    handleAddQuestFromCard() {
        const toAdd = Array.from(this.selectedIndices)
            .filter((i) => i >= 0 && i < this.drawnQuests.length)
            .map((i) => this.drawnQuests[i]);
        if (toAdd.length === 0) return;
        const { month, year } = getQuestTrackerPeriod();

        const activeQuests = [...(characterState[STORAGE_KEYS.ACTIVE_ASSIGNMENTS] || [])];
        const questJSONs = [];

        for (const questData of toAdd) {
            const prompt = `${questData.name}: ${questData.prompt}`;
            const rewards = RewardCalculator.getBaseRewards('♣ Side Quest', prompt, {
                sideQuestId: questData.id || null
            });
            const quest = {
                type: '♣ Side Quest',
                sideQuestId: questData.id || null,
                prompt,
                rewards: rewards.toJSON ? rewards.toJSON() : rewards,
                buffs: [],
                dateAdded: new Date().toISOString(),
                month,
                year
            };
            if (this.isQuestDuplicate(quest, activeQuests)) {
                toast.warning(`"${questData.name}" is already in your quest log.`);
                continue;
            }
            questJSONs.push(quest);
            activeQuests.push(quest); // Track for duplicate check within this batch
        }

        if (questJSONs.length === 0) return;

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
        this.dependencies.updateDeckActionsLabel?.();
    }
}