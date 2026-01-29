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
import { renderCardback, renderAtmosphericBuffCard } from '../character-sheet/cardRenderer.js';
import { clearElement } from '../utils/domHelpers.js';
import { toast } from '../ui/toast.js';

export class AtmosphericBuffDeckController extends BaseController {
    constructor(stateAdapter, form, dependencies) {
        super(stateAdapter, form, dependencies);
        this.drawnBuff = null;
    }

    initialize() {
        const { stateAdapter, form } = this;
        const { ui: uiModule } = this.dependencies;

        if (!uiModule) return;

        // Get DOM elements
        const deckContainer = document.getElementById('atmospheric-buff-deck-container');
        const drawnCardDisplay = document.getElementById('atmospheric-buff-drawn-card-display');
        const activateBuffButton = document.getElementById('add-atmospheric-buff-quest-btn');
        const clearDrawButton = document.getElementById('clear-atmospheric-buff-draw-btn');

        if (!deckContainer || !drawnCardDisplay) return;

        // Store elements
        this.deckContainer = deckContainer;
        this.drawnCardDisplay = drawnCardDisplay;
        this.activateBuffButton = activateBuffButton;
        this.clearDrawButton = clearDrawButton;

        // Initial render
        this.renderDeck();

        // Deck click handler
        this.addEventListener(deckContainer, 'click', () => {
            this.handleDeckClick();
        });

        // Activate buff button
        if (activateBuffButton) {
            this.addEventListener(activateBuffButton, 'click', () => {
                this.handleActivateBuff();
            });
        }

        // Clear draw button
        if (clearDrawButton) {
            this.addEventListener(clearDrawButton, 'click', () => {
                this.handleClearDraw();
            });
        }

        // Listen to atmospheric buff changes to update deck
        stateAdapter.on(STATE_EVENTS.ATMOSPHERIC_BUFFS_CHANGED, () => {
            this.renderDeck();
        });
    }

    /**
     * Render deck UI (cardback and drawn card)
     */
    renderDeck() {
        const viewModel = createAtmosphericBuffDeckViewModel(characterState, this.drawnBuff);
        
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
        
        if (!this.drawnBuff) {
            if (this.activateBuffButton) this.activateBuffButton.style.display = 'none';
            if (this.clearDrawButton) this.clearDrawButton.style.display = 'none';
            return;
        }

        const viewModel = createAtmosphericBuffDeckViewModel(characterState, this.drawnBuff);
        
        // Render buff card
        if (viewModel.drawnBuff) {
            const buffCard = renderAtmosphericBuffCard(viewModel.drawnBuff);
            if (buffCard) {
                this.drawnCardDisplay.appendChild(buffCard);
            }
        }

        // Show action buttons
        if (this.activateBuffButton) this.activateBuffButton.style.display = 'block';
        if (this.clearDrawButton) this.clearDrawButton.style.display = 'block';
    }

    /**
     * Handle deck click - draw a random buff
     */
    handleDeckClick() {
        const availableBuffs = getAvailableAtmosphericBuffs(characterState);
        if (availableBuffs.length === 0) return;

        const drawnBuff = drawRandomAtmosphericBuff(availableBuffs);
        if (!drawnBuff) return;

        this.drawnBuff = drawnBuff;
        this.renderDeck();
    }

    /**
     * Handle "Activate Buff" button - activate the atmospheric buff checkbox
     */
    handleActivateBuff() {
        if (!this.drawnBuff) return;

        const buffName = this.drawnBuff.name;
        const { stateAdapter } = this;
        const { ui: uiModule } = this.dependencies;

        // Check if buff is already active
        const currentBuff = stateAdapter.getAtmosphericBuff(buffName);
        if (currentBuff && currentBuff.isActive) {
            toast.info(`${buffName} is already active.`);
            this.handleClearDraw();
            return;
        }

        // Activate the buff
        stateAdapter.setAtmosphericBuffActive(buffName, true);

        // Re-render atmospheric buffs UI to show the checkbox as checked
        if (uiModule) {
            const librarySanctumSelect = document.getElementById('librarySanctum');
            uiModule.renderAtmosphericBuffs(librarySanctumSelect);
        }

        // Switch to Environment tab if not already there
        const environmentTab = document.querySelector('[data-tab="environment"]');
        if (environmentTab) {
            environmentTab.click();
        }

        toast.success(`${buffName} activated!`);

        // Clear drawn card
        this.handleClearDraw();

        // Save state
        this.saveState();
    }

    /**
     * Handle "Clear Draw" button - clear drawn card
     */
    handleClearDraw() {
        this.drawnBuff = null;
        this.renderDeck();
    }
}
