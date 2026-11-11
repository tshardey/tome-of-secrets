/**
 * @jest-environment jsdom
 */
import {
    LibraryCatalogService,
    LibraryUnavailableError,
    LIBRARY_TIMEOUT_MS,
    LIBRARY_WRITE_TIMEOUT_MS,
    CATALOG_TTL_MS,
    RETRY_AFTER_MS
} from '../assets/js/services/LibraryCatalogService.js';

// Synthetic ids only (public repo).
const USER = '00000000-0000-4000-8000-0000000000a1';
const HOUSEHOLD = '00000000-0000-4000-8000-0000000000b1';
const BOOK_1 = '00000000-0000-4000-8000-000000000001';
const BOOK_2 = '00000000-0000-4000-8000-000000000002';

const BOOKS_SELECT = 'id, title, authors, cover_url, page_count, series_name, series_volume, copies(edition_note)';

/**
 * A chainable stand-in for supabase-js. `schema('library').from(t)` returns a builder that
 * records every call and, when awaited, resolves with `handlers[t](builder)`.
 */
function makeFakeClient({ session = { user: { id: USER } }, handlers = {}, sessionPromise } = {}) {
    const queries = [];
    const builderFor = (schemaName, table) => {
        const calls = [];
        const builder = { schema: schemaName, table, calls };
        const chain = ['select', 'eq', 'order', 'limit', 'range', 'is', 'in', 'update', 'upsert', 'delete', 'insert'];
        for (const name of chain) {
            builder[name] = (...args) => {
                calls.push([name, ...args]);
                return builder;
            };
        }
        builder.call = (name) => calls.find(c => c[0] === name);
        builder.callsOf = (name) => calls.filter(c => c[0] === name);
        builder.then = (resolve, reject) => {
            const handler = handlers[table];
            const out = handler ? handler(builder) : { data: [], error: null };
            return Promise.resolve(out).then(resolve, reject);
        };
        return builder;
    };
    const from = jest.fn((table) => {
        const b = builderFor('library', table);
        queries.push(b);
        return b;
    });
    const client = {
        auth: {
            getSession: jest.fn(() => sessionPromise || Promise.resolve({ data: { session }, error: null }))
        },
        schema: jest.fn(() => ({ from })),
        from: jest.fn(() => { throw new Error('library queries must go through schema()'); })
    };
    return { client, from, queries, ofTable: (t) => queries.filter(q => q.table === t) };
}

const memberHandler = (rows = [{ household_id: HOUSEHOLD }]) => () => ({ data: rows, error: null });

/** Serve `rows` in .range() pages; an empty page ends the read. */
const pagedHandler = (rows, { failOnPage = -1, error = { code: 'PGRST000', message: 'boom' } } = {}) => {
    let page = 0;
    return (b) => {
        const [, from, to] = b.call('range');
        const index = page++;
        if (index === failOnPage) return { data: null, error };
        return { data: rows.slice(from, to + 1), error: null };
    };
};

const bookRow = (id, extra = {}) => ({
    id,
    title: 'The Salt Road',
    authors: ['Member A'],
    cover_url: null,
    page_count: 320,
    series_name: null,
    series_volume: null,
    copies: [],
    ...extra
});

function readyHandlers({ books = [bookRow(BOOK_1)], tags = [] } = {}) {
    return {
        household_members: memberHandler(),
        books: pagedHandler(books),
        book_tags: pagedHandler(tags)
    };
}

function makeService(fake, extra = {}) {
    let clock = 1_000_000;
    const service = new LibraryCatalogService({
        getClient: async () => fake.client,
        now: () => clock,
        ...extra
    });
    return { service, advance: (ms) => { clock += ms; } };
}

describe('LibraryCatalogService constants', () => {
    it('exposes the D1 timings', () => {
        expect(LIBRARY_TIMEOUT_MS).toBe(4000);
        expect(LIBRARY_WRITE_TIMEOUT_MS).toBe(8000);
        expect(CATALOG_TTL_MS).toBe(600000);
        expect(RETRY_AFTER_MS).toBe(60000);
    });

    it('LibraryUnavailableError carries a reason', () => {
        const err = new LibraryUnavailableError('timeout');
        expect(err).toBeInstanceOf(Error);
        expect(err.name).toBe('LibraryUnavailableError');
        expect(err.reason).toBe('timeout');
    });
});

