// Word-based search, the same rule as the household library app's search-words.ts: every search
// word must appear in the book's text, in any order, with "the", "a" and "an" dropped and one typo
// tolerated per word of four or more letters. Pure functions, no DOM, no storage.
import { baseNormalize, trigramSimilarity } from './bookMatching.js';

const STOPWORDS = new Set(['the', 'a', 'an']);

// Trigram similarity a typo'd search word needs with some word in the book. Tuned in
// tests/searchWords.test.js.
export const FUZZY_THRESHOLD = 0.45;
// Shorter search words only match exactly: their few trigrams make fuzzy hits noise.
const FUZZY_MIN_LENGTH = 4;

function words(text) {
    return baseNormalize(text).split(' ').filter(Boolean);
}

/**
 * The words of a typed search: folded, split on whitespace and punctuation, without "the", "a" and
 * "an". A search of only those words keeps them, so "the" still searches for "the". Blank gives [].
 * @param {string} query
 * @returns {string[]}
 */
export function searchWords(query) {
    const all = words(query);
    const kept = all.filter((w) => !STOPWORDS.has(w));
    return kept.length > 0 ? kept : all;
}

/**
 * True when every search word appears somewhere in the fields (title, authors, edition labels), in
 * any order. A word matches as part of a longer word, so partial typing works; failing that, a word
 * of four or more letters matches a whole word in the fields whose trigram similarity reaches
 * FUZZY_THRESHOLD. No words matches everything.
 * @param {string[]} query - a searchWords() result
 * @param {string[]} fields
 * @returns {boolean}
 */
export function matchesSearchWords(query, fields) {
    if (query.length === 0) return true;
    const folded = fields.map((f) => baseNormalize(f));
    const text = folded.join('\n');
    let bookWords = null;
    return query.every((w) => {
        if (text.includes(w)) return true;
        if (w.length < FUZZY_MIN_LENGTH) return false;
        if (!bookWords) bookWords = [...new Set(folded.join(' ').split(' ').filter(Boolean))];
        return bookWords.some((b) => trigramSimilarity(w, b) >= FUZZY_THRESHOLD);
    });
}
