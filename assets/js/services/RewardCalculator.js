/**
 * RewardCalculator Service
 * Centralizes all reward calculation logic for quests
 */

import * as data from '../character-sheet/data.js';
import { GAME_CONFIG } from '../config/gameConfig.js';
import { characterState } from '../character-sheet/state.js';
import { STORAGE_KEYS } from '../character-sheet/storageKeys.js';
import { resolvePermanentEffectCapabilities } from './PermanentEffectCapabilities.js';
import { getItemsInPassiveSlots } from './InventoryService.js';

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
     * Check if page count meets a condition { min?, max? }
     * @private
     */
    static _meetsPageCondition(pageCount, condition) {
        if (!condition || (condition.min == null && condition.max == null)) return true;
        if (pageCount == null || typeof pageCount !== 'number' || isNaN(pageCount)) return false;
        if (condition.min != null && pageCount < condition.min) return false;
        if (condition.max != null && pageCount > condition.max) return false;
        return true;
    }

    /**
     * Get skip reason for page-condition items when condition is not met (for receipt)
     * @private
     */
    static _getPageConditionSkipReason(cleanName, pageCountEffective, condition) {
        if (!condition || (condition.min == null && condition.max == null)) return null;
        if (pageCountEffective == null || typeof pageCountEffective !== 'number' || isNaN(pageCountEffective)) {
            return 'page count unknown';
        }
        if (condition.min != null && pageCountEffective < condition.min) {
            return `${pageCountEffective} pages < ${condition.min} threshold`;
        }
        if (condition.max != null && pageCountEffective > condition.max) {
            return `${pageCountEffective} pages > ${condition.max} threshold`;
        }
        return null;
    }

    /**
     * Apply buff and item modifiers to base rewards
     * @param {Reward} baseRewards - Base rewards to modify
     * @param {Array<string>} appliedBuffs - Array of buff/item names (with prefixes)
     * @param {Object} [options] - Optional context: { quest } for page-count-aware item modifiers
     * @returns {Reward} - Modified rewards
     */
    static applyModifiers(baseRewards, appliedBuffs = [], options = {}) {
        if (!appliedBuffs || appliedBuffs.length === 0) {
            return baseRewards.clone();
        }

        const quest = options.quest != null ? options.quest : {};
        const pageCountEffective = quest.pageCountEffective ?? quest.pageCountRaw ?? null;

        const modified = baseRewards.clone();
        const multipliers = [];

        // First pass: Apply additive bonuses
        appliedBuffs.forEach(buffName => {
            const { cleanName, isItem, isBackground } = this._parseBuffName(buffName);
            const result = this._getModifier(cleanName, isItem, isBackground, { pageCountEffective });

            // Page-condition skip: add receipt and do not apply
            if (result.skipReason) {
                modified.receipt.modifiers.push({
                    source: cleanName,
                    type: 'item',
                    value: null,
                    description: `${cleanName}: skipped (${result.skipReason})`,
                    currency: null
                });
                return;
            }

            const modifier = result.modifier;
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
     * Get modifier data for a buff/item/background. Returns { modifier, skipReason? } for
     * page-condition items when condition is not met; otherwise { modifier } or { modifier: null }.
     * @private
     */
    static _getModifier(cleanName, isItem, isBackground, context = {}) {
        const pageCountEffective = context.pageCountEffective;

        // Background bonuses
        if (isBackground) {
            if (cleanName === 'Archivist Bonus' || cleanName === 'Prophet Bonus' || cleanName === 'Cartographer Bonus') {
                return { modifier: { inkDrops: GAME_CONFIG.backgrounds.backgroundBonus.inkDrops } };
            }
            return { modifier: null };
        }

        // Item modifiers (including page-condition checks)
        if (isItem && data.allItems[cleanName]) {
            const item = data.allItems[cleanName];

            // Check if this item is currently in a passive slot (not equipped)
            const passiveItemSlots = characterState?.[STORAGE_KEYS.PASSIVE_ITEM_SLOTS] || [];
            const passiveFamiliarSlots = characterState?.[STORAGE_KEYS.PASSIVE_FAMILIAR_SLOTS] || [];
            const isInPassiveSlot = passiveItemSlots.some(slot => slot.itemName === cleanName) ||
                                   passiveFamiliarSlots.some(slot => slot.itemName === cleanName);
            const equippedItems = characterState?.[STORAGE_KEYS.EQUIPPED_ITEMS] || [];
            const isEquipped = equippedItems.some(equipped => equipped.name === cleanName);
            const forPassive = isInPassiveSlot && !isEquipped;

            // Use passive condition when in passive slot, fall back to pageCondition when passive variant not defined
            const condition = forPassive
                ? (item.passivePageCondition ?? item.pageCondition)
                : item.pageCondition;
            if (condition && (condition.min != null || condition.max != null)) {
                if (!this._meetsPageCondition(pageCountEffective, condition)) {
                    const skipReason = this._getPageConditionSkipReason(cleanName, pageCountEffective, condition);
                    return { modifier: null, skipReason };
                }
            }

            if (forPassive && item.passiveRewardModifier) {
                return { modifier: item.passiveRewardModifier };
            }
            return { modifier: item.rewardModifier };
        }

        // Temporary buff modifiers (check both new and legacy sources)
        if (data.temporaryBuffs && data.temporaryBuffs[cleanName]) {
            return { modifier: data.temporaryBuffs[cleanName].rewardModifier };
        }
        if (data.temporaryBuffsFromRewards && data.temporaryBuffsFromRewards[cleanName]) {
            return { modifier: data.temporaryBuffsFromRewards[cleanName].rewardModifier };
        }

        return { modifier: null };
    }

    /**
     * Resolve permanent-effect capabilities from explicit options, or DOM + character state in the browser.
     * @param {Object} [calcOptions]
     * @param {import('./PermanentEffectCapabilities.js').PermanentEffectCapabilityInput} [calcOptions.permanentEffectInput]
     * @param {ReturnType<typeof resolvePermanentEffectCapabilities>} [calcOptions.permanentCapabilities]
     */
    static _resolvePermanentCaps(calcOptions = {}) {
        if (calcOptions.permanentCapabilities) {
            return calcOptions.permanentCapabilities;
        }
        if (calcOptions.permanentEffectInput) {
            return resolvePermanentEffectCapabilities(calcOptions.permanentEffectInput);
        }
        const learned = characterState?.[STORAGE_KEYS.LEARNED_ABILITIES] || [];
        const progress = characterState?.[STORAGE_KEYS.SERIES_EXPEDITION_PROGRESS] || [];
        let level = 1;
        let school = null;
        if (typeof document !== 'undefined') {
            const levEl = document.getElementById('level');
            if (levEl && levEl.value !== undefined && levEl.value !== '') {
                const n = parseInt(levEl.value, 10);
                if (Number.isFinite(n)) level = Math.max(1, n);
            }
            const schEl = document.getElementById('wizardSchool');
            if (schEl && typeof schEl.value === 'string' && schEl.value.trim()) {
                school = schEl.value.trim();
            }
        }
        return resolvePermanentEffectCapabilities({
            level,
            school,
            learnedAbilities: learned,
            seriesExpeditionProgress: progress
        });
    }

    /**
     * Equipped familiar (not also treated as passive-display-only for modifier purposes).
     * @returns {{ name: string, rewardModifier: object }|null}
     */
    static _getEquippedFamiliarContext() {
        const equipped = characterState?.[STORAGE_KEYS.EQUIPPED_ITEMS] || [];
        const passiveItemSlots = characterState?.[STORAGE_KEYS.PASSIVE_ITEM_SLOTS] || [];
        const passiveFamiliarSlots = characterState?.[STORAGE_KEYS.PASSIVE_FAMILIAR_SLOTS] || [];
        const inPassive = getItemsInPassiveSlots(passiveItemSlots, passiveFamiliarSlots);
        for (const entry of equipped) {
            const name = entry && entry.name;
            if (!name || inPassive.has(name)) continue;
            const item = data.allItems[name];
            if (item && item.type === 'Familiar') {
                return { name, rewardModifier: item.rewardModifier && typeof item.rewardModifier === 'object' ? item.rewardModifier : {} };
            }
        }
        return null;
    }

    /**
     * @param {string[]|undefined} appliedBuffs
     * @param {string|null|undefined} familiarName
     */
    static _buffsListIncludesItem(appliedBuffs, familiarName) {
        if (!familiarName || !Array.isArray(appliedBuffs) || appliedBuffs.length === 0) return false;
        for (const buffName of appliedBuffs) {
            if (typeof buffName !== 'string') continue;
            const clean = buffName.replace(/^\[(Buff|Item|Background)\] /, '');
            if (clean === familiarName) return true;
        }
        return false;
    }

    /**
     * Always-on permanent quest rewards (level passives, school, mastery) — not optional card picks.
     * @param {Reward} rewards
     * @param {Object} quest
     * @param {Object} [calcOptions]
     * @param {string[]} [calcOptions.appliedBuffs] - Selected quest buffs (for Empowered Bond when the equipped familiar is active on the quest)
     */
    static applyPermanentQuestBonuses(rewards, quest, calcOptions = {}) {
        const caps = this._resolvePermanentCaps(calcOptions);
        const rm = caps.rewardModifiers;
        const modified = rewards.clone();
        const questType = quest && quest.type;
        const appliedBuffs = calcOptions.appliedBuffs;

        const famCtx = this._getEquippedFamiliarContext();
        const familiarEquipped = famCtx != null;

        if (rm.questCompletionFamiliarEquippedInkBonus > 0 && familiarEquipped) {
            modified.inkDrops += rm.questCompletionFamiliarEquippedInkBonus;
            modified.modifiedBy.push('School of Conjuration');
            modified.receipt.modifiers.push({
                source: 'School of Conjuration',
                type: 'permanent',
                value: rm.questCompletionFamiliarEquippedInkBonus,
                description: `+${rm.questCompletionFamiliarEquippedInkBonus} Ink Drops (Familiar slot equipped)`,
                currency: 'inkDrops'
            });
        }

        if (questType === '♣ Side Quest' && rm.sideQuestPaperScrapsBonus > 0) {
            modified.paperScraps += rm.sideQuestPaperScrapsBonus;
            modified.modifiedBy.push('Silver Tongue');
            modified.receipt.modifiers.push({
                source: 'Silver Tongue',
                type: 'permanent',
                value: rm.sideQuestPaperScrapsBonus,
                description: `+${rm.sideQuestPaperScrapsBonus} Paper Scraps`,
                currency: 'paperScraps'
            });
        }

        if (questType === '♥ Organize the Stacks' && rm.organizeTheStacksBaseXp != null) {
            const targetXp = rm.organizeTheStacksBaseXp;
            const delta = targetXp - modified.xp;
            if (delta !== 0) {
                modified.xp += delta;
                modified.modifiedBy.push('Expedition: The Ashen Crossroads');
                modified.receipt.modifiers.push({
                    source: 'Expedition: The Ashen Crossroads',
                    type: 'permanent',
                    value: delta,
                    description: `${delta > 0 ? '+' : ''}${delta} XP (Organize the Stacks track)`,
                    currency: 'xp'
                });
            }
        }

        if (questType === '♠ Dungeon Crawl' && rm.dungeonRoomXpPerRoomAdd > 0 && modified.xp > 0) {
            const add = rm.dungeonRoomXpPerRoomAdd;
            modified.xp += add;
            modified.modifiedBy.push('Expedition: The Reawakened Sanctum');
            modified.receipt.modifiers.push({
                source: 'Expedition: The Reawakened Sanctum',
                type: 'permanent',
                value: add,
                description: `+${add} XP (Dungeon room track bonus)`,
                currency: 'xp'
            });
        }

        if (rm.familiarRewardFlatBonus > 0 && famCtx && this._buffsListIncludesItem(appliedBuffs, famCtx.name)) {
            const m = famCtx.rewardModifier;
            const add = rm.familiarRewardFlatBonus;
            if (typeof m.inkDrops === 'number' && m.inkDrops > 0) {
                modified.inkDrops += add;
                modified.modifiedBy.push('Empowered Bond');
                modified.receipt.modifiers.push({
                    source: 'Empowered Bond',
                    type: 'permanent',
                    value: add,
                    description: `+${add} Ink Drops (familiar bonus)`,
                    currency: 'inkDrops'
                });
            }
            if (typeof m.paperScraps === 'number' && m.paperScraps > 0) {
                modified.paperScraps += add;
                if (!modified.modifiedBy.includes('Empowered Bond')) modified.modifiedBy.push('Empowered Bond');
                modified.receipt.modifiers.push({
                    source: 'Empowered Bond',
                    type: 'permanent',
                    value: add,
                    description: `+${add} Paper Scraps (familiar bonus)`,
                    currency: 'paperScraps'
                });
            }
        }

        modified.receipt.final.xp = modified.xp;
        modified.receipt.final.inkDrops = modified.inkDrops;
        modified.receipt.final.paperScraps = modified.paperScraps;
        modified.receipt.final.blueprints = modified.blueprints;
        return modified;
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

        // Apply buff/item modifiers (pass quest for page-count-aware items)
        if (appliedBuffs.length > 0) {
            rewards = this.applyModifiers(rewards, appliedBuffs, { quest });
        }

        // Apply background bonuses
        if (background) {
            rewards = this.applyBackgroundBonuses(rewards, quest, background);
        }

        // Apply school bonuses
        if (wizardSchool) {
            rewards = this.applySchoolBonuses(rewards, quest, wizardSchool);
        }

        rewards = this.applyPermanentQuestBonuses(rewards, quest, {
            appliedBuffs,
            permanentEffectInput: options.permanentEffectInput,
            permanentCapabilities: options.permanentCapabilities
        });

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
     * @param {Object} [options]
     * @param {number|null|undefined} [options.bookPageCount] - Page count for this batch (Library marks one book at a time)
     * @param {import('./PermanentEffectCapabilities.js').PermanentEffectCapabilityInput} [options.permanentEffectInput]
     * @param {ReturnType<typeof resolvePermanentEffectCapabilities>} [options.permanentCapabilities]
     * @returns {Reward} Reward with XP only
     */
    static calculateBookCompletionRewards(booksCompleted, options = {}) {
        const n = Math.max(0, Math.floor(Number(booksCompleted) || 0));
        const baseXpPerBook = GAME_CONFIG.endOfMonth.bookCompletionXP;
        let xp = n * baseXpPerBook;
        const caps = options.permanentCapabilities
            ? options.permanentCapabilities
            : options.permanentEffectInput
                ? resolvePermanentEffectCapabilities(options.permanentEffectInput)
                : this._resolvePermanentCaps(options);
        const longBonusPerBook = caps.rewardModifiers.longBookCompletionBonusXp || 0;
        let longBonusXp = 0;
        if (longBonusPerBook > 0 && n > 0 && options.bookPageCount != null) {
            const pc = Number(options.bookPageCount);
            if (Number.isFinite(pc) && pc >= 300) {
                longBonusXp = n * longBonusPerBook;
                xp += longBonusXp;
            }
        }

        const baseXpOnly = n * baseXpPerBook;
        const reward = new Reward({ xp, inkDrops: 0, paperScraps: 0, items: [] });
        reward.receipt.base.xp = baseXpOnly;
        reward.receipt.final.xp = xp;
        reward.receipt.modifiers.push({
            source: 'End of Month - Book Completion',
            type: 'system',
            value: baseXpOnly,
            description: `${n} books × ${baseXpPerBook} XP`,
            currency: 'xp'
        });
        if (longBonusXp > 0) {
            reward.modifiedBy.push("Novice's Focus");
            reward.receipt.modifiers.push({
                source: "Novice's Focus",
                type: 'permanent',
                value: longBonusXp,
                description: `+${longBonusXp} XP (${n} book(s) with 300+ pages)`,
                currency: 'xp'
            });
        }
        return reward;
    }

    /**
     * Calculate journal entry paper scrap rewards for end of month
     * Formula: journalEntries × (basePaperScraps + scribeBonus if Scribe background)
     * 
     * @param {number} journalEntries - Number of journal entries completed
     * @param {string} background - Keeper background key (e.g., 'scribe')
     * @param {Object} [options]
     * @param {import('./PermanentEffectCapabilities.js').PermanentEffectCapabilityInput} [options.permanentEffectInput]
     * @param {ReturnType<typeof resolvePermanentEffectCapabilities>} [options.permanentCapabilities]
     * @returns {Reward} Reward with paper scraps only
     */
    static calculateJournalEntryRewards(journalEntries, background = '', options = {}) {
        const j = Math.max(0, Math.floor(Number(journalEntries) || 0));
        const caps = options.permanentCapabilities
            ? options.permanentCapabilities
            : options.permanentEffectInput
                ? resolvePermanentEffectCapabilities(options.permanentEffectInput)
                : this._resolvePermanentCaps(options);

        const defaultBase = GAME_CONFIG.endOfMonth.journalEntry.basePaperScraps;
        const expeditionJournal = caps.rewardModifiers.adventureJournalPaperScraps;
        const perEntryBeforeScribe = expeditionJournal != null ? expeditionJournal : defaultBase;

        let papersPerEntry = perEntryBeforeScribe;
        const trueBaseTotal = j * defaultBase;
        const expeditionDeltaPerEntry = expeditionJournal != null ? expeditionJournal - defaultBase : 0;
        const expeditionBonusTotal = j * expeditionDeltaPerEntry;

        let bonusTotal = 0;
        if (background === 'scribe') {
            papersPerEntry += GAME_CONFIG.endOfMonth.journalEntry.scribeBonus;
            bonusTotal = j * GAME_CONFIG.endOfMonth.journalEntry.scribeBonus;
        }

        const paperScraps = j * papersPerEntry;
        const modifiedBy = [];
        if (expeditionBonusTotal > 0) modifiedBy.push('Expedition: The Midnight Waystation');
        if (background === 'scribe' && paperScraps > 0) modifiedBy.push('Scribe\'s Acolyte');

        const reward = new Reward({
            xp: 0,
            inkDrops: 0,
            paperScraps,
            items: [],
            modifiedBy
        });

        reward.receipt.base.paperScraps = trueBaseTotal;
        reward.receipt.final.paperScraps = paperScraps;

        if (trueBaseTotal > 0) {
            reward.receipt.modifiers.push({
                source: 'End of Month - Journal Entry',
                type: 'system',
                value: trueBaseTotal,
                description: `${j} entries × ${defaultBase} Paper Scraps`,
                currency: 'paperScraps'
            });
        }

        if (expeditionBonusTotal > 0) {
            reward.receipt.modifiers.push({
                source: 'Expedition: The Midnight Waystation',
                type: 'permanent',
                value: expeditionBonusTotal,
                description: `+${expeditionBonusTotal} Paper Scraps (${j} entries × +${expeditionDeltaPerEntry}; Adventure Journal track)`,
                currency: 'paperScraps'
            });
        }

        if (bonusTotal > 0) {
            reward.receipt.modifiers.push({
                source: 'Scribe\'s Acolyte',
                type: 'background',
                value: bonusTotal,
                description: `+${bonusTotal} Paper Scraps (${j} entries × ${GAME_CONFIG.endOfMonth.journalEntry.scribeBonus} bonus)`,
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
     * @param {Object} [calcOptions] - Optional permanent-effect resolution (Focused Atmosphere: +1 ink per day on positive rates)
     * @param {import('./PermanentEffectCapabilities.js').PermanentEffectCapabilityInput} [calcOptions.permanentEffectInput]
     * @param {ReturnType<typeof resolvePermanentEffectCapabilities>} [calcOptions.permanentCapabilities]
     * @returns {Reward} Reward with ink drops only
     */
    static calculateAtmosphericBuffRewards(atmosphericBuffs = {}, associatedBuffs = [], calcOptions = {}) {
        let totalInkDrops = 0;
        const processedBuffs = [];
        const reward = new Reward({ 
            xp: 0, 
            inkDrops: 0, 
            paperScraps: 0, 
            items: [],
            modifiedBy: [] 
        });

        const caps = calcOptions.permanentCapabilities
            ? calcOptions.permanentCapabilities
            : calcOptions.permanentEffectInput
                ? resolvePermanentEffectCapabilities(calcOptions.permanentEffectInput)
                : this._resolvePermanentCaps(calcOptions);
        const focusedAdd = caps.rewardModifiers.atmosphericPositiveInkDropBonusAdd || 0;

        for (const buffName in atmosphericBuffs) {
            const buff = atmosphericBuffs[buffName];
            
            // Only process buffs that were marked as active
            if (buff.isActive && buff.daysUsed > 0) {
                const isAssociated = associatedBuffs.includes(buffName);
                const dailyValue = isAssociated ? GAME_CONFIG.atmospheric.sanctumBonus : GAME_CONFIG.atmospheric.baseValue;
                const dailyEffective = dailyValue > 0 && focusedAdd > 0 ? dailyValue + focusedAdd : dailyValue;
                const buffTotal = buff.daysUsed * dailyEffective;
                totalInkDrops += buffTotal;
                
                if (buffTotal > 0) {
                    processedBuffs.push(buffName);
                    const focusNote = dailyValue > 0 && focusedAdd > 0 ? ' + Focused Atmosphere' : '';
                    reward.receipt.modifiers.push({
                        source: buffName,
                        type: 'atmospheric',
                        value: buffTotal,
                        description: `${buff.daysUsed} days × ${dailyEffective} Ink Drops${isAssociated ? ' (Sanctum bonus)' : ''}${focusNote}`,
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

