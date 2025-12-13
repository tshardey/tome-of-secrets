import { STORAGE_KEYS } from './storageKeys.js';
import { safeGetJSON, safeSetJSON } from '../utils/storage.js';

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
    ATMOSPHERIC_BUFFS_CHANGED: 'atmosphericBuffsChanged'
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
    [STORAGE_KEYS.LEARNED_ABILITIES]: EVENTS.LEARNED_ABILITIES_CHANGED
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
        const list = this.state[key];
        if (!Array.isArray(list)) {
            console.warn(`StateAdapter: attempted to mutate non-array state key "${key}".`);
            return { changed: false, value: undefined, list };
        }

        const result = mutator(list) || {};
        const changed = Boolean(result.changed);

        if (changed) {
            safeSetJSON(key, list);
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
        safeSetJSON(key, newList);

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
        const previous = this.getSelectedGenres();

        this.state[STORAGE_KEYS.SELECTED_GENRES] = sanitized;
        safeSetJSON(STORAGE_KEYS.SELECTED_GENRES, sanitized);

        if (!arraysEqual(previous, sanitized)) {
            this.emit(EVENTS.SELECTED_GENRES_CHANGED, this.getSelectedGenres());
        }
        return this.getSelectedGenres();
    }

    clearSelectedGenres() {
        return this.setSelectedGenres([]);
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
        const { value } = this._mutateList(STORAGE_KEYS.ACTIVE_ASSIGNMENTS, list => {
            if (questList.length === 0) {
                return { changed: false };
            }
            questList.forEach(quest => list.push(quest));
            return { changed: true, value: questList };
        });
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

    moveInventoryItemToEquipped(index) {
        const item = this.removeInventoryItem(index);
        if (!item) return null;
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

        safeSetJSON(STORAGE_KEYS.ATMOSPHERIC_BUFFS, currentBuffs);
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
        safeSetJSON(STORAGE_KEYS.BUFF_MONTH_COUNTER, newValue);
        return newValue;
    }
}

export { EVENTS as STATE_EVENTS };

