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
import { assignQuestToPeriod, PERIOD_TYPES } from '../services/PeriodService.js';
import {
    getAvailableRooms,
    getAvailableEncounters,
    drawRandomRoom,
    drawRandomEncounter,
    checkRoomCompletionStatus
} from '../services/DungeonDeckService.js';
import { createDungeonDeckViewModel } from '../viewModels/dungeonDeckViewModel.js';
import { renderCardback, renderRoomCard, renderEncounterCard, wrapCardSelectable } from '../character-sheet/cardRenderer.js';
import { clearElement } from '../utils/domHelpers.js';
import { toast } from '../ui/toast.js';

export class DungeonDeckController extends BaseController {
    constructor(stateAdapter, form, dependencies) {
        super(stateAdapter, form, dependencies);
        /** @type {Array<{roomNumber: string, encounterData: Object|null}>} */
        this.drawnSlots = [];
        /** @type {Set<number>} */
        this.selectedIndices = new Set();
    }

    initialize() {
        const { stateAdapter, form } = this;
        const { ui: uiModule } = this.dependencies;

        if (!uiModule) return;

        const roomDeckContainer = document.getElementById('room-deck-container');
        const encounterDeckContainer = document.getElementById('encounter-deck-container');
        const drawnCardDisplay = document.getElementById('drawn-card-display');

        if (!roomDeckContainer || !encounterDeckContainer || !drawnCardDisplay) return;

        this.roomDeckContainer = roomDeckContainer;
        this.encounterDeckContainer = encounterDeckContainer;
        this.drawnCardDisplay = drawnCardDisplay;

        this.renderDecks();

        this.addEventListener(roomDeckContainer, 'click', () => {
            this.handleRoomDeckClick();
        });

        this.addEventListener(encounterDeckContainer, 'click', () => {
            this.handleEncounterDeckClick();
        });

        // Add/clear are handled by shared buttons in character-sheet.js

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
        const viewModel = createDungeonDeckViewModel(characterState, this.drawnSlots);

        clearElement(this.roomDeckContainer);
        const roomDeck = renderCardback(
            viewModel.roomDeck.cardbackImage,
            viewModel.roomDeck.available,
            viewModel.roomDeck.availableCount
        );
        this.roomDeckContainer.appendChild(roomDeck);

        // Encounter deck (available when at least one slot has no encounter)
        clearElement(this.encounterDeckContainer);
        this.encounterDeckContainer.style.display = 'block';
        const encounterDeck = renderCardback(
            viewModel.encounterDeck.cardbackImage,
            viewModel.encounterDeck.available,
            viewModel.encounterDeck.availableCount
        );
        this.encounterDeckContainer.appendChild(encounterDeck);

        // Render drawn cards if any
        this.renderDrawnCards();
    }

    /**
     * Render drawn slots with click/ctrl+click selection (each slot = room + optional encounter)
     */
    renderDrawnCards() {
        clearElement(this.drawnCardDisplay);

        if (this.drawnSlots.length === 0) {
            this.dependencies.updateDeckActionsLabel?.();
            return;
        }

        const viewModel = createDungeonDeckViewModel(characterState, this.drawnSlots);
        viewModel.drawnSlots.forEach((slotViewModel, index) => {
            const slotWrapper = document.createElement('div');
            slotWrapper.className = 'dungeon-slot-wrapper';
            if (slotViewModel.room) {
                const roomCard = renderRoomCard(slotViewModel.room);
                if (roomCard) slotWrapper.appendChild(roomCard);
            }
            if (slotViewModel.encounter) {
                const encounterCard = renderEncounterCard(slotViewModel.encounter);
                if (encounterCard) slotWrapper.appendChild(encounterCard);
            }
            const selectable = wrapCardSelectable(slotWrapper, index, this.selectedIndices.has(index), (idx, ev) => {
                if (ev.ctrlKey || ev.metaKey) {
                    if (this.selectedIndices.has(idx)) this.selectedIndices.delete(idx);
                    else this.selectedIndices.add(idx);
                } else {
                    this.selectedIndices = new Set([idx]);
                }
                this.renderDrawnCards();
            });
            this.drawnCardDisplay.appendChild(selectable);
        });
        this.dependencies.updateDeckActionsLabel?.();
    }

