/**
 * @jest-environment jsdom
 */
import { applySnapshot, buildLocalSnapshot } from '../assets/js/services/cloudSync.js';
import { STORAGE_KEYS, CHARACTER_STATE_KEYS } from '../assets/js/character-sheet/storageKeys.js';
import { safeGetJSON, safeSetJSON } from '../assets/js/utils/storage.js';
import { getStateKey } from '../assets/js/character-sheet/persistence.js';

describe('Cloud Sync - Loop Prevention', () => {
    beforeEach(() => {
        localStorage.clear();
        jest.clearAllMocks();
    });

    describe('applySnapshot loop prevention', () => {
        it('should not emit events when applying cloud snapshot', async () => {
            const eventListener = jest.fn();
            window.addEventListener('tos:localStateChanged', eventListener);

            const snapshot = {
                version: 1,
                updatedAt: new Date().toISOString(),
                data: {
                    formData: { keeperName: 'Cloud Keeper', level: '5' },
                    characterState: {
                        [STORAGE_KEYS.SELECTED_GENRES]: ['Fantasy', 'Mystery']
                    },
                    monthlyCompletedBooks: ['Book 1', 'Book 2']
                }
            };

            await applySnapshot(snapshot);

            // Wait for any async operations
            await Promise.resolve();

            // Events should NOT have been emitted (suppressEvents = true)
            expect(eventListener).not.toHaveBeenCalled();

            // But data should still be applied
            const formData = safeGetJSON(STORAGE_KEYS.CHARACTER_SHEET_FORM, {});
            expect(formData.keeperName).toBe('Cloud Keeper');
            expect(formData.level).toBe('5');

            const monthlyBooks = safeGetJSON(STORAGE_KEYS.MONTHLY_COMPLETED_BOOKS, []);
            expect(monthlyBooks).toEqual(['Book 1', 'Book 2']);

            const genres = await getStateKey(STORAGE_KEYS.SELECTED_GENRES, []);
            expect(genres).toEqual(['Fantasy', 'Mystery']);

            window.removeEventListener('tos:localStateChanged', eventListener);
        });

        it('should apply snapshot data correctly even with suppressEvents', async () => {
            const snapshot = {
                version: 1,
                updatedAt: new Date().toISOString(),
                data: {
                    formData: { 
                        keeperName: 'Test Keeper',
                        keeperBackground: 'Grove Tender',
                        wizardSchool: 'Divination',
                        librarySanctum: 'The Spire of Whispers',
                        inkDrops: '50',
                        paperScraps: '25'
                    },
                    characterState: {
                        [STORAGE_KEYS.SELECTED_GENRES]: ['Fantasy', 'Mystery', 'Sci-Fi'],
                        [STORAGE_KEYS.GENRE_DICE_SELECTION]: 'd8'
                    },
                    monthlyCompletedBooks: ['Book A', 'Book B', 'Book C']
                }
            };

            await applySnapshot(snapshot);

            // Verify form data
            const formData = safeGetJSON(STORAGE_KEYS.CHARACTER_SHEET_FORM, {});
            expect(formData.keeperName).toBe('Test Keeper');
            expect(formData.keeperBackground).toBe('Grove Tender');
            expect(formData.wizardSchool).toBe('Divination');
            expect(formData.librarySanctum).toBe('The Spire of Whispers');
            expect(formData.inkDrops).toBe('50');
            expect(formData.paperScraps).toBe('25');

            // Verify character state
            const genres = await getStateKey(STORAGE_KEYS.SELECTED_GENRES, []);
            expect(genres).toEqual(['Fantasy', 'Mystery', 'Sci-Fi']);

            const diceSelection = await getStateKey(STORAGE_KEYS.GENRE_DICE_SELECTION, 'd6');
            expect(diceSelection).toBe('d8');

            // Verify monthly books
            const monthlyBooks = safeGetJSON(STORAGE_KEYS.MONTHLY_COMPLETED_BOOKS, []);
            expect(monthlyBooks).toEqual(['Book A', 'Book B', 'Book C']);

            // Verify schema version
            const schemaVersion = localStorage.getItem('tomeOfSecrets_schemaVersion');
            expect(schemaVersion).toBe('1');
        });

        it('should handle partial snapshot data', async () => {
            const eventListener = jest.fn();
            window.addEventListener('tos:localStateChanged', eventListener);

            // Set some initial data (this will emit an event)
            safeSetJSON(STORAGE_KEYS.CHARACTER_SHEET_FORM, { 
                keeperName: 'Original',
                level: '3'
            });

            // Clear the initial event
            eventListener.mockClear();

            const snapshot = {
                version: 1,
                updatedAt: new Date().toISOString(),
                data: {
                    formData: { keeperName: 'Updated' },
                    // Missing characterState and monthlyCompletedBooks
                    characterState: {},
                    monthlyCompletedBooks: []
                }
            };

            await applySnapshot(snapshot);

            // Events should NOT have been emitted from applySnapshot (suppressEvents = true)
            expect(eventListener).not.toHaveBeenCalled();

            // Form data should be updated (partial update)
            const formData = safeGetJSON(STORAGE_KEYS.CHARACTER_SHEET_FORM, {});
            expect(formData.keeperName).toBe('Updated');
            // Original level should be gone (replaced with partial data)
            expect(formData.level).toBeUndefined();

            window.removeEventListener('tos:localStateChanged', eventListener);
        });

        it('should handle empty snapshot data gracefully', async () => {
            const eventListener = jest.fn();
            window.addEventListener('tos:localStateChanged', eventListener);

            const snapshot = {
                version: 1,
                updatedAt: new Date().toISOString(),
                data: {
                    formData: {},
                    characterState: {},
                    monthlyCompletedBooks: []
                }
            };

            await applySnapshot(snapshot);

            // Events should NOT have been emitted
            expect(eventListener).not.toHaveBeenCalled();

            // Data should be cleared/empty
            const formData = safeGetJSON(STORAGE_KEYS.CHARACTER_SHEET_FORM, {});
            expect(formData).toEqual({});

            const monthlyBooks = safeGetJSON(STORAGE_KEYS.MONTHLY_COMPLETED_BOOKS, []);
            expect(monthlyBooks).toEqual([]);

            window.removeEventListener('tos:localStateChanged', eventListener);
        });
    });

    describe('buildLocalSnapshot', () => {
        it('should build snapshot from current local state', async () => {
            // Set up some local state
            safeSetJSON(STORAGE_KEYS.CHARACTER_SHEET_FORM, {
                keeperName: 'Local Keeper',
                level: '7'
            });
            safeSetJSON(STORAGE_KEYS.MONTHLY_COMPLETED_BOOKS, ['Local Book 1']);
            safeSetJSON(STORAGE_KEYS.SELECTED_GENRES, ['Fantasy']);
            localStorage.setItem('tomeOfSecrets_schemaVersion', '1');

            const snapshot = await buildLocalSnapshot();

            expect(snapshot.version).toBe(1);
            expect(snapshot.data.formData.keeperName).toBe('Local Keeper');
            expect(snapshot.data.formData.level).toBe('7');
            expect(snapshot.data.monthlyCompletedBooks).toEqual(['Local Book 1']);
            expect(snapshot.data.characterState[STORAGE_KEYS.SELECTED_GENRES]).toEqual(['Fantasy']);
            expect(snapshot.updatedAt).toBeDefined();
        });
    });
});

