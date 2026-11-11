import { STORAGE_KEYS } from './storageKeys.js';
import { safeGetJSON } from '../utils/storage.js';
import { setStateKey, setSaveJSON } from './persistence.js';
import { validateBookTidy } from './dataValidator.js';
import { deriveBookType, isBookType, normalizeBookStatus, normalizeLibraryFields } from '../utils/bookTypes.js';
import { withoutTypeDerivedTags } from '../utils/bookTagRules.js';
import { buildSourceId } from './helperDiscoveryShared.js';
import { buildQuestDrawHelperList } from './questDrawHelperDiscovery.js';
import { isIsoDate, todayIsoDate } from '../services/FundLedgerService.js';
import { evaluateQuestLink, getGrandfatheredQuestIds, getLinkedQuestIds, isSameBook, isSecondaryQuestOnBook } from '../utils/questLinkRules.js';
import { spendUseCountBuffs } from '../utils/useCountBuffs.js';

const EVENTS = Object.freeze({
    SELECTED_GENRES_CHANGED: 'selectedGenresChanged',
    ACTIVE_ASSIGNMENTS_CHANGED: 'activeAssignmentsChanged',
    COMPLETED_QUESTS_CHANGED: 'completedQuestsChanged',
    DISCARDED_QUESTS_CHANGED: 'discardedQuestsChanged',
    INVENTORY_ITEMS_CHANGED: 'inventoryItemsChanged',
    EQUIPPED_ITEMS_CHANGED: 'equippedItemsChanged',
    TEMPORARY_BUFFS_CHANGED: 'temporaryBuffsChanged',
    LEARNED_ABILITIES_CHANGED: 'learnedAbilitiesChanged',
    ATMOSPHERIC_BUFFS_CHANGED: 'atmosphericBuffsChanged',
    // Library Restoration Expansion events
    DUSTY_BLUEPRINTS_CHANGED: 'dustyBlueprintsChanged',
    COMPLETED_RESTORATION_PROJECTS_CHANGED: 'completedRestorationProjectsChanged',
    COMPLETED_WINGS_CHANGED: 'completedWingsChanged',
    PASSIVE_ITEM_SLOTS_CHANGED: 'passiveItemSlotsChanged',
    PASSIVE_FAMILIAR_SLOTS_CHANGED: 'passiveFamiliarSlotsChanged',
    CLAIMED_ROOM_REWARDS_CHANGED: 'claimedRoomRewardsChanged',
    // Book-First Paradigm (Schema v5)
    BOOKS_CHANGED: 'booksChanged',
    EXTERNAL_CURRICULUM_CHANGED: 'externalCurriculumChanged',
    // The Archive – series tracker
    SERIES_CHANGED: 'seriesChanged',
    CLAIMED_SERIES_REWARDS_CHANGED: 'claimedSeriesRewardsChanged',
    SERIES_EXPEDITION_PROGRESS_CHANGED: 'seriesExpeditionProgressChanged',
    // The Exchange's register – countries struck off once, ever
    CLAIMED_COUNTRIES_CHANGED: 'claimedCountriesChanged',
    // Real-dollar Fund (dollar economy); payload { balanceCents }
    FUND_CHANGED: 'fundChanged',
    // Schema v20: the Unsorted-books review; payload is the new bookTidy
    BOOK_TIDY_CHANGED: 'bookTidyChanged'
});

/** Set type and the library fields from the v20 rules (a shelf book needs a libraryBookId). */
function applyBookTypeRules(book) {
    const type = deriveBookType(book);
    Object.assign(book, { type, ...normalizeLibraryFields(type, book) });
    delete book.shelfCategory;
    return book;
}

const LIST_EVENTS = Object.freeze({
    [STORAGE_KEYS.ACTIVE_ASSIGNMENTS]: EVENTS.ACTIVE_ASSIGNMENTS_CHANGED,
    [STORAGE_KEYS.COMPLETED_QUESTS]: EVENTS.COMPLETED_QUESTS_CHANGED,
    [STORAGE_KEYS.DISCARDED_QUESTS]: EVENTS.DISCARDED_QUESTS_CHANGED,
    [STORAGE_KEYS.INVENTORY_ITEMS]: EVENTS.INVENTORY_ITEMS_CHANGED,
    [STORAGE_KEYS.EQUIPPED_ITEMS]: EVENTS.EQUIPPED_ITEMS_CHANGED,
    [STORAGE_KEYS.TEMPORARY_BUFFS]: EVENTS.TEMPORARY_BUFFS_CHANGED,
    [STORAGE_KEYS.LEARNED_ABILITIES]: EVENTS.LEARNED_ABILITIES_CHANGED,
    // Library Restoration Expansion
    [STORAGE_KEYS.COMPLETED_RESTORATION_PROJECTS]: EVENTS.COMPLETED_RESTORATION_PROJECTS_CHANGED,
    [STORAGE_KEYS.COMPLETED_WINGS]: EVENTS.COMPLETED_WINGS_CHANGED,
    [STORAGE_KEYS.PASSIVE_ITEM_SLOTS]: EVENTS.PASSIVE_ITEM_SLOTS_CHANGED,
    [STORAGE_KEYS.PASSIVE_FAMILIAR_SLOTS]: EVENTS.PASSIVE_FAMILIAR_SLOTS_CHANGED,
    [STORAGE_KEYS.CLAIMED_ROOM_REWARDS]: EVENTS.CLAIMED_ROOM_REWARDS_CHANGED,
    [STORAGE_KEYS.SERIES_EXPEDITION_PROGRESS]: EVENTS.SERIES_EXPEDITION_PROGRESS_CHANGED
});

function sanitizeGenreList(genres) {
    if (!Array.isArray(genres)) return [];
    const unique = new Set();
    genres.forEach(genre => {
        if (typeof genre === 'string') {
            const trimmed = genre.trim();
            if (trimmed.length > 0) unique.add(trimmed);
        }
    });
    return Array.from(unique);
}

function arraysEqual(a, b) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i += 1) {
        if (a[i] !== b[i]) return false;
    }
    return true;
}

export class StateAdapter {
    constructor(state) {
        this.state = state;
        this.listeners = new Map();
    }

    /**
     * ON_QUEST_DRAFTED pipeline hook; character-sheet.js replaces this with QuestDraftEffectService wiring.
     * Default no-op so addActiveQuests never depends on initialization order.
     * @param {Object[]} _quests
     */
    applyQuestDraftedEffects(_quests) {}

    _mutateList(key, mutator) {
        let list = this.state[key];
        if (!Array.isArray(list)) {
            // Initialize as empty array if undefined or not an array
            if (list === undefined || list === null) {
                this.state[key] = [];
                list = this.state[key];
            } else {
                console.warn(`StateAdapter: attempted to mutate non-array state key "${key}".`);
                return { changed: false, value: undefined, list };
            }
        }

        const result = mutator(list) || {};
        const changed = Boolean(result.changed);

        if (changed) {
            // Persist (large keys go to IndexedDB, small keys remain in localStorage for now)
            void setStateKey(key, list);
            const eventName = LIST_EVENTS[key];
            if (eventName) {
                this.emit(eventName, [...list]);
            }
        }

        return {
            changed,
            value: result.value,
            list
        };
    }

    _replaceList(key, newList) {
        if (!Array.isArray(newList)) {
            console.warn(`StateAdapter: attempted to replace list with non-array for key "${key}".`);
            return false;
        }

        const previous = this.state[key];
        this.state[key] = newList;
        void setStateKey(key, newList);

        const eventName = LIST_EVENTS[key];
        if (eventName) {
            this.emit(eventName, [...newList]);
        }

        return true;
    }

    on(event, handler) {
        if (!this.listeners.has(event)) {
            this.listeners.set(event, new Set());
        }
        this.listeners.get(event).add(handler);
        return () => this.off(event, handler);
    }

    off(event, handler) {
        const handlers = this.listeners.get(event);
        if (handlers) {
            handlers.delete(handler);
            if (handlers.size === 0) {
                this.listeners.delete(event);
            }
        }
    }

    emit(event, payload) {
        const handlers = this.listeners.get(event);
        if (!handlers) return;
        handlers.forEach(handler => handler(payload));
    }

    getSelectedGenres() {
        const genres = this.state[STORAGE_KEYS.SELECTED_GENRES];
        return Array.isArray(genres) ? [...genres] : [];
    }

    setSelectedGenres(genres) {
        const sanitized = sanitizeGenreList(genres);

        this.state[STORAGE_KEYS.SELECTED_GENRES] = sanitized;
        void setStateKey(STORAGE_KEYS.SELECTED_GENRES, sanitized);

        // Always emit event to ensure UI updates
        this.emit(EVENTS.SELECTED_GENRES_CHANGED, this.getSelectedGenres());
        return this.getSelectedGenres();
    }

    clearSelectedGenres() {
        return this.setSelectedGenres([]);
    }

    getGenreDiceSelection() {
        return this.state[STORAGE_KEYS.GENRE_DICE_SELECTION] || 'd6';
    }

    setGenreDiceSelection(diceType) {
        const validDice = ['d4', 'd6', 'd8', 'd10', 'd12', 'd20'];
        const sanitized = validDice.includes(diceType) ? diceType : 'd6';
        
        this.state[STORAGE_KEYS.GENRE_DICE_SELECTION] = sanitized;
        void setStateKey(STORAGE_KEYS.GENRE_DICE_SELECTION, sanitized);
        
        return sanitized;
    }

    syncSelectedGenresFromStorage() {
        const stored = safeGetJSON(STORAGE_KEYS.SELECTED_GENRES, []);
        const sanitized = sanitizeGenreList(stored);
        this.state[STORAGE_KEYS.SELECTED_GENRES] = sanitized;
        return this.getSelectedGenres();
    }

    // Quest helpers
    getActiveAssignments() {
        return this.state[STORAGE_KEYS.ACTIVE_ASSIGNMENTS];
    }

    getCompletedQuests() {
        return this.state[STORAGE_KEYS.COMPLETED_QUESTS];
    }

    getDiscardedQuests() {
        return this.state[STORAGE_KEYS.DISCARDED_QUESTS];
    }

    /**
     * Update fields on an active quest by ID.
     * @param {string} questId
     * @param {Object} updates — fields to merge into the quest object
     * @returns {boolean} true if quest was found and updated
     */
    updateActiveQuest(questId, updates) {
        const quests = this.state[STORAGE_KEYS.ACTIVE_ASSIGNMENTS];
        const quest = Array.isArray(quests) ? quests.find(q => q.id === questId) : null;
        if (!quest) return false;
        Object.assign(quest, updates);
        const eventName = LIST_EVENTS[STORAGE_KEYS.ACTIVE_ASSIGNMENTS];
        void setStateKey(STORAGE_KEYS.ACTIVE_ASSIGNMENTS, quests);
        if (eventName) {
            this.emit(eventName, [...quests]);
        }
        return true;
    }

