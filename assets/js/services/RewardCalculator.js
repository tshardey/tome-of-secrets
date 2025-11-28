/**
 * RewardCalculator Service
 * Centralizes all reward calculation logic for quests
 */

import * as data from '../character-sheet/data.js';
import { GAME_CONFIG } from '../config/gameConfig.js';

/**
 * Represents a reward package with XP, currency, and items
 */
export class Reward {
    constructor({ xp = 0, inkDrops = 0, paperScraps = 0, items = [], modifiedBy = [] } = {}) {
        this.xp = xp;
        this.inkDrops = inkDrops;
        this.paperScraps = paperScraps;
        this.items = Array.isArray(items) ? items : [];
        this.modifiedBy = Array.isArray(modifiedBy) ? modifiedBy : []; // Track what modifiers were applied
    }

    /**
     * Clone this reward
     */
    clone() {
        const cloned = new Reward({
            xp: this.xp,
            inkDrops: this.inkDrops,
            paperScraps: this.paperScraps,
            items: [...this.items]
        });
        cloned.modifiedBy = [...this.modifiedBy];
        return cloned;
    }

    /**
     * Convert to plain object for storage/serialization
     */
    toJSON() {
        return {
            xp: this.xp,
            inkDrops: this.inkDrops,
            paperScraps: this.paperScraps,
            items: this.items,
            modifiedBy: this.modifiedBy
        };
    }
}

/**
 * Service for calculating quest rewards with modifiers
 */
export class RewardCalculator {
    /**
     * Get base rewards for a quest type and prompt
     * @param {string} type - Quest type (♠, ♣, ♥, ⭐)
     * @param {string} prompt - Quest prompt
     * @param {Object} options - Additional options
     * @returns {Reward}
     */
    static getBaseRewards(type, prompt, options = {}) {
        const { isEncounter = false, roomNumber = null, encounterName = null } = options;

        // Extra Credit - only paper scraps
        if (type === '⭐ Extra Credit') {
            return new Reward({ paperScraps: GAME_CONFIG.rewards.extraCredit.paperScraps });
        }

        // Organize the Stacks (Genre quests)
        if (type === '♥ Organize the Stacks') {
            return new Reward({
                xp: GAME_CONFIG.rewards.organizeTheStacks.xp,
                inkDrops: GAME_CONFIG.rewards.organizeTheStacks.inkDrops
            });
        }

        // Side Quests
        if (type === '♣ Side Quest') {
            return this._getSideQuestRewards(prompt);
        }

        // Dungeon Crawl
        if (type === '♠ Dungeon Crawl') {
            return this._getDungeonRewards(isEncounter, roomNumber, encounterName);
        }

        // Default fallback
        return new Reward({ inkDrops: GAME_CONFIG.rewards.defaultFallback.inkDrops });
    }

    /**
     * Get rewards for a side quest
     * @private
     */
    static _getSideQuestRewards(prompt) {
        for (const key in data.sideQuestsDetailed) {
            const sideQuest = data.sideQuestsDetailed[key];
            if (prompt.includes(sideQuest.prompt) || prompt.includes(sideQuest.name)) {
                return new Reward(sideQuest.rewards);
            }
        }
        return new Reward({ inkDrops: GAME_CONFIG.rewards.defaultFallback.inkDrops });
    }

    /**
     * Get rewards for a dungeon crawl
     * @private
     */
    static _getDungeonRewards(isEncounter, roomNumber, encounterName) {
        if (!roomNumber) {
            return new Reward({ inkDrops: GAME_CONFIG.rewards.defaultFallback.inkDrops });
        }

        const room = data.dungeonRooms[roomNumber];
        if (!room) {
            return new Reward({ inkDrops: GAME_CONFIG.rewards.defaultFallback.inkDrops });
        }

        // Encounter rewards
        if (isEncounter && encounterName && room.encountersDetailed) {
            const encounter = room.encountersDetailed.find(e => e.name === encounterName);
            if (encounter?.rewards) {
                return new Reward(encounter.rewards);
            }

            // Fallback based on encounter type
            if (encounter?.type === 'Monster') {
                return new Reward({ xp: GAME_CONFIG.rewards.encounter.monster.xp });
            } else if (encounter?.type === 'Friendly Creature') {
                return new Reward({ inkDrops: GAME_CONFIG.rewards.encounter.friendlyCreature.inkDrops });
            } else if (encounter?.type === 'Familiar') {
                return new Reward({ paperScraps: GAME_CONFIG.rewards.encounter.familiar.paperScraps });
            }
        }

        // Room challenge rewards
        if (room.roomRewards) {
            return new Reward(room.roomRewards);
        }

        return new Reward({ inkDrops: GAME_CONFIG.rewards.defaultFallback.inkDrops });
    }

