// The Tome of Secrets tags the tagger may apply (Plan 7 D7), derived from the
// published bookTags.json rather than hard-coded.

export interface TosTagDef {
  id: string;
  label: string;
  category: string;
  scope?: string;
  derivedFromType?: string;
}

/**
 * Tags that describe a copy, not the book (Plan 6 tracks Deluxe on copies);
 * the spec's anti-goal is edition text turning into tags.
 */
export const EXCLUDED_TOS_TAGS: readonly string[] = ["special-edition"];

const CATEGORIES = new Set(["genre", "content", "form"]);
/** A book fact that ToS files under provenance. */
const EXTRA_ALLOWED = new Set(["award-winning"]);

/** genre, content and form tags without a scope or derivedFromType, plus award-winning, minus the excluded. */
export function allowedTosTags(list: TosTagDef[]): string[] {
  return list
    .filter((t) =>
      !EXCLUDED_TOS_TAGS.includes(t.id) &&
      !t.scope &&
      !t.derivedFromType &&
      (CATEGORIES.has(t.category) || EXTRA_ALLOWED.has(t.id))
    )
    .map((t) => t.id);
}

const TIMEOUT_MS = 5000;
const CACHE_MS = 60 * 60 * 1000;

const cache = new Map<string, { at: number; list: TosTagDef[] }>();

function isDef(v: unknown): v is TosTagDef {
  if (!v || typeof v !== "object") return false;
  const t = v as Record<string, unknown>;
  return typeof t.id === "string" && typeof t.category === "string" && typeof t.label === "string";
}

/**
 * Fetches the published list with a 5 s timeout and caches it per isolate for
 * an hour. Rejects on a timeout, a bad status or a wrong shape; a failure is
 * never cached. The caller releases the job as retry_later at cost 0.
 */
export async function loadTosTagList(
  url: string,
  fetchImpl: typeof fetch,
  opts: { timeoutMs?: number; now?: () => number } = {},
): Promise<TosTagDef[]> {
  const now = opts.now ?? Date.now;
  const hit = cache.get(url);
  if (hit && now() - hit.at < CACHE_MS) return hit.list;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? TIMEOUT_MS);
  try {
    const res = await fetchImpl(url, { signal: controller.signal });
    if (!res.ok) throw new Error(`tos_tags_status_${res.status}`);
    const body: unknown = await res.json();
    if (!Array.isArray(body) || !body.every(isDef)) throw new Error("tos_tags_shape");
    cache.set(url, { at: now(), list: body });
    return body;
  } finally {
    clearTimeout(timer);
  }
}
