/**
 * Novice's Focus (level 6 permanent bonus, #187): +5 XP for a completed book of 300+ pages,
 * paid with the base book completion XP from Library mark-complete.
 */
import { RewardCalculator } from '../assets/js/services/RewardCalculator.js';
import { GAME_CONFIG } from '../assets/js/config/gameConfig.js';
import { getBookPageCount } from '../assets/js/utils/bookPageCount.js';
import {
    resolveLibraryBookCompletion,
    MAX_REWARDED_BOOKS_PER_MONTH
} from '../assets/js/character-sheet/bookCompletion.js';
import { BaseQuestHandler } from '../assets/js/quest-handlers/BaseQuestHandler.js';

const BASE_XP = GAME_CONFIG.endOfMonth.bookCompletionXP;
const SOURCE = "Novice's Focus (Level 6)";

const focusRows = (reward) => reward.getReceipt().modifiers.filter((m) => m.source === SOURCE);

describe('GAME_CONFIG.endOfMonth.novicesFocus', () => {
    test('holds the level, page threshold and amount once', () => {
        expect(GAME_CONFIG.endOfMonth.novicesFocus).toEqual({
            name: "Novice's Focus",
            minLevel: 6,
            minPages: 300,
            bonusXP: 5
        });
    });
});

describe('getBookPageCount', () => {
    test('reads pageCount', () => {
        expect(getBookPageCount({ pageCount: 320 })).toBe(320);
    });

    test('prefers pageCount over legacy pageCountRaw', () => {
        expect(getBookPageCount({ pageCount: 299, pageCountRaw: 400 })).toBe(299);
    });

    test('falls back to legacy pageCountRaw', () => {
        expect(getBookPageCount({ pageCountRaw: 310 })).toBe(310);
        expect(getBookPageCount({ pageCount: null, pageCountRaw: 310 })).toBe(310);
    });

    test('floors fractional counts', () => {
        expect(getBookPageCount({ pageCount: 300.9 })).toBe(300);
    });

    test.each([
        ['no book', null],
        ['no page count', {}],
        ['null page count', { pageCount: null }],
        ['zero pages', { pageCount: 0 }],
        ['negative pages', { pageCount: -5 }],
        ['non-numeric', { pageCount: '350' }],
        ['NaN', { pageCount: NaN }]
    ])('returns null for %s', (_label, book) => {
        expect(getBookPageCount(book)).toBeNull();
    });

    test('enrichQuestWithBookPageCount reads the book through the same rule', () => {
        const quest = { bookId: 'b1' };
        BaseQuestHandler.enrichQuestWithBookPageCount(quest, () => ({ pageCountRaw: 333 }));
        expect(quest.pageCountEffective).toBe(333);
        expect(quest.pageCountRaw).toBe(333);

        const untouched = { bookId: 'b2' };
        BaseQuestHandler.enrichQuestWithBookPageCount(untouched, () => ({ pageCount: 0 }));
        expect(untouched.pageCountEffective).toBeUndefined();
    });
});

describe('RewardCalculator.getNovicesFocusBonus', () => {
    test('applies at exactly level 6 and 300 pages', () => {
        expect(RewardCalculator.getNovicesFocusBonus({ pageCount: 300 }, 6)).toEqual({
            source: SOURCE, xp: 5, pageCount: 300
        });
    });

    test('applies above the level and threshold', () => {
        expect(RewardCalculator.getNovicesFocusBonus({ pageCount: 812 }, 20)?.xp).toBe(5);
    });

    test('accepts the level as a form string', () => {
        expect(RewardCalculator.getNovicesFocusBonus({ pageCount: 300 }, '6')?.xp).toBe(5);
    });

    test('299 pages does not qualify', () => {
        expect(RewardCalculator.getNovicesFocusBonus({ pageCount: 299 }, 6)).toBeNull();
    });

    test('level 5 does not qualify', () => {
        expect(RewardCalculator.getNovicesFocusBonus({ pageCount: 300 }, 5)).toBeNull();
    });

    test('missing page count or level does not qualify', () => {
        expect(RewardCalculator.getNovicesFocusBonus({}, 10)).toBeNull();
        expect(RewardCalculator.getNovicesFocusBonus({ pageCount: 500 }, undefined)).toBeNull();
    });

    test('legacy pageCountRaw qualifies', () => {
        expect(RewardCalculator.getNovicesFocusBonus({ pageCountRaw: 300 }, 6)?.xp).toBe(5);
    });
});