    addActiveQuests(quests, options = {}) {
        const { skipQuestDraftedEffects = false } = options;
        const questList = Array.isArray(quests) ? quests : [quests];
        if (questList.length === 0) {
            return [];
        }

        // Ensure every quest has a stable ID (deck controllers may omit it)
        for (const quest of questList) {
            if (quest && typeof quest === 'object' && !quest.id) {
                quest.id = this._generateId();
            }
        }

        const { value, changed } = this._mutateList(STORAGE_KEYS.ACTIVE_ASSIGNMENTS, list => {
            questList.forEach(quest => list.push(quest));
            return { changed: true, value: questList };
        });

        // Ensure characterState is synced (should already be since this.state is characterState reference)
        // But double-check to be safe
        if (changed && this.state[STORAGE_KEYS.ACTIVE_ASSIGNMENTS]) {
            console.log(`addActiveQuests: Added ${questList.length} quests. Total active quests: ${this.state[STORAGE_KEYS.ACTIVE_ASSIGNMENTS].length}`);
        } else if (!changed) {
            console.warn('addActiveQuests: No changes made. List:', this.state[STORAGE_KEYS.ACTIVE_ASSIGNMENTS]);
        }

        if (!skipQuestDraftedEffects && changed && questList.length) {
            this.applyQuestDraftedEffects(questList);
        }

        return value || [];
    }

    addCompletedQuests(quests) {
        const questList = Array.isArray(quests) ? quests : [quests];
        const { value } = this._mutateList(STORAGE_KEYS.COMPLETED_QUESTS, list => {
            if (questList.length === 0) {
                return { changed: false };
            }
            const normalizeSignaturePart = (value) => (value == null ? '' : String(value));
            const getQuestSignature = (quest) => {
                if (!quest || typeof quest !== 'object') return '';
                const type = normalizeSignaturePart(quest.type);
                const prompt = normalizeSignaturePart(quest.prompt);
                const bookId = normalizeSignaturePart(quest.bookId);
                const book = normalizeSignaturePart(quest.book);
                const month = normalizeSignaturePart(quest.month);
                const year = normalizeSignaturePart(quest.year);
                const dateCompleted = normalizeSignaturePart(quest.dateCompleted);
                const restorationProjectId = normalizeSignaturePart(quest.restorationData?.projectId);
                return `sig:${type}|${prompt}|${bookId}|${book}|${month}|${year}|${dateCompleted}|${restorationProjectId}`;
            };
            const getQuestDedupKey = (quest) => {
                if (!quest || typeof quest !== 'object') return null;
                const questId = normalizeSignaturePart(quest.id).trim();
                const signature = getQuestSignature(quest);
                return questId ? `id:${questId}|${signature}` : signature;
            };

            const existingIds = new Set(
                list
                    .map(getQuestDedupKey)
                    .filter(Boolean)
            );
            const added = [];

            questList.forEach(quest => {
                if (!quest || typeof quest !== 'object') return;
                const dedupKey = getQuestDedupKey(quest);
                if (dedupKey && existingIds.has(dedupKey)) return;
                list.push(quest);
                added.push(quest);
                if (dedupKey) existingIds.add(dedupKey);
            });

            if (added.length === 0) {
                return { changed: false };
            }
            return { changed: true, value: added };
        });
        return value || [];
    }

    addDiscardedQuests(quests) {
        const questList = Array.isArray(quests) ? quests : [quests];
        const { value } = this._mutateList(STORAGE_KEYS.DISCARDED_QUESTS, list => {
            if (questList.length === 0) {
                return { changed: false };
            }
            questList.forEach(quest => list.push(quest));
            return { changed: true, value: questList };
        });
        return value || [];
    }

    removeQuest(listKey, index) {
        const { value } = this._mutateList(listKey, list => {
            if (index < 0 || index >= list.length) {
                return { changed: false };
            }
            const [removed] = list.splice(index, 1);
            return { changed: true, value: removed };
        });
        return value || null;
    }

    updateQuest(listKey, index, updates) {
        const { value } = this._mutateList(listKey, list => {
            const quest = list[index];
            if (!quest) {
                return { changed: false };
            }

            if (typeof updates === 'function') {
                const result = updates(quest);
                if (result && result !== quest) {
                    list[index] = result;
                }
            } else if (updates && typeof updates === 'object') {
                Object.assign(quest, updates);
            }

            return { changed: true, value: list[index] };
        });
        return value || null;
    }

    moveQuest(fromKey, index, toKey, transform) {
        const quest = this.removeQuest(fromKey, index);
        if (!quest) {
            return null;
        }
        const nextQuest = typeof transform === 'function' ? transform(quest) : quest;
        if (nextQuest) {
            this._mutateList(toKey, list => {
                list.push(nextQuest);
                return { changed: true, value: nextQuest };
            });
        }
        return nextQuest || null;
    }

    // Inventory helpers
    getInventoryItems() {
        return this.state[STORAGE_KEYS.INVENTORY_ITEMS];
    }

    getEquippedItems() {
        return this.state[STORAGE_KEYS.EQUIPPED_ITEMS];
    }

    addInventoryItem(item) {
        const { value } = this._mutateList(STORAGE_KEYS.INVENTORY_ITEMS, list => {
            if (!item) return { changed: false };
            list.push(item);
            return { changed: true, value: item };
        });
        return value || null;
    }

    removeInventoryItem(index) {
        const { value } = this._mutateList(STORAGE_KEYS.INVENTORY_ITEMS, list => {
            if (index < 0 || index >= list.length) {
                return { changed: false };
            }
            const [removed] = list.splice(index, 1);
            return { changed: true, value: removed };
        });
        return value || null;
    }

    addEquippedItem(item) {
        const { value } = this._mutateList(STORAGE_KEYS.EQUIPPED_ITEMS, list => {
            if (!item) return { changed: false };
            list.push(item);
            return { changed: true, value: item };
        });
        return value || null;
    }

    removeEquippedItem(index) {
        const { value } = this._mutateList(STORAGE_KEYS.EQUIPPED_ITEMS, list => {
            if (index < 0 || index >= list.length) {
                return { changed: false };
            }
            const [removed] = list.splice(index, 1);
            return { changed: true, value: removed };
        });
        return value || null;
    }

    /**
     * Move item from inventory to equipped
     * Enforces invariants: automatically removes item from passive slots
     * @param {number} index - Index of item in inventory
     * @returns {Object|null} The moved item, or null if failed
     */
    moveInventoryItemToEquipped(index) {
        const item = this.removeInventoryItem(index);
        if (!item) return null;
        
        // Enforce invariant: item cannot be equipped AND in passive slot
        // Automatically remove from passive slots
        this._removeItemFromPassiveSlots(item.name);
        
        this.addEquippedItem(item);
        return item;
    }

    moveEquippedItemToInventory(index) {
        const item = this.removeEquippedItem(index);
        if (!item) return null;
        this.addInventoryItem(item);
        return item;
    }

    /**
     * Whether a pipeline effect may be used for this calendar month/year (one use per key per calendar period).
     * @param {string} cooldownKey - e.g. "school:Abjuration"
     * @param {string} [_cadence] - reserved for future cadence types (e.g. bi-monthly passive items)
     */
    isEffectCooldownAvailable(cooldownKey, _cadence = 'monthly', { month, year } = {}) {
        if (!cooldownKey || typeof cooldownKey !== 'string') return false;
        const cadence = _cadence === 'per_use' ? 'per-use' : _cadence;

        const prev = this.state[STORAGE_KEYS.EFFECT_COOLDOWNS];
        const entry =
            prev && typeof prev === 'object' && !Array.isArray(prev) ? prev[cooldownKey] : null;

        if (cadence === 'per-use') {
            if (!entry || typeof entry !== 'object') {
                return true;
            }
            return entry.used !== true;
        }

        const m = typeof month === 'string' ? month.trim() : '';
        const y = typeof year === 'string' ? year.trim() : '';
        if (!m || !y) return false;
        if (!entry || typeof entry !== 'object') {
            return true;
        }
        return entry.month !== m || entry.year !== y;
    }

    /** Record that an effect consumed its use for this calendar month/year. */
    consumeEffectCooldown(cooldownKey, _cadence = 'monthly', { month, year } = {}) {
        if (!cooldownKey || typeof cooldownKey !== 'string') return false;
        const cadence = _cadence === 'per_use' ? 'per-use' : _cadence;

        const key = STORAGE_KEYS.EFFECT_COOLDOWNS;
        const prev = this.state[key] && typeof this.state[key] === 'object' && !Array.isArray(this.state[key])
            ? this.state[key]
            : {};
        let nextEntry;
        if (cadence === 'per-use') {
            nextEntry = { used: true };
        } else {
            const m = typeof month === 'string' ? month.trim() : '';
            const y = typeof year === 'string' ? year.trim() : '';
            if (!m || !y) return false;
            nextEntry = { month: m, year: y };
        }
        const next = { ...prev, [cooldownKey]: nextEntry };
        this.state[key] = next;
        void setStateKey(key, next);
        return true;
    }

    /**
     * Phase 5 compatibility wrapper for activated abilities.
     * @param {string} effectId
     * @param {string} month
     * @param {string} year
     * @returns {boolean}
     */
    isCooldownAvailable(effectId, month, year) {
        return this.isEffectCooldownAvailable(effectId, 'monthly', { month, year });
    }

    /**
     * Phase 5 compatibility wrapper for activated abilities.
     * @param {string} effectId
     * @param {string} month
     * @param {string} year
     * @returns {boolean}
     */
    consumeCooldown(effectId, month, year) {
        return this.consumeEffectCooldown(effectId, 'monthly', { month, year });
    }

    /**
     * Reset monthly activated ability cooldown usage at End of Month.
     * @returns {boolean}
     */
    resetMonthlyCooldowns() {
        this.state[STORAGE_KEYS.ABILITY_COOLDOWNS] = {};
        void setStateKey(STORAGE_KEYS.ABILITY_COOLDOWNS, {});
        return true;
    }

    // Quest tab – monthly draw / dice helpers
    getQuestDrawHelperState() {
        const raw = this.state[STORAGE_KEYS.QUEST_DRAW_HELPER_STATE];
        return raw && typeof raw === 'object' && !Array.isArray(raw) ? { ...raw } : {};
    }

