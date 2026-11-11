/**
 * @jest-environment jsdom
 *
 * Forward-compatible saves (Plan 4, D10): a stale tab or a rolled-back build must never
 * downgrade, strip or overwrite a save written by a newer schema.
 */
jest.mock('../assets/js/character-sheet/persistence.js', () => {
    const actual = jest.requireActual('../assets/js/character-sheet/persistence.js');
    return { ...actual, setStateKey: jest.fn((...args) => actual.setStateKey(...args)) };
});
jest.mock('../assets/js/utils/storage.js', () => {
    const actual = jest.requireActual('../assets/js/utils/storage.js');
    return { ...actual, safeSetJSON: jest.fn((...args) => actual.safeSetJSON(...args)) };
});

import { setStateKey, getStateKey, setSaveJSON } from '../assets/js/character-sheet/persistence.js';
import { StateAdapter } from '../assets/js/character-sheet/stateAdapter.js';
import { safeSetJSON } from '../assets/js/utils/storage.js';
import {
    SCHEMA_VERSION,
    saveSchemaVersion,
    rememberLoadedSchemaVersion,
    isSchemaWriteSafe,
    resetSchemaWriteGateForTests,
    validateCharacterState
} from '../assets/js/character-sheet/dataValidator.js';
import { migrateState } from '../assets/js/character-sheet/dataMigrator.js';
import { characterState, loadState, saveState, resetStateLoadedForTests } from '../assets/js/character-sheet/state.js';
import { STORAGE_KEYS } from '../assets/js/character-sheet/storageKeys.js';
import { applySnapshot, schemaGate, snapshotHash, syncAuto, syncNow } from '../assets/js/services/cloudSync.js';
import fs from 'node:fs';
import path from 'node:path';
import { initializeSchemaChangeBanner } from '../assets/js/components/schemaReloadBanner.js';

const VERSION_KEY = 'tomeOfSecrets_schemaVersion';
const NEWER = SCHEMA_VERSION + 1;
const OLDER = SCHEMA_VERSION - 1;
const BLOCKED_HINT = 'This save was made by a newer Tome of Secrets. Reload to update; cloud sync is paused until then.';
const SAVE_CHANGED_HINT = 'Your save changed in another tab. Reload this tab; cloud sync is paused until then.';
const NEWER_BANNER = 'Tome of Secrets was updated in another tab. Reload this tab to keep playing.';
const SAME_BUILD_BANNER = 'Your save changed in another tab. Reload this tab to keep playing.';

function storedVersion() {
    return localStorage.getItem(VERSION_KEY);
}

function makeForm() {
    document.body.innerHTML = `
        <form id="character-sheet">
            <input id="keeperName" value="Member A" />
        </form>`;
    return document.getElementById('character-sheet');
}

function formWrites() {
    return safeSetJSON.mock.calls.filter(([key]) => key === STORAGE_KEYS.CHARACTER_SHEET_FORM);
}

function oldShapedBooks() {
    return {
        'book-1': {
            id: 'book-1',
            title: 'The Salt Road',
            author: 'Member A',
            status: 'reading',
            shelfCategory: 'general',
            dateAdded: '2026-01-01T00:00:00.000Z',
            dateCompleted: null,
            links: { questIds: [], curriculumPromptIds: [] },
            tags: []
        }
    };
}

function makeSnapshot(version, keeperName = 'Member B') {
    return {
        version,
        updatedAt: '2026-11-01T00:00:00.000Z',
        data: {
            formData: { keeperName },
            characterState: { [STORAGE_KEYS.SELECTED_GENRES]: ['Fantasy'] },
            monthlyCompletedBooks: []
        }
    };
}

function createMockSupabase(remoteSnapshot) {
    const upsert = jest.fn().mockResolvedValue({ error: null });
    return {
        upsert,
        auth: {
            getSession: jest.fn().mockResolvedValue({
                data: { session: { user: { id: '00000000-0000-4000-8000-000000000001' } } },
                error: null
            })
        },
        from: jest.fn((table) => {
            if (table === 'tos_saves') {
                return {
                    select: jest.fn().mockReturnValue({
                        eq: jest.fn().mockReturnValue({
                            maybeSingle: jest.fn().mockResolvedValue({
                                data: remoteSnapshot ? { data: remoteSnapshot, updated_at: remoteSnapshot.updatedAt } : null,
                                error: null
                            })
                        })
                    }),
                    upsert
                };
            }
            if (table === 'tos_sync_events') {
                return { insert: jest.fn().mockResolvedValue({ error: null }) };
            }
            throw new Error(`Unexpected table: ${table}`);
        })
    };
}

