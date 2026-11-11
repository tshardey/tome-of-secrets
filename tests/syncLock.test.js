/**
 * @jest-environment jsdom
 */

const SYNC_LOCK_PATH = '../assets/js/services/syncLock.js';
const CLOUD_AUTH_PATH = '../assets/js/auth/cloudAuth.js';
const SUPABASE_CLIENT_PATH = '../assets/js/services/supabaseClient.js';

const USER = '00000000-0000-4000-8000-0000000000a1';

/** One mutex per lock name, shared by every "tab" that holds this object (like the browser's). */
function makeFakeLocks() {
    const tails = new Map();
    const request = jest.fn((name, callback) => {
        const previous = tails.get(name) || Promise.resolve();
        const run = previous.then(() => callback({ name, mode: 'exclusive' }));
        tails.set(name, run.then(() => {}, () => {}));
        return run;
    });
    return { request };
}

function installLocks(locks) {
    Object.defineProperty(window.navigator, 'locks', { value: locks, configurable: true, writable: true });
}

function removeLocks() {
    delete window.navigator.locks;
}

function deferred() {
    let resolve;
    let reject;
    const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
    return { promise, resolve, reject };
}

/** Load a fresh copy of a module, standing for a separate tab's module registry. */
function loadIsolated(path, setup) {
    let mod;
    jest.isolateModules(() => {
        if (setup) setup();
        mod = require(path);
    });
    return mod;
}

describe('runExclusiveSync', () => {
    afterEach(() => removeLocks());

    it('exports the lock name', () => {
        const { SYNC_LOCK_NAME } = loadIsolated(SYNC_LOCK_PATH);
        expect(SYNC_LOCK_NAME).toBe('tos-cloud-sync');
    });

    describe.each([
        ['the in-tab queue (no navigator.locks)', () => removeLocks()],
        ['navigator.locks', () => installLocks(makeFakeLocks())]
    ])('with %s', (_label, install) => {
        beforeEach(() => install());

        it('runs two calls in order without overlap; isSyncRunning is true only inside', async () => {
            const { runExclusiveSync, isSyncRunning } = loadIsolated(SYNC_LOCK_PATH);
            const events = [];
            const first = deferred();
            expect(isSyncRunning()).toBe(false);

            const a = runExclusiveSync(async () => {
                events.push(['a:start', isSyncRunning()]);
                await first.promise;
                events.push(['a:end', isSyncRunning()]);
                return 'A';
            });
            const b = runExclusiveSync(async () => {
                events.push(['b:start', isSyncRunning()]);
                return 'B';
            });

            await new Promise(r => setTimeout(r, 0));
            expect(events).toEqual([['a:start', true]]);
            first.resolve();
            await expect(a).resolves.toBe('A');
            await expect(b).resolves.toBe('B');
            expect(events).toEqual([['a:start', true], ['a:end', true], ['b:start', true]]);
            expect(isSyncRunning()).toBe(false);
        });

        it('a failing call rejects for its caller and does not block the next', async () => {
            const { runExclusiveSync, isSyncRunning } = loadIsolated(SYNC_LOCK_PATH);
            const failing = runExclusiveSync(async () => { throw new Error('nope'); });
            const next = runExclusiveSync(async () => 'ok');
            await expect(failing).rejects.toThrow('nope');
            await expect(next).resolves.toBe('ok');
            expect(isSyncRunning()).toBe(false);
        });
    });

    it('uses navigator.locks with the lock name when it exists', async () => {
        const locks = makeFakeLocks();
        installLocks(locks);
        const { runExclusiveSync } = loadIsolated(SYNC_LOCK_PATH);
        await runExclusiveSync(async () => {});
        expect(locks.request).toHaveBeenCalledWith('tos-cloud-sync', expect.any(Function));
    });
});

// --- cloudAuth ------------------------------------------------------------------------------

const REMOTE_SNAPSHOT = {
    version: 20,
    updatedAt: '2026-01-01T00:00:00.000Z',
    data: { formData: { keeperName: 'Member A' }, characterState: {}, monthlyCompletedBooks: [] }
};