describe('LibraryCatalogService.getCatalog', () => {
    let warnSpy;
    beforeEach(() => {
        warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    });
    afterEach(() => {
        warnSpy.mockRestore();
        jest.useRealTimers();
    });

    it('gives signed-out with zero from calls when there is no session', async () => {
        const fake = makeFakeClient({ session: null, handlers: readyHandlers() });
        const { service } = makeService(fake);
        const result = await service.getCatalog();
        expect(result.status).toBe('signed-out');
        expect(result.books).toEqual([]);
        expect(fake.from).not.toHaveBeenCalled();
    });

    it('gives signed-out when Supabase is not configured', async () => {
        const service = new LibraryCatalogService({ getClient: async () => null });
        const result = await service.getCatalog();
        expect(result.status).toBe('signed-out');
    });

    it('gives no-household when there is no membership row', async () => {
        const fake = makeFakeClient({ handlers: { ...readyHandlers(), household_members: memberHandler([]) } });
        const { service } = makeService(fake);
        const result = await service.getCatalog();
        expect(result.status).toBe('no-household');
        expect(result.userId).toBe(USER);
        expect(result.householdId).toBeNull();
        expect(fake.ofTable('books')).toHaveLength(0);
    });

    it('takes the earliest-joined household (created_at ascending, limit 1)', async () => {
        const fake = makeFakeClient({ handlers: readyHandlers() });
        const { service } = makeService(fake);
        await service.getCatalog();
        const [members] = fake.ofTable('household_members');
        expect(fake.client.schema).toHaveBeenCalledWith('library');
        expect(members.call('select')).toEqual(['select', 'household_id']);
        expect(members.call('eq')).toEqual(['eq', 'user_id', USER]);
        expect(members.call('order')).toEqual(['order', 'created_at', { ascending: true }]);
        expect(members.call('limit')).toEqual(['limit', 1]);
    });

    it('maps books and household tags to LibraryBook when ready', async () => {
        const books = [
            bookRow(BOOK_1, {
                title: 'The Salt Road',
                authors: ['Member A', 'Member B'],
                cover_url: 'https://example.test/cover.jpg',
                page_count: 412,
                series_name: 'Glass Orchard Cycle',
                series_volume: 2.5,
                copies: [
                    { edition_note: ' Hardcover ' },
                    { edition_note: 'Hardcover' },
                    { edition_note: '   ' },
                    { edition_note: null },
                    { edition_note: 'Signed' }
                ]
            }),
            bookRow(BOOK_2, { title: 'Glass Orchard', authors: null, copies: null })
        ];
        const tags = [
            { book_id: BOOK_1, tag_id: 'cozy' },
            { book_id: BOOK_1, tag_id: 'reread' },
            { book_id: BOOK_2, tag_id: 'cozy' }
        ];
        const fake = makeFakeClient({ handlers: readyHandlers({ books, tags }) });
        const { service } = makeService(fake);
        const result = await service.getCatalog();

        expect(result.status).toBe('ready');
        expect(result.userId).toBe(USER);
        expect(result.householdId).toBe(HOUSEHOLD);
        expect(result.tagsAvailable).toBe(true);
        expect(result.fetchedAt).toBe(1_000_000);
        expect(result.books).toEqual([
            {
                id: BOOK_1,
                title: 'The Salt Road',
                authors: ['Member A', 'Member B'],
                coverUrl: 'https://example.test/cover.jpg',
                pageCount: 412,
                seriesName: 'Glass Orchard Cycle',
                seriesVolume: 2.5,
                editionLabels: ['Hardcover', 'Signed'],
                tags: ['cozy', 'reread']
            },
            {
                id: BOOK_2,
                title: 'Glass Orchard',
                authors: [],
                coverUrl: null,
                pageCount: 320,
                seriesName: null,
                seriesVolume: null,
                editionLabels: [],
                tags: ['cozy']
            }
        ]);

        const [booksQuery] = fake.ofTable('books');
        expect(booksQuery.call('select')).toEqual(['select', BOOKS_SELECT]);
        expect(booksQuery.call('eq')).toEqual(['eq', 'household_id', HOUSEHOLD]);
        const [tagsQuery] = fake.ofTable('book_tags');
        expect(tagsQuery.call('select')).toEqual(['select', 'book_id, tag_id']);
        expect(tagsQuery.call('eq')).toEqual(['eq', 'household_id', HOUSEHOLD]);
        expect(service.peek()).toBe(result);
    });

    it('stays ready with tagsAvailable false when the tags query fails', async () => {
        const fake = makeFakeClient({
            handlers: { ...readyHandlers(), book_tags: () => ({ data: null, error: { code: '42P01', message: 'missing' } }) }
        });
        const { service } = makeService(fake);
        const result = await service.getCatalog();
        expect(result.status).toBe('ready');
        expect(result.tagsAvailable).toBe(false);
        expect(result.books).toHaveLength(1);
        expect(result.books[0].tags).toEqual([]);
    });

    describe('unreachable library', () => {
        it('times out at 4000 ms when books never resolves, and resolves rather than rejects', async () => {
            jest.useFakeTimers();
            const fake = makeFakeClient({ handlers: { ...readyHandlers(), books: () => new Promise(() => {}) } });
            const { service } = makeService(fake);
            let settled = null;
            service.getCatalog().then(r => { settled = r; }, e => { settled = { rejected: e }; });

            await jest.advanceTimersByTimeAsync(LIBRARY_TIMEOUT_MS - 1);
            expect(settled).toBeNull();
            await jest.advanceTimersByTimeAsync(1);
            expect(settled).toEqual(expect.objectContaining({ status: 'unavailable', reason: 'timeout', books: [] }));
        });

        it('bounds a getSession that never resolves', async () => {
            jest.useFakeTimers();
            const fake = makeFakeClient({ sessionPromise: new Promise(() => {}), handlers: readyHandlers() });
            const { service } = makeService(fake);
            const pending = service.getCatalog();
            await jest.advanceTimersByTimeAsync(LIBRARY_TIMEOUT_MS);
            await expect(pending).resolves.toEqual(expect.objectContaining({ status: 'unavailable', reason: 'timeout' }));
        });

        it('returns the cached unavailable for 60 s without a new request; force retries', async () => {
            jest.useFakeTimers();
            const fake = makeFakeClient({ handlers: { ...readyHandlers(), books: () => new Promise(() => {}) } });
            const { service, advance } = makeService(fake);
            const first = service.getCatalog();
            await jest.advanceTimersByTimeAsync(LIBRARY_TIMEOUT_MS);
            const firstResult = await first;
            expect(firstResult.status).toBe('unavailable');
            const fromCount = fake.from.mock.calls.length;
            const sessionCount = fake.client.auth.getSession.mock.calls.length;

            advance(RETRY_AFTER_MS - 1);
            const again = await service.getCatalog();
            expect(again).toBe(firstResult);
            expect(fake.from.mock.calls.length).toBe(fromCount);
            expect(fake.client.auth.getSession.mock.calls.length).toBe(sessionCount);

            const forced = service.getCatalog({ force: true });
            await jest.advanceTimersByTimeAsync(LIBRARY_TIMEOUT_MS);
            await forced;
            expect(fake.from.mock.calls.length).toBeGreaterThan(fromCount);
        });

        it('retries without force once 60 s have passed', async () => {
            const fake = makeFakeClient({ handlers: { ...readyHandlers(), books: () => ({ data: null, error: { message: 'TypeError: Failed to fetch' } }) } });
            const { service, advance } = makeService(fake);
            const first = await service.getCatalog();
            expect(first).toEqual(expect.objectContaining({ status: 'unavailable', reason: 'network' }));
            const count = fake.from.mock.calls.length;
            advance(RETRY_AFTER_MS);
            await service.getCatalog();
            expect(fake.from.mock.calls.length).toBeGreaterThan(count);
        });

        it('treats a rejected client load (CDN unreachable) as unavailable', async () => {
            const service = new LibraryCatalogService({ getClient: async () => { throw new TypeError('Failed to fetch'); } });
            const result = await service.getCatalog();
            expect(result.status).toBe('unavailable');
            expect(result.reason).toBe('network');
        });

        it('logs only an error code, never row data', async () => {
            const fake = makeFakeClient({ handlers: { ...readyHandlers(), books: () => ({ data: null, error: { code: 'PGRST301', message: 'The Salt Road' } }) } });
            const { service } = makeService(fake);
            await service.getCatalog();
            const logged = JSON.stringify(warnSpy.mock.calls);
            expect(logged).not.toContain('The Salt Road');
        });
    });

    it('gives no-household on 42501 from the books read and does not retry before 60 s', async () => {
        const fake = makeFakeClient({
            handlers: { ...readyHandlers(), books: () => ({ data: null, error: { code: '42501', message: 'permission denied' } }) }
        });
        const { service, advance } = makeService(fake);
        const result = await service.getCatalog();
        expect(result.status).toBe('no-household');
        expect(result.reason).toBe('denied');
        const count = fake.from.mock.calls.length;
        advance(RETRY_AFTER_MS - 1);
        await service.getCatalog();
        expect(fake.from.mock.calls.length).toBe(count);
        advance(1);
        await service.getCatalog();
        expect(fake.from.mock.calls.length).toBeGreaterThan(count);
    });

    it('serves a ready catalogue for 10 minutes, then reloads; subscribe fires once per load', async () => {
        const fake = makeFakeClient({ handlers: readyHandlers() });
        const { service, advance } = makeService(fake);
        const seen = [];
        const unsubscribe = service.subscribe(r => seen.push(r));

        const first = await service.getCatalog();
        const count = fake.from.mock.calls.length;
        advance(CATALOG_TTL_MS - 1);
        const second = await service.getCatalog();
        expect(second).toBe(first);
        expect(fake.from.mock.calls.length).toBe(count);
        expect(seen).toEqual([first]);

        advance(1);
        const third = await service.getCatalog();
        expect(fake.from.mock.calls.length).toBeGreaterThan(count);
        expect(seen).toEqual([first, third]);

        unsubscribe();
        await service.getCatalog({ force: true });
        expect(seen).toHaveLength(2);
    });

    it('shares one load between concurrent callers', async () => {
        const fake = makeFakeClient({ handlers: readyHandlers() });
        const { service } = makeService(fake);
        const [a, b] = await Promise.all([service.getCatalog(), service.getCatalog()]);
        expect(a).toBe(b);
        expect(fake.ofTable('household_members')).toHaveLength(1);
    });

    it('survives a subscriber that throws', async () => {
        const fake = makeFakeClient({ handlers: readyHandlers() });
        const { service } = makeService(fake);
        service.subscribe(() => { throw new Error('listener'); });
        await expect(service.getCatalog()).resolves.toEqual(expect.objectContaining({ status: 'ready' }));
    });

    it('peek is null before the first load', () => {
        const { service } = makeService(makeFakeClient());
        expect(service.peek()).toBeNull();
    });

    describe('paging (I7)', () => {
        const manyTags = Array.from({ length: 2500 }, (_, i) => ({
            book_id: i % 2 ? BOOK_2 : BOOK_1,
            tag_id: `tag-${String(i).padStart(4, '0')}`
        }));

        it('orders books by id and book_tags by book_id then tag_id, in pages of 1000', async () => {
            const fake = makeFakeClient({ handlers: readyHandlers() });
            const { service } = makeService(fake);
            await service.getCatalog();
            const [booksQuery] = fake.ofTable('books');
            expect(booksQuery.callsOf('order')).toEqual([['order', 'id']]);
            expect(booksQuery.call('range')).toEqual(['range', 0, 999]);
            const [tagsQuery] = fake.ofTable('book_tags');
            expect(tagsQuery.callsOf('order')).toEqual([['order', 'book_id'], ['order', 'tag_id']]);
            expect(tagsQuery.call('range')).toEqual(['range', 0, 999]);
        });

        it('reads 2,500 tag rows over three pages until an empty page', async () => {
            const fake = makeFakeClient({ handlers: readyHandlers({ books: [bookRow(BOOK_1), bookRow(BOOK_2)], tags: manyTags }) });
            const { service } = makeService(fake);
            const result = await service.getCatalog();
            const ranges = fake.ofTable('book_tags').map(q => q.call('range').slice(1));
            expect(ranges).toEqual([[0, 999], [1000, 1999], [2000, 2999], [2500, 3499]]);
            expect(result.tagsAvailable).toBe(true);
            expect(result.books[0].tags).toHaveLength(1250);
            expect(result.books[1].tags).toHaveLength(1250);
        });

        it('discards every tag when the second tag page fails', async () => {
            const fake = makeFakeClient({
                handlers: {
                    ...readyHandlers({ books: [bookRow(BOOK_1), bookRow(BOOK_2)] }),
                    book_tags: pagedHandler(manyTags, { failOnPage: 1 })
                }
            });
            const { service } = makeService(fake);
            const result = await service.getCatalog();
            expect(result.status).toBe('ready');
            expect(result.tagsAvailable).toBe(false);
            expect(result.books.every(b => b.tags.length === 0)).toBe(true);
        });

        it('reads every book page', async () => {
            const books = Array.from({ length: 1500 }, (_, i) => bookRow(`00000000-0000-4000-8000-${String(i).padStart(12, '0')}`));
            const fake = makeFakeClient({ handlers: readyHandlers({ books }) });
            const { service } = makeService(fake);
            const result = await service.getCatalog();
            expect(result.books).toHaveLength(1500);
        });
    });
});

