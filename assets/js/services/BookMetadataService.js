/**
 * BookMetadataService - Dual API integration for Grimoire Gallery
 *
 * Fetches book covers and page counts via OpenLibrary (primary) and Google Books (backfill).
 * Used for live search when editing a quest and for populating completed book metadata.
 *
 * Rate limits:
 * - Google Books API: default ~100 queries per minute per user; 429 = quota exceeded.
 *   Use a minimum query length (e.g. 3 chars) and debounce (e.g. 600ms) to reduce requests.
 * - OpenLibrary: no strict published limit; very short queries may return 422.
 *
 * Google Books: https://www.googleapis.com/books/v1/volumes?q=...
 * OpenLibrary: https://openlibrary.org/search.json?q=...
 */

const GOOGLE_BOOKS_BASE = 'https://www.googleapis.com/books/v1/volumes';
const OPENLIBRARY_SEARCH = 'https://openlibrary.org/search.json';

/** Parse page count from API (handles number or string). */
function parsePageCount(v) {
    if (v == null) return null;
    const n = typeof v === 'number' ? v : parseInt(String(v), 10);
    return typeof n === 'number' && !isNaN(n) && n > 0 ? n : null;
}

/**
 * Normalized book result for UI (title, author, coverUrl, pageCount).
 * @typedef {{ id: string, title: string, authors: string[], coverUrl: string|null, pageCount: number|null, source: 'google'|'openlibrary' }} BookSearchResult
 */

/**
 * Build Google Books search query from title and optional author.
 * @param {string} query - Search query or title
 * @param {string} [author] - Optional author for intitle+inauthor search
 * @returns {string} URL-encoded query string
 */
function buildGoogleBooksQuery(query, author) {
    const q = (query || '').trim();
    const a = (author || '').trim();
    if (a) {
        return `intitle:${encodeURIComponent(q)}+inauthor:${encodeURIComponent(a)}`;
    }
    return encodeURIComponent(q);
}

/**
 * Search for books using Google Books API (primary).
 * @param {string} query - Search query (title or title + author)
 * @param {string} [author] - Optional author to narrow search
 * @param {AbortSignal} [signal] - Optional abort signal for cancellation
 * @returns {Promise<BookSearchResult[]>}
 */
export async function searchGoogleBooks(query, author, signal) {
    const q = buildGoogleBooksQuery(query, author);
    const url = `${GOOGLE_BOOKS_BASE}?q=${q}&maxResults=10`;
    const options = signal ? { signal } : {};
    const response = await fetch(url, options);
    if (!response.ok) {
        throw new Error(`Google Books API error: ${response.status}`);
    }
    const json = await response.json();
    if (!json.items || !Array.isArray(json.items)) {
        return [];
    }
    return json.items.map((item) => {
        const vol = item.volumeInfo || {};
        const title = vol.title || '';
        const authors = Array.isArray(vol.authors) ? vol.authors : vol.authors ? [vol.authors] : [];
        let coverUrl = null;
        if (vol.imageLinks) {
            coverUrl = vol.imageLinks.thumbnail || vol.imageLinks.smallThumbnail || null;
            if (coverUrl && coverUrl.startsWith('http:')) {
                coverUrl = coverUrl.replace(/^http:/, 'https:');
            }
        }
        const pageCount = parsePageCount(vol.pageCount);
        return {
            id: item.id || `google-${title}-${authors[0] || ''}`,
            title,
            authors,
            coverUrl,
            pageCount,
            source: 'google'
        };
    });
}

/**
 * Search for books using OpenLibrary API (fallback).
 * @param {string} query - Search query
 * @param {AbortSignal} [signal] - Optional abort signal for cancellation
 * @returns {Promise<BookSearchResult[]>}
 */
export async function searchOpenLibrary(query, signal) {
    const raw = (query || '').trim();
    if (raw.length < 2) return [];
    const q = encodeURIComponent(raw);
    const fields = 'key,title,author_name,cover_i,number_of_pages_median,number_of_pages';
    const url = `${OPENLIBRARY_SEARCH}?q=${q}&limit=10&fields=${fields}`;
    const options = signal ? { signal } : {};
    const response = await fetch(url, options);
    if (!response.ok) {
        throw new Error(`OpenLibrary API error: ${response.status}`);
    }
    const json = await response.json();
    const docs = json.docs;
    if (!docs || !Array.isArray(docs)) {
        return [];
    }
    return docs.slice(0, 10).map((doc, i) => {
        const title = doc.title || '';
        const authors = Array.isArray(doc.author_name) ? doc.author_name : doc.author_name ? [doc.author_name] : [];
        let coverUrl = null;
        if (doc.cover_i) {
            coverUrl = `https://covers.openlibrary.org/b/id/${doc.cover_i}-M.jpg`;
        }
        const pageCount = parsePageCount(doc.number_of_pages_median) ?? parsePageCount(doc.number_of_pages);
        return {
            id: doc.key || `openlibrary-${i}-${title}`,
            title,
            authors,
            coverUrl,
            pageCount,
            source: 'openlibrary'
        };
    });
}

/**
 * Search both APIs: OpenLibrary first (free, no key needed), then Google Books to fill
 * gaps (especially page counts). Deduplicates by title+first author when possible.
 * If OpenLibrary returns enough results, Google Books is only used to backfill
 * missing page counts on those results rather than a full search.
 * @param {string} query - Search query (title or "title author")
 * @param {string} [author] - Optional author for Google Books intitle+inauthor
 * @param {AbortSignal} [signal] - Optional abort signal
 * @returns {Promise<BookSearchResult[]>}
 */
export async function searchBooks(query, author, signal) {
    const results = [];
    const seen = new Set();

    // OpenLibrary first — free and unlimited
    try {
        const openLib = await searchOpenLibrary(query, signal);
        for (const book of openLib) {
            const key = `${(book.title || '').toLowerCase()}|${(book.authors[0] || '').toLowerCase()}`;
            if (!seen.has(key)) {
                seen.add(key);
                results.push(book);
            }
        }
    } catch (e) {
        if (e.name === 'AbortError') throw e;
    }

    // Google Books as supplement — only call if OpenLibrary had gaps or no results
    const needsBackfill = results.length === 0 ||
        results.some(r => !r.pageCount || !r.coverUrl);
    if (needsBackfill) {
        try {
            const google = await searchGoogleBooks(query, author, signal);
            for (const book of google) {
                const key = `${(book.title || '').toLowerCase()}|${(book.authors[0] || '').toLowerCase()}`;
                if (seen.has(key)) {
                    const existing = results.find(r =>
                        `${(r.title || '').toLowerCase()}|${(r.authors[0] || '').toLowerCase()}` === key
                    );
                    if (existing) {
                        if (!existing.pageCount && book.pageCount) existing.pageCount = book.pageCount;
                        if (!existing.coverUrl && book.coverUrl) existing.coverUrl = book.coverUrl;
                    }
                } else {
                    seen.add(key);
                    results.push(book);
                }
            }
        } catch (e) {
            if (e.name === 'AbortError') throw e;
        }
    }

    return results.slice(0, 15);
}