beforeEach(() => {
    localStorage.clear();
    jest.clearAllMocks();
    resetStateLoadedForTests();
    resetSchemaWriteGateForTests();
    window.confirm = jest.fn(() => true);
});

describe('version is never lowered', () => {
    test('migrateState leaves a newer-schema state untouched and keeps the stored version', () => {
        localStorage.setItem(VERSION_KEY, String(NEWER));
        const state = { [STORAGE_KEYS.BOOKS]: { 'book-1': { id: 'book-1', futureField: 'kept' } } };
        const result = migrateState(state);
        expect(result).toBe(state);
        expect(storedVersion()).toBe(String(NEWER));
    });

    test('saveSchemaVersion refuses to lower a newer stored version', () => {
        localStorage.setItem(VERSION_KEY, String(NEWER));
        expect(saveSchemaVersion()).toBe(false);
        expect(storedVersion()).toBe(String(NEWER));
    });

    test('saveSchemaVersion writes the current version over an older or missing one', () => {
        localStorage.setItem(VERSION_KEY, String(OLDER));
        expect(saveSchemaVersion()).toBe(true);
        expect(storedVersion()).toBe(String(SCHEMA_VERSION));

        localStorage.clear();
        expect(saveSchemaVersion()).toBe(true);
        expect(storedVersion()).toBe(String(SCHEMA_VERSION));
    });
});

describe('write gate: saveState and loadState', () => {
    test('saveState writes nothing over a newer-schema save and announces it', async () => {
        localStorage.setItem(VERSION_KEY, String(NEWER));
        characterState[STORAGE_KEYS.BOOKS] = oldShapedBooks();
        const form = makeForm();
        const listener = jest.fn();
        window.addEventListener('tos:schemaChangedElsewhere', listener);

        await saveState(form);

        expect(setStateKey).not.toHaveBeenCalled();
        expect(formWrites()).toHaveLength(0);
        expect(storedVersion()).toBe(String(NEWER));
        expect(listener).toHaveBeenCalledTimes(1);
        window.removeEventListener('tos:schemaChangedElsewhere', listener);
    });

    test('another tab migrating mid-session closes the gate', async () => {
        localStorage.setItem(VERSION_KEY, String(SCHEMA_VERSION));
        const form = makeForm();
        await loadState(form);
        expect(isSchemaWriteSafe()).toBe(true);

        localStorage.setItem(VERSION_KEY, String(NEWER));
        jest.clearAllMocks();
        await saveState(form);

        expect(isSchemaWriteSafe()).toBe(false);
        expect(setStateKey).not.toHaveBeenCalled();
        expect(formWrites()).toHaveLength(0);
        expect(storedVersion()).toBe(String(NEWER));
    });

    test('a version appearing after load (null -> current) also closes the gate', async () => {
        rememberLoadedSchemaVersion();
        expect(isSchemaWriteSafe()).toBe(true);

        localStorage.setItem(VERSION_KEY, String(SCHEMA_VERSION));
        await saveState(makeForm());

        expect(isSchemaWriteSafe()).toBe(false);
        expect(setStateKey).not.toHaveBeenCalled();
        expect(formWrites()).toHaveLength(0);
    });

    test('loadState of a newer-schema save populates RAM but writes nothing back', async () => {
        localStorage.setItem(VERSION_KEY, String(NEWER));
        localStorage.setItem(STORAGE_KEYS.SELECTED_GENRES, JSON.stringify(['Fantasy']));

        await loadState(makeForm());

        expect(characterState[STORAGE_KEYS.SELECTED_GENRES]).toEqual(['Fantasy']);
        expect(setStateKey).not.toHaveBeenCalled();
        expect(storedVersion()).toBe(String(NEWER));
    });

    test("this tab's own migration in loadState keeps the gate open", async () => {
        localStorage.setItem(VERSION_KEY, String(OLDER));
        const form = makeForm();

        await loadState(form);
        expect(storedVersion()).toBe(String(SCHEMA_VERSION));
        expect(setStateKey).toHaveBeenCalled();

        jest.clearAllMocks();
        await saveState(form);
        expect(isSchemaWriteSafe()).toBe(true);
        expect(setStateKey).toHaveBeenCalled();
        expect(formWrites()).toHaveLength(1);
    });

    test("this tab's own applySnapshot of an older snapshot keeps the gate open", async () => {
        rememberLoadedSchemaVersion();
        await applySnapshot(makeSnapshot(OLDER));
        expect(storedVersion()).toBe(String(SCHEMA_VERSION));

        jest.clearAllMocks();
        await saveState(makeForm());
        expect(isSchemaWriteSafe()).toBe(true);
        expect(setStateKey).toHaveBeenCalled();
    });
});