    /**
     * Apply buff and item modifiers to base rewards
     * @param {Reward} baseRewards - Base rewards to modify
     * @param {Array<string>} appliedBuffs - Array of buff/item names (with prefixes)
     * @returns {Reward} - Modified rewards
     */
    static applyModifiers(baseRewards, appliedBuffs = []) {
        if (!appliedBuffs || appliedBuffs.length === 0) {
            return baseRewards.clone();
        }

        const modified = baseRewards.clone();
        const multipliers = [];

        // First pass: Apply additive bonuses
        appliedBuffs.forEach(buffName => {
            const { cleanName, isItem, isBackground } = this._parseBuffName(buffName);
            const modifier = this._getModifier(cleanName, isItem, isBackground);

            if (modifier) {
                // Apply additive bonuses
                if (modifier.xp) {
                    modified.xp += modifier.xp;
                }
                if (modifier.inkDrops) {
                    modified.inkDrops += modifier.inkDrops;
                }
                if (modifier.paperScraps) {
                    modified.paperScraps += modifier.paperScraps;
                }

                // Track multipliers for second pass
                if (modifier.inkDropsMultiplier) {
                    multipliers.push(modifier.inkDropsMultiplier);
                }

                // Track what was applied
                if (modifier.xp || modifier.inkDrops || modifier.paperScraps || modifier.inkDropsMultiplier) {
                    modified.modifiedBy.push(cleanName);
                }
            }
        });

        // Second pass: Apply multipliers (after all additive bonuses)
        multipliers.forEach(multiplier => {
            modified.inkDrops = Math.floor(modified.inkDrops * multiplier);
        });

        return modified;
    }

    /**
     * Apply keeper background bonuses
     * @param {Reward} rewards - Rewards to modify
     * @param {Object} quest - Quest object with type, etc.
     * @param {string} background - Background key
     * @returns {Reward}
     */
    static applyBackgroundBonuses(rewards, quest, background) {
        if (!background) {
            return rewards;
        }

        const modified = rewards.clone();

        // Biblioslinker: Bonus Paper Scraps for Dungeon Crawls
        if (background === 'biblioslinker' && quest.type === '♠ Dungeon Crawl') {
            modified.paperScraps += GAME_CONFIG.backgrounds.biblioslinker.dungeonCrawlPaperScraps;
            modified.modifiedBy.push('Biblioslinker');
        }

        // Note: Grove Tender's bonus is handled by atmospheric buff system
        // Note: Cartographer, Archivist, Prophet bonuses are manually applied via buffs dropdown

        return modified;
    }

    /**
     * Parse buff name to extract clean name and type
     * @private
     */
    static _parseBuffName(buffName) {
        const cleanName = buffName.replace(/^\[(Buff|Item|Background)\] /, '');
        const isItem = buffName.startsWith('[Item]');
        const isBackground = buffName.startsWith('[Background]');
        return { cleanName, isItem, isBackground };
    }

    /**
     * Get modifier data for a buff/item/background
     * @private
     */
    static _getModifier(cleanName, isItem, isBackground) {
        // Background bonuses
        if (isBackground) {
            if (cleanName === 'Archivist Bonus' || cleanName === 'Prophet Bonus' || cleanName === 'Cartographer Bonus') {
                return { inkDrops: GAME_CONFIG.backgrounds.backgroundBonus.inkDrops };
            }
            return null;
        }

        // Item modifiers
        if (isItem && data.allItems[cleanName]) {
            return data.allItems[cleanName].rewardModifier;
        }

        // Temporary buff modifiers (check both new and legacy sources)
        if (data.temporaryBuffs && data.temporaryBuffs[cleanName]) {
            return data.temporaryBuffs[cleanName].rewardModifier;
        }
        if (data.temporaryBuffsFromRewards && data.temporaryBuffsFromRewards[cleanName]) {
            return data.temporaryBuffsFromRewards[cleanName].rewardModifier;
        }

        return null;
    }

