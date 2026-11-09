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
