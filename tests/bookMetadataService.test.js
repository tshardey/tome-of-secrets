/**
 * @jest-environment jsdom
 */
import { searchBooks } from '../assets/js/services/BookMetadataService.js';

describe('BookMetadataService.searchBooks', () => {
  beforeEach(() => {
    global.fetch = jest.fn();
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
});