describe('write gate: direct save writes from a stale tab', () => {
    test("StateAdapter's add-book path writes nothing once another tab moved the save to a newer schema", async () => {
        localStorage.setItem(VERSION_KEY, String(SCHEMA_VERSION));
        await loadState(makeForm());
        const adapter = new StateAdapter(characterState);

        // Another tab migrates and writes a newer-shaped books map.
        const newerBooks = { 'book-9': { id: 'book-9', title: 'Glass Orchard', type: 'shelf', libraryBookId: '33333333-3333-4333-8333-333333333333' } };
        await setStateKey(STORAGE_KEYS.BOOKS, newerBooks);
        localStorage.setItem(VERSION_KEY, String(NEWER));
        jest.clearAllMocks();
        const listener = jest.fn();
        window.addEventListener('tos:schemaChangedElsewhere', listener);

        adapter.addBook({ title: 'The Salt Road', author: 'Member A' });
        await new Promise(resolve => setTimeout(resolve, 0));

        expect(safeSetJSON).not.toHaveBeenCalled();
        expect(await getStateKey(STORAGE_KEYS.BOOKS, {})).toEqual(newerBooks);
        expect(storedVersion()).toBe(String(NEWER));
        expect(listener).toHaveBeenCalledTimes(1);
        window.removeEventListener('tos:schemaChangedElsewhere', listener);
    });

    test('setSaveJSON (form, shelf colours, monthly books) refuses while the gate is closed', () => {
        localStorage.setItem(VERSION_KEY, String(SCHEMA_VERSION));
        rememberLoadedSchemaVersion();
        expect(setSaveJSON(STORAGE_KEYS.CHARACTER_SHEET_FORM, { keeperName: 'Member A' })).toBe(true);

        localStorage.setItem(VERSION_KEY, String(NEWER));
        expect(setSaveJSON(STORAGE_KEYS.CHARACTER_SHEET_FORM, { keeperName: 'Member B' })).toBe(false);
        expect(setSaveJSON(STORAGE_KEYS.SHELF_BOOK_COLORS, ['#000000'])).toBe(false);
        expect(setSaveJSON(STORAGE_KEYS.MONTHLY_COMPLETED_BOOKS, ['x'])).toBe(false);
        expect(JSON.parse(localStorage.getItem(STORAGE_KEYS.CHARACTER_SHEET_FORM))).toEqual({ keeperName: 'Member A' });
        expect(localStorage.getItem(STORAGE_KEYS.SHELF_BOOK_COLORS)).toBeNull();
        expect(localStorage.getItem(STORAGE_KEYS.MONTHLY_COMPLETED_BOOKS)).toBeNull();
    });
});