/**
 * A fake supabase client for cloud save. `remoteRead` controls each tos_saves read; upserts
 * are recorded. The remote save equals the last synced one, so a changed local save pushes.
 */
function makeCloudClient({ remoteRead } = {}) {
    let session = { user: { id: USER } };
    let authListener = null;
    const upserts = [];
    const reads = [];
    let remote = REMOTE_SNAPSHOT;
    const client = {
        auth: {
            getSession: jest.fn(async () => ({ data: { session }, error: null })),
            onAuthStateChange: jest.fn((fn) => { authListener = fn; return { data: { subscription: { unsubscribe() {} } } }; }),
            signInWithOtp: jest.fn(),
            signOut: jest.fn()
        },
        from: jest.fn((table) => {
            const builder = {
                select: () => builder,
                eq: () => builder,
                maybeSingle: () => {
                    reads.push(table);
                    return remoteRead ? remoteRead(reads.length, remote) : Promise.resolve({ data: { data: remote }, error: null });
                },
                upsert: (row) => {
                    upserts.push(row);
                    remote = row.data;
                    return Promise.resolve({ error: null });
                },
                insert: () => Promise.resolve({ error: null })
            };
            return builder;
        })
    };
    return {
        client,
        upserts,
        reads,
        signOut: async () => {
            session = null;
            if (authListener) await authListener('SIGNED_OUT', null);
        }
    };
}

function renderAuthPanel() {
    // Configured for a local stack; the client itself is the fake from loadTabCloudAuth.
    document.head.innerHTML = `
        <meta name="supabase-url" content="http://127.0.0.1:54321">
        <meta name="supabase-publishable-key" content="test-key">`;
    document.body.innerHTML = `
        <div id="auth-panel">
          <span id="auth-status"></span><span id="auth-hint"></span><span id="auth-last-sync"></span>
          <input id="auth-email"><button id="auth-sign-in"></button>
          <button id="auth-sync-now"></button><button id="auth-sign-out"></button>
        </div>`;
}

/** Local save at v20 whose last-synced hash is the remote one, then changed locally. */
async function seedLocalSave() {
    localStorage.clear();
    localStorage.setItem('tomeOfSecrets_schemaVersion', '20');
    const { snapshotHash } = require('../assets/js/services/cloudSync.js');
    localStorage.setItem('tos_cloud_lastSyncedHash', snapshotHash(REMOTE_SNAPSHOT));
    localStorage.setItem('characterSheet', JSON.stringify({ keeperName: 'Member B' }));
}

/** Load cloudAuth (and its own syncLock/cloudSync) in a fresh registry with the fake client. */
function loadTabCloudAuth(fakeClient) {
    return loadIsolated(CLOUD_AUTH_PATH, () => {
        jest.doMock(SUPABASE_CLIENT_PATH, () => ({ getSupabaseClient: async () => fakeClient }));
    });
}

const flush = async () => {
    for (let i = 0; i < 20; i += 1) await Promise.resolve();
};