    getQuestDrawHelperSettings() {
        const raw = this.state[STORAGE_KEYS.QUEST_DRAW_HELPER_SETTINGS];
        if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
            return { autoApplyOnDraw: false };
        }
        return { autoApplyOnDraw: raw.autoApplyOnDraw === true };
    }

    setQuestDrawHelperSettings(updates = {}) {
        const prev = this.getQuestDrawHelperSettings();
        const next = { ...prev, ...updates };
        const payload = { autoApplyOnDraw: !!next.autoApplyOnDraw };
        this.state[STORAGE_KEYS.QUEST_DRAW_HELPER_SETTINGS] = payload;
        void setStateKey(STORAGE_KEYS.QUEST_DRAW_HELPER_SETTINGS, payload);
        return this.getQuestDrawHelperSettings();
    }

    /**
     * @param {Object} catalogs - { allItems, temporaryBuffs, masteryAbilities, schoolBenefits, seriesExpedition, permanentBonuses }
     * @param {{ school?: string, level?: number }} [options]
     */
    getQuestDrawHelpers(catalogs, options = {}) {
        return buildQuestDrawHelperList(this.state, catalogs, options);
    }

    markQuestDrawHelperUsed(sourceId, options = {}) {
        if (!sourceId || typeof sourceId !== 'string') return false;
        if (options.cadence === 'always') return false;
        const key = STORAGE_KEYS.QUEST_DRAW_HELPER_STATE;
        const prev = this.state[key] && typeof this.state[key] === 'object' && !Array.isArray(this.state[key])
            ? this.state[key]
            : {};
        const entry = prev[sourceId] && typeof prev[sourceId] === 'object' ? { ...prev[sourceId] } : {};
        if (entry.used) return false;
        const nextEntry = { ...entry, used: true };
        if (options.cadence === 'every-2-months') {
            nextEntry.cooldownCyclesRemaining = 2;
        }
        const next = { ...prev, [sourceId]: nextEntry };
        this.state[key] = next;
        void setStateKey(key, next);
        return true;
    }

    refreshQuestDrawHelpersAtEndOfMonth(helpers) {
        if (!Array.isArray(helpers) || helpers.length === 0) return false;
        const key = STORAGE_KEYS.QUEST_DRAW_HELPER_STATE;
        const prev = this.state[key] && typeof this.state[key] === 'object' && !Array.isArray(this.state[key])
            ? this.state[key]
            : {};
        let changed = false;
        const next = { ...prev };
        for (const { sourceId, cadence } of helpers) {
            if (cadence === 'one-time' || cadence === 'always') continue;
            const entry = next[sourceId] && typeof next[sourceId] === 'object' ? { ...next[sourceId] } : {};
            if (cadence === 'monthly') {
                if (entry.used) {
                    next[sourceId] = { ...entry, used: false };
                    changed = true;
                }
            } else if (cadence === 'every-2-months') {
                const cooldown = entry.cooldownCyclesRemaining != null ? entry.cooldownCyclesRemaining : 0;
                if (cooldown > 0) {
                    const newCooldown = cooldown - 1;
                    next[sourceId] = { ...entry, cooldownCyclesRemaining: newCooldown, used: newCooldown === 0 ? false : entry.used };
                    changed = true;
                }
            }
        }
        if (!changed) return false;
        this.state[key] = next;
        void setStateKey(key, next);
        return true;
    }

    removeUsedOneTimeQuestDrawTempBuffsAtEOM(helpers) {
        if (!Array.isArray(helpers)) return false;
        const helperState = this.getQuestDrawHelperState();
        const toRemove = [];
        for (const h of helpers) {
            if (h.sourceType !== 'tempBuff' || h.cadence !== 'one-time') continue;
            const entry = helperState[h.sourceId];
            if (!entry || !entry.used) continue;
            const match = h.sourceId.match(/^tempBuff:(.+)$/);
            if (!match) continue;
            const identifier = match[1];
            const underscoreIdx = identifier.indexOf('_');
            const indexStr = underscoreIdx >= 0 ? identifier.slice(0, underscoreIdx) : identifier;
            const index = parseInt(indexStr, 10);
            if (isNaN(index) || index < 0) continue;
            toRemove.push({ sourceId: h.sourceId, index });
        }
        if (toRemove.length === 0) return false;
        toRemove.sort((a, b) => b.index - a.index);
        const removedSourceIds = new Set(toRemove.map(r => r.sourceId));
        for (const { index } of toRemove) {
            this.removeTemporaryBuff(index);
        }
        const qKey = STORAGE_KEYS.QUEST_DRAW_HELPER_STATE;
        const prevQ = this.state[qKey] && typeof this.state[qKey] === 'object' && !Array.isArray(this.state[qKey])
            ? this.state[qKey]
            : {};
        let nextQ = { ...prevQ };
        for (const id of removedSourceIds) {
            delete nextQ[id];
        }
        nextQ = this._remapTempBuffQuestDrawHelperKeys(nextQ);
        this.state[qKey] = nextQ;
        void setStateKey(qKey, nextQ);
        return true;
    }

    _remapTempBuffQuestDrawHelperKeys(questState) {
        const tempBuffs = this.state[STORAGE_KEYS.TEMPORARY_BUFFS];
        if (!Array.isArray(tempBuffs) || tempBuffs.length === 0) {
            return questState;
        }
        const result = { ...questState };
        const tempBuffPrefix = 'tempBuff:';
        const oldEntries = [];
        for (const key of Object.keys(result)) {
            if (!key.startsWith(tempBuffPrefix)) continue;
            const identifier = key.slice(tempBuffPrefix.length);
            const firstUnderscore = identifier.indexOf('_');
            if (firstUnderscore < 0) continue;
            const oldIndexStr = identifier.slice(0, firstUnderscore);
            const name = identifier.slice(firstUnderscore + 1);
            const oldIndex = parseInt(oldIndexStr, 10);
            if (isNaN(oldIndex) || oldIndex < 0) continue;
            oldEntries.push({ key, oldIndex, name, entry: result[key] });
        }
        if (oldEntries.length === 0) return result;
        oldEntries.sort((a, b) => a.oldIndex - b.oldIndex);
        const newEntries = tempBuffs.map((b, i) => ({ newIndex: i, name: b?.name ?? b?.id ?? `Buff ${i}` }));
        const usedNewIndices = new Set();
        for (const { key, name, entry } of oldEntries) {
            const idx = newEntries.findIndex((n, i) => !usedNewIndices.has(i) && n.name === name);
            if (idx < 0) continue;
            usedNewIndices.add(idx);
            const { newIndex } = newEntries[idx];
            const newKey = buildSourceId('tempBuff', null, `${newIndex}|${name}`);
            delete result[key];
            result[newKey] = entry;
        }
        return result;
    }

    undoQuestDrawHelperUsed(sourceId) {
        if (!sourceId || typeof sourceId !== 'string') return false;
        const key = STORAGE_KEYS.QUEST_DRAW_HELPER_STATE;
        const prev = this.state[key] && typeof this.state[key] === 'object' && !Array.isArray(this.state[key])
            ? this.state[key]
            : {};
        const entry = prev[sourceId] && typeof prev[sourceId] === 'object' ? { ...prev[sourceId] } : {};
        if (!entry.used) return false;
        const nextEntry = { ...entry, used: false };
        const next = { ...prev, [sourceId]: nextEntry };
        this.state[key] = next;
        void setStateKey(key, next);
        return true;
    }

    // Temporary buffs helpers
    getTemporaryBuffs() {
        return this.state[STORAGE_KEYS.TEMPORARY_BUFFS];
    }

    /**
     * End-of-month lifecycle for duration-based temporary buffs.
     * - until-end-month: expires immediately at EOM
     * - two-months: decrement monthsRemaining; remove when it reaches 0
     * one-time buffs are intentionally untouched here.
     * @returns {boolean} whether any buff was updated or removed
     */
    expireTemporaryBuffsAtEndOfMonth() {
        const result = this._mutateList(STORAGE_KEYS.TEMPORARY_BUFFS, (list) => {
            if (!Array.isArray(list) || list.length === 0) {
                return { changed: false };
            }

            let changed = false;
            const next = [];

            for (const buff of list) {
                if (!buff || typeof buff !== 'object') {
                    next.push(buff);
                    continue;
                }

                if (buff.duration === 'until-end-month') {
                    changed = true;
                    continue;
                }

                if (buff.duration === 'two-months') {
                    const current =
                        typeof buff.monthsRemaining === 'number' && Number.isFinite(buff.monthsRemaining)
                            ? Math.max(0, Math.floor(buff.monthsRemaining))
                            : 2;
                    const remaining = current - 1;
                    if (remaining <= 0) {
                        changed = true;
                        continue;
                    }
                    if (remaining !== current) {
                        changed = true;
                        next.push({ ...buff, monthsRemaining: remaining });
                        continue;
                    }
                }

                next.push(buff);
            }

            if (!changed) {
                return { changed: false };
            }

            list.splice(0, list.length, ...next);
            return { changed: true };
        });
        return result.changed;
    }

    addTemporaryBuff(buff) {
        const { value } = this._mutateList(STORAGE_KEYS.TEMPORARY_BUFFS, list => {
            if (!buff) return { changed: false };
            list.push(buff);
            return { changed: true, value: buff };
        });
        return value || null;
    }

    removeTemporaryBuff(index) {
        const { value } = this._mutateList(STORAGE_KEYS.TEMPORARY_BUFFS, list => {
            if (index < 0 || index >= list.length) {
                return { changed: false };
            }
            const [removed] = list.splice(index, 1);
            return { changed: true, value: removed };
        });
        return value || null;
    }

    /**
     * Spend one use of each use-count temporary buff (Enchanted Focus, Story Surge, ...) whose
     * bonus card paid on a completed quest. A buff whose uses reach 0 is marked used
     * (`status: 'used'`, `usesLeft: 0`), so RewardCalculator stops paying it on later quests.
     * Call once per completed quest, after its rewards are calculated.
     * @param {string[]} buffCards - The quest's bonus cards (e.g. "[Buff] Enchanted Focus")
     * @param {(name: string) => number} getCatalogUseCount - Catalog `useCount` for a buff name (0 if none)
     * @returns {{ changed: boolean, spent: string[] }} Names of buffs whose last use was spent
     */
    consumeUseCountBuffsForQuest(buffCards, getCatalogUseCount) {
        let spent = [];
        const result = this._mutateList(STORAGE_KEYS.TEMPORARY_BUFFS, (list) => {
            const outcome = spendUseCountBuffs(list, buffCards, getCatalogUseCount);
            if (!outcome.changed) return { changed: false };
            list.splice(0, list.length, ...outcome.buffs);
            spent = outcome.spent;
            return { changed: true };
        });
        return { changed: result.changed, spent };
    }

    updateTemporaryBuff(index, updates) {
        const { value } = this._mutateList(STORAGE_KEYS.TEMPORARY_BUFFS, list => {
            const buff = list[index];
            if (!buff) {
                return { changed: false };
            }

            if (typeof updates === 'function') {
                const result = updates(buff);
                if (result && result !== buff) {
                    list[index] = result;
                }
            } else if (updates && typeof updates === 'object') {
                Object.assign(buff, updates);
            }

            return { changed: true, value: list[index] };
        });
        return value || null;
    }

    // Learned abilities helpers
    getLearnedAbilities() {
        return this.state[STORAGE_KEYS.LEARNED_ABILITIES];
    }

    addLearnedAbility(abilityName) {
        const { value } = this._mutateList(STORAGE_KEYS.LEARNED_ABILITIES, list => {
            if (!abilityName || typeof abilityName !== 'string') {
                return { changed: false };
            }
            // Don't add duplicates
            if (list.includes(abilityName)) {
                return { changed: false };
            }
            list.push(abilityName);
            return { changed: true, value: abilityName };
        });
        return value || null;
    }

    removeLearnedAbility(index) {
        const { value } = this._mutateList(STORAGE_KEYS.LEARNED_ABILITIES, list => {
            if (index < 0 || index >= list.length) {
                return { changed: false };
            }
            const [removed] = list.splice(index, 1);
            return { changed: true, value: removed };
        });
        return value || null;
    }

    // Atmospheric buffs helpers (object-based, not array)
    getAtmosphericBuffs() {
        const buffs = this.state[STORAGE_KEYS.ATMOSPHERIC_BUFFS];
        return buffs && typeof buffs === 'object' ? { ...buffs } : {};
    }

    getAtmosphericBuff(buffName) {
        const buffs = this.getAtmosphericBuffs();
        return buffs[buffName] || null;
    }

    updateAtmosphericBuff(buffName, updates) {
        const buffs = this.state[STORAGE_KEYS.ATMOSPHERIC_BUFFS];
        if (!buffs || typeof buffs !== 'object') {
            this.state[STORAGE_KEYS.ATMOSPHERIC_BUFFS] = {};
        }

        const currentBuffs = this.state[STORAGE_KEYS.ATMOSPHERIC_BUFFS];
        if (!currentBuffs[buffName]) {
            currentBuffs[buffName] = { daysUsed: 0, isActive: false };
        }

        if (typeof updates === 'function') {
            currentBuffs[buffName] = updates(currentBuffs[buffName]) || currentBuffs[buffName];
        } else if (updates && typeof updates === 'object') {
            Object.assign(currentBuffs[buffName], updates);
        }

        void setStateKey(STORAGE_KEYS.ATMOSPHERIC_BUFFS, currentBuffs);
        this.emit(EVENTS.ATMOSPHERIC_BUFFS_CHANGED, this.getAtmosphericBuffs());

        return currentBuffs[buffName];
    }

    setAtmosphericBuffActive(buffName, isActive) {
        return this.updateAtmosphericBuff(buffName, { isActive });
    }

    setAtmosphericBuffDaysUsed(buffName, daysUsed) {
        return this.updateAtmosphericBuff(buffName, { daysUsed });
    }

    // Buff month counter helper
    getBuffMonthCounter() {
        return this.state[STORAGE_KEYS.BUFF_MONTH_COUNTER] || 0;
    }

    incrementBuffMonthCounter() {
        const current = this.getBuffMonthCounter();
        const newValue = current + 1;
        this.state[STORAGE_KEYS.BUFF_MONTH_COUNTER] = newValue;
        void setStateKey(STORAGE_KEYS.BUFF_MONTH_COUNTER, newValue);
        return newValue;
    }

    // ==========================================
    // Library Restoration Expansion Methods
    // ==========================================

    // Dusty Blueprints (currency)
    getDustyBlueprints() {
        return this.state[STORAGE_KEYS.DUSTY_BLUEPRINTS] || 0;
    }

    addDustyBlueprints(amount) {
        if (typeof amount !== 'number' || amount <= 0) return this.getDustyBlueprints();
        const current = this.getDustyBlueprints();
        const newValue = current + amount;
        this.state[STORAGE_KEYS.DUSTY_BLUEPRINTS] = newValue;
        void setStateKey(STORAGE_KEYS.DUSTY_BLUEPRINTS, newValue);
        this.emit(EVENTS.DUSTY_BLUEPRINTS_CHANGED, newValue);
        return newValue;
    }

    spendDustyBlueprints(amount) {
        if (typeof amount !== 'number' || amount <= 0) return false;
        const current = this.getDustyBlueprints();
        if (current < amount) return false;
        const newValue = current - amount;
        this.state[STORAGE_KEYS.DUSTY_BLUEPRINTS] = newValue;
        void setStateKey(STORAGE_KEYS.DUSTY_BLUEPRINTS, newValue);
        this.emit(EVENTS.DUSTY_BLUEPRINTS_CHANGED, newValue);
        return true;
    }

    // ==========================================
    // Fund (real dollars, stored as integer cents)
    // ==========================================

    getFundBalanceCents() {
        const raw = this.state[STORAGE_KEYS.FUND_BALANCE_CENTS];
        return Number.isFinite(raw) ? raw : 0;
    }

    /**
     * Set the balance directly (manual corrections). Rounds to whole cents.
     * Non-finite input is ignored.
     * @param {number} cents
     * @returns {number} the balance in cents
     */
    setFundBalanceCents(cents) {
        if (typeof cents !== 'number' || !Number.isFinite(cents)) return this.getFundBalanceCents();
        this._persistFundBalance(Math.round(cents));
        return this.getFundBalanceCents();
    }

    /**
     * Credit whole-dollar rewards to the Fund. Ignores values <= 0 and non-numbers.
     * @param {number} dollars
     * @returns {number} the new balance in cents
     */
    addFunds(dollars) {
        if (typeof dollars !== 'number' || !Number.isFinite(dollars) || dollars <= 0) {
            return this.getFundBalanceCents();
        }
        this._persistFundBalance(this.getFundBalanceCents() + Math.round(dollars * 100));
        return this.getFundBalanceCents();
    }

    /**
     * Record a deduction (a real purchase). The balance may go negative; the UI confirms first.
     * @param {{ amountCents: number, note?: string, date?: string }} params
     * @returns {{ id: string, date: string, amountCents: number, note: string } | null}
     *   null when amountCents is not a positive integer
     */
    deductFunds({ amountCents, note = '', date } = {}) {
        if (!Number.isInteger(amountCents) || amountCents <= 0) return null;
        const entry = {
            id: this._generateId(),
            date: isIsoDate(date) ? date : todayIsoDate(),
            amountCents,
            note: typeof note === 'string' ? note.trim() : ''
        };
        const ledger = [...this.getFundLedger(), entry];
        this.state[STORAGE_KEYS.FUND_LEDGER] = ledger;
        void setStateKey(STORAGE_KEYS.FUND_LEDGER, ledger);
        this._persistFundBalance(this.getFundBalanceCents() - amountCents);
        return { ...entry };
    }

    /**
     * Remove a deduction and refund its amount to the balance.
     * @param {string} id
     * @returns {boolean} true if an entry was removed
     */
    deleteFundDeduction(id) {
        const ledger = this.getFundLedger();
        const index = ledger.findIndex(e => e.id === id);
        if (index === -1) return false;
        const [removed] = ledger.splice(index, 1);
        this.state[STORAGE_KEYS.FUND_LEDGER] = ledger;
        void setStateKey(STORAGE_KEYS.FUND_LEDGER, ledger);
        this._persistFundBalance(this.getFundBalanceCents() + removed.amountCents);
        return true;
    }

    /** @returns {{ id: string, date: string, amountCents: number, note: string }[]} */
    getFundLedger() {
        const raw = this.state[STORAGE_KEYS.FUND_LEDGER];
        return Array.isArray(raw) ? raw.map(e => ({ ...e })) : [];
    }

    _persistFundBalance(cents) {
        this.state[STORAGE_KEYS.FUND_BALANCE_CENTS] = cents;
        void setStateKey(STORAGE_KEYS.FUND_BALANCE_CENTS, cents);
        this.emit(EVENTS.FUND_CHANGED, { balanceCents: cents });
    }

    // Completed Restoration Projects
    getCompletedRestorationProjects() {
        return this.state[STORAGE_KEYS.COMPLETED_RESTORATION_PROJECTS] || [];
    }

    completeRestorationProject(projectId) {
        const { value } = this._mutateList(STORAGE_KEYS.COMPLETED_RESTORATION_PROJECTS, list => {
            if (!projectId || typeof projectId !== 'string') {
                return { changed: false };
            }
            // Don't add duplicates
            if (list.includes(projectId)) {
                return { changed: false };
            }
            list.push(projectId);
            return { changed: true, value: projectId };
        });
        return value || null;
    }

    isRestorationProjectCompleted(projectId) {
        const completed = this.getCompletedRestorationProjects();
        return completed.includes(projectId);
    }

    // Completed Wings
    getCompletedWings() {
        return this.state[STORAGE_KEYS.COMPLETED_WINGS] || [];
    }

    completeWing(wingId) {
        const { value } = this._mutateList(STORAGE_KEYS.COMPLETED_WINGS, list => {
            if (!wingId || typeof wingId !== 'string') {
                return { changed: false };
            }
            // Don't add duplicates
            if (list.includes(wingId)) {
                return { changed: false };
            }
            list.push(wingId);
            return { changed: true, value: wingId };
        });
        return value || null;
    }

    isWingCompleted(wingId) {
        const completed = this.getCompletedWings();
        return completed.includes(wingId);
    }

    // Passive Item Slots
    getPassiveItemSlots() {
        return this.state[STORAGE_KEYS.PASSIVE_ITEM_SLOTS] || [];
    }

    addPassiveItemSlot(slotId, unlockedFrom = null) {
        const { value } = this._mutateList(STORAGE_KEYS.PASSIVE_ITEM_SLOTS, list => {
            if (!slotId || typeof slotId !== 'string') {
                return { changed: false };
            }
            // Don't add duplicate slots with same ID
            if (list.some(slot => slot.slotId === slotId)) {
                return { changed: false };
            }
            const newSlot = {
                slotId,
                itemName: null,
                unlockedFrom,
                unlockedAt: new Date().toISOString()
            };
            list.push(newSlot);
            return { changed: true, value: newSlot };
        });
        return value || null;
    }

    /**
     * Set item in passive item slot
     * Enforces invariants: automatically unequips item if it's equipped
     * @param {string} slotId - Slot ID
     * @param {string|null} itemName - Item name to assign (or null to clear)
     * @returns {Object|null} Updated slot or null if failed
     */
    setPassiveSlotItem(slotId, itemName) {
        // Enforce invariant: item cannot be equipped AND in passive slot
        // Automatically unequip if item is being assigned to passive slot
        if (itemName) {
            this._unequipItemByName(itemName);
        }
        
        const { value } = this._mutateList(STORAGE_KEYS.PASSIVE_ITEM_SLOTS, list => {
            const slotIndex = list.findIndex(slot => slot.slotId === slotId);
            if (slotIndex === -1) {
                return { changed: false };
            }
            list[slotIndex].itemName = itemName || null;
            return { changed: true, value: list[slotIndex] };
        });
        return value || null;
    }

    // Passive Familiar Slots
    getPassiveFamiliarSlots() {
        return this.state[STORAGE_KEYS.PASSIVE_FAMILIAR_SLOTS] || [];
    }

    addPassiveFamiliarSlot(slotId, unlockedFrom = null) {
        const { value } = this._mutateList(STORAGE_KEYS.PASSIVE_FAMILIAR_SLOTS, list => {
            if (!slotId || typeof slotId !== 'string') {
                return { changed: false };
            }
            // Don't add duplicate slots with same ID
            if (list.some(slot => slot.slotId === slotId)) {
                return { changed: false };
            }
            const newSlot = {
                slotId,
                itemName: null,
                unlockedFrom,
                unlockedAt: new Date().toISOString()
            };
            list.push(newSlot);
            return { changed: true, value: newSlot };
        });
        return value || null;
    }

    /**
     * Set familiar in passive familiar slot
     * Enforces invariants: automatically unequips familiar if it's equipped
     * @param {string} slotId - Slot ID
     * @param {string|null} familiarName - Familiar name to assign (or null to clear)
     * @returns {Object|null} Updated slot or null if failed
     */
    setPassiveFamiliarSlotItem(slotId, familiarName) {
        // Enforce invariant: familiar cannot be equipped AND in passive slot
        // Automatically unequip if familiar is being assigned to passive slot
        if (familiarName) {
            this._unequipItemByName(familiarName);
        }
        
        const { value } = this._mutateList(STORAGE_KEYS.PASSIVE_FAMILIAR_SLOTS, list => {
            const slotIndex = list.findIndex(slot => slot.slotId === slotId);
            if (slotIndex === -1) {
                return { changed: false };
            }
            list[slotIndex].itemName = familiarName || null;
            return { changed: true, value: list[slotIndex] };
        });
        return value || null;
    }

    // Claimed dungeon room rewards (Phase 3.1)
    getClaimedRoomRewards() {
        return this.state[STORAGE_KEYS.CLAIMED_ROOM_REWARDS] || [];
    }

    addClaimedRoomReward(roomNumber) {
        const roomStr = String(roomNumber);
        const { changed } = this._mutateList(STORAGE_KEYS.CLAIMED_ROOM_REWARDS, list => {
            if (list.includes(roomStr)) return { changed: false };
            list.push(roomStr);
            return { changed: true };
        });
        return changed;
    }

    getDungeonCompletionDrawsRedeemed() {
        const n = this.state[STORAGE_KEYS.DUNGEON_COMPLETION_DRAWS_REDEEMED];
        return typeof n === 'number' && n >= 0 ? n : 0;
    }

    /** Number of dungeon completion draws available (claimed rooms not yet redeemed). */
    getDungeonCompletionDrawsAvailable() {
        const claimed = this.getClaimedRoomRewards().length;
        const redeemed = this.getDungeonCompletionDrawsRedeemed();
        return Math.max(0, claimed - redeemed);
    }

    /** Consume one dungeon completion draw. Returns true if a draw was available and consumed. */
    redeemDungeonCompletionDraw() {
        if (this.getDungeonCompletionDrawsAvailable() <= 0) return false;
        const next = this.getDungeonCompletionDrawsRedeemed() + 1;
        this.state[STORAGE_KEYS.DUNGEON_COMPLETION_DRAWS_REDEEMED] = next;
        void setStateKey(STORAGE_KEYS.DUNGEON_COMPLETION_DRAWS_REDEEMED, next);
        return true;
    }

    /** Refund one dungeon completion draw (e.g. when drawn reward was already owned). Returns true if a draw was refunded. */
    refundDungeonCompletionDraw() {
        const current = this.getDungeonCompletionDrawsRedeemed();
        if (current <= 0) return false;
        const next = current - 1;
        this.state[STORAGE_KEYS.DUNGEON_COMPLETION_DRAWS_REDEEMED] = next;
        void setStateKey(STORAGE_KEYS.DUNGEON_COMPLETION_DRAWS_REDEEMED, next);
        return true;
    }

    // ==========================================
    // Books (Schema v5 – Book-First Paradigm)
    // ==========================================

    _generateId() {
        if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
            return crypto.randomUUID();
        }
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
            const r = Math.random() * 16 | 0;
            const v = c === 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
        });
    }

    _getBooksRaw() {
        const books = this.state[STORAGE_KEYS.BOOKS];
        return books && typeof books === 'object' && !Array.isArray(books) ? books : {};
    }

    _persistBooks(books) {
        this.state[STORAGE_KEYS.BOOKS] = books;
        void setStateKey(STORAGE_KEYS.BOOKS, books);
        this.emit(EVENTS.BOOKS_CHANGED, { ...books });
    }

    addBook(bookData) {
        if (!bookData || typeof bookData !== 'object') return null;
        const books = { ...this._getBooksRaw() };
        const id = (typeof bookData.id === 'string' && bookData.id.trim()) ? bookData.id.trim() : this._generateId();
        const now = new Date().toISOString();
        const book = {
            id,
            title: typeof bookData.title === 'string' ? bookData.title : '',
            author: typeof bookData.author === 'string' ? bookData.author : '',
            cover: typeof bookData.cover === 'string' ? bookData.cover : (typeof bookData.coverUrl === 'string' ? bookData.coverUrl : null),
            pageCount: typeof bookData.pageCount === 'number' && !isNaN(bookData.pageCount) ? Math.max(0, Math.floor(bookData.pageCount)) : (typeof bookData.pageCountRaw === 'number' && !isNaN(bookData.pageCountRaw) ? Math.max(0, Math.floor(bookData.pageCountRaw)) : null),
            status: normalizeBookStatus(bookData.status),
            dateAdded: typeof bookData.dateAdded === 'string' ? bookData.dateAdded : now,
            dateCompleted: typeof bookData.dateCompleted === 'string' ? bookData.dateCompleted : null,
            links: bookData.links && typeof bookData.links === 'object'
                ? {
                    questIds: Array.isArray(bookData.links.questIds) ? bookData.links.questIds.filter(x => typeof x === 'string') : [],
                    curriculumPromptIds: Array.isArray(bookData.links.curriculumPromptIds) ? bookData.links.curriculumPromptIds.filter(x => typeof x === 'string') : []
                }
                : { questIds: [], curriculumPromptIds: [] },
            tags: Array.isArray(bookData.tags) ? bookData.tags.filter(x => typeof x === 'string') : [],
            type: bookData.type,
            libraryBookId: bookData.libraryBookId,
            libraryTagsBase: bookData.libraryTagsBase,
            shelfMatchDismissed: bookData.shelfMatchDismissed
        };
        // Type first (a stored type-derived tag implies its type), then drop type-derived tags
        applyBookTypeRules(book);
        book.tags = withoutTypeDerivedTags(book.tags);
        books[id] = book;
        this._persistBooks(books);
        return book;
    }

    updateBook(bookId, updates) {
        if (!bookId || typeof bookId !== 'string') return null;
        const books = { ...this._getBooksRaw() };
        const book = books[bookId];
        if (!book) return null;
        if (updates && typeof updates === 'object') {
            if (typeof updates.title === 'string') book.title = updates.title;
            if (typeof updates.author === 'string') book.author = updates.author;
            if (updates.cover !== undefined) book.cover = typeof updates.cover === 'string' ? updates.cover : null;
            if (typeof updates.pageCount === 'number' && !isNaN(updates.pageCount)) book.pageCount = Math.max(0, Math.floor(updates.pageCount));
            if (['reading', 'completed', 'other'].includes(updates.status)) book.status = normalizeBookStatus(updates.status);
            if (isBookType(updates.type)) book.type = updates.type;
            if (updates.libraryBookId !== undefined) book.libraryBookId = typeof updates.libraryBookId === 'string' ? updates.libraryBookId : null;
            if (updates.libraryTagsBase !== undefined) {
                book.libraryTagsBase = Array.isArray(updates.libraryTagsBase) ? updates.libraryTagsBase.filter(x => typeof x === 'string') : null;
            }
            if (updates.shelfMatchDismissed !== undefined) {
                book.shelfMatchDismissed = typeof updates.shelfMatchDismissed === 'string' ? updates.shelfMatchDismissed : null;
            }
            if (typeof updates.dateAdded === 'string') book.dateAdded = updates.dateAdded;
            if (updates.dateCompleted !== undefined) book.dateCompleted = typeof updates.dateCompleted === 'string' ? updates.dateCompleted : null;
            if (Array.isArray(updates.tags)) book.tags = withoutTypeDerivedTags(updates.tags.filter(x => typeof x === 'string'));
            if (updates.links && typeof updates.links === 'object') {
                if (!book.links || typeof book.links !== 'object') {
                    book.links = { questIds: [], curriculumPromptIds: [] };
                }
                if (Array.isArray(updates.links.questIds)) book.links.questIds = updates.links.questIds.filter(x => typeof x === 'string');
                if (Array.isArray(updates.links.curriculumPromptIds)) book.links.curriculumPromptIds = updates.links.curriculumPromptIds.filter(x => typeof x === 'string');
            }
        }
        applyBookTypeRules(book);
        books[bookId] = book;
        this._persistBooks(books);
        return book;
    }

    deleteBook(bookId) {
        if (!bookId || typeof bookId !== 'string') return false;
        const books = { ...this._getBooksRaw() };
        if (!(bookId in books)) return false;
        delete books[bookId];
        this._persistBooks(books);
        this._removeBookFromAllSeries(bookId);
        return true;
    }

    getBook(bookId) {
        if (!bookId || typeof bookId !== 'string') return null;
        const books = this._getBooksRaw();
        const book = books[bookId];
        if (!book) return null;
        const links = book.links && typeof book.links === 'object' ? book.links : { questIds: [], curriculumPromptIds: [] };
        return { ...book, links: { ...links } };
    }

    getBooks() {
        const books = this._getBooksRaw();
        return Object.keys(books).map(id => {
            const book = books[id];
            const links = book.links && typeof book.links === 'object' ? book.links : { questIds: [], curriculumPromptIds: [] };
            return { ...book, links: { ...links } };
        });
    }

    getBooksByStatus(status) {
        if (!['reading', 'completed'].includes(status)) return [];
        return this.getBooks().filter(b => b.status === status);
    }

    /**
     * Is the book linked to an active quest (through its links or the quest's bookId)?
     * Since schema v20 'reading' means every unfinished book, so this is what "in progress" means.
     * @param {Object|string} bookOrId - a book record or its id
     * @returns {boolean}
     */
    isBookOnActiveQuest(bookOrId) {
        const book = typeof bookOrId === 'string' ? this._getBooksRaw()[bookOrId] : bookOrId;
        if (!book || typeof book !== 'object' || !book.id) return false;
        const active = Array.isArray(this.state[STORAGE_KEYS.ACTIVE_ASSIGNMENTS]) ? this.state[STORAGE_KEYS.ACTIVE_ASSIGNMENTS] : [];
        if (active.length === 0) return false;
        const linkedIds = new Set(getLinkedQuestIds(book).map(id => String(id)));
        return active.some(q => q && (q.bookId === book.id || (q.id != null && linkedIds.has(String(q.id)))));
    }

    /**
     * Books of one type (schema v20).
     * @param {string} type - one of BOOK_TYPES
     * @returns {Object[]}
     */
    getBooksByType(type) {
        if (!isBookType(type)) return [];
        return this.getBooks().filter(b => b.type === type);
    }

    /**
     * The Unsorted-books review state (schema v20, localStorage-backed).
     * @returns {{ status: string, postponedAt: string|null, completedAt: string|null, removedBooks: Object }}
     */
    getBookTidy() {
        return validateBookTidy(this.state[STORAGE_KEYS.BOOK_TIDY]);
    }

    /**
     * Replace the bookTidy state. Written through the schema write gate (setSaveJSON); RAM and
     * listeners change only when the write succeeds.
     * @param {Object} next
     * @returns {Object|null} the validated bookTidy, or null when the write was refused or failed
     */
    setBookTidy(next) {
        const tidy = validateBookTidy(next);
        if (!setSaveJSON(STORAGE_KEYS.BOOK_TIDY, tidy)) return null;
        this.state[STORAGE_KEYS.BOOK_TIDY] = tidy;
        this.emit(EVENTS.BOOK_TIDY_CHANGED, tidy);
        return tidy;
    }

    /**
     * One book, one quest: may questId be linked to bookId? A second link needs a learned
     * MULTI_QUEST_ABILITIES ability; a third is always refused. Relinking is idempotent (ok).
     * Links on other library entries for the same book count too (getLinkedQuestIdsForBook).
     * Existing saves that already hold more links are not modified.
     * @param {string} bookId
     * @param {string} questId
     * @param {{ allowSecondLink?: boolean }} [options] - set by an activation that grants the second link
     * @returns {{ ok: boolean, reason?: 'already-linked' | 'max-links' }}
     */
    canLinkQuestToBook(bookId, questId, options = {}) {
        const book = this.getBook(bookId);
        const questIds = book ? this.getLinkedQuestIdsForBook(bookId, { keepId: questId }) : [];
        return evaluateQuestLink(book ? { links: { questIds } } : null, questId, this.getLearnedAbilities(), options);
    }

    /**
     * Live quest ids linked to bookId or to any other library entry for the same book (isSameBook:
     * the book added twice), so a duplicate entry cannot take a quest of its own.
     * @param {string} bookId
     * @param {{ keepId?: string|null }} [options] - see getLinkedQuestIds
     * @returns {string[]}
     */
    getLinkedQuestIdsForBook(bookId, { keepId = null } = {}) {
        return getLinkedQuestIds(this.getSameBookLinks(bookId), { liveQuestIds: this.getLiveQuestIds(), keepId });
    }

    /**
     * bookId's links merged with those of every other library entry for the same book (isSameBook),
     * shaped like a book ({ links: { questIds, grandfatheredQuestIds } }) for the questLinkRules
     * helpers. A single entry keeps its own link order. Links spread over several entries are
     * ordered by their quest's dateAdded (undated legacy quests first), so every entry of the book
     * gives the same order and the quest taken on later is the secondary one.
     * @param {string} bookId
     * @returns {{ links: { questIds: string[], grandfatheredQuestIds: string[] } }|null} null for an unknown book
     */
    getSameBookLinks(bookId) {
        const book = this.getBook(bookId);
        if (!book) return null;
        const copies = [book, ...this.getBooks().filter((other) => other.id !== book.id && isSameBook(book, other))]
            .sort((a, b) => String(a.id).localeCompare(String(b.id)));
        const questIds = [];
        const grandfatheredQuestIds = [];
        for (const copy of copies) {
            for (const id of getLinkedQuestIds(copy)) if (!questIds.includes(id)) questIds.push(id);
            for (const id of getGrandfatheredQuestIds(copy)) if (!grandfatheredQuestIds.includes(id)) grandfatheredQuestIds.push(id);
        }
        if (copies.filter((copy) => getLinkedQuestIds(copy).length > 0).length > 1) {
            const addedAt = new Map();
            for (const quest of [...(this.getActiveAssignments() || []), ...(this.getCompletedQuests() || [])]) {
                if (quest && quest.id != null) addedAt.set(String(quest.id), typeof quest.dateAdded === 'string' ? quest.dateAdded : '');
            }
            // Array.prototype.sort is stable, so equal dates keep entry/link order
            questIds.sort((a, b) => (addedAt.get(a) || '').localeCompare(addedAt.get(b) || ''));
        }
        return { links: { questIds, grandfatheredQuestIds } };
    }

    /**
     * Ids of quests that still exist (active or completed). Book links to any other id are stale
     * (the quest was discarded or deleted) and do not count toward one book, one quest.
     * @returns {Set<string>}
     */
    getLiveQuestIds() {
        const ids = new Set();
        for (const quest of [...(this.getActiveAssignments() || []), ...(this.getCompletedQuests() || [])]) {
            if (quest && quest.id != null) ids.add(String(quest.id));
        }
        return ids;
    }

    /**
     * True when questId is the book's second (or later) linked quest, across every library entry
     * for the same book (getSameBookLinks), which pays GAME_CONFIG.rewards.secondaryQuestBase.
     * @param {string} bookId
     * @param {string} questId
     * @returns {boolean}
     */
    isSecondaryQuestForBook(bookId, questId) {
        return isSecondaryQuestOnBook(this.getSameBookLinks(bookId), questId, { liveQuestIds: this.getLiveQuestIds() });
    }

    /**
     * Add a quest id to a book's links.questIds (for book-first quest integration).
     * Refused (returns false) when canLinkQuestToBook is not ok.
     * @param {string} bookId
     * @param {string} questId
     * @param {{ allowSecondLink?: boolean }} [options] - see canLinkQuestToBook
     * @returns {boolean} true if linked (or already linked)
     */
    linkQuestToBook(bookId, questId, options = {}) {
        if (!bookId || !questId || typeof bookId !== 'string' || typeof questId !== 'string') return false;
        const book = this.getBook(bookId);
        if (!book) return false;
        const links = book.links && typeof book.links === 'object' ? book.links : { questIds: [], curriculumPromptIds: [] };
        const questIds = [...(links.questIds || [])];
        if (questIds.includes(questId)) return true;
        if (!this.canLinkQuestToBook(bookId, questId, options).ok) return false;
        questIds.push(questId);
        this.updateBook(bookId, { links: { questIds, curriculumPromptIds: links.curriculumPromptIds || [] } });
        return true;
    }

    /**
     * Remove a quest id from a book's links.questIds.
     * @param {string} bookId
     * @param {string} questId
     * @returns {boolean} true if updated
     */
    unlinkQuestFromBook(bookId, questId) {
        if (!bookId || !questId || typeof bookId !== 'string' || typeof questId !== 'string') return false;
        const book = this.getBook(bookId);
        if (!book) return false;
        const links = book.links && typeof book.links === 'object' ? book.links : { questIds: [], curriculumPromptIds: [] };
        const questIds = (links.questIds || []).filter(id => id !== questId);
        this.updateBook(bookId, { links: { questIds, curriculumPromptIds: links.curriculumPromptIds || [] } });
        return true;
    }

    // ==========================================
    // Series (The Archive – book tagging)
    // ==========================================

    _getSeriesRaw() {
        const series = this.state[STORAGE_KEYS.SERIES];
        return series && typeof series === 'object' && !Array.isArray(series) ? series : {};
    }

    _persistSeries(series) {
        this.state[STORAGE_KEYS.SERIES] = series;
        void setStateKey(STORAGE_KEYS.SERIES, series);
        this.emit(EVENTS.SERIES_CHANGED, { ...series });
    }

    _removeBookFromAllSeries(bookId) {
        const series = this._getSeriesRaw();
        let changed = false;
        const next = {};
        for (const [id, s] of Object.entries(series)) {
            if (!s || !Array.isArray(s.bookIds)) continue;
            const bookIds = s.bookIds.filter(bid => bid !== bookId);
            if (bookIds.length !== s.bookIds.length) changed = true;
            next[id] = { ...s, bookIds };
        }
        if (changed) this._persistSeries(next);
    }

    addSeries(data) {
        if (!data || typeof data !== 'object') return null;
        const series = { ...this._getSeriesRaw() };
        const id = (typeof data.id === 'string' && data.id.trim()) ? data.id.trim() : this._generateId();
        const name = typeof data.name === 'string' ? data.name.trim() : '';
        if (!name) return null;
        const bookIds = Array.isArray(data.bookIds) ? data.bookIds.filter(x => typeof x === 'string') : [];
        const releasedCount = typeof data.releasedCount === 'number' && !isNaN(data.releasedCount) && data.releasedCount >= 0
            ? Math.floor(data.releasedCount)
            : 0;
        const expectedCount = typeof data.expectedCount === 'number' && !isNaN(data.expectedCount) && data.expectedCount >= 0
            ? Math.floor(data.expectedCount)
            : 0;
        const isCompletedSeries = typeof data.isCompletedSeries === 'boolean' ? data.isCompletedSeries : false;
        series[id] = { id, name, bookIds, releasedCount, expectedCount, isCompletedSeries };
        this._persistSeries(series);
        return series[id];
    }

    updateSeries(seriesId, updates) {
        if (!seriesId || typeof seriesId !== 'string') return null;
        const series = { ...this._getSeriesRaw() };
        const s = series[seriesId];
        if (!s) return null;
        if (updates && typeof updates === 'object') {
            if (typeof updates.name === 'string' && updates.name.trim()) s.name = updates.name.trim();
            if (Array.isArray(updates.bookIds)) s.bookIds = updates.bookIds.filter(x => typeof x === 'string');
            if (typeof updates.releasedCount === 'number' && !isNaN(updates.releasedCount) && updates.releasedCount >= 0) {
                s.releasedCount = Math.floor(updates.releasedCount);
            }
            if (typeof updates.expectedCount === 'number' && !isNaN(updates.expectedCount) && updates.expectedCount >= 0) {
                s.expectedCount = Math.floor(updates.expectedCount);
            }
            if (typeof updates.isCompletedSeries === 'boolean') s.isCompletedSeries = updates.isCompletedSeries;
        }
        series[seriesId] = s;
        this._persistSeries(series);
        return s;
    }

    deleteSeries(seriesId) {
        if (!seriesId || typeof seriesId !== 'string') return false;
        const series = { ...this._getSeriesRaw() };
        if (!(seriesId in series)) return false;
        delete series[seriesId];
        this._persistSeries(series);
        return true;
    }

    getSeries(seriesId) {
        if (!seriesId || typeof seriesId !== 'string') return null;
        const s = this._getSeriesRaw()[seriesId];
        if (!s) return null;
        return {
            ...s,
            bookIds: [...(s.bookIds || [])],
            releasedCount: typeof s.releasedCount === 'number' && s.releasedCount >= 0 ? s.releasedCount : 0,
            expectedCount: typeof s.expectedCount === 'number' && s.expectedCount >= 0 ? s.expectedCount : 0,
            isCompletedSeries: typeof s.isCompletedSeries === 'boolean' ? s.isCompletedSeries : false
        };
    }

    getSeriesList() {
        const raw = this._getSeriesRaw();
        return Object.keys(raw).map(id => {
            const s = raw[id];
            if (!s) return null;
            return {
                ...s,
                bookIds: [...(s.bookIds || [])],
                releasedCount: typeof s.releasedCount === 'number' && s.releasedCount >= 0 ? s.releasedCount : 0,
                expectedCount: typeof s.expectedCount === 'number' && s.expectedCount >= 0 ? s.expectedCount : 0,
                isCompletedSeries: typeof s.isCompletedSeries === 'boolean' ? s.isCompletedSeries : false
            };
        }).filter(Boolean);
    }

    /** Returns the first series that contains this bookId, or null. */
    getSeriesForBook(bookId) {
        if (!bookId || typeof bookId !== 'string') return null;
        const list = this.getSeriesList();
        return list.find(s => (s.bookIds || []).includes(bookId)) || null;
    }

    addBookToSeries(seriesId, bookId) {
        if (!seriesId || !bookId || typeof seriesId !== 'string' || typeof bookId !== 'string') return false;
        const s = this.getSeries(seriesId);
        if (!s) return false;
        if (s.bookIds.includes(bookId)) return true;
        const bookIds = [...s.bookIds, bookId];
        this.updateSeries(seriesId, { bookIds });
        return true;
    }

    removeBookFromSeries(seriesId, bookId) {
        if (!seriesId || !bookId || typeof seriesId !== 'string' || typeof bookId !== 'string') return false;
        const s = this.getSeries(seriesId);
        if (!s) return false;
        const bookIds = s.bookIds.filter(id => id !== bookId);
        this.updateSeries(seriesId, { bookIds });
        return true;
    }

    /**
     * Number of linked books (in library) that have status === 'completed'.
     * @param {string} seriesId
     * @returns {number}
     */
    getSeriesCompletedCount(seriesId) {
        const s = this.getSeries(seriesId);
        if (!s || !Array.isArray(s.bookIds)) return 0;
        const books = this._getBooksRaw();
        return s.bookIds.filter(bookId => {
            const book = books[bookId];
            return book && book.status === 'completed';
        }).length;
    }

    /**
     * Derived progress summary for a series (for UI and completion checks).
     * @param {string} seriesId
     * @returns {{ completedCount: number, inProgressCount: number, linkedCount: number, releasedCount: number, expectedCount: number, isCompletedSeries: boolean, isKeeperComplete: boolean } | null}
     */
    getSeriesProgressSummary(seriesId) {
        const s = this.getSeries(seriesId);
        if (!s) return null;
        const bookIds = s.bookIds || [];
        const books = this._getBooksRaw();
        // In progress (schema v20): not completed and linked to an active quest. 'reading' now
        // means every unfinished book, so it no longer says the book is being read.
        let completedCount = 0;
        let inProgressCount = 0;
        for (const bookId of bookIds) {
            const book = books[bookId];
            if (!book) continue;
            if (book.status === 'completed') {
                completedCount += 1;
            } else if (this.isBookOnActiveQuest(book)) {
                inProgressCount += 1;
            }
        }
        const releasedCount = typeof s.releasedCount === 'number' && s.releasedCount >= 0 ? s.releasedCount : 0;
        const expectedCount = typeof s.expectedCount === 'number' && s.expectedCount >= 0 ? s.expectedCount : 0;
        const isCompletedSeries = s.isCompletedSeries === true;
        const isKeeperComplete = releasedCount > 0 && releasedCount === expectedCount && isCompletedSeries && completedCount >= releasedCount;
        return {
            completedCount,
            inProgressCount,
            linkedCount: bookIds.length,
            releasedCount,
            expectedCount,
            isCompletedSeries,
            isKeeperComplete
        };
    }

    /**
     * Whether the series is eligible for claiming the completion reward.
     * Requires: author has finished the series (isCompletedSeries), releasedCount === expectedCount,
     * and the keeper has read every released book (completed linked count >= releasedCount).
     * @param {string} seriesId
     * @returns {boolean}
     */
    isSeriesComplete(seriesId) {
        const summary = this.getSeriesProgressSummary(seriesId);
        if (!summary) return false;
        return summary.isKeeperComplete;
    }

    getClaimedSeriesRewards() {
        const raw = this.state[STORAGE_KEYS.CLAIMED_SERIES_REWARDS];
        return Array.isArray(raw) ? [...raw] : [];
    }

    /**
     * Record that the keeper has claimed the series completion (souvenir) reward for this series.
     * @param {string} seriesId
     * @returns {boolean} true if added (idempotent: already claimed still returns true)
     */
    addClaimedSeriesReward(seriesId) {
        if (!seriesId || typeof seriesId !== 'string') return false;
        const list = this.getClaimedSeriesRewards();
        if (list.includes(seriesId)) return true;
        list.push(seriesId);
        this.state[STORAGE_KEYS.CLAIMED_SERIES_REWARDS] = list;
        void setStateKey(STORAGE_KEYS.CLAIMED_SERIES_REWARDS, list);
        this.emit(EVENTS.CLAIMED_SERIES_REWARDS_CHANGED, [...list]);
        return true;
    }

    hasClaimedSeriesReward(seriesId) {
        return this.getClaimedSeriesRewards().includes(seriesId);
    }

    /**
     * The Exchange's register: countries already struck off, in claim order.
     * @returns {string[]}
     */
    getClaimedCountries() {
        const raw = this.state[STORAGE_KEYS.CLAIMED_COUNTRIES];
        return Array.isArray(raw) ? [...raw] : [];
    }

    /**
     * Compare countries case- and whitespace-insensitively so "japan" cannot
     * re-claim "Japan", while the display keeps whatever the player typed.
     * @param {string} country
     * @returns {boolean}
     */
    hasClaimedCountry(country) {
        if (!country || typeof country !== 'string') return false;
        const needle = country.trim().toLowerCase();
        if (!needle) return false;
        return this.getClaimedCountries().some((entry) => String(entry).trim().toLowerCase() === needle);
    }

    /**
     * Strike a country off the register. Once ever — a repeat claim is a no-op.
     * @param {string} country
     * @returns {boolean} true if the register now contains it
     */
    addClaimedCountry(country) {
        if (!country || typeof country !== 'string') return false;
        const trimmed = country.trim();
        if (!trimmed) return false;
        if (this.hasClaimedCountry(trimmed)) return true;

        const list = this.getClaimedCountries();
        list.push(trimmed);
        this.state[STORAGE_KEYS.CLAIMED_COUNTRIES] = list;
        void setStateKey(STORAGE_KEYS.CLAIMED_COUNTRIES, list);
        this.emit(EVENTS.CLAIMED_COUNTRIES_CHANGED, [...list]);
        return true;
    }

    /**
     * Expedition progress: list of { seriesId, stopId, claimedAt } for series that have advanced the shared track.
     * @returns {{ seriesId: string, stopId: string, claimedAt: string }[]}
     */
    getSeriesExpeditionProgress() {
        const raw = this.state[STORAGE_KEYS.SERIES_EXPEDITION_PROGRESS];
        return Array.isArray(raw) ? [...raw] : [];
    }

    /**
     * Record that a series advanced the expedition to the given stop. Idempotent per (seriesId, stopId).
     * @param {string} seriesId
     * @param {string} stopId
     * @returns {boolean} true if added, false if duplicate or invalid
     */
    addSeriesExpeditionAdvance(seriesId, stopId) {
        if (!seriesId || !stopId || typeof seriesId !== 'string' || typeof stopId !== 'string') return false;
        const list = this.getSeriesExpeditionProgress();
        const alreadyExists = list.some(p => p.seriesId === seriesId && p.stopId === stopId);
        if (alreadyExists) return false;
        const entry = { seriesId, stopId, claimedAt: new Date().toISOString() };
        list.push(entry);
        this.state[STORAGE_KEYS.SERIES_EXPEDITION_PROGRESS] = list;
        void setStateKey(STORAGE_KEYS.SERIES_EXPEDITION_PROGRESS, list);
        this.emit(EVENTS.SERIES_EXPEDITION_PROGRESS_CHANGED, [...list]);
        return true;
    }

    /** Whether this series has already advanced the expedition (in expedition progress log). */
    hasSeriesAdvancedExpedition(seriesId) {
        return this.getSeriesExpeditionProgress().some(p => p.seriesId === seriesId);
    }

    /**
     * Mark a book complete: set status/dateCompleted and cascade to linked quests and curriculum prompts.
     * Book completion pays no money. Caller should run handleRestorationProjectCompletion for any
     * movedQuests that are restoration projects.
     * @param {string} bookId
     * @returns {{ book: Object, movedQuests: Object[] } | null}
     */
    markBookComplete(bookId) {
        if (!bookId || typeof bookId !== 'string') return null;
        const books = { ...this._getBooksRaw() };
        const book = books[bookId];
        if (!book) return null;
        const now = new Date().toISOString();
        book.status = 'completed';
        book.dateCompleted = now;
        books[bookId] = book;
        this._persistBooks(books);

        const links = book.links && typeof book.links === 'object'
            ? book.links
            : { questIds: [], curriculumPromptIds: [] };
        const questIds = Array.isArray(links.questIds) ? links.questIds : [];
        const curriculumPromptIds = Array.isArray(links.curriculumPromptIds) ? links.curriculumPromptIds : [];

        const movedQuests = [];
        const questIdsSet = new Set(questIds.map(id => String(id)));
        const isLinked = (q) => {
            if (!q) return false;
            const idStr = q.id != null ? String(q.id) : '';
            return (idStr && questIdsSet.has(idStr)) || q.bookId === bookId;
        };
        for (;;) {
            const active = this.getActiveAssignments() || [];
            const idx = active.findIndex(isLinked);
            if (idx < 0) break;
            const moved = this.moveQuest(
                STORAGE_KEYS.ACTIVE_ASSIGNMENTS,
                idx,
                STORAGE_KEYS.COMPLETED_QUESTS,
                q => {
                    const rawId = q && q.id != null ? String(q.id).trim() : '';
                    const id = rawId || this._generateId();
                    return { ...q, id, dateCompleted: now };
                }
            );
            if (moved) {
                movedQuests.push(moved);
                if (moved.id && !questIdsSet.has(String(moved.id))) {
                    this.linkQuestToBook(bookId, moved.id);
                }
            } else {
                break;
            }
        }

        for (const promptId of curriculumPromptIds) {
            if (promptId && typeof promptId === 'string') {
                this.markPromptComplete(promptId);
            }
        }

        return { book, movedQuests };
    }

    // ==========================================
    // External Curriculum (Schema v5)
    // ==========================================

    _getExternalCurriculumRaw() {
        const data = this.state[STORAGE_KEYS.EXTERNAL_CURRICULUM];
        if (!data || typeof data !== 'object' || Array.isArray(data)) return { curriculums: {} };
        return {
            curriculums: data.curriculums && typeof data.curriculums === 'object' ? data.curriculums : {}
        };
    }

    /** Public getter for external curriculum data (curriculums object). */
    getExternalCurriculum() {
        return { ...this._getExternalCurriculumRaw().curriculums };
    }

    _persistExternalCurriculum(data) {
        this.state[STORAGE_KEYS.EXTERNAL_CURRICULUM] = data;
        void setStateKey(STORAGE_KEYS.EXTERNAL_CURRICULUM, data);
        this.emit(EVENTS.EXTERNAL_CURRICULUM_CHANGED, { ...data });
    }

    addCurriculum(name, type) {
        const curriculums = { ...this._getExternalCurriculumRaw().curriculums };
        const id = this._generateId();
        let curriculumType = 'prompt';
        if (type === 'book-club') curriculumType = 'book-club';
        else if (type === 'bingo') curriculumType = 'bingo';
        curriculums[id] = {
            id,
            name: typeof name === 'string' ? name : '',
            type: curriculumType,
            categories: {}
        };
        this._persistExternalCurriculum({ curriculums });
        return curriculums[id];
    }

    updateCurriculum(curriculumId, updates) {
        if (!curriculumId || typeof curriculumId !== 'string') return null;
        const data = this._getExternalCurriculumRaw();
        const curriculums = { ...data.curriculums };
        const curriculum = curriculums[curriculumId];
        if (!curriculum) return null;
        if (updates && typeof updates === 'object') {
            if (typeof updates.name === 'string') curriculum.name = updates.name;
            if (typeof updates.type === 'string') {
                if (updates.type === 'book-club' || updates.type === 'bingo' || updates.type === 'prompt') {
                    curriculum.type = updates.type;
                }
            }
            if (Array.isArray(updates.boardPromptIds)) {
                curriculum.boardPromptIds = updates.boardPromptIds.filter(id => typeof id === 'string');
            }
            if (updates.categories && typeof updates.categories === 'object') curriculum.categories = updates.categories;
        }
        curriculums[curriculumId] = curriculum;
        this._persistExternalCurriculum({ curriculums });
        return curriculum;
    }

    deleteCurriculum(curriculumId) {
        if (!curriculumId || typeof curriculumId !== 'string') return false;
        const data = this._getExternalCurriculumRaw();
        const curriculums = { ...data.curriculums };
        if (!(curriculumId in curriculums)) return false;
        delete curriculums[curriculumId];
        this._persistExternalCurriculum({ curriculums });
        return true;
    }

    addCategory(curriculumId, name) {
        if (!curriculumId || typeof curriculumId !== 'string') return null;
        const data = this._getExternalCurriculumRaw();
        const curriculums = { ...data.curriculums };
        const curriculum = curriculums[curriculumId];
        if (!curriculum) return null;
        const categories = { ...(curriculum.categories || {}) };
        const categoryId = this._generateId();
        categories[categoryId] = { id: categoryId, name: typeof name === 'string' ? name : '', prompts: {} };
        curriculum.categories = categories;
        curriculums[curriculumId] = curriculum;
        this._persistExternalCurriculum({ curriculums });
        return categories[categoryId];
    }

    updateCategory(curriculumId, categoryId, updates) {
        if (!curriculumId || typeof curriculumId !== 'string' || !categoryId || typeof categoryId !== 'string') return null;
        const data = this._getExternalCurriculumRaw();
        const curriculums = { ...data.curriculums };
        const curriculum = curriculums[curriculumId];
        if (!curriculum) return null;
        const categories = { ...(curriculum.categories || {}) };
        const category = categories[categoryId];
        if (!category) return null;
        if (updates && typeof updates === 'object' && typeof updates.name === 'string') {
            category.name = updates.name;
        }
        categories[categoryId] = category;
        curriculum.categories = categories;
        curriculums[curriculumId] = curriculum;
        this._persistExternalCurriculum({ curriculums });
        return category;
    }

    deleteCategory(curriculumId, categoryId) {
        if (!curriculumId || typeof curriculumId !== 'string' || !categoryId || typeof categoryId !== 'string') return false;
        const data = this._getExternalCurriculumRaw();
        const curriculums = { ...data.curriculums };
        const curriculum = curriculums[curriculumId];
        if (!curriculum) return false;
        const categories = { ...(curriculum.categories || {}) };
        const category = categories[categoryId];
        if (!category) return false;
        const prompts = category.prompts || {};
        for (const promptId of Object.keys(prompts)) {
            const prompt = prompts[promptId];
            if (prompt && prompt.bookId) {
                const book = this.getBook(prompt.bookId);
                if (book && book.links) {
                    const links = book.links;
                    const curriculumPromptIds = (links.curriculumPromptIds || []).filter(id => id !== promptId);
                    this.updateBook(prompt.bookId, { links: { questIds: links.questIds || [], curriculumPromptIds } });
                }
            }
        }
        delete categories[categoryId];
        curriculum.categories = categories;
        curriculums[curriculumId] = curriculum;
        this._persistExternalCurriculum({ curriculums });
        return true;
    }

    addPrompts(curriculumId, categoryId, promptTexts) {
        if (!curriculumId || typeof curriculumId !== 'string' || !categoryId || typeof categoryId !== 'string') return [];
        const texts = Array.isArray(promptTexts) ? promptTexts.filter(t => typeof t === 'string' && t.trim()) : [];
        if (texts.length === 0) return [];
        const data = this._getExternalCurriculumRaw();
        const curriculums = { ...data.curriculums };
        const curriculum = curriculums[curriculumId];
        if (!curriculum) return [];
        const categories = { ...(curriculum.categories || {}) };
        const category = categories[categoryId];
        if (!category) return [];
        const prompts = { ...(category.prompts || {}) };
        const added = [];
        texts.forEach(text => {
            const promptId = this._generateId();
            prompts[promptId] = { id: promptId, text: text.trim(), bookId: null, completedAt: null };
            added.push(prompts[promptId]);
        });
        category.prompts = prompts;
        categories[categoryId] = category;
        curriculum.categories = categories;
        curriculums[curriculumId] = curriculum;
        this._persistExternalCurriculum({ curriculums });
        return added;
    }

    _findPromptLocation(promptId) {
        const data = this._getExternalCurriculumRaw();
        for (const curriculumId of Object.keys(data.curriculums)) {
            const curriculum = data.curriculums[curriculumId];
            const categories = curriculum.categories || {};
            for (const catId of Object.keys(categories)) {
                const category = categories[catId];
                const prompts = category.prompts || {};
                if (promptId in prompts) return { curriculumId, categoryId: catId, curriculum, category, prompts };
            }
        }
        return null;
    }

    linkBookToPrompt(promptId, bookId) {
        if (!promptId || typeof promptId !== 'string') return null;
        const loc = this._findPromptLocation(promptId);
        if (!loc) return null;
        const prompts = { ...loc.prompts };
        const prompt = prompts[promptId];
        if (!prompt) return null;
        const previousBookId = prompt.bookId && typeof prompt.bookId === 'string' ? prompt.bookId : null;
        const newBookId = bookId && typeof bookId === 'string' ? bookId : null;

        if (previousBookId && previousBookId !== newBookId) {
            const prevBook = this._getBooksRaw()[previousBookId];
            if (prevBook) {
                const links = prevBook.links && typeof prevBook.links === 'object' ? prevBook.links : { questIds: [], curriculumPromptIds: [] };
                const curriculumPromptIds = (links.curriculumPromptIds || []).filter(id => id !== promptId);
                this.updateBook(previousBookId, { links: { questIds: links.questIds || [], curriculumPromptIds } });
            }
        }

        prompt.bookId = newBookId;
        // Sync completedAt with linked book: set when book is completed, clear when linking to incomplete or unlinking
        if (newBookId) {
            const book = this._getBooksRaw()[newBookId];
            if (book && book.status === 'completed') {
                prompt.completedAt = (book.dateCompleted && typeof book.dateCompleted === 'string')
                    ? book.dateCompleted
                    : new Date().toISOString();
            } else {
                prompt.completedAt = null;
            }
        } else {
            prompt.completedAt = null;
        }
        prompts[promptId] = prompt;
        const data = this._getExternalCurriculumRaw();
        const curriculums = { ...data.curriculums };
        const curriculum = { ...curriculums[loc.curriculumId] };
        const categories = { ...curriculum.categories };
        const category = { ...categories[loc.categoryId] };
        category.prompts = prompts;
        categories[loc.categoryId] = category;
        curriculum.categories = categories;
        curriculums[loc.curriculumId] = curriculum;
        this._persistExternalCurriculum({ curriculums });

        if (newBookId && this.getBook(newBookId)) {
            const book = this._getBooksRaw()[newBookId];
            const links = book && book.links && typeof book.links === 'object' ? book.links : { questIds: [], curriculumPromptIds: [] };
            if (!(links.curriculumPromptIds || []).includes(promptId)) {
                const questIds = [...(links.questIds || [])];
                const curriculumPromptIds = [...(links.curriculumPromptIds || []), promptId];
                this.updateBook(newBookId, { links: { questIds, curriculumPromptIds } });
            }
        }
        return prompt;
    }

    markPromptComplete(promptId) {
        if (!promptId || typeof promptId !== 'string') return null;
        const loc = this._findPromptLocation(promptId);
        if (!loc) return null;
        const prompts = { ...loc.prompts };
        const prompt = prompts[promptId];
        if (!prompt) return null;
        prompt.completedAt = new Date().toISOString();
        prompts[promptId] = prompt;
        const data = this._getExternalCurriculumRaw();
        const curriculums = { ...data.curriculums };
        const curriculum = { ...curriculums[loc.curriculumId] };
        const categories = { ...curriculum.categories };
        const category = { ...categories[loc.categoryId] };
        category.prompts = prompts;
        categories[loc.categoryId] = category;
        curriculum.categories = categories;
        curriculums[loc.curriculumId] = curriculum;
        this._persistExternalCurriculum({ curriculums });
        return prompt;
    }

    deletePrompt(promptId) {
        if (!promptId || typeof promptId !== 'string') return false;
        const loc = this._findPromptLocation(promptId);
        if (!loc) return false;
        const prompt = loc.prompts[promptId];
        if (prompt && prompt.bookId) {
            const book = this.getBook(prompt.bookId);
            if (book && book.links) {
                const links = book.links;
                const curriculumPromptIds = (links.curriculumPromptIds || []).filter(id => id !== promptId);
                this.updateBook(prompt.bookId, { links: { questIds: links.questIds || [], curriculumPromptIds } });
            }
        }
        const prompts = { ...loc.prompts };
        delete prompts[promptId];
        const data = this._getExternalCurriculumRaw();
        const curriculums = { ...data.curriculums };
        const curriculum = { ...curriculums[loc.curriculumId] };
        const categories = { ...curriculum.categories };
        const category = { ...categories[loc.categoryId] };
        category.prompts = prompts;
        categories[loc.categoryId] = category;
        curriculum.categories = categories;
        curriculums[loc.curriculumId] = curriculum;
        this._persistExternalCurriculum({ curriculums });
        return true;
    }

    /**
     * All item names the character currently owns (inventory, equipped, passive item slots, passive familiar slots).
     * Use this for "already owned" checks instead of checking each source separately.
     * @returns {Set<string>}
     */
    getOwnedItemNames() {
        const names = new Set();
        const inventory = this.getInventoryItems() || [];
        inventory.forEach(item => { if (item && item.name) names.add(item.name); });
        const equipped = this.getEquippedItems() || [];
        equipped.forEach(item => { if (item && item.name) names.add(item.name); });
        const passiveItemSlots = this.getPassiveItemSlots() || [];
        passiveItemSlots.forEach(slot => { if (slot && slot.itemName) names.add(slot.itemName); });
        const passiveFamiliarSlots = this.getPassiveFamiliarSlots() || [];
        passiveFamiliarSlots.forEach(slot => { if (slot && slot.itemName) names.add(slot.itemName); });
        return names;
    }
    
    /**
     * Check if an item is currently equipped
     * @param {string} itemName - Item name to check
     * @returns {boolean}
     */
    isEquipped(itemName) {
        const equippedItems = this.getEquippedItems();
        return equippedItems.some(item => item.name === itemName);
    }
    
    /**
     * Unequip an item by name (helper for invariant enforcement)
     * @private
     * @param {string} itemName - Item name to unequip
     * @returns {Object|null} The unequipped item, or null if not found
     */
    _unequipItemByName(itemName) {
        const equippedItems = this.getEquippedItems();
        const equippedIndex = equippedItems.findIndex(item => item.name === itemName);
        if (equippedIndex !== -1) {
            const item = this.removeEquippedItem(equippedIndex);
            // Ensure item is in inventory after unequipping
            if (item) {
                const inventoryItems = this.getInventoryItems();
                const inInventory = inventoryItems.some(i => i.name === itemName);
                if (!inInventory) {
                    this.addInventoryItem(item);
                }
            }
            return item;
        }
        return null;
    }
    
    /**
     * Remove item from all passive slots (helper for invariant enforcement)
     * @private
     * @param {string} itemName - Item name to remove
     */
    _removeItemFromPassiveSlots(itemName) {
        // Directly mutate lists to avoid recursion (setPassiveSlotItem would trigger unequip logic)
        this._mutateList(STORAGE_KEYS.PASSIVE_ITEM_SLOTS, list => {
            let changed = false;
            for (const slot of list) {
                if (slot.itemName === itemName) {
                    slot.itemName = null;
                    changed = true;
                }
            }
            return { changed };
        });
        
        this._mutateList(STORAGE_KEYS.PASSIVE_FAMILIAR_SLOTS, list => {
            let changed = false;
            for (const slot of list) {
                if (slot.itemName === itemName) {
                    slot.itemName = null;
                    changed = true;
                }
            }
            return { changed };
        });
    }
}

export { EVENTS as STATE_EVENTS };
