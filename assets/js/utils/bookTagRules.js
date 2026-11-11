/**
 * Book tag rules (Plan 4, D3): the one place that knows what a tag means.
 *
 * Everything here reads the tag data (`bookTags.json`), never a hard-coded id list:
 * - `derivedFromType: "<type>"` marks a tag that comes from the book type (e.g. Audio from
 *   `audiobook`). It is never stored on a book; `effectiveBookTags` adds it.
 * - `scope: "reader"` marks a tag about the reading or the reader, not the book. It stays on
 *   the player's own record and is never shared with the library.
 * - Every other known tag is shared.
 */
import { bookTags } from '../character-sheet/data.js';

function tagDefinitions() {
    return Array.isArray(bookTags) ? bookTags : [];
}

function findTag(id) {
    if (typeof id !== 'string') return null;
    return tagDefinitions().find((tag) => tag && tag.id === id) || null;
}

/**
 * Tag ids derived from a book type.
 * @param {string} type
 * @returns {string[]}
 */
export function derivedTagIdsForType(type) {
    if (typeof type !== 'string' || !type) return [];
    return tagDefinitions()
        .filter((tag) => tag && tag.derivedFromType === type)
        .map((tag) => tag.id);
}

/**
 * The book type implied by a stored type-derived tag (pre-v20 data stored `audio` as a tag).
 * @param {string[]} tags
 * @returns {string|null}
 */
export function typeFromDerivedTags(tags) {
    if (!Array.isArray(tags)) return null;
    for (const id of tags) {
        const tag = findTag(id);
        if (tag && typeof tag.derivedFromType === 'string' && tag.derivedFromType) {
            return tag.derivedFromType;
        }
    }
    return null;
}

/** @param {string} id */
export function isTypeDerivedTag(id) {
    const tag = findTag(id);
    return Boolean(tag && typeof tag.derivedFromType === 'string' && tag.derivedFromType);
}

/** @param {string} id */
export function isReaderTag(id) {
    const tag = findTag(id);
    return Boolean(tag && tag.scope === 'reader' && !isTypeDerivedTag(id));
}

/**
 * Known tag, not type-derived and not reader-scoped.
 * @param {string} id
 */
export function isSharedTag(id) {
    const tag = findTag(id);
    return Boolean(tag) && !isTypeDerivedTag(id) && tag.scope !== 'reader';
}

/** @param {string[]} ids @returns {string[]} */
export function sharedTags(ids) {
    return Array.isArray(ids) ? ids.filter(isSharedTag) : [];
}

/** @param {string[]} ids @returns {string[]} */
export function readerTags(ids) {
    return Array.isArray(ids) ? ids.filter(isReaderTag) : [];
}

/**
 * Drop type-derived ids: they are never stored on a book.
 * @param {string[]} ids
 * @returns {string[]}
 */
export function withoutTypeDerivedTags(ids) {
    return Array.isArray(ids) ? ids.filter((id) => !isTypeDerivedTag(id)) : [];
}

/**
 * The tags a book is evaluated with: its stored tags plus the ids derived from its type.
 * Every reward, bonus-card or filter check on a book's tags goes through this.
 * @param {{ type?: string, tags?: string[] }|null} book
 * @returns {string[]}
 */
export function effectiveBookTags(book) {
    if (!book || typeof book !== 'object') return [];
    const stored = Array.isArray(book.tags) ? book.tags.filter((t) => typeof t === 'string') : [];
    const result = [...stored];
    for (const id of derivedTagIdsForType(book.type)) {
        if (!result.includes(id)) result.push(id);
    }
    return result;
}
