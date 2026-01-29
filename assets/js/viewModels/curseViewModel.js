/**
 * CurseViewModel - Creates view models for curse rendering
 * 
 * Transforms state into UI-ready data structure.
 * All calculations and business logic happen here, not in UI functions.
 */

import { STORAGE_KEYS } from '../character-sheet/storageKeys.js';

/**
 * Create view model for a curse list (active or completed)
 * @param {Array} curses - Array of curse objects
 * @param {string} listType - 'Active' or 'Completed'
 * @returns {Object} View model for curse list rendering
 */
export function createCurseListViewModel(curses = [], listType = 'Active') {
    return {
        curses: curses.map((curse, index) => ({
            curse,
            index,
            listType
        })),
        count: curses.length,
        listType,
        summaryText: `${listType} Curse Penalties (${curses.length})`
    };
}

