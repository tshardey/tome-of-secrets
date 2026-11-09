/**
 * @jest-environment jsdom
 *
 * The v18 cleanup must delete retired keys from IndexedDB as well as localStorage:
 * activeCurses/completedCurses used to be IndexedDB-backed (LARGE_STATE_KEYS), so old
 * copies can be orphaned there after the Shroud removal.
 */

function createFakeIndexedDB(initial = {}) {
    const store = new Map(Object.entries(initial));
    const request = (fn) => {
        const req = {};
        setTimeout(() => {
            req.result = fn();
            if (req.onsuccess) req.onsuccess();
        }, 0);
        return req;
    };
    const db = {
        objectStoreNames: { contains: () => true },
        createObjectStore: () => {},
        transaction: () => ({
            objectStore: () => ({
                get: (key) => request(() => store.get(key)),
                put: (value, key) => request(() => { store.set(key, value); return key; }),
                delete: (key) => request(() => { store.delete(key); return undefined; })
            })
        })
    };
    return {
        store,
        open: () => {
            const req = {};
            setTimeout(() => {
                req.result = db;
                if (req.onsuccess) req.onsuccess();
            }, 0);
            return req;
        }
    };
}

describe('purgeRetiredStateKeys', () => {
    let fakeIDB;

    beforeEach(() => {
        jest.resetModules();
        localStorage.clear();
        fakeIDB = createFakeIndexedDB({
            activeCurses: [{ name: 'The Unread Tome' }],
            completedCurses: [{ name: 'Old curse' }],
            books: { b1: { id: 'b1' } }
        });
        global.indexedDB = fakeIDB;
    });

    afterEach(() => {
        delete global.indexedDB;
    });

    test('removes retired keys from IndexedDB and localStorage, leaving live keys alone', async () => {
        const { purgeRetiredStateKeys, RETIRED_STATE_KEYS } = await import('../assets/js/character-sheet/dataMigrator.js');
        localStorage.setItem('shoppingLog', JSON.stringify([{ optionId: 'opt1' }]));
        localStorage.setItem('curseHelperState', JSON.stringify({}));
        localStorage.setItem('dustyBlueprints', '42');

        await purgeRetiredStateKeys();

        RETIRED_STATE_KEYS.forEach((key) => {
            expect(fakeIDB.store.has(key)).toBe(false);
            expect(localStorage.getItem(key)).toBeNull();
        });
        expect(fakeIDB.store.get('books')).toEqual({ b1: { id: 'b1' } });
        expect(localStorage.getItem('dustyBlueprints')).toBe('42');
    });

    test('applySnapshot purges orphaned IndexedDB copies of retired keys', async () => {
        const { applySnapshot } = await import('../assets/js/services/cloudSync.js');

        await applySnapshot({
            version: 18,
            data: { formData: {}, characterState: {}, monthlyCompletedBooks: [] }
        });

        expect(fakeIDB.store.has('activeCurses')).toBe(false);
        expect(fakeIDB.store.has('completedCurses')).toBe(false);
        expect(fakeIDB.store.get('books')).toEqual({ b1: { id: 'b1' } });
    });

    test('loadState purges orphaned IndexedDB copies when upgrading a v17 save', async () => {
        const { loadState } = await import('../assets/js/character-sheet/state.js');
        localStorage.setItem('tomeOfSecrets_schemaVersion', '17');

        await loadState();

        expect(fakeIDB.store.has('activeCurses')).toBe(false);
        expect(fakeIDB.store.has('completedCurses')).toBe(false);
        // Live keys survive (validation may normalise the book's shape)
        expect(fakeIDB.store.get('books')).toHaveProperty('b1.id', 'b1');
    });
});