describe('reload banner', () => {
    function expectUnclosableBanner(text) {
        const banner = document.getElementById('tos-schema-reload-banner');
        expect(banner).not.toBeNull();
        expect(banner.classList.contains('schema-reload-banner')).toBe(true);
        expect(banner.getAttribute('style')).toBeNull();
        expect(banner.textContent).toContain(text);
        const buttons = banner.querySelectorAll('button');
        expect(buttons).toHaveLength(1);
        expect(buttons[0].textContent).toBe('Reload');
    }

    beforeEach(() => {
        document.body.innerHTML = '';
        initializeSchemaChangeBanner();
    });

    test('a storage event moving the save to a newer schema shows the newer-build banner', () => {
        localStorage.setItem(VERSION_KEY, String(NEWER));
        window.dispatchEvent(new StorageEvent('storage', { key: VERSION_KEY, newValue: String(NEWER) }));
        expectUnclosableBanner(NEWER_BANNER);
    });

    test('a refused write on a page with no character sheet shows the same-build banner', () => {
        expect(document.getElementById('character-sheet')).toBeNull();
        localStorage.setItem(VERSION_KEY, String(SCHEMA_VERSION));
        window.dispatchEvent(new CustomEvent('tos:schemaChangedElsewhere'));
        expectUnclosableBanner(SAME_BUILD_BANNER);
    });

    test('main.js installs the banner on every page, before any other initializer', () => {
        const main = fs.readFileSync(path.resolve(process.cwd(), '..', 'assets', 'js', 'main.js'), 'utf8');
        const install = main.indexOf('initializeSchemaChangeBanner();');
        expect(install).toBeGreaterThan(-1);
        for (const other of ['initializeTabs();', 'initializeCloudAuth()', 'initializeCharacterSheet()', 'initializeStatusWidget()']) {
            expect(main.indexOf(other)).toBeGreaterThan(install);
        }
    });
});

describe('v20 book fields survive validation', () => {
    test('well-typed fields pass through; badly typed ones fall back to the v20 defaults', () => {
        const state = {
            [STORAGE_KEYS.BOOKS]: {
                good: {
                    id: 'good',
                    title: 'Glass Orchard',
                    type: 'shelf',
                    libraryBookId: '11111111-1111-4111-8111-111111111111',
                    libraryTagsBase: ['fantasy'],
                    shelfMatchDismissed: '22222222-2222-4222-8222-222222222222'
                },
                bad: {
                    id: 'bad',
                    title: 'The Salt Road',
                    type: 7,
                    libraryTagsBase: 'x'
                }
            }
        };
        const books = validateCharacterState(state)[STORAGE_KEYS.BOOKS];
        expect(books.good.type).toBe('shelf');
        expect(books.good.libraryBookId).toBe('11111111-1111-4111-8111-111111111111');
        expect(books.good.libraryTagsBase).toEqual(['fantasy']);
        expect(books.good.shelfMatchDismissed).toBe('22222222-2222-4222-8222-222222222222');
        // Schema 20: a bad type is re-derived (Unsorted) and the library fields are null off the shelf
        expect(books.bad.type).toBe('unsorted');
        expect(books.bad.libraryBookId).toBeNull();
        expect(books.bad.libraryTagsBase).toBeNull();
        expect(books.bad.shelfMatchDismissed).toBeNull();
    });

    test('an unknown type string becomes unsorted and status other reads as reading', () => {
        const state = {
            [STORAGE_KEYS.BOOKS]: {
                a: { id: 'a', type: 'scroll', status: 'other' },
                b: { id: 'b', type: 'audiobook', status: 'reading' }
            }
        };
        const books = validateCharacterState(state)[STORAGE_KEYS.BOOKS];
        expect(books.a.type).toBe('unsorted');
        expect(books.a.status).toBe('reading');
        expect(books.b.type).toBe('audiobook');
        expect(books.b.status).toBe('reading');
    });
});

