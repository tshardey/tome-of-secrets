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
import { TRIGGERS, MODIFIER_TYPES, RESOURCES } from './effectSchema.js';
import { isSecondaryQuestOnBook } from '../utils/questLinkRules.js';
import { isUseCountBuffSpent } from '../utils/useCountBuffs.js';

/**
 * Represents a reward package with XP, dollars (the real-money Fund), blueprints, and items.
 * Dollars are whole dollars; the Fund stores cents (see StateAdapter.addFunds).
 */
export class Reward {
    constructor({ xp = 0, dollars = 0, blueprints = 0, items = [], modifiedBy = [] } = {}) {
        this.xp = xp;
        this.dollars = dollars;
        this.blueprints = blueprints;
        this.items = Array.isArray(items) ? items : [];
        this.modifiedBy = Array.isArray(modifiedBy) ? modifiedBy : []; // Track what modifiers were applied

        // Calculation receipt/breakdown for transparency
        this.receipt = {
            base: { xp: 0, dollars: 0, blueprints: 0 },
            modifiers: [], // Array of { source, type, value, description, currency }
            final: { xp: 0, dollars: 0, blueprints: 0 }
        };
    }

    /**
     * Build a Reward from an authored JSON rewards object (side quest, room, encounter).
     * Only XP, blueprints, and items are read: every quest's dollars come from the flat
     * quest base, so any legacy currency keys on the authored object are ignored.
     * @param {Object} authored
     * @returns {Reward}
     */
    static fromAuthored(authored = {}) {
        const source = authored && typeof authored === 'object' ? authored : {};
        return new Reward({
            xp: Number(source.xp) || 0,
            blueprints: Number(source.blueprints) || 0,
            items: Array.isArray(source.items) ? [...source.items] : []
        });
    }

