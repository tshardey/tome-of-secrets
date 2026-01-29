/**
 * @jest-environment jsdom
 */
import { safeSetJSON } from '../assets/js/utils/storage.js';
import { setStateKey, LARGE_STATE_KEYS } from '../assets/js/character-sheet/persistence.js';
import { STORAGE_KEYS } from '../assets/js/character-sheet/storageKeys.js';

describe('Event Emission', () => {
    beforeEach(() => {
        localStorage.clear();
        jest.clearAllMocks();
    });

    describe('safeSetJSON event emission', () => {
        it('should emit tos:localStateChanged for cloud-synced keys', () => {
            const eventListener = jest.fn();
            window.addEventListener('tos:localStateChanged', eventListener);

            safeSetJSON(STORAGE_KEYS.CHARACTER_SHEET_FORM, { keeperName: 'Test' });

            expect(eventListener).toHaveBeenCalledTimes(1);
            expect(eventListener).toHaveBeenCalledWith(
                expect.objectContaining({
                    detail: { source: 'localStorage', key: STORAGE_KEYS.CHARACTER_SHEET_FORM }
                })
            );

            window.removeEventListener('tos:localStateChanged', eventListener);
        });

        it('should emit tos:localStateChanged for monthlyCompletedBooks', () => {
            const eventListener = jest.fn();
            window.addEventListener('tos:localStateChanged', eventListener);

            safeSetJSON(STORAGE_KEYS.MONTHLY_COMPLETED_BOOKS, ['Book 1', 'Book 2']);

            expect(eventListener).toHaveBeenCalledTimes(1);
            expect(eventListener).toHaveBeenCalledWith(
                expect.objectContaining({
                    detail: { source: 'localStorage', key: STORAGE_KEYS.MONTHLY_COMPLETED_BOOKS }
                })
            );

            window.removeEventListener('tos:localStateChanged', eventListener);
        });

        it('should NOT emit for non-cloud-synced keys', () => {
            const eventListener = jest.fn();
            window.addEventListener('tos:localStateChanged', eventListener);

            // Set a key that's not in the allowlist (e.g., a UI-only key)
            safeSetJSON('someUIOnlyKey', { some: 'data' });

            expect(eventListener).not.toHaveBeenCalled();

            window.removeEventListener('tos:localStateChanged', eventListener);
        });

        it('should NOT emit when suppressEvents is true', () => {
            const eventListener = jest.fn();
            window.addEventListener('tos:localStateChanged', eventListener);

            safeSetJSON(STORAGE_KEYS.CHARACTER_SHEET_FORM, { keeperName: 'Test' }, true);

            expect(eventListener).not.toHaveBeenCalled();

            window.removeEventListener('tos:localStateChanged', eventListener);
        });

        it('should still save data even when suppressEvents is true', () => {
            const eventListener = jest.fn();
            window.addEventListener('tos:localStateChanged', eventListener);

            const data = { keeperName: 'Test' };
            const result = safeSetJSON(STORAGE_KEYS.CHARACTER_SHEET_FORM, data, true);

            expect(result).toBe(true);
            expect(JSON.parse(localStorage.getItem(STORAGE_KEYS.CHARACTER_SHEET_FORM))).toEqual(data);
            expect(eventListener).not.toHaveBeenCalled();

            window.removeEventListener('tos:localStateChanged', eventListener);
        });
    });

    describe('setStateKey event emission', () => {
        it('should emit via safeSetJSON for non-large keys (localStorage fallback)', async () => {
            const eventListener = jest.fn();
            window.addEventListener('tos:localStateChanged', eventListener);

            // Use a non-large key (stored in localStorage)
            const smallKey = STORAGE_KEYS.SELECTED_GENRES;
            expect(LARGE_STATE_KEYS.has(smallKey)).toBe(false);

            // Mock IndexedDB as unavailable to force localStorage fallback
            const originalIndexedDB = global.indexedDB;
            global.indexedDB = undefined;

            await setStateKey(smallKey, ['Fantasy', 'Mystery']);

            expect(eventListener).toHaveBeenCalledTimes(1);
            expect(eventListener).toHaveBeenCalledWith(
                expect.objectContaining({
                    detail: { source: 'localStorage', key: smallKey }
                })
            );

            // Restore IndexedDB
            global.indexedDB = originalIndexedDB;
            window.removeEventListener('tos:localStateChanged', eventListener);
        });

        it('should NOT emit when suppressEvents is true for localStorage writes', async () => {
            const eventListener = jest.fn();
            window.addEventListener('tos:localStateChanged', eventListener);

            const smallKey = STORAGE_KEYS.SELECTED_GENRES;
            const originalIndexedDB = global.indexedDB;
            global.indexedDB = undefined;

            await setStateKey(smallKey, ['Fantasy', 'Mystery'], true);

            expect(eventListener).not.toHaveBeenCalled();

            global.indexedDB = originalIndexedDB;
            window.removeEventListener('tos:localStateChanged', eventListener);
        });
    });
});

