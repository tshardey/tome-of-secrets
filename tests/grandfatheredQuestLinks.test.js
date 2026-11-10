/**
 * @jest-environment jsdom
 *
 * Books linked to two quests before one book, one quest (schema v18) are grandfathered:
 * both quests pay the full questBase. Only second links made under the rule pay secondaryQuestBase.
 */

import { migrateState, ONE_BOOK_ONE_QUEST_SINCE } from '../assets/js/character-sheet/dataMigrator.js';
import { validateCharacterState } from '../assets/js/character-sheet/dataValidator.js';
import { StateAdapter } from '../assets/js/character-sheet/stateAdapter.js';
import { STORAGE_KEYS, createEmptyCharacterState } from '../assets/js/character-sheet/storageKeys.js';
import { RewardCalculator } from '../assets/js/services/RewardCalculator.js';
import { grandfatherBookLinks, isSecondaryQuestInBatch } from '../assets/js/utils/questLinkRules.js';

const BEFORE_RULE = '2026-10-01T00:00:00.000Z';
const AFTER_RULE = '2026-11-11T00:00:00.000Z';

function quest(id, bookId, dateAdded = BEFORE_RULE) {
    return { id, type: '⭐ Extra Credit', prompt: '', bookId, book: 'Shared Book', month: 'November', year: '2026', dateAdded };
}

function book(id, questIds) {
    return {
        id, title: `Book ${id}`, author: 'A. Author', cover: null, pageCount: 300, status: 'reading',
        shelfCategory: 'general', dateAdded: BEFORE_RULE, dateCompleted: null,
        links: { questIds, curriculumPromptIds: [] }, tags: []
    };
}

function save({ books, active = [], completed = [] }) {
    return validateCharacterState({
        ...createEmptyCharacterState(),
        [STORAGE_KEYS.BOOKS]: books,
        [STORAGE_KEYS.ACTIVE_ASSIGNMENTS]: active,
        [STORAGE_KEYS.COMPLETED_QUESTS]: completed
    });
}

function payout(adapter, q) {
    return RewardCalculator.calculateFinalRewards(q.type, q.prompt, { quest: q, stateAdapter: adapter }).dollars;
}