    /**
     * Handle room deck click - draw one more room and add slot.
     * Excludes already-drawn rooms from the pool so the same room cannot be drawn twice in one session.
     */
    handleRoomDeckClick() {
        const availableRooms = getAvailableRooms(characterState);
        const drawnRoomNumbers = new Set(this.drawnSlots.map((s) => s.roomNumber));
        const pool = availableRooms.filter((roomNum) => !drawnRoomNumbers.has(roomNum));
        if (pool.length === 0) return;

        const viewModel = createDungeonDeckViewModel(characterState, this.drawnSlots);
        if (viewModel.lastSlotIndexForEncounter !== null) {
            toast.info('You can draw an encounter for the current room first (optional) before drawing another room.');
        }

        const drawnRoomNumber = drawRandomRoom(pool);
        if (!drawnRoomNumber) return;

        this.drawnSlots.push({ roomNumber: drawnRoomNumber, encounterData: null });
        this.selectedIndices.add(this.drawnSlots.length - 1);
        this.renderDecks();
    }

    /**
     * Handle encounter deck click - draw encounter for the last slot that has none
     */
    handleEncounterDeckClick() {
        const viewModel = createDungeonDeckViewModel(characterState, this.drawnSlots);
        if (viewModel.lastSlotIndexForEncounter === null) return;

        const slot = this.drawnSlots[viewModel.lastSlotIndexForEncounter];
        const availableEncounters = getAvailableEncounters(slot.roomNumber, characterState);
        if (availableEncounters.length === 0) return;

        const drawn = drawRandomEncounter(availableEncounters);
        if (!drawn) return;

        slot.encounterData = drawn;
        this.renderDecks();
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
     * Handle "Add selected" - create quests from selected slots
     */
    handleAddQuestFromCards() {
        const activeQuests = characterState[STORAGE_KEYS.ACTIVE_ASSIGNMENTS] || [];
        const completedQuests = characterState[STORAGE_KEYS.COMPLETED_QUESTS] || [];
        const toAdd = Array.from(this.selectedIndices)
            .filter((i) => i >= 0 && i < this.drawnSlots.length)
            .map((i) => this.drawnSlots[i]);
        if (toAdd.length === 0) return;

        const quests = [];
        const pendingQuests = [...activeQuests];
        for (const slot of toAdd) {
            const roomData = data.dungeonRooms?.[slot.roomNumber];
            if (!roomData) continue;

            const roomCompletionStatus = checkRoomCompletionStatus(slot.roomNumber, completedQuests, pendingQuests);
            if (!roomCompletionStatus.challengeCompleted) {
                const roomRewards = RewardCalculator.getBaseRewards(
                    '♠ Dungeon Crawl',
                    roomData.challenge,
                    { isEncounter: false, roomNumber: slot.roomNumber }
                );
                const roomQuest = {
                    type: '♠ Dungeon Crawl',
                    prompt: roomData.challenge,
                    isEncounter: false,
                    roomNumber: slot.roomNumber,
                    rewards: roomRewards,
                    buffs: []
                };
                if (!this.isQuestDuplicate(roomQuest, pendingQuests)) {
                    quests.push(roomQuest);
                    pendingQuests.push(roomQuest);
                }
            }

            if (slot.encounterData) {
                const enc = slot.encounterData;
                const isBefriend = !!enc.befriend;
                const encounterPrompt = isBefriend && enc.befriend ? enc.befriend : (enc.defeat || enc.befriend);
                const encounterRewards = RewardCalculator.getBaseRewards(
                    '♠ Dungeon Crawl',
                    encounterPrompt,
                    { isEncounter: true, roomNumber: slot.roomNumber, encounterName: enc.name, isBefriend }
                );
                const encounterQuest = {
                    type: '♠ Dungeon Crawl',
                    prompt: encounterPrompt,
                    isEncounter: true,
                    roomNumber: slot.roomNumber,
                    encounterName: enc.name,
                    isBefriend,
                    rewards: encounterRewards,
                    buffs: []
                };
                if (!this.isQuestDuplicate(encounterQuest, pendingQuests)) {
                    quests.push(encounterQuest);
                    pendingQuests.push(encounterQuest);
                }
            }
        }

        if (quests.length === 0) {
            if (toAdd.length > 0) toast.warning('Selected room/encounter is already in your quest log.');
            this.handleClearDraw();
            return;
        }

        const questsJSON = quests.map((q) => {
            const questWithDate = {
                ...q,
                rewards: q.rewards.toJSON ? q.rewards.toJSON() : q.rewards,
                dateAdded: q.dateAdded || new Date().toISOString()
            };
            const assigned = assignQuestToPeriod(questWithDate, PERIOD_TYPES.MONTHLY);
            return { ...questWithDate, month: assigned.month, year: assigned.year };
        });
        this.stateAdapter.addActiveQuests(questsJSON);
        if (this.dependencies.ui) this.dependencies.ui.renderActiveAssignments();
        this.handleClearDraw();
        this.saveState();
    }

    /**
     * Handle "Clear Draw" - clear all drawn slots
     */
    handleClearDraw() {
        this.drawnSlots = [];
        this.selectedIndices = new Set();
        this.renderDecks();
    }
}