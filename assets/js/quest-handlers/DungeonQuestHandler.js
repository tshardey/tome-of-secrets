/**
 * DungeonQuestHandler - Handles Dungeon Crawl quests (♠)
 * 
 * Dungeon quests are unique because they create TWO quest entries:
 * 1. Room challenge quest
 * 2. Encounter quest (if the room has encounters)
 */

import { BaseQuestHandler } from './BaseQuestHandler.js';
import { RewardCalculator } from '../services/RewardCalculator.js';
import { selected, conditional, custom } from '../services/Validator.js';

export class DungeonQuestHandler extends BaseQuestHandler {
    constructor(formElements, data) {
        super(formElements, data);
        this.type = '♠ Dungeon Crawl';
    }

    /**
     * Get field map for error display
     * @returns {Object} Object mapping field names to DOM elements
     */
    getFieldMap() {
        return {
            ...super.getFieldMap(),
            room: this.formElements.dungeonRoomSelect,
            encounter: this.formElements.dungeonEncounterSelect
        };
    }

    /**
     * Validate dungeon quest form
     * @returns {Object} { valid: boolean, error: string, errors: Object }
     */
    validate() {
        const validator = this.getBaseValidator();
        const common = this.getCommonFormData();
        
        // Room is required
        validator.addRule('room', selected('Please select a Room'));
        
        // Encounter is required if room has encounters
        validator.addRule('encounter', conditional(
            (data) => {
                const roomNumber = this.formElements.dungeonRoomSelect.value;
                if (!roomNumber) return false;
                const roomData = this.data.dungeonRooms[roomNumber];
                return roomData && Object.keys(roomData.encounters).length > 0;
            },
            selected('Please select an Encounter for this room.')
        ));

        const data = {
            ...common,
            room: this.formElements.dungeonRoomSelect.value,
            encounter: this.formElements.dungeonEncounterSelect.value
        };

        const result = validator.validate(data);
        
        // For backwards compatibility, include error message
        if (!result.valid) {
            const firstError = Object.values(result.errors)[0];
            return {
                ...result,
                error: firstError
            };
        }

        return { ...result, error: null };
    }

    /**
     * Create dungeon quest object(s)
     * Returns array with 1 or 2 quests (room + optional encounter)
     */
    createQuests() {
        const common = this.getCommonFormData();
        const roomNumber = this.formElements.dungeonRoomSelect.value;
        const roomData = this.data.dungeonRooms[roomNumber];
        const encounterName = this.formElements.dungeonEncounterSelect.value;

        const quests = [];

        // Create room challenge quest
        const roomRewards = RewardCalculator.getBaseRewards(
            this.type,
            roomData.challenge,
            { isEncounter: false, roomNumber }
        );

        const roomQuest = {
            month: common.month,
            year: common.year,
            type: this.type,
            prompt: roomData.challenge,
            book: common.book,
            notes: common.notes,
            isEncounter: false,
            roomNumber: roomNumber,
            rewards: roomRewards,
            buffs: common.selectedBuffs
        };

        quests.push(roomQuest);

        // Create encounter quest if an encounter was selected
        if (encounterName) {
            const encounterData = roomData.encounters[encounterName];
            const isBefriend = this.formElements.dungeonActionToggle.checked;
            const encounterPrompt = (isBefriend && encounterData.befriend)
                ? encounterData.befriend
                : (encounterData.defeat || encounterData.befriend);

            const encounterRewards = RewardCalculator.getBaseRewards(
                this.type,
                encounterPrompt,
                { isEncounter: true, roomNumber, encounterName }
            );

            const encounterQuest = {
                month: common.month,
                year: common.year,
                type: this.type,
                prompt: encounterPrompt,
                book: common.book,
                notes: common.notes,
                isEncounter: true,
                roomNumber: roomNumber,
                encounterName: encounterName,
                rewards: encounterRewards,
                buffs: common.selectedBuffs
            };

            quests.push(encounterQuest);
        }

        // For active quests, just convert rewards to JSON
        if (common.status === 'active') {
            return this.questsToJSON(quests);
        }

        // For completed quests, apply modifiers
        if (common.status === 'completed') {
            return this.processCompletedQuests(quests, common.selectedBuffs, common.background);
        }

        return this.questsToJSON(quests);
    }
}

