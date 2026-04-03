/**
 * @jest-environment jsdom
 */
import { searchBooks } from '../assets/js/services/BookMetadataService.js';

/** Must match OPENLIBRARY_SEARCH_TIMEOUT_MS in BookMetadataService.js */
const OL_TIMEOUT_MS = 7500;

describe('BookMetadataService.searchBooks', () => {
  beforeEach(() => {
    global.fetch = jest.fn();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('does not call Google Books when OpenLibrary returns results', async () => {
    global.fetch.mockImplementation((url) => {
      const u = String(url);
      if (u.includes('openlibrary.org')) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              docs: [
                {
                  title: 'Test Book',
                  author_name: ['Author One'],
                  cover_i: 123,
                  number_of_pages_median: 200,
                },
              ],
            }),
        });
      }
      return Promise.reject(new Error(`unexpected fetch: ${u}`));
    });

    const results = await searchBooks('Test Book', undefined, undefined);
    expect(results.length).toBeGreaterThan(0);
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(String(global.fetch.mock.calls[0][0])).toContain('openlibrary.org');
  });

  it('calls Google Books when OpenLibrary returns no docs', async () => {
    global.fetch.mockImplementation((url) => {
      const u = String(url);
      if (u.includes('openlibrary.org')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ docs: [] }),
        });
      }
      if (u.includes('googleapis.com')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ items: [] }),
        });
      }
      return Promise.reject(new Error(`unexpected fetch: ${u}`));
    });

    await searchBooks('obscurexyz', undefined, undefined);
    const urls = global.fetch.mock.calls.map((c) => String(c[0]));
    expect(urls.some((x) => x.includes('openlibrary.org'))).toBe(true);
    expect(urls.some((x) => x.includes('googleapis.com'))).toBe(true);
  });

  it('gives up on slow OpenLibrary after a timeout and still queries Google Books', async () => {
    jest.useFakeTimers({ advanceTimers: true });

    global.fetch.mockImplementation((url, options) => {
      const u = String(url);
      if (u.includes('openlibrary.org')) {
        return new Promise((resolve, reject) => {
          const sig = options && options.signal;
          if (sig) {
            sig.addEventListener(
              'abort',
              () => reject(new DOMException('Aborted', 'AbortError')),
              { once: true }
            );
          }
        });
      }
      if (u.includes('googleapis.com')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ items: [] }),
        });
      }
      return Promise.reject(new Error(`unexpected fetch: ${u}`));
    });

    const p = searchBooks('stuck OL', undefined, undefined);
    await jest.advanceTimersByTimeAsync(OL_TIMEOUT_MS + 200);
    await p;

    const urls = global.fetch.mock.calls.map((c) => String(c[0]));
    expect(urls.some((x) => x.includes('openlibrary.org'))).toBe(true);
    expect(urls.some((x) => x.includes('googleapis.com'))).toBe(true);
  });

  it('rejects when the search signal is aborted during OpenLibrary', async () => {
    const ac = new AbortController();
    global.fetch.mockImplementation((url, options) => {
      if (!String(url).includes('openlibrary.org')) {
        return Promise.reject(new Error(`unexpected fetch: ${url}`));
      }
      return new Promise((resolve, reject) => {
        const sig = options && options.signal;
        if (sig) {
          sig.addEventListener(
            'abort',
            () => reject(new DOMException('Aborted', 'AbortError')),
            { once: true }
          );
        }
      });
    });

    const p = searchBooks('yz', undefined, ac.signal);
    queueMicrotask(() => ac.abort());

    await expect(p).rejects.toMatchObject({ name: 'AbortError' });
  });
});
