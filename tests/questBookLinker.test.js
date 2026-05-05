/**
 * @jest-environment jsdom
 */

jest.mock('../assets/js/services/RewardCalculator.js', () => ({
    RewardCalculator: {
        getBaseRewards: jest.fn(() => ({
            toJSON: () => ({ xp: 0, inkDrops: 0, paperScraps: 10, blueprints: 0, items: [] })
        }))
    }
}));

import {
    getUnlinkedActiveQuests,
    linkExistingQuestToBook,
    createExtraCreditForBook,
} from '../assets/js/utils/questBookLinker.js';

function createMockStateAdapter(activeQuests = [], books = {}) {
    const quests = [...activeQuests];
    return {
        getActiveAssignments: () => quests,
        getBook: (id) => books[id] || null,
        updateActiveQuest: jest.fn((id, updates) => {
            const q = quests.find(q => q.id === id);
            if (q) Object.assign(q, updates);
            return !!q;
        }),
        linkQuestToBook: jest.fn(),
        unlinkQuestFromBook: jest.fn(),
        addActiveQuests: jest.fn((newQuests) => { quests.push(...newQuests); }),
    };
}

// ---------------------------------------------------------------------------
// getUnlinkedActiveQuests
// ---------------------------------------------------------------------------
describe('getUnlinkedActiveQuests', () => {
    test('returns quests with no bookId (null, undefined, or missing)', () => {
        const adapter = createMockStateAdapter([
            { id: 'q1', type: 'Genre Quest', prompt: 'Read a mystery', coverUrl: undefined, bookId: null },
            { id: 'q2', type: 'Side Quest', prompt: 'Read non-fiction', coverUrl: undefined, bookId: undefined },
            { id: 'q3', type: 'Main Quest', prompt: 'Read fantasy', coverUrl: 'https://example.com/cover.jpg', bookId: 'book-1' },
        ]);
        const result = getUnlinkedActiveQuests(adapter);
        expect(result).toHaveLength(2);
        expect(result.map(q => q.id)).toEqual(['q1', 'q2']);
    });

    test('returns empty array when all quests have bookId', () => {
        const adapter = createMockStateAdapter([
            { id: 'q1', type: 'Genre Quest', prompt: 'Read a mystery', coverUrl: undefined, bookId: 'b1' },
            { id: 'q2', type: 'Side Quest', prompt: 'Read non-fiction', coverUrl: undefined, bookId: 'b2' },
        ]);
        expect(getUnlinkedActiveQuests(adapter)).toEqual([]);
    });

    test('returns empty array when there are no active quests', () => {
        const adapter = createMockStateAdapter([]);
        expect(getUnlinkedActiveQuests(adapter)).toEqual([]);
    });

    test('includes coverUrl when present', () => {
        const adapter = createMockStateAdapter([
            { id: 'q1', type: 'Genre Quest', prompt: 'Read a mystery', coverUrl: 'https://example.com/cover.jpg' },
        ]);
        const result = getUnlinkedActiveQuests(adapter);
        expect(result[0].coverUrl).toBe('https://example.com/cover.jpg');
    });

    test('with excludeBookId, returns quests not linked to that book', () => {
        const adapter = createMockStateAdapter([
            { id: 'q1', type: 'Genre Quest', prompt: 'Read a mystery', bookId: 'b1' },
            { id: 'q2', type: 'Side Quest', prompt: 'Read non-fiction', bookId: 'b2' },
            { id: 'q3', type: 'Main Quest', prompt: 'Read fantasy', bookId: null },
        ]);
        const result = getUnlinkedActiveQuests(adapter, 'b1');
        expect(result).toHaveLength(2);
        expect(result.map(q => q.id)).toEqual(['q2', 'q3']);
    });

    test('with excludeBookId, returns empty when all quests linked to that book', () => {
        const adapter = createMockStateAdapter([
            { id: 'q1', type: 'Genre Quest', prompt: 'Read a mystery', bookId: 'b1' },
        ]);
        expect(getUnlinkedActiveQuests(adapter, 'b1')).toEqual([]);
    });
});

