// Title and author matching, ported line for line from the household library app so both apps
// score the same pair the same way. Pure functions, no DOM, no storage.

// parse.ts (libib) EDITION_RE: a trailing parenthetical containing "edition".
const EDITION_RE = /\s*\(([^)]*\bedition\b[^)]*)\)\s*$/i;

// photo/propose.ts: D6 thresholds, pinned.
export const SIMILAR_WITH_AUTHORS = 0.5;
export const SIMILAR_ANY_AUTHORS = 0.8;
export const MAX_CANDIDATES = 3;

// match-keys.ts baseNormalize: NFD, strip marks, lowercase, drop apostrophes, "&" to "and",
// non-letters/digits to spaces.
export function baseNormalize(s) {
    return String(s ?? '')
        .normalize('NFD')
        .replace(/\p{M}/gu, '')
        .toLowerCase()
        .replace(/['’‘]/g, '')
        .replace(/&/g, ' and ')
        .replace(/[^\p{L}\p{N}]+/gu, ' ')
        .trim();
}

// match-keys.ts stripEdition (private there too).
function stripEdition(title) {
    const m = EDITION_RE.exec(title);
    return m && title.slice(0, m.index).trim() ? title.slice(0, m.index) : title;
}

// match-keys.ts titleKey. '' means "nothing to match on": callers must not match on it.
export function titleKey(title) {
    const tokens = baseNormalize(stripEdition(String(title ?? ''))).split(' ').filter(Boolean);
    if (tokens.length > 1 && ['the', 'a', 'an'].includes(tokens[0])) tokens.shift();
    return tokens.join(' ');
}

// match-keys.ts baseTitleKey: titleKey of the text before the first ":" or " - ".
export function baseTitleKey(title) {
    const t = String(title ?? '');
    const i = t.search(/:| - /);
    return titleKey(i === -1 ? t : t.slice(0, i));
}

// match-keys.ts isLetter.
const isLetter = (t) => [...t].length === 1 && /\p{L}/u.test(t);

// match-keys.ts authorKey: runs of single-letter tokens (initials) are joined.
export function authorKey(name) {
    const out = [];
    let prevInitial = false;
    for (const token of baseNormalize(name).split(' ').filter(Boolean)) {
        const initial = isLetter(token);
        if (initial && prevInitial) out[out.length - 1] += token;
        else out.push(token);
        prevInitial = initial;
    }
    return out.join(' ');
}

// match-keys.ts authorsOverlap: true when both lists are empty, or any non-empty key is shared.
export function authorsOverlap(a, b) {
    if (a.length === 0 && b.length === 0) return true;
    const keys = new Set(a.map(authorKey).filter(Boolean));
    return b.map(authorKey).some((k) => k !== '' && keys.has(k));
}

// photo/similarity.ts trigrams: pg_trgm style, two leading spaces and one trailing space.
function trigrams(s) {
    const out = new Set();
    for (const word of s.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean)) {
        const padded = `  ${word} `;
        for (let i = 0; i + 3 <= padded.length; i++) out.add(padded.slice(i, i + 3));
    }
    return out;
}

// photo/similarity.ts trigramSimilarity: |A∩B| / |A∪B|, 0 when either side has none.
export function trigramSimilarity(a, b) {
    const ta = trigrams(a);
    const tb = trigrams(b);
    if (ta.size === 0 || tb.size === 0) return 0;
    let shared = 0;
    for (const t of ta) if (tb.has(t)) shared++;
    return shared / (ta.size + tb.size - shared);
}

// normalize.ts NAME_SUFFIXES / isSuffix / joinNameSuffixes: a suffix-only token joins the
// previous token with ", "; a leading suffix stays a name.
const NAME_SUFFIXES = new Set(['jr', 'sr', 'ii', 'iii', 'iv', 'phd', 'md']);
const isSuffix = (token) => NAME_SUFFIXES.has(token.replace(/\./g, '').trim().toLowerCase());

function joinNameSuffixes(tokens) {
    const out = [];
    for (const token of tokens) {
        if (out.length > 0 && isSuffix(token)) out[out.length - 1] += `, ${token}`;
        else out.push(token);
    }
    return out;
}

// New in ToS (D8; no TS source): ToS keeps one author string. Split on ";", " & " and " and "
// first, then on ","; a part of exactly two pieces, "Surname, First" (one word, then one or two
// words or initials that are not a suffix), becomes "First Surname"; other pieces go through
// joinNameSuffixes.
export function splitAuthorString(author) {
    const names = [];
    for (const part of String(author ?? '').split(/;|\s&\s|\s+and\s+/i)) {
        const pieces = part.split(',').map((p) => p.trim()).filter(Boolean);
        if (pieces.length === 2) {
            const [first, second] = pieces;
            if (!/\s/.test(first) && second.split(/\s+/).length <= 2 && !isSuffix(second)) {
                names.push(`${second} ${first}`);
                continue;
            }
        }
        names.push(...joinNameSuffixes(pieces));
    }
    return names;
}

// photo/propose.ts classify, minus the ISBN branch (ToS books carry no ISBN here).
// tosBook: {title, author}; libraryBook: {title, authors}.
export function classifyLibraryMatch(tosBook, libraryBook) {
    const qTitle = tosBook?.title ?? '';
    const qAuthors = splitAuthorString(tosBook?.author);
    const qKey = titleKey(qTitle);
    if (qKey === '') return null;
    const bKey = titleKey(libraryBook.title);
    if (bKey === '') return null;
    const overlap = authorsOverlap(qAuthors, libraryBook.authors || []);
    if (bKey === qKey && overlap) return { reason: 'same_title', score: 1 };
    const score = trigramSimilarity(qKey, bKey);
    const base = baseTitleKey(qTitle);
    if (base !== '' && base === baseTitleKey(libraryBook.title) && bKey !== qKey && overlap) {
        return { reason: 'series_sibling', score };
    }
    const authorsOk = overlap || qAuthors.length === 0;
    if ((score >= SIMILAR_WITH_AUTHORS && authorsOk) || score >= SIMILAR_ANY_AUTHORS) {
        return { reason: 'similar_title', score };
    }
    return null;
}

// New in ToS (D8; no TS source): strong = same_title with a non-empty ToS author. This
// deliberately differs from the library, where an authorless pair with equal titles is
// same_title. Everything else is weak, best score first, capped at MAX_CANDIDATES.
export function matchToLibrary(tosBook, libraryBooks) {
    const hasAuthor = splitAuthorString(tosBook?.author).length > 0;
    const strong = [];
    const weak = [];
    for (const book of libraryBooks || []) {
        const c = classifyLibraryMatch(tosBook, book);
        if (!c) continue;
        if (c.reason === 'same_title' && hasAuthor) strong.push(book);
        else weak.push({ book, reason: c.reason === 'same_title' ? 'similar_title' : c.reason, score: c.score });
    }
    weak.sort((a, b) => b.score - a.score);
    return { strong, weak: weak.slice(0, MAX_CANDIDATES) };
}
