/**
 * Quest Model
 * 
 * Represents a quest in the Tome of Secrets game.
 * Provides structure, validation, and helper methods for quest objects.
 */

import { Reward } from '../services/RewardCalculator.js';

export class Quest {
    /**
     * @param {Object} data - Quest data
     * @param {string} data.type - Quest type (e.g., '♠ Dungeon Crawl')
     * @param {string} data.prompt - Quest prompt/description
     * @param {string} data.month - Month when quest was created/completed
     * @param {string} data.year - Year when quest was created/completed
     * @param {string} [data.book=''] - Associated book title
     * @param {string} [data.bookAuthor=''] - Associated book author
     * @param {string} [data.notes=''] - Additional notes
     * @param {Array<string>} [data.buffs=[]] - Applied atmospheric buffs
     * @param {Object|Reward} [data.rewards] - Quest rewards
     * @param {boolean} [data.isEncounter=false] - Whether this is a dungeon encounter
     * @param {string} [data.dateAdded=null] - ISO date string when quest was added (Schema v3)
     * @param {string} [data.dateCompleted=null] - ISO date string when quest was completed (Schema v3)
     * @param {string} [data.coverUrl=null] - Book cover URL from API (Schema v4, Grimoire Gallery)
     * @param {number} [data.pageCountRaw=null] - Page count from API (Schema v4)
     * @param {number} [data.pageCountEffective=null] - Page count after Keeper item adjustments (Schema v4)
     */
    constructor({
        type,
        prompt,
        month,
        year,
        book = '',
        bookAuthor = '',
        notes = '',
        buffs = [],
        rewards = null,
        isEncounter = false,
        dateAdded = null,
        dateCompleted = null,
        coverUrl = null,
        pageCountRaw = null,
        pageCountEffective = null
    }) {
        // Validate required fields
        if (!type || typeof type !== 'string') {
            throw new Error('Quest type is required and must be a string');
        }
        if (!prompt || typeof prompt !== 'string') {
            throw new Error('Quest prompt is required and must be a string');
        }
        if (!month || typeof month !== 'string') {
            throw new Error('Quest month is required and must be a string');
        }
        if (!year || typeof year !== 'string') {
            throw new Error('Quest year is required and must be a string');
        }

        this.type = type;
        this.prompt = prompt;
        this.month = month;
        this.year = year;
        this.book = book;
        this.bookAuthor = bookAuthor;
        this.notes = notes;
        this.buffs = Array.isArray(buffs) ? buffs : [];
        this.isEncounter = Boolean(isEncounter);
        this.dateAdded = dateAdded || null;
        this.dateCompleted = dateCompleted || null;
        this.coverUrl = coverUrl || null;
        this.pageCountRaw = typeof pageCountRaw === 'number' && !isNaN(pageCountRaw) ? pageCountRaw : null;
        this.pageCountEffective = typeof pageCountEffective === 'number' && !isNaN(pageCountEffective) ? pageCountEffective : null;

        // Handle rewards
        if (rewards instanceof Reward) {
            this.rewards = rewards;
        } else if (rewards && typeof rewards === 'object') {
            this.rewards = new Reward(rewards);
        } else {
            this.rewards = new Reward();
        }
    }

    /**
     * Check if this quest is a dungeon quest
     * @returns {boolean}
     */
    isDungeonQuest() {
        return this.type === '♠ Dungeon Crawl';
    }

    /**
     * Check if this quest is a genre quest
     * @returns {boolean}
     */
    isGenreQuest() {
        return this.type === '♥ Organize the Stacks';
    }

    /**
     * Check if this quest is a side quest
     * @returns {boolean}
     */
    isSideQuest() {
        return this.type === '♣ Side Quest';
    }

    /**
     * Check if this quest is an extra credit quest
     * @returns {boolean}
     */
    isExtraCreditQuest() {
        return this.type === '⭐ Extra Credit';
    }

    /**
     * Get a display-friendly title for the quest
     * @returns {string}
     */
    getDisplayTitle() {
        if (this.book) {
            return `${this.book} - ${this.prompt}`;
        }
        return this.prompt;
    }

    /**
     * Create a clone of this quest
     * @returns {Quest}
     */
    clone() {
        return new Quest({
            type: this.type,
            prompt: this.prompt,
            month: this.month,
            year: this.year,
            book: this.book,
            bookAuthor: this.bookAuthor,
            notes: this.notes,
            buffs: [...this.buffs],
            rewards: this.rewards ? this.rewards.clone() : null,
            isEncounter: this.isEncounter,
            dateAdded: this.dateAdded,
            dateCompleted: this.dateCompleted,
            coverUrl: this.coverUrl,
            pageCountRaw: this.pageCountRaw,
            pageCountEffective: this.pageCountEffective
        });
    }

    /**
     * Convert to plain JSON object (for localStorage)
     * @returns {Object}
     */
    toJSON() {
        return {
            type: this.type,
            prompt: this.prompt,
            month: this.month,
            year: this.year,
            book: this.book,
            bookAuthor: this.bookAuthor,
            notes: this.notes,
            buffs: this.buffs,
            rewards: this.rewards ? this.rewards.toJSON() : { xp: 0, inkDrops: 0, paperScraps: 0, blueprints: 0, items: [], modifiedBy: [] },
            isEncounter: this.isEncounter,
            dateAdded: this.dateAdded,
            dateCompleted: this.dateCompleted,
            coverUrl: this.coverUrl,
            pageCountRaw: this.pageCountRaw,
            pageCountEffective: this.pageCountEffective
        };
    }

    /**
     * Create a Quest from a plain object (from localStorage)
     * @param {Object} data - Plain object
     * @returns {Quest}
     */
    static fromJSON(data) {
        return new Quest(data);
    }

    /**
     * Validate a plain object can be converted to a Quest
     * @param {Object} data - Data to validate
     * @returns {{valid: boolean, errors: Array<string>}}
     */
    static validate(data) {
        const errors = [];

        if (!data.type || typeof data.type !== 'string') {
            errors.push('Quest type is required and must be a string');
        }
        if (!data.prompt || typeof data.prompt !== 'string') {
            errors.push('Quest prompt is required and must be a string');
        }
        if (!data.month || typeof data.month !== 'string') {
            errors.push('Quest month is required and must be a string');
        }
        if (!data.year || typeof data.year !== 'string') {
            errors.push('Quest year is required and must be a string');
        }

        return {
            valid: errors.length === 0,
            errors
        };
    }
}

