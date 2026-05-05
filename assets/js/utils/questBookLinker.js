/**
 * questBookLinker utility
 * Functions for linking quests to books and creating extra credit quests.
 */

import { RewardCalculator } from '../services/RewardCalculator.js';

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
 * Links an existing active quest to a book.
 * If the quest is already linked to a different book, unlinks from the old book first.
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

    stateAdapter.linkQuestToBook(bookId, questId);

    return true;
}

/**
 * Creates an Extra Credit quest for a book that was read outside the quest pool.
 * @param {string} bookId
 * @param {object} stateAdapter
 * @returns {object|null}
 */
export function createExtraCreditForBook(bookId, stateAdapter) {
    const book = stateAdapter.getBook(bookId);
    if (!book) return null;

    const type = '⭐ Extra Credit';
    const prompt = 'Book read outside of quest pool';

    const now = new Date();
    const month = MONTH_NAMES[now.getMonth()];
    const year = String(now.getFullYear());

    const quest = {
        id: generateQuestId(),
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