describe('RewardCalculator.calculateCompletedBookRewards', () => {
    test('level 6 + 300 pages: base XP plus a separate named receipt row', () => {
        const reward = RewardCalculator.calculateCompletedBookRewards({ title: 'T', pageCount: 300 }, { level: 6 });
        expect(reward.xp).toBe(BASE_XP + 5);
        const receipt = reward.getReceipt();
        expect(receipt.base.xp).toBe(BASE_XP);
        expect(receipt.final.xp).toBe(BASE_XP + 5);
        expect(receipt.modifiers.map((m) => m.source)).toEqual(['End of Month - Book Completion', SOURCE]);
        expect(focusRows(reward)).toEqual([
            expect.objectContaining({ value: 5, currency: 'xp', type: 'permanent-bonus' })
        ]);
    });

    test.each([
        ['299 pages at level 6', { pageCount: 299 }, 6],
        ['300 pages at level 5', { pageCount: 300 }, 5],
        ['no page count at level 10', {}, 10]
    ])('%s: base XP only, no Novice\'s Focus row', (_label, book, level) => {
        const reward = RewardCalculator.calculateCompletedBookRewards({ title: 'T', ...book }, { level });
        expect(reward.xp).toBe(BASE_XP);
        expect(reward.getReceipt().final.xp).toBe(BASE_XP);
        expect(focusRows(reward)).toEqual([]);
    });
});

describe('resolveLibraryBookCompletion (Library mark-complete, the only book XP path)', () => {
    const longBook = (title) => ({ title, pageCount: 450 });

    test('pays base + bonus for a new qualifying book and records it as counted', () => {
        const completedBooksSet = new Set();
        const { isNewBook, reward } = resolveLibraryBookCompletion({
            book: longBook('Long'), completedBooksSet, booksCompletedThisMonth: 0, level: 6
        });
        expect(isNewBook).toBe(true);
        expect(reward.xp).toBe(BASE_XP + 5);
        expect(completedBooksSet.has('Long')).toBe(true);
    });

    test('pays exactly once per book', () => {
        const completedBooksSet = new Set();
        const args = { book: longBook('Long'), completedBooksSet, booksCompletedThisMonth: 0, level: 6 };
        const first = resolveLibraryBookCompletion(args);
        const second = resolveLibraryBookCompletion({ ...args, booksCompletedThisMonth: 1 });
        expect(first.reward.xp).toBe(BASE_XP + 5);
        expect(second).toEqual({ isNewBook: false, reward: null });
    });

    test('a book already counted this month (e.g. by quest completion) pays nothing', () => {
        const { isNewBook, reward } = resolveLibraryBookCompletion({
            book: longBook('Long'), completedBooksSet: new Set(['Long']), booksCompletedThisMonth: 3, level: 6
        });
        expect(isNewBook).toBe(false);
        expect(reward).toBeNull();
    });

    test('the 10th book still pays base + bonus', () => {
        const { reward } = resolveLibraryBookCompletion({
            book: longBook('Tenth'), completedBooksSet: new Set(),
            booksCompletedThisMonth: MAX_REWARDED_BOOKS_PER_MONTH - 1, level: 6
        });
        expect(reward.xp).toBe(BASE_XP + 5);
    });

    test('past the monthly 10-book cap neither base XP nor the bonus is paid', () => {
        expect(MAX_REWARDED_BOOKS_PER_MONTH).toBe(10);
        const completedBooksSet = new Set();
        const { isNewBook, reward } = resolveLibraryBookCompletion({
            book: longBook('Eleventh'), completedBooksSet, booksCompletedThisMonth: 10, level: 6
        });
        expect(isNewBook).toBe(true);
        expect(reward).toBeNull();
        expect(completedBooksSet.has('Eleventh')).toBe(true);
    });

    test('a book without a title pays nothing', () => {
        expect(resolveLibraryBookCompletion({
            book: { pageCount: 500 }, completedBooksSet: new Set(), booksCompletedThisMonth: 0, level: 6
        })).toEqual({ isNewBook: false, reward: null });
    });
});
