/**
 * RewardCalculator Service
 * Centralizes all reward calculation logic for quests
 */

import * as data from '../character-sheet/data.js';
import { GAME_CONFIG } from '../config/gameConfig.js';
import { characterState } from '../character-sheet/state.js';
import { STORAGE_KEYS } from '../character-sheet/storageKeys.js';
import { ModifierPipeline } from './ModifierPipeline.js';
import { EffectRegistry } from './EffectRegistry.js';
import { TriggerPayload } from './TriggerPayload.js';
import { TRIGGERS, MODIFIER_TYPES } from './effectSchema.js';

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

    static _pipelineStateFromAdapter(stateAdapter) {
        if (!stateAdapter) {
            return characterState;
        }
        return stateAdapter.state != null ? stateAdapter.state : stateAdapter;
    }

    static _familiarEquippedFromState(state) {
        if (!state) {
            return false;
        }
        const equipped = state[STORAGE_KEYS.EQUIPPED_ITEMS] || [];
        return equipped.some(entry => {
            const row = typeof entry === 'string' ? { name: entry } : entry;
            return row?.type === 'Familiar';
        });
    }

    static _genreForQuestPayload(type, prompt, quest, getBook) {
        if (quest?.genre) {
            return quest.genre;
        }
        if (type === '♥ Organize the Stacks' && prompt) {
            const idx = prompt.indexOf(':');
            if (idx > 0) {
                const g = prompt.slice(0, idx).trim();
                return g || null;
            }
            const trimmed = prompt.trim();
            return trimmed || null;
        }
        if (getBook && typeof getBook === 'function' && quest?.bookId) {
            const book = getBook(quest.bookId);
            if (book && typeof book.genre === 'string' && book.genre.trim()) {
                return book.genre.trim();
            }
        }
        return null;
    }

    static _buildQuestCompletedPayload(type, prompt, quest, ctx) {
        const {
            isEncounter,
            roomNumber,
            encounterName,
            isBefriend,
            getBook,
            state
        } = ctx;
        const questTypeKey = TriggerPayload.canonicalQuestType(type);
        let encounterType = null;
        if (isEncounter && roomNumber && encounterName && data.dungeonRooms[roomNumber]) {
            const room = data.dungeonRooms[roomNumber];
            const enc = room.encountersDetailed?.find(e => e.name === encounterName);
            encounterType = enc?.type || null;
        }
        const genre = this._genreForQuestPayload(type, prompt, quest, getBook);
        const pageCount = quest?.pageCountEffective ?? quest?.pageCountRaw ?? null;
        const bookId = quest?.bookId ?? null;
        let tags = Array.isArray(quest?.tags) ? [...quest.tags] : [];
        if (getBook && typeof getBook === 'function' && bookId) {
            const book = getBook(bookId);
            if (book && Array.isArray(book.premiseTags)) {
                tags = [...new Set([...tags, ...book.premiseTags])];
            }
        }
        return TriggerPayload.questCompleted({
            questType: questTypeKey,
            prompt: prompt || '',
            isEncounter: Boolean(isEncounter),
            encounterName: encounterName || '',
            encounterType,
            isBefriend: Boolean(isBefriend),
            roomNumber: roomNumber ?? null,
            genre,
            pageCount,
            bookId,
            tags,
            hasFamiliarEquipped: this._familiarEquippedFromState(state)
        });
    }

    static _effectEntryIsResolvable(effectEntry) {
        const t = effectEntry?.effect?.modifier?.type;
        return (
            t === MODIFIER_TYPES.ADD_FLAT ||
            t === MODIFIER_TYPES.GRANT_RESOURCE ||
            t === MODIFIER_TYPES.MULTIPLY ||
            t === MODIFIER_TYPES.PREVENT
        );
    }

    static _mergePipelineEffectOrder(registryEffects, buffEffects) {
        const bucket = (list, modType) => list.filter(e => e.effect?.modifier?.type === modType);
        const regOther = registryEffects.filter(e => !this._effectEntryIsResolvable(e));
        return [
            ...bucket(buffEffects, MODIFIER_TYPES.ADD_FLAT),
            ...bucket(registryEffects, MODIFIER_TYPES.ADD_FLAT),
            ...bucket(buffEffects, MODIFIER_TYPES.GRANT_RESOURCE),
            ...bucket(registryEffects, MODIFIER_TYPES.GRANT_RESOURCE),
            ...bucket(buffEffects, MODIFIER_TYPES.MULTIPLY),
            ...bucket(registryEffects, MODIFIER_TYPES.MULTIPLY),
            ...bucket(buffEffects, MODIFIER_TYPES.PREVENT),
            ...bucket(registryEffects, MODIFIER_TYPES.PREVENT),
            ...regOther
        ];
    }

    static _modifierToBuffCardEffects(modifier, sourceLabel) {
        const source = { name: sourceLabel };
        const out = [];
        if (modifier.xp) {
            out.push({
                effect: {
                    trigger: TRIGGERS.ON_QUEST_COMPLETED,
                    modifier: { type: MODIFIER_TYPES.ADD_FLAT, resource: 'xp', value: modifier.xp }
                },
                source
            });
        }
        if (modifier.inkDrops) {
            out.push({
                effect: {
                    trigger: TRIGGERS.ON_QUEST_COMPLETED,
                    modifier: { type: MODIFIER_TYPES.ADD_FLAT, resource: 'inkDrops', value: modifier.inkDrops }
                },
                source
            });
        }
        if (modifier.paperScraps) {
            out.push({
                effect: {
                    trigger: TRIGGERS.ON_QUEST_COMPLETED,
                    modifier: { type: MODIFIER_TYPES.ADD_FLAT, resource: 'paperScraps', value: modifier.paperScraps }
                },
                source
            });
        }
        if (modifier.inkDropsMultiplier) {
            out.push({
                effect: {
                    trigger: TRIGGERS.ON_QUEST_COMPLETED,
                    modifier: {
                        type: MODIFIER_TYPES.MULTIPLY,
                        resource: 'inkDrops',
                        value: modifier.inkDropsMultiplier
                    }
                },
                source
            });
        }
        return out;
    }

    static _appendBuffCardSkips(reward, appliedBuffs = [], quest = {}) {
        if (!appliedBuffs.length) {
            return;
        }
        const pageCountEffective = quest.pageCountEffective ?? quest.pageCountRaw ?? null;
        appliedBuffs.forEach(buffName => {
            const { cleanName, isItem, isBackground } = this._parseBuffName(buffName);
            const result = this._getModifier(cleanName, isItem, isBackground, { pageCountEffective });
            if (!result.skipReason) {
                return;
            }
            reward.receipt.modifiers.push({
                source: cleanName,
                type: isItem ? 'item' : (isBackground ? 'background' : 'buff'),
                value: null,
                description: `${cleanName}: skipped (${result.skipReason})`,
                currency: null
            });
        });
    }

    static _collectBuffCardPipelineEffects(appliedBuffs = [], quest = {}) {
        const entries = [];
        if (!appliedBuffs.length) {
            return entries;
        }
        const pageCountEffective = quest.pageCountEffective ?? quest.pageCountRaw ?? null;
        appliedBuffs.forEach(buffName => {
            const { cleanName, isItem, isBackground } = this._parseBuffName(buffName);
            const result = this._getModifier(cleanName, isItem, isBackground, { pageCountEffective });
            if (result.skipReason || !result.modifier) {
                return;
            }
            entries.push(...this._modifierToBuffCardEffects(result.modifier, cleanName));
        });
        return entries;
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
     * Calculate final rewards for a quest with all modifiers
     * @param {string} type - Quest type
     * @param {string} prompt - Quest prompt
     * @param {Object} options - appliedBuffs, background, quest, wizardSchool, stateAdapter, getBook, baseRewardOverride
     * @returns {Reward}
     */
    static calculateFinalRewards(type, prompt, options = {}) {
        const {
            baseRewardOverride = null,
            appliedBuffs = [],
            background = null,
            wizardSchool = null,
            quest = {},
            isEncounter = false,
            roomNumber = null,
            encounterName = null,
            isBefriend = true,
            stateAdapter = null,
            getBook = null
        } = options;

        const rewards = baseRewardOverride
            ? baseRewardOverride.clone()
            : this.getBaseRewards(type, prompt, { isEncounter, roomNumber, encounterName, isBefriend });

        const adapter = stateAdapter || {
            state: characterState,
            formData: {
                keeperBackground: background ?? '',
                wizardSchool: wizardSchool ?? ''
            }
        };

        this._appendBuffCardSkips(rewards, appliedBuffs, quest);

        const pipelineState = this._pipelineStateFromAdapter(adapter);
        const payload = this._buildQuestCompletedPayload(type, prompt, quest, {
            isEncounter,
            roomNumber,
            encounterName,
            isBefriend,
            getBook,
            state: pipelineState
        });

        const registryEffects = EffectRegistry.getActiveEffects(
            TRIGGERS.ON_QUEST_COMPLETED,
            adapter,
            data
        );
        const buffEffects = this._collectBuffCardPipelineEffects(appliedBuffs, quest);
        const activeEffects = this._mergePipelineEffectOrder(registryEffects, buffEffects);

        const finalReward = ModifierPipeline.resolve(
            TRIGGERS.ON_QUEST_COMPLETED,
            payload,
            activeEffects,
            rewards
        );

        finalReward.receipt.final.xp = finalReward.xp;
        finalReward.receipt.final.inkDrops = finalReward.inkDrops;
        finalReward.receipt.final.paperScraps = finalReward.paperScraps;
        finalReward.receipt.final.blueprints = finalReward.blueprints;

        return finalReward;
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
     * Calculate journal entry paper scrap rewards for end of month.
     * Base: journalEntries × GAME_CONFIG.endOfMonth.journalEntry.basePaperScraps.
     * ON_JOURNAL_ENTRY effects (scribe background, Librarian's Quill, Golden Pen, etc.) apply via ModifierPipeline.
     *
     * @param {number} journalEntries - Number of journal entries completed
     * @param {Object} [context]
     * @param {object} [context.stateAdapter] - For EffectRegistry (state + optional formData: keeperBackground, wizardSchool)
     * @param {object} [context.dataModule] - Data catalogs (keeperBackgrounds, allItems, …)
     * @returns {Reward} Reward with paper scraps only
     */
    static calculateJournalEntryRewards(journalEntries, context = {}) {
        const ctx = typeof context === 'string' ? {} : context || {};
        const { stateAdapter = null, dataModule = null } = ctx;

        const n = Math.max(0, journalEntries);
        const basePer = GAME_CONFIG.endOfMonth.journalEntry.basePaperScraps;
        const baseTotal = n * basePer;

        const reward = new Reward({
            xp: 0,
            inkDrops: 0,
            paperScraps: baseTotal,
            items: []
        });

        reward.receipt.base.paperScraps = baseTotal;
        reward.receipt.final.paperScraps = baseTotal;

        if (baseTotal > 0) {
            reward.receipt.modifiers.push({
                source: 'End of Month - Journal Entry',
                type: 'system',
                value: baseTotal,
                description: `${n} entries × ${basePer} Paper Scraps`,
                currency: 'paperScraps'
            });
        }

        if (!stateAdapter || !dataModule || n === 0) {
            return reward;
        }

        const payload = TriggerPayload.journalEntry({ entryCount: n });
        const effects = EffectRegistry.getActiveEffects(TRIGGERS.ON_JOURNAL_ENTRY, stateAdapter, dataModule);
        return ModifierPipeline.resolve(TRIGGERS.ON_JOURNAL_ENTRY, payload, effects, reward);
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

