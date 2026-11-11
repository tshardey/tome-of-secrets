import {
    SIMILAR_WITH_AUTHORS, SIMILAR_ANY_AUTHORS, MAX_CANDIDATES, titleKey, baseTitleKey, authorKey,
    authorsOverlap, trigramSimilarity, splitAuthorString, classifyLibraryMatch, matchToLibrary
} from '../assets/js/utils/bookMatching.js';

// Vectors in the first five describes are copied from the library app's
// match-keys.test.ts and similarity.test.ts.
describe('titleKey', () => {
    it('strips the edition parenthetical and leading article', () => {
        expect(titleKey('The Glass Orchard (Deluxe Limited Edition)')).toBe(titleKey('glass orchard'));
    });
    it('ignores apostrophe style', () => {
        expect(titleKey("Moon's Tide")).toBe(titleKey('Moon’s Tide'));
    });
    it('treats & as and', () => {
        expect(titleKey('Salt & Ember')).toBe(titleKey('Salt and Ember'));
    });
    it('strips accents', () => {
        expect(titleKey('Poète')).toBe(titleKey('Poete'));
    });
    it('keeps non-edition parentheticals', () => {
        expect(titleKey('The Glass Orchard (Original)')).not.toBe(titleKey('The Glass Orchard'));
    });
    it('handles Cyrillic and CJK', () => {
        expect(titleKey('Стеклянный сад')).not.toBe('');
        expect(titleKey('Стеклянный сад')).toBe(titleKey('СТЕКЛЯННЫЙ САД'));
        expect(titleKey('Стеклянный сад')).not.toBe(titleKey('Соляная дорога'));
        expect(titleKey('硝子の果樹園')).not.toBe('');
        expect(titleKey('硝子の果樹園')).not.toBe(titleKey('塩の道'));
    });
    it('gives an empty key for punctuation only', () => {
        expect(titleKey('!!!')).toBe('');
    });
});

describe('baseTitleKey', () => {
    it('uses the text before the first colon', () => {
        expect(baseTitleKey('Ember Road: Book 2')).toBe(baseTitleKey('Ember Road: Book 3'));
    });
    it('uses the text before the first spaced dash', () => {
        expect(baseTitleKey('Ember Road - Book 2')).toBe(baseTitleKey('Ember Road'));
    });
    it('is empty when nothing precedes the separator', () => {
        expect(baseTitleKey(': Book 2')).toBe('');
    });
});

describe('authorKey', () => {
    it('joins initials in every style', () => {
        const k = authorKey('J. K. Vale');
        expect(k).toBe('jk vale');
        expect(authorKey('J K Vale')).toBe(k);
        expect(authorKey('JK Vale')).toBe(k);
    });
    it('handles non-Latin names', () => {
        expect(authorKey('波多野 蓮')).not.toBe('');
    });
});

describe('authorsOverlap', () => {
    it('matches on a shared key', () => {
        expect(authorsOverlap(['A B'], ['C D', 'a b'])).toBe(true);
    });
    it('is false when only one side is empty', () => {
        expect(authorsOverlap(['A B'], [])).toBe(false);
    });
    it('is true when both are empty', () => {
        expect(authorsOverlap([], [])).toBe(true);
    });
    it('ignores empty keys', () => {
        expect(authorsOverlap(['!!!'], ['!!!'])).toBe(false);
        expect(authorsOverlap(['!!!'], [])).toBe(false);
    });
});

describe('trigramSimilarity', () => {
    it('is 1 for equal keys and 0 when either is empty', () => {
        expect(trigramSimilarity('glass orchard', 'glass orchard')).toBe(1);
        expect(trigramSimilarity('', 'x')).toBe(0);
        expect(trigramSimilarity('x', '')).toBe(0);
    });
    it('scores near-misses high and unrelated titles low', () => {
        expect(trigramSimilarity('glass orchard', 'glass orchards')).toBeGreaterThanOrEqual(0.8);
        expect(trigramSimilarity('glass orchard', 'glass orhcard')).toBeGreaterThanOrEqual(0.5);
        expect(trigramSimilarity('glass orchard', 'salt road')).toBeLessThan(0.2);
    });
    it('is symmetric', () => {
        expect(trigramSimilarity('glass orchard', 'glass orhcard')).toBe(
            trigramSimilarity('glass orhcard', 'glass orchard')
        );
    });
});

