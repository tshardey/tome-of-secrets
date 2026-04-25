/**
 * @jest-environment jsdom
 */
import { applySnapshot, buildLocalSnapshot } from '../assets/js/services/cloudSync.js';
import { STORAGE_KEYS, CHARACTER_STATE_KEYS } from '../assets/js/character-sheet/storageKeys.js';
import { safeGetJSON, safeSetJSON } from '../assets/js/utils/storage.js';
import { getStateKey } from '../assets/js/character-sheet/persistence.js';
import { characterState } from '../assets/js/character-sheet/state.js';

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

        it('syncs in-memory characterState when applying bookBoxSubscriptions (prevents next saveState from wiping cloud data)', async () => {
            const subKey = STORAGE_KEYS.BOOK_BOX_SUBSCRIPTIONS;
            characterState[subKey] = {
                stale: { id: 'stale', company: 'Stale RAM only', tier: '', defaultMonthlyCost: null, skipsAllowedPerYear: 0 }
            };

            const cloudSubs = {
                cloudSub: { id: 'cloudSub', company: 'From cloud', tier: 'Deluxe', defaultMonthlyCost: 39.99, skipsAllowedPerYear: 2 }
            };

            await applySnapshot({
                version: 15,
                data: {
                    formData: {},
                    characterState: {
                        [subKey]: cloudSubs
                    },
                    monthlyCompletedBooks: []
                }
            });

            expect(characterState[subKey]).toEqual(cloudSubs);
            const persisted = await getStateKey(subKey, {});
            expect(persisted).toEqual(cloudSubs);

            // Snapshot payload must not share references with live state (mutate source → RAM unchanged)
            cloudSubs.cloudSub.company = 'mutated';
            expect(characterState[subKey].cloudSub.company).toBe('From cloud');
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

        it('should strip base64 data-URI covers from books', async () => {
            const books = {
                'book-1': { title: 'Big Cover', author: 'A', cover: 'data:image/jpeg;base64,/9j/4AAQ...', status: 'tbr' },
                'book-2': { title: 'URL Cover', author: 'B', cover: 'https://example.com/cover.jpg', status: 'tbr' },
                'book-3': { title: 'No Cover', author: 'C', cover: null, status: 'tbr' }
            };
            safeSetJSON(STORAGE_KEYS.BOOKS, books);
            localStorage.setItem('tomeOfSecrets_schemaVersion', '1');

            const snapshot = await buildLocalSnapshot();
            const syncBooks = snapshot.data.characterState[STORAGE_KEYS.BOOKS];

            expect(syncBooks['book-1'].cover).toBeNull();
            expect(syncBooks['book-1'].title).toBe('Big Cover');
            expect(syncBooks['book-2'].cover).toBe('https://example.com/cover.jpg');
            expect(syncBooks['book-3'].cover).toBeNull();
        });

        it('should strip base64 data-URI coverUrl from quests', async () => {
            const quests = [
                { id: 'q1', book: 'A', coverUrl: 'data:image/png;base64,iVBOR...' },
                { id: 'q2', book: 'B', coverUrl: 'https://example.com/cover.jpg' },
                { id: 'q3', book: 'C', coverUrl: null }
            ];
            safeSetJSON(STORAGE_KEYS.COMPLETED_QUESTS, quests);
            localStorage.setItem('tomeOfSecrets_schemaVersion', '1');

            const snapshot = await buildLocalSnapshot();
            const syncQuests = snapshot.data.characterState[STORAGE_KEYS.COMPLETED_QUESTS];

            expect(syncQuests[0].coverUrl).toBeNull();
            expect(syncQuests[0].book).toBe('A');
            expect(syncQuests[1].coverUrl).toBe('https://example.com/cover.jpg');
            expect(syncQuests[2].coverUrl).toBeNull();
        });

        it('should not mutate local state when stripping covers', async () => {
            const dataUri = 'data:image/jpeg;base64,/9j/4AAQ...';
            const books = {
                'book-1': { title: 'Test', cover: dataUri }
            };
            safeSetJSON(STORAGE_KEYS.BOOKS, books);
            localStorage.setItem('tomeOfSecrets_schemaVersion', '1');

            await buildLocalSnapshot();

            // Local state should still have the data URI
            const localBooks = safeGetJSON(STORAGE_KEYS.BOOKS, {});
            expect(localBooks['book-1'].cover).toBe(dataUri);
        });
    });
});

