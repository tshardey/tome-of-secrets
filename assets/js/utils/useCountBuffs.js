/**
 * Use-count temporary buffs (Enchanted Focus, Story Surge, Long Read Focus, Librarian's Blessing, ...).
 *
 * These buffs pay their catalog `rewardModifier` on each completed quest that carries their
 * "[Buff] Name" bonus card, and each such quest spends one use. The active state entry tracks
 * `usesLeft`; an entry without it (added before the counter existed) falls back to the catalog
 * `useCount`. A spent buff stays in the list as `status: 'used'`, `usesLeft: 0`.
 *
 * Pure helpers shared by RewardCalculator (does the buff still pay?) and StateAdapter (spend a use).
 */

/**
 * Temporary-buff name on a quest bonus card, or null for item/background cards.
 * Bare names (no prefix) are treated as buffs, matching RewardCalculator._parseBuffName.
 * @param {string} card
 * @returns {string|null}
 */
export function buffNameFromCard(card) {
    if (typeof card !== 'string' || !card) return null;
    if (card.startsWith('[Item]') || card.startsWith('[Background]')) return null;
    return card.replace(/^\[Buff\] /, '');
}

/**
 * @param {Object} buff - Temporary buff state entry
 * @param {number} catalogUseCount
 * @returns {number}
 */
export function remainingUses(buff, catalogUseCount) {
    if (buff && typeof buff.usesLeft === 'number') return buff.usesLeft;
    return catalogUseCount;
}

/**
 * Index of the active entry for `name` that still has a use to spend, or -1.
 * @param {Array<Object>} buffs
 * @param {string} name
 * @param {number} catalogUseCount
 * @returns {number}
 */
export function findPayingUseCountBuffIndex(buffs, name, catalogUseCount) {
    if (!Array.isArray(buffs)) return -1;
    return buffs.findIndex(buff =>
        buff &&
        buff.name === name &&
        buff.status === 'active' &&
        remainingUses(buff, catalogUseCount) > 0
    );
}

/**
 * True when the buff's uses are spent: the state holds an entry for it but none can still pay.
 * With no entry at all (e.g. a reward preview without character state) the card is not gated.
 * @param {Array<Object>} buffs
 * @param {string} name
 * @param {number} catalogUseCount
 * @returns {boolean}
 */
export function isUseCountBuffSpent(buffs, name, catalogUseCount) {
    if (!Array.isArray(buffs) || !buffs.some(buff => buff && buff.name === name)) return false;
    return findPayingUseCountBuffIndex(buffs, name, catalogUseCount) < 0;
}

/**
 * Spend one use of each use-count buff named on a completed quest's bonus cards.
 * Pure: returns a new list; a buff whose uses reach 0 becomes `status: 'used'`, `usesLeft: 0`.
 * @param {Array<Object>} buffs - Temporary buff state entries
 * @param {string[]} buffCards - The quest's bonus cards (e.g. "[Buff] Enchanted Focus")
 * @param {(name: string) => number} getCatalogUseCount - Catalog `useCount` for a buff name (0 if none)
 * @returns {{ buffs: Array<Object>, changed: boolean, spent: string[] }}
 */
export function spendUseCountBuffs(buffs, buffCards, getCatalogUseCount) {
    const next = Array.isArray(buffs) ? [...buffs] : [];
    const spent = [];
    let changed = false;
    if (!Array.isArray(buffCards) || typeof getCatalogUseCount !== 'function') {
        return { buffs: next, changed, spent };
    }
    const names = [...new Set(buffCards.map(buffNameFromCard).filter(Boolean))];
    for (const name of names) {
        const useCount = Number(getCatalogUseCount(name)) || 0;
        if (useCount <= 0) continue;
        const index = findPayingUseCountBuffIndex(next, name, useCount);
        if (index < 0) continue;
        const usesLeft = remainingUses(next[index], useCount) - 1;
        next[index] = usesLeft <= 0
            ? { ...next[index], usesLeft: 0, status: 'used' }
            : { ...next[index], usesLeft };
        if (usesLeft <= 0) spent.push(name);
        changed = true;
    }
    return { buffs: next, changed, spent };
}
