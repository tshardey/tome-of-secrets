// Open Library series lookup by ISBN (Plan 11 D6). Free, no key, and only the
// ISBN leaves the server. Any failure means "no data": this never throws and
// logs an error name only, never an ISBN, URL or series name.
import { clip } from "../_shared/library-ai.ts";
import { OPEN_LIBRARY_SERIES_CAP } from "./series.ts";

export const OPEN_LIBRARY_TIMEOUT_MS = 2500;
const MAX_ISBNS = 4;
const NAME_MAX = 200;

export function validIsbn(s: string): boolean {
  return /^(?:\d{13}|\d{9}[\dX])$/.test(s);
}

const flat = (s: string) => s.replace(/\s+/g, " ").trim();

/**
 * The series strings of the first edition (by ISBN, in order) that lists any.
 * The lookup shares one timeout across all ISBNs; `signal` is injectable for tests.
 */
export async function openLibrarySeries(
  isbns: string[],
  fetchImpl: typeof fetch,
  signal: AbortSignal = AbortSignal.timeout(OPEN_LIBRARY_TIMEOUT_MS),
): Promise<string[]> {
  try {
    for (const isbn of isbns.filter(validIsbn).slice(0, MAX_ISBNS)) {
      if (signal.aborted) break;
      const res = await fetchImpl(`https://openlibrary.org/isbn/${isbn}.json`, {
        headers: { "User-Agent": "tos-library-tagger", Accept: "application/json" },
        signal,
      });
      if (res.status !== 200) {
        await res.body?.cancel();
        continue;
      }
      const body: unknown = await res.json();
      const series = body && typeof body === "object" ? (body as { series?: unknown }).series : undefined;
      if (!Array.isArray(series) || series.length === 0 || !series.every((s) => typeof s === "string")) continue;
      const names = (series as string[]).map(flat).filter((n) => n !== "")
        .slice(0, OPEN_LIBRARY_SERIES_CAP).map((n) => clip(n, NAME_MAX));
      if (names.length) return names;
    }
  } catch (e) {
    console.error("open library lookup failed", e instanceof Error ? e.name : "unknown");
  }
  return [];
}
