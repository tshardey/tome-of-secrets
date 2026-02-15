/**
 * AtmosphericBuffDeckController - Handles atmospheric buff deck card draw functionality
 * 
 * Manages:
 * - Atmospheric buff deck UI
 * - Card drawing
 * - Activating atmospheric buff checkbox in Environment tab
 * - Deck state updates when buffs are activated
 */

import { BaseController } from './BaseController.js';
import { STATE_EVENTS } from '../character-sheet/stateAdapter.js';
import { STORAGE_KEYS } from '../character-sheet/storageKeys.js';
import { characterState } from '../character-sheet/state.js';
import {
    getAvailableAtmosphericBuffs,
    drawRandomAtmosphericBuff
} from '../services/AtmosphericBuffDeckService.js';
import { createAtmosphericBuffDeckViewModel } from '../viewModels/questDeckViewModel.js';
import { renderCardback, renderAtmosphericBuffCard, wrapCardSelectable } from '../character-sheet/cardRenderer.js';
import { clearElement } from '../utils/domHelpers.js';
import { toast } from '../ui/toast.js';

export class AtmosphericBuffDeckController extends BaseController {
    constructor(stateAdapter, form, dependencies) {
        super(stateAdapter, form, dependencies);
        /** @type {Array<Object>} */
        this.drawnBuffs = [];
        /** @type {Set<number>} */
        this.selectedIndices = new Set();
    }

    initialize() {
        const { stateAdapter, form } = this;
        const { ui: uiModule } = this.dependencies;

        if (!uiModule) return;

        const deckContainer = document.getElementById('atmospheric-buff-deck-container');
        const drawnCardDisplay = document.getElementById('atmospheric-buff-drawn-card-display');

        if (!deckContainer || !drawnCardDisplay) return;

        this.deckContainer = deckContainer;
        this.drawnCardDisplay = drawnCardDisplay;

        this.renderDeck();

        this.addEventListener(deckContainer, 'click', () => {
            this.handleDeckClick();
        });

        // Add/clear are handled by shared buttons in character-sheet.js

        stateAdapter.on(STATE_EVENTS.ATMOSPHERIC_BUFFS_CHANGED, () => {
            this.renderDeck();
        });
    }

    /**
     * Render deck UI (cardback and drawn cards)
     */
    renderDeck() {
        const viewModel = createAtmosphericBuffDeckViewModel(characterState, this.drawnBuffs);

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

        if (this.drawnBuffs.length === 0) {
            this.dependencies.updateDeckActionsLabel?.();
            return;
        }

        const viewModel = createAtmosphericBuffDeckViewModel(characterState, this.drawnBuffs);
        viewModel.drawnBuffs.forEach((cardData, index) => {
            const card = renderAtmosphericBuffCard(cardData);
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
     * Handle deck click - draw one more buff and add to list (excludes already-drawn)
     */
    handleDeckClick() {
        const availableBuffs = getAvailableAtmosphericBuffs(characterState);
        const drawnNames = new Set(this.drawnBuffs.map((b) => b.name));
        const pool = availableBuffs.filter((b) => !drawnNames.has(b.name));
        if (pool.length === 0) return;

        const drawn = drawRandomAtmosphericBuff(pool);
        if (!drawn) return;

        this.drawnBuffs.push(drawn);
        this.selectedIndices.add(this.drawnBuffs.length - 1);
        this.renderDeck();
    }

    /**
     * Handle "Activate selected" - activate selected buffs (player manages limits)
     */
    handleActivateBuff() {
        const toAdd = Array.from(this.selectedIndices)
            .filter((i) => i >= 0 && i < this.drawnBuffs.length)
            .map((i) => this.drawnBuffs[i]);
        if (toAdd.length === 0) return;

        const { stateAdapter } = this;
        const { ui: uiModule } = this.dependencies;

        for (const buff of toAdd) {
            stateAdapter.setAtmosphericBuffActive(buff.name, true);
        }

        if (uiModule) {
            const librarySanctumSelect = document.getElementById('librarySanctum');
            uiModule.renderAtmosphericBuffs(librarySanctumSelect);
        }

        const environmentTab = document.querySelector('[data-tab="environment"]');
        if (environmentTab) environmentTab.click();

        toast.success(toAdd.length === 1 ? `${toAdd[0].name} activated!` : `${toAdd.length} buffs activated.`);
        this.handleClearDraw();
        this.saveState();
    }

    /**
     * Handle "Clear Draw" - clear all drawn cards
     */
    handleClearDraw() {
        this.drawnBuffs = [];
        this.selectedIndices = new Set();
        this.renderDeck();
    }
}
