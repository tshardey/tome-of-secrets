/**
 * DungeonDeckController - Handles dungeon deck card draw functionality
 * 
 * Manages:
 * - Room deck and encounter deck UI
 * - Card drawing (room and encounter)
 * - Quest creation from drawn cards
 * - Deck state updates on quest completion
 */

import { BaseController } from './BaseController.js';
import { STATE_EVENTS } from '../character-sheet/stateAdapter.js';
import { STORAGE_KEYS } from '../character-sheet/storageKeys.js';
import { characterState } from '../character-sheet/state.js';
import * as data from '../character-sheet/data.js';
import { RewardCalculator } from '../services/RewardCalculator.js';
import {
    getAvailableRooms,
    getAvailableEncounters,
    drawRandomRoom,
    drawRandomEncounter,
    checkRoomCompletionStatus
} from '../services/DungeonDeckService.js';
import { createDungeonDeckViewModel, createDrawnCardViewModel } from '../viewModels/dungeonDeckViewModel.js';
import { renderCardback, renderRoomCard, renderEncounterCard } from '../character-sheet/cardRenderer.js';
import { clearElement } from '../utils/domHelpers.js';
import { toast } from '../ui/toast.js';

export class DungeonDeckController extends BaseController {
    constructor(stateAdapter, form, dependencies) {
        super(stateAdapter, form, dependencies);
        this.drawnRoomNumber = null;
        this.drawnEncounterData = null;
    }

    initialize() {
        const { stateAdapter, form } = this;
        const { ui: uiModule } = this.dependencies;

        if (!uiModule) return;

        // Get DOM elements
        const roomDeckContainer = document.getElementById('room-deck-container');
        const encounterDeckContainer = document.getElementById('encounter-deck-container');
        const drawnCardDisplay = document.getElementById('drawn-card-display');
        const addQuestButton = document.getElementById('add-quest-from-cards-btn');
        const clearDrawButton = document.getElementById('clear-drawn-cards-btn');

        if (!roomDeckContainer || !encounterDeckContainer || !drawnCardDisplay) return;

        // Store elements
        this.roomDeckContainer = roomDeckContainer;
        this.encounterDeckContainer = encounterDeckContainer;
        this.drawnCardDisplay = drawnCardDisplay;
        this.addQuestButton = addQuestButton;
        this.clearDrawButton = clearDrawButton;

        // Initial render
        this.renderDecks();

        // Room deck click handler
        this.addEventListener(roomDeckContainer, 'click', () => {
            this.handleRoomDeckClick();
        });

        // Encounter deck click handler
        this.addEventListener(encounterDeckContainer, 'click', () => {
            this.handleEncounterDeckClick();
        });

        // Add quest button
        if (addQuestButton) {
            this.addEventListener(addQuestButton, 'click', () => {
                this.handleAddQuestFromCards();
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
            this.renderDecks();
        });

        stateAdapter.on(STATE_EVENTS.ACTIVE_ASSIGNMENTS_CHANGED, () => {
            // Deck availability doesn't change when active quests change,
            // but we could update UI if needed
        });
    }

    /**
     * Render deck UI (cardbacks and drawn cards)
     */
    renderDecks() {
        const viewModel = createDungeonDeckViewModel(characterState, this.drawnRoomNumber);
        
        // Render room deck
        clearElement(this.roomDeckContainer);
        const roomDeck = renderCardback(
            viewModel.roomDeck.cardbackImage,
            viewModel.roomDeck.available,
            viewModel.roomDeck.availableCount
        );
        this.roomDeckContainer.appendChild(roomDeck);

        // Render encounter deck (only if room is drawn)
        clearElement(this.encounterDeckContainer);
        if (this.drawnRoomNumber) {
            this.encounterDeckContainer.style.display = 'block';
            const encounterDeck = renderCardback(
                viewModel.encounterDeck.cardbackImage,
                viewModel.encounterDeck.available,
                viewModel.encounterDeck.availableCount
            );
            this.encounterDeckContainer.appendChild(encounterDeck);
        } else {
            this.encounterDeckContainer.style.display = 'none';
        }

        // Render drawn cards if any
        this.renderDrawnCards();
    }

    /**
     * Render drawn cards (room and encounter)
     */
    renderDrawnCards() {
        clearElement(this.drawnCardDisplay);
        
        if (!this.drawnRoomNumber) {
            if (this.addQuestButton) this.addQuestButton.style.display = 'none';
            if (this.clearDrawButton) this.clearDrawButton.style.display = 'none';
            return;
        }

        const cardViewModel = createDrawnCardViewModel(this.drawnRoomNumber, this.drawnEncounterData);
        
        // Render room card
        if (cardViewModel.room) {
            const roomCard = renderRoomCard(cardViewModel.room);
            if (roomCard) {
                this.drawnCardDisplay.appendChild(roomCard);
            }
        }

        // Render encounter card if drawn
        if (cardViewModel.encounter) {
            const encounterCard = renderEncounterCard(cardViewModel.encounter);
            if (encounterCard) {
                this.drawnCardDisplay.appendChild(encounterCard);
            }
        }

        // Show action buttons
        if (this.addQuestButton) this.addQuestButton.style.display = 'block';
        if (this.clearDrawButton) this.clearDrawButton.style.display = 'block';
    }

    /**
     * Handle room deck click - draw a random room
     */
    handleRoomDeckClick() {
        const availableRooms = getAvailableRooms(characterState);
        if (availableRooms.length === 0) return;

        const drawnRoomNumber = drawRandomRoom(availableRooms);
        if (!drawnRoomNumber) return;

        this.drawnRoomNumber = drawnRoomNumber;
        this.drawnEncounterData = null; // Reset encounter when drawing new room

        this.renderDecks();
    }

    /**
     * Handle encounter deck click - draw a random encounter for current room
     */
    handleEncounterDeckClick() {
        if (!this.drawnRoomNumber) return;

        const availableEncounters = getAvailableEncounters(this.drawnRoomNumber, characterState);
        if (availableEncounters.length === 0) return;

        const drawnEncounter = drawRandomEncounter(availableEncounters);
        if (!drawnEncounter) return;

        this.drawnEncounterData = drawnEncounter;
        this.renderDrawnCards();
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
            
            // For dungeon quests, match by roomNumber and isEncounter
            if (quest.type === '♠ Dungeon Crawl') {
                if (quest.isEncounter === false && existingQuest.isEncounter === false) {
                    // Room challenge: match by roomNumber
                    if (quest.roomNumber && existingQuest.roomNumber && quest.roomNumber === existingQuest.roomNumber) {
                        return true;
                    }
                } else if (quest.isEncounter === true && existingQuest.isEncounter === true) {
                    // Encounter: match by roomNumber and encounterName
                    if (quest.roomNumber && existingQuest.roomNumber && quest.roomNumber === existingQuest.roomNumber &&
                        quest.encounterName && existingQuest.encounterName && quest.encounterName === existingQuest.encounterName) {
                        return true;
                    }
                }
                
                // Fallback: match by prompt text for older quests
                if (quest.prompt && existingQuest.prompt && quest.prompt === existingQuest.prompt) {
                    return true;
                }
            } else {
                // For other quest types, match by prompt
                if (quest.prompt && existingQuest.prompt && quest.prompt === existingQuest.prompt) {
                    return true;
                }
            }
        }
        return false;
    }

