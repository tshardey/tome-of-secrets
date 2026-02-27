import { STORAGE_KEYS } from './storageKeys.js';
import { safeGetJSON } from '../utils/storage.js';
import { setStateKey } from './persistence.js';

const EVENTS = Object.freeze({
    SELECTED_GENRES_CHANGED: 'selectedGenresChanged',
    ACTIVE_ASSIGNMENTS_CHANGED: 'activeAssignmentsChanged',
    COMPLETED_QUESTS_CHANGED: 'completedQuestsChanged',
    DISCARDED_QUESTS_CHANGED: 'discardedQuestsChanged',
    INVENTORY_ITEMS_CHANGED: 'inventoryItemsChanged',
    EQUIPPED_ITEMS_CHANGED: 'equippedItemsChanged',
    ACTIVE_CURSES_CHANGED: 'activeCursesChanged',
    COMPLETED_CURSES_CHANGED: 'completedCursesChanged',
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
    EXTERNAL_CURRICULUM_CHANGED: 'externalCurriculumChanged'
});

const LIST_EVENTS = Object.freeze({
    [STORAGE_KEYS.ACTIVE_ASSIGNMENTS]: EVENTS.ACTIVE_ASSIGNMENTS_CHANGED,
    [STORAGE_KEYS.COMPLETED_QUESTS]: EVENTS.COMPLETED_QUESTS_CHANGED,
    [STORAGE_KEYS.DISCARDED_QUESTS]: EVENTS.DISCARDED_QUESTS_CHANGED,
    [STORAGE_KEYS.INVENTORY_ITEMS]: EVENTS.INVENTORY_ITEMS_CHANGED,
    [STORAGE_KEYS.EQUIPPED_ITEMS]: EVENTS.EQUIPPED_ITEMS_CHANGED,
    [STORAGE_KEYS.ACTIVE_CURSES]: EVENTS.ACTIVE_CURSES_CHANGED,
    [STORAGE_KEYS.COMPLETED_CURSES]: EVENTS.COMPLETED_CURSES_CHANGED,
    [STORAGE_KEYS.TEMPORARY_BUFFS]: EVENTS.TEMPORARY_BUFFS_CHANGED,
    [STORAGE_KEYS.LEARNED_ABILITIES]: EVENTS.LEARNED_ABILITIES_CHANGED,
    // Library Restoration Expansion
    [STORAGE_KEYS.COMPLETED_RESTORATION_PROJECTS]: EVENTS.COMPLETED_RESTORATION_PROJECTS_CHANGED,
    [STORAGE_KEYS.COMPLETED_WINGS]: EVENTS.COMPLETED_WINGS_CHANGED,
    [STORAGE_KEYS.PASSIVE_ITEM_SLOTS]: EVENTS.PASSIVE_ITEM_SLOTS_CHANGED,
    [STORAGE_KEYS.PASSIVE_FAMILIAR_SLOTS]: EVENTS.PASSIVE_FAMILIAR_SLOTS_CHANGED,
    [STORAGE_KEYS.CLAIMED_ROOM_REWARDS]: EVENTS.CLAIMED_ROOM_REWARDS_CHANGED
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

    addActiveQuests(quests) {
        const questList = Array.isArray(quests) ? quests : [quests];
        if (questList.length === 0) {
            return [];
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
        
        return value || [];
    }

    addCompletedQuests(quests) {
        const questList = Array.isArray(quests) ? quests : [quests];
        const { value } = this._mutateList(STORAGE_KEYS.COMPLETED_QUESTS, list => {
            if (questList.length === 0) {
                return { changed: false };
            }
            questList.forEach(quest => list.push(quest));
            return { changed: true, value: questList };
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

    // Curses helpers
    getActiveCurses() {
        return this.state[STORAGE_KEYS.ACTIVE_CURSES];
    }

    getCompletedCurses() {
        return this.state[STORAGE_KEYS.COMPLETED_CURSES];
    }

    addActiveCurse(curse) {
        const { value } = this._mutateList(STORAGE_KEYS.ACTIVE_CURSES, list => {
            if (!curse) return { changed: false };
            list.push(curse);
            return { changed: true, value: curse };
        });
        return value || null;
    }

    updateActiveCurse(index, curse) {
        const { value } = this._mutateList(STORAGE_KEYS.ACTIVE_CURSES, list => {
            if (index < 0 || index >= list.length || !curse) {
                return { changed: false };
            }
            list[index] = curse;
            return { changed: true, value: curse };
        });
        return value || null;
    }

    removeActiveCurse(index) {
        const { value } = this._mutateList(STORAGE_KEYS.ACTIVE_CURSES, list => {
            if (index < 0 || index >= list.length) {
                return { changed: false };
            }
            const [removed] = list.splice(index, 1);
            return { changed: true, value: removed };
        });
        return value || null;
    }

    moveCurseToCompleted(index) {
        const curse = this.removeActiveCurse(index);
        if (!curse) return null;
        this._mutateList(STORAGE_KEYS.COMPLETED_CURSES, list => {
            list.push(curse);
            return { changed: true, value: curse };
        });
        return curse;
    }

    removeCompletedCurse(index) {
        const { value } = this._mutateList(STORAGE_KEYS.COMPLETED_CURSES, list => {
            if (index < 0 || index >= list.length) {
                return { changed: false };
            }
            const [removed] = list.splice(index, 1);
            return { changed: true, value: removed };
        });
        return value || null;
    }

    // Temporary buffs helpers
    getTemporaryBuffs() {
        return this.state[STORAGE_KEYS.TEMPORARY_BUFFS];
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
            status: ['reading', 'completed', 'other'].includes(bookData.status) ? bookData.status : 'reading',
            dateAdded: typeof bookData.dateAdded === 'string' ? bookData.dateAdded : now,
            dateCompleted: typeof bookData.dateCompleted === 'string' ? bookData.dateCompleted : null,
            links: bookData.links && typeof bookData.links === 'object'
                ? {
                    questIds: Array.isArray(bookData.links.questIds) ? bookData.links.questIds.filter(x => typeof x === 'string') : [],
                    curriculumPromptIds: Array.isArray(bookData.links.curriculumPromptIds) ? bookData.links.curriculumPromptIds.filter(x => typeof x === 'string') : []
                }
                : { questIds: [], curriculumPromptIds: [] }
        };
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
            if (['reading', 'completed', 'other'].includes(updates.status)) book.status = updates.status;
            if (typeof updates.dateAdded === 'string') book.dateAdded = updates.dateAdded;
            if (updates.dateCompleted !== undefined) book.dateCompleted = typeof updates.dateCompleted === 'string' ? updates.dateCompleted : null;
            if (updates.links && typeof updates.links === 'object') {
                if (!book.links || typeof book.links !== 'object') {
                    book.links = { questIds: [], curriculumPromptIds: [] };
                }
                if (Array.isArray(updates.links.questIds)) book.links.questIds = updates.links.questIds.filter(x => typeof x === 'string');
                if (Array.isArray(updates.links.curriculumPromptIds)) book.links.curriculumPromptIds = updates.links.curriculumPromptIds.filter(x => typeof x === 'string');
            }
        }
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
        if (!['reading', 'completed', 'other'].includes(status)) return [];
        return this.getBooks().filter(b => b.status === status);
    }

    /**
     * Add a quest id to a book's links.questIds (for book-first quest integration).
     * @param {string} bookId
     * @param {string} questId
     * @returns {boolean} true if updated
     */
    linkQuestToBook(bookId, questId) {
        if (!bookId || !questId || typeof bookId !== 'string' || typeof questId !== 'string') return false;
        const book = this.getBook(bookId);
        if (!book) return false;
        const links = book.links && typeof book.links === 'object' ? book.links : { questIds: [], curriculumPromptIds: [] };
        const questIds = [...(links.questIds || [])];
        if (questIds.includes(questId)) return true;
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

    /**
     * Mark a book complete: set status/dateCompleted, cascade to linked quests and curriculum prompts,
     * and compute synergy rewards. Caller should apply synergyRewards (e.g. updateCurrency) and run
     * handleRestorationProjectCompletion for any movedQuests that are restoration projects.
     * @param {string} bookId
     * @returns {{ book: Object, movedQuests: Object[], synergyRewards: { xp: number, inkDrops: number, paperScraps: number, items: string[] } } | null}
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
                q => ({ ...q, dateCompleted: now })
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

        const hasQuestLinks = questIds.length > 0;
        const hasCurriculumLinks = curriculumPromptIds.length > 0;
        const paperScraps = hasCurriculumLinks ? 5 : 0;
        const inkDrops = hasQuestLinks && hasCurriculumLinks ? 10 : 0;
        const synergyRewards = { xp: 0, inkDrops, paperScraps, items: [] };

        return { book, movedQuests, synergyRewards };
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

