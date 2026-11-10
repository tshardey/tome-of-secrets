/**
 * @jest-environment jsdom
 */
import { applySnapshot, buildLocalSnapshot } from '../assets/js/services/cloudSync.js';
import { STORAGE_KEYS, CHARACTER_STATE_KEYS } from '../assets/js/character-sheet/storageKeys.js';
import { safeGetJSON, safeSetJSON } from '../assets/js/utils/storage.js';
import { getStateKey } from '../assets/js/character-sheet/persistence.js';
import { characterState } from '../assets/js/character-sheet/state.js';
import { SCHEMA_VERSION } from '../assets/js/character-sheet/dataValidator.js';

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
            // A v1 snapshot is migrated on apply; v15 stores the sanctum by its stable ID
            expect(formData.librarySanctum).toBe('the-spire-of-whispers');
            // Retired form fields are stripped on apply
            expect(formData.inkDrops).toBeUndefined();
            expect(formData.paperScraps).toBeUndefined();

            // Verify character state
            const genres = await getStateKey(STORAGE_KEYS.SELECTED_GENRES, []);
            expect(genres).toEqual(['Fantasy', 'Mystery', 'Sci-Fi']);

            const diceSelection = await getStateKey(STORAGE_KEYS.GENRE_DICE_SELECTION, 'd6');
            expect(diceSelection).toBe('d8');

            // Verify monthly books
            const monthlyBooks = safeGetJSON(STORAGE_KEYS.MONTHLY_COMPLETED_BOOKS, []);
            expect(monthlyBooks).toEqual(['Book A', 'Book B', 'Book C']);

            // The snapshot is migrated on apply, so the stored version is the current one
            const schemaVersion = localStorage.getItem('tomeOfSecrets_schemaVersion');
            expect(schemaVersion).toBe(String(SCHEMA_VERSION));
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

        it('syncs in-memory characterState when applying the fund ledger (prevents next saveState from wiping cloud data)', async () => {
            const subKey = STORAGE_KEYS.FUND_LEDGER;
            characterState[subKey] = [
                { id: 'stale', date: '2026-10-01', amountCents: 100, note: 'Stale RAM only' }
            ];

            const cloudSubs = [
                { id: 'cloudEntry', date: '2026-11-02', amountCents: 3200, note: 'From cloud' }
            ];

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
            const persisted = await getStateKey(subKey, []);
            expect(persisted).toEqual(cloudSubs);

            // Snapshot payload must not share references with live state (mutate source → RAM unchanged)
            cloudSubs[0].note = 'mutated';
            expect(characterState[subKey][0].note).toBe('From cloud');
        });

        it('applying a v17 snapshot strips retired keys and form fields', async () => {
            characterState[STORAGE_KEYS.FUND_BALANCE_CENTS] = 999;
            characterState[STORAGE_KEYS.FUND_LEDGER] = [{ id: 'local', date: '2026-10-01', amountCents: 100, note: '' }];

            await applySnapshot({
                version: 17,
                data: {
                    formData: {
                        level: '6',
                        'xp-current': '1234',
                        smp: '2',
                        inkDrops: '300',
                        paperScraps: '40',
                        'journal-entries-completed': '3'
                    },
                    characterState: {
                        [STORAGE_KEYS.DUSTY_BLUEPRINTS]: 42,
                        [STORAGE_KEYS.SELECTED_GENRES]: ['Fantasy'],
                        activeCurses: [{ name: 'The Unread Tome' }],
                        completedCurses: [],
                        shoppingLog: [{ optionId: 'opt1', logDate: '2026-10-15' }],
                        bookBoxSubscriptions: { sub1: { id: 'sub1' } }
                    },
                    monthlyCompletedBooks: []
                }
            });

            const formData = safeGetJSON(STORAGE_KEYS.CHARACTER_SHEET_FORM, {});
            expect(formData).toEqual({ level: '6', 'xp-current': '1234', smp: '2' });

            ['activeCurses', 'completedCurses', 'shoppingLog', 'bookBoxSubscriptions'].forEach((key) => {
                expect(localStorage.getItem(key)).toBeNull();
                expect(characterState).not.toHaveProperty(key);
            });

            expect(await getStateKey(STORAGE_KEYS.DUSTY_BLUEPRINTS, 0)).toBe(42);
            // A v17 snapshot has no Fund, so the migration starts it at $0 (stale local values are replaced)
            expect(characterState[STORAGE_KEYS.FUND_BALANCE_CENTS]).toBe(0);
            expect(characterState[STORAGE_KEYS.FUND_LEDGER]).toEqual([]);
            expect(await getStateKey(STORAGE_KEYS.FUND_BALANCE_CENTS, null)).toBe(0);
            expect(await getStateKey(STORAGE_KEYS.FUND_LEDGER, null)).toEqual([]);

            // The applied snapshot is now at the current schema, so the next load does not re-migrate it
            expect(localStorage.getItem('tomeOfSecrets_schemaVersion')).toBe(String(SCHEMA_VERSION));
        });

        it('applying a v18 snapshot keeps its fund balance and ledger', async () => {
            const ledger = [{ id: 'f1', date: '2026-11-02', amountCents: 3200, note: 'Hardcover' }];

            await applySnapshot({
                version: 18,
                data: {
                    formData: { level: '6' },
                    characterState: {
                        [STORAGE_KEYS.FUND_BALANCE_CENTS]: 4250,
                        [STORAGE_KEYS.FUND_LEDGER]: ledger
                    },
                    monthlyCompletedBooks: []
                }
            });

            expect(characterState[STORAGE_KEYS.FUND_BALANCE_CENTS]).toBe(4250);
            expect(characterState[STORAGE_KEYS.FUND_LEDGER]).toEqual(ledger);
            expect(await getStateKey(STORAGE_KEYS.FUND_BALANCE_CENTS, null)).toBe(4250);
            expect(await getStateKey(STORAGE_KEYS.FUND_LEDGER, null)).toEqual(ledger);
            expect(localStorage.getItem('tomeOfSecrets_schemaVersion')).toBe(String(SCHEMA_VERSION));
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