    /**
     * Clone this reward
     */
    clone() {
        const cloned = new Reward({
            xp: this.xp,
            dollars: this.dollars,
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

    /** Copy the current resource values into receipt.base and receipt.final. */
    syncReceiptBase() {
        this.receipt.base = { xp: this.xp, dollars: this.dollars, blueprints: this.blueprints };
        this.receipt.final = { ...this.receipt.base };
        return this;
    }

    /** Copy the current resource values into receipt.final. */
    syncReceiptFinal() {
        this.receipt.final = { xp: this.xp, dollars: this.dollars, blueprints: this.blueprints };
        return this;
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
            dollars: this.dollars,
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
     * Get base rewards for a quest type and prompt.
     * Every quest type pays the flat GAME_CONFIG.rewards.questBase dollars; XP, blueprints,
     * and items come from the quest type or its authored JSON.
     * @param {string} type - Quest type (♠, ♣, ♥, ⭐, restoration)
     * @param {string} prompt - Quest prompt
     * @param {Object} options - Additional options
     * @returns {Reward}
     */
    static getBaseRewards(type, prompt, options = {}) {
        const {
            isEncounter = false,
            roomNumber = null,
            encounterName = null,
            isBefriend = true,
            sideQuestId = null,
            branchKey = null
        } = options;
        let reward;

        if (type === '♥ Organize the Stacks') {
            reward = new Reward({ xp: GAME_CONFIG.rewards.organizeTheStacks.xp });
        } else if (type === '♣ Side Quest') {
            reward = this._getSideQuestRewards(prompt || '', sideQuestId, branchKey);
        } else if (type === '♠ Dungeon Crawl') {
            reward = this._getDungeonRewards(isEncounter, roomNumber, encounterName, isBefriend);
        } else {
            // Extra Credit, restoration projects, and any other quest type: dollars only.
            reward = new Reward();
        }

        reward.dollars = GAME_CONFIG.rewards.questBase.dollars;
        return reward.syncReceiptBase();
    }

    /**
     * Resolve the rewards for a side quest, honouring a chosen branch when there is one.
     *
     * Branching quests keep their flat prompt/reward/rewards fields populated with branch A's
     * values, so a renderer or a stored quest that predates branches still resolves correctly.
     *
     * @param {string} prompt
     * @param {string|null} sideQuestId
     * @param {string|null} branchKey - 'A'..'D' or '1'..'4'; null resolves the flat rewards
     * @private
     */
    static _getSideQuestRewards(prompt, sideQuestId = null, branchKey = null) {
        const resolveFor = (sideQuest) => {
            if (branchKey && Array.isArray(sideQuest.branches)) {
                const branch = sideQuest.branches.find((b) => b?.key === branchKey);
                if (branch?.rewards) return Reward.fromAuthored(branch.rewards);
            }
            return Reward.fromAuthored(sideQuest.rewards);
        };

        if (sideQuestId && data.sideQuestsById?.has(sideQuestId)) {
            return resolveFor(data.sideQuestsById.get(sideQuestId));
        }

        for (const key in data.sideQuestsDetailed) {
            const sideQuest = data.sideQuestsDetailed[key];
            if (prompt.includes(sideQuest.prompt) || prompt.includes(sideQuest.name)) {
                return resolveFor(sideQuest);
            }
        }

        return new Reward();
    }

    /**
     * Get the XP/blueprint/item part of a dungeon crawl's rewards (dollars come from the quest base).
     * @private
     */
    static _getDungeonRewards(isEncounter, roomNumber, encounterName, isBefriend = true) {
        const room = roomNumber ? data.dungeonRooms[roomNumber] : null;
        if (!room) {
            return new Reward();
        }

        // Encounter rewards
        if (isEncounter && encounterName && room.encountersDetailed) {
            const encounter = room.encountersDetailed.find(e => e.name === encounterName);
            if (encounter?.rewards) {
                const rewards = Reward.fromAuthored(encounter.rewards);
                // Befriending a familiar rewards the familiar itself
                if (encounter.type === 'Familiar' && isBefriend && !rewards.items.includes(encounterName)) {
                    rewards.items.push(encounterName);
                }
                return rewards;
            }

            // Fallback based on encounter type
            if (encounter?.type === 'Monster') {
                return new Reward({ xp: GAME_CONFIG.rewards.encounter.monster.xp });
            }
            if (encounter?.type === 'Familiar') {
                return new Reward({ items: isBefriend ? [encounterName] : [] });
            }
            return new Reward();
        }

        // Room challenge rewards
        if (room.roomRewards) {
            return Reward.fromAuthored(room.roomRewards);
        }

        return new Reward();
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
            if (book && Array.isArray(book.tags)) {
                tags = [...new Set([...tags, ...book.tags])];
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
            ...bucket(buffEffects, MODIFIER_TYPES.PREVENT),
            ...bucket(registryEffects, MODIFIER_TYPES.PREVENT),
            ...regOther
        ];
    }

    static _modifierToBuffCardEffects(modifier, sourceLabel) {
        const source = { name: sourceLabel };
        return RESOURCES
            .filter(resource => typeof modifier[resource] === 'number' && modifier[resource] !== 0)
            .map(resource => ({
                effect: {
                    trigger: TRIGGERS.ON_QUEST_COMPLETED,
                    modifier: { type: MODIFIER_TYPES.ADD_FLAT, resource, value: modifier[resource] }
                },
                source
            }));
    }

    static _appendBuffCardSkips(reward, appliedBuffs = [], quest = {}, temporaryBuffs = null) {
        if (!appliedBuffs.length) {
            return;
        }
        const pageCountEffective = quest.pageCountEffective ?? quest.pageCountRaw ?? null;
        appliedBuffs.forEach(buffName => {
            const { cleanName, isItem, isBackground } = this._parseBuffName(buffName);
            const result = this._getModifier(cleanName, isItem, isBackground, { pageCountEffective, temporaryBuffs });
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

    static _collectBuffCardPipelineEffects(appliedBuffs = [], quest = {}, temporaryBuffs = null) {
        const entries = [];
        if (!appliedBuffs.length) {
            return entries;
        }
        const pageCountEffective = quest.pageCountEffective ?? quest.pageCountRaw ?? null;
        appliedBuffs.forEach(buffName => {
            const { cleanName, isItem, isBackground } = this._parseBuffName(buffName);
            // Background effects are now sourced from EffectRegistry using keeperBackgrounds.json.
            // Skipping legacy background cards here prevents pipeline double-application.
            if (isBackground) {
                return;
            }
            const result = this._getModifier(cleanName, isItem, isBackground, { pageCountEffective, temporaryBuffs });
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

        // Background bonuses come from EffectRegistry (keeperBackgrounds.json), not buff cards.
        if (isBackground) {
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

            const baseModifier = forPassive && item.passiveRewardModifier
                ? item.passiveRewardModifier
                : item.rewardModifier;
            return { modifier: baseModifier };
        }

        // Temporary buff modifiers (check both new and legacy sources)
        const buffData = (data.temporaryBuffs && data.temporaryBuffs[cleanName]) ||
            (data.temporaryBuffsFromRewards && data.temporaryBuffsFromRewards[cleanName]) ||
            null;
        if (buffData) {
            // Use-count buffs (Enchanted Focus, Story Surge, ...) stop paying once their uses are spent.
            const useCount = Number(buffData.useCount) || 0;
            if (useCount > 0 && isUseCountBuffSpent(context.temporaryBuffs, cleanName, useCount)) {
                return { modifier: null, skipReason: 'no uses left' };
            }
            return { modifier: buffData.rewardModifier };
        }

        return { modifier: null };
    }

    /**
     * Total familiar dollar boost from ON_STATE_LOAD `familiar_bonus` effects
     * (Empowered Bond +$1, Echo Chamber +$3; they stack).
     * @private
     */
    static _familiarDollarBonus(adapter) {
        return EffectRegistry.getActiveEffects(TRIGGERS.ON_STATE_LOAD, adapter, data).reduce((sum, { effect }) => {
            const modifier = effect?.modifier;
            const isFamiliarBonus =
                modifier?.type === MODIFIER_TYPES.ADD_FLAT &&
                modifier.target === 'familiar_bonus' &&
                typeof modifier.value === 'number';
            return isFamiliarBonus ? sum + modifier.value : sum;
        }, 0);
    }

    /**
     * Raise each equipped familiar's dollar bonus by the familiar boost. The boost is folded into
     * the familiar's own equipped dollar effect (once per familiar), so it applies only when that
     * bonus fires and the receipt shows a single boosted line.
     * @private
     */
    static _boostEquippedFamiliarDollars(registryEffects, adapter) {
        const bonus = this._familiarDollarBonus(adapter);
        if (!bonus) {
            return registryEffects;
        }
        const boosted = new Set();
        return registryEffects.map((entry) => {
            const { effect, source } = entry;
            const modifier = effect?.modifier;
            if (
                source?.sourceType !== 'item' ||
                effect?.slot !== 'equipped' ||
                modifier?.type !== MODIFIER_TYPES.ADD_FLAT ||
                modifier.resource !== 'dollars' ||
                boosted.has(source.id)
            ) {
                return entry;
            }
            const item =
                data.allItems?.[source.name] ||
                Object.values(data.allItems || {}).find((row) => row?.id === source.id);
            if (item?.type !== 'Familiar') {
                return entry;
            }
            boosted.add(source.id);
            return { ...entry, effect: { ...effect, modifier: { ...modifier, value: modifier.value + bonus } } };
        });
    }

    /**
     * A quest that is its book's second link (cleared through a multi-quest ability) pays
     * secondaryQuestBase instead of questBase. Only the base changes; bonuses apply normally.
     * Mutates rewards in place.
     * @param {Reward} rewards - base rewards, before the pipeline runs
     * @param {Object} quest - quest being completed (bookId, id)
     * @param {function(string): Object|null} [getBook]
     * @param {boolean|null} [isSecondaryQuest] - caller's verdict (e.g. a batch whose links are
     *   not stored yet); null reads it from the book's stored links
     * @param {Object|null} [stateAdapter] - preferred link lookup (ignores stale links); getBook is the fallback
     * @private
     */
    static _applySecondaryQuestBase(rewards, quest, getBook, isSecondaryQuest = null, stateAdapter = null) {
        if (rewards.dollars !== GAME_CONFIG.rewards.questBase.dollars) return;
        let secondary = false;
        if (typeof isSecondaryQuest === 'boolean') {
            secondary = isSecondaryQuest;
        } else if (quest?.bookId && typeof stateAdapter?.isSecondaryQuestForBook === 'function') {
            secondary = stateAdapter.isSecondaryQuestForBook(quest.bookId, quest.id);
        } else if (quest?.bookId && typeof getBook === 'function') {
            secondary = isSecondaryQuestOnBook(getBook(quest.bookId), quest.id);
        }
        if (!secondary) return;
        rewards.dollars = GAME_CONFIG.rewards.secondaryQuestBase.dollars;
        rewards.syncReceiptBase();
    }

    /**
     * Calculate final rewards for a quest with all modifiers
     * @param {string} type - Quest type
     * @param {string} prompt - Quest prompt
     * @param {Object} options - appliedBuffs, background, quest, wizardSchool, stateAdapter, getBook, baseRewardOverride,
     *   isSecondaryQuest (optional override of the book-link lookup for the $10 secondary base),
     *   temporaryBuffs (optional override of the state's temporary buffs, used to gate spent use-count buffs)
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
            getBook = null,
            isSecondaryQuest = null,
            temporaryBuffs: temporaryBuffsOverride = null
        } = options;

        const rewards = baseRewardOverride
            ? baseRewardOverride.clone()
            : this.getBaseRewards(type, prompt, { isEncounter, roomNumber, encounterName, isBefriend });
        this._applySecondaryQuestBase(rewards, quest, getBook, isSecondaryQuest, stateAdapter);

        const formData = {
            ...(stateAdapter?.formData || {}),
            keeperBackground: background ?? '',
            wizardSchool: wizardSchool ?? ''
        };
        const adapter = stateAdapter
            ? Object.create(stateAdapter, { formData: { value: formData, enumerable: true } })
            : { state: characterState, formData };

        const pipelineState = this._pipelineStateFromAdapter(adapter);
        const temporaryBuffs = temporaryBuffsOverride ?? pipelineState?.[STORAGE_KEYS.TEMPORARY_BUFFS] ?? null;
        this._appendBuffCardSkips(rewards, appliedBuffs, quest, temporaryBuffs);

        const payload = this._buildQuestCompletedPayload(type, prompt, quest, {
            isEncounter,
            roomNumber,
            encounterName,
            isBefriend,
            getBook,
            state: pipelineState
        });

        const registryEffects = this._boostEquippedFamiliarDollars(
            EffectRegistry.getActiveEffects(TRIGGERS.ON_QUEST_COMPLETED, adapter, data),
            adapter
        );
        const buffEffects = this._collectBuffCardPipelineEffects(appliedBuffs, quest, temporaryBuffs);
        const activeEffects = this._mergePipelineEffectOrder(registryEffects, buffEffects);

        const finalReward = ModifierPipeline.resolve(
            TRIGGERS.ON_QUEST_COMPLETED,
            payload,
            activeEffects,
            rewards
        );

        return finalReward.syncReceiptFinal();
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
        const reward = new Reward({ xp });
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
     * Calculate atmospheric buff dollar rewards for end of month
     * Formula: Sum of (daysUsed × dailyValue) for each active buff
     * - Associated buffs (from selected sanctum): dailyValue = GAME_CONFIG.atmospheric.sanctumBonus
     * - Other buffs: dailyValue = GAME_CONFIG.atmospheric.baseValue
     *
     * @param {Object} atmosphericBuffs - Object mapping buff names to { daysUsed, isActive }
     * @param {Array<string>} associatedBuffs - Array of buff names associated with selected sanctum
     * @param {Array<string>} [forcedActiveBuffNames] - Buffs always treated as active for EOM reward (e.g. Grove Tender pipeline)
     * @param {{ dailyBonus?: number, dailyBonusSource?: string|null, trackableItemValues?: Object<string, number> }} [options]
     *   dailyBonus: flat dollars added for every paying day (buff and trackable-item days), e.g. Tome-Bound Cat.
     * @returns {Reward} Reward with dollars only
     */
    static calculateAtmosphericBuffRewards(
        atmosphericBuffs = {},
        associatedBuffs = [],
        forcedActiveBuffNames = [],
        options = {}
    ) {
        const { dailyBonus = 0, dailyBonusSource = null, trackableItemValues = {} } = options;
        let total = 0;
        let bonusDays = 0;
        const processedBuffs = [];
        const reward = new Reward();
        const forcedActive = new Set();
        if (Array.isArray(forcedActiveBuffNames)) {
            forcedActiveBuffNames.filter(Boolean).forEach((name) => {
                const id = data.getAtmosphericBuff(name)?.id;
                forcedActive.add(name);
                if (id) forcedActive.add(id);
            });
        }
        const associatedSet = new Set(
            Array.isArray(associatedBuffs)
                ? associatedBuffs.map((nameOrId) => data.getAtmosphericBuff(nameOrId)?.id || nameOrId).filter(Boolean)
                : []
        );

        for (const buffName in atmosphericBuffs) {
            const buff = atmosphericBuffs[buffName];
            const trackableValue = trackableItemValues[buffName];
            const isTrackableItem = typeof trackableValue === 'number';
            const countsForReward =
                buff.daysUsed > 0 &&
                (isTrackableItem || buff.isActive === true || forcedActive.has(buffName));
            if (!countsForReward) continue;

            let dailyValue;
            let descriptionSuffix;
            if (isTrackableItem) {
                // Equipped/displayed atmospheric items are always active; their per-day
                // value comes from the item, not the sanctum table.
                dailyValue = trackableValue;
                descriptionSuffix = ' (from item)';
            } else {
                const buffId = data.getAtmosphericBuff(buffName)?.id || buffName;
                const isAssociated = associatedSet.has(buffId);
                dailyValue = isAssociated
                    ? GAME_CONFIG.atmospheric.sanctumBonus
                    : GAME_CONFIG.atmospheric.baseValue;
                descriptionSuffix = isAssociated ? ' (Sanctum bonus)' : '';
            }

            const buffTotal = buff.daysUsed * dailyValue;
            total += buffTotal;

            if (buffTotal > 0) {
                bonusDays += buff.daysUsed;
                processedBuffs.push(buffName);
                reward.receipt.modifiers.push({
                    source: buffName,
                    type: 'atmospheric',
                    value: buffTotal,
                    description: `${buff.daysUsed} days × $${dailyValue}${descriptionSuffix}`,
                    currency: GAME_CONFIG.atmospheric.resource
                });
            }
        }

        // Flat per-day item bonus (e.g. Tome-Bound Cat +$1 on every paying atmospheric day).
        if (dailyBonus > 0 && bonusDays > 0) {
            const bonusTotal = bonusDays * dailyBonus;
            total += bonusTotal;
            reward.receipt.modifiers.push({
                source: dailyBonusSource || 'Atmospheric bonus',
                type: 'atmospheric-bonus',
                value: bonusTotal,
                description: `${bonusDays} days × +$${dailyBonus}`,
                currency: GAME_CONFIG.atmospheric.resource
            });
        }

        reward[GAME_CONFIG.atmospheric.resource] = total;
        reward.modifiedBy = processedBuffs;
        // No base: everything comes from the per-buff modifier lines.
        reward.syncReceiptFinal();

        return reward;
    }
}

