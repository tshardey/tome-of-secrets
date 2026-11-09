/**
 * questBookLinker utility
 * Functions for linking quests to books and creating extra credit quests.
 */

import { RewardCalculator } from '../services/RewardCalculator.js';
import { evaluateQuestLink, getLinkedQuestIds, questLinkRefusalMessage } from './questLinkRules.js';
import { toast } from '../ui/toast.js';

const MONTH_NAMES = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
];

function generateQuestId() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0;
        const v = c === 'x' ? r : (r & 0x3) | 0x8;
        return v.toString(16);
    });
}

/**
 * Returns active quests eligible for linking to a book.
 * If excludeBookId is provided, returns quests NOT already linked to that book.
 * If excludeBookId is omitted/null, returns quests with no bookId.
 * Assigns IDs to any quests that don't have one (legacy data).
 * @param {object} stateAdapter
 * @param {string|null} [excludeBookId] — if set, exclude quests already linked to this book
 * @returns {{ id: string, type: string, prompt: string, coverUrl: string|undefined }[]}
 */
export function getUnlinkedActiveQuests(stateAdapter, excludeBookId = null) {
    const activeQuests = stateAdapter.getActiveAssignments() || [];

    // Ensure all quests have IDs (legacy quests may lack them).
    // Mutates in place; IDs persist on next save operation.
    for (const q of activeQuests) {
        if (!q.id) {
            q.id = generateQuestId();
        }
    }

    return activeQuests
        .filter((q) => excludeBookId ? q.bookId !== excludeBookId : !q.bookId)
        .map(({ id, type, prompt, coverUrl }) => ({ id, type, prompt, coverUrl }));
}

/**
 * Why linking questId to bookId would be refused, as a keeper-facing message.
 * @param {object} stateAdapter
 * @param {string} bookId
 * @param {string} questId
 * @param {{ allowSecondLink?: boolean }} [options] - see stateAdapter.canLinkQuestToBook
 * @returns {string|null} the refusal message, or null when the link is allowed
 */
export function getQuestLinkRefusal(stateAdapter, bookId, questId, options = {}) {
    if (typeof stateAdapter?.canLinkQuestToBook !== 'function') return null;
    const check = stateAdapter.canLinkQuestToBook(bookId, questId, options);
    return check?.ok === false ? questLinkRefusalMessage(check.reason) : null;
}

/**
 * Like getQuestLinkRefusal, for several quests that will be linked together (each quest's
 * bookId and id), counting the earlier quests of the batch against each book.
 * @param {object} stateAdapter
 * @param {Array<{ id?: string, bookId?: string }>} quests
 * @returns {string|null} the first refusal message, or null when every link is allowed
 */
export function getBatchQuestLinkRefusal(stateAdapter, quests) {
    if (typeof stateAdapter?.getBook !== 'function') return null;
    const learned = typeof stateAdapter.getLearnedAbilities === 'function' ? stateAdapter.getLearnedAbilities() : [];
    const liveQuestIds = typeof stateAdapter.getLiveQuestIds === 'function' ? stateAdapter.getLiveQuestIds() : null;
    const pendingByBook = new Map();
    for (const quest of quests || []) {
        if (!quest?.bookId || !quest.id) continue;
        const book = stateAdapter.getBook(quest.bookId);
        if (!book) continue;
        const pending = pendingByBook.get(quest.bookId) || [];
        const questIds = [...getLinkedQuestIds(book, { liveQuestIds, keepId: quest.id }), ...pending];
        const check = evaluateQuestLink({ links: { questIds } }, quest.id, learned);
        if (!check.ok) return questLinkRefusalMessage(check.reason);
        if (!questIds.includes(quest.id)) pendingByBook.set(quest.bookId, [...pending, quest.id]);
    }
    return null;
}

/**
 * Link questId to bookId, showing the refusal toast when one book, one quest blocks it.
 * @param {object} stateAdapter
 * @param {string} bookId
 * @param {string} questId
 * @param {{ allowSecondLink?: boolean }} [options] - see stateAdapter.canLinkQuestToBook
 * @returns {boolean} true if linked (or already linked)
 */
export function linkQuestToBookOrNotify(stateAdapter, bookId, questId, options = {}) {
    if (stateAdapter.linkQuestToBook(bookId, questId, options) !== false) return true;
    const refusal = getQuestLinkRefusal(stateAdapter, bookId, questId, options);
    if (refusal) toast.error(refusal);
    return false;
}

/**
 * Links an existing active quest to a book.
 * If the quest is already linked to a different book, unlinks from the old book first.
 * Refused (returns false, nothing changed) when the book cannot take another quest;
 * the caller shows getQuestLinkRefusal() to the keeper.
 * @param {string} questId
 * @param {string} bookId
 * @param {object} stateAdapter
 * @returns {boolean}
 */
export function linkExistingQuestToBook(questId, bookId, stateAdapter) {
    if (!questId || !bookId) return false;

    const activeQuests = stateAdapter.getActiveAssignments() || [];
    const quest = activeQuests.find((q) => q.id === questId);
    if (!quest) {
        console.warn('[questBookLinker] Quest not found:', questId);
        return false;
    }

    const book = stateAdapter.getBook(bookId);
    if (!book) return false;
    if (getQuestLinkRefusal(stateAdapter, bookId, questId)) return false;

    // Unlink from previous book if re-linking
    const previousBookId = quest.bookId;
    if (previousBookId && previousBookId !== bookId) {
        stateAdapter.unlinkQuestFromBook(previousBookId, questId);
    }

    stateAdapter.updateActiveQuest(questId, {
        bookId,
        book: book.title || '',
        bookAuthor: book.author || '',
        coverUrl: book.cover || undefined,
    });

    return stateAdapter.linkQuestToBook(bookId, questId) !== false;
}

/**
 * Creates an Extra Credit quest for a book that was read outside the quest pool.
 * Refused (returns null, nothing created) when the book cannot take another quest;
 * the caller shows getQuestLinkRefusal() to the keeper.
 * @param {string} bookId
 * @param {object} stateAdapter
 * @returns {object|null}
 */
export function createExtraCreditForBook(bookId, stateAdapter) {
    const book = stateAdapter.getBook(bookId);
    if (!book) return null;

    const id = generateQuestId();
    if (getQuestLinkRefusal(stateAdapter, bookId, id)) return null;

    const type = '⭐ Extra Credit';
    const prompt = 'Book read outside of quest pool';

    const now = new Date();
    const month = MONTH_NAMES[now.getMonth()];
    const year = String(now.getFullYear());

    const quest = {
        id,
        type,
        prompt,
        bookId,
        book: book.title,
        bookAuthor: book.author,
        coverUrl: book.cover || undefined,
        month,
        year,
        notes: '',
        buffs: [],
        rewards: RewardCalculator.getBaseRewards(type, prompt).toJSON(),
        dateAdded: new Date().toISOString(),
    };

    stateAdapter.addActiveQuests([quest]);
    stateAdapter.linkQuestToBook(bookId, quest.id);

    return quest;
}
