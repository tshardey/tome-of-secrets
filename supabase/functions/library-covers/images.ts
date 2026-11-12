// Downloads candidate cover images for screening (D5). Only https URLs on the
// allowlisted cover hosts are ever fetched, and every redirect hop is checked
// against the same allowlist before it is followed. Each image is capped in
// time and size and typed from its magic bytes; anything else is dropped.
//
// Nothing here logs: a dropped image is simply left out.

export const MAX_IMAGES = 6;
export const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
export const MAX_REDIRECTS = 3;

const IMAGE_TIMEOUT_MS = 10_000;
const CONCURRENCY = 3;

const EXACT_HOSTS = new Set(["covers.openlibrary.org", "archive.org", "books.google.com", "books.googleusercontent.com"]);

/** https only, the default port only, no user info, on an allowlisted host (or any *.archive.org). */
export function hostAllowed(url: string): boolean {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return false;
  }
  if (u.protocol !== "https:" || u.port !== "" || u.username !== "" || u.password !== "") return false;
  const host = u.hostname.toLowerCase();
  return EXACT_HOSTS.has(host) || host.endsWith(".archive.org");
}

export type FetchedImage = {
  index: number;
  mediaType: "image/jpeg" | "image/png" | "image/gif" | "image/webp";
  bytes: Uint8Array;
};

const startsWith = (bytes: Uint8Array, sig: number[], offset = 0) =>
  bytes.length >= offset + sig.length && sig.every((b, i) => bytes[offset + i] === b);

export function sniffType(bytes: Uint8Array): FetchedImage["mediaType"] | null {
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return "image/jpeg";
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "image/png";
  if (startsWith(bytes, [0x47, 0x49, 0x46, 0x38]) && (bytes[4] === 0x37 || bytes[4] === 0x39) && bytes[5] === 0x61) {
    return "image/gif";
  }
  if (startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) && startsWith(bytes, [0x57, 0x45, 0x42, 0x50], 8)) return "image/webp";
  return null;
}

const isRedirect = (status: number) => status === 301 || status === 302 || status === 303 || status === 307 || status === 308;

function discard(res: Response) {
  res.body?.cancel().catch(() => {});
}

/** Reads at most MAX_IMAGE_BYTES; null as soon as the body goes past the cap. */
async function readCapped(res: Response): Promise<Uint8Array | null> {
  const declared = Number(res.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > MAX_IMAGE_BYTES) {
    discard(res);
    return null;
  }
  if (!res.body) return new Uint8Array(0);
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_IMAGE_BYTES) {
        reader.cancel().catch(() => {});
        return null;
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const out = new Uint8Array(total);
  let at = 0;
  for (const c of chunks) {
    out.set(c, at);
    at += c.byteLength;
  }
  return out;
}

async function download(url: string, fetchImpl: typeof fetch, signal: AbortSignal): Promise<Uint8Array | null> {
  let current = url;
  for (let hop = 0; ; hop++) {
    // Every hop, the first included, is checked before anything is sent to it.
    if (signal.aborted || !hostAllowed(current)) return null;
    const res = await fetchImpl(current, { redirect: "manual", signal });
    if (signal.aborted) {
      discard(res);
      return null;
    }
    if (isRedirect(res.status)) {
      discard(res);
      const location = res.headers.get("location");
      if (!location || hop >= MAX_REDIRECTS) return null;
      try {
        current = new URL(location, current).href;
      } catch {
        return null;
      }
      continue;
    }
    if (!res.ok) {
      discard(res);
      return null;
    }
    return await readCapped(res);
  }
}

async function fetchOne(url: string, index: number, fetchImpl: typeof fetch): Promise<FetchedImage | null> {
  const ctrl = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<null>((resolve) => {
    timer = setTimeout(() => {
      ctrl.abort();
      resolve(null);
    }, IMAGE_TIMEOUT_MS);
  });
  try {
    const bytes = await Promise.race([download(url, fetchImpl, ctrl.signal), timeout]);
    if (!bytes) return null;
    const mediaType = sniffType(bytes);
    return mediaType ? { index, mediaType, bytes } : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Downloads each URL (3 at a time). Failures are dropped; each image keeps
 * `index`, its position in `urls`. The result is in `urls` order.
 */
export async function fetchImages(urls: string[], fetchImpl: typeof fetch): Promise<FetchedImage[]> {
  const out: (FetchedImage | null)[] = new Array(urls.length).fill(null);
  let next = 0;
  const worker = async () => {
    while (next < urls.length) {
      const i = next++;
      out[i] = await fetchOne(urls[i], i, fetchImpl);
    }
  };
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, urls.length) }, worker));
  return out.filter((img): img is FetchedImage => img !== null);
}
