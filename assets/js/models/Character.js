/**
 * Character Model
 * 
 * Represents the player's character in the Tome of Secrets game.
 * Provides structure, validation, and helper methods for character state.
 */

import { Quest } from './Quest.js';

export class Character {
    /**
     * @param {Object} data - Character data
     * @param {Array} [data.activeAssignments=[]] - Active quests
     * @param {Array} [data.completedQuests=[]] - Completed quests
     * @param {Array} [data.discardedQuests=[]] - Discarded quests
     * @param {Array} [data.inventoryItems=[]] - Inventory items
     * @param {Array} [data.curses=[]] - Active curses
     */
    constructor({
        activeAssignments = [],
        completedQuests = [],
        discardedQuests = [],
        inventoryItems = [],
        curses = []
    } = {}) {
        this.activeAssignments = activeAssignments.map(q => q instanceof Quest ? q : Quest.fromJSON(q));
        this.completedQuests = completedQuests.map(q => q instanceof Quest ? q : Quest.fromJSON(q));
        this.discardedQuests = discardedQuests.map(q => q instanceof Quest ? q : Quest.fromJSON(q));
        this.inventoryItems = Array.isArray(inventoryItems) ? inventoryItems : [];
        this.curses = Array.isArray(curses) ? curses : [];
    }

    /**
     * Add an active quest
     * @param {Quest|Object} quest 
     */
    addActiveQuest(quest) {
        const questObj = quest instanceof Quest ? quest : new Quest(quest);
        this.activeAssignments.push(questObj);
    }

    /**
     * Complete an active quest (move to completed)
     * @param {number} index - Index of the quest in activeAssignments
     * @returns {Quest|null} - The completed quest, or null if index is invalid
     */
    completeQuest(index) {
        if (index < 0 || index >= this.activeAssignments.length) {
            return null;
        }
        const quest = this.activeAssignments.splice(index, 1)[0];
        this.completedQuests.push(quest);
        return quest;
    }

    /**
     * Discard an active quest (move to discarded)
     * @param {number} index - Index of the quest in activeAssignments
     * @returns {Quest|null} - The discarded quest, or null if index is invalid
     */
    discardQuest(index) {
        if (index < 0 || index >= this.activeAssignments.length) {
            return null;
        }
        const quest = this.activeAssignments.splice(index, 1)[0];
        this.discardedQuests.push(quest);
        return quest;
    }

    /**
     * Get total number of active quests
     * @returns {number}
     */
    getActiveQuestCount() {
        return this.activeAssignments.length;
    }

    /**
     * Get total number of completed quests
     * @returns {number}
     */
    getCompletedQuestCount() {
        return this.completedQuests.length;
    }

    /**
     * Get total number of discarded quests
     * @returns {number}
     */
    getDiscardedQuestCount() {
        return this.discardedQuests.length;
    }

    /**
     * Get all quests of a specific type
     * @param {string} type - Quest type
     * @returns {Array<Quest>}
     */
    getQuestsByType(type) {
        return [
            ...this.activeAssignments.filter(q => q.type === type),
            ...this.completedQuests.filter(q => q.type === type),
            ...this.discardedQuests.filter(q => q.type === type)
        ];
    }

    /**
     * Add an item to inventory
     * @param {Object} item - Item to add
     */
    addInventoryItem(item) {
        this.inventoryItems.push(item);
    }

    /**
     * Remove an item from inventory
     * @param {number} index - Index of item to remove
     * @returns {Object|null} - The removed item, or null if index is invalid
     */
    removeInventoryItem(index) {
        if (index < 0 || index >= this.inventoryItems.length) {
            return null;
        }
        return this.inventoryItems.splice(index, 1)[0];
    }

    /**
     * Get items in inventory by type
     * @param {string} type - Item type
     * @returns {Array<Object>}
     */
    getInventoryItemsByType(type) {
        return this.inventoryItems.filter(item => item.type === type);
    }

    /**
     * Add a curse
     * @param {Object} curse - Curse to add
     */
    addCurse(curse) {
        this.curses.push(curse);
    }

    /**
     * Remove a curse
     * @param {number} index - Index of curse to remove
     * @returns {Object|null} - The removed curse, or null if index is invalid
     */
    removeCurse(index) {
        if (index < 0 || index >= this.curses.length) {
            return null;
        }
        return this.curses.splice(index, 1)[0];
    }

    /**
     * Get active curse count
     * @returns {number}
     */
    getActiveCurseCount() {
        return this.curses.length;
    }

    /**
     * Convert to plain JSON object (for localStorage)
     * @returns {Object}
     */
    toJSON() {
        return {
            activeAssignments: this.activeAssignments.map(q => q.toJSON()),
            completedQuests: this.completedQuests.map(q => q.toJSON()),
            discardedQuests: this.discardedQuests.map(q => q.toJSON()),
            inventoryItems: this.inventoryItems,
            curses: this.curses
        };
    }

    /**
     * Create a Character from a plain object (from localStorage)
     * @param {Object} data - Plain object
     * @returns {Character}
     */
    static fromJSON(data) {
        return new Character(data);
    }

    /**
     * Create an empty Character (for new players)
     * @returns {Character}
     */
    static createEmpty() {
        return new Character();
    }
}