describe('thresholds', () => {
    it('are pinned', () => {
        expect([SIMILAR_WITH_AUTHORS, SIMILAR_ANY_AUTHORS, MAX_CANDIDATES]).toEqual([0.5, 0.8, 3]);
    });
    it('0.5 with overlapping authors is similar_title; just below is null', () => {
        const lib = (title) => ({ title, authors: ['A. Writer'] });
        expect(trigramSimilarity('glass', 'glasp')).toBe(0.5);
        expect(classifyLibraryMatch({ title: 'Glass', author: 'A. Writer' }, lib('Glasp')))
            .toEqual({ reason: 'similar_title', score: 0.5 });
        expect(trigramSimilarity('salt', 'sale')).toBeLessThan(0.5);
        expect(classifyLibraryMatch({ title: 'Salt', author: 'A. Writer' }, lib('Sale'))).toBeNull();
    });
    it('0.8 with disjoint authors is similar_title; just below is null', () => {
        const lib = (title) => ({ title, authors: ['B. Other'] });
        expect(trigramSimilarity('glass orchard', 'glass orchar')).toBe(0.8);
        expect(classifyLibraryMatch({ title: 'Glass Orchard', author: 'A. Writer' }, lib('Glass Orchar')))
            .toEqual({ reason: 'similar_title', score: 0.8 });
        expect(trigramSimilarity('ember road', 'ember roads')).toBeLessThan(0.8);
        expect(classifyLibraryMatch({ title: 'Ember Road', author: 'A. Writer' }, lib('Ember Roads'))).toBeNull();
    });
});

describe('splitAuthorString', () => {
    it('splits on & and "and"', () => {
        expect(splitAuthorString('A. Writer & B. Other')).toEqual(['A. Writer', 'B. Other']);
        expect(splitAuthorString('A. Writer and B. Other')).toEqual(['A. Writer', 'B. Other']);
        expect(splitAuthorString('A. Writer; B. Other')).toEqual(['A. Writer', 'B. Other']);
    });
    it('keeps a name suffix with its name', () => {
        expect(splitAuthorString('Writer, Jr.')).toEqual(['Writer, Jr.']);
    });
    it('turns "Surname, First" into "First Surname"', () => {
        expect(splitAuthorString('Writer, Ada')).toEqual(['Ada Writer']);
        expect(splitAuthorString('Writer, A. B.')).toEqual(['A. B. Writer']);
    });
    it('splits a comma list of full names', () => {
        expect(splitAuthorString('Ada Writer, Ben Other')).toEqual(['Ada Writer', 'Ben Other']);
    });
    it('is empty for an empty string', () => {
        expect(splitAuthorString('')).toEqual([]);
        expect(splitAuthorString(undefined)).toEqual([]);
    });
});

describe('matchToLibrary', () => {
    const salt = { id: 'l1', title: 'Salt Road', authors: ['A. Writer'] };

    it('an edition-stripped same title with an overlapping author is strong', () => {
        const r = matchToLibrary({ title: 'The Salt Road (Anniversary Edition)', author: 'A. Writer' }, [salt]);
        expect(r.strong).toEqual([salt]);
        expect(r.weak).toEqual([]);
    });
    it('"Surname, First" is a strong match for the library author', () => {
        const lib = { id: 'l2', title: 'Glass Orchard', authors: ['Ada Writer'] };
        expect(matchToLibrary({ title: 'Glass Orchard', author: 'Writer, Ada' }, [lib]).strong).toEqual([lib]);
    });
    it('a series sibling is weak, never strong', () => {
        const one = { id: 'l3', title: 'Salt Road: Book One', authors: ['A. Writer'] };
        const r = matchToLibrary({ title: 'Salt Road: Book Two', author: 'A. Writer' }, [one]);
        expect(r.strong).toEqual([]);
        expect(r.weak).toHaveLength(1);
        expect(r.weak[0].book).toBe(one);
        expect(r.weak[0].reason).toBe('series_sibling');
    });
    it('a ToS book without an author is weak against a same-title book', () => {
        const r = matchToLibrary({ title: 'Salt Road', author: '' }, [salt]);
        expect(r.strong).toEqual([]);
        expect(r.weak.map((w) => w.reason)).toEqual(['similar_title']);
    });
    it('D8 deviation: authorless on both sides is weak similar_title, score 1', () => {
        expect(authorsOverlap([], [])).toBe(true);
        const lib = { id: 'l4', title: 'Salt Road', authors: [] };
        const r = matchToLibrary({ title: 'Salt Road', author: '' }, [lib]);
        expect(r.strong).toEqual([]);
        expect(r.weak).toEqual([{ book: lib, reason: 'similar_title', score: 1 }]);
    });
    it('returns two equal strong matches', () => {
        const twin = { ...salt, id: 'l5' };
        expect(matchToLibrary({ title: 'Salt Road', author: 'A. Writer' }, [salt, twin]).strong).toEqual([salt, twin]);
    });
    it('sorts weak by score descending and caps at 3', () => {
        const mk = (id, title) => ({ id, title, authors: ['A. Writer'] });
        const books = [
            mk('a', 'Glass Orchar'), mk('b', 'Glass Orchards'), mk('c', 'Glass Orchardsx'),
            mk('d', 'Glass Orchard Tales'), mk('e', 'Glass Orcharde')
        ];
        const r = matchToLibrary({ title: 'Glass Orchard', author: 'A. Writer' }, books);
        expect(r.weak).toHaveLength(3);
        const scores = r.weak.map((w) => w.score);
        expect(scores).toEqual([...scores].sort((x, y) => y - x));
    });
});