describe('grandfathered quest links', () => {
    beforeEach(() => localStorage.clear());

    test('a legacy two-quest book migrated from v17 pays $15 + $15', () => {
        const q1 = quest('q1', 'b1');
        const q2 = quest('q2', 'b1');
        const migrated = migrateState(save({ books: { b1: book('b1', ['q1', 'q2']) }, active: [q1, q2] }), { fromVersion: 17 });

        expect(migrated[STORAGE_KEYS.BOOKS].b1.links.grandfatheredQuestIds).toEqual(['q1', 'q2']);
        const adapter = new StateAdapter(validateCharacterState(migrated));
        expect(adapter.isSecondaryQuestForBook('b1', 'q2')).toBe(false);
        expect(payout(adapter, q1)).toBe(15);
        expect(payout(adapter, q2)).toBe(15);
    });

    test('a new ability-granted pair pays $15 + $10', () => {
        const migrated = migrateState(save({
            books: { b1: book('b1', ['q1', 'q2']), b2: book('b2', []) },
            active: [quest('q1', 'b1'), quest('q2', 'b1'), quest('q3', 'b2', AFTER_RULE), quest('q4', 'b2', AFTER_RULE)]
        }), { fromVersion: 17 });
        const adapter = new StateAdapter(validateCharacterState(migrated));
        adapter.addLearnedAbility('Quick Shot');

        expect(adapter.linkQuestToBook('b2', 'q3')).toBe(true);
        expect(adapter.linkQuestToBook('b2', 'q4')).toBe(true);
        expect(adapter.getBook('b2').links.grandfatheredQuestIds).toBeUndefined();
        expect(payout(adapter, quest('q3', 'b2', AFTER_RULE))).toBe(15);
        expect(payout(adapter, quest('q4', 'b2', AFTER_RULE))).toBe(10);
    });

    test('a save already at v18 grandfathers links to quests added before the rule (or undated)', () => {
        const migrated = migrateState(save({
            books: { legacy: book('legacy', ['old1', 'old2']), mixed: book('mixed', ['old3', 'new1']) },
            active: [quest('old2', 'legacy', null), quest('old3', 'mixed'), quest('new1', 'mixed', AFTER_RULE)],
            completed: [{ ...quest('old1', 'legacy'), dateCompleted: BEFORE_RULE }]
        }), { fromVersion: 18 });
        const adapter = new StateAdapter(validateCharacterState(migrated));

        expect(adapter.isSecondaryQuestForBook('legacy', 'old2')).toBe(false);
        expect(payout(adapter, quest('old2', 'legacy', null))).toBe(15);
        // A second link made after the rule went live is still the ability-granted secondary quest
        expect(adapter.isSecondaryQuestForBook('mixed', 'new1')).toBe(true);
        expect(payout(adapter, quest('new1', 'mixed', AFTER_RULE))).toBe(10);
    });

    test('a second quest on a duplicate library entry pays $10 (the older entry\'s quest keeps $15)', () => {
        const adapter = new StateAdapter(save({
            books: {
                a: { ...book('a', ['q1']), title: 'Dune', author: 'Frank Herbert', dateAdded: BEFORE_RULE },
                b: { ...book('b', []), title: ' dune ', author: '', dateAdded: AFTER_RULE }
            },
            active: [quest('q1', 'a', AFTER_RULE), quest('q2', 'b', AFTER_RULE)]
        }));
        adapter.addLearnedAbility('Quick Shot');
        expect(adapter.linkQuestToBook('b', 'q2')).toBe(true);

        expect(adapter.isSecondaryQuestForBook('b', 'q2')).toBe(true);
        expect(adapter.isSecondaryQuestForBook('a', 'q1')).toBe(false);
        expect(payout(adapter, quest('q2', 'b', AFTER_RULE))).toBe(10);
        expect(payout(adapter, quest('q1', 'a', AFTER_RULE))).toBe(15);
    });

    test('across entries the later quest is the secondary one, whichever entry was added first', () => {
        const q1 = { ...quest('q1', 'b', '2026-11-12T00:00:00.000Z'), dateCompleted: '2026-11-13T00:00:00.000Z' };
        const adapter = new StateAdapter(save({
            books: {
                a: { ...book('a', []), title: 'Dune', author: 'Frank Herbert', dateAdded: '2026-01-01T00:00:00.000Z' },
                b: { ...book('b', ['q1']), title: 'Dune', author: 'Frank Herbert', dateAdded: '2026-03-01T00:00:00.000Z' }
            },
            active: [quest('q2', 'a', '2026-11-20T00:00:00.000Z')],
            completed: [q1]
        }));
        adapter.addLearnedAbility('Quick Shot');
        expect(adapter.linkQuestToBook('a', 'q2')).toBe(true);
        expect(adapter.isSecondaryQuestForBook('a', 'q2')).toBe(true);
        expect(adapter.isSecondaryQuestForBook('b', 'q1')).toBe(false);
        expect(payout(adapter, quest('q2', 'a', '2026-11-20T00:00:00.000Z'))).toBe(10);
    });

    test('a legacy pair split across duplicate entries is grandfathered: $15 + $15', () => {
        const q1 = quest('q1', 'a');
        const q2 = quest('q2', 'b');
        const migrated = migrateState(save({
            books: {
                a: { ...book('a', ['q1']), title: 'Dune', author: 'Frank Herbert' },
                b: { ...book('b', ['q2']), title: 'Dune', author: 'Frank Herbert' },
                solo: { ...book('solo', ['q3']), title: 'Emma', author: 'Jane Austen' }
            },
            active: [q1, q2, quest('q3', 'solo')]
        }), { fromVersion: 18 });
        expect(migrated[STORAGE_KEYS.BOOKS].a.links.grandfatheredQuestIds).toEqual(['q1']);
        expect(migrated[STORAGE_KEYS.BOOKS].b.links.grandfatheredQuestIds).toEqual(['q2']);
        expect(migrated[STORAGE_KEYS.BOOKS].solo.links.grandfatheredQuestIds).toBeUndefined();

        const adapter = new StateAdapter(validateCharacterState(migrated));
        expect(payout(adapter, q1)).toBe(15);
        expect(payout(adapter, q2)).toBe(15);
    });

    test('the cutoff is when one book, one quest went live', () => {
        expect(Date.parse(ONE_BOOK_ONE_QUEST_SINCE)).toBeLessThan(Date.parse(AFTER_RULE));
        expect(Date.parse(ONE_BOOK_ONE_QUEST_SINCE)).toBeGreaterThan(Date.parse(BEFORE_RULE));
    });

    test('marking is idempotent and leaves single-link books untouched', () => {
        const pair = book('b1', ['q1', 'q2']);
        const once = grandfatherBookLinks(pair);
        expect(grandfatherBookLinks(once)).toBe(once);
        const single = book('b2', ['q1']);
        expect(grandfatherBookLinks(single)).toBe(single);

        const migrated = migrateState(save({ books: { b1: pair }, active: [quest('q1', 'b1'), quest('q2', 'b1')] }), { fromVersion: 17 });
        const again = migrateState(migrated, { fromVersion: 18 });
        expect(again[STORAGE_KEYS.BOOKS].b1.links.grandfatheredQuestIds).toEqual(['q1', 'q2']);
    });

    test('validation and link edits keep the marker', () => {
        const marked = { ...book('b1', ['q1', 'q2']), links: { questIds: ['q1', 'q2'], curriculumPromptIds: [], grandfatheredQuestIds: ['q1', 'q2'] } };
        const state = save({ books: { b1: marked }, active: [quest('q1', 'b1'), quest('q2', 'b1'), quest('q3', 'b1')] });
        expect(state[STORAGE_KEYS.BOOKS].b1.links.grandfatheredQuestIds).toEqual(['q1', 'q2']);

        const adapter = new StateAdapter(state);
        adapter.unlinkQuestFromBook('b1', 'q1');
        expect(adapter.getBook('b1').links.grandfatheredQuestIds).toEqual(['q1', 'q2']);
        expect(adapter.isSecondaryQuestForBook('b1', 'q2')).toBe(false);
    });

    test('the batch verdict honours the marker for a stored link', () => {
        const marked = { links: { questIds: ['q1', 'q2'], grandfatheredQuestIds: ['q1', 'q2'] } };
        expect(isSecondaryQuestInBatch(marked, 'q2')).toBe(false);
        expect(isSecondaryQuestInBatch({ links: { questIds: ['q1', 'q2'] } }, 'q2')).toBe(true);
    });
});