    /**
     * Handle "Add Quest" button - create quests from drawn cards
     */
    handleAddQuestFromCards() {
        if (!this.drawnRoomNumber) return;

        const roomData = data.dungeonRooms?.[this.drawnRoomNumber];
        if (!roomData) return;

        // Check if room has encounters - only require encounter if room has encounters
        const hasEncounters = roomData.encountersDetailed && roomData.encountersDetailed.length > 0;
        if (hasEncounters && !this.drawnEncounterData) {
            toast.warning('Please draw an encounter before adding the room to your quest log.');
            return;
        }

        const activeQuests = characterState[STORAGE_KEYS.ACTIVE_ASSIGNMENTS] || [];
        const quests = [];

        // Check if room challenge is already completed or active
        const completedQuests = characterState[STORAGE_KEYS.COMPLETED_QUESTS] || [];
        const roomCompletionStatus = checkRoomCompletionStatus(this.drawnRoomNumber, completedQuests, activeQuests);
        const challengeAlreadyCompleted = roomCompletionStatus.challengeCompleted;

        // Only add room challenge quest if it's not already completed
        if (!challengeAlreadyCompleted) {
            const roomRewards = RewardCalculator.getBaseRewards(
                '♠ Dungeon Crawl',
                roomData.challenge,
                { isEncounter: false, roomNumber: this.drawnRoomNumber }
            );

            const roomQuest = {
                type: '♠ Dungeon Crawl',
                prompt: roomData.challenge,
                isEncounter: false,
                roomNumber: this.drawnRoomNumber,
                rewards: roomRewards,
                buffs: []
            };

            // Check if room quest is duplicate
            if (this.isQuestDuplicate(roomQuest, activeQuests)) {
                toast.warning('This room challenge is already in your quest log.');
            } else {
                quests.push(roomQuest);
            }
        }

        // Create encounter quest if encounter was drawn
        if (this.drawnEncounterData) {
            const encounterName = this.drawnEncounterData.name;
            // Use encountersDetailed data directly (which we already have in drawnEncounterData)
            // Determine if befriend or defeat (default to befriend if both exist)
            const hasBefriend = !!this.drawnEncounterData.befriend;
            const hasDefeat = !!this.drawnEncounterData.defeat;
            const isBefriend = hasBefriend; // Default to befriend if available
            const encounterPrompt = isBefriend && this.drawnEncounterData.befriend
                ? this.drawnEncounterData.befriend
                : (this.drawnEncounterData.defeat || this.drawnEncounterData.befriend);

            const encounterRewards = RewardCalculator.getBaseRewards(
                '♠ Dungeon Crawl',
                encounterPrompt,
                { isEncounter: true, roomNumber: this.drawnRoomNumber, encounterName, isBefriend }
            );

            const encounterQuest = {
                type: '♠ Dungeon Crawl',
                prompt: encounterPrompt,
                isEncounter: true,
                roomNumber: this.drawnRoomNumber,
                encounterName: encounterName,
                isBefriend: isBefriend,
                rewards: encounterRewards,
                buffs: []
            };

            // Check if encounter quest is duplicate
            if (this.isQuestDuplicate(encounterQuest, activeQuests)) {
                toast.warning('This encounter is already in your quest log.');
            } else {
                quests.push(encounterQuest);
            }
        }

        // If no quests to add (all duplicates or already completed), don't proceed
        if (quests.length === 0) {
            return;
        }

        // Convert rewards to JSON (for storage)
        const questsJSON = quests.map(quest => ({
            ...quest,
            rewards: quest.rewards.toJSON ? quest.rewards.toJSON() : quest.rewards
        }));

        // Add quests to active assignments
        this.stateAdapter.addActiveQuests(questsJSON);
        
        // Update UI to show newly added quests
        if (this.dependencies.ui) {
            this.dependencies.ui.renderActiveAssignments();
        }

        // Clear drawn cards
        this.handleClearDraw();

        // Save state
        this.saveState();
    }

    /**
     * Handle "Clear Draw" button - clear drawn cards
     */
    handleClearDraw() {
        this.drawnRoomNumber = null;
        this.drawnEncounterData = null;
        this.renderDecks();
    }
}