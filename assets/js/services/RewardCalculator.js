/**
 * RewardCalculator Service
 * Centralizes all reward calculation logic for quests
 */

import * as data from '../character-sheet/data.js';
import { GAME_CONFIG } from '../config/gameConfig.js';
import { characterState } from '../character-sheet/state.js';
import { STORAGE_KEYS } from '../character-sheet/storageKeys.js';

/**
 * Represents a reward package with XP, currency, and items
 */
export class Reward {
    constructor({ xp = 0, inkDrops = 0, paperScraps = 0, blueprints = 0, items = [], modifiedBy = [] } = {}) {
        this.xp = xp;
        this.inkDrops = inkDrops;
        this.paperScraps = paperScraps;
        this.blueprints = blueprints;
        this.items = Array.isArray(items) ? items : [];
        this.modifiedBy = Array.isArray(modifiedBy) ? modifiedBy : []; // Track what modifiers were applied
        
        // Calculation receipt/breakdown for transparency
        this.receipt = {
            base: { xp: 0, inkDrops: 0, paperScraps: 0, blueprints: 0 },
            modifiers: [], // Array of { source, type, value, description, currency }
            final: { xp: 0, inkDrops: 0, paperScraps: 0, blueprints: 0 }
        };
    }

    /**
     * Clone this reward
     */
    clone() {
        const cloned = new Reward({
            xp: this.xp,
            inkDrops: this.inkDrops,
            paperScraps: this.paperScraps,
            blueprints: this.blueprints,
            items: [...this.items]
        });
        cloned.modifiedBy = [...this.modifiedBy];
        // Deep clone receipt
        cloned.receipt = {
            base: { ...this.receipt.base },
            modifiers: [...this.receipt.modifiers],
            final: { ...this.receipt.final }
        };
        return cloned;
    }
    
    /**
     * Get calculation receipt/breakdown
     * @returns {Object} Receipt object with base, modifiers, and final values
     */
    getReceipt() {
        return {
            base: { ...this.receipt.base },
            modifiers: [...this.receipt.modifiers],
            final: { ...this.receipt.final },
            items: [...this.items],
            modifiedBy: [...this.modifiedBy]
        };
    }

