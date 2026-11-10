/**
 * questLinkRules
 * Pure rules for "one book, one quest": how many quests a library book may be linked to,
 * and which of a book's quests is the secondary (ability-granted) one.
 */

import { MULTI_QUEST_ABILITIES } from '../config/gameConfig.js';

/** Most quests a single book can ever be linked to (the second needs a multi-quest ability). */
export const MAX_QUESTS_PER_BOOK = 2;

const REFUSAL_MESSAGES = Object.freeze({
    'already-linked': 'This book is already linked to a quest.',
    'max-links': 'A book can complete at most two quests.'
});

/**
 * The book's linked quest ids, in link order. With liveQuestIds, links to quests that no longer
 * exist (discarded or deleted) are dropped so they never hold a book's quota; keepId (the quest
 * being evaluated) always counts, since it may be mid-move between quest lists.
 * @param {Object|null} book
 * @param {{ liveQuestIds?: Set<string>|null, keepId?: string|null }} [options]
 * @returns {string[]}
 */
export function getLinkedQuestIds(book, { liveQuestIds = null, keepId = null } = {}) {
    const ids = book?.links?.questIds;
    if (!Array.isArray(ids)) return [];
    if (!liveQuestIds) return ids;
    return ids.filter((id) => id === keepId || liveQuestIds.has(id));
}

/**
 * Quest ids whose link to the book predates one book, one quest (schema v18/v19 migrations).
 * Grandfathered links never count as the book's secondary quest, so each pays the full questBase.
 * @param {Object|null} book
 * @returns {string[]}
 */
export function getGrandfatheredQuestIds(book) {
    const ids = book?.links?.grandfatheredQuestIds;
    return Array.isArray(ids) ? ids : [];
}

/**
 * Grandfather a book's existing links when it holds two or more (pure, idempotent).
 * @param {Object} book
 * @param {function(string): boolean} [isLegacyLink] - which of the linked quest ids predate the rule
 * @returns {Object} the same book when nothing changes, otherwise a copy with links.grandfatheredQuestIds
 */
export function grandfatherBookLinks(book, isLegacyLink = () => true) {
    const questIds = getLinkedQuestIds(book);
    if (questIds.length < MAX_QUESTS_PER_BOOK) return book;
    const existing = getGrandfatheredQuestIds(book);
    const added = questIds.filter((id) => !existing.includes(id) && isLegacyLink(id));
    if (added.length === 0) return book;
    return { ...book, links: { ...book.links, grandfatheredQuestIds: [...existing, ...added] } };
}

/**
 * @param {Array<string>|null|undefined} learnedAbilities
 * @returns {boolean} true when the keeper knows an ability that lets a book clear a second quest
 */
export function hasMultiQuestAbility(learnedAbilities) {
    return Array.isArray(learnedAbilities) && learnedAbilities.some((name) => MULTI_QUEST_ABILITIES.includes(name));
}

/**
 * Decide whether questId may be linked to book. Relinking an existing link is always ok.
 * @param {Object|null} book
 * @param {string} questId
 * @param {Array<string>} learnedAbilities
 * @param {{ allowSecondLink?: boolean, liveQuestIds?: Set<string>|null }} [options] - allowSecondLink: an
 *   activation (the Evocation school's monthly "one book, two quests") grants the second link without a
 *   multi-quest ability; liveQuestIds: see getLinkedQuestIds
 * @returns {{ ok: boolean, reason?: 'already-linked' | 'max-links' }}
 */
export function evaluateQuestLink(book, questId, learnedAbilities, options = {}) {
    const linked = getLinkedQuestIds(book, { liveQuestIds: options.liveQuestIds, keepId: questId });
    if (linked.includes(questId)) return { ok: true };
    if (linked.length >= MAX_QUESTS_PER_BOOK) return { ok: false, reason: 'max-links' };
    if (linked.length === 1 && !options.allowSecondLink && !hasMultiQuestAbility(learnedAbilities)) {
        return { ok: false, reason: 'already-linked' };
    }
    return { ok: true };
}

/**
 * @param {Object|null} book
 * @param {string} questId
 * @param {{ liveQuestIds?: Set<string>|null }} [options] - see getLinkedQuestIds
 * @returns {boolean} true when questId is a book's second (or later) linked quest and the link
 *   is not grandfathered
 */
export function isSecondaryQuestOnBook(book, questId, { liveQuestIds = null } = {}) {
    if (!questId) return false;
    if (getGrandfatheredQuestIds(book).includes(questId)) return false;
    return getLinkedQuestIds(book, { liveQuestIds, keepId: questId }).indexOf(questId) >= 1;
}

/**
 * Secondary-quest verdict for a quest whose link may not be stored yet: one of several quests
 * added together for the same book (e.g. a dungeon room and its encounter).
 * @param {Object|null} book
 * @param {string|undefined} questId
 * @param {number} earlierInBatch - quests for this book that precede it in the batch and are not yet linked
 * @param {{ liveQuestIds?: Set<string>|null }} [options] - see getLinkedQuestIds
 * @returns {boolean}
 */
export function isSecondaryQuestInBatch(book, questId, earlierInBatch = 0, { liveQuestIds = null } = {}) {
    const linked = getLinkedQuestIds(book, { liveQuestIds, keepId: questId || null });
    if (questId && linked.includes(questId)) {
        return !getGrandfatheredQuestIds(book).includes(questId) && linked.indexOf(questId) >= 1;
    }
    return linked.length + earlierInBatch >= 1;
}

/**
 * @param {string|undefined} reason - a refusal reason from evaluateQuestLink
 * @returns {string} the message shown to the keeper
 */
export function questLinkRefusalMessage(reason) {
    return REFUSAL_MESSAGES[reason] || REFUSAL_MESSAGES['already-linked'];
}