describe('sync is blocked across schemas', () => {
    test('schemaGate', () => {
        expect(schemaGate(SCHEMA_VERSION, SCHEMA_VERSION)).toBe('ok');
        expect(schemaGate(null, null)).toBe('ok');
        expect(schemaGate(NEWER, SCHEMA_VERSION)).toBe('local-newer');
        expect(schemaGate(SCHEMA_VERSION, NEWER)).toBe('remote-newer');
    });

    test('syncNow with a newer remote snapshot neither pushes nor applies nor prompts', async () => {
        localStorage.setItem(VERSION_KEY, String(SCHEMA_VERSION));
        localStorage.setItem('tos_cloud_lastSyncedHash', 'stale-hash');
        const supabase = createMockSupabase(makeSnapshot(NEWER));

        const result = await syncNow(supabase);

        expect(result).toEqual({ action: 'blocked', detail: BLOCKED_HINT });
        expect(supabase.upsert).not.toHaveBeenCalled();
        expect(setStateKey).not.toHaveBeenCalled();
        expect(window.confirm).not.toHaveBeenCalled();
        expect(storedVersion()).toBe(String(SCHEMA_VERSION));
    });

    test('syncAuto with a newer local save and an older remote does not push', async () => {
        localStorage.setItem(VERSION_KEY, String(NEWER));
        const remote = makeSnapshot(SCHEMA_VERSION);
        localStorage.setItem('tos_cloud_lastSyncedHash', snapshotHash(remote));
        const supabase = createMockSupabase(remote);

        const result = await syncAuto(supabase);

        expect(result.action).toBe('blocked');
        expect(supabase.upsert).not.toHaveBeenCalled();
        expect(setStateKey).not.toHaveBeenCalled();
    });

    test('syncAuto is blocked when the write gate is closed', async () => {
        rememberLoadedSchemaVersion();
        localStorage.setItem(VERSION_KEY, String(SCHEMA_VERSION));
        expect(isSchemaWriteSafe()).toBe(false);
        const remote = makeSnapshot(SCHEMA_VERSION, 'Member A');
        localStorage.setItem('tos_cloud_lastSyncedHash', snapshotHash(remote));
        const supabase = createMockSupabase(remote);

        const result = await syncAuto(supabase);

        expect(result).toEqual({ action: 'blocked', detail: SAVE_CHANGED_HINT });
        expect(supabase.upsert).not.toHaveBeenCalled();
        expect(setStateKey).not.toHaveBeenCalled();
    });

    describe('another tab migrates while a manual-sync prompt is open', () => {
        function migrateElsewhereDuringPrompt(answer) {
            window.confirm = jest.fn(() => {
                localStorage.setItem(VERSION_KEY, String(NEWER));
                return answer;
            });
        }

        test.each([
            ['first sync, Cancel (push)', false, null],
            ['first sync, OK (pull)', true, null],
            ['conflict, Cancel (push)', false, 'stale-hash'],
            ['conflict, OK (pull)', true, 'stale-hash']
        ])('%s is blocked with nothing written', async (_label, answer, lastHash) => {
            localStorage.setItem(VERSION_KEY, String(SCHEMA_VERSION));
            rememberLoadedSchemaVersion();
            if (lastHash) localStorage.setItem('tos_cloud_lastSyncedHash', lastHash);
            const supabase = createMockSupabase(makeSnapshot(SCHEMA_VERSION, 'Member B'));
            migrateElsewhereDuringPrompt(answer);

            const result = await syncNow(supabase);

            expect(window.confirm).toHaveBeenCalledTimes(1);
            expect(result).toEqual({ action: 'blocked', detail: BLOCKED_HINT });
            expect(supabase.upsert).not.toHaveBeenCalled();
            expect(setStateKey).not.toHaveBeenCalled();
            expect(safeSetJSON).not.toHaveBeenCalled();
            expect(storedVersion()).toBe(String(NEWER));
        });

        test('a same-build change during the prompt is blocked with the neutral hint', async () => {
            localStorage.setItem(VERSION_KEY, String(SCHEMA_VERSION));
            rememberLoadedSchemaVersion();
            const supabase = createMockSupabase(makeSnapshot(SCHEMA_VERSION, 'Member B'));
            window.confirm = jest.fn(() => {
                localStorage.removeItem(VERSION_KEY);
                return false;
            });

            const result = await syncNow(supabase);

            expect(result).toEqual({ action: 'blocked', detail: SAVE_CHANGED_HINT });
            expect(supabase.upsert).not.toHaveBeenCalled();
        });
    });

    test('applySnapshot refuses, writing nothing, when the write gate is closed', async () => {
        rememberLoadedSchemaVersion();
        localStorage.setItem(VERSION_KEY, String(SCHEMA_VERSION));
        expect(isSchemaWriteSafe()).toBe(false);

        await expect(applySnapshot(makeSnapshot(OLDER))).rejects.toThrow('newer_schema');
        expect(safeSetJSON).not.toHaveBeenCalled();
        expect(setStateKey).not.toHaveBeenCalled();
    });

    test('applySnapshot refuses a newer-schema snapshot before writing anything', async () => {
        localStorage.setItem(VERSION_KEY, String(SCHEMA_VERSION));
        await expect(applySnapshot(makeSnapshot(NEWER))).rejects.toThrow('newer_schema');
        expect(safeSetJSON).not.toHaveBeenCalled();
        expect(setStateKey).not.toHaveBeenCalled();
        expect(storedVersion()).toBe(String(SCHEMA_VERSION));
    });
});
