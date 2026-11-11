/**
 * Book types (Plan 4, D2; schema v20). The single source of the type list.
 */
import { typeFromDerivedTags } from './bookTagRules.js';

export const BOOK_TYPES = Object.freeze(['unsorted', 'shelf', 'audiobook', 'ebook', 'library-loan', 'physical']);

/** Types the player picks when adding a book (`shelf` comes from a library link, `unsorted` from the v20 migration). */
export const PICKABLE_TYPES = Object.freeze(['audiobook', 'ebook', 'library-loan', 'physical']);

export const BOOK_TYPE_LABELS = Object.freeze({
    unsorted: 'Unsorted',
    shelf: 'On our shelf',
    audiobook: 'Audiobook',
    ebook: 'Ebook',
    'library-loan': 'Library book',
    physical: 'Physical, not in the library yet'
});

/** @param {*} type */
export function isBookType(type) {
    return typeof type === 'string' && BOOK_TYPES.includes(type);
}

/** @param {*} id */
export function hasLibraryBookId(id) {
    return typeof id === 'string' && id.trim().length > 0;
}

/**
 * The type a book has under the v20 rules. Pure: the migration and the validator both call it,
 * so a v19 save reaching v20 code by any path gets the same answer.
 * - a valid `type` is kept (a `shelf` type needs a `libraryBookId`);
 * - else a book carrying a type-derived tag (`audio`) gets that type;
 * - else it is `unsorted`.
 * @param {Object} book
 * @returns {string} one of BOOK_TYPES
 */
export function deriveBookType(book) {
    if (!book || typeof book !== 'object') return 'unsorted';
    if (isBookType(book.type) && (book.type !== 'shelf' || hasLibraryBookId(book.libraryBookId))) {
        return book.type;
    }
    const fromTags = typeFromDerivedTags(book.tags);
    if (isBookType(fromTags) && fromTags !== 'shelf') return fromTags;
    return 'unsorted';
}

/**
 * Normalize the three library fields for a book of the given type.
 * @param {string} type
 * @param {Object} book
 * @returns {{ libraryBookId: string|null, libraryTagsBase: string[]|null, shelfMatchDismissed: string|null }}
 */
export function normalizeLibraryFields(type, book) {
    const isShelf = type === 'shelf';
    const base = book && Array.isArray(book.libraryTagsBase)
        ? book.libraryTagsBase.filter((t) => typeof t === 'string')
        : [];
    return {
        libraryBookId: isShelf ? book.libraryBookId.trim() : null,
        libraryTagsBase: isShelf ? base : null,
        shelfMatchDismissed: book && hasLibraryBookId(book.shelfMatchDismissed) ? book.shelfMatchDismissed : null
    };
}