describe('LibraryCatalogService writes', () => {
    let warnSpy;
    beforeEach(() => {
        warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    });
    afterEach(() => {
        warnSpy.mockRestore();
        jest.useRealTimers();
    });

    describe('fillSeries', () => {
        it('sends a conditional update and returns filled when a row comes back', async () => {
            const fake = makeFakeClient({ handlers: { books: () => ({ data: [{ id: BOOK_1 }], error: null }) } });
            const { service } = makeService(fake);
            await expect(service.fillSeries(BOOK_1, 'Glass Orchard Cycle')).resolves.toBe('filled');
            const [q] = fake.ofTable('books');
            expect(q.call('update')).toEqual(['update', { series_name: 'Glass Orchard Cycle' }]);
            expect(q.call('eq')).toEqual(['eq', 'id', BOOK_1]);
            expect(q.call('is')).toEqual(['is', 'series_name', null]);
            expect(q.call('select')).toEqual(['select', 'id']);
        });

        it('returns kept when no row comes back', async () => {
            const fake = makeFakeClient({ handlers: { books: () => ({ data: [], error: null }) } });
            const { service } = makeService(fake);
            await expect(service.fillSeries(BOOK_1, 'Saga')).resolves.toBe('kept');
        });

        it('trims the name and clips it to 200 characters', async () => {
            const fake = makeFakeClient({ handlers: { books: () => ({ data: [{ id: BOOK_1 }], error: null }) } });
            const { service } = makeService(fake);
            await service.fillSeries(BOOK_1, '  Saga  ');
            await service.fillSeries(BOOK_2, 'x'.repeat(250));
            await service.fillSeries(BOOK_2, `${'y'.repeat(199)} z`);
            const [trimmed, clipped, clippedAtSpace] = fake.ofTable('books');
            expect(trimmed.call('update')[1]).toEqual({ series_name: 'Saga' });
            expect(clipped.call('update')[1].series_name).toBe('x'.repeat(200));
            // Clipping never leaves trailing whitespace (the column check requires btrim).
            expect(clippedAtSpace.call('update')[1].series_name).toBe('y'.repeat(199));
        });

        it('makes no request for a blank name', async () => {
            const fake = makeFakeClient();
            const { service } = makeService(fake);
            await expect(service.fillSeries(BOOK_1, '   ')).resolves.toBe('kept');
            await expect(service.fillSeries(BOOK_1, null)).resolves.toBe('kept');
            expect(fake.from).not.toHaveBeenCalled();
        });

        it('treats a 23514 check violation as kept and never retries that book', async () => {
            const fake = makeFakeClient({ handlers: { books: () => ({ data: null, error: { code: '23514', message: 'check' } }) } });
            const { service } = makeService(fake);
            await expect(service.fillSeries(BOOK_1, 'Saga')).resolves.toBe('kept');
            await expect(service.fillSeries(BOOK_1, 'Saga')).resolves.toBe('kept');
            expect(fake.ofTable('books')).toHaveLength(1);
        });

        it('throws LibraryUnavailableError on other errors', async () => {
            const fake = makeFakeClient({ handlers: { books: () => ({ data: null, error: { code: '42501', message: 'denied' } }) } });
            const { service } = makeService(fake);
            await expect(service.fillSeries(BOOK_1, 'Saga')).rejects.toEqual(expect.objectContaining({ name: 'LibraryUnavailableError', reason: 'denied' }));
        });

        it('makes the catalogue stale after a fill', async () => {
            const fake = makeFakeClient({ handlers: { ...readyHandlers(), books: (b) => (b.call('update') ? { data: [{ id: BOOK_1 }], error: null } : pagedHandler([bookRow(BOOK_1)])(b)) } });
            const { service } = makeService(fake);
            await service.getCatalog();
            const count = fake.ofTable('household_members').length;
            await service.fillSeries(BOOK_1, 'Saga');
            await service.getCatalog();
            expect(fake.ofTable('household_members').length).toBe(count + 1);
        });
    });

    describe('tags', () => {
        it('addTags upserts rows ignoring duplicates', async () => {
            const fake = makeFakeClient({ handlers: { book_tags: () => ({ data: null, error: null }) } });
            const { service } = makeService(fake);
            await service.addTags(BOOK_1, HOUSEHOLD, ['cozy', 'reread', 'cozy']);
            const [q] = fake.ofTable('book_tags');
            expect(q.call('upsert')).toEqual([
                'upsert',
                [
                    { book_id: BOOK_1, household_id: HOUSEHOLD, tag_id: 'cozy' },
                    { book_id: BOOK_1, household_id: HOUSEHOLD, tag_id: 'reread' }
                ],
                { onConflict: 'book_id,tag_id', ignoreDuplicates: true }
            ]);
        });

        it('addTags and removeTags make no request for an empty list', async () => {
            const fake = makeFakeClient();
            const { service } = makeService(fake);
            await service.addTags(BOOK_1, HOUSEHOLD, []);
            await service.removeTags(BOOK_1, []);
            expect(fake.from).not.toHaveBeenCalled();
        });

        it('removeTags deletes the given tags of one book', async () => {
            const fake = makeFakeClient({ handlers: { book_tags: () => ({ data: null, error: null }) } });
            const { service } = makeService(fake);
            await service.removeTags(BOOK_1, ['cozy']);
            const [q] = fake.ofTable('book_tags');
            expect(q.call('delete')).toEqual(['delete']);
            expect(q.call('eq')).toEqual(['eq', 'book_id', BOOK_1]);
            expect(q.call('in')).toEqual(['in', 'tag_id', ['cozy']]);
        });

        it('readBookTags returns the tag ids of one book', async () => {
            const fake = makeFakeClient({ handlers: { book_tags: () => ({ data: [{ tag_id: 'cozy' }, { tag_id: 'reread' }], error: null }) } });
            const { service } = makeService(fake);
            await expect(service.readBookTags(BOOK_1)).resolves.toEqual(['cozy', 'reread']);
            const [q] = fake.ofTable('book_tags');
            expect(q.call('eq')).toEqual(['eq', 'book_id', BOOK_1]);
        });

        it('readBookTags throws LibraryUnavailableError on an error', async () => {
            const fake = makeFakeClient({ handlers: { book_tags: () => ({ data: null, error: { message: 'NetworkError when attempting to fetch resource.' } }) } });
            const { service } = makeService(fake);
            await expect(service.readBookTags(BOOK_1)).rejects.toEqual(expect.objectContaining({ reason: 'network' }));
        });

        it('a write that hangs throws LibraryUnavailableError(timeout) at 8000 ms', async () => {
            jest.useFakeTimers();
            const fake = makeFakeClient({ handlers: { book_tags: () => new Promise(() => {}) } });
            const { service } = makeService(fake);
            let outcome = null;
            service.addTags(BOOK_1, HOUSEHOLD, ['cozy']).then(() => { outcome = 'resolved'; }, (e) => { outcome = e; });
            await jest.advanceTimersByTimeAsync(LIBRARY_WRITE_TIMEOUT_MS - 1);
            expect(outcome).toBeNull();
            await jest.advanceTimersByTimeAsync(1);
            expect(outcome).toBeInstanceOf(LibraryUnavailableError);
            expect(outcome.reason).toBe('timeout');
        });

        it('a write with no client throws LibraryUnavailableError', async () => {
            const service = new LibraryCatalogService({ getClient: async () => null });
            await expect(service.removeTags(BOOK_1, ['cozy'])).rejects.toBeInstanceOf(LibraryUnavailableError);
        });
    });
});
