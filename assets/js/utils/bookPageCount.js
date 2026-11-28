/**
 * The one rule for reading a Library book's page count.
 * Books store `pageCount` (StateAdapter.addBook); older saves may hold only `pageCountRaw`.
 * Zero, negative or non-numeric values count as no page count.
 * @param {{ pageCount?: number, pageCountRaw?: number }|null} book
 * @returns {number|null} Whole page count, or null when the book has none
 */
export function getBookPageCount(book) {
    if (!book || typeof book !== 'object') return null;
    for (const value of [book.pageCount, book.pageCountRaw]) {
        if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
            return Math.floor(value);
        }
    }
    return null;
}