    /**
     * Calculate final rewards for a quest with all modifiers
     * @param {string} type - Quest type
     * @param {string} prompt - Quest prompt
     * @param {Object} options - Options including appliedBuffs, background, quest
     * @returns {Reward}
     */
    static calculateFinalRewards(type, prompt, options = {}) {
        const {
            appliedBuffs = [],
            background = null,
            quest = {},
            isEncounter = false,
            roomNumber = null,
            encounterName = null
        } = options;

        // Get base rewards
        let rewards = this.getBaseRewards(type, prompt, { isEncounter, roomNumber, encounterName });

        // Apply buff/item modifiers
        if (appliedBuffs.length > 0) {
            rewards = this.applyModifiers(rewards, appliedBuffs);
        }

        // Apply background bonuses
        if (background) {
            rewards = this.applyBackgroundBonuses(rewards, quest, background);
        }

        return rewards;
    }

    /**
     * Calculate book completion XP rewards for end of month
     * Formula: booksCompleted × GAME_CONFIG.endOfMonth.bookCompletionXP
     * 
     * @param {number} booksCompleted - Number of unique books completed this month
     * @returns {Reward} Reward with XP only
     */
    static calculateBookCompletionRewards(booksCompleted) {
        const xp = Math.max(0, booksCompleted) * GAME_CONFIG.endOfMonth.bookCompletionXP;
        return new Reward({ xp, inkDrops: 0, paperScraps: 0, items: [] });
    }

    /**
     * Calculate journal entry paper scrap rewards for end of month
     * Formula: journalEntries × (basePaperScraps + scribeBonus if Scribe background)
     * 
     * @param {number} journalEntries - Number of journal entries completed
     * @param {string} background - Keeper background key (e.g., 'scribe')
     * @returns {Reward} Reward with paper scraps only
     */
    static calculateJournalEntryRewards(journalEntries, background = '') {
        let papersPerEntry = GAME_CONFIG.endOfMonth.journalEntry.basePaperScraps;
        
        // Apply Scribe's Acolyte bonus
        if (background === 'scribe') {
            papersPerEntry += GAME_CONFIG.endOfMonth.journalEntry.scribeBonus;
        }
        
        const paperScraps = Math.max(0, journalEntries) * papersPerEntry;
        // Only track Scribe bonus if it was actually applied (paperScraps > 0)
        const modifiedBy = (background === 'scribe' && paperScraps > 0) ? ['Scribe\'s Acolyte'] : [];
        
        return new Reward({ 
            xp: 0, 
            inkDrops: 0, 
            paperScraps, 
            items: [],
            modifiedBy 
        });
    }

    /**
     * Calculate atmospheric buff ink drop rewards for end of month
     * Formula: Sum of (daysUsed × dailyValue) for each active buff
     * - Associated buffs (from selected sanctum): dailyValue = 2
     * - Other buffs: dailyValue = 1
     * 
     * @param {Object} atmosphericBuffs - Object mapping buff names to { daysUsed, isActive }
     * @param {Array<string>} associatedBuffs - Array of buff names associated with selected sanctum
     * @returns {Reward} Reward with ink drops only
     */
    static calculateAtmosphericBuffRewards(atmosphericBuffs = {}, associatedBuffs = []) {
        let totalInkDrops = 0;
        const processedBuffs = [];

        for (const buffName in atmosphericBuffs) {
            const buff = atmosphericBuffs[buffName];
            
            // Only process buffs that were marked as active
            if (buff.isActive && buff.daysUsed > 0) {
                const isAssociated = associatedBuffs.includes(buffName);
                const dailyValue = isAssociated ? GAME_CONFIG.atmospheric.sanctumBonus : GAME_CONFIG.atmospheric.baseValue;
                const buffTotal = buff.daysUsed * dailyValue;
                totalInkDrops += buffTotal;
                
                if (buffTotal > 0) {
                    processedBuffs.push(buffName);
                }
            }
        }

        return new Reward({ 
            xp: 0, 
            inkDrops: totalInkDrops, 
            paperScraps: 0, 
            items: [],
            modifiedBy: processedBuffs 
        });
    }
}