// ---------------------------------------------------------------------------
// linkExistingQuestToBook
// ---------------------------------------------------------------------------
describe('linkExistingQuestToBook', () => {
    test('sets bookId, book, bookAuthor, coverUrl and calls linkQuestToBook', () => {
        const adapter = createMockStateAdapter(
            [{ id: 'q1', type: 'Genre Quest', prompt: 'Read a mystery' }],
            { 'b1': { title: 'Sherlock Holmes', author: 'Conan Doyle', cover: 'https://example.com/cover.jpg' } }
        );
        const result = linkExistingQuestToBook('q1', 'b1', adapter);
        expect(result).toBe(true);
        expect(adapter.updateActiveQuest).toHaveBeenCalledWith('q1', {
            bookId: 'b1',
            book: 'Sherlock Holmes',
            bookAuthor: 'Conan Doyle',
            coverUrl: 'https://example.com/cover.jpg',
        });
        expect(adapter.linkQuestToBook).toHaveBeenCalledWith('b1', 'q1');
    });

    test('returns false if quest not found', () => {
        const adapter = createMockStateAdapter(
            [],
            { 'b1': { title: 'Sherlock Holmes', author: 'Conan Doyle', cover: 'https://example.com/cover.jpg' } }
        );
        expect(linkExistingQuestToBook('q-missing', 'b1', adapter)).toBe(false);
        expect(adapter.updateActiveQuest).not.toHaveBeenCalled();
    });

    test('returns false if book not found', () => {
        const adapter = createMockStateAdapter(
            [{ id: 'q1', type: 'Genre Quest', prompt: 'Read a mystery' }],
            {}
        );
        expect(linkExistingQuestToBook('q1', 'b-missing', adapter)).toBe(false);
        expect(adapter.updateActiveQuest).not.toHaveBeenCalled();
    });

    test('sets coverUrl to undefined when book has no cover', () => {
        const adapter = createMockStateAdapter(
            [{ id: 'q1', type: 'Genre Quest', prompt: 'Read a mystery' }],
            { 'b1': { title: 'No Cover Book', author: 'Unknown' } }
        );
        linkExistingQuestToBook('q1', 'b1', adapter);
        expect(adapter.updateActiveQuest).toHaveBeenCalledWith('q1', expect.objectContaining({
            coverUrl: undefined,
        }));
    });

    test('unlinks from previous book when re-linking', () => {
        const adapter = createMockStateAdapter(
            [{ id: 'q1', type: 'Genre Quest', prompt: 'Read a mystery', bookId: 'b-old' }],
            { 'b-new': { title: 'New Book', author: 'Author' } }
        );
        linkExistingQuestToBook('q1', 'b-new', adapter);
        expect(adapter.unlinkQuestFromBook).toHaveBeenCalledWith('b-old', 'q1');
        expect(adapter.linkQuestToBook).toHaveBeenCalledWith('b-new', 'q1');
    });

    test('does not unlink when linking to same book', () => {
        const adapter = createMockStateAdapter(
            [{ id: 'q1', type: 'Genre Quest', prompt: 'Read a mystery', bookId: 'b1' }],
            { 'b1': { title: 'Same Book', author: 'Author' } }
        );
        linkExistingQuestToBook('q1', 'b1', adapter);
        expect(adapter.unlinkQuestFromBook).not.toHaveBeenCalled();
    });
});

// ---------------------------------------------------------------------------
// createExtraCreditForBook
// ---------------------------------------------------------------------------
describe('createExtraCreditForBook', () => {
    const MONTH_NAMES = [
        'January', 'February', 'March', 'April', 'May', 'June',
        'July', 'August', 'September', 'October', 'November', 'December'
    ];

    test('creates correct quest structure', () => {
        const adapter = createMockStateAdapter(
            [],
            { 'b1': { title: 'Dune', author: 'Frank Herbert', cover: 'https://example.com/dune.jpg' } }
        );
        const quest = createExtraCreditForBook('b1', adapter);
        expect(quest).not.toBeNull();
        expect(quest.type).toBe('⭐ Extra Credit');
        expect(quest.prompt).toBe('Book read outside of quest pool');
        expect(quest.bookId).toBe('b1');
        expect(quest.book).toBe('Dune');
        expect(quest.bookAuthor).toBe('Frank Herbert');
        expect(quest.coverUrl).toBe('https://example.com/dune.jpg');
        expect(quest.buffs).toEqual([]);
        expect(quest.notes).toBe('');
        expect(quest.rewards).toEqual({ xp: 0, inkDrops: 0, paperScraps: 10, blueprints: 0, items: [] });
        expect(typeof quest.id).toBe('string');
        expect(quest.id).toMatch(/^[0-9a-f-]{36}$/);
        expect(typeof quest.dateAdded).toBe('string');
        expect(() => new Date(quest.dateAdded)).not.toThrow();
    });

    test('calls addActiveQuests and linkQuestToBook', () => {
        const adapter = createMockStateAdapter(
            [],
            { 'b1': { title: 'Dune', author: 'Frank Herbert', cover: 'https://example.com/dune.jpg' } }
        );
        const quest = createExtraCreditForBook('b1', adapter);
        expect(adapter.addActiveQuests).toHaveBeenCalledWith([quest]);
        expect(adapter.linkQuestToBook).toHaveBeenCalledWith('b1', quest.id);
    });

    test('returns null if book not found', () => {
        const adapter = createMockStateAdapter([], {});
        expect(createExtraCreditForBook('b-missing', adapter)).toBeNull();
        expect(adapter.addActiveQuests).not.toHaveBeenCalled();
    });

    test('uses current month and year', () => {
        const adapter = createMockStateAdapter(
            [],
            { 'b1': { title: 'Dune', author: 'Frank Herbert' } }
        );
        const now = new Date();
        const expectedMonth = MONTH_NAMES[now.getMonth()];
        const expectedYear = String(now.getFullYear());

        const quest = createExtraCreditForBook('b1', adapter);
        expect(quest.month).toBe(expectedMonth);
        expect(quest.year).toBe(expectedYear);
    });
});