describe('cloudAuth sync through the lock', () => {
    let logSpy;
    let debugSpy;

    beforeEach(() => {
        jest.useFakeTimers();
        renderAuthPanel();
        logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
        debugSpy = jest.spyOn(console, 'debug').mockImplementation(() => {});
    });

    afterEach(() => {
        jest.useRealTimers();
        jest.dontMock(SUPABASE_CLIENT_PATH);
        document.head.innerHTML = '';
        removeLocks();
        logSpy.mockRestore();
        debugSpy.mockRestore();
        localStorage.clear();
    });

    it('two tabs (I2): tab 2 auto-sync waits for tab 1 and snapshots after the release', async () => {
        installLocks(makeFakeLocks());
        await seedLocalSave();

        // Tab 1: holds the lock in an applyTidy-like call that has not finished.
        const tab1 = loadIsolated(SYNC_LOCK_PATH);
        const release = deferred();
        const tab1Done = tab1.runExclusiveSync(async () => {
            await release.promise;
            // Tab 1 finishes its write before it releases.
            localStorage.setItem('bookTidy', JSON.stringify({ status: 'done', marker: 'written-by-tab-1' }));
        });

        // Tab 2: signed in, auto-sync running.
        const fake = makeCloudClient();
        const { initializeCloudAuth } = loadTabCloudAuth(fake.client);
        await initializeCloudAuth();

        window.dispatchEvent(new StorageEvent('storage', { key: 'bookTidy' }));
        await jest.advanceTimersByTimeAsync(3000);
        await flush();
        expect(fake.upserts).toHaveLength(0);
        expect(fake.reads).toHaveLength(0);

        release.resolve();
        await tab1Done;
        await jest.advanceTimersByTimeAsync(0);
        await flush();

        expect(fake.upserts).toHaveLength(1);
        expect(fake.upserts[0].data.data.characterState.bookTidy).toEqual({ status: 'done', marker: 'written-by-tab-1' });

        await fake.signOut();
    });

    it.each([
        ['the in-tab queue', () => removeLocks()],
        ['navigator.locks', () => installLocks(makeFakeLocks())]
    ])('a manual sync started during an auto-sync waits for it (%s)', async (_label, install) => {
        install();
        await seedLocalSave();
        const firstRead = deferred();
        const fake = makeCloudClient({
            remoteRead: (n, current) => (n === 1 ? firstRead.promise : Promise.resolve({ data: { data: current }, error: null }))
        });
        const { initializeCloudAuth } = loadTabCloudAuth(fake.client);
        await initializeCloudAuth();

        // Auto-sync starts and stalls on the cloud read.
        window.dispatchEvent(new CustomEvent('tos:localStateChanged', { detail: { source: 'test' } }));
        await jest.advanceTimersByTimeAsync(3000);
        await flush();
        expect(fake.reads).toHaveLength(1);

        // Manual sync is pressed while it is in flight: it must not read until the auto one ends.
        document.getElementById('auth-sync-now').click();
        await jest.advanceTimersByTimeAsync(500);
        await flush();
        expect(fake.reads).toHaveLength(1);

        firstRead.resolve({ data: { data: REMOTE_SNAPSHOT }, error: null });
        await jest.advanceTimersByTimeAsync(0);
        await flush();
        await jest.advanceTimersByTimeAsync(0);
        await flush();

        // The auto-sync pushed; the manual one then read the pushed save and found it in sync.
        expect(fake.reads).toHaveLength(2);
        expect(fake.upserts).toHaveLength(1);
        expect(document.getElementById('auth-hint').textContent).toBe('Already in sync.');

        await fake.signOut();
    });
});

describe('getSupabaseClient', () => {
    it('returns null when Supabase is not configured', async () => {
        document.head.innerHTML = '';
        const { getSupabaseClient } = loadIsolated(SUPABASE_CLIENT_PATH);
        await expect(getSupabaseClient()).resolves.toBeNull();
    });

    it('creates one client per page', async () => {
        document.head.innerHTML = `
            <meta name="supabase-url" content="http://127.0.0.1:54321">
            <meta name="supabase-publishable-key" content="test-key">`;
        const createClient = jest.fn(() => ({ id: Symbol('client') }));
        const { getSupabaseClient } = loadIsolated(SUPABASE_CLIENT_PATH, () => {
            jest.doMock('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.49.1/+esm', () => ({ createClient }), { virtual: true });
        });
        const [a, b] = await Promise.all([getSupabaseClient(), getSupabaseClient()]);
        const c = await getSupabaseClient();
        expect(a).toBe(b);
        expect(a).toBe(c);
        expect(createClient).toHaveBeenCalledTimes(1);
        expect(createClient).toHaveBeenCalledWith('http://127.0.0.1:54321', 'test-key');
        jest.dontMock('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.49.1/+esm');
        document.head.innerHTML = '';
    });
});
