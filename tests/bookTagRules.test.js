/**
 * Effective tags and tag scope (Plan 4, D3).
 *
 * Unit tests run on a fixture tag list (never the real reader-scoped ids, which are a
 * data-only edit to bookTags.json). The equivalence test runs on the real list.
 */
let mockFixtureTags = null;

jest.mock('../assets/js/character-sheet/data.js', () => {
    const actual = jest.requireActual('../assets/js/character-sheet/data.js');
    return {
        ...actual,
        get bookTags() {
            return mockFixtureTags || actual.bookTags;
        }
    };
});

import * as data from '../assets/js/character-sheet/data.js';
import { STORAGE_KEYS } from '../assets/js/character-sheet/storageKeys.js';
import { migrateState } from '../assets/js/character-sheet/dataMigrator.js';
import { validateCharacterState, resetSchemaWriteGateForTests } from '../assets/js/character-sheet/dataValidator.js';
import {
    effectiveBookTags,
    isTypeDerivedTag,
    isSharedTag,
    sharedTags,
    readerTags
} from '../assets/js/utils/bookTagRules.js';

const FIXTURE_TAGS = [
    { id: 'shared-a', label: 'Shared A', category: 'genre' },
    { id: 'shared-b', label: 'Shared B', category: 'theme' },
    { id: 'reader-a', label: 'Reader A', category: 'source', scope: 'reader' },
    { id: 'derived-a', label: 'Derived A', category: 'format', derivedFromType: 'audiobook' }
];

describe('bookTagRules on a fixture tag list', () => {
    beforeEach(() => { mockFixtureTags = FIXTURE_TAGS; });
    afterEach(() => { mockFixtureTags = null; });

    it('adds the ids derived from the book type', () => {
        const tags = effectiveBookTags({ type: 'audiobook', tags: ['shared-a'] });
        expect(new Set(tags)).toEqual(new Set(['shared-a', 'derived-a']));
        expect(tags).toHaveLength(2);
    });

    it('an ebook adds nothing', () => {
        expect(effectiveBookTags({ type: 'ebook', tags: ['shared-a', 'reader-a'] })).toEqual(['shared-a', 'reader-a']);
    });

    it('does not duplicate a derived id already stored', () => {
        expect(effectiveBookTags({ type: 'audiobook', tags: ['derived-a'] })).toEqual(['derived-a']);
    });

    it('copes with a missing book or missing tags', () => {
        expect(effectiveBookTags(null)).toEqual([]);
        expect(effectiveBookTags({ type: 'audiobook' })).toEqual(['derived-a']);
    });

    it('classifies shared, reader and type-derived ids by data alone', () => {
        expect(sharedTags(['shared-a', 'reader-a', 'derived-a'])).toEqual(['shared-a']);
        expect(readerTags(['shared-a', 'reader-a', 'derived-a'])).toEqual(['reader-a']);
        expect(isTypeDerivedTag('derived-a')).toBe(true);
        expect(isTypeDerivedTag('shared-a')).toBe(false);
        expect(isSharedTag('shared-b')).toBe(true);
        expect(isSharedTag('reader-a')).toBe(false);
        expect(isSharedTag('derived-a')).toBe(false);
        expect(isSharedTag('not-a-tag')).toBe(false);
    });
});

describe('bookTagRules on the real bookTags.json', () => {
    beforeEach(() => {
        mockFixtureTags = null;
        localStorage.clear();
        resetSchemaWriteGateForTests();
    });

    it('audiobooks carry the audio tag in their effective tags', () => {
        const tags = effectiveBookTags({ type: 'audiobook', tags: ['fantasy'] });
        expect(new Set(tags)).toEqual(new Set(['fantasy', 'audio']));
    });

    it('equivalence (D3): effective tags after migration equal the v19 tags for every book', () => {
        const allIds = data.bookTags.map((t) => t.id);
        expect(allIds.length).toBeGreaterThan(10);
        const derivedIds = data.bookTags.filter((t) => t.derivedFromType).map((t) => t.id);
        expect(derivedIds.length).toBeGreaterThan(0);

        // Every tag alone, every tag with each derived tag, one book with every tag, one with none
        const v19Books = {};
        const add = (tags) => {
            const id = `b-${Object.keys(v19Books).length}`;
            v19Books[id] = {
                id, title: 'Glass Orchard', author: 'Member B', status: 'reading', shelfCategory: 'general',
                dateAdded: '2026-01-01T00:00:00.000Z', dateCompleted: null,
                links: { questIds: [], curriculumPromptIds: [] }, tags
            };
        };
        allIds.forEach((tagId) => {
            add([tagId]);
            derivedIds.forEach((derived) => { if (derived !== tagId) add([tagId, derived]); });
        });
        add([...allIds]);
        add([]);

        const migrated = validateCharacterState(
            migrateState({ [STORAGE_KEYS.BOOKS]: JSON.parse(JSON.stringify(v19Books)) }, { fromVersion: 19 })
        )[STORAGE_KEYS.BOOKS];

        for (const [id, v19Book] of Object.entries(v19Books)) {
            const after = migrated[id];
            expect(new Set(effectiveBookTags(after))).toEqual(new Set(v19Book.tags));
            // No type-derived id is ever stored
            after.tags.forEach((t) => expect(isTypeDerivedTag(t)).toBe(false));
        }
    });
});
