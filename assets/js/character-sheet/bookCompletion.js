import { RewardCalculator } from '../services/RewardCalculator.js';

/** Book completion XP (and Novice's Focus with it) is paid for this many books a month. */
export const MAX_REWARDED_BOOKS_PER_MONTH = 10;

/**
 * Decide what marking a Library book complete pays. This is the only path that awards
 * book completion XP. Quest completion records the book as counted but pays no book XP.
 *
 * - A book counts once a month (by title, via completedBooksSet, which this adds it to).
 * - Only the first MAX_REWARDED_BOOKS_PER_MONTH counted books pay.
 * - The reward is base book XP plus Novice's Focus (RewardCalculator.calculateCompletedBookRewards).
 *
 * @param {Object} params
 * @param {Object} params.book - The book just marked complete (needs a title)
 * @param {Set<string>} params.completedBooksSet - Titles already counted this month (mutated)
 * @param {number} params.booksCompletedThisMonth - Books already paid this month
 * @param {number|string} params.level - Character's current level
 * @returns {{ isNewBook: boolean, reward: import('../services/RewardCalculator.js').Reward|null }}
 */
export function resolveLibraryBookCompletion({ book, completedBooksSet, booksCompletedThisMonth, level }) {
    const title = book?.title;
    if (!title || !completedBooksSet || completedBooksSet.has(title)) {
        return { isNewBook: false, reward: null };
    }
    completedBooksSet.add(title);
    if (!(booksCompletedThisMonth < MAX_REWARDED_BOOKS_PER_MONTH)) {
        return { isNewBook: true, reward: null };
    }
    return { isNewBook: true, reward: RewardCalculator.calculateCompletedBookRewards(book, { level }) };
}