    /**
     * Convert to plain object for storage/serialization
     */
    toJSON() {
        return {
            xp: this.xp,
            inkDrops: this.inkDrops,
            paperScraps: this.paperScraps,
            blueprints: this.blueprints,
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
        const { isEncounter = false, roomNumber = null, encounterName = null, isBefriend = true } = options;
        let reward;

        // Extra Credit - only paper scraps
        if (type === '⭐ Extra Credit') {
            reward = new Reward({ paperScraps: GAME_CONFIG.rewards.extraCredit.paperScraps });
            reward.receipt.base.paperScraps = GAME_CONFIG.rewards.extraCredit.paperScraps;
        }
        // Organize the Stacks (Genre quests)
        else if (type === '♥ Organize the Stacks') {
            reward = new Reward({
                xp: GAME_CONFIG.rewards.organizeTheStacks.xp,
                inkDrops: GAME_CONFIG.rewards.organizeTheStacks.inkDrops
            });
            reward.receipt.base.xp = GAME_CONFIG.rewards.organizeTheStacks.xp;
            reward.receipt.base.inkDrops = GAME_CONFIG.rewards.organizeTheStacks.inkDrops;
        }
        // Side Quests
        else if (type === '♣ Side Quest') {
            reward = this._getSideQuestRewards(prompt);
        }
        // Dungeon Crawl
        else if (type === '♠ Dungeon Crawl') {
            reward = this._getDungeonRewards(isEncounter, roomNumber, encounterName, isBefriend);
        }
        // Default fallback
        else {
            reward = new Reward({ inkDrops: GAME_CONFIG.rewards.defaultFallback.inkDrops });
            reward.receipt.base.inkDrops = GAME_CONFIG.rewards.defaultFallback.inkDrops;
        }
        
        // Initialize final values from base
        reward.receipt.final = { ...reward.receipt.base };
        return reward;
    }

    /**
     * Get rewards for a side quest
     * @private
     */
    static _getSideQuestRewards(prompt) {
        for (const key in data.sideQuestsDetailed) {
            const sideQuest = data.sideQuestsDetailed[key];
            if (prompt.includes(sideQuest.prompt) || prompt.includes(sideQuest.name)) {
                const reward = new Reward(sideQuest.rewards);
                // Set receipt base values from the actual reward values (from constructor)
                reward.receipt.base.xp = reward.xp;
                reward.receipt.base.inkDrops = reward.inkDrops;
                reward.receipt.base.paperScraps = reward.paperScraps;
                reward.receipt.base.blueprints = reward.blueprints;
                reward.receipt.final = { ...reward.receipt.base };
                return reward;
            }
        }
        const reward = new Reward({ inkDrops: GAME_CONFIG.rewards.defaultFallback.inkDrops });
        reward.receipt.base.inkDrops = GAME_CONFIG.rewards.defaultFallback.inkDrops;
        reward.receipt.final = { ...reward.receipt.base };
        return reward;
    }

    /**
     * Get rewards for a dungeon crawl
     * @private
     */
    static _getDungeonRewards(isEncounter, roomNumber, encounterName, isBefriend = true) {
        if (!roomNumber) {
            const reward = new Reward({ inkDrops: GAME_CONFIG.rewards.defaultFallback.inkDrops });
            reward.receipt.base.inkDrops = GAME_CONFIG.rewards.defaultFallback.inkDrops;
            reward.receipt.final = { ...reward.receipt.base };
            return reward;
        }

        const room = data.dungeonRooms[roomNumber];
        if (!room) {
            const reward = new Reward({ inkDrops: GAME_CONFIG.rewards.defaultFallback.inkDrops });
            reward.receipt.base.inkDrops = GAME_CONFIG.rewards.defaultFallback.inkDrops;
            reward.receipt.final = { ...reward.receipt.base };
            return reward;
        }

        // Encounter rewards
        if (isEncounter && encounterName && room.encountersDetailed) {
            const encounter = room.encountersDetailed.find(e => e.name === encounterName);
            if (encounter?.rewards) {
                const rewards = new Reward(encounter.rewards);
                // Set receipt base values from the actual reward values (from constructor)
                // This ensures the receipt reflects what the Reward object actually has
                rewards.receipt.base.xp = rewards.xp;
                rewards.receipt.base.inkDrops = rewards.inkDrops;
                rewards.receipt.base.paperScraps = rewards.paperScraps;
                rewards.receipt.base.blueprints = rewards.blueprints;
                
                // For Familiar type encounters, add the familiar to items if not already present
                // This handles the case where befriending a familiar should reward the familiar itself
                // Only add if it's a befriend action
                if (encounter.type === 'Familiar' && encounterName && isBefriend && !rewards.items.includes(encounterName)) {
                    rewards.items.push(encounterName);
                }
                
                rewards.receipt.final = { ...rewards.receipt.base };
                return rewards;
            }

            // Fallback based on encounter type
            if (encounter?.type === 'Monster') {
                const reward = new Reward({ xp: GAME_CONFIG.rewards.encounter.monster.xp });
                reward.receipt.base.xp = GAME_CONFIG.rewards.encounter.monster.xp;
                reward.receipt.final = { ...reward.receipt.base };
                return reward;
            } else if (encounter?.type === 'Friendly Creature') {
                const reward = new Reward({ inkDrops: GAME_CONFIG.rewards.encounter.friendlyCreature.inkDrops });
                reward.receipt.base.inkDrops = GAME_CONFIG.rewards.encounter.friendlyCreature.inkDrops;
                reward.receipt.final = { ...reward.receipt.base };
                return reward;
            } else if (encounter?.type === 'Familiar') {
                // For familiars, only include the familiar name in items if befriended
                const items = (encounterName && isBefriend) ? [encounterName] : [];
                const reward = new Reward({ 
                    paperScraps: GAME_CONFIG.rewards.encounter.familiar.paperScraps,
                    items: items
                });
                reward.receipt.base.paperScraps = GAME_CONFIG.rewards.encounter.familiar.paperScraps;
                reward.receipt.final = { ...reward.receipt.base };
                return reward;
            }
        }

        // Room challenge rewards
        if (room.roomRewards) {
            const reward = new Reward(room.roomRewards);
            // Set receipt base values from the actual reward values (from constructor)
            reward.receipt.base.xp = reward.xp;
            reward.receipt.base.inkDrops = reward.inkDrops;
            reward.receipt.base.paperScraps = reward.paperScraps;
            reward.receipt.base.blueprints = reward.blueprints;
            reward.receipt.final = { ...reward.receipt.base };
            return reward;
        }

        const reward = new Reward({ inkDrops: GAME_CONFIG.rewards.defaultFallback.inkDrops });
        reward.receipt.base.inkDrops = GAME_CONFIG.rewards.defaultFallback.inkDrops;
        reward.receipt.final = { ...reward.receipt.base };
        return reward;
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
                // Track modifier application in receipt
                const modifierEntry = {
                    source: cleanName,
                    type: isItem ? 'item' : (isBackground ? 'background' : 'buff'),
                    value: null,
                    description: '',
                    currency: null
                };

                // Apply additive bonuses
                if (modifier.xp) {
                    const before = modified.xp;
                    modified.xp += modifier.xp;
                    modifierEntry.currency = 'xp';
                    modifierEntry.value = modifier.xp;
                    modifierEntry.description = `+${modifier.xp} XP`;
                }
                if (modifier.inkDrops) {
                    const before = modified.inkDrops;
                    modified.inkDrops += modifier.inkDrops;
                    if (!modifierEntry.currency) {
                        modifierEntry.currency = 'inkDrops';
                        modifierEntry.value = modifier.inkDrops;
                        modifierEntry.description = `+${modifier.inkDrops} Ink Drops`;
                    } else {
                        // Multiple currencies, update description
                        modifierEntry.description += `, +${modifier.inkDrops} Ink Drops`;
                    }
                }
                if (modifier.paperScraps) {
                    modified.paperScraps += modifier.paperScraps;
                    if (!modifierEntry.currency) {
                        modifierEntry.currency = 'paperScraps';
                        modifierEntry.value = modifier.paperScraps;
                        modifierEntry.description = `+${modifier.paperScraps} Paper Scraps`;
                    } else {
                        modifierEntry.description += `, +${modifier.paperScraps} Paper Scraps`;
                    }
                }

                // Track multipliers for second pass
                if (modifier.inkDropsMultiplier) {
                    multipliers.push({
                        value: modifier.inkDropsMultiplier,
                        source: cleanName
                    });
                    modifierEntry.currency = 'inkDrops';
                    modifierEntry.type = 'multiplier';
                    modifierEntry.value = modifier.inkDropsMultiplier;
                    modifierEntry.description = `×${modifier.inkDropsMultiplier} Ink Drops`;
                }

                // Add to receipt if there's a valid modifier
                if (modifier.xp || modifier.inkDrops || modifier.paperScraps || modifier.inkDropsMultiplier) {
                    modified.modifiedBy.push(cleanName);
                    modified.receipt.modifiers.push(modifierEntry);
                }
            }
        });

        // Second pass: Apply multipliers (after all additive bonuses)
        multipliers.forEach(({ value: multiplier, source }) => {
            const beforeInkDrops = modified.inkDrops;
            modified.inkDrops = Math.floor(modified.inkDrops * multiplier);
            const actualChange = modified.inkDrops - beforeInkDrops;
            
            // Update or add multiplier entry in receipt
            const multiplierEntry = modified.receipt.modifiers.find(m => m.source === source && m.type === 'multiplier');
            if (multiplierEntry) {
                multiplierEntry.value = actualChange;
                multiplierEntry.description = `×${multiplier} (${actualChange > 0 ? '+' : ''}${actualChange} Ink Drops)`;
            }
        });

        // Update final values in receipt
        modified.receipt.final.xp = modified.xp;
        modified.receipt.final.inkDrops = modified.inkDrops;
        modified.receipt.final.paperScraps = modified.paperScraps;
        modified.receipt.final.blueprints = modified.blueprints;

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
            const bonus = GAME_CONFIG.backgrounds.biblioslinker.dungeonCrawlPaperScraps;
            modified.paperScraps += bonus;
            modified.modifiedBy.push('Biblioslinker');
            modified.receipt.modifiers.push({
                source: 'Biblioslinker',
                type: 'background',
                value: bonus,
                description: `+${bonus} Paper Scraps`,
                currency: 'paperScraps'
            });
            modified.receipt.final.paperScraps = modified.paperScraps;
        }

        // Note: Grove Tender's bonus is handled by atmospheric buff system
        // Note: Cartographer, Archivist, Prophet bonuses are manually applied via buffs dropdown

        return modified;
    }

    /**
     * Apply magical school bonuses
     * @param {Reward} rewards - Rewards to modify
     * @param {Object} quest - Quest object with type, isEncounter, isBefriend, etc.
     * @param {string} wizardSchool - Wizard school key (e.g., 'Enchantment')
     * @returns {Reward}
     */
    static applySchoolBonuses(rewards, quest, wizardSchool) {
        if (!wizardSchool) {
            return rewards;
        }

        const modified = rewards.clone();

        // School of Enchantment: 1.5x XP when befriending monsters in dungeons
        if (wizardSchool === 'Enchantment' && quest.type === '♠ Dungeon Crawl' && quest.isEncounter && quest.isBefriend) {
            // Only apply if there's base XP to multiply (monster encounters give 30 XP)
            if (modified.xp > 0) {
                const originalXP = modified.xp;
                const newXP = Math.floor(modified.xp * 1.5);
                const bonusXP = newXP - originalXP;
                modified.xp = newXP;
                modified.modifiedBy.push('School of Enchantment');
                modified.receipt.modifiers.push({
                    source: 'School of Enchantment',
                    type: 'school',
                    value: bonusXP,
                    description: `×1.5 XP (+${bonusXP} XP)`,
                    currency: 'xp'
                });
                modified.receipt.final.xp = modified.xp;
            }
        }

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
            const item = data.allItems[cleanName];
            
            // Check if this item is currently in a passive slot (not equipped)
            // If so, use passiveRewardModifier; otherwise use rewardModifier
            const passiveItemSlots = characterState?.[STORAGE_KEYS.PASSIVE_ITEM_SLOTS] || [];
            const passiveFamiliarSlots = characterState?.[STORAGE_KEYS.PASSIVE_FAMILIAR_SLOTS] || [];
            const isInPassiveSlot = passiveItemSlots.some(slot => slot.itemName === cleanName) ||
                                   passiveFamiliarSlots.some(slot => slot.itemName === cleanName);
            
            // Check if item is also equipped (if so, use active modifier)
            const equippedItems = characterState?.[STORAGE_KEYS.EQUIPPED_ITEMS] || [];
            const isEquipped = equippedItems.some(equipped => equipped.name === cleanName);
            
            // If item is in a passive slot AND not equipped, use passiveRewardModifier
            if (isInPassiveSlot && !isEquipped && item.passiveRewardModifier) {
                return item.passiveRewardModifier;
            }
            
            // Otherwise use the regular rewardModifier
            return item.rewardModifier;
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
     * @param {Object} options - Options including appliedBuffs, background, quest, wizardSchool
     * @returns {Reward}
     */
    static calculateFinalRewards(type, prompt, options = {}) {
        const {
            appliedBuffs = [],
            background = null,
            wizardSchool = null,
            quest = {},
            isEncounter = false,
            roomNumber = null,
            encounterName = null,
            isBefriend = true
        } = options;

        // Get base rewards
        let rewards = this.getBaseRewards(type, prompt, { isEncounter, roomNumber, encounterName, isBefriend });

        // Apply buff/item modifiers
        if (appliedBuffs.length > 0) {
            rewards = this.applyModifiers(rewards, appliedBuffs);
        }

        // Apply background bonuses
        if (background) {
            rewards = this.applyBackgroundBonuses(rewards, quest, background);
        }

        // Apply school bonuses
        if (wizardSchool) {
            rewards = this.applySchoolBonuses(rewards, quest, wizardSchool);
        }

        // Ensure final values in receipt are up to date
        rewards.receipt.final.xp = rewards.xp;
        rewards.receipt.final.inkDrops = rewards.inkDrops;
        rewards.receipt.final.paperScraps = rewards.paperScraps;
        rewards.receipt.final.blueprints = rewards.blueprints;

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
        const reward = new Reward({ xp, inkDrops: 0, paperScraps: 0, items: [] });
        reward.receipt.base.xp = xp;
        reward.receipt.final.xp = xp;
        reward.receipt.modifiers.push({
            source: 'End of Month - Book Completion',
            type: 'system',
            value: xp,
            description: `${booksCompleted} books × ${GAME_CONFIG.endOfMonth.bookCompletionXP} XP`,
            currency: 'xp'
        });
        return reward;
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
        const baseTotal = Math.max(0, journalEntries) * papersPerEntry;
        
        // Apply Scribe's Acolyte bonus
        let bonusTotal = 0;
        if (background === 'scribe') {
            papersPerEntry += GAME_CONFIG.endOfMonth.journalEntry.scribeBonus;
            bonusTotal = Math.max(0, journalEntries) * GAME_CONFIG.endOfMonth.journalEntry.scribeBonus;
        }
        
        const paperScraps = Math.max(0, journalEntries) * papersPerEntry;
        const modifiedBy = (background === 'scribe' && paperScraps > 0) ? ['Scribe\'s Acolyte'] : [];
        
        const reward = new Reward({ 
            xp: 0, 
            inkDrops: 0, 
            paperScraps, 
            items: [],
            modifiedBy 
        });
        
        reward.receipt.base.paperScraps = baseTotal;
        reward.receipt.final.paperScraps = paperScraps;
        
        if (baseTotal > 0) {
            reward.receipt.modifiers.push({
                source: 'End of Month - Journal Entry',
                type: 'system',
                value: baseTotal,
                description: `${journalEntries} entries × ${GAME_CONFIG.endOfMonth.journalEntry.basePaperScraps} Paper Scraps`,
                currency: 'paperScraps'
            });
        }
        
        if (bonusTotal > 0) {
            reward.receipt.modifiers.push({
                source: 'Scribe\'s Acolyte',
                type: 'background',
                value: bonusTotal,
                description: `+${bonusTotal} Paper Scraps (${journalEntries} entries × ${GAME_CONFIG.endOfMonth.journalEntry.scribeBonus} bonus)`,
                currency: 'paperScraps'
            });
        }
        
        return reward;
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
        const reward = new Reward({ 
            xp: 0, 
            inkDrops: 0, 
            paperScraps: 0, 
            items: [],
            modifiedBy: [] 
        });

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
                    reward.receipt.modifiers.push({
                        source: buffName,
                        type: 'atmospheric',
                        value: buffTotal,
                        description: `${buff.daysUsed} days × ${dailyValue} Ink Drops${isAssociated ? ' (Sanctum bonus)' : ''}`,
                        currency: 'inkDrops'
                    });
                }
            }
        }

        reward.inkDrops = totalInkDrops;
        reward.modifiedBy = processedBuffs;
        reward.receipt.base.inkDrops = 0; // No base, all from modifiers
        reward.receipt.final.inkDrops = totalInkDrops;

        return reward;
    }
}

